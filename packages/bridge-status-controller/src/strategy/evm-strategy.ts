/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { isEvmTxData } from '@metamask/bridge-controller';
import type { TxData } from '@metamask/bridge-controller';
import { TransactionType } from '@metamask/transaction-controller';

import type { SubmitStrategyParams, SubmitStepResult } from './types';
import { getApprovalTraceParams } from '../utils/trace';
import {
  generateActionId,
  handleApprovalDelay,
  handleMobileHardwareWalletDelay,
  submitEvmTransaction,
} from '../utils/transaction';

/**
 * Submits a single trade and returns the txMetaId
 *
 * @param args - The parameters for the transaction
 * @param args.messenger - The messenger
 * @param args.requireApproval - Whether to require approval for the transaction
 * @param transactionType - The type of transaction to submit
 * @param trade - The tx to submit
 * @param submitParams - Optional parameters to pass to the submitEvmTransaction function
 * @returns The txMeta of the transaction
 */
const handleSingleTx = async (
  { messenger, requireApproval }: SubmitStrategyParams,
  transactionType: TransactionType,
  trade: TxData,
  submitParams: Partial<Parameters<typeof submitEvmTransaction>[0]> = {},
) => {
  const approvalTxMeta = await submitEvmTransaction({
    messenger,
    trade,
    transactionType,
    requireApproval,
    ...submitParams,
  });

  return approvalTxMeta;
};

/**
 * Submits the approval and resetApproval transactions through the TransactionController.
 * If there is a resetApproval, it will be submitted first.
 * But only the approval's txMetaId will be returned.
 *
 * @param args - The parameters for the submission flow
 *
 * @returns The approvalTxId of the approval transaction
 */
export const handleEvmApprovals = async (args: SubmitStrategyParams) => {
  const { quoteResponse, isBridgeTx } = args;
  const { approval, resetApproval } = quoteResponse;
  if (!approval || !isEvmTxData(approval)) {
    return undefined;
  }

  const transactionType = isBridgeTx
    ? TransactionType.bridgeApproval
    : TransactionType.swapApproval;

  if (resetApproval) {
    await handleSingleTx(args, transactionType, resetApproval);
  }

  if (approval) {
    const approvalTxMeta = await handleSingleTx(
      args,
      transactionType,
      approval,
    );
    return approvalTxMeta?.id;
  }
};

/**
 * Sequentially submits EVM resetApproval, approval and trade transactions through the TransactionController.
 *
 * @param args - The parameters for the transaction
 * @yields Data for updating the BridgeStatusController
 */
export async function* submitEvmHandler(
  args: SubmitStrategyParams,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    quoteResponse,
    traceFn,
    requireApproval,
    isStxEnabledOnClient,
    isBridgeTx,
  } = args;
  if (!isEvmTxData(quoteResponse.trade)) {
    throw new Error(
      'Failed to submit cross-chain swap transaction: trade is not an EVM transaction',
    );
  }

  // Submit resetApproval and approval transactions if present
  const approvalTxId = await traceFn(
    getApprovalTraceParams(quoteResponse, isStxEnabledOnClient),
    async () => {
      return await handleEvmApprovals(args);
    },
  );
  // Delay after approval
  if (approvalTxId) {
    await handleApprovalDelay(quoteResponse.quote.srcChainId);
    await handleMobileHardwareWalletDelay(requireApproval);
  }

  // Generate trade actionId for pre-submission history
  const actionId = generateActionId();

  // Add pre-submission history keyed by actionId
  // This ensures we have quote data available if transaction fails during submission
  yield {
    type: 'addHistoryItem',
    payload: {
      approvalTxId,
      actionId,
    },
  };

  const transactionType = isBridgeTx
    ? TransactionType.bridge
    : TransactionType.swap;
  const tradeMeta = await handleSingleTx(
    args,
    transactionType,
    quoteResponse.trade,
    {
      // TODO figure out if this is needed
      // Pass txFee when gasIncluded is true to use the quote's gas fees
      // instead of re-estimating (which would fail for max native token swaps)
      txFee: quoteResponse.quote.gasIncluded
        ? quoteResponse.quote.feeData.txFee
        : undefined,
      actionId,
    },
  );

  // Use the tradeMeta's id as history key
  yield {
    type: 'rekeyHistoryItem',
    payload: {
      actionId,
      tradeMeta,
    },
  };

  yield {
    type: 'setTradeMeta',
    payload: tradeMeta,
  };
}
