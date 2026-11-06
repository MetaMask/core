/**
 * Close-position figures shared by Mobile, Extension and Terminal: the cash a
 * close returns ("You'll receive") and a fill's closed PnL net of its fee.
 */
import { BigNumber } from 'bignumber.js';

import { CLOSE_POSITION_CONFIG } from '../constants/perpsConfig.js';
import type { PerpsProviderType, Position } from '../types/index.js';

/**
 * Whether a provider's isolated `Position.marginUsed` already holds the
 * position's unrealized PnL at mark. Hyperliquid's does. Lighter's is the
 * initial margin the position requires at its current value. Cross
 * `marginUsed` never holds it.
 */
const ISOLATED_MARGIN_INCLUDES_UNREALIZED_PNL: Record<
  PerpsProviderType,
  boolean
> = {
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
   * Provider holding the position. It decides whether isolated margin already
   * holds the unrealized PnL; for an unknown provider, isolated margin
   * returned is undefined. `Position.providerId` is only set under
   * aggregation, so pass the provider explicitly.
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
 * margin on a provider whose isolated margin holds it, none otherwise.
 *
 * @param position - The position being closed.
 * @param providerId - Provider holding the position.
 * @returns The held PnL, or undefined while it is needed but unknown,
 * including for isolated margin on an unknown provider.
 */
function heldUnrealizedPnl(
  position: CloseReceiveEstimateParams['position'],
  providerId: PerpsProviderType,
): BigNumber | undefined {
  if (position.leverage.type !== 'isolated') {
    return new BigNumber(0);
  }
  if (!Object.hasOwn(ISOLATED_MARGIN_INCLUDES_UNREALIZED_PNL, providerId)) {
    return undefined;
  }
  return ISOLATED_MARGIN_INCLUDES_UNREALIZED_PNL[providerId]
    ? toDecimal(position.unrealizedPnl)
    : new BigNumber(0);
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
 * Backing margin is `marginUsed`, less the unrealized PnL when the provider's
 * isolated margin holds it (Hyperliquid isolated). Cross margin, and Lighter
 * isolated margin, are taken as reported. The realized PnL replaces the
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
