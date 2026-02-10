import { TransactionStatus } from '@metamask/transaction-controller';
import type { BatchTransaction } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex, Json } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { getStrategy, getStrategyByName } from './strategy';
import { calculateTotals } from './totals';
import { getTransaction, updateTransaction } from './transaction';
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
  const { messenger, transactionData, transactionId, updateTransactionData } =
    request;

  const transaction = getTransaction(transactionId, messenger);

  if (!transaction || !transactionData) {
    throw new Error('Transaction not found');
  }

  if (transaction?.status !== TransactionStatus.unapproved) {
    return false;
  }

  log('Updating quotes', { transactionId });

  const { isMaxAmount, isPostQuote, paymentToken, sourceAmounts, tokens } =
    transactionData;

  const requests = buildQuoteRequests({
    from: transaction.txParams.from as Hex,
    isMaxAmount: isMaxAmount ?? false,
    isPostQuote,
    paymentToken,
    sourceAmounts,
    tokens,
    transactionId,
  });

  updateTransactionData(transactionId, (data) => {
    data.isLoading = true;
  });

  try {
    const { batchTransactions, quotes } = await getQuotes(
      transaction,
      requests,
      messenger,
    );

    const totals = calculateTotals({
      isMaxAmount,
      messenger,
      quotes: quotes as TransactionPayQuote<unknown>[],
      tokens,
      transaction,
    });

    log('Calculated totals', { transactionId, totals });

    syncTransaction({
      batchTransactions,
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
 * @param request.isPostQuote - Whether this is a post-quote flow.
 * @param request.messenger - Messenger instance.
 * @param request.paymentToken - Payment token (source for standard flows, destination for post-quote).
 * @param request.totals - Calculated totals.
 * @param request.transactionId - ID of the transaction to sync.
 */
function syncTransaction({
  batchTransactions,
  isPostQuote,
  messenger,
  paymentToken,
  totals,
  transactionId,
}: {
  batchTransactions: BatchTransaction[];
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

      tx.metamaskPay = {
        bridgeFeeFiat: totals.fees.provider.usd,
        chainId: paymentToken.chainId,
        isPostQuote,
        networkFeeFiat: totals.fees.sourceNetwork.estimate.usd,
        targetFiat: totals.targetAmount.usd,
        tokenAddress: paymentToken.address,
        totalFiat: totals.total.usd,
      };
    },
  );
}

/**
 * Refresh quotes for all transactions if expired.
 *
 * @param messenger - Messenger instance.
 * @param updateTransactionData - Callback to update transaction data.
 */
export async function refreshQuotes(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
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
  if (!sourceAmount) {
    log('No source amount found for post-quote request', { transactionId });
    return [];
  }

  const request: QuoteRequest = {
    from,
    isMaxAmount,
    isPostQuote: true,
    sourceBalanceRaw: sourceAmount.sourceBalanceRaw as string,
    sourceTokenAmount: sourceAmount.sourceAmountRaw,
    sourceChainId: sourceAmount.sourceChainId as Hex,
    sourceTokenAddress: sourceAmount.sourceTokenAddress as Hex,
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

/**
 * Retrieve quotes for a transaction.
 *
 * @param transaction - Transaction metadata.
 * @param requests - Quote requests.
 * @param messenger - Controller messenger.
 * @returns An object containing batch transactions and quotes.
 */
async function getQuotes(
  transaction: TransactionMeta,
  requests: QuoteRequest[],
  messenger: TransactionPayControllerMessenger,
): Promise<{
  batchTransactions: BatchTransaction[];
  quotes: TransactionPayQuote<Json>[];
}> {
  const { id: transactionId } = transaction;
  const strategy = getStrategy(messenger as never, transaction);
  let quotes: TransactionPayQuote<Json>[] | undefined = [];

  try {
    quotes = requests?.length
      ? ((await strategy.getQuotes({
          messenger,
          requests,
          transaction,
        })) as TransactionPayQuote<Json>[])
      : [];
  } catch (error) {
    log('Error fetching quotes', { error, transactionId });
  }

  log('Updated', { transactionId, quotes });

  const batchTransactions =
    quotes?.length && strategy.getBatchTransactions
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
}
