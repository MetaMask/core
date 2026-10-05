import { BigNumber } from 'bignumber.js';

import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
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
    )
  ) {
    throw new Error(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
  }
  const expectedSize = new BigNumber(expected.size);
  const expectedEntryPrice = new BigNumber(expected.entryPrice);
  if (
    !expectedSize.isFinite() ||
    expectedSize.isZero() ||
    !expectedEntryPrice.isFinite() ||
    !expectedEntryPrice.gt(0) ||
    !expectedSize.eq(actual.size) ||
    !expectedEntryPrice.eq(actual.entryPrice)
  ) {
    throw new Error(PERPS_ERROR_CODES.TPSL_UPDATE_FAILED);
  }
}
