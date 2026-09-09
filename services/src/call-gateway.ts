/**
 * Pay for a verdict.
 *
 * Exercises the Bazantic Recipe end to end: settle 0.01 HBAR to the gateway
 * over x402 on Hedera, then ask it whether a response honoured its SLA. Both
 * halves are load-bearing — no Hedera settlement, no verdict — which is exactly
 * the property the Recipe track asks a submission to demonstrate.
 *
 *   BUYER_PRIVATE_KEY=0x… BUYER_ACCOUNT_ID=0.0.… bun run src/call-gateway.ts [good|bad]
 */

import { ExactHederaScheme, createClientHederaSigner, PrivateKey } from '@x402/hedera';
import { canonicalHash, type SlaDocument } from '@recourse/sla';
import { X402_VERSION } from './lib/config.js';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:8404';
const mode = process.argv[2] === 'bad' ? 'bad' : 'good';

const log = (step: string, detail = '') =>
  console.log(`  ${step.padEnd(18)} ${detail}`);

/** The terms the response is being judged against. */
const sla: SlaDocument = {
  version: '1.0',
  title: 'HBAR-USD spot quote',
  price: { asset: 'HBAR', amount: '10000000', network: 'hedera:testnet' },
  response: {
    contentType: 'application/json',
    required: ['pair', 'bid', 'ask'],
    assertions: [
      { op: 'string.matches', path: '$.pair', value: '[A-Z]+-[A-Z]+', note: 'well-formed pair' },
      { op: 'numeric.gt', path: '$.bid', value: 0, note: 'bid is positive' },
      { op: 'numeric.lte', path: '$.spreadBps', value: 50, note: 'spread within 50bps' },
    ],
  },
};

/** Two responses: one that honours the terms, one that quietly breaks clause 2. */
const body =
  mode === 'good'
    ? JSON.stringify({ pair: 'HBAR-USD', bid: 0.0521, ask: 0.0524, spreadBps: 6 })
    : JSON.stringify({ pair: 'HBAR-USD', bid: -1, ask: 0.0524, spreadBps: 6 });

async function main() {
  const buyerKey = process.env.BUYER_PRIVATE_KEY as `0x${string}`;
  const accountId = process.env.BUYER_ACCOUNT_ID;
  if (!buyerKey || !accountId) {
    throw new Error('set BUYER_PRIVATE_KEY and BUYER_ACCOUNT_ID');
  }

  console.log(`\nRecipe · paid adjudication (${mode} response)\n`);

  // ── 1. Ask, and get told the price ──
  const quote = await fetch(`${GATEWAY}/v1/adjudicate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (quote.status !== 402) throw new Error(`expected 402, got ${quote.status}`);

  const offer = (await quote.json()) as { accepts: Record<string, unknown>[] };
  const requirements = offer.accepts[0];
  if (!requirements) throw new Error('402 carried no requirements');
  log('402', `${requirements.amount} tinybar → ${requirements.payTo}`);

  // ── 2. Build the payment. The gateway settles it, not us ──
  const signer = createClientHederaSigner(
    accountId,
    PrivateKey.fromStringECDSA(buyerKey),
    { network: 'hedera:testnet' },
  );
  const scheme = new ExactHederaScheme(signer);
  const result = await scheme.createPaymentPayload(X402_VERSION, requirements as never);

  const paymentPayload = {
    x402Version: X402_VERSION,
    accepted: requirements,
    payload: (result as { payload: Record<string, unknown> }).payload,
  };

  log('signed', 'payment payload built — the gateway settles it');

  // ── 3. Buy the verdict ──
  const res = await fetch(`${GATEWAY}/v1/adjudicate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64'),
    },
    body: JSON.stringify({
      sla,
      slaHash: canonicalHash(sla),
      response: { body, contentType: 'application/json' },
    }),
  });

  const verdict = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`adjudication failed: ${JSON.stringify(verdict)}`);

  log('status', String(res.status));
  console.log();
  console.log(JSON.stringify(verdict, null, 2));

  const ok = verdict.verdict === 'APPROVE';
  console.log(
    `\n${ok ? '✓' : '✕'} ${verdict.verdict}` +
      (verdict.detail ? ` — ${verdict.detail}` : '') +
      '\n',
  );
}

main().catch((error) => {
  console.error(`\n✕ ${(error as Error).message}\n`);
  process.exit(1);
});
