'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Reveal } from '@/components/reveal';

/**
 * The section where a cold visitor understands the product.
 *
 * It is a before/after, so the two flows are drawn to the same grid and differ
 * in exactly one visible way: where the money sits after PAY. Everything else
 * is held constant on purpose — the argument is that Recourse adds one step,
 * not that it replaces x402.
 *
 * The failure examples are the seller's real `misbehave` modes rather than
 * invented ones. Each is a response the adjudicator actually catches, which is
 * a stronger claim than a list of things that could theoretically go wrong.
 */

interface Node {
  label: string;
  sub?: string;
  tone?: 'muted' | 'brass' | 'release' | 'refund' | 'dead';
}

const X402_FLOW: Node[] = [
  { label: 'Request', sub: 'agent calls the API' },
  { label: '402', sub: 'price quoted' },
  { label: 'Pay', sub: 'money leaves the agent', tone: 'refund' },
  { label: 'Response', sub: 'whatever comes back' },
  { label: 'No recourse', sub: 'the money is already gone', tone: 'dead' },
];

const RECOURSE_FLOW: Node[] = [
  { label: 'Request', sub: 'agent calls the API' },
  { label: '402', sub: 'price + SLA hash', tone: 'muted' },
  { label: 'Pay', sub: 'into escrow, not the seller', tone: 'brass' },
  { label: 'Deliver', sub: 'response + signed receipt' },
  { label: 'Verify', sub: 'checked against the SLA', tone: 'muted' },
];

const FAILURES = [
  { mode: 'negative', label: 'Wrong value', body: '"bid": -1', caught: 'clause 2 · $.bid > 0' },
  { mode: 'spread', label: 'Out of tolerance', body: '"spreadBps": 900', caught: 'clause 4 · ≤ 50' },
  { mode: 'stale', label: 'Stale data', body: '"asOf": 40s ago', caught: 'clause 5 · freshness' },
  { mode: 'missing', label: 'Missing field', body: 'no "ask"', caught: 'required field' },
  { mode: 'malformed', label: 'Not even JSON', body: '<html>…', caught: 'malformed body' },
  { mode: 'wrong-type', label: 'Wrong type', body: '"bid": "cheap"', caught: 'clause 2 · not numeric' },
];

const TONE: Record<NonNullable<Node['tone']> | 'default', string> = {
  default: 'border-line bg-surface/40 text-text',
  muted: 'border-line bg-surface/40 text-text',
  brass: 'border-brass/45 bg-brass/5 text-brass',
  release: 'border-release/40 bg-release/5 text-release',
  refund: 'border-refund/40 bg-refund/5 text-refund',
  dead: 'border-line-soft bg-transparent text-text-3 border-dashed',
};

export function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="rule mb-16" />

      <Reveal>
        <p className="label">The missing step</p>
        <h2 className="mt-4 max-w-[20ch] text-[clamp(1.7rem,3vw,2.3rem)] leading-tight">
          Autonomous payments have a missing step
        </h2>
        <p className="text-text-2 mt-5 max-w-[58ch] text-[16px] leading-relaxed">
          x402 is a clean way for an agent to pay for an HTTP request. It works, and it
          has one hole: the money moves before anyone has looked at what came back.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-8 lg:grid-cols-2">
        <Reveal delay={0.05}>
          <Flow
            title="x402 today"
            nodes={X402_FLOW}
            footnote="Settlement is final the moment it happens. There is no step that asks whether the response was worth paying for."
          />
        </Reveal>

        <Reveal delay={0.12}>
          <Flow
            title="With Recourse"
            nodes={RECOURSE_FLOW}
            branch
            footnote="One extra step, and the money waits behind it. Everything else — the header, the facilitator, the seller's code — is unchanged."
          />
        </Reveal>
      </div>

      <Reveal delay={0.05}>
        <div className="mt-20">
          <h3 className="text-[clamp(1.3rem,2.4vw,1.7rem)] leading-tight">
            What happens when the response is wrong?
          </h3>
          <p className="text-text-2 mt-4 max-w-[58ch] text-[15.5px] leading-relaxed">
            A human notices and stops buying. An agent making a thousand calls an hour
            does not notice, has no refund path, and keeps paying until somebody reads a
            log. These are the six the demo service can produce on demand — every one is
            caught by a clause the seller published in advance.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FAILURES.map((f, i) => (
              <motion.li
                key={f.mode}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                className="border-line bg-surface/40 hover:border-refund/40 rounded-lg border p-5 transition-colors"
              >
                <p className="text-refund text-[13.5px]">✕ {f.label}</p>
                <p className="mono text-text mt-2.5 text-[13px] break-all">{f.body}</p>
                <p className="mono text-text-3 mt-3 text-[11.5px]">caught by {f.caught}</p>
              </motion.li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

function Flow({
  title,
  nodes,
  branch,
  footnote,
}: {
  title: string;
  nodes: Node[];
  branch?: boolean;
  footnote: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div className="border-line bg-ink/40 flex h-full flex-col rounded-lg border p-7">
      <p className="label">{title}</p>

      <ol className="mt-6 flex-1">
        {nodes.map((n, i) => (
          <li key={n.label}>
            <div className={`rounded border px-4 py-3 ${TONE[n.tone ?? 'default']}`}>
              <p className="text-[14px] leading-snug">{n.label}</p>
              {n.sub && <p className="mt-0.5 text-[12.5px] opacity-70">{n.sub}</p>}
            </div>

            {i < nodes.length - 1 && <Connector reduced={!!reduced} />}
          </li>
        ))}
      </ol>

      {branch && (
        <div className="mt-0">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center">
              <Connector reduced={!!reduced} short />
              <div className={`w-full rounded border px-4 py-3 text-center ${TONE.release}`}>
                <p className="text-[14px]">Release</p>
                <p className="mt-0.5 text-[12.5px] opacity-70">clauses held</p>
              </div>
            </div>
            <div className="flex flex-col items-center">
              <Connector reduced={!!reduced} short />
              <div className={`w-full rounded border px-4 py-3 text-center ${TONE.refund}`}>
                <p className="text-[14px]">Refund</p>
                <p className="mt-0.5 text-[12.5px] opacity-70">a clause broke</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-text-3 mt-7 text-[13px] leading-relaxed">{footnote}</p>
    </div>
  );
}

/** A short vertical rule that draws itself in as the section arrives. */
function Connector({ reduced, short }: { reduced: boolean; short?: boolean }) {
  return (
    <div className={`flex justify-center ${short ? 'h-4' : 'h-5'}`}>
      <motion.span
        className="bg-line block w-px origin-top"
        initial={{ scaleY: reduced ? 1 : 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{ height: '100%' }}
      />
    </div>
  );
}
