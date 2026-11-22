import type { FeeCalculationResult } from '../types/index.js';
import { parseFormattedPrice } from './stringParseUtils.js';

/** Inputs to {@link calculateFeeNotionalUsd}. */
export type FeeNotionalParams = (
  | {
      /** Order value in USD. */
      usdAmount: number | string;
    }
  | {
      /** Size in base units; the sign is ignored. */
      size: number | string;
      /** Price the size is valued at. */
      price: number | string;
    }
) & {
  /** Percent of the notional the order covers, such as a partial close. Defaults to 100. */
  closePercent?: number;
  /** Multiplier on the notional, such as 2 for a flip that closes and reopens. Defaults to 1. */
  multiplier?: number;
};

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : parseFormattedPrice(value);
}

/**
 * USD notional a fee is charged on: the absolute order value, or size times
 * price, scaled by `closePercent` and `multiplier`.
 *
 * @param params - See {@link FeeNotionalParams}. Strings may carry `$` or `,`.
 * @returns The notional, or undefined when an input is missing or not a number.
 */
export function calculateFeeNotionalUsd(
  params: FeeNotionalParams,
): number | undefined {
  const { closePercent = 100, multiplier = 1 } = params;
  const notional =
    'usdAmount' in params
      ? Math.abs(toNumber(params.usdAmount))
      : Math.abs(toNumber(params.size)) * toNumber(params.price);
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
