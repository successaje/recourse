'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/**
 * The mechanism, animated.
 *
 * A payment leaves the buyer, is held by the escrow, and is released to whichever
 * party the verdict names. The loop alternates outcomes deliberately: showing
 * only the refund would suggest the protocol exists to take money off sellers,
 * and the honest release is the common case.
 *
 * With reduced motion the same diagram renders static, in the held state — the
 * one frame that carries the idea if you only see one.
 */

type Phase = 'idle' | 'paying' | 'held' | 'judging' | 'settling';

const CYCLE: { phase: Phase; ms: number }[] = [
  { phase: 'paying', ms: 1500 },
  { phase: 'held', ms: 1400 },
  { phase: 'judging', ms: 1700 },
  { phase: 'settling', ms: 2200 },
];

export function FlowDiagram() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const current = CYCLE[step % CYCLE.length];
    const timer = setTimeout(() => {
      setStep((s) => {
        const next = s + 1;
        // Flip the outcome each full cycle.
        if (next % CYCLE.length === 0) setApproved((a) => !a);
        return next;
      });
    }, current?.ms ?? 1500);
    return () => clearTimeout(timer);
  }, [step, reduced]);

  const phase: Phase = reduced ? 'held' : (CYCLE[step % CYCLE.length]?.phase ?? 'idle');
  const verdictColor = approved ? 'var(--color-release)' : 'var(--color-refund)';

  return (
    <figure className="w-full">
      <svg
        viewBox="0 0 720 200"
        className="h-auto w-full"
        role="img"
        aria-label="A payment moves from the buyer into an escrow, is judged, and is released to the seller or refunded to the buyer."
      >
        <defs>
          <marker id="fd-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <polygon points="0,1 8,4 0,7" fill="var(--color-text-3)" />
          </marker>
          <filter id="fd-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* rails */}
        <line x1="132" y1="100" x2="286" y2="100" stroke="var(--color-line)" strokeWidth="1.25" markerEnd="url(#fd-arrow)" />
        <line x1="434" y1="100" x2="580" y2="100" stroke="var(--color-line)" strokeWidth="1.25" markerEnd="url(#fd-arrow)" />

        {/* buyer */}
        <Node x={16} label="Buyer agent" sub="pays" />

        {/* escrow */}
        <g>
          <motion.rect
            x={292}
            y={62}
            width={136}
            height={76}
            rx={6}
            fill="var(--color-surface-2)"
            stroke={phase === 'judging' ? 'var(--color-enclave)' : 'var(--color-brass)'}
            strokeWidth={1.5}
            animate={
              reduced
                ? {}
                : {
                    opacity: phase === 'held' || phase === 'judging' ? 1 : 0.75,
                  }
            }
            transition={{ duration: 0.5 }}
          />
          <text x={360} y={92} textAnchor="middle" className="fill-[var(--color-text)]" style={{ fontSize: 13, fontWeight: 600 }}>
            Escrow
          </text>
          <text x={360} y={110} textAnchor="middle" className="fill-[var(--color-text-3)]" style={{ fontSize: 11 }}>
            {phase === 'judging' ? 'adjudicating' : 'holds the payment'}
          </text>

          {/* the held coin */}
          <motion.circle
            cx={360}
            cy={128}
            r={5}
            fill="var(--color-brass)"
            animate={
              reduced
                ? { opacity: 1 }
                : {
                    opacity: phase === 'held' || phase === 'judging' ? 1 : 0,
                    scale: phase === 'judging' ? [1, 1.35, 1] : 1,
                  }
            }
            transition={{ duration: 1, repeat: phase === 'judging' ? Infinity : 0 }}
          />
        </g>

        {/* the travelling payment */}
        {!reduced && (
          <motion.circle
            r={6}
            fill="var(--color-brass)"
            filter="url(#fd-glow)"
            initial={false}
            animate={
              phase === 'paying'
                ? { cx: [132, 286], cy: [100, 100], opacity: [0, 1, 1] }
                : phase === 'settling'
                  ? { cx: [434, 580], cy: [100, approved ? 62 : 138], opacity: [1, 1, 0] }
                  : { opacity: 0 }
            }
            transition={{ duration: phase === 'settling' ? 1.5 : 1.2, ease: 'easeInOut' }}
          />
        )}

        {/* verdict badge */}
        <motion.g
          initial={false}
          animate={{ opacity: reduced ? 0 : phase === 'judging' || phase === 'settling' ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <rect x={306} y={22} width={108} height={26} rx={4} fill="var(--color-surface-3)" stroke={verdictColor} strokeWidth={1} />
          <text x={360} y={39} textAnchor="middle" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }} fill={verdictColor}>
            {approved ? 'APPROVE' : 'REJECT · 102'}
          </text>
        </motion.g>

        {/* outcomes */}
        <Outcome
          x={584}
          y={40}
          label="Seller paid"
          color="var(--color-release)"
          active={!reduced && phase === 'settling' && approved}
        />
        <Outcome
          x={584}
          y={116}
          label="Buyer refunded"
          color="var(--color-refund)"
          active={!reduced && phase === 'settling' && !approved}
        />
      </svg>
    </figure>
  );
}

function Node({ x, label, sub }: { x: number; label: string; sub: string }) {
  return (
    <g>
      <rect x={x} y={62} width={116} height={76} rx={6} fill="var(--color-surface-2)" stroke="var(--color-line)" strokeWidth={1.25} />
      <text x={x + 58} y={92} textAnchor="middle" className="fill-[var(--color-text)]" style={{ fontSize: 13, fontWeight: 600 }}>
        {label}
      </text>
      <text x={x + 58} y={110} textAnchor="middle" className="fill-[var(--color-text-3)]" style={{ fontSize: 11 }}>
        {sub}
      </text>
    </g>
  );
}

function Outcome({
  x,
  y,
  label,
  color,
  active,
}: {
  x: number;
  y: number;
  label: string;
  color: string;
  active: boolean;
}) {
  return (
    <motion.g animate={{ opacity: active ? 1 : 0.32 }} transition={{ duration: 0.4 }}>
      <rect x={x} y={y} width={120} height={44} rx={5} fill="var(--color-surface-2)" stroke={color} strokeWidth={1.25} />
      <text x={x + 60} y={y + 27} textAnchor="middle" style={{ fontSize: 12 }} fill={color}>
        {label}
      </text>
    </motion.g>
  );
}
