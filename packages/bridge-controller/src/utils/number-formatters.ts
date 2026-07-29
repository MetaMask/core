/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { BigNumber } from 'bignumber.js';

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
