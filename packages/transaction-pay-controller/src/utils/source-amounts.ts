import { BigNumber } from 'bignumber.js';

import { getTokenFiatRate } from './token';
import type {
  TransactionPayControllerMessenger,
  TransactionPaymentToken,
  TransactionToken,
} from '..';

/**
 * Calculate the required source amount for a payment token to cover a target token.
 *
 * @param paymentToken - Selected payment token.
 * @param token - Target token to cover.
 * @param messenger - Controller messenger.
 * @returns The source amount or undefined if calculation failed.
 */
export function calculateSourceAmount(
  paymentToken: TransactionPaymentToken,
  token: TransactionToken,
  messenger: TransactionPayControllerMessenger,
) {
  const paymentTokenFiatRate = getTokenFiatRate(
    messenger,
    paymentToken.address,
    paymentToken.chainId,
  );

  if (!paymentTokenFiatRate) {
    return undefined;
  }

  const hasBalance = new BigNumber(token.balanceFiat).gt(token.amountFiat);

  const isSameTokenSelected =
    token.address.toLowerCase() === paymentToken.address.toLowerCase() &&
    token.chainId === paymentToken.chainId;

  if (token.skipIfBalance && hasBalance) {
    return undefined;
  }

  if (isSameTokenSelected) {
    return undefined;
  }

  const sourceAmountHumanValue = new BigNumber(token.amountUsd).div(
    paymentTokenFiatRate.usdRate,
  );

  const sourceAmountHuman = sourceAmountHumanValue.toString(10);

  const sourceAmountRaw = sourceAmountHumanValue
    .shiftedBy(paymentToken.decimals)
    .toFixed(0);

  return {
    sourceAmountHuman,
    sourceAmountRaw,
  };
}
