import type { FeeCalculationResult } from '../types/index.js';

/** Inputs to {@link calculateFeeNotionalUsd}. */
export type FeeNotionalParams = (
  | {
      /** Order value in USD. */
      usdAmount: number | string;
    }
  | {
      /** Size in base units; the sign is ignored. */
      size: number | string;
      /**
       * Price the size is valued at. For a take-profit and stop-loss pair,
       * pass both trigger prices: the higher one sets the notional, and a
       * blank (`''`) leg counts as unset.
       */
      price: number | string | readonly [number | string, number | string];
    }
) & {
  /** Percent of the notional the order covers, such as a partial close. Defaults to 100. */
  closePercent?: number;
  /** Multiplier on the notional, such as 2 for a flip that closes and reopens. Defaults to 1. */
  multiplier?: number;
};

/**
 * Read an amount, allowing `$`, `,` and surrounding spaces. A string that is
 * not wholly a number, such as `12oops`, reads as NaN.
 *
 * @param value - The amount.
 * @returns The number, or NaN when it is empty or malformed.
 */
function toNumber(value: number | string): number {
  if (typeof value === 'number') {
    return value;
  }
  const normalized = value.replace(/[$,]/gu, '').trim();
  return normalized === '' ? Number.NaN : Number(normalized);
}

/**
 * Higher price of a TP/SL pair. A blank leg (`''`) is an unset trigger and is
 * skipped, as Extension's edit dialog sends it; a malformed leg is not.
 *
 * @param prices - Take-profit and stop-loss trigger prices.
 * @returns The higher set price, or NaN when no leg is set or one is malformed.
 */
function higherTriggerPrice(
  prices: readonly [number | string, number | string],
): number {
  const set = prices.filter(
    (price) => typeof price === 'number' || price.trim() !== '',
  );
  return set.length === 0 ? Number.NaN : Math.max(...set.map(toNumber));
}

/**
 * USD notional a fee is charged on: the absolute order value, or size times
 * price (the higher trigger price of a TP/SL pair), scaled by `closePercent`
 * and `multiplier`.
 *
 * @param params - See {@link FeeNotionalParams}. Strings may carry `$` or `,`.
 * @returns The notional, or undefined when an input is empty, malformed or
 * not finite.
 */
export function calculateFeeNotionalUsd(
  params: FeeNotionalParams,
): number | undefined {
  const { closePercent = 100, multiplier = 1 } = params;
  const notional =
    'usdAmount' in params
      ? Math.abs(toNumber(params.usdAmount))
      : Math.abs(toNumber(params.size)) *
        (typeof params.price === 'object'
          ? higherTriggerPrice(params.price)
          : toNumber(params.price));
  const scaled = notional * (closePercent / 100) * multiplier;
  return Number.isFinite(scaled) ? scaled : undefined;
}

/**
 * Total fee rate before a MetaMask fee discount: the protocol rate plus
 * `undiscountedMetamaskFeeRate`. Equal to `feeRate` when no discount applied
 * or the quote does not report the undiscounted rate.
 *
 * @param feeResult - A fee quote from `calculateFees`.
 * @returns The undiscounted rate as a decimal, or undefined when `feeRate` is
 * unknown and no discount is reported.
 */
export function getUndiscountedFeeRate(
  feeResult: Pick<
    FeeCalculationResult,
    | 'feeRate'
    | 'protocolFeeRate'
    | 'metamaskFeeRate'
    | 'undiscountedMetamaskFeeRate'
  >,
): number | undefined {
  const { protocolFeeRate, metamaskFeeRate, undiscountedMetamaskFeeRate } =
    feeResult;
  return protocolFeeRate !== undefined &&
    undiscountedMetamaskFeeRate !== undefined &&
    undiscountedMetamaskFeeRate !== metamaskFeeRate
    ? protocolFeeRate + undiscountedMetamaskFeeRate
    : feeResult.feeRate;
}

/**
 * Fee amount before a MetaMask fee discount, to show beside the discounted
 * fee.
 *
 * @param params - Fee inputs.
 * @param params.notionalUsd - Notional from {@link calculateFeeNotionalUsd}.
 * @param params.feeResult - A fee quote from `calculateFees`.
 * @returns The undiscounted fee in USD, or undefined when the notional or
 * rate is unknown.
 */
export function calculateUndiscountedFeeAmount(params: {
  notionalUsd: number | undefined;
  feeResult: Parameters<typeof getUndiscountedFeeRate>[0];
}): number | undefined {
  const rate = getUndiscountedFeeRate(params.feeResult);
  if (params.notionalUsd === undefined || rate === undefined) {
    return undefined;
  }
  const amount = params.notionalUsd * rate;
  return Number.isFinite(amount) ? amount : undefined;
}
