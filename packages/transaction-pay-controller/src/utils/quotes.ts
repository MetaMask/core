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
  TransactionPayTotals,
  TransactionPaymentToken,
  UpdateTransactionDataCallback,
} from '../types';

const QUOTES_CHECK_INTERVAL = 1 * 1000; // 1 Second
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
 */
export async function updateQuotes(request: UpdateQuotesRequest) {
  const { messenger, transactionData, transactionId, updateTransactionData } =
    request;

  const transaction = getTransaction(transactionId, messenger);

  log('Updating quotes', { transactionId });

  if (!transaction || !transactionData) {
    throw new Error('Transaction not found');
  }

  const { paymentToken, sourceAmounts, tokens } = transactionData;

  if (!paymentToken) {
    return;
  }

  const requests: QuoteRequest[] = (sourceAmounts ?? []).map(
    (sourceAmount, i) => {
      const token = tokens[i];

      return {
        from: transaction.txParams.from as Hex,
        sourceBalanceRaw: paymentToken.balanceRaw,
        sourceTokenAmount: sourceAmount.sourceAmountRaw,
        sourceChainId: paymentToken.chainId,
        sourceTokenAddress: paymentToken.address,
        targetAmountMinimum: token.allowUnderMinimum ? '0' : token.amountRaw,
        targetChainId: token.chainId,
        targetTokenAddress: token.address,
      };
    },
  );

  if (!requests?.length) {
    log('No quote requests', { transactionId });
  }

  let quotes: TransactionPayQuote<Json>[] | undefined = [];

  const strategy = await getStrategy(messenger as never, transaction);

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

  const totals = calculateTotals(quotes as never, tokens, messenger);

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
    data.isLoading = false;
  });
}

/**
 * Poll quotes at regular intervals.
 *
 * @param messenger - Messenger instance.
 * @param updateTransactionData - Callback to update transaction data.
 */
export function queueRefreshQuotes(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
) {
  setTimeout(() => {
    refreshQuotes(messenger, updateTransactionData)
      .finally(() => queueRefreshQuotes(messenger, updateTransactionData))
      .catch((error) => {
        log('Error polling quotes', { messenger, error });
      });
  }, QUOTES_CHECK_INTERVAL);
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
  paymentToken: TransactionPaymentToken;
  totals: TransactionPayTotals;
  transactionId: string;
}) {
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
        networkFeeFiat: totals.fees.sourceNetwork.usd,
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
async function refreshQuotes(
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

    log('Refreshing expired quotes', {
      transactionId,
      strategy: strategyName,
      refreshInterval,
    });

    updateTransactionData(transactionId, (data) => {
      data.isLoading = true;
    });

    await updateQuotes({
      messenger,
      transactionData,
      transactionId,
      updateTransactionData,
    });

    log('Refreshed quotes', { transactionId, strategy: strategyName });
  }
}
