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

  const { paymentToken, sourceAmounts, tokens } = transactionData;

  const requests = buildQuoteRequests({
    from: transaction.txParams.from as Hex,
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
      quotes: quotes as TransactionPayQuote<unknown>[],
      messenger,
      tokens,
      transaction,
    });

    log('Calculated totals', { transactionId, totals });

    syncTransaction({
      batchTransactions,
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
 * @param request.messenger - Messenger instance.
 * @param request.paymentToken - Payment token used.
 * @param request.totals - Calculated totals.
 * @param request.transactionId - ID of the transaction to sync.
 */
function syncTransaction({
  batchTransactions,
  messenger,
  paymentToken,
  totals,
  transactionId,
}: {
  batchTransactions: BatchTransaction[];
  messenger: TransactionPayControllerMessenger;
  paymentToken: TransactionPaymentToken | undefined;
  totals: TransactionPayTotals;
  transactionId: string;
}) {
  if (!paymentToken) {
    return;
  }

  updateTransaction(
    {
      transactionId,
      messenger: messenger as never,
    },
    (tx: TransactionMeta) => {
      tx.batchTransactions = batchTransactions;
      tx.batchTransactionsOptions = {};

      tx.metamaskPay = {
        bridgeFeeFiat: totals.fees.provider.usd,
        chainId: paymentToken.chainId,
        networkFeeFiat: totals.fees.sourceNetwork.estimate.usd,
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
) {
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
 * @param request.paymentToken - Payment token used for the transaction.
 * @param request.sourceAmounts - Source amounts for the transaction.
 * @param request.tokens - Required tokens for the transaction.
 * @param request.transactionId - ID of the transaction.
 * @returns Array of quote requests.
 */
function buildQuoteRequests({
  from,
  paymentToken,
  sourceAmounts,
  tokens,
  transactionId,
}: {
  from: Hex;
  paymentToken: TransactionPaymentToken | undefined;
  sourceAmounts: TransactionPaySourceAmount[] | undefined;
  tokens: TransactionPayRequiredToken[];
  transactionId: string;
}): QuoteRequest[] {
  if (!paymentToken) {
    return [];
  }

  const requests = (sourceAmounts ?? []).map((sourceAmount) => {
    const token = tokens.find(
      (t) => t.address === sourceAmount.targetTokenAddress,
    ) as TransactionPayRequiredToken;

    return {
      from,
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
) {
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
