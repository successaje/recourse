'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { describeReason } from '@/lib/constants';
import { hbar, relativeTime, short } from '@/lib/format';
import { normalizeAddress, serviceFor } from '@/lib/known-services';
import { slaFor } from '@/lib/known-slas';
import { moneyStateOf, StateBadge } from '@/components/money-state';
import { SlaViewer } from '@/components/sla-viewer';

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
  firstSeen: number;
  lastSeen: number;
}

interface PaymentRow {
  paymentId: string;
  amount?: string;
  seller?: string;
  status: string;
  reasonCode?: number;
  paidTo?: string;
  lastSeen: number;
  events: string[];
}

const STATE_FROM_STATUS: Record<string, number> = {
  Funded: 1,
  Disputed: 2,
  Challenged: 3,
  Settled: 4,
};

export function ServiceDetail({ address }: { address: string }) {
  const target = normalizeAddress(address);
  const [service, setService] = useState<ServiceRow | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [sRes, pRes] = await Promise.all([fetch('/api/services'), fetch('/api/payments')]);
        const sBody = (await sRes.json()) as { services: ServiceRow[] };
        const pBody = (await pRes.json()) as { rows: PaymentRow[] };
        if (cancelled) return;
        setService(sBody.services?.find((s) => s.address === target) ?? null);
        setPayments((pBody.rows ?? []).filter((r) => normalizeAddress(r.seller) === target));
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    }
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [target]);

  const known = serviceFor(target);

  if (ready && !service) {
    return (
      <div className="mx-auto max-w-4xl px-6 pt-16">
        <p className="label">Service</p>
        <h1 className="mt-4 text-[clamp(1.6rem,3vw,2.2rem)]">No record</h1>
        <p className="text-text-2 mt-4 max-w-[54ch] text-[15px] leading-relaxed">
          This address has never been paid through the escrow, so there is nothing to show.
        </p>
        <p className="mono text-text-3 mt-3 text-[12.5px] break-all">{target}</p>
        <Link href="/services" className="text-brass mt-8 inline-block text-[14px]">
          ← All services
        </Link>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="mx-auto max-w-4xl px-6 pt-16">
        <div className="bg-surface/40 h-8 w-52 animate-pulse rounded" />
        <div className="bg-surface/40 mt-6 h-28 w-full animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pt-16 pb-8">
      <Link href="/services" className="text-text-3 hover:text-text text-[13.5px] transition-colors">
        ← Services
      </Link>

      <div className="mt-6">
        <p className="label">Service</p>
        <h1 className="mt-3 text-[clamp(1.8rem,4vw,2.4rem)] leading-tight">
          {known?.name ?? 'Unnamed service'}
        </h1>
        <p className="mono text-text-3 mt-3 text-[12.5px] break-all">{service.address}</p>
        {known && (
          <>
            <p className="text-text-2 mt-5 max-w-[62ch] text-[15px] leading-relaxed">
              {known.description}
            </p>
            <p className="mono text-text-3 mt-4 text-[12.5px]">
              {known.endpoint} · {hbar(known.price)} {known.asset} per request
            </p>
          </>
        )}
        {!known && (
          <p className="text-text-3 mt-5 max-w-[62ch] text-[14px] leading-relaxed">
            Not named in the explorer. Everything below is read from the escrow.
          </p>
        )}
      </div>

      <dl className="border-line mt-10 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-4">
        <Cell label="Payments" value={String(service.payments)} />
        <Cell
          label="Released"
          value={`${service.released}/${service.settled}`}
          tone={service.settled > 0 && service.released === service.settled ? 'release' : undefined}
        />
        <Cell label="Refunded" value={String(service.refunded)} tone={service.refunded > 0 ? 'refund' : undefined} />
        <Cell label="Escrowed" value={`${hbar(service.volume)} ℏ`} />
      </dl>

      <p className="text-text-3 mt-4 max-w-[62ch] text-[13px] leading-relaxed">
        {service.everDisputed} of {service.payments} payments were disputed
        {service.openDisputes > 0 && `, ${service.openDisputes} still open`}. Counts rather
        than a rate: {service.payments} payments cannot support a percentage.
      </p>

      <section className="mt-12">
        <p className="label">Recent payments</p>
        <ol className="border-line mt-4 overflow-hidden rounded-lg border">
          {payments.length === 0 && (
            <li className="text-text-3 p-5 text-[13.5px]">No payments in the indexed window.</li>
          )}
          {payments.map((p) => {
            const state = moneyStateOf({
              onChainState: STATE_FROM_STATUS[p.status] ?? 1,
              reasonCode: p.reasonCode,
              refundedToBuyer:
                p.status === 'Settled' ? normalizeAddress(p.paidTo) !== target : undefined,
            });
            return (
              <li key={p.paymentId} className="border-line-soft bg-surface/30 border-b last:border-0">
                <Link
                  href={`/payment/${p.paymentId}`}
                  className="hover:bg-surface/60 flex flex-wrap items-center justify-between gap-3 p-5 transition-colors"
                >
                  <span className="mono text-text-2 text-[12.5px]">{short(p.paymentId, 10, 6)}</span>
                  <span className="mono text-text text-[13px]">{hbar(p.amount ?? '0')} ℏ</span>
                  <StateBadge state={state} size="sm" />
                  <span className="text-text-3 text-[12px]">{relativeTime(p.lastSeen)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-12 space-y-6">
        <p className="label">
          Terms {service.slaHashes.length > 1 && `· ${service.slaHashes.length} versions`}
        </p>
        {service.slaHashes.map((hash) => (
          <SlaViewer key={hash} sla={slaFor(hash)} slaHash={hash} />
        ))}
        {service.slaHashes.length > 1 && (
          <p className="text-text-3 text-[13px] leading-relaxed">
            More than one commitment appears because the terms changed between payments.
            Each payment is judged against the version bound to it, never the current one.
          </p>
        )}
      </section>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'release' | 'refund' }) {
  const color = tone === 'release' ? 'text-release' : tone === 'refund' ? 'text-refund' : 'text-text';
  return (
    <div className="bg-surface/40 p-5">
      <dt className="label">{label}</dt>
      <dd className={`mono mt-2 text-[18px] ${color}`}>{value}</dd>
    </div>
  );
}
