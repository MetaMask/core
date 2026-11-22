import type { Position } from '../types/index.js';
import { calculateSignedRoEForPrice } from './tpslCalculations.js';

/**
 * Side of a position from its signed size.
 *
 * @param size - Signed position size (`Position.size`): positive long, negative short.
 * @returns `long` or `short`, or undefined for a zero or unreadable size.
 */
export function getPositionDirection(
  size: number | string,
): 'long' | 'short' | undefined {
  const signedSize = Number.parseFloat(String(size));
  if (!Number.isFinite(signedSize) || signedSize === 0) {
    return undefined;
  }
  return signedSize > 0 ? 'long' : 'short';
}

/**
 * A position revalued at a live price, such as the latest mark: unrealized
 * PnL `(price - entry) * size`, value `|size| * price` and return on equity
 * as a decimal (0.1 = 10%), as Mobile computes between account updates.
 * Return on equity keeps the venue's figure while leverage is unreported.
 * Margin and liquidation price keep the venue's last figures.
 *
 * @param position - The position.
 * @param price - Live price of its market.
 * @returns A copy with the three figures recomputed, or the same position
 * when the price, entry price or size is missing, zero or not a number.
 */
export function recomputePositionAtPrice<
  PositionLike extends Pick<
    Position,
    | 'size'
    | 'entryPrice'
    | 'leverage'
    | 'unrealizedPnl'
    | 'positionValue'
    | 'returnOnEquity'
  >,
>(position: PositionLike, price: number | string): PositionLike {
  const currentPrice = Number.parseFloat(String(price));
  const entryPrice = Number.parseFloat(position.entryPrice);
  const size = Number.parseFloat(position.size);
  const direction = getPositionDirection(size);
  if (
    !Number.isFinite(currentPrice) ||
    currentPrice <= 0 ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    direction === undefined
  ) {
    return position;
  }
  const roePercent = calculateSignedRoEForPrice(currentPrice.toString(), {
    currentPrice,
    direction,
    leverage: position.leverage.value,
    entryPrice,
  });
  return {
    ...position,
    unrealizedPnl: ((currentPrice - entryPrice) * size).toString(),
    returnOnEquity: roePercent
      ? (Number.parseFloat(roePercent) / 100).toString()
      : position.returnOnEquity,
    positionValue: (Math.abs(size) * currentPrice).toString(),
  };
}
