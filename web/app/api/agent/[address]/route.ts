import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { ESCROW, HEDERA_RPC } from '@/lib/constants';
import { normalizeAddress } from '@/lib/known-services';

/**
 * One buyer's record, from the escrow's point of view.
 *
 * The interesting figure for an agent operator is not how many calls it made —
 * that number is available from any log — but how much of its spend was
 * recoverable and how much it actually got back. Both are computed here from
 * settled payments rather than estimated.
 */

export const revalidate = 15;

const hedera = defineChain({
  id: ESCROW.chainId,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [HEDERA_RPC] } },
});

const client = createPublicClient({ chain: hedera, transport: http() });

interface PaymentRow {
  paymentId: Hex;
  amount?: string;
  bond?: string;
  buyer?: string;
  seller?: string;
  status: string;
  reasonCode?: number;
  paidTo?: string;
  lastSeen: number;
  events: string[];
}

export async function GET(request: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const target = normalizeAddress(address);

  if (!/^0x[0-9a-f]{40}$/.test(target)) {
    return Response.json({ error: 'not an address' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;

  try {
    const [payRes, balance] = await Promise.all([
      fetch(`${origin}/api/payments`, { next: { revalidate: 15 } }),
      client.getBalance({ address: target as Hex }).catch(() => null),
    ]);

    const { rows } = (await payRes.json()) as { rows: PaymentRow[] };
    const mine = rows.filter((r) => normalizeAddress(r.buyer) === target);

    let protectedTotal = 0n;
    let recovered = 0n;
    let spent = 0n;
    let stillHeld = 0n;
    let disputes = 0;
    let openDisputes = 0;

    for (const row of mine) {
      const amount = BigInt(row.amount ?? '0');
      const bond = BigInt(row.bond ?? '0');
      protectedTotal += amount;

      if (row.events.includes('DisputeOpened')) disputes += 1;
      if (row.status === 'Disputed') openDisputes += 1;

      if (row.status === 'Settled') {
        // Where the money went is the only reliable signal. A refund returns the
        // payment and the bond together, so both count as recovered.
        if (normalizeAddress(row.paidTo) === target) recovered += amount + bond;
        else spent += amount;
      } else {
        stillHeld += amount;
      }
    }

    return Response.json({
      address: target,
      balance: balance === null ? null : balance.toString(),
      payments: mine.length,
      disputes,
      openDisputes,
      protected: protectedTotal.toString(),
      recovered: recovered.toString(),
      spent: spent.toString(),
      stillHeld: stillHeld.toString(),
      activity: mine
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .map((r) => ({
          paymentId: r.paymentId,
          amount: r.amount ?? '0',
          bond: r.bond ?? '0',
          seller: normalizeAddress(r.seller),
          status: r.status,
          reasonCode: r.reasonCode,
          refunded: r.status === 'Settled' ? normalizeAddress(r.paidTo) === target : undefined,
          at: r.lastSeen,
        })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
