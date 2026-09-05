import { canonicalHash, type SlaDocument } from '@recourse/sla';

/**
 * SLA documents this explorer can render.
 *
 * The escrow commits only a hash, which is the right thing for a contract to
 * store and useless for showing a person what was promised. So the site keeps
 * the documents whose hash it recognises and renders those; anything else shows
 * the commitment and says plainly that the terms were not published here.
 *
 * Inventing clauses for an unknown hash would be worse than showing nothing.
 */

/** The quote service's terms, before freshness moved off the clock. */
const QUOTE_V1: SlaDocument = {
  version: '1.0',
  title: 'HBAR-USD spot quote',
  price: { asset: 'HBAR', amount: '10000000', network: 'hedera:testnet' },
  latency: { maxMs: 2000 },
  response: {
    contentType: 'application/json',
    required: ['pair', 'bid', 'ask', 'asOf'],
    assertions: [
      { op: 'string.matches', path: '$.pair', value: '[A-Z]+-[A-Z]+', note: 'well-formed pair' },
      { op: 'numeric.gt', path: '$.bid', value: 0, note: 'bid is positive' },
      { op: 'numeric.gt', path: '$.ask', value: 0, note: 'ask is positive' },
      { op: 'numeric.lte', path: '$.spreadBps', value: 50, note: 'spread within 50bps' },
      { op: 'freshness.maxAgeSec', path: '$.asOf', value: 30, note: 'quote at most 30s old' },
    ],
  },
};

/** Current terms: freshness is measured from two fields inside the signed body. */
const QUOTE_V2: SlaDocument = {
  version: '1.0',
  title: 'HBAR-USD spot quote',
  price: { asset: 'HBAR', amount: '10000000', network: 'hedera:testnet' },
  latency: { maxMs: 2000 },
  response: {
    contentType: 'application/json',
    required: ['pair', 'bid', 'ask', 'asOf', 'servedAt'],
    assertions: [
      { op: 'string.matches', path: '$.pair', value: '[A-Z]+-[A-Z]+', note: 'well-formed pair' },
      { op: 'numeric.gt', path: '$.bid', value: 0, note: 'bid is positive' },
      { op: 'numeric.gt', path: '$.ask', value: 0, note: 'ask is positive' },
      { op: 'numeric.lte', path: '$.spreadBps', value: 50, note: 'spread within 50bps' },
      {
        op: 'freshness.servedWithin',
        path: '$.asOf',
        otherPath: '$.servedAt',
        value: 30,
        note: 'quote at most 30s old when served',
      },
    ],
  },
};

/** Keyed by the hash the escrow actually committed, computed the same way. */
export const KNOWN_SLAS: Record<string, SlaDocument> = {
  [canonicalHash(QUOTE_V1).toLowerCase()]: QUOTE_V1,
  [canonicalHash(QUOTE_V2).toLowerCase()]: QUOTE_V2,
};

export function slaFor(hash: string | undefined): SlaDocument | null {
  if (!hash) return null;
  return KNOWN_SLAS[hash.toLowerCase()] ?? null;
}
