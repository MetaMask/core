import { TransactionStatus } from '@metamask/transaction-controller';
import type { BatchTransaction } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getStrategiesByName, getStrategyByName } from './strategy';
import {
  computeTokenAmounts,
  getLiveTokenBalance,
  getTokenFiatRate,
} from './token';
import { calculateTotals } from './totals';
import { getTransaction, updateTransaction } from './transaction';
import { TransactionPayStrategy } from '../constants';
import { projectLogger } from '../logger';
import type {
  QuoteRequest,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
  TransactionPayRequiredToken,
  TransactionPaySourceAmount,
  TransactionPayTotals,
  TransactionPaymentToken,
  UpdateTransactionDataCallback,
} from '../types';

const DEFAULT_REFRESH_INTERVAL = 30 * 1000; // 30 Seconds

const log = createModuleLogger(projectLogger, 'quotes');

export type UpdateQuotesRequest = {
  getStrategies: (transaction: TransactionMeta) => TransactionPayStrategy[];
  messenger: TransactionPayControllerMessenger;
  transactionData: TransactionData | undefined;
  transactionId: string;
  updateTransactionData: UpdateTransactionDataCallback;
};

/**
 * Update the quotes for a specific transaction.
 *
 * @param request - Request parameters.
 * @returns Boolean indicating if the quotes were updated.
 */
export async function updateQuotes(
  request: UpdateQuotesRequest,
): Promise<boolean> {
  const {
    getStrategies,
    messenger,
    transactionData,
    transactionId,
    updateTransactionData,
  } = request;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction || !transactionData) {
    throw new Error('Transaction not found');
  }

  if (transaction?.status !== TransactionStatus.unapproved) {
    return false;
  }

  log('Updating quotes', { transactionId });

  const {
    isMaxAmount,
    isPostQuote,
    paymentToken: originalPaymentToken,
    sourceAmounts,
    tokens,
  } = transactionData;

  const from = transaction.txParams.from as Hex;

  updateTransactionData(transactionId, (data) => {
    data.isLoading = true;
  });

  try {
    const paymentToken = await refreshPaymentTokenBalance({
      from,
      messenger,
      paymentToken: originalPaymentToken,
      transactionId,
      updateTransactionData,
    });

    const requests = buildQuoteRequests({
      from,
      isMaxAmount: isMaxAmount ?? false,
      isPostQuote,
      paymentToken,
      sourceAmounts,
      tokens,
      transactionId,
    });

    const { batchTransactions, quotes } = await getQuotes(
      transaction,
      requests,
      getStrategies,
      messenger,
    );

    const totals = calculateTotals({
      fiatPaymentAmountUsd: transactionData.fiatPayment?.amount,
      isMaxAmount,
      messenger,
      quotes: quotes as TransactionPayQuote<unknown>[],
      tokens,
      transaction,
    });
    const hasFiatQuote = quotes.some(
      (quote) => quote.strategy === TransactionPayStrategy.Fiat,
    );

    log('Calculated totals', { transactionId, totals });

    syncTransaction({
      batchTransactions,
      hasFiatQuote,
      isPostQuote,
      messenger: messenger as never,
      paymentToken,
      totals,
      transactionId,
    });

    updateTransactionData(transactionId, (data) => {
      data.quotes = quotes as never;
      data.quotesLastUpdated = Date.now();
      data.totals = totals;
    });
  } finally {
    updateTransactionData(transactionId, (data) => {
      data.isLoading = false;
    });
  }

  return true;
}

/**
 * Sync batch transactions to the transaction meta.
 *
 * @param request - Request object.
 * @param request.batchTransactions - Batch transactions to sync.
 * @param request.hasFiatQuote - Whether current quotes include fiat strategy.
 * @param request.isPostQuote - Whether this is a post-quote flow.
 * @param request.messenger - Messenger instance.
 * @param request.paymentToken - Payment token (source for standard flows, destination for post-quote).
 * @param request.totals - Calculated totals.
 * @param request.transactionId - ID of the transaction to sync.
 */
function syncTransaction({
  batchTransactions,
  hasFiatQuote,
  isPostQuote,
  messenger,
  paymentToken,
  totals,
  transactionId,
}: {
  batchTransactions: BatchTransaction[];
  hasFiatQuote: boolean;
  isPostQuote?: boolean;
  messenger: TransactionPayControllerMessenger;
  paymentToken: TransactionPaymentToken | undefined;
  totals: TransactionPayTotals;
  transactionId: string;
}): void {
  if (!paymentToken) {
    return;
  }

  updateTransaction(
    {
      transactionId,
      messenger: messenger as never,
      note: 'Update transaction pay data',
    },
    (tx: TransactionMeta) => {
      tx.batchTransactions = batchTransactions;
      tx.batchTransactionsOptions = {};

      const legacyTotalFiat = hasFiatQuote
        ? new BigNumber(totals.total.usd)
            .plus(totals.fees.provider.usd)
            .plus(totals.fees.sourceNetwork.estimate.usd)
            .plus(totals.fees.targetNetwork.usd)
            .plus(totals.fees.metaMask.usd)
            .toString(10)
        : totals.total.usd;

      tx.metamaskPay = {
        bridgeFeeFiat: new BigNumber(totals.fees.provider.usd)
          .plus(totals.fees.fiatProvider?.usd ?? 0)
          .toString(10),
        chainId: paymentToken.chainId,
        isPostQuote,
        networkFeeFiat: totals.fees.sourceNetwork.estimate.usd,
        targetFiat: totals.targetAmount.usd,
        tokenAddress: paymentToken.address,
        totalFiat: legacyTotalFiat,
      };
    },
  );
}

/**
 * Refresh quotes for all transactions if expired.
 *
 * @param messenger - Messenger instance.
 * @param updateTransactionData - Callback to update transaction data.
 * @param getStrategies - Callback to get ordered strategy names for a transaction.
 */
export async function refreshQuotes(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
  getStrategies: (transaction: TransactionMeta) => TransactionPayStrategy[],
): Promise<void> {
  const state = messenger.call('TransactionPayController:getState');
  const transactionIds = Object.keys(state.transactionData);

  for (const transactionId of transactionIds) {
    const transactionData = state.transactionData[transactionId];
    const { isLoading, quotes, quotesLastUpdated } = transactionData;

    if (isLoading || !quotes?.length) {
      continue;
    }

    const strategyName = quotes[0].strategy;
    const strategy = getStrategyByName(strategyName);

    const refreshInterval =
      (await strategy.getRefreshInterval?.({
        chainId: quotes[0].request.sourceChainId,
        messenger,
      })) ?? DEFAULT_REFRESH_INTERVAL;

    const isExpired = Date.now() - (quotesLastUpdated ?? 0) > refreshInterval;

    if (!isExpired) {
      continue;
    }

    const isUpdated = await updateQuotes({
      getStrategies,
      messenger,
      transactionData,
      transactionId,
      updateTransactionData,
    });

    if (isUpdated) {
      log('Refreshed quotes', { transactionId, strategy: strategyName });
    }
  }
}

/**
 * Build quote requests required to retrieve quotes.
 *
 * @param request - Request parameters.
 * @param request.from - Address from which the transaction is sent.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.isPostQuote - Whether this is a post-quote flow.
 * @param request.paymentToken - Payment token (source for standard flows, destination for post-quote).
 * @param request.sourceAmounts - Source amounts for the transaction.
 * @param request.tokens - Required tokens for the transaction.
 * @param request.transactionId - ID of the transaction.
 * @returns Array of quote requests.
 */
function buildQuoteRequests({
  from,
  isMaxAmount,
  isPostQuote,
  paymentToken,
  sourceAmounts,
  tokens,
  transactionId,
}: {
  from: Hex;
  isMaxAmount: boolean;
  isPostQuote?: boolean;
  paymentToken: TransactionPaymentToken | undefined;
  sourceAmounts: TransactionPaySourceAmount[] | undefined;
  tokens: TransactionPayRequiredToken[];
  transactionId: string;
}): QuoteRequest[] {
  if (!paymentToken) {
    return [];
  }

  if (isPostQuote) {
    // Post-quote flow: source = transaction's required token, target = paymentToken (destination)
    // The user wants to receive the transaction output in paymentToken
    return buildPostQuoteRequests({
      from,
      isMaxAmount,
      destinationToken: paymentToken,
      sourceAmounts,
      transactionId,
    });
  }

  // Standard flow: source = paymentToken, target = required tokens
  const requests = (sourceAmounts ?? []).map((sourceAmount) => {
    const token = tokens.find(
      (singleToken) => singleToken.address === sourceAmount.targetTokenAddress,
    ) as TransactionPayRequiredToken;

    return {
      from,
      isMaxAmount,
      sourceBalanceRaw: paymentToken.balanceRaw,
      sourceTokenAmount: sourceAmount.sourceAmountRaw,
      sourceChainId: paymentToken.chainId,
      sourceTokenAddress: paymentToken.address,
      targetAmountMinimum: token.allowUnderMinimum ? '0' : token.amountRaw,
      targetChainId: token.chainId,
      targetTokenAddress: token.address,
    };
  });

  if (!requests.length) {
    log('No quote requests', { transactionId });
  }

  return requests;
}

/**
 * Build quote requests for post-quote flows.
 * In this flow, the source is the transaction's required token,
 * and the target is the user's selected destination token (paymentToken).
 *
 * @param request - Request parameters.
 * @param request.from - Address from which the transaction is sent.
 * @param request.isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param request.destinationToken - Destination token (paymentToken in post-quote mode).
 * @param request.sourceAmounts - Source amounts for the transaction (includes source token info).
 * @param request.transactionId - ID of the transaction.
 * @returns Array of quote requests for post-quote flow.
 */
function buildPostQuoteRequests({
  from,
  isMaxAmount,
  destinationToken,
  sourceAmounts,
  transactionId,
}: {
  from: Hex;
  isMaxAmount: boolean;
  destinationToken: TransactionPaymentToken;
  sourceAmounts: TransactionPaySourceAmount[] | undefined;
  transactionId: string;
}): QuoteRequest[] {
  // Find the source amount where targetTokenAddress matches the destination token
  const sourceAmount = sourceAmounts?.find(
    (amount) =>
      amount.targetTokenAddress.toLowerCase() ===
      destinationToken.address.toLowerCase(),
  );

  // Same-token-same-chain cases are already filtered in source-amounts.ts
  if (
    !sourceAmount?.sourceBalanceRaw ||
    !sourceAmount.sourceChainId ||
    !sourceAmount.sourceTokenAddress
  ) {
    log('No valid source amount found for post-quote request', {
      transactionId,
    });
    return [];
  }

  const request: QuoteRequest = {
    from,
    isMaxAmount,
    isPostQuote: true,
    sourceBalanceRaw: sourceAmount.sourceBalanceRaw,
    sourceTokenAmount: sourceAmount.sourceAmountRaw,
    sourceChainId: sourceAmount.sourceChainId,
    sourceTokenAddress: sourceAmount.sourceTokenAddress,
    // For post-quote flows, use EXACT_INPUT - user specifies how much to send,
    // and we show them how much they'll receive after fees
    targetAmountMinimum: '0',
    targetChainId: destinationToken.chainId,
    targetTokenAddress: destinationToken.address,
  };

  log('Post-quote request built', { transactionId, request });

  // Currently only single token post-quote flows are supported.
  // Multiple token support would require multiple quotes for each required token.
  return [request];
}

async function refreshPaymentTokenBalance({
  from,
  messenger,
  paymentToken,
  transactionId,
  updateTransactionData,
}: {
  from: Hex;
  messenger: TransactionPayControllerMessenger;
  paymentToken: TransactionPaymentToken | undefined;
  transactionId: string;
  updateTransactionData: UpdateTransactionDataCallback;
}): Promise<TransactionPaymentToken | undefined> {
  if (!paymentToken) {
    return undefined;
  }

  try {
    const fiatRates = getTokenFiatRate(
      messenger,
      paymentToken.address,
      paymentToken.chainId,
    );

    if (!fiatRates) {
      return paymentToken;
    }

    const liveBalance = await getLiveTokenBalance(
      messenger,
      from,
      paymentToken.chainId,
      paymentToken.address,
    );

    const {
      raw: balanceRaw,
      human: balanceHuman,
      usd: balanceUsd,
      fiat: balanceFiat,
    } = computeTokenAmounts(liveBalance, paymentToken.decimals, fiatRates);

    const updatedToken = {
      ...paymentToken,
      balanceFiat,
      balanceHuman,
      balanceRaw,
      balanceUsd,
    };

    updateTransactionData(transactionId, (data) => {
      data.paymentToken = updatedToken;
    });

    log('Refreshed payment token balance', { transactionId, balanceRaw });

    return updatedToken;
  } catch (error) {
    log('Failed to refresh payment token balance', { transactionId, error });
    return paymentToken;
  }
}

/**
 * Retrieve quotes for a transaction.
 *
 * @param transaction - Transaction metadata.
 * @param requests - Quote requests.
 * @param getStrategies - Callback to get ordered strategy names for a transaction.
 * @param messenger - Controller messenger.
 * @returns An object containing batch transactions and quotes.
 */
async function getQuotes(
  transaction: TransactionMeta,
  requests: QuoteRequest[],
  getStrategies: (transaction: TransactionMeta) => TransactionPayStrategy[],
  messenger: TransactionPayControllerMessenger,
): Promise<{
  batchTransactions: BatchTransaction[];
  quotes: TransactionPayQuote<Json>[];
}> {
  const { id: transactionId } = transaction;
  const strategies = getStrategiesByName(
    getStrategies(transaction),
    (strategyName) => {
      log('Skipping unknown strategy', {
        strategy: strategyName,
        transactionId,
      });
    },
  );

  const hasFiatStrategy = strategies.some(
    ({ name }) => name === TransactionPayStrategy.Fiat,
  );

  if (!requests?.length && !hasFiatStrategy) {
    return {
      batchTransactions: [],
      quotes: [],
    };
  }

  const request = {
    messenger,
    requests,
    transaction,
  };

  for (const { name, strategy } of strategies) {
    try {
      if (strategy.supports && !strategy.supports(request)) {
        log('Strategy does not support request', {
          strategy: name,
          transactionId,
        });
        continue;
      }

      const quotes = (await strategy.getQuotes(
        request,
      )) as TransactionPayQuote<Json>[];

      if (!quotes.length) {
        log('Strategy returned no quotes', { strategy: name, transactionId });
        continue;
      }

      log('Updated', { transactionId, quotes });

      const batchTransactions = strategy.getBatchTransactions
        ? await strategy.getBatchTransactions({
            messenger,
            quotes,
          })
        : [];

      log('Batch transactions', { transactionId, batchTransactions });

      return {
        batchTransactions,
        quotes,
      };
    } catch (error) {
      log('Strategy failed, trying next', {
        error,
        strategy: name,
        transactionId,
      });
      continue;
    }
  }

  log('No quotes available', { transactionId });

  return {
    batchTransactions: [],
    quotes: [],
  };
}
