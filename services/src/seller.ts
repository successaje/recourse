/**
 * Demo x402-gated service.
 *
 * Sells one thing — an HBAR/USD spot quote — under a published, machine-checkable
 * SLA. It behaves like any other x402 seller with two additions:
 *
 *   1. The `402` carries the SLA hash and the payment id, so the buyer knows the
 *      exact terms it is about to be held to and which id to bind on-chain.
 *   2. The `200` carries a signature over `paymentId ‖ keccak(body)`, which is
 *      what makes the response disputable. A seller that skips this is not being
 *      clever: the buyer reclaims the escrow instead.
 *
 * `?misbehave=` forces a specific SLA violation. That is the demo: a real service
 * returning something that breaks its own published contract, and the money coming
 * back anyway.
 */

import { canonicalHash, type SlaDocument } from '@recourse/sla';
import { Hono } from 'hono';
import { keccak256, toBytes, type Hex } from 'viem';

import { config, ESCROW_ACCOUNT_ID, X402_VERSION } from './lib/config.js';
import { signReceipt } from './lib/receipt.js';
import { decodePaymentHeader, paymentRequirements, settle, verify } from './lib/x402.js';

// ─── The service's published terms ──────────────────────────────────

/** Price for one quote, in tinybars. 0.1 HBAR. */
const PRICE = '10000000';

const SLA: SlaDocument = {
  version: '1.0',
  title: 'HBAR-USD spot quote',
  price: { asset: 'HBAR', amount: PRICE, network: 'hedera:testnet' },
  latency: { maxMs: 2000 },
  response: {
    contentType: 'application/json',
    required: ['pair', 'bid', 'ask', 'asOf'],
    assertions: [
      { op: 'string.matches', path: '$.pair', value: '[A-Z]+-[A-Z]+', note: 'well-formed pair' },
      { op: 'numeric.gt', path: '$.bid', value: 0, note: 'bid is positive' },
      { op: 'numeric.gt', path: '$.ask', value: 0, note: 'ask is positive' },
      { op: 'numeric.lte', path: '$.spreadBps', value: 50, note: 'spread within 50bps' },
      { op: 'freshness.maxAgeSec', path: '$.asOf', value: 30, note: 'quote at most 30s old' },
    ],
  },
};

const SLA_HASH = canonicalHash(SLA);

// ─── Quote generation ───────────────────────────────────────────────

type Misbehaviour = 'stale' | 'spread' | 'negative' | 'malformed' | 'missing' | 'wrong-type';

/**
 * Produce a quote body.
 *
 * The honest branch is the default. Each misbehaviour targets exactly one clause
 * so a demo can point at the reason code and show which promise was broken.
 */
function quoteBody(pair: string, misbehave: Misbehaviour | undefined, now: number): string {
  const base = { pair, bid: 0.0521, ask: 0.0524, spreadBps: 6, asOf: now };

  switch (misbehave) {
    case 'stale':
      return JSON.stringify({ ...base, asOf: now - 600 });
    case 'spread':
      return JSON.stringify({ ...base, ask: 0.09, spreadBps: 720 });
    case 'negative':
      return JSON.stringify({ ...base, bid: -1 });
    case 'missing':
      return JSON.stringify({ pair, bid: base.bid, ask: base.ask, spreadBps: base.spreadBps });
    case 'wrong-type':
      return JSON.stringify({ ...base, bid: String(base.bid) });
    case 'malformed':
      return '{ this is not json';
    default:
      return JSON.stringify(base);
  }
}

// ─── Evidence handed to the buyer ───────────────────────────────────

/**
 * A payment id the buyer will bind on-chain.
 *
 * Derived from a nonce rather than the request, so two identical requests are
 * still two distinct payments.
 */
function newPaymentId(): Hex {
  return keccak256(toBytes(`${Date.now()}:${crypto.randomUUID()}`));
}

// ─── Routes ─────────────────────────────────────────────────────────

export const seller = new Hono();

seller.get('/sla', (c) => c.json({ slaHash: SLA_HASH, sla: SLA }));

seller.get('/quote', async (c) => {
  const pair = c.req.query('pair') ?? 'HBAR-USD';
  const misbehave = c.req.query('misbehave') as Misbehaviour | undefined;
  const header = c.req.header('X-PAYMENT');
  const requirements = paymentRequirements(PRICE);

  // ── Unpaid: quote the price and the terms ──
  if (!header) {
    const paymentId = newPaymentId();
    return c.json(
      {
        x402Version: X402_VERSION,
        accepts: [requirements],
        error: 'payment required',
        // Recourse additions. A plain x402 client ignores these; a Recourse buyer
        // binds `paymentId` to `slaHash` on-chain before retrying.
        recourse: {
          paymentId,
          slaHash: SLA_HASH,
          slaUrl: `${c.req.url.split('/quote')[0]}/sla`,
          escrow: ESCROW_ACCOUNT_ID,
        },
      },
      402,
    );
  }

  const paymentId = c.req.header('X-PAYMENT-ID') as Hex | undefined;
  if (!paymentId) {
    return c.json({ error: 'X-PAYMENT-ID header required alongside X-PAYMENT' }, 400);
  }

  // ── Paid: verify, settle, then serve ──
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

  // Only now is the response produced. Settlement happening first is precisely
  // the gap Recourse exists to close.
  const started = Date.now();
  const body = quoteBody(pair, misbehave, Math.floor(Date.now() / 1000));
  const latencyMs = Date.now() - started;

  if (config.sellerPrivateKey === undefined) {
    return c.json({ error: 'seller key not configured; cannot sign a receipt' }, 500);
  }

  const receipt = await signReceipt(config.sellerPrivateKey as Hex, paymentId, body);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Response': JSON.stringify(settled.body),
      // The receipt. Without these three the buyer cannot dispute, and the
      // escrow will refund it once the window closes.
      'X-Recourse-Payment-Id': paymentId,
      'X-Recourse-Response-Hash': receipt.responseHash,
      'X-Recourse-Receipt': receipt.signature,
      'X-Recourse-Latency-Ms': String(latencyMs),
    },
  });
});

if (import.meta.main) {
  console.log(`seller listening on :${config.sellerPort}`);
  console.log(`  sla hash: ${SLA_HASH}`);
  console.log(`  payTo:    ${ESCROW_ACCOUNT_ID} (escrow)`);
  Bun.serve({ port: config.sellerPort, fetch: seller.fetch });
}
