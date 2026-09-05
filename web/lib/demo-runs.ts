/**
 * Two real runs, replayed.
 *
 * A live "run this now" button cannot finish on camera: CCIP waits for Sepolia
 * finality, so settlement lands roughly eighteen minutes after the verdict. So
 * the demo replays payments that actually happened, and says so — every hash
 * below is on a public explorer, and the point is lost if any of it is invented.
 *
 * The pacing is theatre. The facts are not.
 */

export interface DemoStep {
  n: string;
  title: string;
  detail: string;
  /** Extra lines revealed under the step, for the moments that carry weight. */
  lines?: string[];
  status: 'ok' | 'warn' | 'fail' | 'work';
  /** Milliseconds this step holds before the next begins. */
  hold: number;
  tx?: { label: string; href: string };
  /** Renders the sealed-enclave panel while this step runs. */
  enclave?: boolean;
}

export interface DemoRun {
  id: 'dispute' | 'honest';
  title: string;
  blurb: string;
  paymentId: string;
  slaHash: string;
  outcome: { label: string; buyer: string; seller: string; tone: 'refund' | 'release' };
  closing: string;
  steps: DemoStep[];
}

const HASHSCAN = 'https://hashscan.io/testnet/transaction';
const ETHERSCAN = 'https://sepolia.etherscan.io/tx';

export const DISPUTE_RUN: DemoRun = {
  id: 'dispute',
  title: 'Broken service',
  blurb: 'The response is well-formed JSON that quietly violates the SLA.',
  paymentId: '0xc79c411d326b9088fa8e0279fbd06ad604d4b04afb85fa595d194c0b96790991',
  slaHash: '0x21c219b43622b6a61dd6ed3062f6cece65a8506e1ca237d2a3c802195cdbb055',
  outcome: {
    label: 'Rejected',
    buyer: '+0.11 ℏ',
    seller: '0 ℏ',
    tone: 'refund',
  },
  closing:
    'The seller never received the money. The disputed response was evaluated inside a confidential workflow, and the payload never went on-chain.',
  steps: [
    {
      n: '01',
      title: 'Request',
      detail: 'Agent asks the quote service for HBAR-USD',
      status: 'ok',
      hold: 900,
    },
    {
      n: '02',
      title: 'Terms',
      detail: '402 Payment Required · 0.1 ℏ',
      lines: ['SLA hash checked against the published document', '5 clauses agreed before any money moves'],
      status: 'ok',
      hold: 1500,
    },
    {
      n: '03',
      title: 'Payment',
      detail: '0.1 ℏ settled into the Recourse escrow',
      lines: ['payTo is the escrow, not the seller'],
      status: 'ok',
      hold: 1400,
      tx: { label: '0.0.7162784@1788624601', href: `${HASHSCAN}/1788624601.728920938` },
    },
    {
      n: '04',
      title: 'Bind',
      detail: 'Deposit bound on-chain to those exact terms',
      status: 'ok',
      hold: 1200,
      tx: { label: 'bind · 0xf319ce9e…', href: '#' },
    },
    {
      n: '05',
      title: 'Delivery',
      detail: '{"pair":"HBAR-USD","bid":-1,"ask":0.0524,…}',
      lines: ['Seller signs a hash of exactly what it sent'],
      status: 'ok',
      hold: 1600,
    },
    {
      n: '06',
      title: 'Verification',
      detail: 'Clause 2 violated',
      lines: ['numeric.gt at $.bid', 'expected > 0 · received -1'],
      status: 'fail',
      hold: 2400,
    },
    {
      n: '07',
      title: 'Dispute',
      detail: 'Buyer contests, posting a 0.01 ℏ bond',
      lines: ['The bond is what makes a frivolous dispute cost something'],
      status: 'warn',
      hold: 1500,
    },
    {
      n: '08',
      title: 'Adjudication',
      detail: 'Chainlink CRE · AWS Nitro enclave',
      lines: ['Request, response and SLA stay sealed', 'Only the verdict crosses back out'],
      status: 'work',
      hold: 3000,
      enclave: true,
    },
    {
      n: '09',
      title: 'Verdict',
      detail: 'REJECT · reason 102',
      lines: ['102 is offset 100 plus clause 2 — the promise that broke'],
      status: 'fail',
      hold: 1800,
      tx: {
        label: 'Sepolia · 0x98d8c558…',
        href: `${ETHERSCAN}/0x98d8c5584c793b0b76643c5233995b2e09fc04def6cda68b6a7b31440af72ec7`,
      },
    },
    {
      n: '10',
      title: 'Settlement',
      detail: 'CCIP delivers the verdict to Hedera',
      lines: ['Took ~18 minutes in the real run, almost all Sepolia finality'],
      status: 'ok',
      hold: 2000,
    },
  ],
};

export const HONEST_RUN: DemoRun = {
  id: 'honest',
  title: 'Honest service',
  blurb: 'Every clause holds. Nothing to dispute, and no oracle involved.',
  paymentId: '0xb77fa6bf8365d99c235a2749014fabe62779ae1e748c94d622dbb44f23c5bb6a',
  slaHash: '0x83b2a584a91f4d9c317eba4fc706bab1e5d59a20d976ab968da725a96bffc98e',
  outcome: {
    label: 'Released',
    buyer: '0 ℏ',
    seller: '+0.1 ℏ',
    tone: 'release',
  },
  closing:
    'The common case, and deliberately the cheapest one. One contract call, no adjudication, no cross-chain hop.',
  steps: [
    { n: '01', title: 'Request', detail: 'Agent asks for HBAR-USD', status: 'ok', hold: 800 },
    {
      n: '02',
      title: 'Terms',
      detail: '402 Payment Required · 0.1 ℏ',
      lines: ['Same 5 clauses, agreed up front'],
      status: 'ok',
      hold: 1200,
    },
    {
      n: '03',
      title: 'Payment',
      detail: '0.1 ℏ settled into escrow',
      status: 'ok',
      hold: 1200,
      tx: { label: '0.0.7162784@1788626670', href: `${HASHSCAN}/1788626670.841803967` },
    },
    { n: '04', title: 'Bind', detail: 'Deposit bound to the terms', status: 'ok', hold: 1000 },
    {
      n: '05',
      title: 'Delivery',
      detail: '{"pair":"HBAR-USD","bid":0.0521,"ask":0.0524,…}',
      status: 'ok',
      hold: 1400,
    },
    {
      n: '06',
      title: 'Verification',
      detail: 'All 5 clauses held',
      lines: ['pair · bid · ask · spread · freshness'],
      status: 'ok',
      hold: 2000,
    },
    {
      n: '07',
      title: 'Release',
      detail: 'Window lapsed uncontested — seller withdraws',
      lines: ['No enclave. No CCIP. One call.'],
      status: 'ok',
      hold: 1800,
      tx: { label: 'release · 0x7fbd0eb1…', href: '#' },
    },
  ],
};

export const DEMO_RUNS = [DISPUTE_RUN, HONEST_RUN] as const;
