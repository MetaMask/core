import { createModuleLogger } from '@metamask/utils';
import type { CaipAssetType, Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '../index.js';
import { projectLogger } from '../logger.js';
import type {
  TransactionPaymentToken,
  UpdatePaymentTokenRequest,
  UpdateTransactionDataCallback,
} from '../types.js';
import { getEvmAccountAddress, getAssetAccount } from '../utils/account.js';
import {
  computeTokenAmounts,
  getAssetBalance,
  getAssetFiatRate,
  getAssetInfo,
  getEvmAsset,
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
  const { assetId, transactionId } = request;
  const { messenger, updateTransactionData } = options;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  const state = messenger.call('TransactionPayController:getState');
  const transactionPayData = state.transactionData[transactionId];
  const accountOverride = transactionPayData?.accountOverride;
  const from = transaction.txParams.from as Hex;

  const paymentToken = getPaymentToken({
    accountId: getAssetAccountId({
      accountOverride,
      assetId,
      from,
      messenger,
    }),
    assetId,
    messenger,
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
 * Generate the full payment token data for an asset from `AssetsController`
 * state.
 *
 * @param request - The payment token request parameters.
 * @param request.accountId - ID of the `InternalAccount` holding the asset.
 * @param request.assetId - CAIP-19 asset type of the payment token.
 * @param request.messenger - The transaction pay controller messenger.
 * @param request.allowMissingFiatRate - Whether to resolve the token with
 * zeroed fiat rates when no local rate is available.
 * @returns The payment token or undefined if the asset data could not be retrieved.
 */
function getPaymentToken({
  accountId,
  assetId,
  messenger,
  allowMissingFiatRate,
}: {
  accountId: string | undefined;
  assetId: CaipAssetType;
  messenger: TransactionPayControllerMessenger;
  allowMissingFiatRate: boolean;
}): TransactionPaymentToken | undefined {
  const { decimals, symbol } = getAssetInfo(messenger, assetId) ?? {};

  if (decimals === undefined || !symbol) {
    return undefined;
  }

  let fiatRates = getAssetFiatRate(messenger, assetId);

  if (fiatRates === undefined) {
    if (!allowMissingFiatRate) {
      return undefined;
    }

    // No local fiat rate for this asset, such as a withdraw destination on a
    // chain the wallet does not track. Resolve with zeroed fiat rates so the
    // token can be selected; fiat display is best-effort.
    fiatRates = { usdRate: '0', fiatRate: '0' };
  }

  const balance = accountId
    ? getAssetBalance(messenger, accountId, assetId)
    : '0';

  const {
    raw: balanceRaw,
    human: balanceHuman,
    usd: balanceUsd,
    fiat: balanceFiat,
  } = computeTokenAmounts(balance, decimals, fiatRates);

  return {
    assetId,
    balanceFiat,
    balanceHuman,
    balanceRaw,
    balanceUsd,
    decimals,
    symbol,
  };
}

/**
 * Get the ID of the `InternalAccount` holding a payment token.
 *
 * An EVM asset is held by the EVM account of the transaction. A non-EVM asset
 * is held by the account resolved by {@link getAssetAccount}.
 *
 * @param request - Request parameters.
 * @param request.accountOverride - ID of the account override of the transaction, if any.
 * @param request.assetId - CAIP-19 asset type of the payment token.
 * @param request.from - Address of the transaction sender.
 * @param request.messenger - The transaction pay controller messenger.
 * @returns The account ID, or undefined if the EVM account is not found.
 */
function getAssetAccountId({
  accountOverride,
  assetId,
  from,
  messenger,
}: {
  accountOverride: string | undefined;
  assetId: CaipAssetType;
  from: Hex;
  messenger: TransactionPayControllerMessenger;
}): string | undefined {
  if (getEvmAsset(assetId)) {
    const evmAddress = getEvmAccountAddress(messenger, accountOverride, from);
    const { accountIdByAddress } = messenger.call(
      'AccountsController:getState',
    );

    return (
      accountIdByAddress[evmAddress] ??
      accountIdByAddress[evmAddress.toLowerCase()]
    );
  }

  return getAssetAccount(messenger, { accountOverride, assetId, from }).id;
}
