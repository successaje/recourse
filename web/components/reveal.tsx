'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Entrance animation.
 *
 * Two modes, and the distinction matters. Content above the fold animates on
 * mount; anything that waits on a scroll observer is invisible until that
 * observer fires, and it may never fire — a hidden tab, a prerendered
 * screenshot, an assistive tool that does not scroll. Hero copy that depends on
 * IntersectionObserver is a blank page in all of those cases.
 *
 * Below the fold, `whileInView` is the right call and the risk does not apply,
 * because the reader has to scroll there to see it at all.
 *
 * The movement is deliberately small: 12px and a fade. Anything larger turns a
 * page of dense technical content into something that lurches while you read.
 */
export function Reveal({
  children,
  delay = 0,
  onMount = false,
}: {
  children: React.ReactNode;
  delay?: number;
  /** Animate immediately instead of waiting to be scrolled into view. */
  onMount?: boolean;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;

  const transition = { duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] as const };

  if (onMount) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={transition}>
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.05 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
