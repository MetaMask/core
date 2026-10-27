import { BatchSellTradesResponse, TxData } from '@metamask/bridge-controller';
import {
  generateBatchId,
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';

import { QuoteAndTxMetadata } from '../types.js';
import {
  findAllTransactionsInBatch,
  getAddTransactionBatchParams,
  hasNestedSwapTransactions,
  is7702Tx,
  isTradeTx,
  shouldDisable7702,
  toQuoteAndTxMetadataBatch,
} from '../utils/transaction.js';
import { SubmitStep } from './types.js';
import type { SubmitStrategyParams, SubmitStepResult } from './types.js';

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

  const batchId = batchIdParam ?? generateBatchId();

  // Create 1 history item for the parent tx or first quote, keyed by the batchId
  yield {
    type: SubmitStep.AddHistoryItem,
    payload: {
      historyKey: batchId,
      quoteResponse: tradeData[0].quoteResponse,
      batchSellData: batchSellTrades,
      bridgeTxMeta: {
        batchId,
      },
    },
  };

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
    batchId,
    skipInitialGasEstimate: gasIncluded7702
      ? isDelegatedAccount
      : Boolean(gasFeeToken),
    excludeNativeTokenForFee: !gasFeeToken,
  });

  // Submit the batch to the TransactionController
  try {
    await addTransactionBatchFn(transactionParams);
  } catch (error) {
    const allTradesInBatch = findAllTransactionsInBatch({
      messenger,
      batchId,
      tradeData,
    });
    // Propagate the error if tx has not been added to the TransactionController
    if (!allTradesInBatch.some(({ txMeta }) => txMeta)) {
      throw error;
    }
  }

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

  // Each quote must be reported to the reconsiler service (through QuoteStatusManager) with the hash of the tx that
  // actually executed it. So the number of distinct txs the batch produced
  // decides how quotes are tracked:
  // - one tx (atomic 7702 batch): all quotes share the single hash.
  // - many txs (e.g. STX/sendBundle): each quote has its own hash.
  // `is7702Tx` only means the account is delegated (true even for many-tx
  // batches), so count the unique txs instead.
  const isSingleBatchTx =
    new Set(allTradesInBatch.map(({ txMeta }) => txMeta.id)).size === 1;
  const isNested7702BatchTx =
    isSingleBatchTx &&
    (is7702Tx(firstTradeMeta) || hasNestedSwapTransactions(firstTradeMeta));

  // Each trade has its own txMeta if not submitted via 7702
  // Create a new history item for each one, keyed by txMeta.id
  // Note that the approvalTxId is not tracked in history
  for (const [index, tradeWithMetadata] of allTradesInBatch.entries()) {
    // Rekey the initial trade
    if (index === 0) {
      const quoteIds = isNested7702BatchTx
        ? Array.from(new Set(allTradesInBatch.map(getHistoryKeyForQuote)))
        : undefined;
      const initialTrade = isNested7702BatchTx
        ? firstTradeWithMetadata
        : tradeWithMetadata;
      yield {
        type: SubmitStep.RekeyHistoryItem,
        payload: {
          oldHistoryKey: batchId,
          newHistoryKey: initialTrade.txMeta.id,
          historyItemOverrides: {
            quote: initialTrade.quoteResponse.quote,
            quoteIds,
          },
          tradeMeta: initialTrade.txMeta,
        },
      };
    }
    // Create a new history item for each trade, keyed by quoteId or txMetaId
    if (index > 0 || isNested7702BatchTx) {
      const historyKey = isNested7702BatchTx
        ? getHistoryKeyForQuote(tradeWithMetadata)
        : tradeWithMetadata.txMeta.id;
      const bridgeTxMeta = isNested7702BatchTx
        ? undefined
        : tradeWithMetadata.txMeta;
      yield {
        type: SubmitStep.AddHistoryItem,
        payload: {
          historyKey,
          quoteResponse: tradeWithMetadata.quoteResponse,
          batchSellData: batchSellTrades,
          bridgeTxMeta,
        },
      };
    }
  }
}
