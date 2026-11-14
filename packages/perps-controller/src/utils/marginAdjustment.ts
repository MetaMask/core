/**
 * Margin adjustment limits and previews for an isolated position, shared by
 * Mobile, Extension and Terminal so each offers the same maximum removal and
 * liquidation estimate.
 */
import { MARGIN_ADJUSTMENT_CONFIG } from '../constants/perpsConfig.js';
import { isPositiveFinite } from './tpslCalculations.js';

/** Below this magnitude the maintenance adjustment factor is treated as 1. */
const MIN_ADJUSTMENT_DENOMINATOR = 0.0001;

/**
 * Parameters for `calculateMaxRemovableMargin`.
 */
export type MaxRemovableMarginParams = {
  /** Margin the position holds (USD). */
  currentMargin: number;
  /** The position's own leverage, not the asset's max leverage. */
  positionLeverage: number;
  /**
   * Position value (USD), e.g. `position.positionValue`. When missing or not
   * positive, `positionSize × currentPrice` is used.
   */
  notionalValue?: number;
  /** Absolute position size, for the notional fallback. */
  positionSize?: number;
  /** Mark price, for the notional fallback. */
  currentPrice?: number;
  /**
   * Share of notional kept back for price movement (default
   * `MARGIN_ADJUSTMENT_CONFIG.MarginRemovalPriceMoveBuffer`, 0.01); 0 returns
   * the exact venue boundary.
   */
  priceMoveBufferRatio?: number;
};

/**
 * Margin that can leave an isolated position: what it holds above the
 * HyperLiquid transfer requirement, `max(notional / positionLeverage,
 * notional × MarginRemovalSafetyBuffer)`, less headroom for price movement.
 * Unrealized PnL does not count toward the removable amount.
 *
 * @param params - Margin, leverage and notional (or size and mark price).
 * @returns The removable margin in USD, never negative; 0 for invalid input.
 * @example calculateMaxRemovableMargin({ currentMargin: 3000, positionLeverage: 50, positionSize: 10, currentPrice: 2000 }) => 800
 * @example calculateMaxRemovableMargin({ currentMargin: 8000, positionLeverage: 50, notionalValue: 20000, priceMoveBufferRatio: 0 }) => 6000
 */
export function calculateMaxRemovableMargin(
  params: MaxRemovableMarginParams,
): number {
  const {
    currentMargin,
    positionLeverage,
    positionSize,
    currentPrice,
    priceMoveBufferRatio = MARGIN_ADJUSTMENT_CONFIG.MarginRemovalPriceMoveBuffer,
  } = params;
  if (!isPositiveFinite(currentMargin) || !isPositiveFinite(positionLeverage)) {
    return 0;
  }

  let { notionalValue } = params;
  if (!isPositiveFinite(notionalValue)) {
    if (!isPositiveFinite(positionSize) || !isPositiveFinite(currentPrice)) {
      return 0;
    }
    notionalValue = positionSize * currentPrice;
  }

  const transferMarginRequired = Math.max(
    notionalValue / positionLeverage,
    notionalValue * MARGIN_ADJUSTMENT_CONFIG.MarginRemovalSafetyBuffer,
  );
  return Math.max(
    0,
    currentMargin -
      transferMarginRequired -
      notionalValue * priceMoveBufferRatio,
  );
}

/**
 * Parameters for `estimateLiquidationPriceAfterMarginChange`.
 */
export type LiquidationPriceAfterMarginChangeParams = {
  /** Whether the position is long. */
  isLong: boolean;
  /** Margin the position holds now (USD). */
  currentMargin: number;
  /** Margin after the change (USD). */
  newMargin: number;
  /** Absolute position size. */
  positionSize: number;
  /** The venue's current liquidation price. */
  currentLiquidationPrice: number;
  /** The asset's max leverage, which sets the maintenance margin rate. */
  maxLeverage: number;
};

/**
 * Estimates the liquidation price after adding or removing margin, anchored on
 * the venue's current liquidation price: each dollar moves it by
 * `1 / positionSize`, scaled by `1 − maintenanceMarginRate × side` where
 * `maintenanceMarginRate = 1 / (2 × maxLeverage)`. Adding margin moves a
 * long's liquidation price down and a short's up.
 *
 * @param params - Direction, margins, size, current liquidation price and max leverage.
 * @returns The estimated liquidation price, never negative; the current one
 * for invalid input.
 * @example estimateLiquidationPriceAfterMarginChange({ isLong: true, currentMargin: 5000, newMargin: 6000, positionSize: 0.5, currentLiquidationPrice: 80000, maxLeverage: 20 }) => 77948.717…
 * @example estimateLiquidationPriceAfterMarginChange({ isLong: false, currentMargin: 1000, newMargin: 500, positionSize: 10, currentLiquidationPrice: 2100, maxLeverage: 20 }) => 2051.219…
 */
export function estimateLiquidationPriceAfterMarginChange(
  params: LiquidationPriceAfterMarginChangeParams,
): number {
  const {
    isLong,
    currentMargin,
    newMargin,
    positionSize,
    currentLiquidationPrice,
    maxLeverage,
  } = params;
  if (
    !isPositiveFinite(newMargin) ||
    !isPositiveFinite(positionSize) ||
    !isPositiveFinite(currentLiquidationPrice) ||
    !isPositiveFinite(currentMargin)
  ) {
    return currentLiquidationPrice;
  }

  const side = isLong ? 1 : -1;
  const maintenanceMarginRate = isPositiveFinite(maxLeverage)
    ? 1 / (2 * maxLeverage)
    : 0;
  const denominator = 1 - maintenanceMarginRate * side;
  const safeDenominator =
    Math.abs(denominator) < MIN_ADJUSTMENT_DENOMINATOR ? 1 : denominator;
  const estimate =
    currentLiquidationPrice +
    (-side * (newMargin - currentMargin)) / positionSize / safeDenominator;
  return Math.max(0, estimate);
}
