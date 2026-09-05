import { decodeAbiParameters, parseAbiParameters, toEventSelector, type Hex } from 'viem';
import { MIRROR_NODE, ESCROW } from '@/lib/constants';

/**
 * Recent escrow activity, assembled from events.
 *
 * Read server-side for two reasons: the mirror node stays out of the browser's
 * CORS story, and the response can be shaped into something the UI renders
 * directly instead of shipping raw logs and decoding them on every client.
 */

export const revalidate = 15;

const EVENTS = {
  Bound: 'Bound(bytes32,address,address,uint256,bytes32,uint64)',
  DisputeOpened: 'DisputeOpened(bytes32,bytes32,bytes32,uint256)',
  VerdictReceived: 'VerdictReceived(bytes32,uint8,uint16,bytes32)',
  Settled: 'Settled(bytes32,address,uint256,uint16)',
  ReceiptChallengeOpened: 'ReceiptChallengeOpened(bytes32,uint64)',
  DisputeTimedOut: 'DisputeTimedOut(bytes32,uint64)',
} as const;

type EventName = keyof typeof EVENTS;

const SELECTORS = new Map<string, EventName>(
  (Object.entries(EVENTS) as [EventName, string][]).map(([name, sig]) => [
    toEventSelector(sig as `${string}(${string})`),
    name,
  ]),
);

export interface TimelineEntry {
  event: EventName;
  paymentId: Hex;
  timestamp: number;
  amount?: string;
  bond?: string;
  reasonCode?: number;
  outcome?: number;
  paidTo?: Hex;
  seller?: Hex;
  buyer?: Hex;
  slaHash?: Hex;
}

export interface PaymentRow {
  paymentId: Hex;
  amount?: string;
  bond?: string;
  buyer?: Hex;
  seller?: Hex;
  /** Last event seen, which is what determines the displayed state. */
  status: 'Funded' | 'Disputed' | 'Challenged' | 'Settled';
  reasonCode?: number;
  paidTo?: Hex;
  slaHash?: Hex;
  firstSeen: number;
  lastSeen: number;
  events: EventName[];
}

interface MirrorLog {
  topics?: string[];
  data?: string;
  timestamp?: string;
}

function decodeLog(log: MirrorLog): TimelineEntry | null {
  const topics = log.topics ?? [];
  const topic0 = topics[0];
  if (!topic0) return null;

  const event = SELECTORS.get(topic0.toLowerCase());
  if (!event) return null;

  const paymentId = topics[1] as Hex | undefined;
  if (!paymentId) return null;

  const timestamp = Math.floor(Number(log.timestamp ?? '0'));
  const data = (log.data ?? '0x') as Hex;
  const entry: TimelineEntry = { event, paymentId, timestamp };

  try {
    switch (event) {
      case 'Bound': {
        const [amount, slaHash, deadline] = decodeAbiParameters(
          parseAbiParameters('uint256, bytes32, uint64'),
          data,
        );
        entry.amount = amount.toString();
        entry.slaHash = slaHash;
        void deadline;
        entry.buyer = topics[2] as Hex;
        entry.seller = topics[3] as Hex;
        break;
      }
      case 'DisputeOpened': {
        const [, bond] = decodeAbiParameters(parseAbiParameters('bytes32, uint256'), data);
        entry.bond = bond.toString();
        break;
      }
      case 'VerdictReceived': {
        const [outcome, reasonCode] = decodeAbiParameters(
          parseAbiParameters('uint8, uint16, bytes32'),
          data,
        );
        entry.outcome = Number(outcome);
        entry.reasonCode = Number(reasonCode);
        break;
      }
      case 'Settled': {
        const [amount, reasonCode] = decodeAbiParameters(
          parseAbiParameters('uint256, uint16'),
          data,
        );
        entry.amount = amount.toString();
        entry.reasonCode = Number(reasonCode);
        entry.paidTo = topics[2] as Hex;
        break;
      }
      default:
        break;
    }
  } catch {
    // A log we cannot decode is still worth showing as an event; dropping the
    // whole entry would make the timeline lie by omission.
  }

  return entry;
}

/** Fold events into one row per payment, newest first. */
function toRows(entries: TimelineEntry[]): PaymentRow[] {
  const rows = new Map<string, PaymentRow>();

  // Oldest first, so later events overwrite earlier state.
  for (const entry of [...entries].sort((a, b) => a.timestamp - b.timestamp)) {
    const key = entry.paymentId.toLowerCase();
    const row: PaymentRow = rows.get(key) ?? {
      paymentId: entry.paymentId,
      status: 'Funded',
      firstSeen: entry.timestamp,
      lastSeen: entry.timestamp,
      events: [],
    };

    row.lastSeen = entry.timestamp;
    row.events.push(entry.event);
    if (entry.amount && entry.event === 'Bound') row.amount = entry.amount;
    if (entry.bond) row.bond = entry.bond;
    if (entry.buyer) row.buyer = entry.buyer;
    if (entry.seller) row.seller = entry.seller;
    if (entry.slaHash) row.slaHash = entry.slaHash;
    if (entry.reasonCode !== undefined) row.reasonCode = entry.reasonCode;
    if (entry.paidTo) row.paidTo = entry.paidTo;

    if (entry.event === 'Bound') row.status = 'Funded';
    if (entry.event === 'DisputeOpened') row.status = 'Disputed';
    if (entry.event === 'ReceiptChallengeOpened') row.status = 'Challenged';
    if (entry.event === 'Settled') row.status = 'Settled';

    rows.set(key, row);
  }

  return [...rows.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function GET() {
  try {
    const response = await fetch(
      `${MIRROR_NODE}/api/v1/contracts/${ESCROW.accountId}/results/logs?order=desc&limit=100`,
      { next: { revalidate: 15 } },
    );

    if (!response.ok) {
      return Response.json(
        { error: `mirror node returned ${response.status}`, rows: [] },
        { status: 502 },
      );
    }

    const body = (await response.json()) as { logs?: MirrorLog[] };
    const entries = (body.logs ?? [])
      .map(decodeLog)
      .filter((e): e is TimelineEntry => e !== null);

    return Response.json({ rows: toRows(entries), events: entries.length });
  } catch (error) {
    return Response.json(
      { error: (error as Error).message, rows: [] },
      { status: 502 },
    );
  }
}
