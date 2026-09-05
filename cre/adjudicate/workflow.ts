/**
 * Recourse adjudicator.
 *
 * Runs inside an AWS Nitro enclave, decides one disputed x402 payment, and writes
 * the verdict to the relay on Ethereum Sepolia. Only `(paymentId, outcome,
 * reasonCode)` leaves the enclave; the disputed payload never does.
 *
 * Two shapes here are forced by platform constraints rather than preference:
 *
 *   1. The trigger is HTTP, not an on-chain event. CRE cannot watch Hedera — it is
 *      absent from every chain a tenant can target — so nothing can subscribe to
 *      `DisputeOpened`. Anyone may fire the trigger; that is safe because the
 *      handler re-derives every fact it acts on from chain state and from the
 *      seller's own signature, and treats the request body purely as a pointer.
 *
 *   2. Escrow state is read over JSON-RPC rather than through the EVM capability,
 *      for the same reason. The call is pinned to the block named in the request,
 *      so two runs of the same dispute read exactly the same bytes.
 */

import {
	bytesToHex,
	cre,
	getNetwork,
	hexToBase64,
	ok,
	prepareReportRequest,
	text,
	TxStatus,
	type TeeRuntime,
} from '@chainlink/cre-sdk'
import { adjudicateDispute, type EvidenceBundle, type SlaDocument } from '@recourse/sla'
import {
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	parseAbiParameters,
	stringToHex,
	type Address,
	type Hex,
} from 'viem'
import { z } from 'zod'

import { Outcome, toOnChain } from './verdict'

// ─── Config ─────────────────────────────────────────────────────────

export const configSchema = z.object({
	/** How often to sweep the queue for disputes awaiting a verdict. */
	schedule: z.string(),
	/**
	 * Index of open disputes, each entry pointing at its evidence.
	 *
	 * A queue rather than a push because the trigger has to be cron: CRE cannot
	 * watch Hedera for `DisputeOpened`, and the `http-trigger` capability is still
	 * alpha and fails to subscribe in the simulator. Nothing in the queue is
	 * trusted — it only says which payment to look at.
	 */
	disputeQueueUrl: z.string(),
	/** JSON-RPC endpoint for the chain the escrow lives on (Hedera testnet). */
	escrowRpcUrl: z.string(),
	/** RecourseEscrow address. */
	escrowAddress: z.string(),
	/** VerdictRelay on Sepolia — where the signed report lands. */
	relayAddress: z.string(),
	/** CRE chain-selector name for the relay's chain. */
	relayChainName: z.string(),
	/** Gas allowance for the relay's `onReport`, which pays a CCIP fee inside it. */
	relayGasLimit: z.string(),
})
type Config = z.infer<typeof configSchema>

// ─── Trigger input ──────────────────────────────────────────────────

/**
 * One queue entry: pointers only. Nothing here is trusted — the payment is
 * re-read from chain and the evidence is checked against the seller's signature
 * before any of it is judged.
 */
// Not `z.string().url()`: that validator calls the `URL` constructor, which the
// WASM runtime does not provide, so every URL fails validation inside the enclave.
// A scheme check is all this needs — the request either resolves or it does not,
// and a bad host surfaces as a fetch failure rather than a silent wrong answer.
const httpUrl = z.string().regex(/^https?:\/\/[^\s]+$/, 'must be an http(s) URL')

const disputeSchema = z.object({
	paymentId: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
	/** Block at which to read escrow state. Pinning it keeps the read reproducible. */
	blockNumber: z.number().int().nonnegative(),
	/** Returns `{ body, contentType, latencyMs }` — what the seller actually sent. */
	evidenceUrl: httpUrl,
	/** Returns the SLA document whose hash the payment was bound to. */
	slaUrl: httpUrl,
})

const queueSchema = z.array(disputeSchema)

// ─── Escrow ABI (only what we read) ─────────────────────────────────

const ESCROW_ABI = [
	{
		type: 'function',
		name: 'getPayment',
		stateMutability: 'view',
		inputs: [{ name: 'paymentId', type: 'bytes32' }],
		outputs: [
			{
				type: 'tuple',
				components: [
					{ name: 'buyer', type: 'address' },
					{ name: 'seller', type: 'address' },
					{ name: 'amount', type: 'uint256' },
					{ name: 'bond', type: 'uint256' },
					{ name: 'slaHash', type: 'bytes32' },
					{ name: 'responseHash', type: 'bytes32' },
					{ name: 'deadline', type: 'uint64' },
					{ name: 'wasChallenged', type: 'bool' },
					{ name: 'state', type: 'uint8' },
				],
			},
		],
	},
] as const

/** `RecourseEscrow.State.Disputed`. Anything else is not ours to rule on. */
const STATE_DISPUTED = 2

// ─── Helpers ────────────────────────────────────────────────────────

/** GET a URL from inside the enclave. Request and response stay confidential. */
function fetchConfidential(runtime: TeeRuntime<Config>, url: string, what: string): string {
	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, { url, method: 'GET' })
		.result()
	if (!ok(response)) {
		throw new Error(`fetching ${what} failed with status ${response.statusCode}`)
	}
	return text(response)
}

/**
 * Read the payment from the escrow chain by `eth_call`, pinned to a block.
 *
 * A plain JSON-RPC POST rather than the EVM capability, because the escrow is on
 * Hedera and CRE has no client for it.
 */
function readPayment(runtime: TeeRuntime<Config>, paymentId: Hex, blockNumber: number) {
	const config = runtime.config

	const callData = encodeFunctionData({
		abi: ESCROW_ABI,
		functionName: 'getPayment',
		args: [paymentId],
	})

	const rpcBody = JSON.stringify({
		jsonrpc: '2.0',
		id: 1,
		method: 'eth_call',
		params: [{ to: config.escrowAddress, data: callData }, `0x${blockNumber.toString(16)}`],
	})

	const response = new cre.capabilities.HTTPClient()
		.sendRequest(runtime, {
			url: config.escrowRpcUrl,
			method: 'POST',
			body: hexToBase64(stringToHex(rpcBody)),
			multiHeaders: { 'Content-Type': { values: ['application/json'] } },
		})
		.result()

	if (!ok(response)) {
		throw new Error(`escrow eth_call failed with status ${response.statusCode}`)
	}

	const rpc = JSON.parse(text(response)) as { result?: Hex; error?: { message: string } }
	if (rpc.error !== undefined) throw new Error(`escrow eth_call error: ${rpc.error.message}`)
	if (rpc.result === undefined) throw new Error('escrow eth_call returned no result')

	return decodeFunctionResult({
		abi: ESCROW_ABI,
		functionName: 'getPayment',
		data: rpc.result,
	})
}

// ─── TEE handler ────────────────────────────────────────────────────

export const onSweep = (runtime: TeeRuntime<Config>): string => {
	const queue = queueSchema.parse(
		JSON.parse(fetchConfidential(runtime, runtime.config.disputeQueueUrl, 'dispute queue')),
	)

	const request = queue[0]
	if (request === undefined) return 'no disputes awaiting a verdict'

	const paymentId = request.paymentId as Hex

	// ── What the chain says was agreed ──
	const payment = readPayment(runtime, paymentId, request.blockNumber)

	if (payment.state !== STATE_DISPUTED) {
		throw new Error(`payment ${paymentId} is not disputed (state ${payment.state})`)
	}

	// ── What was actually delivered ──
	const evidenceRaw = JSON.parse(fetchConfidential(runtime, request.evidenceUrl, 'evidence')) as {
		body: string
		contentType: string
		latencyMs: number
	}
	const sla = JSON.parse(fetchConfidential(runtime, request.slaUrl, 'SLA')) as SlaDocument

	const evidence: EvidenceBundle = {
		body: evidenceRaw.body,
		contentType: evidenceRaw.contentType,
		latencyMs: evidenceRaw.latencyMs,
		// The dispute's own deadline, not a clock read. `Date.now()` here would make
		// the verdict non-deterministic and break consensus on the attestation.
		evaluatedAt: Number(payment.deadline),
	}

	// ── Decide ──
	// Checks the SLA against the hash committed by `bind`, and the body against the
	// hash the seller signed, before judging anything on merit.
	const judgement = adjudicateDispute({
		sla,
		evidence,
		signedResponseHash: payment.responseHash,
		committedSlaHash: payment.slaHash,
	})

	const verdict = toOnChain(judgement)

	// Simulation only. Logs do not leave a real enclave, and this one names the
	// failing clause — drop it before relying on confidentiality in production.
	runtime.log(
		`verdict=${verdict.outcome === Outcome.Approve ? 'APPROVE' : 'REJECT'} reason=${verdict.reasonCode}`,
	)

	// ── Cross back and publish ──
	// Everything above ran in the enclave. Only these three values cross the
	// boundary; the payload, the SLA and the failure detail stay inside.
	const donRuntime = runtime.usingTheDons()

	const reportPayload = encodeAbiParameters(
		parseAbiParameters('bytes32 paymentId, uint8 outcome, uint16 reasonCode'),
		[paymentId, verdict.outcome, verdict.reasonCode],
	)

	const report = donRuntime.report(prepareReportRequest(reportPayload)).result()

	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: runtime.config.relayChainName,
		isTestnet: true,
	})
	if (!network) throw new Error(`unknown chain: ${runtime.config.relayChainName}`)

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const writeResult = evmClient
		.writeReport(donRuntime, {
			receiver: runtime.config.relayAddress as Address,
			report,
			gasConfig: { gasLimit: runtime.config.relayGasLimit },
		})
		.result()

	if (writeResult.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`relay write failed: ${writeResult.errorMessage || writeResult.txStatus}`)
	}

	const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
	return `${verdict.outcome === Outcome.Approve ? 'APPROVE' : 'REJECT'} reason=${verdict.reasonCode} tx=${txHash}`
}

// ─── Workflow ───────────────────────────────────────────────────────

export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()

	return [
		cre.handlerInTee(cronTrigger.trigger({ schedule: config.schedule }), onSweep, [
			{ tee: 'nitro', regions: ['us-west-2'] },
		]),
	]
}
