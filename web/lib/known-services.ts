import type { Hex } from 'viem';

/**
 * Services this explorer can name.
 *
 * The escrow records a seller address and nothing else — no name, no endpoint,
 * no description. Anything friendlier has to come from somewhere off-chain, so
 * it comes from here, and a seller not listed shows as its address rather than
 * as a guess.
 *
 * There is exactly one entry because exactly one service has taken payments.
 * A directory padded with plausible-looking competitors would be the one
 * fabricated thing on a site whose whole argument is that its numbers are real.
 */
export interface KnownService {
  name: string;
  endpoint: string;
  description: string;
  /** Price as quoted in the 402, in tinybar. */
  price: string;
  asset: string;
}

export const KNOWN_SERVICES: Record<string, KnownService> = {
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': {
    name: 'HBAR-USD spot quote',
    endpoint: 'http://localhost:8402/quote',
    description:
      'A price feed for the demo. It signs a receipt over every response and can be asked to break any one of its own clauses on demand, which is what makes the dispute path testable.',
    price: '10000000',
    asset: 'HBAR',
  },
};

/** Topics arrive left-padded to 32 bytes; normalise before looking anything up. */
export function normalizeAddress(value: string | undefined): string {
  if (!value) return '';
  const hex = value.toLowerCase().replace(/^0x/, '');
  return `0x${hex.slice(-40)}`;
}

export function serviceFor(address: string | undefined): KnownService | null {
  return KNOWN_SERVICES[normalizeAddress(address)] ?? null;
}

export function isKnownService(address: string | undefined): address is Hex {
  return serviceFor(address) !== null;
}
