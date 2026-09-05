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
export function describeReason(code: number): { label: string; clause?: number } {
  if (code >= ASSERTION_OFFSET) {
    const clause = code - ASSERTION_OFFSET;
    return { label: `Clause ${clause} failed`, clause };
  }
  return { label: REASONS[code] ?? `Reason ${code}` };
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
