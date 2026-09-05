'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PaymentRow } from '@/app/api/payments/route';
import { describeReason } from '@/lib/constants';
import { hbar, relativeTime, short } from '@/lib/format';
import { moneyStateOf, StateBadge } from '@/components/money-state';

/**
 * The contract's own enum is not shown here.
 *
 * On-chain a payment reads `Funded` or `Settled`, and `Settled` is the same
 * word whether the seller was paid or the buyer refunded — which is precisely
 * what a reader scanning this table needs to tell apart. Every surface uses the
 * one payer-facing vocabulary instead; see components/money-state.tsx.
 */
const ON_CHAIN_STATE: Record<PaymentRow['status'], number> = {
  Funded: 1,
  Disputed: 2,
  Challenged: 3,
  Settled: 4,
};

export function ExplorerTable() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/payments');
        const body = (await response.json()) as { rows?: PaymentRow[]; error?: string };
        if (cancelled) return;
        if (body.error) setError(body.error);
        setRows(body.rows ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }

    void load();
    // The escrow settles in minutes, not seconds; polling harder would only add
    // load to a public mirror node for no visible benefit.
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (error && !rows?.length) {
    return (
      <div className="border-line bg-surface/40 mt-10 rounded-lg border p-8">
        <p className="text-refund text-[14px]">Could not reach the mirror node.</p>
        <p className="text-text-3 mono mt-2 text-[12.5px]">{error}</p>
      </div>
    );
  }

  if (!rows) {
    return (
      <div className="mt-10 space-y-px">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-line bg-surface/30 h-[72px] animate-pulse border" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border-line bg-surface/40 mt-10 rounded-lg border p-10 text-center">
        <p className="text-text-2 text-[15px]">No payments yet.</p>
        <p className="text-text-3 mt-2 text-[13.5px]">
          Run the buyer agent against the seller and this fills in.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="border-line mt-10 overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-line bg-surface-2/60 border-b">
              <Th>Payment</Th>
              <Th>State</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Bond</Th>
              <Th>Outcome</Th>
              <Th className="text-right">Updated</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const settled = row.status === 'Settled';
              const reason = row.reasonCode === undefined ? null : describeReason(row.reasonCode);
              const refunded = settled && row.paidTo && row.buyer
                ? row.paidTo.toLowerCase() === row.buyer.toLowerCase()
                : undefined;

              return (
                <tr key={row.paymentId} className="border-line-soft hover:bg-surface/50 border-b transition-colors last:border-0">
                  <Td>
                    <Link
                      href={`/payment/${row.paymentId}`}
                      className="mono text-text-2 hover:text-brass text-[12.5px] transition-colors"
                    >
                      {short(row.paymentId, 8, 6)}
                    </Link>
                  </Td>
                  <Td>
                    <StateBadge
                      state={moneyStateOf({
                        onChainState: ON_CHAIN_STATE[row.status] ?? 1,
                        reasonCode: row.reasonCode,
                        refundedToBuyer: refunded,
                      })}
                      size="sm"
                    />
                  </Td>
                  <Td className="text-right">
                    <span className="mono text-text text-[13px]">
                      {row.amount ? `${hbar(row.amount)} ℏ` : '—'}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <span className="mono text-text-3 text-[13px]">
                      {row.bond ? `${hbar(row.bond)} ℏ` : '—'}
                    </span>
                  </Td>
                  <Td>
                    {/* Only the reason. Repeating the state here would say the
                        same thing twice in adjacent columns, and the reason is
                        the part the state cannot carry. */}
                    {reason === null ? (
                      <span className="text-text-3 text-[13px]">pending</span>
                    ) : (
                      <span className={`text-[13px] ${reason.clause ? 'text-refund' : 'text-text-2'}`}>
                        {reason.label}
                      </span>
                    )}
                  </Td>
                  <Td className="text-right">
                    <span className="text-text-3 text-[12.5px]">{relativeTime(row.lastSeen)}</span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-text-3 mt-4 text-[12.5px]">
        Refreshes every 20 seconds. A dispute takes roughly 18 minutes to settle, almost
        all of it Sepolia finality before CCIP will commit.
      </p>
    </>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`label px-4 py-3 font-500 ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-middle ${className}`}>{children}</td>;
}
