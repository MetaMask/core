import { BatchSellTradesResponse, TxData } from '@metamask/bridge-controller';
import {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';

import { QuoteAndTxMetadata } from '../types';
import {
  findAllTransactionsInBatch,
  getAddTransactionBatchParams,
  hasNestedSwapTransactions,
  is7702Tx,
  isTradeTx,
  shouldDisable7702,
  toQuoteAndTxMetadataBatch,
} from '../utils/transaction';
import { SubmitStep } from './types';
import type { SubmitStrategyParams, SubmitStepResult } from './types';

const getHistoryKeyForQuote = ({
  quoteResponse: { quoteId, quote },
}: QuoteAndTxMetadata): string => quoteId ?? quote.requestId;

/**
 * Submits batch-sell transactions to the TransactionController
 *
 * @param args - The parameters for the transaction
 * @yields The approvalMeta and tradeMeta for the first batch sell transaction
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
    batchId: batchIdParam,
  } = args;

  const tradeData = toQuoteAndTxMetadataBatch({
    quoteResponses,
    batchSellTrades,
  });

  const { gasIncluded7702, gasIncluded, gasSponsored } = batchSellTrades;

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
    batchId: batchIdParam,
    skipInitialGasEstimate: gasIncluded7702
      ? isDelegatedAccount
      : Boolean(gasFeeToken),
    excludeNativeTokenForFee: !gasFeeToken,
  });

  // Submit the batch to the TransactionController
  const { batchId } = await addTransactionBatchFn(transactionParams);

  // Find all batch transaction metas and add them to history
  const allTradesInBatch = findAllTransactionsInBatch({
    messenger,
    batchId,
    tradeData,
  }).filter(
    (metadata): metadata is QuoteAndTxMetadata & { txMeta: TransactionMeta } =>
      isTradeTx(metadata.type) && metadata.txMeta !== undefined,
  );

  // This is either the delegation tx or the first STX swap in the batch
  const firstTradeWithMetadata = allTradesInBatch.find(
    ({ txMeta }) =>
      txMeta?.type &&
      (isTradeTx(txMeta.type) || hasNestedSwapTransactions(txMeta)),
  );
  const firstTradeMeta = firstTradeWithMetadata?.txMeta;
  if (!firstTradeMeta) {
    throw new Error(
      'Failed to add BatchSell trade to history: txMeta not found',
    );
  }

  yield {
    type: SubmitStep.SetTradeMeta,
    payload: {
      tradeMeta: firstTradeMeta,
    },
  };

  // Nested/7702 batch
  if (is7702Tx(firstTradeMeta) || hasNestedSwapTransactions(firstTradeMeta)) {
    const quoteIds = Array.from(
      new Set(allTradesInBatch.map(getHistoryKeyForQuote)),
    );

    // Create 1 history item for the parent tx, keyed by the txMeta.id
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
    // Then create a new history item for each nested trade, keyed by quoteId/requestId
    for (const tradeWithMetadata of allTradesInBatch) {
      const { quoteResponse } = tradeWithMetadata;

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
    // Each trade has its own txMeta if not submitted via 7702
    // Create a new history item for each one, keyed by txMeta.id
    // Note that the approvalTxId is not tracked in history
    for (const { txMeta, quoteResponse } of allTradesInBatch) {
      yield {
        type: SubmitStep.AddHistoryItem,
        payload: {
          historyKey: txMeta.id,
          quoteResponse,
          batchSellData: batchSellTrades,
          bridgeTxMeta: txMeta,
        },
      };
    }
  }
}
