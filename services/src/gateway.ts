/**
 * Recourse agent gateway.
 *
 * Exposes the useful half of Recourse as an x402-payable API, so an agent can
 * use it without deploying anything or knowing that Hedera, CCIP or an enclave
 * are involved.
 *
 * The valuable endpoint is `/v1/adjudicate`. Any agent buying from any x402
 * seller can send the SLA it agreed to and the response it got back, and be told
 * — deterministically, by the same code the enclave runs — whether that response
 * honoured the contract, and which clause failed if not. That answer is worth
 * paying for precisely because it is the one an agent cannot compute for itself
 * without reimplementing the judge and agreeing with everyone else's copy of it.
 *
 * The endpoint is itself paid for over x402 on Hedera, so a verdict depends on
 * both this service and Hedera settlement: no payment, no judgement.
 */

import { adjudicate, canonicalHash, Reason, Verdict, type SlaDocument } from '@recourse/sla';
import { Hono } from 'hono';
import type { Hex } from 'viem';

import { config, ESCROW_ACCOUNT_ID, ESCROW_EVM_ADDRESS, X402_VERSION } from './lib/config.js';
import { PaymentState, readPayment } from './lib/escrow.js';
import { paymentRequirements, settle, verify, decodePaymentHeader } from './lib/x402.js';

/** Price of one adjudication, in tinybars. 0.01 HBAR. */
const ADJUDICATION_PRICE = '1000000';

export const gateway = new Hono();

// ─── Discovery ──────────────────────────────────────────────────────

/**
 * Machine-readable description of the service.
 *
 * A Bazantic Gateway ingests this; it is also what lets an agent that has never
 * seen Recourse work out what to send without a human explaining it.
 */
const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Recourse',
    version: '0.1.0',
    description:
      'Decide whether a paid API response honoured the SLA it was sold under, and ' +
      'settle the payment accordingly. Adjudication is deterministic: the same ' +
      'inputs always produce the same verdict, and the same code runs inside a ' +
      'Chainlink CRE enclave when a dispute goes on-chain.',
  },
  servers: [{ url: 'https://recourse.example/v1' }],
  paths: {
    '/adjudicate': {
      post: {
        summary: 'Judge a response against the SLA it was sold under',
        description:
          'Returns APPROVE or REJECT plus a reason code. A reason code of 1..999 is ' +
          'the 1-based index of the clause that failed, so the answer points at a ' +
          'specific published promise rather than an opinion. Costs 0.01 HBAR via x402.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AdjudicateRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Verdict' },
          '402': { description: 'Payment required (x402)' },
        },
      },
    },
    '/sla/hash': {
      post: {
        summary: 'Canonical hash of an SLA document',
        description:
          'Free. Key order and whitespace do not affect the result, so buyer and ' +
          'seller can agree on one identifier for the same terms.',
      },
    },
    '/payments/{paymentId}': {
      get: {
        summary: 'On-chain state of a Recourse payment',
        description: 'Free. Reads the escrow on Hedera testnet.',
      },
    },
  },
  components: {
    schemas: {
      AdjudicateRequest: {
        type: 'object',
        required: ['sla', 'response'],
        properties: {
          sla: { type: 'object', description: 'The SLA document the payment was bound to.' },
          response: {
            type: 'object',
            required: ['body'],
            properties: {
              body: { type: 'string', description: 'Raw response body, byte for byte.' },
              contentType: { type: 'string', default: 'application/json' },
              latencyMs: { type: 'integer', default: 0 },
            },
          },
        },
      },
    },
  },
} as const;

gateway.get('/v1/openapi.json', (c) => c.json(OPENAPI));

gateway.get('/v1/health', (c) =>
  c.json({ ok: true, escrow: ESCROW_EVM_ADDRESS, escrowAccount: ESCROW_ACCOUNT_ID }),
);

// ─── Free endpoints ─────────────────────────────────────────────────

/**
 * Hash an SLA.
 *
 * Free because it is the step that lets two parties agree what they are even
 * arguing about; charging for it would only push people to reimplement it
 * slightly differently, which is the one outcome that breaks the protocol.
 */
gateway.post('/v1/sla/hash', async (c) => {
  const body = (await c.req.json()) as { sla?: SlaDocument };
  if (!body.sla) return c.json({ error: 'body must contain "sla"' }, 400);

  return c.json({ slaHash: canonicalHash(body.sla) });
});

gateway.get('/v1/payments/:paymentId', async (c) => {
  const paymentId = c.req.param('paymentId') as Hex;
  const payment = await readPayment(paymentId);

  const names = Object.keys(PaymentState);
  return c.json({
    paymentId,
    state: payment.state,
    stateName: names[payment.state] ?? 'Unknown',
    buyer: payment.buyer,
    seller: payment.seller,
    amount: String(payment.amount),
    bond: String(payment.bond),
    slaHash: payment.slaHash,
    responseHash: payment.responseHash,
    deadline: Number(payment.deadline),
  });
});

// ─── Paid endpoint ──────────────────────────────────────────────────

/**
 * Judge a response.
 *
 * x402-gated in the ordinary way: the agent pays this service directly. The
 * escrow protocol is what this service is *about*, not how it charges — wrapping
 * a two-transaction escrow around a one-call verdict would cost more than the
 * verdict.
 */
gateway.post('/v1/adjudicate', async (c) => {
  // Paid to the gateway itself, never to the escrow.
  const requirements = paymentRequirements(ADJUDICATION_PRICE, config.gatewayPayTo);
  const header = c.req.header('X-PAYMENT');

  if (!header) {
    return c.json(
      {
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'payment required',
      },
      402,
    );
  }

  let payload: unknown;
  try {
    payload = decodePaymentHeader(header);
  } catch {
    return c.json({ error: 'X-PAYMENT is not valid base64 JSON' }, 400);
  }

  const verified = await verify(payload, requirements);
  if (!verified.ok) {
    return c.json({ error: 'payment verification failed', detail: verified.body }, 402);
  }
  const settled = await settle(payload, requirements);
  if (!settled.ok) {
    return c.json({ error: 'settlement failed', detail: settled.body }, 402);
  }

  const body = (await c.req.json()) as {
    sla?: SlaDocument;
    response?: { body: string; contentType?: string; latencyMs?: number };
  };

  if (!body.sla || !body.response?.body) {
    return c.json({ error: 'body must contain "sla" and "response.body"' }, 400);
  }

  const judgement = adjudicate(body.sla, {
    body: body.response.body,
    contentType: body.response.contentType ?? 'application/json',
    latencyMs: body.response.latencyMs ?? 0,
    // Only consulted by `freshness.maxAgeSec`, which the recommended SLAs avoid
    // precisely because no honest value exists here. `freshness.servedWithin`
    // reads both timestamps out of the signed body instead.
    evaluatedAt: 0,
  });

  const failedClause =
    judgement.reasonCode > 0 && judgement.reasonCode < 1000
      ? body.sla.response.assertions[judgement.reasonCode - 1]
      : undefined;

  return c.json({
    verdict: judgement.verdict === Verdict.APPROVE ? 'APPROVE' : 'REJECT',
    reasonCode: judgement.reasonCode,
    // What the agent actually needs: which promise broke, in the seller's words.
    failedClause: failedClause
      ? { index: judgement.reasonCode, op: failedClause.op, path: failedClause.path, note: failedClause.note }
      : null,
    structural: judgement.reasonCode >= 1000 ? reasonName(judgement.reasonCode) : null,
    detail: judgement.detail,
    slaHash: canonicalHash(body.sla),
    x402Settlement: settled.body,
  });
});

function reasonName(code: number): string {
  const found = Object.entries(Reason).find(([, v]) => v === code);
  return found?.[0] ?? 'UNKNOWN';
}

if (import.meta.main) {
  const port = Number(process.env['GATEWAY_PORT'] ?? '8404');
  console.log(`recourse gateway listening on :${port}`);
  console.log(`  openapi: http://localhost:${port}/v1/openapi.json`);
  console.log(`  escrow:  ${ESCROW_EVM_ADDRESS} (${ESCROW_ACCOUNT_ID})`);
  void config;
  Bun.serve({ port, fetch: gateway.fetch });
}
