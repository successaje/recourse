/**
 * Canonical serialisation and hashing.
 *
 * The SLA hash appears in the `402` response, is committed on-chain by `bind()`,
 * and is recomputed inside the enclave. Those three have to agree exactly, so
 * the bytes cannot depend on key insertion order or on whitespace. Object keys
 * are sorted by UTF-16 code unit, which is what `Array.prototype.sort` gives us
 * without a locale in play.
 */

import { keccak256, toBytes } from 'viem';

export class CanonicalError extends Error {}

/** JSON values we accept. Anything else is a bug in the caller. */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonicalise(value: unknown, depth: number): Json {
  if (depth > 64) throw new CanonicalError('document nested too deeply');

  if (value === null) return null;

  const type = typeof value;

  if (type === 'boolean' || type === 'string') return value as boolean | string;

  if (type === 'number') {
    const n = value as number;
    // NaN and Infinity have no JSON representation, so they would serialise to
    // `null` and quietly change the hash. Reject instead.
    if (!Number.isFinite(n)) throw new CanonicalError(`non-finite number: ${String(n)}`);
    return n;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonicalise(entry, depth + 1));
  }

  if (type === 'object') {
    const record = value as Record<string, unknown>;
    const out: { [key: string]: Json } = {};
    // `undefined` members are dropped, matching JSON.stringify, so an explicit
    // `{ note: undefined }` hashes the same as omitting the key entirely.
    for (const key of Object.keys(record).sort()) {
      const member = record[key];
      if (member === undefined) continue;
      out[key] = canonicalise(member, depth + 1);
    }
    return out;
  }

  throw new CanonicalError(`unsupported value of type ${type}`);
}

/** Deterministic JSON: sorted keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value, 0));
}

/** `keccak256` over the canonical form, as a `0x`-prefixed 32-byte hex string. */
export function canonicalHash(value: unknown): `0x${string}` {
  return keccak256(toBytes(canonicalJson(value)));
}

/**
 * Hash of a response body.
 *
 * Hashes the raw bytes rather than a re-serialised object: the seller signed
 * what it actually sent, so re-encoding before hashing would break the receipt
 * over nothing more than a difference in spacing.
 */
export function bodyHash(body: string): `0x${string}` {
  return keccak256(toBytes(body));
}
