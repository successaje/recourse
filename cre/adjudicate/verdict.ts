/**
 * Bridge between the SLA package's reason codes and the on-chain ones.
 *
 * The two schemes are deliberately different. Off-chain, structural failures sit
 * at 1000+ so they can never collide with an assertion index. On-chain they are
 * small constants with assertion indices offset by 100, because the escrow emits
 * a `uint16` and small values keep the calldata cheap. Mapping in one place means
 * neither side has to know about the other's numbering.
 */

import { Reason, Verdict as SlaVerdict, type Judgement } from '@recourse/sla';

/** Mirrors `Verdict.Outcome` in Solidity. `None` (0) is never emitted. */
export const Outcome = {
  None: 0,
  Approve: 1,
  Reject: 2,
} as const;

/** Mirrors the `REASON_*` constants in `Verdict.sol`. */
export const OnChainReason = {
  OK: 0,
  RECEIPT_MISMATCH: 1,
  MALFORMED_BODY: 2,
  CONTENT_TYPE: 3,
  MISSING_FIELD: 4,
  LATENCY: 5,
  VERDICT_TIMEOUT: 6,
  SLA_MISMATCH: 7,
  UNKNOWN_OPERATOR: 8,
  ASSERTION_OFFSET: 100,
} as const;

const STRUCTURAL: Record<number, number> = {
  [Reason.NONE]: OnChainReason.OK,
  [Reason.MALFORMED_BODY]: OnChainReason.MALFORMED_BODY,
  [Reason.CONTENT_TYPE_MISMATCH]: OnChainReason.CONTENT_TYPE,
  [Reason.MISSING_REQUIRED_FIELD]: OnChainReason.MISSING_FIELD,
  [Reason.LATENCY_EXCEEDED]: OnChainReason.LATENCY,
  [Reason.RECEIPT_MISMATCH]: OnChainReason.RECEIPT_MISMATCH,
  [Reason.SLA_HASH_MISMATCH]: OnChainReason.SLA_MISMATCH,
  [Reason.UNKNOWN_OPERATOR]: OnChainReason.UNKNOWN_OPERATOR,
};

export interface OnChainVerdict {
  outcome: number;
  reasonCode: number;
}

/**
 * Translate a judgement into the pair the escrow settles on.
 *
 * A failed assertion keeps its 1-based index, shifted by `ASSERTION_OFFSET`, so a
 * refund still points at the exact clause it was granted under once it is on-chain.
 */
export function toOnChain(judgement: Judgement): OnChainVerdict {
  const outcome = judgement.verdict === SlaVerdict.APPROVE ? Outcome.Approve : Outcome.Reject;

  const structural = STRUCTURAL[judgement.reasonCode];
  if (structural !== undefined) return { outcome, reasonCode: structural };

  // Anything left is an assertion index in 1..999.
  return { outcome, reasonCode: OnChainReason.ASSERTION_OFFSET + judgement.reasonCode };
}
