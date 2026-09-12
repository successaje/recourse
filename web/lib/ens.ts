import { createPublicClient, http, isAddress, type Address } from 'viem';
import { sepolia } from 'viem/chains';

/**
 * ENS naming for the addresses this site shows.
 *
 * An explorer full of `0x70997970…79C8` tells a reader nothing about who a
 * seller is. ENS turns those into names where one has been claimed, and leaves
 * the shortened address alone where it has not.
 *
 * Resolution happens on Sepolia, which is where ENS's testnet deployment lives
 * and, conveniently, where our verdict relay already is. The escrow itself is
 * on Hedera, so this is a lookup against a different chain than the one holding
 * the money: names are presentation, never authority. Nothing in the protocol
 * reads a name, and a payment is always bound to an address.
 */

const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env['SEPOLIA_RPC_URL'] ?? 'https://ethereum-sepolia-rpc.publicnode.com'),
});

/**
 * Resolved names, kept for the life of the server process.
 *
 * `null` is cached as deliberately as a hit. Most addresses will never have a
 * name, and re-asking on every render would put a reverse lookup on the
 * critical path of every page for no benefit.
 */
const cache = new Map<string, { name: string | null; at: number }>();
const TTL_MS = 10 * 60 * 1000;

function cached(key: string): string | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.name;
}

/** Reverse-resolve one address, or null when it has no primary name. */
export async function ensNameOf(address: string): Promise<string | null> {
  if (!isAddress(address)) return null;
  const key = address.toLowerCase();

  const hit = cached(key);
  if (hit !== undefined) return hit;

  try {
    const name = await client.getEnsName({ address: address as Address });
    cache.set(key, { name: name ?? null, at: Date.now() });
    return name ?? null;
  } catch {
    // A failed lookup must not fail the page. Cache the miss briefly so one
    // unreachable RPC does not turn into a lookup storm.
    cache.set(key, { name: null, at: Date.now() });
    return null;
  }
}

/** Reverse-resolve several addresses at once, de-duplicated. */
export async function ensNames(addresses: (string | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(addresses.filter((a): a is string => !!a && isAddress(a)).map((a) => a.toLowerCase()))];
  const resolved = await Promise.all(unique.map(async (a) => [a, await ensNameOf(a)] as const));

  const out: Record<string, string> = {};
  for (const [address, name] of resolved) if (name) out[address] = name;
  return out;
}

/**
 * Accept a name anywhere an address is accepted.
 *
 * Returns the address unchanged when given one, resolves a `.eth` name to its
 * address, and returns null when neither works, so a caller can tell "not found"
 * from "not a name".
 */
export async function resolveToAddress(input: string): Promise<Address | null> {
  const trimmed = input.trim();
  if (isAddress(trimmed)) return trimmed as Address;
  if (!trimmed.includes('.')) return null;

  try {
    return (await client.getEnsAddress({ name: trimmed })) ?? null;
  } catch {
    return null;
  }
}
