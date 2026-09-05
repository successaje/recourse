/**
 * SLA document types.
 *
 * An SLA is the contract both parties agree to *before* any money moves. The
 * seller publishes it, the `402` response carries its hash, and the enclave
 * later enforces it. Nothing here may depend on wall-clock time, network state,
 * or iteration order: the enclave result is attested and verified by DON
 * consensus, so the same inputs must always produce the same verdict.
 */

/** Operators the enclave can evaluate. Every one is a pure function. */
export type OperatorName =
  | 'exists'
  | 'numeric.gt'
  | 'numeric.gte'
  | 'numeric.lt'
  | 'numeric.lte'
  | 'numeric.eq'
  | 'string.eq'
  | 'string.matches'
  | 'string.minLength'
  | 'array.minLength'
  | 'freshness.maxAgeSec';

export interface Assertion {
  /** Which check to run. */
  op: OperatorName;
  /** Restricted JSONPath into the response body, e.g. `$.data.bid` or `$.rows[0].id`. */
  path: string;
  /**
   * Comparison operand. Unused by `exists`. For `string.matches` this is a
   * regular expression source string, anchored and length-capped at evaluation
   * time (see operators.ts) so a pathological pattern cannot stall the enclave.
   */
  value?: string | number;
  /** Optional human-readable note. Carried in the SLA hash, ignored by the evaluator. */
  note?: string;
}

export interface SlaDocument {
  /** Schema version of this document format. */
  version: '1.0';
  /** What is being sold, for humans reading the registry. */
  title?: string;
  price: {
    /** `HBAR` for native, or an HTS token id such as `0.0.429274`. */
    asset: string;
    /** Smallest unit, as a decimal string so large values survive JSON round-trips. */
    amount: string;
    /** CAIP-2 style network id, e.g. `hedera:testnet`. */
    network: string;
  };
  response: {
    /** Exact `Content-Type` the seller commits to, compared before the media type parameters. */
    contentType: string;
    /** Keys that must be present at the top level of the parsed body. */
    required: string[];
    /** Evaluated in order. The first failure decides the reason code. */
    assertions: Assertion[];
  };
  /** Optional ceiling on how long the seller may take to respond. */
  latency?: { maxMs: number };
}

/** Everything the enclave needs to reach a verdict, and nothing it does not. */
export interface EvidenceBundle {
  /** Raw response body exactly as delivered, byte for byte. */
  body: string;
  /** Content-Type header the seller actually returned. */
  contentType: string;
  /** Observed round-trip in milliseconds, as recorded by the buyer. */
  latencyMs: number;
  /**
   * Reference instant for freshness checks, in seconds.
   *
   * Passed in rather than read from the clock: `Date.now()` inside the enclave
   * would make the verdict non-deterministic and break consensus. The escrow
   * supplies the block timestamp at which the dispute was opened.
   */
  evaluatedAt: number;
}

export const Verdict = {
  APPROVE: 0,
  REJECT: 1,
} as const;

export type VerdictValue = (typeof Verdict)[keyof typeof Verdict];

/**
 * Reason codes are `uint16` on-chain.
 *
 * 0 means approved. 1..999 is the 1-based index of the assertion that failed,
 * so a refund points at the exact clause it was granted under. Codes from 1000
 * up are structural failures that happen before any assertion runs.
 */
export const Reason = {
  NONE: 0,
  MALFORMED_BODY: 1000,
  CONTENT_TYPE_MISMATCH: 1001,
  MISSING_REQUIRED_FIELD: 1002,
  LATENCY_EXCEEDED: 1003,
  RECEIPT_MISMATCH: 1004,
  SLA_HASH_MISMATCH: 1005,
  UNKNOWN_OPERATOR: 1006,
} as const;

/** Largest assertion index expressible as a reason code. */
export const MAX_ASSERTIONS = 999;

export interface Judgement {
  verdict: VerdictValue;
  reasonCode: number;
  /** Debug detail. Never crosses back to the DON and never reaches the chain. */
  detail: string;
}
