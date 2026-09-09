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

/**
 * Did the facilitator actually do what was asked?
 *
 * `ok` is the HTTP status and it is not the answer. The facilitator reports a
 * refused payment as **200** with `isValid: false`, and a transfer that failed
 * on-chain as **200** with `success: false` — so a caller that gates on the
 * status alone serves paid work for free. That was a live bug here: a duplicate
 * transaction came back `success: false` and the endpoint answered anyway.
 *
 * Both fields are read strictly. An unrecognised body shape counts as failure,
 * because the one thing worse than rejecting a good payment is accepting a bad
 * one.
 */
function succeeded(result: { ok: boolean; body: unknown }, field: 'isValid' | 'success'): boolean {
  if (!result.ok) return false;
  if (typeof result.body !== 'object' || result.body === null) return false;
  return (result.body as Record<string, unknown>)[field] === true;
}

export interface FacilitatorResult {
  /** HTTP-level success. Necessary, and on its own never sufficient. */
  ok: boolean;
  status: number;
  body: unknown;
  /** The facilitator's own verdict on the payment. Gate on this. */
  success: boolean;
  /** Why it refused, when it said so. */
  reason?: string;
}

function reasonFrom(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const b = body as Record<string, unknown>;
  const reason = b.errorMessage ?? b.errorReason ?? b.invalidReason;
  return typeof reason === 'string' ? reason : undefined;
}

/** Check a payment payload is well-formed and funded, without moving anything. */
export async function verify(
  paymentPayload: unknown,
  requirements: PaymentRequirements,
): Promise<FacilitatorResult> {
  const result = await post('/verify', {
    x402Version: X402_VERSION,
    paymentPayload,
    paymentRequirements: requirements,
  });
  return { ...result, success: succeeded(result, 'isValid'), reason: reasonFrom(result.body) };
}

/** Submit the transfer. Only called once verification passes. */
export async function settle(
  paymentPayload: unknown,
  requirements: PaymentRequirements,
): Promise<FacilitatorResult> {
  const result = await post('/settle', {
    x402Version: X402_VERSION,
    paymentPayload,
    paymentRequirements: requirements,
  });
  return { ...result, success: succeeded(result, 'success'), reason: reasonFrom(result.body) };
}

/** Decode the base64 `X-PAYMENT` header into a payment payload. */
export function decodePaymentHeader(header: string): unknown {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
}
