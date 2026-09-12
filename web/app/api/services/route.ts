import type { Hex } from 'viem';
import { ensNames } from '@/lib/ens';
import { normalizeAddress } from '@/lib/known-services';

/**
 * Sellers, derived from escrow activity.
 *
 * There is no registry contract: a "service" here is simply an address that has
 * been paid through the escrow, so the directory is a view over payments rather
 * than a list anyone maintains. That keeps it impossible to appear here without
 * having actually taken money.
 *
 * Counts are returned raw and rates are not computed. Three payments cannot
 * support a compliance percentage, and rendering one would invent precision the
 * data does not have.
 */

export const revalidate = 15;

export interface ServiceRow {
  address: string;
  slaHashes: string[];
  payments: number;
  settled: number;
  released: number;
  refunded: number;
  openDisputes: number;
  everDisputed: number;
  volume: string;
  firstSeen: number;
  lastSeen: number;
}

interface PaymentRow {
  paymentId: Hex;
  amount?: string;
  buyer?: string;
  seller?: string;
  slaHash?: string;
  status: string;
  reasonCode?: number;
  paidTo?: string;
  firstSeen: number;
  lastSeen: number;
  events: { name: string; at: number }[];
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  try {
    const res = await fetch(`${origin}/api/payments`, { next: { revalidate: 15 } });
    if (!res.ok) return Response.json({ services: [], error: 'payments unavailable' });

    const { rows } = (await res.json()) as { rows: PaymentRow[] };
    const bySeller = new Map<string, ServiceRow>();

    for (const row of rows) {
      const seller = normalizeAddress(row.seller);
      if (!seller) continue;

      const entry: ServiceRow = bySeller.get(seller) ?? {
        address: seller,
        slaHashes: [],
        payments: 0,
        settled: 0,
        released: 0,
        refunded: 0,
        openDisputes: 0,
        everDisputed: 0,
        volume: '0',
        firstSeen: row.firstSeen,
        lastSeen: row.lastSeen,
      };

      entry.payments += 1;
      entry.volume = (BigInt(entry.volume) + BigInt(row.amount ?? '0')).toString();
      entry.firstSeen = Math.min(entry.firstSeen, row.firstSeen);
      entry.lastSeen = Math.max(entry.lastSeen, row.lastSeen);

      if (row.slaHash && !entry.slaHashes.includes(row.slaHash)) entry.slaHashes.push(row.slaHash);
      if (row.events.some((e) => e.name === 'DisputeOpened')) entry.everDisputed += 1;
      if (row.status === 'Disputed') entry.openDisputes += 1;

      if (row.status === 'Settled') {
        entry.settled += 1;
        // Who the money went to is the only reliable signal of who won: the
        // reason code alone cannot distinguish a clean release from a refund.
        if (normalizeAddress(row.paidTo) === seller) entry.released += 1;
        else entry.refunded += 1;
      }

      bySeller.set(seller, entry);
    }

    const services = [...bySeller.values()].sort((a, b) => b.lastSeen - a.lastSeen);
    const ens = await ensNames(services.map((x) => x.address));
    return Response.json({
      services: services.map((x) => ({ ...x, ensName: ens[x.address.toLowerCase()] ?? null })),
    });
  } catch (error) {
    return Response.json({ services: [], error: (error as Error).message }, { status: 502 });
  }
}
