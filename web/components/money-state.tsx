/**
 * One vocabulary for what is happening to a payment.
 *
 * Every surface uses these exact five words. A payment that reads "Protected"
 * in the explorer must not read "Funded" on its own page — the state is the
 * thing a person is actually tracking, and renaming it per screen is how a UI
 * stops being trustworthy.
 *
 * The words are chosen from the payer's point of view rather than the
 * contract's. On-chain the enum says `Funded`; what the buyer cares about is
 * that their money is *protected*.
 */

export type MoneyState = 'protected' | 'released' | 'disputed' | 'adjudicating' | 'refunded';

interface Descriptor {
  label: string;
  glyph: string;
  /** Border and text. Kept as literal classes so Tailwind can see them. */
  className: string;
  meaning: string;
}

export const MONEY_STATES: Record<MoneyState, Descriptor> = {
  protected: {
    label: 'Protected',
    glyph: '🔒',
    className: 'border-brass/40 text-brass',
    meaning: 'Funds are held in escrow. Neither party can take them yet.',
  },
  released: {
    label: 'Released',
    glyph: '✓',
    className: 'border-release/40 text-release',
    meaning: 'The window lapsed uncontested and the seller was paid.',
  },
  disputed: {
    label: 'Disputed',
    glyph: '⚠',
    className: 'border-refund/40 text-refund',
    meaning: 'The buyer contested the response and posted a bond.',
  },
  adjudicating: {
    label: 'Adjudicating',
    glyph: '◌',
    className: 'border-enclave/40 text-enclave',
    meaning: 'A confidential workflow is evaluating the response against the SLA.',
  },
  refunded: {
    label: 'Refunded',
    glyph: '↩',
    className: 'border-refund/40 text-refund',
    meaning: 'The response broke the SLA. The buyer got the payment and bond back.',
  },
};

/**
 * Map the on-chain enum plus outcome onto the payer-facing state.
 *
 * `Settled` is deliberately ambiguous on-chain — it means the same thing whether
 * the seller was paid or the buyer refunded — so the reason code disambiguates.
 */
export function moneyStateOf(args: {
  onChainState: number;
  reasonCode?: number;
  refundedToBuyer?: boolean;
}): MoneyState {
  const { onChainState, reasonCode, refundedToBuyer } = args;

  switch (onChainState) {
    case 1:
      return 'protected';
    case 2:
      return 'adjudicating';
    case 3:
      return 'disputed';
    case 4:
      if (refundedToBuyer === true) return 'refunded';
      if (refundedToBuyer === false) return 'released';
      // No payee recorded: fall back to the reason code, where 0 means nothing
      // was found wrong and anything else means the seller lost.
      return reasonCode === undefined || reasonCode === 0 ? 'released' : 'refunded';
    default:
      return 'protected';
  }
}

export function StateBadge({ state, size = 'md' }: { state: MoneyState; size?: 'sm' | 'md' }) {
  const d = MONEY_STATES[state];
  const pad = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]';

  return (
    <span className={`mono inline-flex items-center gap-1.5 rounded border ${pad} ${d.className}`}>
      <span aria-hidden>{d.glyph}</span>
      {d.label}
    </span>
  );
}
