import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenFiatRate } from './token';
import type {
  TransactionPayControllerMessenger,
  TransactionPaymentToken,
} from '..';
import { projectLogger } from '../logger';
import type {
  TransactionPaySourceAmount,
  TransactionData,
  TransactionPayRequiredToken,
} from '../types';

const log = createModuleLogger(projectLogger, 'source-amounts');

/**
 * Update the source amounts for a transaction.
 *
 * @param transactionId - ID of the transaction to update.
 * @param transactionData - Existing transaction data.
 * @param messenger - Controller messenger.
 */
export function updateSourceAmounts(
  transactionId: string,
  transactionData: TransactionData | undefined,
  messenger: TransactionPayControllerMessenger,
) {
  if (!transactionData) {
    return;
  }

  const { paymentToken, tokens } = transactionData;

  if (!tokens.length || !paymentToken) {
    return;
  }

  const sourceAmounts = tokens
    .map((t) => calculateSourceAmount(paymentToken, t, messenger))
    .filter(Boolean) as TransactionPaySourceAmount[];

  log('Updated source amounts', { transactionId, sourceAmounts });

  transactionData.sourceAmounts = sourceAmounts;
}

/**
 * Calculate the required source amount for a payment token to cover a target token.
 *
 * @param paymentToken - Selected payment token.
 * @param token - Target token to cover.
 * @param messenger - Controller messenger.
 * @returns The source amount or undefined if calculation failed.
 */
function calculateSourceAmount(
  paymentToken: TransactionPaymentToken,
  token: TransactionPayRequiredToken,
  messenger: TransactionPayControllerMessenger,
): TransactionPaySourceAmount | undefined {
  const paymentTokenFiatRate = getTokenFiatRate(
    messenger,
    paymentToken.address,
    paymentToken.chainId,
  );

  if (!paymentTokenFiatRate) {
    return undefined;
  }

  const hasBalance = new BigNumber(token.balanceRaw).gte(token.amountRaw);

  const isSameTokenSelected =
    token.address.toLowerCase() === paymentToken.address.toLowerCase() &&
    token.chainId === paymentToken.chainId;

  if (token.skipIfBalance && hasBalance) {
    log('Skipping token as sufficient balance', {
      tokenAddress: token.address,
    });
    return undefined;
  }

  if (isSameTokenSelected) {
    log('Skipping token as same as payment token');
    return undefined;
  }

  const sourceAmountHumanValue = new BigNumber(token.amountUsd).div(
    paymentTokenFiatRate.usdRate,
  );

  const sourceAmountHuman = sourceAmountHumanValue.toString(10);

  const sourceAmountRaw = sourceAmountHumanValue
    .shiftedBy(paymentToken.decimals)
    .toFixed(0);

  if (token.amountRaw === '0') {
    log('Skipping token as zero amount', { tokenAddress: token.address });
    return undefined;
  }

  return {
    sourceAmountHuman,
    sourceAmountRaw,
    targetTokenAddress: token.address,
  };
}
