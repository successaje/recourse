/** Live deployments. Mirrors contracts/DEPLOYMENTS.md. */

export const ESCROW = {
  address: '0x7E7A73e5bE1F45D9B3033C2a96087B62855e00bB',
  accountId: '0.0.10380390',
  chainId: 296,
  explorer: 'https://hashscan.io/testnet/contract/0.0.10380390',
} as const;

export const RELAY = {
  address: '0x005F2e3AB6C085A5240EAC5d8605D92Ba133F9DF',
  chainId: 11155111,
  explorer: 'https://sepolia.etherscan.io/address/0x005F2e3AB6C085A5240EAC5d8605D92Ba133F9DF',
} as const;

export const HEDERA_RPC = 'https://testnet.hashio.io/api';
export const MIRROR_NODE = 'https://testnet.mirrornode.hedera.com';

/** Mirrors RecourseEscrow.State. */
export const STATES = ['None', 'Funded', 'Disputed', 'ReceiptChallenged', 'Settled'] as const;
export type StateName = (typeof STATES)[number];

/** Mirrors the REASON_* constants in Verdict.sol. */
export const REASONS: Record<number, string> = {
  0: 'Approved',
  1: 'Receipt mismatch',
  2: 'Malformed body',
  3: 'Content-Type mismatch',
  4: 'Missing required field',
  5: 'Latency exceeded',
  6: 'No verdict arrived',
  7: 'SLA mismatch',
  8: 'Unknown operator',
};

export const ASSERTION_OFFSET = 100;

/**
 * Turn a uint16 reason code into something a human can act on.
 *
 * Codes at or above the offset are a failed clause, and the index is the part
 * that matters — it points at a specific published promise.
 */
/**
 * Plain-language readings of the structural reason codes.
 *
 * These describe failures that happen *before* any clause is reached, so a
 * person is not left inferring what "reason 2" meant. Clause failures need no
 * entry here — the SLA document says what they promised.
 */
const REASON_DETAIL: Record<number, string> = {
  0: 'Every clause held, so there was nothing to decide against the seller.',
  1: 'The body supplied did not hash to the receipt the seller signed, so the evidence was rejected before its merit was considered.',
  2: 'The response was not parseable, so no clause could be evaluated against it.',
  3: 'The response arrived with the wrong content type.',
  4: 'The response was missing a field the SLA required.',
  5: 'The response took longer than the SLA allowed.',
  6: 'No verdict arrived before the timeout, so the payment was returned to the buyer by default.',
  7: 'The SLA presented did not match the commitment bound on-chain.',
  8: 'The SLA used an operator the adjudicator does not implement, so it could not be enforced deterministically.',
};

export function describeReason(code: number): { label: string; clause?: number; detail?: string } {
  if (code >= ASSERTION_OFFSET) {
    const clause = code - ASSERTION_OFFSET;
    return {
      label: `Clause ${clause} failed`,
      clause,
      detail: `The response broke clause ${clause} of the SLA both parties agreed to before payment.`,
    };
  }
  return { label: REASONS[code] ?? `Reason ${code}`, detail: REASON_DETAIL[code] };
}

/** The runs recorded in DEPLOYMENTS.md, shown as verifiable evidence. */
export const PROVEN_RUNS = {
  refund: {
    paymentId: '0xc79c411d326b9088fa8e0279fbd06ad604d4b04afb85fa595d194c0b96790991',
    verdict: 'REJECT',
    reasonCode: 102,
    sepoliaTx: '0x98d8c5584c793b0b76643c5233995b2e09fc04def6cda68b6a7b31440af72ec7',
    ccipMessage: '0xa4fb4823764e24de8a8f46cfebf75a4e037be7286db32969692cbb7ae421db84',
    refundHbar: '0.11',
  },
  release: {
    paymentId: '0xb77fa6bf8365d99c235a2749014fabe62779ae1e748c94d622dbb44f23c5bb6a',
    releaseTx: '0x7fbd0eb19db078b0fc6d5c0eaa18118081fbbcc8c41258c04fc3d4018373316a',
    paidHbar: '0.1',
  },
} as const;

/** The buyer agent used in the recorded runs, shown when no address is given. */
export const DEMO_BUYER = '0xC282Cb7cE6c175582B84BF94C61258Bb5cDCA88e';
