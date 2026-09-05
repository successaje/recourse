import { describe, expect, test } from 'bun:test';

import { canonicalHash, canonicalJson, bodyHash } from '../src/canonical.js';
import { adjudicate, adjudicateDispute } from '../src/evaluate.js';
import { evaluateAssertion, OperatorError } from '../src/operators.js';
import { parsePath, PathError, readPath } from '../src/path.js';
import { Reason, Verdict, type EvidenceBundle, type SlaDocument } from '../src/types.js';

import quoteV1 from '../examples/quote-v1.json' with { type: 'json' };

const SLA = quoteV1 as SlaDocument;

/** Fixed instant so freshness checks never depend on the wall clock. */
const NOW = 1_788_600_000;

function goodBody(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ pair: 'HBAR-USD', bid: 0.052, ask: 0.0523, spreadBps: 6, asOf: NOW - 5, ...overrides });
}

function evidence(body: string, overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return { body, contentType: 'application/json', latencyMs: 120, evaluatedAt: NOW, ...overrides };
}

describe('path', () => {
  test('reads nested keys and array indices', () => {
    const doc = { a: { b: [{ c: 7 }] } };
    expect(readPath(doc, '$.a.b[0].c')).toBe(7);
  });

  test('distinguishes an explicit null from an absent key', () => {
    expect(readPath({ a: null }, '$.a')).toBeNull();
    expect(readPath({ a: null }, '$.missing')).toBeUndefined();
  });

  test('rejects grammar outside the subset', () => {
    expect(() => parsePath('$.a[*]')).toThrow(PathError);
    expect(() => parsePath('a.b')).toThrow(PathError);
  });
});

describe('operators', () => {
  test('numeric comparisons refuse numeric strings', () => {
    expect(evaluateAssertion(5, { op: 'numeric.gt', path: '$.x', value: 1 }, NOW)).toBe(true);
    expect(evaluateAssertion('5', { op: 'numeric.gt', path: '$.x', value: 1 }, NOW)).toBe(false);
  });

  test('string.matches anchors an unanchored pattern', () => {
    const assertion = { op: 'string.matches', path: '$.x', value: '[A-Z]+-[A-Z]+' } as const;
    expect(evaluateAssertion('HBAR-USD', assertion, NOW)).toBe(true);
    // Would pass unanchored; must not.
    expect(evaluateAssertion('!! HBAR-USD !!', assertion, NOW)).toBe(false);
  });

  test('freshness rejects future timestamps', () => {
    const assertion = { op: 'freshness.maxAgeSec', path: '$.x', value: 30 } as const;
    expect(evaluateAssertion(NOW - 10, assertion, NOW)).toBe(true);
    expect(evaluateAssertion(NOW - 31, assertion, NOW)).toBe(false);
    expect(evaluateAssertion(NOW + 5, assertion, NOW)).toBe(false);
  });

  test('a malformed clause raises rather than silently failing', () => {
    expect(() => evaluateAssertion(1, { op: 'numeric.gt', path: '$.x' }, NOW)).toThrow(OperatorError);
  });
});

describe('canonical form', () => {
  test('key order does not change the hash', () => {
    const a = { alpha: 1, beta: { x: 1, y: 2 } };
    const b = { beta: { y: 2, x: 1 }, alpha: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalHash(a)).toBe(canonicalHash(b));
  });

  test('undefined members hash the same as omitted ones', () => {
    expect(canonicalHash({ a: 1, b: undefined })).toBe(canonicalHash({ a: 1 }));
  });

  test('body hashing is over raw bytes, so spacing matters', () => {
    expect(bodyHash('{"a":1}')).not.toBe(bodyHash('{ "a": 1 }'));
  });
});

describe('adjudicate', () => {
  test('approves a conforming response', () => {
    const judgement = adjudicate(SLA, evidence(goodBody()));
    expect(judgement.verdict).toBe(Verdict.APPROVE);
    expect(judgement.reasonCode).toBe(Reason.NONE);
  });

  test('reason code is the 1-based index of the first failed clause', () => {
    // Clause 4 is the 50bps spread ceiling.
    const judgement = adjudicate(SLA, evidence(goodBody({ spreadBps: 900 })));
    expect(judgement.verdict).toBe(Verdict.REJECT);
    expect(judgement.reasonCode).toBe(4);
  });

  test('stale quotes fail the freshness clause', () => {
    const judgement = adjudicate(SLA, evidence(goodBody({ asOf: NOW - 600 })));
    expect(judgement.reasonCode).toBe(5);
  });

  test('structural failures outrank assertion failures', () => {
    // Body is unparseable *and* would fail clause 1; the structural code wins.
    expect(adjudicate(SLA, evidence('not json')).reasonCode).toBe(Reason.MALFORMED_BODY);
    expect(adjudicate(SLA, evidence(goodBody(), { contentType: 'text/html' })).reasonCode).toBe(
      Reason.CONTENT_TYPE_MISMATCH,
    );
    expect(adjudicate(SLA, evidence(goodBody(), { latencyMs: 9_000 })).reasonCode).toBe(
      Reason.LATENCY_EXCEEDED,
    );
  });

  test('missing required field is reported as such, not as a clause failure', () => {
    const body = JSON.stringify({ pair: 'HBAR-USD', bid: 1, ask: 2, spreadBps: 1 });
    expect(adjudicate(SLA, evidence(body)).reasonCode).toBe(Reason.MISSING_REQUIRED_FIELD);
  });

  test('content type parameters are ignored', () => {
    const judgement = adjudicate(SLA, evidence(goodBody(), { contentType: 'application/json; charset=utf-8' }));
    expect(judgement.verdict).toBe(Verdict.APPROVE);
  });

  test('the same inputs always produce the same verdict', () => {
    const bundle = evidence(goodBody({ spreadBps: 900 }));
    const runs = Array.from({ length: 50 }, () => adjudicate(SLA, bundle));
    const first = JSON.stringify(runs[0]);
    expect(runs.every((r) => JSON.stringify(r) === first)).toBe(true);
  });
});

describe('evidence integrity', () => {
  const slaHash = canonicalHash(SLA);

  test('a forged body is rejected before it is judged', () => {
    const delivered = goodBody();
    const forged = goodBody({ bid: -1 });

    const judgement = adjudicateDispute({
      sla: SLA,
      evidence: evidence(forged),
      // Seller signed the hash of what it actually sent.
      signedResponseHash: bodyHash(delivered),
      committedSlaHash: slaHash,
    });

    expect(judgement.reasonCode).toBe(Reason.RECEIPT_MISMATCH);
  });

  test('a genuine bad response still loses on merit', () => {
    const delivered = goodBody({ bid: -1 });

    const judgement = adjudicateDispute({
      sla: SLA,
      evidence: evidence(delivered),
      signedResponseHash: bodyHash(delivered),
      committedSlaHash: slaHash,
    });

    expect(judgement.verdict).toBe(Verdict.REJECT);
    expect(judgement.reasonCode).toBe(2);
  });

  test('a swapped SLA is caught by the committed hash', () => {
    const judgement = adjudicateDispute({
      sla: { ...SLA, latency: { maxMs: 999_999 } },
      evidence: evidence(goodBody()),
      signedResponseHash: bodyHash(goodBody()),
      committedSlaHash: slaHash,
    });

    expect(judgement.reasonCode).toBe(Reason.SLA_HASH_MISMATCH);
  });
});
