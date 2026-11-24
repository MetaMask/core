/**
 * Close-position figures shared by Mobile, Extension and Terminal: the cash a
 * close returns ("You'll receive") and a fill's closed PnL net of its fee.
 */
import { BigNumber } from 'bignumber.js';

import { CLOSE_POSITION_CONFIG } from '../constants/perpsConfig.js';
import type { PerpsProviderType, Position } from '../types/index.js';

/**
 * Whether a provider's isolated `Position.marginUsed` is the collateral
 * backing the position. Hyperliquid's is, with the unrealized PnL at mark
 * included. Lighter's is the initial margin the position requires at its
 * current value; its allocated collateral is not on `Position`, so the margin
 * a Lighter isolated close returns is unknown. Cross `marginUsed` is taken as
 * reported and never holds the unrealized PnL.
 */
const ISOLATED_MARGIN_USED_IS_COLLATERAL: Record<PerpsProviderType, boolean> = {
  hyperliquid: true,
  lighter: false,
};

/**
 * Inputs to {@link estimateCloseReceive}.
 */
export type CloseReceiveEstimateParams = {
  /** The position being closed; a `Position` can be passed as-is. */
  position: Pick<
    Position,
    'size' | 'entryPrice' | 'marginUsed' | 'unrealizedPnl'
  > & {
    leverage: Pick<Position['leverage'], 'type'>;
  };
  /**
   * Provider holding the position. It decides whether isolated `marginUsed`
   * is the position's collateral; for Lighter or an unknown provider,
   * isolated margin returned is undefined. `Position.providerId` is only set
   * under aggregation, so pass the provider explicitly.
   */
  providerId: PerpsProviderType;
  /**
   * Size to close in base units, unsigned: the whole position or part of it.
   * A size above the position size closes the whole position.
   */
  closeSize: number | string;
  /**
   * Price the close executes at: the limit price of a limit close, else the
   * live price. Undefined until known.
   */
  price: number | string | undefined;
  /**
   * Total fee rate for the close as a decimal (0.00145 = 0.145%), such as
   * `FeeCalculationResult.feeRate` from `calculateFees` for this close, which
   * already applies the maker or taker rate and any fee discount. Undefined
   * until quoted.
   */
  feeRate: number | undefined;
};

/**
 * The cash a close returns, in USD. Each figure is undefined while an input it
 * needs is missing or unusable; none falls back to 0.
 */
export type CloseReceiveEstimate = {
  /** The closed share of the margin backing the position, unrealized PnL excluded. */
  marginReturned: number | undefined;
  /** PnL realized on the closed size at the close price. */
  realizedPnl: number | undefined;
  /** Fee on the closed notional at the supplied fee rate. */
  fee: number | undefined;
  /**
   * `marginReturned + realizedPnl`, less `fee`, each of the two rounded first
   * to `CLOSE_POSITION_CONFIG.UsdDecimalPlaces` decimals, half away from zero.
   * A margin row that includes the PnL and a fee row, shown at that rounding,
   * add up to it. Undefined unless all three are known.
   */
  receive: number | undefined;
};

/**
 * Inputs to {@link calculateNetClosedPnl}. An `OrderFill` can be passed as-is.
 */
export type NetClosedPnlParams = {
  /** Realized PnL the venue reported for the fill (`OrderFill.pnl`). */
  pnl?: number | string;
  /** Fee paid on the fill (`OrderFill.fee`). */
  fee?: number | string;
};

function toDecimal(value: number | string | undefined): BigNumber | undefined {
  if (value === undefined) {
    return undefined;
  }
  const decimal = new BigNumber(value);
  return decimal.isFinite() ? decimal : undefined;
}

function toPositiveDecimal(
  value: number | string | undefined,
): BigNumber | undefined {
  const decimal = toDecimal(value);
  return decimal?.isGreaterThan(0) ? decimal : undefined;
}

/**
 * The unrealized PnL the position's margin holds: all of it for isolated
 * margin that is the position's collateral, none for cross margin.
 *
 * @param position - The position being closed.
 * @param providerId - Provider holding the position.
 * @returns The held PnL, or undefined when it or the collateral is unknown.
 */
function heldUnrealizedPnl(
  position: CloseReceiveEstimateParams['position'],
  providerId: PerpsProviderType,
): BigNumber | undefined {
  if (position.leverage.type !== 'isolated') {
    return new BigNumber(0);
  }
  if (
    !Object.hasOwn(ISOLATED_MARGIN_USED_IS_COLLATERAL, providerId) ||
    !ISOLATED_MARGIN_USED_IS_COLLATERAL[providerId]
  ) {
    return undefined;
  }
  return toDecimal(position.unrealizedPnl);
}

function roundUsd(value: BigNumber): BigNumber {
  return value.decimalPlaces(
    CLOSE_POSITION_CONFIG.UsdDecimalPlaces,
    BigNumber.ROUND_HALF_UP,
  );
}

/**
 * Estimate the cash a close returns: the closed share of the position's
 * backing margin, plus the PnL realized at the close price, minus the fee.
 *
 * Backing margin is `marginUsed`, less the unrealized PnL for Hyperliquid
 * isolated margin, which holds it. Cross margin is taken as reported. Lighter
 * isolated `marginUsed` is required margin, not the allocated collateral, so
 * its margin returned and receive are undefined. The realized PnL replaces the
 * mark-price PnL, so a limit close is quoted at its limit price. A close is
 * reduce-only, so a `closeSize` above the position size closes the whole
 * position.
 *
 * @param params - The close inputs.
 * @param params.position - The position being closed.
 * @param params.providerId - Provider holding the position.
 * @param params.closeSize - Unsigned size to close, in base units.
 * @param params.price - Price the close executes at.
 * @param params.feeRate - Total fee rate for the close, as a decimal.
 * @returns The estimate; a figure is undefined while an input it needs is
 * missing or unusable.
 */
export function estimateCloseReceive({
  position,
  providerId,
  closeSize,
  price,
  feeRate,
}: CloseReceiveEstimateParams): CloseReceiveEstimate {
  const size = toDecimal(position.size);
  const positionSize = size?.isZero() ? undefined : size;
  const requested = toPositiveDecimal(closeSize);
  const closing =
    requested !== undefined && positionSize !== undefined
      ? BigNumber.min(requested, positionSize.abs())
      : requested;
  const closePrice = toPositiveDecimal(price);
  const entryPrice = toPositiveDecimal(position.entryPrice);
  const rate = toDecimal(feeRate);

  const marginUsed = toDecimal(position.marginUsed);
  const heldPnl = heldUnrealizedPnl(position, providerId);

  const marginReturned =
    marginUsed !== undefined &&
    heldPnl !== undefined &&
    positionSize !== undefined &&
    closing !== undefined
      ? marginUsed.minus(heldPnl).times(closing).div(positionSize.abs())
      : undefined;
  const realizedPnl =
    positionSize !== undefined &&
    closing !== undefined &&
    closePrice !== undefined &&
    entryPrice !== undefined
      ? (positionSize.isNegative()
          ? entryPrice.minus(closePrice)
          : closePrice.minus(entryPrice)
        ).times(closing)
      : undefined;
  const fee =
    closing !== undefined && closePrice !== undefined && rate !== undefined
      ? closing.times(closePrice).times(rate)
      : undefined;
  const receive =
    marginReturned !== undefined &&
    realizedPnl !== undefined &&
    fee !== undefined
      ? roundUsd(marginReturned.plus(realizedPnl)).minus(roundUsd(fee))
      : undefined;

  return {
    marginReturned: marginReturned?.toNumber(),
    realizedPnl: realizedPnl?.toNumber(),
    fee: fee?.toNumber(),
    receive: receive?.toNumber(),
  };
}

/**
 * A fill's closed PnL net of its fee: the venue's realized PnL less the fee
 * paid on the fill.
 *
 * @param params - The fill figures.
 * @param params.pnl - Realized PnL the venue reported.
 * @param params.fee - Fee paid on the fill.
 * @returns The net PnL in USD, or undefined when either figure is missing,
 * empty or not a finite number.
 */
export function calculateNetClosedPnl({
  pnl,
  fee,
}: NetClosedPnlParams): number | undefined {
  const gross = toDecimal(pnl);
  const cost = toDecimal(fee);
  return gross === undefined || cost === undefined
    ? undefined
    : gross.minus(cost).toNumber();
}

/**
 * Inputs to {@link calculateCloseSize}: the share of the position to close as
 * a percent, or as a USD amount at `price`.
 */
export type CloseSizeParams = {
  /** Position size in base units; the sign is ignored. */
  positionSize: number | string;
  /** Price the close is valued at. */
  price: number | string;
  /** Decimals the venue accepts for a size (`PerpsOrderLimits.sizeDecimals`). */
  sizeDecimals: number;
  /**
   * How a partial size meets the size grid. `up` (default) rounds half up
   * and adds one step when that leaves the size below the request, so the
   * close covers the requested value. `down` rounds down, so several partial
   * closes of one position, such as split take-profit levels, never add up to
   * more than the position.
   */
  rounding?: CloseSizeRounding;
} & (
  | {
      /** Percent of the position to close, 0 to 100. */
      percent: number;
      usdAmount?: never;
    }
  | {
      /** USD value to close; above the position's value closes all of it. */
      usdAmount: number | string;
      percent?: never;
    }
);

/** How {@link calculateCloseSize} puts a partial size on the size grid. */
export type CloseSizeRounding = 'up' | 'down';

/** Result of {@link calculateCloseSize}. */
export type CloseSize = {
  /**
   * Size to close, on the venue's size grid, or the exact position size when
   * the close covers the whole position.
   */
  size: number;
  /** Value of the requested share before size rounding, in USD to the cent. */
  usdValue: number;
};

/**
 * Size to close for a percent or USD amount of a position, in exact decimal
 * arithmetic. A request for the whole position returns the exact position
 * size. Otherwise, by default, the size rounds half up to `sizeDecimals`;
 * when that leaves it below the requested size, one size step is added so the
 * close covers the requested value. With `rounding: 'down'` it rounds down to
 * `sizeDecimals` instead. The result never exceeds the position.
 *
 * @param params - See {@link CloseSizeParams}.
 * @returns The close size and value, or undefined when an input is missing,
 * out of range or not a number, the position is empty, or `rounding: 'down'`
 * leaves a requested size below one size step.
 */
export function calculateCloseSize(
  params: CloseSizeParams,
): CloseSize | undefined {
  const { sizeDecimals } = params;
  const positionSize = toDecimal(params.positionSize)?.abs();
  const price = toPositiveDecimal(params.price);
  if (
    !Number.isInteger(sizeDecimals) ||
    sizeDecimals < 0 ||
    !positionSize?.isGreaterThan(0) ||
    price === undefined
  ) {
    return undefined;
  }

  let requestedSize: BigNumber;
  if (params.usdAmount === undefined) {
    const percent = toDecimal(params.percent);
    if (percent === undefined || percent.lt(0) || percent.gt(100)) {
      return undefined;
    }
    requestedSize = percent.dividedBy(100).multipliedBy(positionSize);
  } else {
    const usdAmount = toDecimal(params.usdAmount);
    if (usdAmount === undefined || usdAmount.lt(0)) {
      return undefined;
    }
    requestedSize = BigNumber.min(usdAmount.dividedBy(price), positionSize);
  }

  let size: BigNumber;
  if (requestedSize.gte(positionSize)) {
    size = positionSize;
  } else if (params.rounding === 'down') {
    size = requestedSize.decimalPlaces(sizeDecimals, BigNumber.ROUND_DOWN);
    if (size.isZero() && requestedSize.isGreaterThan(0)) {
      // Below one size step: no order can close it.
      return undefined;
    }
  } else {
    size = requestedSize.decimalPlaces(sizeDecimals, BigNumber.ROUND_HALF_UP);
    if (size.lt(requestedSize)) {
      size = size.plus(new BigNumber(1).shiftedBy(-sizeDecimals));
    }
  }

  return {
    size: BigNumber.min(size, positionSize).toNumber(),
    usdValue: roundUsd(requestedSize.multipliedBy(price)).toNumber(),
  };
}
