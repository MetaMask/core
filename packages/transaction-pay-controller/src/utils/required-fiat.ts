import { BigNumber } from 'bignumber.js';

import { getTokenFiatRate } from './token';
import type {
  TransactionPayControllerMessenger,
  TransactionTokenRequired,
} from '../types';

/**
 * Calculate fiat rates for a specific token.
 *
 * @param token - The required token.
 * @param messenger - The transaction pay controller messenger.
 * @returns The fiat rates or undefined if the rates are not available.
 */
export function calculateFiat(
  token: TransactionTokenRequired,
  messenger: TransactionPayControllerMessenger,
) {
  const { address, amountHuman, balanceHuman, chainId } = token;

  const { usdRate, fiatRate } =
    getTokenFiatRate(messenger, address, chainId) ?? {};

  if (usdRate === undefined || fiatRate === undefined) {
    return undefined;
  }

  const amountFiat = new BigNumber(amountHuman)
    .multipliedBy(fiatRate)
    .toString(10);

  const amountUsd = new BigNumber(amountHuman)
    .multipliedBy(usdRate)
    .toString(10);

  const balanceFiat = new BigNumber(balanceHuman)
    .multipliedBy(fiatRate)
    .toString(10);

  const balanceUsd = new BigNumber(balanceHuman)
    .multipliedBy(usdRate)
    .toString(10);

  return {
    amountFiat,
    amountUsd,
    balanceFiat,
    balanceUsd,
  };
}
