/**
 * The adjudicator.
 *
 * This is the function that runs inside the AWS Nitro enclave. It sees the
 * disputed payload and decides, and only `(verdict, reasonCode)` crosses back
 * out to the DON. Keep it pure: same inputs, same answer, every time, on every
 * node. The logic itself is public — the workflow binary is handed to the
 * enclave by the Workflow DON — so the confidentiality here covers the data,
 * never the rules. That is deliberate: the rules being auditable is the point.
 */

import { bodyHash, canonicalHash } from './canonical.js';
import { evaluateAssertion, isOperator, OperatorError } from './operators.js';
import { PathError, readPath } from './path.js';
import {
  MAX_ASSERTIONS,
  Reason,
  Verdict,
  type EvidenceBundle,
  type Judgement,
  type SlaDocument,
} from './types.js';

function approve(detail: string): Judgement {
  return { verdict: Verdict.APPROVE, reasonCode: Reason.NONE, detail };
}

function reject(reasonCode: number, detail: string): Judgement {
  return { verdict: Verdict.REJECT, reasonCode, detail };
}

/** Compare media types while ignoring parameters and case (`application/json; charset=utf-8`). */
function mediaTypeMatches(promised: string, actual: string): boolean {
  const normalise = (value: string) => value.split(';')[0]?.trim().toLowerCase() ?? '';
  return normalise(promised) === normalise(actual);
}

/**
 * Decide a dispute.
 *
 * Order matters, and it runs cheapest-and-most-structural first: a body that
 * does not even parse should not be reported as "assertion 3 failed".
 */
export function adjudicate(sla: SlaDocument, evidence: EvidenceBundle): Judgement {
  const assertions = sla.response.assertions;

  if (assertions.length > MAX_ASSERTIONS) {
    return reject(Reason.SLA_HASH_MISMATCH, `SLA declares more than ${MAX_ASSERTIONS} assertions`);
  }

  if (!mediaTypeMatches(sla.response.contentType, evidence.contentType)) {
    return reject(
      Reason.CONTENT_TYPE_MISMATCH,
      `expected ${sla.response.contentType}, got ${evidence.contentType}`,
    );
  }

  if (sla.latency !== undefined && evidence.latencyMs > sla.latency.maxMs) {
    return reject(
      Reason.LATENCY_EXCEEDED,
      `took ${evidence.latencyMs}ms, promised at most ${sla.latency.maxMs}ms`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(evidence.body);
  } catch {
    return reject(Reason.MALFORMED_BODY, 'body is not valid JSON');
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return reject(Reason.MALFORMED_BODY, 'body is not a JSON object');
  }

  const root = parsed as Record<string, unknown>;

  for (const key of sla.response.required) {
    if (!Object.prototype.hasOwnProperty.call(root, key)) {
      return reject(Reason.MISSING_REQUIRED_FIELD, `missing required field: ${key}`);
    }
  }

  for (let i = 0; i < assertions.length; i++) {
    const assertion = assertions[i];
    if (assertion === undefined) continue;

    if (!isOperator(assertion.op)) {
      return reject(Reason.UNKNOWN_OPERATOR, `unknown operator: ${assertion.op}`);
    }

    let held: boolean;
    try {
      held = evaluateAssertion(readPath(root, assertion.path), assertion, evidence.evaluatedAt, root);
    } catch (error) {
      // A malformed clause is the SLA's fault, not the seller's delivery. Both
      // parties signed off on this document, so neither side gets to benefit
      // from it being broken; surface it as its own code rather than pinning
      // the blame on whoever happens to be disputing.
      if (error instanceof OperatorError || error instanceof PathError) {
        return reject(Reason.SLA_HASH_MISMATCH, `clause ${i + 1} is malformed: ${error.message}`);
      }
      throw error;
    }

    if (!held) {
      // 1-based, so the refund points at the exact clause it was granted under.
      return reject(i + 1, `clause ${i + 1} failed: ${assertion.op} at ${assertion.path}`);
    }
  }

  return approve(`all ${assertions.length} clauses held`);
}

/**
 * Full dispute check, evidence integrity included.
 *
 * The buyer supplies the body and the seller's signed hash of it. Re-hashing
 * here is what stops a buyer pasting in garbage to manufacture a refund: the
 * hash was fixed by the seller's signature, the bytes come from the buyer, and
 * a case only gets judged on merit once the two agree.
 */
export function adjudicateDispute(args: {
  sla: SlaDocument;
  evidence: EvidenceBundle;
  /** Hash the seller signed, recovered on-chain by `dispute()`. */
  signedResponseHash: `0x${string}`;
  /** SLA hash committed on-chain by `bind()`. */
  committedSlaHash: `0x${string}`;
}): Judgement {
  const { sla, evidence, signedResponseHash, committedSlaHash } = args;

  if (canonicalHash(sla).toLowerCase() !== committedSlaHash.toLowerCase()) {
    return reject(Reason.SLA_HASH_MISMATCH, 'SLA does not match the hash committed on-chain');
  }

  if (bodyHash(evidence.body).toLowerCase() !== signedResponseHash.toLowerCase()) {
    return reject(Reason.RECEIPT_MISMATCH, 'body does not hash to the seller-signed receipt');
  }

  return adjudicate(sla, evidence);
}
