'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { describeReason, ESCROW } from '@/lib/constants';
import { hbar, relativeTime, short } from '@/lib/format';
import { slaFor } from '@/lib/known-slas';
import { MONEY_STATES, moneyStateOf, StateBadge } from '@/components/money-state';
import { SlaViewer } from '@/components/sla-viewer';

interface PaymentData {
  paymentId: string;
  buyer: string;
  seller: string;
  amount: string;
  bond: string;
  slaHash: string;
  responseHash: string;
  deadline: number;
  wasChallenged: boolean;
  state: number;
  reasonCode?: number;
  refundedToBuyer?: boolean;
  events: { name: string; timestamp: number; reasonCode?: number }[];
  error?: string;
}

const EVENT_COPY: Record<string, string> = {
  Bound: 'Deposit bound to the agreed terms',
  DisputeOpened: 'Buyer contested the response and posted a bond',
  ReceiptChallengeOpened: 'Buyer claimed no signed receipt was given',
  DeliveryProven: 'Seller produced the receipt',
  VerdictReceived: 'Verdict arrived from the enclave, via CCIP',
  DisputeTimedOut: 'No verdict arrived before the timeout',
  Settled: 'Funds left the escrow',
};

export function PaymentDetail({ paymentId }: { paymentId: string }) {
  const [data, setData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/payment/${paymentId}`);
        const body = (await res.json()) as PaymentData;
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
  }, [paymentId]);

  if (error) {
    return (
      <div className="shell">
        <p className="label">Payment</p>
        <h1 className="mt-4 text-[clamp(1.6rem,3vw,2.2rem)]">Not found</h1>
        <p className="text-text-2 mt-4 text-[15px]">
          {error === 'unknown payment'
            ? 'The escrow has no record of this payment.'
            : error}
        </p>
        <p className="mono text-text-3 mt-3 text-[12.5px] break-all">{paymentId}</p>
        <Link href="/explorer" className="text-brass mt-8 inline-block text-[14px]">
          ← Back to the explorer
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shell">
        <div className="bg-surface/40 h-8 w-40 animate-pulse rounded" />
        <div className="bg-surface/40 mt-6 h-24 w-full animate-pulse rounded" />
      </div>
    );
  }

  const state = moneyStateOf({
    onChainState: data.state,
    reasonCode: data.reasonCode,
    refundedToBuyer: data.refundedToBuyer,
  });
  const sla = slaFor(data.slaHash);
  const reason = data.reasonCode === undefined ? null : describeReason(data.reasonCode);
  const wentToEnclave = data.events.some((e) => e.name === 'DisputeOpened');

  return (
    <div className="shell">
      <Link href="/explorer" className="text-text-3 hover:text-text text-[13.5px] transition-colors">
        ← Explorer
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="label">Payment</p>
          <p className="mono text-text-2 mt-2 text-[13px] break-all">{data.paymentId}</p>
          <p className="font-display mt-4 text-[clamp(2rem,5vw,2.8rem)] leading-none">
            {hbar(data.amount)} <span className="text-text-3 text-[0.5em]">ℏ</span>
          </p>
        </div>
        <div className="text-right">
          <StateBadge state={state} />
          <p className="text-text-3 mt-3 max-w-[26ch] text-[12.5px] leading-relaxed">
            {MONEY_STATES[state].meaning}
          </p>
        </div>
      </div>

      {/* parties */}
      <div className="border-line mt-10 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2">
        <Party label="Buyer" address={data.buyer} note={state === 'refunded' ? 'refunded' : undefined} />
        <Party label="Seller" address={data.seller} note={state === 'released' ? 'paid' : undefined} />
      </div>

      {/* facts */}
      <dl className="border-line mt-6 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
        <Fact label="Escrowed" value={`${hbar(data.amount)} ℏ`} />
        <Fact label="Dispute bond" value={data.bond === '0' ? '—' : `${hbar(data.bond)} ℏ`} />
        <Fact
          label="Outcome"
          value={reason ? reason.label : 'pending'}
          tone={reason?.clause ? 'refund' : undefined}
        />
      </dl>

      {/* timeline */}
      <section className="mt-12">
        <p className="label">Timeline</p>
        <ol className="border-line mt-4 overflow-hidden rounded-lg border">
          {data.events.length === 0 && (
            <li className="text-text-3 p-5 text-[13.5px]">
              No events indexed yet. The contract state above is authoritative.
            </li>
          )}
          {data.events.map((e, i) => (
            <li
              key={`${e.name}-${e.timestamp}-${i}`}
              className="border-line-soft bg-surface/30 grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-4 border-b p-5 last:border-0"
            >
              <span className="text-release text-[13px]">✓</span>
              <div>
                <p className="text-text text-[14px]">{EVENT_COPY[e.name] ?? e.name}</p>
                {e.reasonCode !== undefined && (
                  <p className="text-text-3 mono mt-1 text-[12.5px]">
                    reason {e.reasonCode} · {describeReason(e.reasonCode).label}
                  </p>
                )}
              </div>
              <span className="text-text-3 text-[12px]">{relativeTime(e.timestamp)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* confidential adjudication */}
      {wentToEnclave && (
        <section className="mt-12">
          <p className="label">Adjudication</p>
          <div className="border-enclave/40 bg-enclave/5 mt-4 rounded-lg border border-dashed p-6">
            <p className="text-text text-[15px]">Chainlink CRE · AWS Nitro enclave</p>
            <p className="text-text-2 mt-2 text-[14px] leading-relaxed">
              The disputed payload was evaluated inside a confidential workflow. It never
              went on-chain and no node operator saw it.
            </p>

            <dl className="mt-5 space-y-2 text-[13px]">
              <Sealed k="Request payload" />
              <Sealed k="Response payload" />
              <Sealed k="SLA document" />
              <div className="border-line-soft flex justify-between border-t pt-2">
                <dt className="text-text-3">Verdict</dt>
                <dd className="mono text-text">
                  {reason ? `reason ${data.reasonCode}` : 'pending'}
                </dd>
              </div>
            </dl>

            <p className="text-text-3 mt-5 text-[12.5px] leading-relaxed">
              The workflow binary is public and auditable — only the data it computes over
              is sealed. Evidence integrity is checked before merit: the body must hash to
              the receipt the seller signed.
            </p>

            <p className="mono text-text-3 mt-4 text-[12px] break-all">
              response hash · {short(data.responseHash, 10, 8)}
            </p>
          </div>
        </section>
      )}

      {/* sla */}
      <section className="mt-12">
        <SlaViewer sla={sla} slaHash={data.slaHash} reasonCode={data.reasonCode} />
      </section>

      <p className="text-text-3 mt-8 text-[12.5px]">
        Read from{' '}
        <a href={ESCROW.explorer} target="_blank" rel="noreferrer" className="hover:text-brass transition-colors">
          the escrow on Hedera testnet
        </a>
        . Refreshes every 20 seconds.
      </p>
    </div>
  );
}

function Party({ label, address, note }: { label: string; address: string; note?: string }) {
  return (
    <div className="bg-surface/40 p-6">
      <p className="label">{label}</p>
      <p className="mono text-text mt-2 text-[13px] break-all">{address}</p>
      {note && <p className="text-brass mt-1.5 text-[12.5px]">{note}</p>}
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'refund' }) {
  return (
    <div className="bg-surface/40 p-6">
      <p className="label">{label}</p>
      <p className={`mono mt-2 text-[15px] ${tone === 'refund' ? 'text-refund' : 'text-text'}`}>{value}</p>
    </div>
  );
}

function Sealed({ k }: { k: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-text-3">{k}</dt>
      <dd className="text-enclave">🔒 withheld</dd>
    </div>
  );
}
