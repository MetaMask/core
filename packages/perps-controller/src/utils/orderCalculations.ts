import type { Hex } from '@metamask/utils';

import { BASIS_POINTS_DIVISOR } from '../constants/hyperLiquidConfig.js';
import {
  MAX_ORDER_MARGIN_BUFFER,
  ORDER_SLIPPAGE_CONFIG,
} from '../constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import type { SDKOrderParams } from '../types/hyperliquid-types.js';
import type { PerpsDebugLogger } from '../types/index.js';
import type { OrderType } from '../types/perps-types.js';
import {
  formatHyperLiquidPrice,
  formatHyperLiquidSize,
} from './hyperLiquidAdapter.js';
import {
  getTriggerDirection,
  isLimitExecutionOrderType,
  isTriggerOrderType,
} from './orderTypes.js';

/**
 * Optional debug logger for order calculation functions.
 * When provided, enables detailed logging for debugging.
 */
export type OrderCalculationsDebugLogger = PerpsDebugLogger | undefined;

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
  debugLogger?: OrderCalculationsDebugLogger;
};

export type CalculateFinalPositionSizeResult = {
  finalPositionSize: number;
};

export type CalculateOrderPriceAndSizeParams = {
  orderType: OrderType;
  isBuy: boolean;
  finalPositionSize: number;
  currentPrice: number;
  limitPrice?: string;
  // Trigger price for stop_*/take_profit_* placements. Required for those types:
  // `*_limit` executes at `limitPrice`, `*_market` derives a slippage-capped
  // limit price from this trigger price.
  triggerPrice?: string;
  // Max slippage in basis points (e.g. 300 = 3%). Applied to market orders and to
  // market-executing trigger orders (where it caps the limit price derived from
  // the trigger price); limit orders use limitPrice directly. Falls back to
  // ORDER_SLIPPAGE_CONFIG.DefaultMarketSlippageBps for market orders and
  // .DefaultTpslSlippageBps for market-executing triggers.
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
  orderType: OrderType;
  timeInForce?: 'GTC' | 'IOC' | 'ALO';
  clientOrderId?: string;
  // Trigger price for stop_*/take_profit_* placements (required for those types)
  triggerPrice?: string;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  // Partial TP/SL sizes; default to the full order size when omitted
  takeProfitSize?: string;
  stopLossSize?: string;
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

    // 3. Apply size decimals rounding
    const multiplier = Math.pow(10, szDecimals);
    finalPositionSize = Math.round(finalPositionSize * multiplier) / multiplier;

    // 4. Ensure rounded size meets requested USD (fix validation gap)
    let actualNotionalValue = finalPositionSize * currentPrice;
    if (actualNotionalValue < usdValue) {
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
    triggerPrice,
    maxSlippageBps,
    szDecimals,
  } = params;

  let orderPrice: number;
  let formattedSize: string;

  if (isTriggerOrderType(orderType)) {
    // Trigger placements price off the trigger, not the live market: the order
    // rests off-book until the trigger fires.
    if (!triggerPrice) {
      throw new Error(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
    }

    const triggerPriceNum = parseFloat(triggerPrice);
    if (isNaN(triggerPriceNum) || triggerPriceNum <= 0) {
      throw new Error(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE);
    }

    if (isLimitExecutionOrderType(orderType)) {
      if (!limitPrice) {
        throw new Error(PERPS_ERROR_CODES.ORDER_LIMIT_PRICE_REQUIRED);
      }
      orderPrice = parseFloat(limitPrice);
    } else {
      // Market execution on trigger: HyperLiquid still needs a limit price, used
      // as a slippage cap. The caller's tolerance wins when supplied; otherwise
      // the 10% convention of the existing TP/SL children applies.
      const effectiveBps =
        maxSlippageBps ?? ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps;
      const slippageValue = effectiveBps / BASIS_POINTS_DIVISOR;
      orderPrice = isBuy
        ? triggerPriceNum * (1 + slippageValue)
        : triggerPriceNum * (1 - slippageValue);
    }

    formattedSize = formatHyperLiquidSize({
      size: finalPositionSize,
      szDecimals,
    });
  } else if (orderType === 'market') {
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
 * Build the SDK order-type field for the main order.
 *
 * Trigger placements map to the SDK's trigger shape; everything else keeps the
 * existing Gtc/FrontendMarket limit shape.
 *
 * @param params - Order type parameters
 * @param params.orderType - Placement type
 * @param params.triggerPrice - Trigger price (required for trigger placements)
 * @param params.szDecimals - Asset size decimals, for price formatting
 * @returns The SDK `t` field for the main order
 */
function buildMainOrderTypeField(params: {
  orderType: OrderType;
  timeInForce?: 'GTC' | 'IOC' | 'ALO';
  triggerPrice?: string;
  szDecimals: number;
}): SDKOrderParams['t'] {
  const { orderType, timeInForce, triggerPrice, szDecimals } = params;

  if (!isTriggerOrderType(orderType)) {
    if (orderType === 'limit') {
      const tif =
        timeInForce === 'IOC' ? 'Ioc' : timeInForce === 'ALO' ? 'Alo' : 'Gtc';
      return { limit: { tif } };
    }
    if (timeInForce !== undefined) {
      throw new Error('timeInForce is only supported for limit orders');
    }
    return { limit: { tif: 'FrontendMarket' } };
  }

  if (timeInForce !== undefined) {
    throw new Error('timeInForce is only supported for limit orders');
  }

  if (!triggerPrice) {
    throw new Error(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
  }

  return {
    trigger: {
      isMarket: !isLimitExecutionOrderType(orderType),
      triggerPx: formatHyperLiquidPrice({
        price: parseFloat(triggerPrice),
        szDecimals,
      }),
      tpsl: getTriggerDirection(orderType) === 'stop' ? 'sl' : 'tp',
    },
  };
}

/**
 * Resolve the size of an attached TP/SL order.
 *
 * @param params - Size parameters
 * @param params.tpslSize - Requested partial size, if any
 * @param params.formattedSize - Full order size, used when no partial size is given
 * @param params.szDecimals - Asset size decimals
 * @returns The exchange-formatted TP/SL order size
 */
function formatTpslSize(params: {
  tpslSize?: string;
  formattedSize: string;
  szDecimals: number;
}): string {
  const { tpslSize, formattedSize, szDecimals } = params;

  if (tpslSize === undefined) {
    return formattedSize;
  }

  return formatHyperLiquidSize({
    size: parseFloat(tpslSize),
    szDecimals,
  });
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
    timeInForce,
    clientOrderId,
    triggerPrice,
    takeProfitPrice,
    stopLossPrice,
    takeProfitSize,
    stopLossSize,
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
    t: buildMainOrderTypeField({
      orderType,
      timeInForce,
      triggerPrice,
      szDecimals,
    }),
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
      s: formatTpslSize({
        tpslSize: takeProfitSize,
        formattedSize,
        szDecimals,
      }),
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
      s: formatTpslSize({ tpslSize: stopLossSize, formattedSize, szDecimals }),
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
