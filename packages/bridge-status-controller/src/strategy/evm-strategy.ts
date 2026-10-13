/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { formatChainIdToHex, isEvmTxData } from '@metamask/bridge-controller';
import type { TxData } from '@metamask/bridge-controller';
import {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';

import { BridgeStatusControllerMessenger } from '../types.js';
import { getAccountByAddress } from '../utils/accounts.js';
import { getNetworkClientIdByChainId } from '../utils/network.js';
import { getApprovalTraceParams } from '../utils/trace.js';
import {
  addTransaction,
  generateActionId,
  getTransactionMetaByActionId,
  handleApprovalDelay,
  handleMobileHardwareWalletDelay,
  toTransactionParams,
  waitForTxConfirmation,
} from '../utils/transaction.js';
import { SubmitStep } from './types.js';
import type { SubmitStrategyParams, SubmitStepResult } from './types.js';

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
const handleSingleTx = async ({
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
 * @param actionId - The actionId for the approval transaction
 *
 * @returns The approval txMeta of the approval transaction
 */
const approve = async (args: SubmitStrategyParams, actionId?: string) => {
  const {
    quoteResponses: [quoteResponse],
    isBridgeTx,
  } = args;
  const { approval, resetApproval } = quoteResponse;
  if (!approval || !isEvmTxData(approval)) {
    return;
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
      actionId,
    });
    return approvalTxMeta;
  }
};

export const handleEvmApprovals = async (
  args: SubmitStrategyParams,
  actionId?: string,
) =>
  await args.traceFn(
    getApprovalTraceParams(args.quoteResponses[0], args.isStxEnabled),
    async () => await approve(args, actionId),
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

  // Generate actionId for pre-submission history
  const actionId = generateActionId();

  // Add pre-submission history keyed by actionId
  // This ensures we have quote data available if transaction fails during submission
  yield {
    type: SubmitStep.AddHistoryItem,
    payload: {
      historyKey: actionId,
      actionId,
      quoteResponse,
    },
  };

  // Submit resetApproval and approval transactions if present
  const approvalTxMeta = await handleEvmApprovals(args, actionId);
  const approvalTxId = approvalTxMeta?.id;

  let tradeActionId = actionId;

  // Delay after approval
  if (approvalTxId) {
    // Generate a new actionId for the trade transaction since approval used the first one
    tradeActionId = generateActionId();
    yield {
      type: SubmitStep.RekeyHistoryItem,
      payload: {
        oldHistoryKey: actionId,
        newHistoryKey: tradeActionId,
        historyItemOverrides: {
          approvalTxId,
        },
      },
    };
    await handleApprovalDelay(quoteResponse.quote.srcChainId);
  }
  // Hardware-wallet delay first (Ledger second-prompt spacing), then wait for
  // on-chain approval confirmation so swap gas estimation runs after allowance is set.
  await handleMobileHardwareWalletDelay(requireApproval);
  if (requireApproval && approvalTxId) {
    await waitForTxConfirmation(args.messenger, approvalTxId);
  }

  const transactionType = isBridgeTx
    ? TransactionType.bridge
    : TransactionType.swap;

  let tradeMeta: TransactionMeta | undefined;
  try {
    tradeMeta = await handleSingleTx({
      ...args,
      transactionType,
      trade: quoteResponse.trade,
      // TODO figure out if this is needed
      // Pass txFee when gasIncluded is true to use the quote's gas fees
      // instead of re-estimating (which would fail for max native token swaps)
      txFee: quoteResponse.quote.gasIncluded
        ? quoteResponse.quote.feeData.txFee
        : undefined,
      actionId: tradeActionId,
    });
  } catch (error) {
    // Silence the error if tx has been added to the TransactionController to prevent duplicate Failed events
    tradeMeta = getTransactionMetaByActionId(args.messenger, tradeActionId);
    if (!tradeMeta) {
      throw error;
    }
  }

  yield {
    type: SubmitStep.SetTradeMeta,
    payload: { tradeMeta },
  };

  // Use the tradeMeta's id as history key
  yield {
    type: SubmitStep.RekeyHistoryItem,
    payload: {
      oldHistoryKey: tradeActionId,
      newHistoryKey: tradeMeta.id,
      tradeMeta,
    },
  };
}
