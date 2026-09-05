/**
 * Dispute index.
 *
 * The enclave cannot be told about a dispute directly: CRE has no trigger that can
 * watch Hedera, so the adjudicator sweeps a queue on a schedule instead. This
 * serves that queue, plus the evidence and SLA each entry points at.
 *
 * Nothing here is trusted, and it does not need to be. The enclave re-reads the
 * payment from chain, checks the SLA against the hash committed by `bind`, and
 * checks the body against the hash the seller signed. A dishonest index can delay
 * a verdict or waste a sweep; it cannot change one. That is why this can be a
 * plain HTTP service with no authority of its own.
 */

import { bodyHash, canonicalHash, type SlaDocument } from '@recourse/sla';
import { Hono } from 'hono';
import type { Hex } from 'viem';

import { config } from './lib/config.js';

interface DisputeRecord {
  paymentId: Hex;
  /** Block at which the enclave should read escrow state. */
  blockNumber: number;
  /** Exactly the bytes the seller returned. */
  body: string;
  contentType: string;
  latencyMs: number;
  sla: SlaDocument;
  /** Set once a verdict has been observed on-chain, so sweeps stop re-judging it. */
  resolvedAt?: number;
  submittedAt: number;
}

/**
 * In-memory. A dispute only needs to survive until its verdict lands, and losing
 * the queue costs a re-submission rather than any money — the escrow, not this
 * service, holds the funds and the deadlines.
 */
const disputes = new Map<string, DisputeRecord>();

export const indexService = new Hono();

/**
 * Register a dispute. Called by the buyer after `dispute()` has landed on-chain.
 *
 * Deliberately unauthenticated: anyone may ask the adjudicator to look at a
 * payment, because looking is safe. A payment that is not actually `Disputed` on
 * chain is rejected by the enclave, not here.
 */
indexService.post('/disputes', async (c) => {
  const payload = (await c.req.json()) as Partial<DisputeRecord>;

  const missing = (['paymentId', 'blockNumber', 'body', 'contentType', 'sla'] as const).filter(
    (k) => payload[k] === undefined,
  );
  if (missing.length > 0) {
    return c.json({ error: `missing fields: ${missing.join(', ')}` }, 400);
  }

  const record: DisputeRecord = {
    paymentId: payload.paymentId as Hex,
    blockNumber: payload.blockNumber as number,
    body: payload.body as string,
    contentType: payload.contentType as string,
    latencyMs: payload.latencyMs ?? 0,
    sla: payload.sla as SlaDocument,
    submittedAt: Date.now(),
  };

  disputes.set(record.paymentId.toLowerCase(), record);

  return c.json({
    paymentId: record.paymentId,
    // Echoed back so the caller can check these match what it bound on-chain
    // before waiting on a verdict that would be rejected anyway.
    slaHash: canonicalHash(record.sla),
    responseHash: bodyHash(record.body),
    queued: true,
  });
});

/**
 * The queue the adjudicator sweeps: pointers only, oldest first.
 *
 * Deliberately not the evidence itself. The enclave fetches that separately, so
 * the payload it judges arrives over its own confidential request rather than
 * riding along in a list anyone might be reading.
 */
indexService.get('/queue', (c) => {
  const base = config.indexBaseUrl;
  const pending = [...disputes.values()]
    .filter((d) => d.resolvedAt === undefined)
    .sort((a, b) => a.submittedAt - b.submittedAt)
    .map((d) => ({
      paymentId: d.paymentId,
      blockNumber: d.blockNumber,
      evidenceUrl: `${base}/evidence/${d.paymentId}`,
      slaUrl: `${base}/sla/${d.paymentId}`,
    }));

  return c.json(pending);
});

/** What the seller actually returned, in the shape the adjudicator expects. */
indexService.get('/evidence/:paymentId', (c) => {
  const record = disputes.get(c.req.param('paymentId').toLowerCase());
  if (!record) return c.json({ error: 'unknown payment' }, 404);

  return c.json({
    body: record.body,
    contentType: record.contentType,
    latencyMs: record.latencyMs,
  });
});

/** The SLA the payment was bound to. Its hash is checked inside the enclave. */
indexService.get('/sla/:paymentId', (c) => {
  const record = disputes.get(c.req.param('paymentId').toLowerCase());
  if (!record) return c.json({ error: 'unknown payment' }, 404);
  return c.json(record.sla);
});

/** Mark a dispute settled so sweeps stop picking it up. */
indexService.post('/disputes/:paymentId/resolved', (c) => {
  const key = c.req.param('paymentId').toLowerCase();
  const record = disputes.get(key);
  if (!record) return c.json({ error: 'unknown payment' }, 404);

  record.resolvedAt = Date.now();
  return c.json({ paymentId: record.paymentId, resolved: true });
});

indexService.get('/health', (c) =>
  c.json({
    ok: true,
    queued: [...disputes.values()].filter((d) => d.resolvedAt === undefined).length,
    total: disputes.size,
  }),
);

if (import.meta.main) {
  console.log(`dispute index listening on :${config.indexPort}`);
  console.log(`  queue: ${config.indexBaseUrl}/queue`);
  Bun.serve({ port: config.indexPort, fetch: indexService.fetch });
}
