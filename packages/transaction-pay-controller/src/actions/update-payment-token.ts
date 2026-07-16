import { createModuleLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { projectLogger } from '../logger.js';
import type {
  TransactionPaymentToken,
  UpdatePaymentTokenRequest,
  UpdateTransactionDataCallback,
} from '../types.js';
import {
  computeTokenAmounts,
  getTokenBalance,
  getTokenFiatRate,
  getTokenInfo,
} from '../utils/token.js';
import { getTransaction } from '../utils/transaction.js';
import type { TransactionPayControllerMessenger } from './../index.js';

const log = createModuleLogger(projectLogger, 'update-payment-token');

export type UpdatePaymentTokenOptions = {
  messenger: TransactionPayControllerMessenger;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update the payment token for a specific transaction.
 *
 * @param request - Request parameters.
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

  const state = messenger.call('TransactionPayController:getState');
  const transactionPayData = state.transactionData[transactionId];
  const accountOverride = transactionPayData?.accountOverride;

  const paymentToken = getPaymentToken({
    chainId,
    from: accountOverride ?? (transaction.txParams.from as Hex),
    messenger,
    tokenAddress,
    // For post-quote (withdraw) flows the selected token is the receive
    // destination, which may live on a chain the wallet does not actively
    // track, so no local market price or native-currency rate exists.
    // Allow resolution without a fiat rate so selection is not blocked; the
    // received amount is determined by the quote, not local rates.
    allowMissingFiatRate: Boolean(transactionPayData?.isPostQuote),
  });

  if (!paymentToken) {
    throw new Error('Payment token not found');
  }

  log('Updated payment token', { transactionId, paymentToken });

  updateTransactionData(transactionId, (data) => {
    data.paymentToken = paymentToken;
    data.fiatPayment = {};
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
 * @param request.allowMissingFiatRate - Whether to resolve the token with
 * zeroed fiat rates when no local rate is available.
 * @returns The payment token or undefined if the token data could not be retrieved.
 */
function getPaymentToken({
  chainId,
  from,
  messenger,
  tokenAddress,
  allowMissingFiatRate,
}: {
  chainId: Hex;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  tokenAddress: Hex;
  allowMissingFiatRate?: boolean;
}): TransactionPaymentToken | undefined {
  const { decimals, symbol } =
    getTokenInfo(messenger, tokenAddress, chainId) ?? {};

  if (decimals === undefined || !symbol) {
    return undefined;
  }

  let tokenFiatRate = getTokenFiatRate(messenger, tokenAddress, chainId);

  if (tokenFiatRate === undefined) {
    if (!allowMissingFiatRate) {
      return undefined;
    }

    // No local fiat rate for this chain and token, such as a withdraw
    // destination on a chain the wallet does not track. Resolve with zeroed
    // fiat rates so the token can be selected; fiat display is best-effort.
    tokenFiatRate = { usdRate: '0', fiatRate: '0' };
  }

  const balance = getTokenBalance(messenger, from, chainId, tokenAddress);

  const {
    raw: balanceRaw,
    human: balanceHuman,
    usd: balanceUsd,
    fiat: balanceFiat,
  } = computeTokenAmounts(balance, decimals, tokenFiatRate);

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
