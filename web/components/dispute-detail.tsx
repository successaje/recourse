'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { describeReason, ESCROW } from '@/lib/constants';
import { hbar, relativeTime, short } from '@/lib/format';
import { slaFor } from '@/lib/known-slas';
import { SlaViewer } from '@/components/sla-viewer';

/**
 * A dispute, presented as a case file rather than a transaction.
 *
 * The distinction matters. A payment page answers "where is my money"; this one
 * answers "why was this decided, and on what evidence". So it leads with the
 * claim and the exhibits, and it is careful to show that the thing being argued
 * about was never published — the sealed payload is the point, not a caveat.
 */

interface DisputeData {
  paymentId: string;
  buyer: string;
  seller: string;
  amount: string;
  bond: string;
  slaHash: string;
  responseHash: string;
  state: number;
  reasonCode?: number;
  refundedToBuyer?: boolean;
  events: { name: string; timestamp: number; reasonCode?: number }[];
  error?: string;
}

export function DisputeDetail({ paymentId }: { paymentId: string }) {
  const [data, setData] = useState<DisputeData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/payment/${paymentId}`);
        const body = (await res.json()) as DisputeData;
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
      <div className="mx-auto max-w-4xl px-6 pt-16">
        <p className="label">Dispute</p>
        <h1 className="mt-4 text-[clamp(1.6rem,3vw,2.2rem)]">Not found</h1>
        <p className="text-text-2 mt-4 text-[15px]">
          {error === 'unknown payment' ? 'The escrow has no record of this payment.' : error}
        </p>
        <Link href="/explorer" className="text-brass mt-8 inline-block text-[14px]">
          ← Back to the explorer
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-6 pt-16">
        <div className="bg-surface/40 h-8 w-44 animate-pulse rounded" />
        <div className="bg-surface/40 mt-6 h-28 w-full animate-pulse rounded" />
      </div>
    );
  }

  const disputed = data.events.find((e) => e.name === 'DisputeOpened');

  if (!disputed) {
    return (
      <div className="mx-auto max-w-4xl px-6 pt-16">
        <p className="label">Dispute</p>
        <h1 className="mt-4 text-[clamp(1.6rem,3vw,2.2rem)]">Never contested</h1>
        <p className="text-text-2 mt-4 max-w-[54ch] text-[15px] leading-relaxed">
          This payment was not disputed, so there is no case file. Most payments end this
          way — the window lapses and the seller withdraws.
        </p>
        <Link href={`/payment/${data.paymentId}`} className="text-brass mt-8 inline-block text-[14px]">
          View the payment →
        </Link>
      </div>
    );
  }

  const sla = slaFor(data.slaHash);
  const reason = data.reasonCode === undefined ? null : describeReason(data.reasonCode);
  const settled = data.state === 4;
  const buyerWon = data.refundedToBuyer === true;
  const clause = reason?.clause ?? null;

  const total = BigInt(data.amount) + BigInt(data.bond);
  const buyerGets = settled ? (buyerWon ? total : 0n) : null;
  const sellerGets = settled ? (buyerWon ? 0n : total) : null;

  const tone = !settled ? 'text-brass' : buyerWon ? 'text-refund' : 'text-release';

  // Phrased from the claim's point of view, not the response's. The page is
  // titled "Dispute", so a bare "Rejected" reads as "the dispute was rejected"
  // — the exact opposite of what a buyer refund means. Naming the subject
  // removes the ambiguity in the one place a reader cannot afford it.
  const heading = !settled
    ? 'Under adjudication'
    : buyerWon
      ? 'Claim upheld'
      : 'Claim dismissed';

  return (
    <div className="mx-auto max-w-4xl px-6 pt-16 pb-8">
      <Link href="/explorer" className="text-text-3 hover:text-text text-[13.5px] transition-colors">
        ← Explorer
      </Link>

      <div className="mt-6">
        <p className="label">Dispute</p>
        <h1 className={`mt-3 text-[clamp(2rem,5vw,2.8rem)] leading-none ${tone}`}>{heading}</h1>
        <p className="mono text-text-3 mt-4 text-[12.5px] break-all">{data.paymentId}</p>
      </div>

      {/* who got what */}
      <dl className="border-line mt-10 grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2">
        <div className="bg-surface/40 p-6">
          <dt className="label">Buyer</dt>
          <dd className={`mono mt-2 text-[22px] ${buyerWon ? 'text-refund' : 'text-text-3'}`}>
            {buyerGets === null ? 'pending' : `${buyerGets === 0n ? '' : '+'}${hbar(buyerGets)} ℏ`}
          </dd>
          <dd className="text-text-3 mt-1.5 text-[12.5px]">
            {buyerWon ? 'payment and bond returned' : settled ? 'bond forfeited' : 'bond posted'}
          </dd>
        </div>
        <div className="bg-surface/40 p-6">
          <dt className="label">Seller</dt>
          <dd className={`mono mt-2 text-[22px] ${!buyerWon && settled ? 'text-release' : 'text-text-3'}`}>
            {sellerGets === null ? 'pending' : `${sellerGets === 0n ? '' : '+'}${hbar(sellerGets)} ℏ`}
          </dd>
          <dd className="text-text-3 mt-1.5 text-[12.5px]">
            {settled ? (buyerWon ? 'received nothing' : 'payment and bond') : 'awaiting verdict'}
          </dd>
        </div>
      </dl>

      {/* the claim */}
      <section className="mt-12">
        <p className="label">The claim</p>
        <div className="border-line bg-surface/40 mt-4 rounded-lg border p-6">
          <p className="text-text text-[16px] leading-relaxed">
            {clause !== null
              ? `Clause ${clause} of the agreed SLA was violated.`
              : reason
                ? reason.label
                : 'The response did not honour the agreed SLA.'}
          </p>
          {reason?.detail && (
            <p className="text-text-2 mt-2.5 text-[14px] leading-relaxed">{reason.detail}</p>
          )}
          <p className="text-text-3 mt-4 text-[13px] leading-relaxed">
            Filed {relativeTime(disputed.timestamp)} with a {hbar(data.bond)} ℏ bond. The bond is
            what makes a frivolous dispute cost something: it returns only if the claim
            holds up.
          </p>
        </div>
      </section>

      {/* exhibits */}
      <section className="mt-12">
        <p className="label">Evidence</p>
        <div className="border-line mt-4 overflow-hidden rounded-lg border">
          <Exhibit
            label="Seller signature"
            note="Recovered to the seller's key on-chain before the dispute was accepted"
            value="verified"
          />
          <Exhibit label="Payment id" note="Bound to these terms on Hedera" value={short(data.paymentId, 10, 8)} />
          <Exhibit
            label="Response hash"
            note="The body supplied by the buyer had to hash to exactly this"
            value={short(data.responseHash, 10, 8)}
          />
          <Exhibit
            label="SLA commitment"
            note="Checked against the terms quoted in the 402"
            value={short(data.slaHash, 10, 8)}
          />

          <div className="border-enclave/30 bg-enclave/5 border-t p-5">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-enclave text-[14px]">🔒 Response payload withheld</p>
              <span className="mono text-text-3 text-[12px]">not published</span>
            </div>
            <p className="text-text-3 mt-2 text-[12.5px] leading-relaxed">
              The disputed body was read inside the enclave and never went on-chain. That is
              the whole reason adjudication happens in a TEE: publishing a private response
              to settle a small argument costs more than the argument is worth.
            </p>
          </div>
        </div>

        <p className="text-text-3 mt-4 max-w-[64ch] text-[13px] leading-relaxed">
          The seller fixed the hash by signing it; the buyer supplied the bytes. Neither can
          move without the other, so neither could have fabricated this record.
        </p>
      </section>

      {/* the finding */}
      {reason && (
        <section className="mt-12">
          <p className="label">Finding</p>
          <div className={`mt-4 rounded-lg border p-6 ${buyerWon ? 'border-refund/35' : 'border-release/35'}`}>
            <p className={`mono text-[13px] ${tone}`}>
              {buyerWon ? 'REJECT' : 'APPROVE'} · reason {data.reasonCode}
            </p>
            <p className="text-text-2 mt-3 max-w-[62ch] text-[14px] leading-relaxed">
              {clause !== null
                ? `Reason ${data.reasonCode} is offset 100 plus clause ${clause} — the code names the promise that broke, so the refund is not a judgement call.`
                : reason.detail}
            </p>
          </div>
        </section>
      )}

      <section className="mt-12">
        <SlaViewer sla={sla} slaHash={data.slaHash} reasonCode={data.reasonCode} />
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={`/payment/${data.paymentId}`}
          className="border-line text-text-2 hover:border-brass-dim hover:text-text rounded border px-4 py-2 text-[13.5px] transition-colors"
        >
          Full payment timeline
        </Link>
        <a
          href={ESCROW.explorer}
          target="_blank"
          rel="noreferrer"
          className="text-text-3 hover:text-text rounded px-4 py-2 text-[13.5px] transition-colors"
        >
          Verify on-chain ↗
        </a>
      </div>
    </div>
  );
}

function Exhibit({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="border-line-soft bg-surface/40 border-b p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-text text-[14px]">{label}</p>
        <span className="mono text-release text-[12px]">✓ {value}</span>
      </div>
      <p className="text-text-3 mt-1.5 text-[12.5px] leading-relaxed">{note}</p>
    </div>
  );
}
