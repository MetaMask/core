/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { BigNumber } from 'bignumber.js';

import type { DeepPartial } from '../types';
import type { QuoteResponse } from '../validators/quote-response';

/**
 * 1500000 -> 1.5
 *
 * @param value - The value to convert to token amount
 * @param decimals - The number of decimals to convert to
 * @returns The token amount in string format
 */
export const calcTokenAmount = (
  value: string | BigNumber | undefined,
  decimals: number | undefined,
) => {
  if (value === undefined || decimals === undefined) {
    return undefined;
  }
  const divisor = new BigNumber(10).pow(decimals ?? 0);
  return new BigNumber(value).div(divisor);
};

/**
 * 1.5 -> 1500000
 *
 * @param value - The amount to convert to token value
 * @param decimals - The number of decimals to convert to
 * @returns The token value in string format
 */
export const calcTokenValue = (
  value: string | BigNumber | undefined,
  decimals: number | undefined,
) => {
  if (value === undefined || decimals === undefined) {
    return undefined;
  }
  const divisor = new BigNumber(10).pow(decimals);
  return new BigNumber(value).times(divisor).toFixed();
};

/**
 * @deprecated No longer used
 * @param estimatedProcessingTimeInSeconds - The estimated processing time in seconds
 * @returns The estimated processing time in minutes
 */
export const formatEtaInMinutes = (
  estimatedProcessingTimeInSeconds: number,
) => {
  if (estimatedProcessingTimeInSeconds < 60) {
    return `< 1`;
  }
  return (estimatedProcessingTimeInSeconds / 60).toFixed();
};

/**
 * Aggregates a list of amounts into a single fee object. If fees have different assets,
 * the returned object will only aggregate the usd and valueInCurrency values.
 *
 * @param maybeFees - The list of fees to aggregate
 * @returns The aggregated fee object, or null if no fees are provided
 */
export const sumAmounts = (
  ...maybeFees: (
    | (DeepPartial<QuoteResponse['quote']['dest']> | undefined | null)[]
    | undefined
  )[]
): DeepPartial<QuoteResponse['quote']['dest']> | undefined => {
  const fees = maybeFees
    .flat()
    .flat()
    .filter(
      (value): value is DeepPartial<QuoteResponse['quote']['dest']> =>
        value !== undefined && value !== null,
    );

  if (!fees || fees.length === 0) {
    return undefined;
  }

  const isSameAssetForAllFees =
    new Set(fees.map((fee) => fee?.asset?.assetId?.toLowerCase())).size === 1;

  const aggregatedFee = fees.reduce(
    (acc, fee) => {
      const {
        amount,
        normalizedAmount,
        valueInCurrency,
        usd,
        minAmount,
        minAmountNormalized,
        minAmountValueInCurrency,
        minAmountUsd,
      } = fee;
      return {
        amount: acc.amount.plus(amount ?? 0),
        normalizedAmount: acc.normalizedAmount.plus(normalizedAmount ?? 0),
        valueInCurrency: acc.valueInCurrency.plus(valueInCurrency ?? 0),
        usd: usd ? acc.usd.plus(usd) : acc.usd,
        minAmount: acc.minAmount.plus(minAmount ?? 0),
        minAmountNormalized: acc.minAmountNormalized.plus(
          minAmountNormalized ?? 0,
        ),
        minAmountValueInCurrency: acc.minAmountValueInCurrency.plus(
          minAmountValueInCurrency ?? 0,
        ),
        minAmountUsd: acc.minAmountUsd.plus(minAmountUsd ?? 0),
        asset: isSameAssetForAllFees ? fees[0]?.asset : undefined,
      };
    },
    {
      amount: new BigNumber(0),
      normalizedAmount: new BigNumber(0),
      valueInCurrency: new BigNumber(0),
      usd: new BigNumber(0),
      minAmount: new BigNumber(0),
      minAmountNormalized: new BigNumber(0),
      minAmountValueInCurrency: new BigNumber(0),
      minAmountUsd: new BigNumber(0),
    },
  );

  return {
    amount: isSameAssetForAllFees ? aggregatedFee.amount.toFixed() : undefined,
    normalizedAmount: isSameAssetForAllFees
      ? aggregatedFee.normalizedAmount.toFixed()
      : undefined,
    valueInCurrency: aggregatedFee.valueInCurrency.toFixed(),
    usd: aggregatedFee.usd.toFixed(),
    asset: isSameAssetForAllFees ? fees[0]?.asset : undefined,
    minAmount: isSameAssetForAllFees
      ? aggregatedFee.minAmount.toFixed()
      : undefined,
    minAmountNormalized: isSameAssetForAllFees
      ? aggregatedFee.minAmountNormalized.toFixed()
      : undefined,
    minAmountValueInCurrency: aggregatedFee.minAmountValueInCurrency.toFixed(),
    minAmountUsd: aggregatedFee.minAmountUsd.toFixed(),
  };
};
