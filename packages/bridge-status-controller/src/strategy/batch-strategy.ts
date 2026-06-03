import { FeeType, isNativeAddress } from '@metamask/bridge-controller';
import type { TxData } from '@metamask/bridge-controller';
import type { Hex } from '@metamask/utils';

import {
  findAllTransactionsInBatch,
  getAddTransactionBatchParams,
  isApprovalTx,
  isTradeTx,
  shouldDisable7702,
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
    quoteResponses: [quoteResponse],
    messenger,
    isBridgeTx,
    addTransactionBatchFn,
    isDelegatedAccount,
  } = args;

  const tradeData = toQuoteAndTxMetadata({
    quoteResponse,
    isBridgeTx,
  });

  const gasFeeToken =
    quoteResponse.quote.feeData[FeeType.TX_FEE]?.asset?.address &&
    isNativeAddress(quoteResponse.quote.feeData[FeeType.TX_FEE].asset.address)
      ? undefined
      : (quoteResponse.quote.feeData[FeeType.TX_FEE]?.asset?.address as Hex);

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
    gasFeeToken,
    skipInitialGasEstimate: quoteResponse.quote.gasIncluded7702
      ? isDelegatedAccount
      : Boolean(gasFeeToken),
    excludeNativeTokenForFee: !gasFeeToken,
  });

  const { batchId } = await addTransactionBatchFn(transactionParams);

  const quoteAndTxMetas = findAllTransactionsInBatch({
    messenger,
    batchId,
    tradeData,
  });

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
    type: SubmitStep.AddHistoryItem,
    payload: {
      historyKey: tradeMeta.id,
      approvalTxId: approvalMeta?.id,
      bridgeTxMeta: {
        id: tradeMeta.id,
        hash: tradeMeta.hash,
        batchId: tradeMeta.batchId,
      },
      quoteResponse,
    },
  };
}
