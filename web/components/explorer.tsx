'use client';

import { useRouter } from 'next/navigation';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PaymentRow } from '@/app/api/payments/route';
import { describeReason, ESCROW } from '@/lib/constants';
import { hbar, relativeTime, short } from '@/lib/format';
import { normalizeAddress, serviceFor } from '@/lib/known-services';
import { moneyStateOf, StateBadge } from '@/components/money-state';

/**
 * The explorer.
 *
 * Three views over the same events rather than three data sources: payments are
 * the raw record, disputes are the subset that was contested, and services are
 * the same rows grouped by who was paid. Keeping one fetch behind all of them
 * means the tabs can never disagree with each other, which is the usual failure
 * of a dashboard assembled from separate endpoints.
 *
 * The contract's own enum never appears. On-chain a payment reads Funded or
 * Settled, and Settled is the same word whether the seller was paid or the buyer
 * refunded — precisely the distinction someone scanning this needs.
 */

const ON_CHAIN_STATE: Record<PaymentRow['status'], number> = {
  Funded: 1,
  Disputed: 2,
  Challenged: 3,
  Settled: 4,
};

type Tab = 'payments' | 'disputes' | 'services';

interface ServiceRow {
  address: string;
  slaHashes: string[];
  payments: number;
  settled: number;
  released: number;
  refunded: number;
  openDisputes: number;
  everDisputed: number;
  volume: string;
  lastSeen: number;
}

function stateOf(row: PaymentRow) {
  const refunded =
    row.status === 'Settled' && row.paidTo && row.buyer
      ? normalizeAddress(row.paidTo) === normalizeAddress(row.buyer)
      : undefined;
  return moneyStateOf({
    onChainState: ON_CHAIN_STATE[row.status] ?? 1,
    reasonCode: row.reasonCode,
    refundedToBuyer: refunded,
  });
}

export function Explorer() {
  const [tab, setTab] = useState<Tab>('payments');
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [pRes, sRes] = await Promise.all([fetch('/api/payments'), fetch('/api/services')]);
        const pBody = (await pRes.json()) as { rows: PaymentRow[]; error?: string };
        const sBody = (await sRes.json()) as { services: ServiceRow[] };
        if (cancelled) return;
        if (pBody.error) setError(pBody.error);
        setRows(pBody.rows ?? []);
        setServices(sBody.services ?? []);
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
  }, []);

  const disputes = (rows ?? []).filter((r) => r.events.some((e) => e.name === 'DisputeOpened'));
  const activity = buildActivity(rows ?? []);

  const totals = (rows ?? []).reduce(
    (acc, r) => {
      acc.escrowed += BigInt(r.amount ?? '0');
      if (stateOf(r) === 'refunded') acc.refunded += BigInt(r.amount ?? '0') + BigInt(r.bond ?? '0');
      if (stateOf(r) === 'protected' || stateOf(r) === 'adjudicating' || stateOf(r) === 'disputed') {
        acc.held += BigInt(r.amount ?? '0');
      }
      return acc;
    },
    { escrowed: 0n, refunded: 0n, held: 0n },
  );

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'payments', label: 'Payments', count: rows?.length ?? 0 },
    { id: 'disputes', label: 'Disputes', count: disputes.length },
    { id: 'services', label: 'Services', count: services.length },
  ];

  return (
    <div className="shell">
      <p className="label">Live · Hedera testnet</p>
      <h1 className="mt-4 text-[clamp(1.8rem,4vw,2.5rem)] leading-tight">Explorer</h1>
      <p className="text-text-2 mt-4 max-w-[62ch] text-[16px] leading-relaxed">
        Payments the escrow has held, assembled from its own events. A row moves from
        protected to released or refunded as the protocol runs, and a refunded payment
        names the clause that failed rather than reporting a bare error.
      </p>

      {/* Paste a payment id, an address or an ENS name. An explorer you cannot
          look anything up in is a dashboard. */}
      <form
        className="mt-7 flex max-w-[62ch] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          if (!q) return;
          if (/^0x[0-9a-fA-F]{64}$/.test(q)) router.push(`/payment/${q}`);
          else router.push(`/agent?address=${encodeURIComponent(q)}`);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Payment id, address, or name.eth"
          aria-label="Search payments and accounts"
          className="border-line bg-surface/40 focus:border-brass-dim mono flex-1 rounded border px-3 py-2.5 text-[13px] outline-none"
        />
        <button
          type="submit"
          className="border-line text-text-2 hover:border-brass-dim hover:text-text rounded border px-4 py-2.5 text-[13.5px] transition-colors"
        >
          Look up
        </button>
      </form>

      {/* headline totals */}
      <dl className="border-line mt-8 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
        <Total label="Payments" value={String(rows?.length ?? 0)} />
        <Total label="Escrowed" value={`${hbar(totals.escrowed)} ℏ`} />
        <Total label="Still held" value={`${hbar(totals.held)} ℏ`} tone="brass" />
        <Total
          label="Refunded"
          value={`${hbar(totals.refunded)} ℏ`}
          tone={totals.refunded > 0n ? 'refund' : undefined}
        />
      </dl>

      <p className="mono text-text-3 mt-4 text-[12px] break-all">
        {ESCROW.address} · {ESCROW.accountId}
      </p>

      {/* tabs */}
      <div className="border-line mt-10 flex gap-1 border-b" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[14px] transition-colors ${
              tab === t.id
                ? 'border-brass text-text'
                : 'text-text-3 hover:text-text-2 border-transparent'
            }`}
          >
            {t.label}
            <span className="mono text-text-3 ml-2 text-[11.5px]">{t.count}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="border-refund/35 text-refund mt-6 rounded border p-4 text-[13.5px]">{error}</p>
      )}

      {!rows && !error && <div className="bg-surface/40 mt-6 h-40 animate-pulse rounded-lg" />}

      {rows && tab === 'payments' && <PaymentsTable rows={rows} />}
      {rows && tab === 'disputes' && <DisputesTable rows={disputes} />}
      {rows && tab === 'services' && <ServicesTable services={services} />}

      {/* recent activity */}
      {rows && rows.length > 0 && (
        <section className="mt-14">
          <p className="label">Recent activity</p>
          <ol className="border-line mt-4 overflow-hidden rounded-lg border">
            {activity.slice(0, 12).map((a, i) => (
              <li
                key={`${a.paymentId}-${a.event}-${i}`}
                className="border-line-soft bg-surface/30 border-b last:border-0"
              >
                <Link
                  href={`/payment/${a.paymentId}`}
                  className="hover:bg-surface/60 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3.5 transition-colors"
                >
                  <span className="text-text text-[13.5px]">{a.copy}</span>
                  <span className="mono text-text-3 text-[11.5px]">
                    {short(a.paymentId, 8, 4)} · {relativeTime(a.timestamp)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="text-text-3 mt-8 text-[12.5px]">
        Refreshes every 20 seconds. A dispute takes roughly 18 minutes to settle, almost
        all of it Sepolia finality before CCIP will commit.
      </p>
    </div>
  );
}

/** Flatten payment rows into a single reverse-chronological event feed. */
function buildActivity(rows: PaymentRow[]) {
  const COPY: Record<string, string> = {
    Bound: 'Payment protected in escrow',
    DisputeOpened: 'Buyer contested the response',
    ReceiptChallengeOpened: 'Buyer claimed no signed receipt',
    DeliveryProven: 'Seller produced the receipt',
    VerdictReceived: 'Verdict arrived from the enclave',
    DisputeTimedOut: 'Dispute timed out, buyer refunded',
    Settled: 'Funds left the escrow',
  };

  // Each event carries the consensus timestamp it happened at. Reusing the
  // payment's last-seen time for all of them made a feed that looked live and
  // was not, which is worse than showing nothing.
  return rows
    .flatMap((r) =>
      r.events.map((e) => ({
        paymentId: r.paymentId,
        event: e.name,
        copy: COPY[e.name] ?? e.name,
        timestamp: e.at,
      })),
    )
    .sort((a, b) => b.timestamp - a.timestamp);
}

function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  if (rows.length === 0) return <Empty>No payments yet.</Empty>;

  return (
    <Table head={['Payment', 'State', 'Amount', 'Bond', 'Outcome', 'Updated']}>
      {rows.map((row) => {
        const reason = row.reasonCode === undefined ? null : describeReason(row.reasonCode);
        return (
          <tr key={row.paymentId} className="border-line-soft hover:bg-surface/50 border-b transition-colors last:border-0">
            <Td>
              <Link href={`/payment/${row.paymentId}`} className="mono text-text-2 hover:text-brass text-[12.5px] transition-colors">
                {short(row.paymentId, 8, 6)}
              </Link>
            </Td>
            <Td><StateBadge state={stateOf(row)} size="sm" /></Td>
            <Td className="text-right"><span className="mono text-text text-[13px]">{row.amount ? `${hbar(row.amount)} ℏ` : '—'}</span></Td>
            <Td className="text-right"><span className="mono text-text-3 text-[13px]">{row.bond ? `${hbar(row.bond)} ℏ` : '—'}</span></Td>
            <Td>
              {reason === null ? (
                <span className="text-text-3 text-[13px]">pending</span>
              ) : (
                <span className={`text-[13px] ${reason.clause ? 'text-refund' : 'text-text-2'}`}>{reason.label}</span>
              )}
            </Td>
            <Td className="text-right"><span className="text-text-3 text-[12.5px]">{relativeTime(row.lastSeen)}</span></Td>
          </tr>
        );
      })}
    </Table>
  );
}

function DisputesTable({ rows }: { rows: PaymentRow[] }) {
  if (rows.length === 0) {
    return <Empty>No payment has been contested. That is the expected common case.</Empty>;
  }

  return (
    <Table head={['Dispute', 'Finding', 'At stake', 'Bond', 'Outcome', 'Updated']}>
      {rows.map((row) => {
        const state = stateOf(row);
        const reason = row.reasonCode === undefined ? null : describeReason(row.reasonCode);
        const settled = row.status === 'Settled';
        const total = BigInt(row.amount ?? '0') + BigInt(row.bond ?? '0');

        return (
          <tr key={row.paymentId} className="border-line-soft hover:bg-surface/50 border-b transition-colors last:border-0">
            <Td>
              <Link href={`/disputes/${row.paymentId}`} className="mono text-text-2 hover:text-brass text-[12.5px] transition-colors">
                {short(row.paymentId, 8, 6)}
              </Link>
            </Td>
            <Td>
              <span className={`text-[13px] ${!settled ? 'text-brass' : state === 'refunded' ? 'text-refund' : 'text-release'}`}>
                {!settled ? 'Under adjudication' : state === 'refunded' ? 'Claim upheld' : 'Claim dismissed'}
              </span>
            </Td>
            <Td className="text-right"><span className="mono text-text text-[13px]">{hbar(total)} ℏ</span></Td>
            <Td className="text-right"><span className="mono text-text-3 text-[13px]">{row.bond ? `${hbar(row.bond)} ℏ` : '—'}</span></Td>
            <Td>
              {reason === null ? (
                <span className="text-text-3 text-[13px]">pending</span>
              ) : (
                <span className={`text-[13px] ${reason.clause ? 'text-refund' : 'text-text-2'}`}>{reason.label}</span>
              )}
            </Td>
            <Td className="text-right"><span className="text-text-3 text-[12.5px]">{relativeTime(row.lastSeen)}</span></Td>
          </tr>
        );
      })}
    </Table>
  );
}

function ServicesTable({ services }: { services: ServiceRow[] }) {
  if (services.length === 0) return <Empty>No service has been paid through the escrow yet.</Empty>;

  return (
    <Table head={['Service', 'Payments', 'Released', 'Refunded', 'Escrowed', 'Last paid']}>
      {services.map((s) => {
        const known = serviceFor(s.address);
        return (
          <tr key={s.address} className="border-line-soft hover:bg-surface/50 border-b transition-colors last:border-0">
            <Td>
              <Link href={`/services/${s.address}`} className="text-text-2 hover:text-brass text-[13px] transition-colors">
                {known?.name ?? short(s.address, 8, 6)}
              </Link>
            </Td>
            <Td className="text-right"><span className="mono text-text text-[13px]">{s.payments}</span></Td>
            <Td className="text-right">
              <span className={`mono text-[13px] ${s.released === s.settled && s.settled > 0 ? 'text-release' : 'text-text-2'}`}>
                {s.released}/{s.settled}
              </span>
            </Td>
            <Td className="text-right">
              <span className={`mono text-[13px] ${s.refunded > 0 ? 'text-refund' : 'text-text-3'}`}>{s.refunded}</span>
            </Td>
            <Td className="text-right"><span className="mono text-text-2 text-[13px]">{hbar(s.volume)} ℏ</span></Td>
            <Td className="text-right"><span className="text-text-3 text-[12.5px]">{relativeTime(s.lastSeen)}</span></Td>
          </tr>
        );
      })}
    </Table>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="border-line mt-6 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] border-collapse">
        <thead>
          <tr className="border-line bg-surface-2/60 border-b">
            {head.map((h, i) => (
              <th
                key={h}
                className={`label px-5 py-3 font-500 ${i > 0 && i < head.length - 1 ? 'text-right' : ''} ${
                  i === head.length - 1 ? 'text-right' : ''
                } ${i === 1 ? 'text-left' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-3.5 align-middle ${className}`}>{children}</td>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-line text-text-3 mt-6 rounded-lg border p-8 text-[14px]">{children}</p>
  );
}

function Total({ label, value, tone }: { label: string; value: string; tone?: 'brass' | 'refund' }) {
  const color = tone === 'brass' ? 'text-brass' : tone === 'refund' ? 'text-refund' : 'text-text';
  return (
    <div className="bg-surface/40 p-5">
      <p className="label">{label}</p>
      <p className={`mono mt-2 text-[17px] ${color}`}>{value}</p>
    </div>
  );
}
