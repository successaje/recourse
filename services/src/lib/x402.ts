/**
 * Minimal x402 facilitator client (Blocky402 on Hedera testnet).
 *
 * The facilitator verifies a signed payment payload and submits the transfer, so
 * the seller never needs chain connectivity or its own settlement logic.
 */

import {
  ESCROW_ACCOUNT_ID,
  FACILITATOR_URL,
  PAYMENT_TIMEOUT_SECONDS,
  X402_ASSET,
  X402_FEE_PAYER,
  X402_NETWORK,
  X402_VERSION,
} from './config.js';

export interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { feePayer: string };
}

/**
 * What a service demands for one call.
 *
 * `payTo` defaults to the escrow rather than the seller, and that single
 * substitution is the whole protocol: the money settles somewhere neither party
 * can unilaterally take it from, and everything downstream is about deciding who
 * gets it.
 *
 * Pass an explicit `payTo` for a service selling something *other* than an
 * escrowed delivery — the gateway's own adjudication endpoint, for instance.
 * Directing ordinary revenue at the escrow would deposit it as unbound balance,
 * which the next caller to `bind` could claim against their own payment.
 */
export function paymentRequirements(amount: string, payTo: string = ESCROW_ACCOUNT_ID): PaymentRequirements {
  return {
    scheme: 'exact',
    network: X402_NETWORK,
    amount,
    payTo,
    maxTimeoutSeconds: PAYMENT_TIMEOUT_SECONDS,
    asset: X402_ASSET,
    extra: { feePayer: X402_FEE_PAYER },
  };
}

interface FacilitatorResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function post(path: string, payload: unknown): Promise<FacilitatorResult> {
  const response = await fetch(`${FACILITATOR_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => null);
  }

  return { ok: response.ok, status: response.status, body };
}

/** Check a payment payload is well-formed and funded, without moving anything. */
export function verify(paymentPayload: unknown, requirements: PaymentRequirements) {
  return post('/verify', { x402Version: X402_VERSION, paymentPayload, paymentRequirements: requirements });
}

/** Submit the transfer. Only called once verification passes. */
export function settle(paymentPayload: unknown, requirements: PaymentRequirements) {
  return post('/settle', { x402Version: X402_VERSION, paymentPayload, paymentRequirements: requirements });
}

/** Decode the base64 `X-PAYMENT` header into a payment payload. */
export function decodePaymentHeader(header: string): unknown {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
}
