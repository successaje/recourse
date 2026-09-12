'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_RUNS, type DemoRun, type DemoStep } from '@/lib/demo-runs';
import { short } from '@/lib/format';

export function Demo() {
  const [run, setRun] = useState<DemoRun | null>(null);

  return (
    <section id="demo" className="border-line bg-surface/30 border-y">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="label">See it work</p>
        <h2 className="mt-4 max-w-[22ch] text-[clamp(1.7rem,3vw,2.3rem)] leading-tight">
          Watch a payment get protected, disputed and settled
        </h2>
        <p className="text-text-2 mt-4 max-w-[58ch] text-[16px] leading-relaxed">
          Both of these are replays of payments that actually happened on testnet. Every
          hash is on a public explorer — the pacing is theatre, the facts are not.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {DEMO_RUNS.map((r) => (
            <button
              key={r.id}
              onClick={() => setRun(r)}
              className={`group text-left ${
                r.id === 'dispute' ? 'border-refund/35 hover:border-refund/70' : 'border-line hover:border-release/50'
              } bg-ink/50 rounded-lg border p-7 transition-colors`}
            >
              <div className="flex items-baseline justify-between">
                <h3 className="text-[17px]">{r.title}</h3>
                <span className={`mono text-[11px] ${r.id === 'dispute' ? 'text-refund' : 'text-release'}`}>
                  {r.outcome.label}
                </span>
              </div>
              <p className="text-text-2 mt-2.5 text-[14px] leading-relaxed">{r.blurb}</p>
              <span
                className={`mt-6 inline-flex items-center gap-2 text-[13.5px] ${
                  r.id === 'dispute' ? 'text-refund' : 'text-text-2'
                }`}
              >
                {r.id === 'dispute' ? 'Replay the dispute' : 'Replay the honest payment'}
                <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>{run && <Player run={run} onClose={() => setRun(null)} />}</AnimatePresence>
    </section>
  );
}

/** Full-screen takeover that walks the run one step at a time. */
function Player({ run, onClose }: { run: DemoRun; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? run.steps.length : 0);
  const scroller = useRef<HTMLDivElement>(null);
  const done = shown >= run.steps.length;

  useEffect(() => {
    if (reduced || done) return;
    const step = run.steps[shown];
    const timer = setTimeout(() => setShown((s) => s + 1), step?.hold ?? 1200);
    return () => clearTimeout(timer);
  }, [shown, done, reduced, run.steps]);

  // Keep the newest step in view without yanking the whole page.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [shown, reduced]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onKey]);

  return (
    <motion.div
      className="bg-ink/96 fixed inset-0 z-[100] backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label={`${run.title} replay`}
    >
      <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="label">Replay · {run.title}</p>
            <p className="mono text-text-3 mt-2 text-[12px]">payment {short(run.paymentId, 10, 8)}</p>
          </div>
          <button
            onClick={onClose}
            className="border-line text-text-3 hover:border-brass-dim hover:text-text rounded border px-3 py-1.5 text-[12.5px] transition-colors"
          >
            Close · esc
          </button>
        </header>

        <div ref={scroller} className="mt-8 flex-1 overflow-y-auto pr-1">
          <ol className="space-y-0">
            {run.steps.slice(0, Math.max(shown, 1)).map((step, i) => (
              <Step key={step.n} step={step} active={!done && i === shown - 1} reduced={!!reduced} />
            ))}
          </ol>

          {done && <Outcome run={run} />}
        </div>
      </div>
    </motion.div>
  );
}

const STATUS_MARK: Record<DemoStep['status'], { glyph: string; className: string }> = {
  ok: { glyph: '✓', className: 'text-release' },
  warn: { glyph: '⚠', className: 'text-brass' },
  fail: { glyph: '✕', className: 'text-refund' },
  work: { glyph: '◌', className: 'text-enclave' },
};

function Step({ step, active, reduced }: { step: DemoStep; active: boolean; reduced: boolean }) {
  const mark = STATUS_MARK[step.status];

  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="border-line-soft grid grid-cols-[3rem_1fr_auto] items-start gap-4 border-b py-5 last:border-0"
    >
      <span className="mono text-text-3 pt-0.5 text-[12px]">{step.n}</span>

      <div>
        <p className="text-text text-[15px] leading-snug">{step.title}</p>
        <p className="text-text-2 mono mt-1.5 text-[12.5px] leading-relaxed break-all">{step.detail}</p>

        {step.lines?.map((line) => (
          <p key={line} className="text-text-3 mt-1 text-[12.5px] leading-relaxed">
            {line}
          </p>
        ))}

        {step.enclave && <EnclavePanel active={active} reduced={reduced} />}

        {step.tx && step.tx.href !== '#' && (
          <a
            href={step.tx.href}
            target="_blank"
            rel="noreferrer"
            className="mono text-brass hover:text-brass-glow mt-2 inline-block text-[12px] transition-colors"
          >
            {step.tx.label} ↗
          </a>
        )}
        {step.tx && step.tx.href === '#' && (
          <span className="mono text-text-3 mt-2 inline-block text-[12px]">{step.tx.label}</span>
        )}
      </div>

      <span className={`pt-0.5 text-[14px] ${mark.className} ${active && step.status === 'work' ? 'animate-pulse' : ''}`}>
        {mark.glyph}
      </span>
    </motion.li>
  );
}

/**
 * The sealed environment, shown as a locked box.
 *
 * Rendering what the enclave *cannot* see is the only way to make
 * confidentiality visible — a claim about privacy is invisible by definition.
 */
function EnclavePanel({ active, reduced }: { active: boolean; reduced: boolean }) {
  return (
    <div className="border-enclave/40 bg-enclave/5 mt-4 rounded border border-dashed p-4">
      <p className="label text-enclave">Confidential execution</p>
      <dl className="mt-3 space-y-1.5 text-[12.5px]">
        {[
          ['Request payload', '🔒'],
          ['Response payload', '🔒'],
          ['SLA document', '🔒'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-text-3">{k}</dt>
            <dd className="text-enclave">{v}</dd>
          </div>
        ))}
        <div className="border-line-soft flex justify-between border-t pt-1.5">
          <dt className="text-text-3">Verdict</dt>
          <dd className="text-text">crosses out</dd>
        </div>
      </dl>

      <div className="bg-surface-3 mt-3 h-1 overflow-hidden rounded">
        <motion.div
          className="bg-enclave h-full"
          initial={{ width: reduced ? '100%' : '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: reduced ? 0 : active ? 2.6 : 0, ease: 'linear' }}
        />
      </div>

      <p className="text-text-3 mt-2.5 text-[12px] leading-relaxed">
        The workflow binary is public and auditable. Only the data it computes over stays
        sealed.
      </p>
    </div>
  );
}

function Outcome({ run }: { run: DemoRun }) {
  const tone = run.outcome.tone === 'refund' ? 'text-refund border-refund/35' : 'text-release border-release/35';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15 }}
      className={`bg-surface/50 mt-8 rounded-lg border p-7 ${tone}`}
    >
      <p className="mono text-[12px]">{run.outcome.label}</p>

      <dl className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <dt className="label">Buyer</dt>
          <dd className="mono text-text mt-1.5 text-[20px]">{run.outcome.buyer}</dd>
        </div>
        <div>
          <dt className="label">Seller</dt>
          <dd className="mono text-text mt-1.5 text-[20px]">{run.outcome.seller}</dd>
        </div>
      </dl>

      <p className="text-text-2 mt-6 text-[14px] leading-relaxed">{run.closing}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/payment/${run.paymentId}`}
          className="bg-brass text-ink hover:bg-brass-glow rounded px-4 py-2 text-[13.5px] transition-colors"
        >
          Verify this payment live
        </Link>
        <Link
          href="/explorer"
          className="text-text-3 hover:text-text rounded px-4 py-2 text-[13.5px] transition-colors"
        >
          See all payments
        </Link>
      </div>
    </motion.div>
  );
}
