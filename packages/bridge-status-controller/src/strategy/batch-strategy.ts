import { TxData } from '@metamask/bridge-controller';
import { TransactionType } from '@metamask/transaction-controller';

import {
  addTransactionBatch,
  getAddTransactionBatchParams,
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

  const tradeData: Parameters<
    typeof getAddTransactionBatchParams
  >[0]['tradeData'] = [];

  const approvalTxType = isBridgeTx
    ? TransactionType.bridgeApproval
    : TransactionType.swapApproval;

  if (quoteResponse.resetApproval) {
    tradeData.push({
      tx: quoteResponse.resetApproval,
      type: approvalTxType,
    });
  }
  if (quoteResponse.approval) {
    tradeData.push({
      tx: quoteResponse.approval,
      type: approvalTxType,
    });
  }
  if (quoteResponse.trade) {
    tradeData.push({
      tx: quoteResponse.trade,
      type: isBridgeTx ? TransactionType.bridge : TransactionType.swap,
      assetsFiatValues: {
        sending: quoteResponse.sentAmount?.valueInCurrency?.toString(),
        receiving: quoteResponse.toTokenAmount?.valueInCurrency?.toString(),
      },
    });
  }

  const transactionParams = await getAddTransactionBatchParams({
    messenger,
    tradeData,
    quote: quoteResponse.quote,
    requireApproval,
    isDelegatedAccount,
  });

  const { approvalMeta, tradeMeta } = await addTransactionBatch(
    messenger,
    addTransactionBatchFn,
    transactionParams,
  );

  yield {
    type: SubmitStep.SetTradeMeta,
    payload: tradeMeta,
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
