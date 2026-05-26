import { TxData } from '@metamask/bridge-controller';

import {
  addTransactionBatch,
  getAddTransactionBatchParams,
  toQuoteAndTxMetadata,
} from '../utils/transaction';
import { SubmitStep } from './types';
import type { SubmitStrategyParams, SubmitStepResult } from './types';

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
    quoteResponse,
    messenger,
    isBridgeTx,
    addTransactionBatchFn,
    isDelegatedAccount,
  } = args;

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
    disable7702:
      // Enable 7702 batching when the quote includes gasless 7702 support,
      quoteResponse.quote.gasIncluded7702
        ? false
        : // or when the account is already delegated (to avoid the in-flight transaction limit for delegated accounts)
          !isDelegatedAccount ||
          // For gasless transactions with STX/sendBundle we keep disabling 7702.
          quoteResponse.quote.gasIncluded,
    isGasFeeSponsored: Boolean(quoteResponse.quote.gasSponsored),
    isGasFeeIncluded: Boolean(quoteResponse.quote.gasIncluded7702),
  });

  const { approvalMeta, tradeMeta } = await addTransactionBatch(
    messenger,
    addTransactionBatchFn,
    tradeData,
    transactionParams,
  );

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
    type: SubmitStep.AddHistoryItem,
    payload: {
      historyKey: tradeMeta.id,
      approvalTxId: approvalMeta?.id,
      bridgeTxMeta: {
        id: tradeMeta.id,
        hash: tradeMeta.hash,
        batchId: tradeMeta.batchId,
      },
    },
  };
}
