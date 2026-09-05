'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hbar, relativeTime, short } from '@/lib/format';
import { serviceFor } from '@/lib/known-services';

/**
 * The directory.
 *
 * A service appears here by having been paid through the escrow, not by being
 * added to a list — so the page cannot show anyone who has not actually taken
 * money, and there is no registration to fake.
 *
 * Rates are shown as fractions with their denominator visible rather than as
 * percentages. "1 of 2 settled in the seller's favour" is honest about the
 * sample; "50% SLA compliance" implies a population that does not exist yet.
 */

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

export function ServicesList() {
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/services');
        const body = (await res.json()) as { services: ServiceRow[]; error?: string };
        if (cancelled) return;
        if (body.error) setError(body.error);
        setServices(body.services ?? []);
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

  return (
    <div className="mx-auto max-w-5xl px-6 pt-16 pb-8">
      <p className="label">Directory</p>
      <h1 className="mt-4 text-[clamp(1.8rem,4vw,2.5rem)] leading-tight">Protected services</h1>
      <p className="text-text-2 mt-5 max-w-[62ch] text-[16px] leading-relaxed">
        Every service that has taken a payment through the escrow. There is no registry
        contract and nothing to sign up for — an address appears here because it was paid,
        which means nobody can list themselves without having done the work.
      </p>

      <Link
        href="/services/new"
        className="border-line text-text-2 hover:border-brass-dim hover:text-text mt-7 inline-block rounded border px-4 py-2.5 text-[13.5px] transition-colors"
      >
        Publish an SLA →
      </Link>

      {error && (
        <p className="border-refund/35 text-refund mt-8 rounded border p-4 text-[13.5px]">{error}</p>
      )}

      {!services && !error && (
        <div className="bg-surface/40 mt-10 h-40 w-full animate-pulse rounded-lg" />
      )}

      {services && services.length === 0 && (
        <p className="border-line text-text-3 mt-10 rounded-lg border p-8 text-[14px]">
          No service has been paid through the escrow yet.
        </p>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {services?.map((s) => {
          const known = serviceFor(s.address);
          return (
            <Link
              key={s.address}
              href={`/services/${s.address}`}
              className="border-line bg-surface/40 hover:border-brass-dim group rounded-lg border p-6 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-[16px]">{known?.name ?? 'Unnamed service'}</h2>
                <span className="mono text-text-3 text-[11.5px]">{short(s.address, 6, 4)}</span>
              </div>

              {known ? (
                <p className="text-text-2 mt-2.5 text-[13.5px] leading-relaxed">
                  {known.description}
                </p>
              ) : (
                <p className="text-text-3 mt-2.5 text-[13.5px] leading-relaxed">
                  This address has taken payments but is not named in the explorer, so only
                  its on-chain record is shown.
                </p>
              )}

              <dl className="mt-6 grid grid-cols-3 gap-4">
                <Stat label="Payments" value={String(s.payments)} />
                <Stat
                  label="Released"
                  value={`${s.released}/${s.settled}`}
                  hint="settled in the seller's favour"
                  tone={s.released === s.settled && s.settled > 0 ? 'release' : undefined}
                />
                <Stat
                  label="Refunded"
                  value={String(s.refunded)}
                  tone={s.refunded > 0 ? 'refund' : undefined}
                />
              </dl>

              <div className="border-line-soft mt-5 flex items-center justify-between border-t pt-4">
                <span className="mono text-text-3 text-[11.5px]">
                  {hbar(s.volume)} ℏ escrowed · last {relativeTime(s.lastSeen)}
                </span>
                <span className="text-brass text-[13px] transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {services && services.length > 0 && (
        <p className="text-text-3 mt-10 max-w-[62ch] text-[13px] leading-relaxed">
          Counts, not percentages. A compliance rate computed from{' '}
          {services.reduce((n, s) => n + s.payments, 0)} payments would imply a precision
          the data does not have, so the denominator stays visible.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'release' | 'refund';
}) {
  const color = tone === 'release' ? 'text-release' : tone === 'refund' ? 'text-refund' : 'text-text';
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className={`mono mt-1.5 text-[17px] ${color}`}>{value}</dd>
      {hint && <dd className="text-text-3 mt-0.5 text-[11px] leading-tight">{hint}</dd>}
    </div>
  );
}
