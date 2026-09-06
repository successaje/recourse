'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { describeReason } from '@/lib/constants';
import { hbar, hbarFromWei, relativeTime, short } from '@/lib/format';
import { serviceFor } from '@/lib/known-services';
import { moneyStateOf, StateBadge } from '@/components/money-state';

/**
 * What an agent operator actually wants to know.
 *
 * Not the call count — any log has that. The two figures that matter are how
 * much of the spend was recoverable at all, and how much came back. An agent
 * running unprotected has a recoverable balance of zero by construction, and
 * that is the comparison the page is built around.
 *
 * Every number is derived from settled escrow payments. Nothing is projected.
 */

interface Activity {
  paymentId: string;
  amount: string;
  bond: string;
  seller: string;
  status: string;
  reasonCode?: number;
  refunded?: boolean;
  at: number;
}

interface AgentData {
  address: string;
  balance: string | null;
  payments: number;
  disputes: number;
  openDisputes: number;
  protected: string;
  recovered: string;
  spent: string;
  stillHeld: string;
  activity: Activity[];
  error?: string;
}

const STATE_FROM_STATUS: Record<string, number> = {
  Funded: 1,
  Disputed: 2,
  Challenged: 3,
  Settled: 4,
};

export function AgentDashboard({ address }: { address: string }) {
  const [data, setData] = useState<AgentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/agent/${address}`);
        const body = (await res.json()) as AgentData;
        if (cancelled) return;
        if (body.error) setError(body.error);
        else setData(body);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [address]);

  if (error) {
    return (
      <div className="shell">
        <p className="label">Agent</p>
        <h1 className="mt-4 text-[clamp(1.6rem,3vw,2.2rem)]">Could not load</h1>
        <p className="text-text-2 mt-4 text-[15px]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shell">
        <div className="bg-surface/40 h-8 w-40 animate-pulse rounded" />
        <div className="bg-surface/40 mt-6 h-32 w-full animate-pulse rounded" />
      </div>
    );
  }

  const recovered = BigInt(data.recovered);
  const protectedTotal = BigInt(data.protected);

  return (
    <div className="shell">
      <p className="label">Agent</p>
      <h1 className="mt-3 text-[clamp(1.8rem,4vw,2.4rem)] leading-tight">Buyer account</h1>
      <p className="mono text-text-3 mt-3 text-[12.5px] break-all">{data.address}</p>

      {/* the headline pair */}
      <div className="border-line mt-10 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2">
        <div className="bg-surface/40 p-7">
          <p className="label">Spend protected</p>
          <p className="mono text-brass mt-3 text-[30px] leading-none">{hbar(data.protected)} ℏ</p>
          <p className="text-text-3 mt-3 text-[13px] leading-relaxed">
            Every payment routed through the escrow, and therefore disputable. An agent
            paying sellers directly has none of this.
          </p>
        </div>
        <div className="bg-surface/40 p-7">
          <p className="label">Recovered</p>
          <p
            className={`mono mt-3 text-[30px] leading-none ${
              recovered > 0n ? 'text-refund' : 'text-text-3'
            }`}
          >
            {recovered > 0n ? '+' : ''}
            {hbar(data.recovered)} ℏ
          </p>
          <p className="text-text-3 mt-3 text-[13px] leading-relaxed">
            Returned after a seller broke its own SLA — the payment and the dispute bond
            together. Without Recourse this is zero by construction.
          </p>
        </div>
      </div>

      {/* the rest */}
      <dl className="border-line mt-6 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
        <Cell label="Balance" value={data.balance === null ? '—' : `${hbarFromWei(data.balance)} ℏ`} />
        <Cell label="Calls paid" value={String(data.payments)} />
        <Cell
          label="Disputed"
          value={`${data.disputes}/${data.payments}`}
          tone={data.disputes > 0 ? 'refund' : undefined}
        />
        <Cell label="Still in escrow" value={`${hbar(data.stillHeld)} ℏ`} tone="brass" />
      </dl>

      {protectedTotal > 0n && (
        <p className="text-text-3 mt-4 max-w-[64ch] text-[13px] leading-relaxed">
          {hbar(data.spent)} ℏ went to sellers who delivered, {hbar(data.recovered)} ℏ came
          back, {hbar(data.stillHeld)} ℏ is still held.
          {data.openDisputes > 0 &&
            ` ${data.openDisputes} dispute${data.openDisputes === 1 ? '' : 's'} awaiting a verdict.`}
        </p>
      )}

      <section className="mt-12">
        <p className="label">Recent activity</p>
        <ol className="border-line mt-4 overflow-hidden rounded-lg border">
          {data.activity.length === 0 && (
            <li className="text-text-3 p-5 text-[13.5px]">
              This address has not paid anything through the escrow.
            </li>
          )}
          {data.activity.map((a) => {
            const state = moneyStateOf({
              onChainState: STATE_FROM_STATUS[a.status] ?? 1,
              reasonCode: a.reasonCode,
              refundedToBuyer: a.refunded,
            });
            const service = serviceFor(a.seller);
            const reason = a.reasonCode === undefined ? null : describeReason(a.reasonCode);

            return (
              <li key={a.paymentId} className="border-line-soft bg-surface/30 border-b last:border-0">
                <Link
                  href={`/payment/${a.paymentId}`}
                  className="hover:bg-surface/60 block p-5 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-text text-[14px]">
                      {service?.name ?? short(a.seller, 6, 4)}
                    </span>
                    <span className="mono text-text-2 text-[13px]">
                      {a.refunded ? (
                        <span className="text-refund">
                          −{hbar(a.amount)} → +{hbar((BigInt(a.amount) + BigInt(a.bond)).toString())} ℏ
                        </span>
                      ) : (
                        `${hbar(a.amount)} ℏ`
                      )}
                    </span>
                    <StateBadge state={state} size="sm" />
                    <span className="text-text-3 text-[12px]">{relativeTime(a.at)}</span>
                  </div>
                  {reason?.clause && (
                    <p className="text-text-3 mono mt-2 text-[12px]">
                      refunded on clause {reason.clause}
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <p className="text-text-3 mt-8 max-w-[64ch] text-[13px] leading-relaxed">
        Read from the escrow on Hedera testnet, refreshed every 20 seconds. Balance comes
        from the account itself and includes funds that never went near Recourse.
      </p>
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brass' | 'refund';
}) {
  const color = tone === 'brass' ? 'text-brass' : tone === 'refund' ? 'text-refund' : 'text-text';
  return (
    <div className="bg-surface/40 p-5">
      <dt className="label">{label}</dt>
      <dd className={`mono mt-2 text-[17px] ${color}`}>{value}</dd>
    </div>
  );
}
