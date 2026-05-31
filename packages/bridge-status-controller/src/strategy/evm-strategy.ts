/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { formatChainIdToHex, isEvmTxData } from '@metamask/bridge-controller';
import type { TxData } from '@metamask/bridge-controller';
import {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';

import { BridgeStatusControllerMessenger } from '../types';
import { getAccountByAddress } from '../utils/accounts';
import { getNetworkClientIdByChainId } from '../utils/network';
import { getApprovalTraceParams } from '../utils/trace';
import {
  addTransaction,
  generateActionId,
  handleApprovalDelay,
  handleMobileHardwareWalletDelay,
  toTransactionParams,
  waitForTxConfirmation,
} from '../utils/transaction';
import { SubmitStep } from './types';
import type { SubmitStrategyParams, SubmitStepResult } from './types';

/**
 * Submits a single tx to the TransactionController and returns the txMetaId
 *
 * @param args - The parameters for the transaction
 * @param args.transactionType - The type of transaction to submit
 * @param args.trade - The trade data to confirm
 * @param args.requireApproval - Whether to require approval for the transaction
 * @param args.txFee - Optional gas fee parameters from the quote (used when gasIncluded is true)
 * @param args.txFee.maxFeePerGas - The maximum fee per gas from the quote
 * @param args.txFee.maxPriorityFeePerGas - The maximum priority fee per gas from the quote
 * @param args.actionId - Optional actionId for pre-submission history (if not provided, one is generated)
 * @param args.messenger - The messenger to use for the transaction
 * @returns The transaction meta
 */
export const handleSingleTx = async ({
  messenger,
  trade,
  transactionType,
  requireApproval = false,
  txFee,
  // Use provided actionId (for pre-submission history) or generate one
  actionId = generateActionId(),
}: {
  messenger: BridgeStatusControllerMessenger;
  transactionType: TransactionType;
  trade: TxData;
  requireApproval?: boolean;
  txFee?: { maxFeePerGas: string; maxPriorityFeePerGas: string };
  actionId?: string;
}): Promise<TransactionMeta> => {
  const selectedAccount = getAccountByAddress(messenger, trade.from);
  if (!selectedAccount) {
    throw new Error(
      'Failed to submit cross-chain swap transaction: unknown account in trade data',
    );
  }
  const hexChainId = formatChainIdToHex(trade.chainId);
  const networkClientId = getNetworkClientIdByChainId(messenger, hexChainId);

  const requestOptions = {
    actionId,
    networkClientId,
    requireApproval,
    type: transactionType,
    origin: 'metamask',
    isInternal: true,
  };

  const transactionParamsWithMaxGas = await toTransactionParams(
    messenger,
    trade,
    networkClientId,
    hexChainId,
    txFee,
  );

  return await addTransaction(
    messenger,
    { ...transactionParamsWithMaxGas, from: trade.from },
    requestOptions,
  );
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
const approve = async (args: SubmitStrategyParams) => {
  const {
    quoteResponses: [quoteResponse],
    isBridgeTx,
  } = args;
  const { approval, resetApproval } = quoteResponse;
  if (!approval || !isEvmTxData(approval)) {
    return undefined;
  }

  const transactionType = isBridgeTx
    ? TransactionType.bridgeApproval
    : TransactionType.swapApproval;

  if (resetApproval) {
    await handleSingleTx({
      ...args,
      transactionType,
      trade: resetApproval,
    });
  }

  if (approval) {
    const approvalTxMeta = await handleSingleTx({
      ...args,
      transactionType,
      trade: approval,
    });
    return approvalTxMeta?.id;
  }
};

export const handleEvmApprovals = async (args: SubmitStrategyParams) =>
  await args.traceFn(
    getApprovalTraceParams(args.quoteResponses[0], args.isStxEnabled),
    async () => await approve(args),
  );

/**
 * Sequentially submits EVM resetApproval, approval and trade transactions through the TransactionController.
 *
 * @param args - The parameters for the transaction
 * @yields Data for updating the BridgeStatusController
 */
export async function* submitEvmHandler(
  args: SubmitStrategyParams<TxData>,
): AsyncGenerator<SubmitStepResult, void, void> {
  const {
    quoteResponses: [quoteResponse],
    requireApproval,
    isBridgeTx,
  } = args;

  // Submit resetApproval and approval transactions if present
  const approvalTxId = await handleEvmApprovals(args);

  // Delay after approval
  if (approvalTxId) {
    await handleApprovalDelay(quoteResponse.quote.srcChainId);
  }
  // Hardware-wallet delay first (Ledger second-prompt spacing), then wait for
  // on-chain approval confirmation so swap gas estimation runs after allowance is set.
  await handleMobileHardwareWalletDelay(requireApproval);
  if (requireApproval && approvalTxId) {
    await waitForTxConfirmation(args.messenger, approvalTxId);
  }

  // Generate trade actionId for pre-submission history
  const actionId = generateActionId();

  // Add pre-submission history keyed by actionId
  // This ensures we have quote data available if transaction fails during submission
  yield {
    type: SubmitStep.AddHistoryItem,
    payload: {
      historyKey: actionId,
      approvalTxId,
      actionId,
      quoteResponse,
    },
  };

  const transactionType = isBridgeTx
    ? TransactionType.bridge
    : TransactionType.swap;

  const tradeMeta = await handleSingleTx({
    ...args,
    transactionType,
    trade: quoteResponse.trade,
    // TODO figure out if this is needed
    // Pass txFee when gasIncluded is true to use the quote's gas fees
    // instead of re-estimating (which would fail for max native token swaps)
    txFee: quoteResponse.quote.gasIncluded
      ? quoteResponse.quote.feeData.txFee
      : undefined,
    actionId,
  });

  // Use the tradeMeta's id as history key
  yield {
    type: SubmitStep.RekeyHistoryItem,
    payload: {
      oldHistoryKey: actionId,
      newHistoryKey: tradeMeta.id,
      tradeMeta,
    },
  };

  yield {
    type: SubmitStep.SetTradeMeta,
    payload: {
      tradeMeta,
    },
  };
}
