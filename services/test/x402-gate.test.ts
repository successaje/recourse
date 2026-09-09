import { afterEach, describe, expect, test } from 'bun:test';
import { settle, verify } from '../src/lib/x402';

/**
 * The facilitator answers a refused payment with HTTP 200.
 *
 * That is the whole hazard. `/verify` returns 200 with `isValid: false`, and
 * `/settle` returns 200 with `success: false` when the transfer failed on
 * chain. Gating on `response.ok` therefore serves paid work for free — which is
 * what happened here: a duplicate transaction settled as `success: false` and
 * the endpoint returned a verdict anyway.
 *
 * These pin the distinction so it cannot regress into a free API.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Reply 200 with whatever body the facilitator is being made to send. */
function facilitatorReturns(body: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

const REQUIREMENTS = {
  scheme: 'exact',
  network: 'hedera:testnet',
  amount: '1000000',
  payTo: '0.0.4426240',
  maxTimeoutSeconds: 300,
  asset: '0.0.0',
} as never;

describe('settle', () => {
  test('a failed transfer returned as HTTP 200 is not a success', async () => {
    facilitatorReturns({
      success: false,
      errorReason: 'transaction_failed',
      errorMessage: 'failed precheck with status DUPLICATE_TRANSACTION',
    });

    const result = await settle({}, REQUIREMENTS);

    expect(result.ok).toBe(true); // HTTP said fine
    expect(result.success).toBe(false); // the payment did not happen
    expect(result.reason).toContain('DUPLICATE_TRANSACTION');
  });

  test('a real settlement is a success', async () => {
    facilitatorReturns({
      success: true,
      transaction: '0.0.7162784@1788927344.981253996',
      network: 'hedera:testnet',
      payer: '0.0.10378045',
    });

    const result = await settle({}, REQUIREMENTS);
    expect(result.success).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('an unrecognised body is treated as failure', async () => {
    // Rejecting a good payment is recoverable. Accepting a bad one is not.
    facilitatorReturns({ status: 'probably fine?' });
    expect((await settle({}, REQUIREMENTS)).success).toBe(false);
  });

  test('a truthy-but-not-true success does not pass', async () => {
    facilitatorReturns({ success: 'true' });
    expect((await settle({}, REQUIREMENTS)).success).toBe(false);
  });

  test('an HTTP error is a failure regardless of body', async () => {
    facilitatorReturns({ success: true }, 500);
    expect((await settle({}, REQUIREMENTS)).success).toBe(false);
  });
});

describe('verify', () => {
  test('an invalid payment returned as HTTP 200 is not valid', async () => {
    facilitatorReturns({ isValid: false, invalidReason: 'insufficient_funds' });

    const result = await verify({}, REQUIREMENTS);

    expect(result.ok).toBe(true);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('insufficient_funds');
  });

  test('a valid payment passes', async () => {
    facilitatorReturns({ isValid: true });
    expect((await verify({}, REQUIREMENTS)).success).toBe(true);
  });

  test('settle and verify read their own field, not each other', async () => {
    // `/verify` reports isValid; `/settle` reports success. Reading the wrong
    // one silently returns false forever, or worse, true forever.
    facilitatorReturns({ isValid: true });
    expect((await settle({}, REQUIREMENTS)).success).toBe(false);

    facilitatorReturns({ success: true });
    expect((await verify({}, REQUIREMENTS)).success).toBe(false);
  });
});
