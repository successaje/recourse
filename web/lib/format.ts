/** Display helpers. Hedera denominates in tinybars; the UI shows HBAR. */

const TINYBAR_PER_HBAR = 100_000_000n;

export function hbar(tinybars: bigint | string, digits = 4): string {
  const value = typeof tinybars === 'string' ? BigInt(tinybars) : tinybars;
  const whole = value / TINYBAR_PER_HBAR;
  const frac = value % TINYBAR_PER_HBAR;
  const fracStr = frac.toString().padStart(8, '0').slice(0, digits).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

/**
 * Format a weibar balance.
 *
 * Hedera reports contract and account balances over the EVM JSON-RPC in weibars
 * (18 decimals), while the escrow stores amounts in tinybars (8). Feeding one to
 * the other's formatter is off by ten orders of magnitude and still renders as a
 * plausible number, so the two conversions are kept as separate functions rather
 * than one with a decimals argument.
 */
export function hbarFromWei(weibars: bigint | string, digits = 4): string {
  const value = typeof weibars === 'string' ? BigInt(weibars) : weibars;
  const WEIBAR_PER_HBAR = 10n ** 18n;
  const whole = value / WEIBAR_PER_HBAR;
  const frac = value % WEIBAR_PER_HBAR;
  const fracStr = frac.toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

/** Middle-truncate a hash so both ends stay recognisable. */
export function short(hex: string, lead = 6, tail = 4): string {
  if (hex.length <= lead + tail + 2) return hex;
  return `${hex.slice(0, lead + 2)}…${hex.slice(-tail)}`;
}

export function relativeTime(unixSeconds: number): string {
  const delta = Math.floor(Date.now() / 1000) - unixSeconds;
  if (delta < 0) return `in ${duration(-delta)}`;
  if (delta < 45) return 'just now';
  return `${duration(delta)} ago`;
}

function duration(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}
