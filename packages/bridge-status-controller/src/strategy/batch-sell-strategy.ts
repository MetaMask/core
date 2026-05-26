import { BatchSellTradesResponse, TxData } from '@metamask/bridge-controller';
import {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';

import {
  findAllTransactionsInBatch,
  getAddTransactionBatchParams,
  is7702Tx,
  isApprovalTx,
  shouldDisable7702,
} from '../utils/transaction';
import { SubmitStep } from './types';
import type { SubmitStrategyParams, SubmitStepResult } from './types';
import { BatchSellTransactionType } from '@metamask/bridge-controller';
import { QuoteAndTxMetadata } from '../types';

/**
 * Submits batched EVM transactions to the TransactionController
 *
 * @param args - The parameters for the transaction
 * @yields The approvalMeta and tradeMeta for the batched transaction
 */
export async function* submitBatchSellHandler(
  args: SubmitStrategyParams<TxData, BatchSellTradesResponse>,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    requireApproval,
    quoteResponses,
    messenger,
    addTransactionBatchFn,
    isDelegatedAccount,
    batchSellTrades,
  } = args;

  const tradeData: QuoteAndTxMetadata[] = [];

  const {
    transactions,
    fee,
    gasIncluded7702,
    gasIncluded,
    gasSponsored,
    // Other properties passed by the backend will be directly passed to TransactionController:addTransactionBatch
    ...rest
  } = batchSellTrades;

  // Build the trade+quote metadata array for the batch sell transaction
  // This ties together the quote, the tx params and the txMeta after submission
  for (const transaction of transactions) {
    const { type, maxFeePerGas, maxPriorityFeePerGas, ...tx } = transaction;
    // Match the trade or approval tx data with the quote response
    const matchingQuoteResponse =
      quoteResponses.find(
        ({ approval, trade }) =>
          trade?.data.toLowerCase() === tx.data.toLowerCase() ||
          approval?.data.toLowerCase() === tx.data.toLowerCase(),
      ) ?? quoteResponses[0];

    // Include gasIncluded and gasIncluded7702 from the gasless batch
    const normalizedQuote = {
      ...matchingQuoteResponse,
      quote: {
        ...matchingQuoteResponse.quote,
        gasIncluded,
        gasIncluded7702,
        gasSponsored: false,
      },
    };

    const commonTradeData = {
      tx,
      quoteResponse: normalizedQuote,
      txFee: { maxFeePerGas, maxPriorityFeePerGas },
    };

    if (type === BatchSellTransactionType.TRADE) {
      tradeData.push({
        ...commonTradeData,
        type: TransactionType.swap,
        assetsFiatValues: {
          sending:
            matchingQuoteResponse.sentAmount?.valueInCurrency?.toString(),
          receiving:
            matchingQuoteResponse.toTokenAmount?.valueInCurrency?.toString(),
        },
      });
    } else {
      tradeData.push({
        ...commonTradeData,
        type:
          type === BatchSellTransactionType.APPROVAL
            ? TransactionType.swapApproval
            : TransactionType.tokenMethodTransfer,
      });
    }
  }

  const gasFeeToken = tradeData.find(
    ({ type }) => type === TransactionType.tokenMethodTransfer,
  )?.tx.to;

  const transactionParams = await getAddTransactionBatchParams({
    messenger,
    tradeData,
    requireApproval,
    isDelegatedAccount,
    // Tx success/failure is independent of other txs in the batch
    atomic: false,
    disable7702: shouldDisable7702(
      gasIncluded7702,
      gasIncluded,
      isDelegatedAccount,
    ),
    isGasFeeSponsored: gasSponsored,
    isGasFeeIncluded: Boolean(gasIncluded7702),
    skipInitialGasEstimate: false,
    excludeNativeTokenForFee: Boolean(gasFeeToken),
    // Properties provided by the obtainGaslessBatch response
    ...rest,
  });

  // Submit the batch to the TransactionController
  const { batchId } = await addTransactionBatchFn(transactionParams);

  const allTradesWithMetadata = findAllTransactionsInBatch({
    messenger,
    batchId,
    tradeData,
  });

  // The first tradeMeta (will be either the delegation tx or the first STX swap in the batch)
  const firstTradeWithMetadata = allTradesWithMetadata.find(
    ({ type, txMeta }) => type === TransactionType.swap && txMeta,
  );

  if (!firstTradeWithMetadata?.txMeta) {
    throw new Error(
      'Failed to submit batch sell transaction:  tradeMeta not found',
    );
  }

  const firstTradeMeta = firstTradeWithMetadata.txMeta;

  if (is7702Tx(firstTradeMeta)) {
    const getHistoryKeyForQuote = ({
      quoteResponse: { quoteId, quote },
    }: QuoteAndTxMetadata): string => quoteId ?? quote.requestId;
    const quoteIds = allTradesWithMetadata.map(getHistoryKeyForQuote);

    // Create 1 history item for the batch sell tx, keyed by the delegation tx's txMeta.id
    yield {
      type: SubmitStep.AddHistoryItem,
      payload: {
        historyKey: firstTradeMeta.id,
        quoteResponse: firstTradeWithMetadata.quoteResponse,
        batchSellData: batchSellTrades,
        quoteIds,
        bridgeTxMeta: firstTradeMeta,
      },
    };
    // Then create a new history item for each trade submitted via 7702, keyed by quoteId
    for (const tradeWithMetadata of allTradesWithMetadata) {
      const { txMeta, type, quoteResponse } = tradeWithMetadata;
      if (isApprovalTx(type) || !txMeta) {
        continue;
      }

      yield {
        type: SubmitStep.AddHistoryItem,
        payload: {
          historyKey: getHistoryKeyForQuote(tradeWithMetadata),
          quoteResponse,
          batchSellData: batchSellTrades,
        },
      };
    }
  } else {
    // Assume that each trade has its own txMeta if it's not submitted via 7702
    // Create a new history item for each one, keyed by txMeta.id
    let approvalTxMeta: TransactionMeta | undefined;
    for (const tradeWithMetadata of allTradesWithMetadata) {
      const { txMeta, type, quoteResponse } = tradeWithMetadata;
      if (isApprovalTx(type) || !txMeta) {
        approvalTxMeta = txMeta;
        continue;
      }

      yield {
        type: SubmitStep.AddHistoryItem,
        payload: {
          historyKey: txMeta.id,
          quoteResponse,
          approvalTxId: approvalTxMeta?.id,
          batchSellData: batchSellTrades,
          bridgeTxMeta: txMeta,
        },
      };
    }
  }

  yield {
    type: SubmitStep.SetTradeMeta,
    payload: {
      tradeMeta: firstTradeMeta,
    },
  };
}
