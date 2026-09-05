import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { ESCROW, HEDERA_RPC, MIRROR_NODE } from '@/lib/constants';

/**
 * One payment: its current state from the contract, and its history from events.
 *
 * The contract is the source of truth for state; the mirror node supplies the
 * ordering and timestamps that a struct read cannot. Neither is trusted more
 * than the other — where they disagree the contract wins, because it is what
 * actually governs the money.
 */

export const revalidate = 10;

const hedera = defineChain({
  id: ESCROW.chainId,
  name: 'Hedera Testnet',
  nativeCurrency: { name: 'HBAR', symbol: 'HBAR', decimals: 18 },
  rpcUrls: { default: { http: [HEDERA_RPC] } },
});

const client = createPublicClient({ chain: hedera, transport: http() });

const ABI = [
  {
    type: 'function',
    name: 'getPayment',
    stateMutability: 'view',
    inputs: [{ name: 'paymentId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'buyer', type: 'address' },
          { name: 'seller', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'bond', type: 'uint256' },
          { name: 'slaHash', type: 'bytes32' },
          { name: 'responseHash', type: 'bytes32' },
          { name: 'deadline', type: 'uint64' },
          { name: 'wasChallenged', type: 'bool' },
          { name: 'state', type: 'uint8' },
        ],
      },
    ],
  },
] as const;

const EVENT_NAMES: Record<string, string> = {};
for (const [name, sig] of Object.entries({
  Bound: 'Bound(bytes32,address,address,uint256,bytes32,uint64)',
  DisputeOpened: 'DisputeOpened(bytes32,bytes32,bytes32,uint256)',
  VerdictReceived: 'VerdictReceived(bytes32,uint8,uint16,bytes32)',
  Settled: 'Settled(bytes32,address,uint256,uint16)',
  ReceiptChallengeOpened: 'ReceiptChallengeOpened(bytes32,uint64)',
  DeliveryProven: 'DeliveryProven(bytes32,bytes32,uint64)',
  DisputeTimedOut: 'DisputeTimedOut(bytes32,uint64)',
})) {
  const { toEventSelector } = await import('viem');
  EVENT_NAMES[toEventSelector(sig as `${string}(${string})`)] = name;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!/^0x[0-9a-fA-F]{64}$/.test(id)) {
    return Response.json({ error: 'not a payment id' }, { status: 400 });
  }

  try {
    const payment = (await client.readContract({
      address: ESCROW.address as Hex,
      abi: ABI,
      functionName: 'getPayment',
      args: [id as Hex],
    })) as unknown as {
      buyer: Hex;
      seller: Hex;
      amount: bigint;
      bond: bigint;
      slaHash: Hex;
      responseHash: Hex;
      deadline: bigint;
      wasChallenged: boolean;
      state: number;
    };

    if (payment.state === 0) {
      return Response.json({ error: 'unknown payment' }, { status: 404 });
    }

    // Events give the story; the struct only gives the ending.
    let events: { name: string; timestamp: number; reasonCode?: number; paidTo?: string }[] = [];
    try {
      const res = await fetch(
        `${MIRROR_NODE}/api/v1/contracts/${ESCROW.accountId}/results/logs?order=asc&limit=200`,
        { next: { revalidate: 10 } },
      );
      if (res.ok) {
        const body = (await res.json()) as { logs?: { topics?: string[]; data?: string; timestamp?: string }[] };
        const { decodeAbiParameters, parseAbiParameters } = await import('viem');

        events = (body.logs ?? [])
          .filter((l) => (l.topics?.[1] ?? '').toLowerCase() === id.toLowerCase())
          .map((l) => {
            const name = EVENT_NAMES[(l.topics?.[0] ?? '').toLowerCase()] ?? 'Unknown';
            const entry: { name: string; timestamp: number; reasonCode?: number; paidTo?: string } = {
              name,
              timestamp: Math.floor(Number(l.timestamp ?? '0')),
            };
            try {
              if (name === 'Settled') {
                const [, reason] = decodeAbiParameters(parseAbiParameters('uint256, uint16'), (l.data ?? '0x') as Hex);
                entry.reasonCode = Number(reason);
                entry.paidTo = l.topics?.[2];
              }
              if (name === 'VerdictReceived') {
                const [, reason] = decodeAbiParameters(
                  parseAbiParameters('uint8, uint16, bytes32'),
                  (l.data ?? '0x') as Hex,
                );
                entry.reasonCode = Number(reason);
              }
            } catch {
              // Keep the event even if its data will not decode; dropping it
              // would leave a hole in the timeline with no explanation.
            }
            return entry;
          });
      }
    } catch {
      // The timeline degrades to "state only" rather than failing the page.
    }

    const settled = events.find((e) => e.name === 'Settled');
    const paidTo = settled?.paidTo;
    const refundedToBuyer =
      paidTo && payment.buyer ? paidTo.toLowerCase().endsWith(payment.buyer.slice(2).toLowerCase()) : undefined;

    return Response.json({
      paymentId: id,
      buyer: payment.buyer,
      seller: payment.seller,
      amount: payment.amount.toString(),
      bond: payment.bond.toString(),
      slaHash: payment.slaHash,
      responseHash: payment.responseHash,
      deadline: Number(payment.deadline),
      wasChallenged: payment.wasChallenged,
      state: payment.state,
      reasonCode: settled?.reasonCode ?? events.find((e) => e.name === 'VerdictReceived')?.reasonCode,
      refundedToBuyer,
      events,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
