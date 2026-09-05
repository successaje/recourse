import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Reason, Verdict as SlaVerdict, type Judgement } from '@recourse/sla';
import { decodeAbiParameters, encodeAbiParameters, parseAbiParameters, type Hex } from 'viem';

import { OnChainReason, Outcome, toOnChain } from './verdict';

/**
 * These cover the seams the simulator cannot: two reason-code schemes in two
 * languages, and one payload that has to survive TypeScript → CRE report →
 * Solidity `abi.decode`. A mismatch anywhere here does not throw. It pays the
 * wrong party, or refunds someone while citing a clause that did not fail.
 *
 * The handler itself is not unit-tested. It needs a `TeeRuntime`, and the SDK's
 * test surface exports `TestTeeRuntime` without a constructor for it
 * (`newTestTEERuntime` appears only in a comment), so there is no supported way
 * to build one. The handler is exercised by `cre workflow simulate` instead.
 */

const SOLIDITY = readFileSync(
  join(import.meta.dir, '../../contracts/src/lib/Verdict.sol'),
  'utf8',
);

/** Pull `uint16 internal constant NAME = value;` out of the library. */
function solidityConstant(name: string): number {
  const match = new RegExp(`uint16 internal constant ${name} = (\\d+);`).exec(SOLIDITY);
  if (!match?.[1]) throw new Error(`${name} not found in Verdict.sol`);
  return Number(match[1]);
}

function judgement(reasonCode: number, verdict = SlaVerdict.REJECT): Judgement {
  return { verdict, reasonCode, detail: 'test' };
}

describe('solidity agreement', () => {
  test('every on-chain reason matches the Solidity constant', () => {
    expect(OnChainReason.OK).toBe(solidityConstant('REASON_OK'));
    expect(OnChainReason.RECEIPT_MISMATCH).toBe(solidityConstant('REASON_RECEIPT_MISMATCH'));
    expect(OnChainReason.MALFORMED_BODY).toBe(solidityConstant('REASON_MALFORMED_BODY'));
    expect(OnChainReason.CONTENT_TYPE).toBe(solidityConstant('REASON_CONTENT_TYPE'));
    expect(OnChainReason.MISSING_FIELD).toBe(solidityConstant('REASON_MISSING_FIELD'));
    expect(OnChainReason.LATENCY).toBe(solidityConstant('REASON_LATENCY'));
    expect(OnChainReason.VERDICT_TIMEOUT).toBe(solidityConstant('REASON_VERDICT_TIMEOUT'));
    expect(OnChainReason.SLA_MISMATCH).toBe(solidityConstant('REASON_SLA_MISMATCH'));
    expect(OnChainReason.UNKNOWN_OPERATOR).toBe(solidityConstant('REASON_UNKNOWN_OPERATOR'));
    expect(OnChainReason.ASSERTION_OFFSET).toBe(solidityConstant('ASSERTION_OFFSET'));
  });

  test('the outcome enum matches the Solidity ordering', () => {
    // `None` must stay 0 and unused: a zero-filled payload has to be rejected by
    // `Verdict.decode`, not silently read as a valid ruling.
    const enumBody = /enum Outcome \{([^}]+)\}/.exec(SOLIDITY)?.[1] ?? '';
    // Strip comments before splitting: the trailing notes contain commas.
    const members = enumBody
      .replace(/\/\/[^\n]*/g, '')
      .split(',')
      .map((line) => line.trim())
      .filter(Boolean);

    expect(members).toEqual(['None', 'Approve', 'Reject']);
    expect(Outcome.None).toBe(0);
    expect(Outcome.Approve).toBe(1);
    expect(Outcome.Reject).toBe(2);
  });
});

describe('reason mapping', () => {
  test('an approval maps to Approve/OK', () => {
    const mapped = toOnChain(judgement(Reason.NONE, SlaVerdict.APPROVE));
    expect(mapped).toEqual({ outcome: Outcome.Approve, reasonCode: OnChainReason.OK });
  });

  test('every structural reason has an on-chain counterpart', () => {
    // Reason.NONE is the approval case; the rest must all map somewhere real.
    const structural = Object.entries(Reason).filter(([name]) => name !== 'NONE');

    for (const [name, code] of structural) {
      const mapped = toOnChain(judgement(code));
      expect(mapped.outcome).toBe(Outcome.Reject);
      // Must not fall through to the assertion-index branch, which would produce
      // a nonsense clause number like 1102 for a malformed body.
      expect(mapped.reasonCode, `${name} fell through to the assertion branch`).toBeLessThan(
        OnChainReason.ASSERTION_OFFSET,
      );
      expect(mapped.reasonCode).toBeGreaterThan(0);
    }
  });

  test('a failed clause keeps its index, shifted by the offset', () => {
    expect(toOnChain(judgement(1)).reasonCode).toBe(101);
    expect(toOnChain(judgement(2)).reasonCode).toBe(102);
    expect(toOnChain(judgement(999)).reasonCode).toBe(1099);
  });

  test('clause codes never collide with structural codes', () => {
    const structural = new Set(
      Object.values(Reason).map((code) => toOnChain(judgement(code)).reasonCode),
    );
    for (let clause = 1; clause <= 999; clause++) {
      expect(structural.has(toOnChain(judgement(clause)).reasonCode)).toBe(false);
    }
  });

  test('every mapped code fits in the uint16 the escrow emits', () => {
    const codes = [
      ...Object.values(Reason).map((c) => toOnChain(judgement(c)).reasonCode),
      toOnChain(judgement(999)).reasonCode,
    ];
    for (const code of codes) {
      expect(code).toBeGreaterThanOrEqual(0);
      expect(code).toBeLessThanOrEqual(65535);
    }
  });
});

describe('report payload', () => {
  const PAYMENT_ID = '0xc79c411d326b9088fa8e0279fbd06ad604d4b04afb85fa595d194c0b96790991' as Hex;

  /** Exactly what the workflow sends; `Verdict.decode` does the mirror of this. */
  function encode(outcome: number, reasonCode: number): Hex {
    return encodeAbiParameters(
      parseAbiParameters('bytes32 paymentId, uint8 outcome, uint16 reasonCode'),
      [PAYMENT_ID, outcome, reasonCode],
    );
  }

  test('round-trips through the layout Solidity decodes', () => {
    const encoded = encode(Outcome.Reject, 102);
    const [paymentId, outcome, reasonCode] = decodeAbiParameters(
      parseAbiParameters('bytes32, uint8, uint16'),
      encoded,
    );

    expect(paymentId).toBe(PAYMENT_ID);
    expect(outcome).toBe(Outcome.Reject);
    expect(reasonCode).toBe(102);
  });

  test('is three 32-byte words, matching abi.encode in the library', () => {
    // Verdict.encode uses abi.encode, not encodePacked, so every field is padded
    // to a full word. Packing instead would shift the payload and decode garbage.
    expect(encode(Outcome.Approve, 0).length).toBe(2 + 64 * 3);
  });

  test('the real verdict from the live run encodes to the bytes CCIP carried', () => {
    // Taken from VerdictForwarded on Sepolia tx 0x98d8c558…2ec7.
    const encoded = encode(Outcome.Reject, 102);
    expect(encoded.slice(2, 66)).toBe(PAYMENT_ID.slice(2));
    expect(BigInt(`0x${encoded.slice(66, 130)}`)).toBe(2n);
    expect(BigInt(`0x${encoded.slice(130, 194)}`)).toBe(102n);
  });
});
