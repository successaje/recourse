/**
 * Buyer agent.
 *
 * Runs the whole loop an autonomous consumer of a paid API would:
 *
 *   1. Ask for the resource, get a `402` naming a price and an SLA hash.
 *   2. Fetch the SLA and check it hashes to what the seller quoted. Refuse to pay
 *      for terms that do not match their own advertised hash.
 *   3. Settle through the facilitator, into the escrow rather than to the seller.
 *   4. Bind the deposit on-chain to those exact terms.
 *   5. Retry, and receive the response along with the seller's signed receipt.
 *   6. Check the response against the SLA — the same deterministic code the
 *      enclave will run — and dispute if it fails.
 *
 * Step 6 is the point of the whole thing. A human notices a bad response and
 * stops paying. An agent making thousands of calls an hour cannot, so the check
 * has to be mechanical and the refund path has to exist.
 */

import { adjudicate, canonicalHash, Verdict, type SlaDocument } from '@recourse/sla';
import { ExactHederaScheme, createClientHederaSigner, PrivateKey } from '@x402/hedera';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { config, X402_VERSION } from './lib/config.js';
import { bind, dispute, PaymentState, readPayment, requiredBond } from './lib/escrow.js';
import { settle } from './lib/x402.js';

interface QuoteOffer {
  x402Version: number;
  accepts: Array<{ scheme: string; network: string; amount: string; payTo: string; asset: string }>;
  recourse: { paymentId: Hex; slaHash: Hex; slaUrl: string; escrow: string };
}

export interface BuyOptions {
  sellerUrl: string;
  buyerKey: Hex;
  hederaAccountId: string;
  /** Ask the seller to break a specific clause. Demo only. */
  misbehave?: string;
  /** Dispute window to bind, in seconds. */
  windowSeconds?: bigint;
  /** Where to register a dispute so the adjudicator sweeps it up. */
  indexUrl?: string;
}

function log(step: string, detail: string) {
  console.log(`  ${step.padEnd(22)} ${detail}`);
}

export async function buy(options: BuyOptions) {
  const { sellerUrl, buyerKey, hederaAccountId } = options;
  const windowSeconds = options.windowSeconds ?? 300n;
  const buyerAddress = privateKeyToAccount(buyerKey).address;

  const url = new URL(`${sellerUrl}/quote`);
  url.searchParams.set('pair', 'HBAR-USD');
  if (options.misbehave) url.searchParams.set('misbehave', options.misbehave);

  // ── 1. Get the price and the terms ──
  const offerResponse = await fetch(url);
  if (offerResponse.status !== 402) {
    throw new Error(`expected 402, got ${offerResponse.status}`);
  }
  const offer = (await offerResponse.json()) as QuoteOffer;
  const requirements = offer.accepts[0];
  if (!requirements) throw new Error('402 carried no payment requirements');

  const { paymentId, slaHash } = offer.recourse;
  log('402 received', `${requirements.amount} tinybar → ${requirements.payTo}`);
  log('payment id', paymentId);

  // ── 2. Verify the SLA matches its advertised hash ──
  const sla = (await (await fetch(offer.recourse.slaUrl)).json()).sla as SlaDocument;
  const computed = canonicalHash(sla);
  if (computed.toLowerCase() !== slaHash.toLowerCase()) {
    throw new Error(`SLA hash mismatch: seller quoted ${slaHash}, document hashes to ${computed}`);
  }
  log('sla verified', `${computed} (${sla.response.assertions.length} clauses)`);

  // ── 3. Settle into the escrow ──
  const signer = createClientHederaSigner(
    hederaAccountId,
    PrivateKey.fromStringECDSA(buyerKey),
    { network: 'hedera:testnet' },
  );
  const scheme = new ExactHederaScheme(signer);
  const result = await scheme.createPaymentPayload(X402_VERSION, requirements as never);

  // The scheme returns only its own slice. The facilitator wants the full v2
  // envelope: version, the requirements being accepted, and the scheme payload.
  const paymentPayload = {
    x402Version: X402_VERSION,
    accepted: requirements,
    payload: (result as { payload: Record<string, unknown> }).payload,
  };

  const settled = await settle(paymentPayload, requirements as never);
  if (!settled.ok) {
    throw new Error(`settlement failed: ${JSON.stringify(settled.body)}`);
  }
  log('settled', JSON.stringify(settled.body).slice(0, 90));

  // ── 4. Bind the deposit to the terms ──
  const amount = BigInt(requirements.amount);

  // The facilitator returns once consensus is reached, but the JSON-RPC relay
  // the escrow is read through lags behind it. Binding immediately reverts with
  // InsufficientUnbound against a balance that is already there in consensus and
  // simply not visible yet, so wait for the relay to catch up.
  await waitForUnbound(amount);
  const bindTx = await bind(buyerKey, {
    paymentId,
    seller: (await sellerIdentity(sellerUrl)) as Address,
    amount,
    slaHash,
    window: windowSeconds,
  });
  log('bound', bindTx);

  // Same relay lag as above, now on the seller's side: it refuses to serve until
  // it can see its own terms committed, so give the read path time to catch up
  // rather than handing it a 402 it is right to return.
  await waitForState(paymentId, PaymentState.Funded);

  // ── 5. Collect the response and its receipt ──
  const paid = await fetch(url, {
    headers: {
      'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64'),
      'X-PAYMENT-ID': paymentId,
    },
  });
  if (!paid.ok) {
    throw new Error(`seller refused to serve: ${paid.status} ${await paid.text()}`);
  }

  const body = await paid.text();
  const responseHash = paid.headers.get('X-Recourse-Response-Hash') as Hex | null;
  const sellerSig = paid.headers.get('X-Recourse-Receipt') as Hex | null;
  const latencyMs = Number(paid.headers.get('X-Recourse-Latency-Ms') ?? '0');
  const contentType = paid.headers.get('Content-Type') ?? 'application/json';

  log('response', body.slice(0, 90));

  // A seller that withholds the receipt has made the response undisputable. The
  // escrow's answer to that is `challengeReceipt`, not a shrug.
  if (!responseHash || !sellerSig) {
    log('no receipt', 'seller withheld its signature — challenge the receipt');
    return { paymentId, verdict: 'NO_RECEIPT' as const, body };
  }

  // ── 6. Judge it, with the same code the enclave runs ──
  const payment = await readPayment(paymentId);
  const judgement = adjudicate(sla, {
    body,
    contentType,
    latencyMs,
    // The enclave will use the dispute deadline. Before a dispute exists the
    // buyer has to pick something; the bound deadline is the closest analogue
    // and keeps the local verdict aligned with the one that will be attested.
    evaluatedAt: Number(payment.deadline),
  });

  if (judgement.verdict === Verdict.APPROVE) {
    log('accepted', `all ${sla.response.assertions.length} clauses held`);
    return { paymentId, verdict: 'APPROVE' as const, body };
  }

  log('violation', `${judgement.detail} (reason ${judgement.reasonCode})`);

  // ── 7. Dispute ──
  const bond = await requiredBond(amount);
  const disputeTx = await dispute(buyerKey, { paymentId, responseHash, sellerSig, bond });

  // Wait for the receipt and take the block from it. The adjudicator pins its
  // read to this number, so anything earlier — including "current block" right
  // after submitting — reads the payment as still Funded and the enclave
  // correctly refuses to rule on it.
  const { publicClient } = await import('./lib/escrow.js');
  const receipt = await publicClient.waitForTransactionReceipt({ hash: disputeTx });
  const disputeBlock = Number(receipt.blockNumber);
  log('disputed', `${disputeTx} (bond ${bond}, block ${disputeBlock})`);

  if (options.indexUrl) {
    const registered = await fetch(`${options.indexUrl}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId,
        blockNumber: disputeBlock,
        body,
        contentType,
        latencyMs,
        sla,
      }),
    });
    log('queued', `${registered.status} — awaiting the adjudicator`);
  }

  return { paymentId, verdict: 'REJECT' as const, reasonCode: judgement.reasonCode, body };
}

/**
 * Wait until the escrow can see the settled funds.
 *
 * Note the units: on Hedera, Solidity's `address(this).balance` is denominated in
 * tinybars while `eth_getBalance` over JSON-RPC reports weibars (10^10 more). The
 * escrow compares against its own `balance`, so the amount bound here is in
 * tinybars — the same unit the x402 requirements quote.
 */
/** Poll until the escrow reports the expected state for a payment. */
async function waitForState(paymentId: Hex, want: number, timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const payment = await readPayment(paymentId);
    if (payment.state === want) {
      log('state confirmed', `payment is ${Object.keys(PaymentState)[want]}`);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`payment stuck in state ${payment.state}, wanted ${want}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

async function waitForUnbound(amount: bigint, timeoutMs = 30_000): Promise<void> {
  const { unboundBalance } = await import('./lib/escrow.js');
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const available = await unboundBalance();
    if (available >= amount) {
      log('deposit visible', `${available} tinybar unbound`);
      return;
    }
    if (Date.now() > deadline) {
      throw new Error(`escrow still shows ${available} tinybar unbound, need ${amount}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

/** The seller's signing address, which is also who the escrow pays on release. */
async function sellerIdentity(sellerUrl: string): Promise<string> {
  const response = await fetch(`${sellerUrl}/identity`);
  if (!response.ok) throw new Error('seller does not expose /identity');
  return ((await response.json()) as { address: string }).address;
}

if (import.meta.main) {
  const buyerKey = process.env['BUYER_PRIVATE_KEY'] as Hex | undefined;
  const accountId = process.env['BUYER_ACCOUNT_ID'];
  if (!buyerKey || !accountId) {
    console.error('BUYER_PRIVATE_KEY and BUYER_ACCOUNT_ID are required');
    process.exit(1);
  }

  const misbehave = process.argv[2];
  console.log(`buying a quote${misbehave ? ` (forcing "${misbehave}")` : ''}`);

  const result = await buy({
    sellerUrl: process.env['SELLER_URL'] ?? `http://localhost:${config.sellerPort}`,
    indexUrl: process.env['INDEX_URL'] ?? config.indexBaseUrl,
    buyerKey,
    hederaAccountId: accountId,
    ...(misbehave ? { misbehave } : {}),
  });

  console.log(`\nresult: ${result.verdict}`);
}
