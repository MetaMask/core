import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { TransactionPayControllerMessenger } from '..';
import { projectLogger } from '../logger';
import type {
  TransactionPaymentToken,
  UpdatePaymentTokenRequest,
  UpdateTransactionDataCallback,
} from '../types';
import {
  getTokenBalance,
  getTokenFiatRate,
  getTokenInfo,
} from '../utils/token';
import { getTransaction } from '../utils/transaction';

const log = createModuleLogger(projectLogger, 'update-payment-token');

export type UpdatePaymentTokenOptions = {
  messenger: TransactionPayControllerMessenger;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update the payment token for a specific transaction.
 *
 * @param request  - Request parameters.
 * @param options - Options bag.
 */
export function updatePaymentToken(
  request: UpdatePaymentTokenRequest,
  options: UpdatePaymentTokenOptions,
): void {
  const { transactionId, tokenAddress, chainId } = request;
  const { messenger, updateTransactionData } = options;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const paymentToken = getPaymentToken({
    chainId,
    from: transaction?.txParams.from as Hex,
    messenger,
    tokenAddress,
  });

  if (!paymentToken) {
    throw new Error('Payment token not found');
  }

  log('Updated payment token', { transactionId, paymentToken });

  updateTransactionData(transactionId, (data) => {
    data.paymentToken = paymentToken;
  });
}

/**
 * Generate the full payment token data from a token address and chain ID.
 *
 * @param request - The payment token request parameters.
 * @param request.chainId - The chain ID.
 * @param request.from - The address to get the token balance for.
 * @param request.messenger - The transaction pay controller messenger.
 * @param request.tokenAddress - The token address.
 * @returns The payment token or undefined if the token data could not be retrieved.
 */
function getPaymentToken({
  chainId,
  from,
  messenger,
  tokenAddress,
}: {
  chainId: Hex;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  tokenAddress: Hex;
}): TransactionPaymentToken | undefined {
  const { decimals, symbol } =
    getTokenInfo(messenger, tokenAddress, chainId) ?? {};

  if (decimals === undefined || !symbol) {
    return undefined;
  }

  const tokenFiatRate = getTokenFiatRate(messenger, tokenAddress, chainId);

  if (tokenFiatRate === undefined) {
    return undefined;
  }

  const balance = getTokenBalance(messenger, from, chainId, tokenAddress);
  const balanceRawValue = new BigNumber(balance);
  const balanceHumanValue = new BigNumber(balance).shiftedBy(-decimals);
  const balanceRaw = balanceRawValue.toFixed(0);
  const balanceHuman = balanceHumanValue.toString(10);

  const balanceFiat = balanceHumanValue
    .multipliedBy(tokenFiatRate.fiatRate)
    .toString(10);

  const balanceUsd = balanceHumanValue
    .multipliedBy(tokenFiatRate.usdRate)
    .toString(10);

  return {
    address: tokenAddress,
    balanceFiat,
    balanceHuman,
    balanceRaw,
    balanceUsd,
    chainId,
    decimals,
    symbol,
  };
}
