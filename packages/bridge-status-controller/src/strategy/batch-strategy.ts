import type { TxData } from '@metamask/bridge-controller';
import { generateBatchId } from '@metamask/transaction-controller';

import type { QuoteAndTxMetadata } from '../types.js';
import { getHistoryOverridesFromTxMeta } from '../utils/history.js';
import {
  findAllTransactionsInBatch,
  getAddTransactionBatchParams,
  isApprovalTx,
  isTradeTx,
  shouldDisable7702,
  toQuoteAndTxMetadata,
} from '../utils/transaction.js';
import { SubmitStep } from './types.js';
import type { SubmitStrategyParams, SubmitStepResult } from './types.js';

/**
 * Submits batched EVM transactions to the TransactionController
 *
 * @param args - The parameters for the transaction
 * @yields The approvalMeta and tradeMeta for the batched transaction
 */
export async function* submitBatchHandler(
  args: SubmitStrategyParams<TxData>,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    requireApproval,
    quoteResponses: [quoteResponse],
    messenger,
    isBridgeTx,
    addTransactionBatchFn,
    isDelegatedAccount,
    next,
  } = args;

  const batchId = args.batchId ?? generateBatchId();
  const historyKey = args.historyKey ?? batchId;

  // Add new history item if historyKey is not provided
  if (args.historyKey) {
    yield {
      type: SubmitStep.UpdateHistoryItem,
      payload: {
        historyKey,
        historyItemOverrides: { next, quote: quoteResponse.quote },
      },
    };
  } else {
    yield {
      type: SubmitStep.AddHistoryItem,
      payload: {
        historyKey,
        quoteResponse,
        bridgeTxMeta: {
          batchId,
        },
        next,
      },
    };
  }

  const tradeData = toQuoteAndTxMetadata({
    quoteResponse,
    isBridgeTx,
  });

  const transactionParams = await getAddTransactionBatchParams({
    tradeData,
    requireApproval,
    isDelegatedAccount,
    messenger,
    atomic: true,
    disable7702: shouldDisable7702(
      quoteResponse.quote.gasIncluded7702,
      quoteResponse.quote.gasIncluded,
      isDelegatedAccount,
    ),
    isGasFeeSponsored: Boolean(quoteResponse.quote.gasSponsored),
    isGasFeeIncluded: Boolean(quoteResponse.quote.gasIncluded7702),
    batchId,
  });

  let quoteAndTxMetas: QuoteAndTxMetadata[] = [];
  try {
    await addTransactionBatchFn(transactionParams);
    quoteAndTxMetas = findAllTransactionsInBatch({
      messenger,
      batchId,
      tradeData,
    });
  } catch (error) {
    quoteAndTxMetas = findAllTransactionsInBatch({
      messenger,
      batchId,
      tradeData,
    });
    // If txMeta has not been added to the TransactionController, propagate the error
    if (!quoteAndTxMetas.some(({ txMeta }) => txMeta)) {
      throw error;
    }
  }

  yield {
    type: SubmitStep.UpdateBatchTransactions,
    payload: {
      quoteAndTxMetas,
    },
  };

  const tradeMeta = quoteAndTxMetas.find(
    ({ type, txMeta }) => isTradeTx(type) && txMeta,
  )?.txMeta;

  const approvalMeta = quoteAndTxMetas.find(
    ({ type, txMeta }) => isApprovalTx(type) && txMeta,
  )?.txMeta;

  if (!tradeMeta) {
    throw new Error(
      'Failed to update cross-chain swap transaction batch: tradeMeta not found',
    );
  }

  yield {
    type: SubmitStep.SetTradeMeta,
    payload: { tradeMeta },
  };

  yield {
    type: SubmitStep.RekeyHistoryItem,
    payload: {
      oldHistoryKey: historyKey,
      newHistoryKey: tradeMeta.id,
      historyItemOverrides: {
        approvalTxId: approvalMeta?.id,
        ...getHistoryOverridesFromTxMeta(
          false, // Ignore STX flag when rekeying
          args.quoteResponses[0].quote.srcChainId,
          tradeMeta,
        ),
      },
      tradeMeta,
    },
  };
}
