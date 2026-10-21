import {
  createModuleLogger,
  KnownCaipNamespace,
  parseCaipAssetType,
  toCaipAccountId,
} from '@metamask/utils';
import type { CaipAssetType, Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '../index.js';
import { projectLogger } from '../logger.js';
import type {
  EvmPaymentToken,
  NonEvmPaymentToken,
  TransactionPaymentToken,
  UpdatePaymentTokenRequest,
  UpdateTransactionDataCallback,
} from '../types.js';
import {
  computeTokenAmounts,
  getAssetBalance,
  getAssetFiatRate,
  getAssetInfo,
  getTokenBalance,
  getTokenFiatRate,
  getTokenInfo,
} from '../utils/token.js';
import { getTransaction } from '../utils/transaction.js';

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
  const { transactionId } = request;
  const { messenger, updateTransactionData } = options;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const state = messenger.call('TransactionPayController:getState');
  const transactionPayData = state.transactionData[transactionId];
  const accountOverride = transactionPayData?.accountOverride;

  const paymentToken: TransactionPaymentToken | undefined =
    'assetId' in request
      ? getNonEvmPaymentToken({
          assetId: request.assetId,
          messenger,
          walletAccountId: request.walletAccountId,
        })
      : getPaymentToken({
          chainId: request.chainId,
          from: accountOverride ?? (transaction.txParams.from as Hex),
          messenger,
          tokenAddress: request.tokenAddress,
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
    data.quoteError = undefined;
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
}): EvmPaymentToken | undefined {
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

/**
 * Generate the full payment token data for a non-EVM asset held by an
 * `InternalAccount`.
 *
 * @param request - The payment token request parameters.
 * @param request.assetId - CAIP-19 asset type of the payment token.
 * @param request.messenger - The transaction pay controller messenger.
 * @param request.walletAccountId - ID of the `InternalAccount` holding the asset.
 * @returns The payment token or undefined if the asset data could not be retrieved.
 */
function getNonEvmPaymentToken({
  assetId,
  messenger,
  walletAccountId,
}: {
  assetId: CaipAssetType;
  messenger: TransactionPayControllerMessenger;
  walletAccountId: string;
}): NonEvmPaymentToken | undefined {
  const { chainId, chain } = parseCaipAssetType(assetId);

  if (chain.namespace === KnownCaipNamespace.Eip155) {
    throw new Error('EVM payment tokens must use tokenAddress and chainId');
  }

  const account = messenger.call('AccountsController:getState').internalAccounts
    .accounts[walletAccountId];

  if (!account) {
    throw new Error('Payment token account not found');
  }

  if (!account.scopes.includes(chainId)) {
    throw new Error('Payment token account does not support the asset chain');
  }

  const { decimals, symbol } = getAssetInfo(messenger, assetId) ?? {};
  const fiatRates = getAssetFiatRate(messenger, assetId);

  if (decimals === undefined || !symbol || !fiatRates) {
    return undefined;
  }

  const balance = getAssetBalance(messenger, walletAccountId, assetId);

  const {
    raw: balanceRaw,
    human: balanceHuman,
    usd: balanceUsd,
    fiat: balanceFiat,
  } = computeTokenAmounts(balance, decimals, fiatRates);

  return {
    accountId: toCaipAccountId(
      chain.namespace,
      chain.reference,
      account.address,
    ),
    assetId,
    balanceFiat,
    balanceHuman,
    balanceRaw,
    balanceUsd,
    chainId,
    decimals,
    symbol,
    walletAccountId,
  };
}
