'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Scroll-triggered entrance.
 *
 * Deliberately small: 12px and a fade. Anything larger turns a page of dense
 * technical content into something that lurches while you are trying to read it.
 */
export function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
