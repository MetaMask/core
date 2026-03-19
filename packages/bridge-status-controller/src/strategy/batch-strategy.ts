import { isEvmTxData } from '@metamask/bridge-controller';

import type { SubmitStrategyParams, SubmitStepResult } from './types';
import {
  addTransactionBatch,
  getAddTransactionBatchParams,
} from '../utils/transaction';

/**
 * Submits batched EVM transactions to the TransactionController
 *
 * @param args - The parameters for the transaction
 * @yields The approvalMeta and tradeMeta for the batched transaction
 */
export async function* submitBatchHandler(
  args: SubmitStrategyParams,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    requireApproval,
    quoteResponse,
    messenger,
    isBridgeTx,
    addTransactionBatchFn,
  } = args;
  if (!isEvmTxData(quoteResponse.trade)) {
    throw new Error(
      'Failed to submit cross-chain swap transaction: trade is not an EVM transaction',
    );
  }
  const transactionParams = await getAddTransactionBatchParams({
    messenger,
    isBridgeTx,
    resetApproval: quoteResponse.resetApproval,
    approval:
      quoteResponse.approval && isEvmTxData(quoteResponse.approval)
        ? quoteResponse.approval
        : undefined,
    trade: quoteResponse.trade,
    quoteResponse,
    requireApproval,
  });

  const { approvalMeta, tradeMeta } = await addTransactionBatch(
    messenger,
    addTransactionBatchFn,
    transactionParams,
  );

  yield {
    type: 'setTradeMeta',
    payload: tradeMeta,
  };

  yield {
    type: 'addHistoryItem',
    payload: {
      approvalTxId: approvalMeta?.id,
      bridgeTxMeta: {
        id: tradeMeta.id,
        hash: tradeMeta.hash,
        batchId: tradeMeta.batchId,
      },
    },
  };
}
