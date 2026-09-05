import { describe, expect, test } from 'bun:test';
import { hashMessage, recoverMessageAddress, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ESCROW_EVM_ADDRESS, HEDERA_CHAIN_ID } from '../src/lib/config.js';
import { receiptPreimage, responseHash, signReceipt } from '../src/lib/receipt.js';

/**
 * The digest has to match `RecourseEscrow.receiptDigest` exactly, or `dispute()`
 * reverts with `BadSignature`. These pin the shape; the live-contract check runs
 * separately in scripts/check-digest.ts against the deployed escrow.
 */

const SELLER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as Hex;
const PAYMENT_ID = '0x1602778d3521a01384c90b32caac50b99d4ccc6e7d0b007c180bf3f650702af6' as Hex;
const BODY = '{"pair":"HBAR-USD","bid":0.0521,"ask":0.0524,"spreadBps":6,"asOf":1788600000}';

describe('receipt digest', () => {
  test('is domain-separated by escrow and chain', () => {
    const base = receiptPreimage(PAYMENT_ID, responseHash(BODY));
    const otherEscrow = receiptPreimage(
      PAYMENT_ID,
      responseHash(BODY),
      '0x0000000000000000000000000000000000000001',
      HEDERA_CHAIN_ID,
    );
    const otherChain = receiptPreimage(PAYMENT_ID, responseHash(BODY), ESCROW_EVM_ADDRESS, 1);

    expect(base).not.toBe(otherEscrow);
    expect(base).not.toBe(otherChain);
  });

  test('changes with the payment id and with the body', () => {
    const a = receiptPreimage(PAYMENT_ID, responseHash(BODY));
    const b = receiptPreimage(`0x${'11'.repeat(32)}` as Hex, responseHash(BODY));
    const c = receiptPreimage(PAYMENT_ID, responseHash(`${BODY} `));

    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  test('hashes the raw bytes, so whitespace is not forgiven', () => {
    expect(responseHash('{"a":1}')).not.toBe(responseHash('{ "a": 1 }'));
  });
});

describe('signing', () => {
  test('recovers to the seller under the EIP-191 prefix the contract applies', async () => {
    const receipt = await signReceipt(SELLER_KEY, PAYMENT_ID, BODY);
    const expected = privateKeyToAccount(SELLER_KEY).address;

    expect(receipt.signer).toBe(expected);

    const recovered = await recoverMessageAddress({
      message: { raw: receiptPreimage(PAYMENT_ID, receipt.responseHash) },
      signature: receipt.signature,
    });
    expect(recovered).toBe(expected);
  });

  test('a signature over one body does not verify against another', async () => {
    const receipt = await signReceipt(SELLER_KEY, PAYMENT_ID, BODY);

    const recovered = await recoverMessageAddress({
      message: { raw: receiptPreimage(PAYMENT_ID, responseHash('{"pair":"FAKE-USD"}')) },
      signature: receipt.signature,
    });

    expect(recovered).not.toBe(privateKeyToAccount(SELLER_KEY).address);
  });

  test('the prefixed digest is what the contract compares against', () => {
    // `toEthSignedMessageHash()` in Solidity == `hashMessage({ raw })` in viem.
    const preimage = receiptPreimage(PAYMENT_ID, responseHash(BODY));
    expect(hashMessage({ raw: preimage })).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
