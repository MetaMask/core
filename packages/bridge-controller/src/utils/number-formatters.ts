/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { BigNumber } from 'bignumber.js';

import type { DeepPartial } from '../types.js';
import type { QuoteResponse } from '../validators/quote-response.js';
import { assetIdsMatch } from './assets.js';

/**
 * 1500000 -> 1.5
 *
 * @param value - The value to convert to token amount
 * @param decimals - The number of decimals to convert to
 * @returns The token amount in string format
 */
export const calcNormalizedTokenAmount = (
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
export const calcAtomicTokenAmount = (
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
      (value): value is Partial<QuoteResponse['quote']['dest']> =>
        value !== undefined && value !== null,
    );

  if (!fees || fees.length === 0) {
    return undefined;
  }

  /**
   * Fees and prices can be denominated in different assets, so we need to check if all fees have the same units
   */
  const isSameAssetForAllFees = fees.reduce(
    (acc, fee) =>
      acc && assetIdsMatch(fee.asset?.assetId, fees[0]?.asset?.assetId),
    true,
  );

  /**
   * Keys that require the asset to be the same for all fees
   */
  const AMOUNT_KEYS = [
    'amount' as const,
    'normalizedAmount' as const,
    'minAmount' as const,
    'minAmountNormalized' as const,
  ];

  /**
   * Keys that can be aggregated across all fees
   */
  const FIAT_OR_USD_KEYS = [
    'valueInCurrency' as const,
    'usd' as const,
    'minAmountValueInCurrency' as const,
    'minAmountUsd' as const,
  ];

  return fees.reduce((acc, fee) => {
    const newAcc = { ...acc };
    if (isSameAssetForAllFees && fee.asset) {
      newAcc.asset = fee.asset;
    }

    AMOUNT_KEYS.forEach((key) => {
      const value = fee[key];
      if (value && isSameAssetForAllFees) {
        newAcc[key] = new BigNumber(acc[key] ?? 0).plus(value).toFixed();
      }
    });

    FIAT_OR_USD_KEYS.forEach((key) => {
      const value = fee[key];
      if (value) {
        newAcc[key] = new BigNumber(acc[key] ?? 0).plus(value).toFixed();
      }
    });

    return newAcc;
  }, {});
};
