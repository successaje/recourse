/**
 * Assertion operators.
 *
 * Each one is a pure predicate over a resolved value and a literal operand.
 * No clock, no network, no randomness, no shared state — the enclave runs these
 * under DON consensus, so a single non-deterministic branch here would surface
 * as an unexplained consensus failure rather than a clean rejection.
 */

import type { Assertion, OperatorName } from './types.js';

/** Upper bound on a subject string fed to a regular expression. */
export const MAX_REGEX_SUBJECT = 8192;

/** Upper bound on a regex source, to keep pattern compilation trivially cheap. */
export const MAX_REGEX_SOURCE = 512;

export class OperatorError extends Error {}

function asNumber(value: unknown): number | null {
  // Deliberately strict. A numeric string is not a number: silently coercing
  // "12" would let a seller ship the wrong type and still pass.
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numericOperand(assertion: Assertion): number {
  const operand = asNumber(assertion.value);
  if (operand === null) {
    throw new OperatorError(`${assertion.op} needs a finite numeric "value"`);
  }
  return operand;
}

function stringOperand(assertion: Assertion): string {
  const operand = asString(assertion.value);
  if (operand === null) {
    throw new OperatorError(`${assertion.op} needs a string "value"`);
  }
  return operand;
}

/**
 * Compile a pattern, anchored at both ends.
 *
 * Anchoring is not cosmetic: an unanchored `^[A-Z]+-[A-Z]+$`-style intent would
 * otherwise pass on any string that merely contains a match, which is nearly
 * always the opposite of what the seller meant to promise.
 */
function compile(source: string): RegExp {
  if (source.length > MAX_REGEX_SOURCE) {
    throw new OperatorError(`pattern exceeds ${MAX_REGEX_SOURCE} characters`);
  }
  const anchored = source.startsWith('^') && source.endsWith('$') ? source : `^(?:${source})$`;
  try {
    return new RegExp(anchored, 'u');
  } catch (error) {
    throw new OperatorError(`invalid pattern: ${(error as Error).message}`);
  }
}

type Predicate = (value: unknown, assertion: Assertion, evaluatedAt: number) => boolean;

const OPERATORS: Record<OperatorName, Predicate> = {
  exists: (value) => value !== undefined,

  'numeric.gt': (value, assertion) => {
    const subject = asNumber(value);
    return subject !== null && subject > numericOperand(assertion);
  },

  'numeric.gte': (value, assertion) => {
    const subject = asNumber(value);
    return subject !== null && subject >= numericOperand(assertion);
  },

  'numeric.lt': (value, assertion) => {
    const subject = asNumber(value);
    return subject !== null && subject < numericOperand(assertion);
  },

  'numeric.lte': (value, assertion) => {
    const subject = asNumber(value);
    return subject !== null && subject <= numericOperand(assertion);
  },

  'numeric.eq': (value, assertion) => {
    const subject = asNumber(value);
    return subject !== null && subject === numericOperand(assertion);
  },

  'string.eq': (value, assertion) => asString(value) === stringOperand(assertion),

  'string.matches': (value, assertion) => {
    const subject = asString(value);
    if (subject === null || subject.length > MAX_REGEX_SUBJECT) return false;
    return compile(stringOperand(assertion)).test(subject);
  },

  'string.minLength': (value, assertion) => {
    const subject = asString(value);
    return subject !== null && subject.length >= numericOperand(assertion);
  },

  'array.minLength': (value, assertion) =>
    Array.isArray(value) && value.length >= numericOperand(assertion),

  /**
   * Age check against a caller-supplied instant.
   *
   * The subject is a unix timestamp in seconds. `evaluatedAt` comes from the
   * evidence bundle (the block timestamp of the dispute), never from the clock.
   * A timestamp in the future fails: it is not evidence of freshness, it is
   * evidence of a broken or dishonest clock.
   */
  'freshness.maxAgeSec': (value, assertion, evaluatedAt) => {
    const asOf = asNumber(value);
    if (asOf === null) return false;
    const age = evaluatedAt - asOf;
    return age >= 0 && age <= numericOperand(assertion);
  },
};

export function isOperator(name: string): name is OperatorName {
  return Object.prototype.hasOwnProperty.call(OPERATORS, name);
}

/** Run one assertion. Throws `OperatorError` if the SLA itself is malformed. */
export function evaluateAssertion(value: unknown, assertion: Assertion, evaluatedAt: number): boolean {
  const predicate = OPERATORS[assertion.op];
  if (predicate === undefined) {
    throw new OperatorError(`unknown operator: ${assertion.op}`);
  }
  return predicate(value, assertion, evaluatedAt);
}

export const OPERATOR_NAMES = Object.keys(OPERATORS) as OperatorName[];
