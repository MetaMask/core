import { BigNumber } from 'bignumber.js';

import type { UpdatePositionTPSLParams } from '../types/index.js';

/**
 * Reject a protection mutation whose caller-owned position no longer matches.
 *
 * @param expected - Optional immutable caller precondition.
 * @param actual - Authoritative current position, if any.
 */
export function assertExpectedPosition(
  expected: UpdatePositionTPSLParams['expectedPosition'],
  actual: { size: string; entryPrice: string } | undefined,
): void {
  if (expected === undefined) {
    return;
  }
  const decimal = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/u;
  if (
    !actual ||
    ![expected.size, expected.entryPrice, actual.size, actual.entryPrice].every(
      (value) => typeof value === 'string' && decimal.test(value),
    ) ||
    !new BigNumber(expected.size).isFinite() ||
    new BigNumber(expected.size).isZero() ||
    !new BigNumber(expected.entryPrice).isFinite() ||
    !new BigNumber(expected.entryPrice).isPositive() ||
    new BigNumber(expected.entryPrice).isZero() ||
    !new BigNumber(expected.size).eq(actual.size) ||
    !new BigNumber(expected.entryPrice).eq(actual.entryPrice)
  ) {
    throw new Error(
      'TP/SL expected position changed or is invalid; refresh before retrying',
    );
  }
}
