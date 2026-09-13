/**
 * Deployment constants and service configuration.
 *
 * Addresses are the live testnet deployments recorded in contracts/DEPLOYMENTS.md.
 */

/** RecourseEscrow on Hedera testnet, as an EVM address. */
export const ESCROW_EVM_ADDRESS = '0x7E7A73e5bE1F45D9B3033C2a96087B62855e00bB' as const;

/**
 * The same contract as a Hedera account id.
 *
 * x402 settlement on Hedera addresses accounts this way, not by EVM address, so
 * this is what goes in `payTo`.
 */
export const ESCROW_ACCOUNT_ID = '0.0.10380390' as const;

/** Hedera testnet EVM chain id, used in the receipt digest's domain separator. */
export const HEDERA_CHAIN_ID = 296;

/** Blocky402, the x402 facilitator that verifies and settles payments. */
export const FACILITATOR_URL = 'https://api.testnet.blocky402.com';

/** CAIP-2 network id Blocky402 expects for Hedera testnet. */
export const X402_NETWORK = 'hedera:testnet';

/** HBAR. An HTS token id would go here for a stablecoin-denominated service. */
export const X402_ASSET = '0.0.0';

/** Blocky402's fee payer on Hedera testnet, from its `/supported` response. */
export const X402_FEE_PAYER = '0.0.7162784';

export const X402_VERSION = 2;

/** How long a signed payment payload stays valid. */
export const PAYMENT_TIMEOUT_SECONDS = 300;

function env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  sellerPort: Number(env('SELLER_PORT', '8402')),
  indexPort: Number(env('INDEX_PORT', '8403')),
  /** Where the enclave reaches the dispute index. Must be reachable from the workflow. */
  indexBaseUrl: env('INDEX_BASE_URL', 'http://localhost:8403'),
  /**
   * Key the seller signs receipts with.
   *
   * Separate from the deployer key on purpose: the escrow recovers this address
   * from the receipt signature and pays it on release, so it is the seller's
   * identity, not an operator credential.
   */
  sellerPrivateKey: process.env['SELLER_PRIVATE_KEY'],
  /**
   * Hedera account the gateway's own fees are paid to.
   *
   * Deliberately not the escrow: escrow deposits are earmarked for a delivery
   * and become bindable by whoever calls `bind` next.
   */
  gatewayPayTo: env('GATEWAY_PAYTO', '0.0.4426240'),
} as const;

/**
 * Accept a private key with or without the `0x` prefix.
 *
 * Keys get copied between a CRE `.env`, a shell export and a command line, and
 * they do not all agree on the prefix. Without this, a 64-character key reaches
 * viem and fails deep inside @noble/curves with "expected ui8a of size 32, got
 * string", which says nothing about what is actually wrong. Normalising here
 * costs nothing and turns a stack trace into a sentence.
 */
export function normalizePrivateKey(raw: string | undefined, name: string): `0x${string}` {
  const key = raw?.trim();
  if (!key) throw new Error(`${name} is not set`);

  const hex = key.startsWith('0x') ? key.slice(2) : key;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      `${name} is not a 32-byte hex key (got ${hex.length} hex characters). ` +
        'It should be 64 hex characters, with or without a 0x prefix.',
    );
  }
  return `0x${hex}`;
}
