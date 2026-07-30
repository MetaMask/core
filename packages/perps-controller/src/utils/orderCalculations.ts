import type { Hex } from '@metamask/utils';

import { BASIS_POINTS_DIVISOR } from '../constants/hyperLiquidConfig.js';
import {
  MAX_ORDER_MARGIN_BUFFER,
  ORDER_SLIPPAGE_CONFIG,
} from '../constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type { SDKOrderParams } from '../types/hyperliquid-types.js';
import type { PerpsDebugLogger } from '../types/index.js';
import {
  formatHyperLiquidPrice,
  formatHyperLiquidSize,
} from './hyperLiquidAdapter.js';

/**
 * Optional debug logger for order calculation functions.
 * When provided, enables detailed logging for debugging.
 */
export type OrderCalculationsDebugLogger = PerpsDebugLogger | undefined;

/**
 * Tolerance used when deciding whether a scaled size is already on the size
 * grid, guarding against floating-point representation error.
 */
const FLOAT_TOLERANCE = 1e-6;

type PositionSizeParams = {
  amount: string;
  price: number;
  szDecimals: number;
};

type MarginRequiredParams = {
  amount: string;
  leverage: number;
};

type MaxAllowedAmountParams = {
  spendableBalance: number;
  assetPrice: number;
  assetSzDecimals: number;
  leverage: number;
};

// Advanced order calculation interfaces
export type CalculateFinalPositionSizeParams = {
  usdAmount?: string;
  size?: string;
  currentPrice: number;
  priceAtCalculation?: number;
  maxSlippageBps?: number;
  szDecimals: number;
  leverage?: number;
  // Reduce-only orders (position closes) may never round up: HyperLiquid
  // rejects a reduce-only order whose size exceeds the live position with
  // "Reduce only order would increase position".
  reduceOnly?: boolean;
  debugLogger?: OrderCalculationsDebugLogger;
};

export type CalculateFinalPositionSizeResult = {
  finalPositionSize: number;
};

export type CalculateOrderPriceAndSizeParams = {
  orderType: 'market' | 'limit';
  isBuy: boolean;
  finalPositionSize: number;
  currentPrice: number;
  limitPrice?: string;
  // Max slippage in basis points (e.g. 300 = 3%). Only applied to market orders;
  // limit orders use limitPrice directly. Falls back to ORDER_SLIPPAGE_CONFIG
  // .DefaultMarketSlippageBps when omitted on a market order.
  maxSlippageBps?: number;
  szDecimals: number;
};

export type CalculateOrderPriceAndSizeResult = {
  orderPrice: number;
  formattedSize: string;
  formattedPrice: string;
};

export type BuildOrdersArrayParams = {
  assetId: number;
  isBuy: boolean;
  formattedPrice: string;
  formattedSize: string;
  reduceOnly: boolean;
  orderType: 'market' | 'limit';
  clientOrderId?: string;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  szDecimals: number;
  grouping?: 'na' | 'normalTpsl' | 'positionTpsl';
};

export type BuildOrdersArrayResult = {
  orders: SDKOrderParams[];
  grouping: 'na' | 'normalTpsl' | 'positionTpsl';
};

/**
 * Calculate position size based on USD amount and asset price
 *
 * @param params - Amount in USD, current asset price, and required decimal precision
 * @returns Position size formatted to the asset's decimal precision
 */
export function calculatePositionSize(params: PositionSizeParams): string {
  const { amount, price, szDecimals } = params;

  // Validate required parameters
  if (szDecimals === undefined || szDecimals === null) {
    throw new Error('szDecimals is required for position size calculation');
  }
  if (szDecimals < 0) {
    throw new Error(`szDecimals must be >= 0, got: ${szDecimals}`);
  }

  const amountNum = parseFloat(amount || '0');

  if (isNaN(amountNum) || isNaN(price) || amountNum === 0 || price === 0) {
    return (0).toFixed(szDecimals);
  }

  const positionSize = amountNum / price;
  const multiplier = Math.pow(10, szDecimals);
  let rounded = Math.round(positionSize * multiplier) / multiplier;

  // Ensure rounded size meets requested USD (fix validation gap)
  const actualUsd = rounded * price;
  if (actualUsd < amountNum) {
    rounded += 1 / multiplier;
  }

  return rounded.toFixed(szDecimals);
}

/**
 * Calculate margin required for a position
 *
 * @param params - Position amount and leverage
 * @returns Margin required formatted to 2 decimal places
 */
export function calculateMarginRequired(params: MarginRequiredParams): string {
  const { amount, leverage } = params;
  const amountNum = parseFloat(amount || '0');

  if (
    isNaN(amountNum) ||
    isNaN(leverage) ||
    amountNum === 0 ||
    leverage === 0
  ) {
    return '0.00';
  }

  return (amountNum / leverage).toFixed(2);
}

export function getMaxAllowedAmount(params: MaxAllowedAmountParams): number {
  const { spendableBalance, assetPrice, assetSzDecimals, leverage } = params;
  if (spendableBalance === 0 || !assetPrice || assetSzDecimals === undefined) {
    return 0;
  }

  // The theoretical maximum is simply spendableBalance * leverage
  const theoreticalMax = spendableBalance * leverage;

  // But we need to account for position size rounding
  // Find the largest whole dollar amount that fits within this limit
  let maxAmount = Math.floor(theoreticalMax);

  // Verify this amount doesn't exceed available balance after rounding
  const testPositionSize = calculatePositionSize({
    amount: maxAmount.toString(),
    price: assetPrice,
    szDecimals: assetSzDecimals,
  });

  const actualNotionalValue = parseFloat(testPositionSize) * assetPrice;
  const requiredMargin = actualNotionalValue / leverage;

  // If rounding caused us to exceed available balance, step down by one position increment
  if (requiredMargin > spendableBalance) {
    const minPositionSizeIncrement = 1 / Math.pow(10, assetSzDecimals);
    const positionSizeIncrementUsd = Math.ceil(
      minPositionSizeIncrement * assetPrice,
    );
    maxAmount -= positionSizeIncrementUsd;
  }

  // Apply margin buffer to reduce "Insufficient margin" rejections from the exchange
  // (fees, rounding, and exchange-side checks can make 100% theoretical max fail)
  const bufferedMax = maxAmount * (1 - MAX_ORDER_MARGIN_BUFFER);

  return Math.max(0, Math.floor(bufferedMax));
}

/**
 * Round a size down onto the asset's size grid.
 *
 * Used for reduce-only orders, where rounding up would push the size past the
 * live position size. Values already on the grid are snapped rather than
 * truncated, because floating-point math can leave them just below a grid
 * point (0.0123 * 10000 === 122.99999999999999) and truncating would drop a
 * whole increment.
 *
 * The result is never greater than `size`, for negative sizes as well as
 * positive: the snap only ever recovers a grid point the input already
 * represents, so a value genuinely below a grid point is stepped down even when
 * the tolerance would have reached the point above it.
 *
 * A size whose scaled form reaches `2^53` is returned unchanged: doubles cannot
 * represent consecutive integers there, so the grid is finer than the spacing
 * between representable values and there is nothing to round down to.
 *
 * @param size - Size to round down.
 * @param szDecimals - The asset's size decimal precision.
 * @returns The size rounded down onto the size grid, never exceeding `size`.
 */
export function floorToSizeDecimals(size: number, szDecimals: number): number {
  const multiplier = Math.pow(10, szDecimals);
  const scaled = size * multiplier;

  // Past 2^53 a double cannot represent consecutive integers, so `units -= 1`
  // below would be a no-op and the step-down loop would never terminate. The
  // size grid is finer than the spacing between representable values at that
  // magnitude, so there is no increment to shave: return the input unchanged.
  if (!Number.isFinite(scaled) || Math.abs(scaled) >= Number.MAX_SAFE_INTEGER) {
    return size;
  }

  const nearest = Math.round(scaled);
  // The tolerance scales with the magnitude, because double-precision error
  // does too: a fixed epsilon would stop absorbing representation error for
  // sizes that scale past ~1e10 and would then shave off a whole increment.
  const tolerance = Math.max(
    FLOAT_TOLERANCE,
    Math.abs(scaled) * Number.EPSILON * 8,
  );
  let units =
    Math.abs(scaled - nearest) < tolerance ? nearest : Math.floor(scaled);

  // Step down until the result no longer exceeds the input. One pass is not
  // enough: a tolerance wide enough to absorb representation error at large
  // magnitudes also reaches the next grid point, and for an input less than half
  // an ulp below a grid point `size * multiplier` evaluates to exactly that grid
  // integer, so flooring the scaled value returns the same too-large result.
  // `units !== 0` rather than `units > 0` so negative sizes step down too — for
  // them the tolerance snap rounds *towards* zero, i.e. upward.
  while (units !== 0 && units / multiplier > size) {
    units -= 1;
  }

  return units / multiplier;
}

/**
 * Calculates final position size using USD as source of truth with price validation
 *
 * This function implements the hybrid approach where USD is the source of truth,
 * but includes price staleness validation and proper rounding to prevent precision loss.
 *
 * @param params - USD amount, size, prices, and configuration
 * @returns Final position size as a number
 */
export function calculateFinalPositionSize(
  params: CalculateFinalPositionSizeParams,
): CalculateFinalPositionSizeResult {
  const {
    usdAmount,
    size,
    currentPrice,
    priceAtCalculation,
    maxSlippageBps,
    szDecimals,
    leverage,
    reduceOnly,
    debugLogger,
  } = params;

  let finalPositionSize: number;

  if (usdAmount && parseFloat(usdAmount) > 0) {
    // USD amount provided - use it as source of truth
    const usdValue = parseFloat(usdAmount);

    // 1. Validate price staleness if priceAtCalculation provided
    if (priceAtCalculation) {
      const priceDeltaBps = Math.abs(
        ((currentPrice - priceAtCalculation) / priceAtCalculation) * 10000,
      );
      const maxSlippageBpsValue =
        maxSlippageBps ?? ORDER_SLIPPAGE_CONFIG.DefaultMarketSlippageBps;

      if (priceDeltaBps > maxSlippageBpsValue) {
        throw new Error(
          `Price moved too much: ${priceDeltaBps.toFixed(0)} bps (max: ${maxSlippageBpsValue} bps). ` +
            `Expected: ${priceAtCalculation.toFixed(2)}, Current: ${currentPrice.toFixed(2)}`,
        );
      }

      debugLogger?.log('Price validation passed:', {
        priceAtCalculation,
        currentPrice,
        deltaBps: priceDeltaBps.toFixed(2),
        maxSlippageBps: maxSlippageBpsValue,
      });
    }

    // 2. Recalculate position size with fresh price
    finalPositionSize = usdValue / currentPrice;

    // A reduce-only order may never exceed the size the caller asked to close:
    // that size is already clamped to the live position, while the USD amount was
    // computed against an older price and can imply a larger size after an
    // adverse move. Capping here keeps USD accuracy in the common case and makes
    // the caller's clamp binding.
    if (reduceOnly && size) {
      const requestedSize = parseFloat(size);

      // A supplied size must be positive, or the cap below would submit a
      // zero/negative order. Reject it rather than silently falling back to the
      // USD-derived size, matching how closePosition treats the same input.
      if (!Number.isFinite(requestedSize) || requestedSize <= 0) {
        throw new Error(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
      }

      finalPositionSize = Math.min(finalPositionSize, requestedSize);
    }

    // 3. Apply size decimals rounding (reduce-only never rounds up)
    const multiplier = Math.pow(10, szDecimals);
    const sizeBeforeRounding = finalPositionSize;
    finalPositionSize = reduceOnly
      ? floorToSizeDecimals(finalPositionSize, szDecimals)
      : Math.round(finalPositionSize * multiplier) / multiplier;

    // Rounding down can zero out a reduce-only order whose USD value is worth
    // less than one size increment. Fail with a clear error instead of
    // submitting a size of "0" the exchange will reject.
    if (reduceOnly && finalPositionSize <= 0 && sizeBeforeRounding > 0) {
      throw new Error(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
    }

    // 4. Ensure rounded size meets requested USD (fix validation gap).
    // Skipped for reduce-only orders: adding an increment there would submit
    // more than the position holds and HyperLiquid rejects the order.
    let actualNotionalValue = finalPositionSize * currentPrice;
    if (!reduceOnly && actualNotionalValue < usdValue) {
      // Add 1 minimum increment to meet requested USD
      finalPositionSize += 1 / multiplier;
      actualNotionalValue = finalPositionSize * currentPrice;

      debugLogger?.log('Position size adjusted to meet USD minimum:', {
        requestedUsd: usdValue,
        beforeAdjustment: finalPositionSize - 1 / multiplier,
        afterAdjustment: finalPositionSize,
        actualUsd: actualNotionalValue,
      });
    }

    const requiredMargin = actualNotionalValue / (leverage ?? 1);

    // Log if rounding caused significant difference
    const usdDifference = Math.abs(actualNotionalValue - usdValue);
    if (usdDifference > 0.01) {
      debugLogger?.log(
        'Position size rounding caused USD difference (acceptable):',
        {
          requestedUsd: usdValue,
          actualUsd: actualNotionalValue,
          difference: usdDifference,
          positionSize: finalPositionSize,
        },
      );
    }

    debugLogger?.log('Recalculated position size with fresh price:', {
      usdAmount: usdValue,
      priceAtCalculation,
      currentPrice,
      originalSize: size,
      recalculatedSize: finalPositionSize,
      requiredMargin,
      minIncrement: 1 / multiplier,
    });
  } else {
    // Legacy: Use provided size (backward compatibility)
    finalPositionSize = parseFloat(size ?? '0');

    // Reduce-only sizes are formatted with toFixed() further down, which rounds
    // up; truncate onto the size grid first so a close can never exceed the
    // position it is closing.
    if (reduceOnly) {
      // A supplied size must be positive, or formatHyperLiquidSize would render
      // a zero or negative order size. The USD branch above rejects the same
      // input.
      if (size && !(finalPositionSize > 0)) {
        throw new Error(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
      }

      const sizeBeforeFlooring = finalPositionSize;
      finalPositionSize = floorToSizeDecimals(finalPositionSize, szDecimals);

      // A positive size that floors to zero is worth less than one increment
      if (finalPositionSize <= 0 && sizeBeforeFlooring > 0) {
        throw new Error(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
      }
    }

    debugLogger?.log(
      'Using legacy size calculation (no USD amount provided):',
      {
        providedSize: size,
        finalSize: finalPositionSize,
      },
    );
  }

  return { finalPositionSize };
}

/**
 * Calculates order price and formatted size based on order type
 *
 * @param params - Order parameters including type, direction, size, and prices
 * @returns Formatted order price, size, and price string
 */
export function calculateOrderPriceAndSize(
  params: CalculateOrderPriceAndSizeParams,
): CalculateOrderPriceAndSizeResult {
  const {
    orderType,
    isBuy,
    finalPositionSize,
    currentPrice,
    limitPrice,
    maxSlippageBps,
    szDecimals,
  } = params;

  let orderPrice: number;
  let formattedSize: string;

  if (orderType === 'market') {
    // Market orders: apply slippage buffer to the live price so HyperLiquid
    // receives a worst-case acceptable limit price. Falls back to the
    // documented default if the caller does not provide one.
    const effectiveBps =
      maxSlippageBps ?? ORDER_SLIPPAGE_CONFIG.DefaultMarketSlippageBps;
    const slippageValue = effectiveBps / BASIS_POINTS_DIVISOR;
    orderPrice = isBuy
      ? currentPrice * (1 + slippageValue)
      : currentPrice * (1 - slippageValue);
    formattedSize = formatHyperLiquidSize({
      size: finalPositionSize,
      szDecimals,
    });
  } else {
    // Limit orders: use provided price (no slippage applied)
    if (!limitPrice) {
      throw new Error(PERPS_ERROR_CODES.ORDER_LIMIT_PRICE_REQUIRED);
    }
    orderPrice = parseFloat(limitPrice);
    formattedSize = formatHyperLiquidSize({
      size: finalPositionSize,
      szDecimals,
    });
  }

  const formattedPrice = formatHyperLiquidPrice({
    price: orderPrice,
    szDecimals,
  });

  return { orderPrice, formattedSize, formattedPrice };
}

/**
 * Builds orders array including main order and optional TP/SL orders
 *
 * @param params - Order construction parameters
 * @returns Array of SDK order params and grouping type
 */
export function buildOrdersArray(
  params: BuildOrdersArrayParams,
): BuildOrdersArrayResult {
  const {
    assetId,
    isBuy,
    formattedPrice,
    formattedSize,
    reduceOnly,
    orderType,
    clientOrderId,
    takeProfitPrice,
    stopLossPrice,
    szDecimals,
    grouping,
  } = params;

  const orders: SDKOrderParams[] = [];

  // 1. Main order
  const mainOrder: SDKOrderParams = {
    a: assetId,
    b: isBuy,
    p: formattedPrice,
    s: formattedSize,
    r: reduceOnly || false,
    t:
      orderType === 'limit'
        ? { limit: { tif: 'Gtc' } }
        : { limit: { tif: 'FrontendMarket' } },
    c: clientOrderId ? (clientOrderId as Hex) : undefined,
  };
  orders.push(mainOrder);

  // 2. Take Profit order
  if (takeProfitPrice) {
    const tpOrder: SDKOrderParams = {
      a: assetId,
      b: !isBuy,
      p: formatHyperLiquidPrice({
        price: parseFloat(takeProfitPrice),
        szDecimals,
      }),
      s: formattedSize,
      r: true,
      t: {
        trigger: {
          isMarket: false,
          triggerPx: formatHyperLiquidPrice({
            price: parseFloat(takeProfitPrice),
            szDecimals,
          }),
          tpsl: 'tp',
        },
      },
    };
    orders.push(tpOrder);
  }

  // 3. Stop Loss order
  if (stopLossPrice) {
    // Apply 10% slippage to SL limit price (executes as market order when triggered)
    // HyperLiquid recommended: 10% for TP/SL orders
    const stopLossPriceNum = parseFloat(stopLossPrice);
    const slippageValue = ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps / 10000;
    const limitPriceWithSlippage = isBuy
      ? stopLossPriceNum * (1 - slippageValue) // Selling to close long: willing to accept LESS (slippage protection)
      : stopLossPriceNum * (1 + slippageValue); // Buying to close short: willing to pay MORE (slippage protection)

    const slOrder: SDKOrderParams = {
      a: assetId,
      b: !isBuy,
      p: formatHyperLiquidPrice({
        price: limitPriceWithSlippage,
        szDecimals,
      }),
      s: formattedSize,
      r: true,
      t: {
        trigger: {
          isMarket: true,
          triggerPx: formatHyperLiquidPrice({
            price: stopLossPriceNum,
            szDecimals,
          }),
          tpsl: 'sl',
        },
      },
    };
    orders.push(slOrder);
  }

  // Determine grouping
  const finalGrouping: 'na' | 'normalTpsl' | 'positionTpsl' =
    grouping ?? ((takeProfitPrice ?? stopLossPrice) ? 'normalTpsl' : 'na');

  return { orders, grouping: finalGrouping };
}
