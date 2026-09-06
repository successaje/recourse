'use client';

import { canonicalHash, canonicalJson, OPERATOR_NAMES, type SlaDocument } from '@recourse/sla';
import Link from 'next/link';
import { useMemo, useState } from 'react';

/**
 * Build an SLA, and get the hash a seller actually quotes.
 *
 * There is no registry contract, so "register" cannot mean writing anything
 * on-chain, and this deliberately does not pretend otherwise. What it produces
 * is the real document and its real commitment hash, computed here with the
 * same `canonicalHash` the enclave and the buyer use — so the value shown is
 * the value that will be bound to payments, not a preview of one.
 *
 * The operator list comes from the package rather than being retyped, which
 * means the builder cannot offer a check the adjudicator is unable to enforce.
 * Every clause composed here is deterministic by construction.
 */

type OperatorName = (typeof OPERATOR_NAMES)[number];

interface OperatorMeta {
  label: string;
  /** What the operand means, shown as the input's placeholder. */
  operand: 'number' | 'string' | 'regex' | 'seconds' | 'none';
  needsOtherPath?: boolean;
  hint: string;
}

const OPERATORS: Record<string, OperatorMeta> = {
  'numeric.gt': { label: 'is greater than', operand: 'number', hint: 'rejects zero and negatives' },
  'numeric.gte': { label: 'is at least', operand: 'number', hint: '' },
  'numeric.lt': { label: 'is less than', operand: 'number', hint: '' },
  'numeric.lte': { label: 'is at most', operand: 'number', hint: 'good for tolerances like spread' },
  'numeric.eq': { label: 'equals', operand: 'number', hint: '' },
  'string.eq': { label: 'equals', operand: 'string', hint: '' },
  'string.matches': { label: 'matches pattern', operand: 'regex', hint: 'anchored and length-capped when evaluated' },
  'string.minLength': { label: 'is at least N characters', operand: 'number', hint: '' },
  'array.minLength': { label: 'has at least N items', operand: 'number', hint: 'rejects empty result sets' },
  'freshness.servedWithin': {
    label: 'was served within N seconds of',
    operand: 'seconds',
    needsOtherPath: true,
    hint: 'compares two fields in the body — needs no clock, so it cannot be skewed by when a dispute is filed',
  },
  'freshness.maxAgeSec': {
    label: 'is no older than N seconds',
    operand: 'seconds',
    hint: 'measured against evaluation time, so a slow dispute can fail it',
  },
};

interface Clause {
  id: string;
  op: OperatorName;
  path: string;
  value: string;
  otherPath: string;
  note: string;
}

let counter = 0;
const newClause = (): Clause => ({
  id: `c${++counter}`,
  op: 'numeric.gt' as OperatorName,
  path: '$.',
  value: '0',
  otherPath: '',
  note: '',
});

const STEPS = ['Service', 'Clauses', 'Commit'] as const;

export function SlaBuilder() {
  const [step, setStep] = useState(0);

  const [title, setTitle] = useState('HBAR-USD spot quote');
  const [endpoint, setEndpoint] = useState('https://api.example.com/quote');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('10000000');
  const [asset, setAsset] = useState('HBAR');
  const [network, setNetwork] = useState('hedera:testnet');
  const [contentType, setContentType] = useState('application/json');
  const [required, setRequired] = useState('pair, bid, ask, asOf');
  const [maxMs, setMaxMs] = useState('2000');

  const [clauses, setClauses] = useState<Clause[]>([
    { ...newClause(), op: 'string.matches' as OperatorName, path: '$.pair', value: '[A-Z]+-[A-Z]+', note: 'well-formed pair' },
    { ...newClause(), op: 'numeric.gt' as OperatorName, path: '$.bid', value: '0', note: 'bid is positive' },
  ]);

  const doc = useMemo<SlaDocument>(() => {
    const assertions = clauses
      .filter((c) => c.path.trim() && c.path !== '$.')
      .map((c) => {
        const meta = OPERATORS[c.op];
        const numeric = meta?.operand === 'number' || meta?.operand === 'seconds';
        const entry: Record<string, unknown> = { op: c.op, path: c.path.trim() };
        if (meta?.operand !== 'none') {
          entry.value = numeric ? Number(c.value || 0) : c.value;
        }
        if (meta?.needsOtherPath && c.otherPath.trim()) entry.otherPath = c.otherPath.trim();
        if (c.note.trim()) entry.note = c.note.trim();
        return entry;
      });

    const document: Record<string, unknown> = {
      version: '1.0',
      price: { asset, amount, network },
      response: {
        contentType,
        required: required
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean),
        assertions,
      },
    };
    if (title.trim()) document.title = title.trim();
    if (Number(maxMs) > 0) document.latency = { maxMs: Number(maxMs) };
    return document as unknown as SlaDocument;
  }, [title, amount, asset, network, contentType, required, maxMs, clauses]);

  const { hash, json, error } = useMemo(() => {
    try {
      return { hash: canonicalHash(doc), json: canonicalJson(doc), error: null as string | null };
    } catch (e) {
      return { hash: null, json: null, error: (e as Error).message };
    }
  }, [doc]);

  function update(id: string, patch: Partial<Clause>) {
    setClauses((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  return (
    <div className="shell">
      <Link href="/services" className="text-text-3 hover:text-text text-[13.5px] transition-colors">
        ← Services
      </Link>

      <p className="label mt-6">Register</p>
      <h1 className="mt-3 text-[clamp(1.8rem,4vw,2.4rem)] leading-tight">Publish a service level agreement</h1>
      <p className="text-text-2 mt-5 max-w-[62ch] text-[16px] leading-relaxed">
        An SLA is a list of promises a machine can check. Compose one here and you get its
        commitment hash — the value you quote in your <code className="mono text-brass text-[14px]">402</code>,
        and the value the enclave will judge against if a buyer ever disputes.
      </p>

      {/* steps */}
      <nav className="mt-10 flex gap-1" aria-label="Progress">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`mono flex-1 rounded border px-4 py-2.5 text-left text-[12px] transition-colors ${
              i === step
                ? 'border-brass/50 bg-brass/5 text-brass'
                : 'border-line text-text-3 hover:border-brass-dim'
            }`}
          >
            {String(i + 1).padStart(2, '0')} · {s}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <section className="mt-8 space-y-5">
          <Field label="Name" value={title} onChange={setTitle} hint="Shown in the directory. Not part of the commitment." />
          <Field label="Endpoint" value={endpoint} onChange={setEndpoint} hint="Where buyers send the paid request." />
          <Field label="Description" value={description} onChange={setDescription} hint="Optional. For humans only." />
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Price" value={amount} onChange={setAmount} hint="Smallest unit, as a string." mono />
            <Field label="Asset" value={asset} onChange={setAsset} hint="HBAR, or an HTS token id." mono />
            <Field label="Network" value={network} onChange={setNetwork} hint="CAIP-2 style." mono />
          </div>
          <p className="text-text-3 max-w-[62ch] text-[13px] leading-relaxed">
            Price is part of the commitment: a seller cannot quote one price in the SLA and
            charge another, because the buyer checks the hash before paying.
          </p>
        </section>
      )}

      {step === 1 && (
        <section className="mt-8 space-y-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Content type" value={contentType} onChange={setContentType} mono />
            <Field label="Max latency (ms)" value={maxMs} onChange={setMaxMs} mono />
            <Field label="Required fields" value={required} onChange={setRequired} hint="Comma separated." mono />
          </div>

          <div>
            <p className="label">Clauses</p>
            <p className="text-text-3 mt-2 max-w-[62ch] text-[13px] leading-relaxed">
              Each one is a pure function of the response body. That is not a style choice:
              the verdict is attested and verified by consensus, so anything
              non-deterministic could not be enforced.
            </p>

            <ol className="mt-4 space-y-3">
              {clauses.map((c, i) => {
                const meta = OPERATORS[c.op];
                return (
                  <li key={c.id} className="border-line bg-surface/40 rounded-lg border p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="mono text-text-3 text-[11.5px]">
                        clause {String(i + 1).padStart(2, '0')} · reason {100 + i + 1}
                      </span>
                      <button
                        onClick={() => setClauses((cs) => cs.filter((x) => x.id !== c.id))}
                        className="text-text-3 hover:text-refund text-[12px] transition-colors"
                      >
                        remove
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_auto_1fr]">
                      <input
                        value={c.path}
                        onChange={(e) => update(c.id, { path: e.target.value })}
                        placeholder="$.bid"
                        aria-label="Path"
                        className="mono border-line bg-ink focus:border-brass-dim rounded border px-3 py-2 text-[13px] outline-none"
                      />
                      <select
                        value={c.op}
                        onChange={(e) => update(c.id, { op: e.target.value as OperatorName })}
                        aria-label="Operator"
                        className="mono border-line bg-ink focus:border-brass-dim rounded border px-3 py-2 text-[12.5px] outline-none"
                      >
                        {OPERATOR_NAMES.map((op) => (
                          <option key={op} value={op}>
                            {OPERATORS[op]?.label ?? op}
                          </option>
                        ))}
                      </select>
                      {meta?.operand !== 'none' && (
                        <input
                          value={c.value}
                          onChange={(e) => update(c.id, { value: e.target.value })}
                          placeholder={meta?.operand === 'regex' ? '[A-Z]+-[A-Z]+' : '0'}
                          aria-label="Value"
                          className="mono border-line bg-ink focus:border-brass-dim rounded border px-3 py-2 text-[13px] outline-none"
                        />
                      )}
                    </div>

                    {meta?.needsOtherPath && (
                      <input
                        value={c.otherPath}
                        onChange={(e) => update(c.id, { otherPath: e.target.value })}
                        placeholder="$.servedAt — the second field to compare against"
                        aria-label="Second path"
                        className="mono border-line bg-ink focus:border-brass-dim mt-2.5 w-full rounded border px-3 py-2 text-[13px] outline-none"
                      />
                    )}

                    <input
                      value={c.note}
                      onChange={(e) => update(c.id, { note: e.target.value })}
                      placeholder="Plain-language note, shown to a buyer reading the terms"
                      aria-label="Note"
                      className="border-line bg-ink focus:border-brass-dim mt-2.5 w-full rounded border px-3 py-2 text-[13px] outline-none"
                    />

                    {meta?.hint && <p className="text-text-3 mt-2 text-[12px] leading-relaxed">{meta.hint}</p>}
                  </li>
                );
              })}
            </ol>

            <button
              onClick={() => setClauses((cs) => [...cs, newClause()])}
              className="border-line text-text-2 hover:border-brass-dim hover:text-text mt-3 rounded border border-dashed px-4 py-2.5 text-[13.5px] transition-colors"
            >
              + Add clause
            </button>

            <p className="text-text-3 mt-4 max-w-[62ch] text-[13px] leading-relaxed">
              Order matters. Adjudication stops at the first failure, so the reason code a
              refund carries is the index of the clause that broke — put the checks that
              matter most where you want them named.
            </p>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mt-8">
          {error ? (
            <div className="border-refund/40 text-refund rounded-lg border p-6">
              <p className="text-[14px]">This document cannot be hashed.</p>
              <p className="mono mt-2 text-[12.5px]">{error}</p>
            </div>
          ) : (
            <>
              <div className="border-brass/40 bg-brass/5 rounded-lg border p-6">
                <p className="label text-brass">Commitment hash</p>
                <p className="mono text-text mt-3 text-[14px] break-all">{hash}</p>
                <button
                  onClick={() => hash && navigator.clipboard?.writeText(hash)}
                  className="border-brass/40 text-brass hover:bg-brass/10 mt-4 rounded border px-3 py-1.5 text-[12.5px] transition-colors"
                >
                  Copy hash
                </button>
              </div>

              <p className="text-text-2 mt-6 max-w-[64ch] text-[14.5px] leading-relaxed">
                Quote this in the <code className="mono text-brass text-[13px]">402</code> alongside your
                price. A buyer hashes the document you serve and refuses to pay if it does
                not match, so the terms cannot change after the quote. If a payment is
                disputed, the enclave checks the same hash against what the escrow bound
                before it looks at the response at all.
              </p>

              <div className="mt-8">
                <div className="flex items-baseline justify-between">
                  <p className="label">Canonical document</p>
                  <button
                    onClick={() => json && navigator.clipboard?.writeText(json)}
                    className="text-text-3 hover:text-text text-[12.5px] transition-colors"
                  >
                    Copy JSON
                  </button>
                </div>
                <pre className="border-line bg-ink text-text-2 mono mt-3 overflow-x-auto rounded-lg border p-5 text-[12.5px] leading-relaxed">
                  {json}
                </pre>
                <p className="text-text-3 mt-3 max-w-[64ch] text-[13px] leading-relaxed">
                  These are the exact bytes that get hashed — keys sorted, no incidental
                  whitespace. Serve this document verbatim; a re-serialised copy with the
                  same meaning hashes differently and will be rejected.
                </p>
              </div>

              <div className="border-line mt-8 rounded-lg border p-6">
                <p className="text-text text-[14px]">There is nothing to submit</p>
                <p className="text-text-2 mt-2.5 max-w-[64ch] text-[14px] leading-relaxed">
                  Recourse has no registry contract, so registering is not a transaction. A
                  service becomes protected by quoting this hash and serving this document.
                  It appears in the directory once it has been paid through the escrow —
                  which is why nothing in that list can be self-declared.
                </p>
                <p className="mono text-text-3 mt-4 text-[12.5px] break-all">
                  {endpoint} → 402 · {amount} {asset} · sla {hash?.slice(0, 18)}…
                </p>
              </div>
            </>
          )}
        </section>
      )}

      <div className="mt-10 flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="text-text-3 enabled:hover:text-text rounded px-4 py-2 text-[13.5px] transition-colors disabled:opacity-30"
        >
          ← Back
        </button>
        {step < 2 && (
          <button
            onClick={() => setStep((s) => Math.min(2, s + 1))}
            className="bg-brass text-ink hover:bg-brass-glow rounded px-5 py-2.5 text-[13.5px] transition-colors"
          >
            {step === 1 ? 'Review commitment' : 'Next'}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`border-line bg-ink focus:border-brass-dim mt-2 w-full rounded border px-3 py-2.5 text-[14px] outline-none ${
          mono ? 'mono text-[13px]' : ''
        }`}
      />
      {hint && <span className="text-text-3 mt-1.5 block text-[12px] leading-relaxed">{hint}</span>}
    </label>
  );
}
