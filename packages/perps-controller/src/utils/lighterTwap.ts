import { BigNumber } from 'bignumber.js';

import {
  LIGHTER_MAX_ORDER_PRICE,
  LIGHTER_MAX_BASE_AMOUNT,
  LIGHTER_MINUTE_MS,
  LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME,
} from '../constants/lighterConfig.js';

const MAX_ORDER_PRICE = new BigNumber(LIGHTER_MAX_ORDER_PRICE);
const MAX_BASE_AMOUNT = new BigNumber(LIGHTER_MAX_BASE_AMOUNT);
const MINUTE_MILLISECONDS = LIGHTER_MINUTE_MS;

/** Inputs for native TWAP wire preparation; this does not authorize dispatch. */
type LighterTwapWireIntent = {
  size: string;
  referencePrice: string;
  sizeDecimals: number;
  priceDecimals: number;
  isBuy: boolean;
  /** Fractional slippage, represented as an exact decimal. */
  slippage: string;
  durationMinutes: number;
  /** Millisecond clock reading captured by the caller, never venue seconds. */
  nowMilliseconds: number;
  randomize: boolean;
  reduceOnly: boolean;
};

type LighterTwapWireOrder = Readonly<{
  baseAmount: string;
  price: string;
  isAsk: 0 | 1;
  orderType: 6;
  timeInForce: typeof LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME;
  reduceOnly: 0 | 1;
  triggerPrice: '0';
  orderExpiry: number;
}>;

/**
 * Prepare the verified type6 CreateOrder fields without signing or dispatching.
 *
 * This primitive deliberately supplies no lifecycle or acceptance claim. Lighter
 * TWAP remains unavailable until authoritative parent fills and termination are
 * established. The uint32 price and 48-bit amount bounds come from the pinned Lighter
 * Go constants. Schedule expiry is a safe JavaScript integer within int64;
 * transaction ExpiredAt has a separate bound. Numeric narrowing is not validation.
 * No unverified venue duration minimum or maximum is imposed here.
 *
 * @param intent - Exact amount, market precision, price protection, and clock.
 * @returns Immutable native order fields suitable for later lifecycle wiring.
 */
export function prepareLighterTwapOrder(
  intent: LighterTwapWireIntent,
): LighterTwapWireOrder {
  if (typeof intent.randomize !== 'boolean' || intent.randomize) {
    throw new Error('Lighter native TWAP randomization is unsupported');
  }
  if (
    typeof intent.isBuy !== 'boolean' ||
    typeof intent.reduceOnly !== 'boolean'
  ) {
    throw new Error('Lighter native TWAP requires explicit boolean flags');
  }
  for (const precision of [intent.sizeDecimals, intent.priceDecimals]) {
    if (!Number.isInteger(precision) || precision < 0 || precision > 255) {
      throw new Error('Invalid Lighter native TWAP market precision');
    }
  }
  if (
    !Number.isSafeInteger(intent.durationMinutes) ||
    intent.durationMinutes <= 0 ||
    !Number.isSafeInteger(intent.nowMilliseconds) ||
    intent.nowMilliseconds <= 0
  ) {
    throw new Error('Invalid Lighter native TWAP duration or clock');
  }
  const orderExpiry =
    intent.nowMilliseconds + intent.durationMinutes * MINUTE_MILLISECONDS;
  if (
    !Number.isSafeInteger(orderExpiry) ||
    orderExpiry <= intent.nowMilliseconds
  ) {
    throw new Error('Invalid Lighter native TWAP future millisecond expiry');
  }
  const values = [intent.size, intent.referencePrice, intent.slippage];
  if (
    values.some(
      (value) => typeof value !== 'string' || !/^\d+(?:\.\d+)?$/u.test(value),
    )
  ) {
    throw new Error('Invalid Lighter native TWAP decimal');
  }
  const size = new BigNumber(intent.size).shiftedBy(intent.sizeDecimals);
  const reference = new BigNumber(intent.referencePrice);
  const slippage = new BigNumber(intent.slippage);
  if (
    !size.isInteger() ||
    !size.isPositive() ||
    size.isZero() ||
    size.gt(MAX_BASE_AMOUNT) ||
    !reference.isPositive() ||
    reference.isZero() ||
    !slippage.isFinite() ||
    slippage.lt(0) ||
    slippage.gte(1)
  ) {
    throw new Error('Invalid Lighter native TWAP amount or price protection');
  }
  const price = reference
    .times(new BigNumber(1).plus(intent.isBuy ? slippage : slippage.negated()))
    .shiftedBy(intent.priceDecimals)
    .integerValue(intent.isBuy ? BigNumber.ROUND_FLOOR : BigNumber.ROUND_CEIL);
  if (!price.isFinite() || price.lt(1) || price.gt(MAX_ORDER_PRICE)) {
    throw new Error('Invalid Lighter native TWAP uint32 price bound');
  }
  return Object.freeze({
    baseAmount: size.toFixed(0),
    price: price.toFixed(0),
    isAsk: intent.isBuy ? 0 : 1,
    orderType: 6,
    timeInForce: LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME,
    reduceOnly: intent.reduceOnly ? 1 : 0,
    triggerPrice: '0',
    orderExpiry,
  });
}
