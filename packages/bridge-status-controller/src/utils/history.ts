import {
  StatusTypes,
  isCrossChain,
  isTronChainId,
} from '@metamask/bridge-controller';

import type {
  BridgeHistoryItem,
  BridgeStatusControllerState,
  StartPollingForBridgeTxStatusArgsSerialized,
} from '../types';

export const rekeyHistoryItemInState = (
  state: BridgeStatusControllerState,
  actionId: string,
  txMeta: { id: string; hash?: string },
): boolean => {
  const historyItem = state.txHistory[actionId];
  if (!historyItem) {
    return false;
  }

  state.txHistory[txMeta.id] = {
    ...historyItem,
    txMetaId: txMeta.id,
    originalTransactionId: historyItem.originalTransactionId ?? txMeta.id,
    status: {
      ...historyItem.status,
      srcChain: {
        ...historyItem.status.srcChain,
        txHash: txMeta.hash ?? historyItem.status.srcChain?.txHash,
      },
    },
  };
  delete state.txHistory[actionId];
  return true;
};

/**
 * Determines the key to use for storing a bridge history item.
 * Uses actionId for pre-submission tracking, or bridgeTxMetaId for post-submission.
 *
 * @param actionId - The action ID used for pre-submission tracking
 * @param bridgeTxMetaId - The transaction meta ID from bridgeTxMeta
 * @returns The key to use for the history item
 * @throws Error if neither actionId nor bridgeTxMetaId is provided
 */
export function getHistoryKey(
  actionId: string | undefined,
  bridgeTxMetaId: string | undefined,
): string {
  const historyKey = actionId ?? bridgeTxMetaId;
  if (!historyKey) {
    throw new Error(
      'Cannot add tx to history: either actionId or bridgeTxMeta.id must be provided',
    );
  }
  return historyKey;
}

export const getInitialHistoryItem = (
  {
    bridgeTxMeta,
    quoteResponse,
    startTime,
    slippagePercentage,
    initialDestAssetBalance,
    targetContractAddress,
    approvalTxId,
    isStxEnabled,
    location,
    abTests,
    statusRequest,
    activeAbTests,
    accountAddress: selectedAddress,
  }: StartPollingForBridgeTxStatusArgsSerialized,
  actionId?: string,
): {
  historyKey: string;
  txHistoryItem: BridgeHistoryItem;
} => {
  // Determine the key for this history item:
  // - For pre-submission (non-batch EVM): use actionId
  // - For post-submission or other cases: use bridgeTxMeta.id
  const historyKey = getHistoryKey(actionId, bridgeTxMeta?.id);

  // Write all non-status fields to state so we can reference the quote in Activity list without the Bridge API
  // We know it's in progress but not the exact status yet
  const txHistoryItem = {
    txMetaId: bridgeTxMeta?.id,
    actionId,
    originalTransactionId:
      (bridgeTxMeta as unknown as { originalTransactionId: string })
        ?.originalTransactionId || bridgeTxMeta?.id, // Keep original for intent transactions
    batchId: bridgeTxMeta?.batchId,
    quote: quoteResponse.quote,
    startTime,
    estimatedProcessingTimeInSeconds:
      quoteResponse.estimatedProcessingTimeInSeconds,
    slippagePercentage,
    pricingData: {
      amountSent: quoteResponse.sentAmount?.amount ?? '0',
      amountSentInUsd: quoteResponse.sentAmount?.usd ?? undefined,
      quotedGasInUsd: quoteResponse.gasFee?.effective?.usd ?? undefined,
      quotedReturnInUsd: quoteResponse.toTokenAmount?.usd ?? undefined,
      quotedGasAmount: quoteResponse.gasFee?.effective?.amount ?? undefined,
    },
    initialDestAssetBalance,
    targetContractAddress,
    account: selectedAddress,
    status: {
      // We always have a PENDING status when we start polling for a tx, don't need the Bridge API for that
      // Also we know the bare minimum fields for status at this point in time
      status: StatusTypes.PENDING,
      srcChain: {
        chainId: quoteResponse.quote.srcChainId,
        txHash: statusRequest?.srcTxHash ?? bridgeTxMeta?.hash,
      },
    },
    hasApprovalTx: Boolean(quoteResponse.approval),
    approvalTxId,
    isStxEnabled: Boolean(isStxEnabled),
    featureId: quoteResponse.featureId,
    location,
    ...(abTests && { abTests }),
    ...(activeAbTests && { activeAbTests }),
  };

  return { historyKey, txHistoryItem };
};

export const shouldPollHistoryItem = (
  historyItem: BridgeHistoryItem,
): boolean => {
  const isIntent = Boolean(historyItem?.quote?.intent);
  const isBridgeTx = isCrossChain(
    historyItem.quote.srcChainId,
    historyItem.quote.destChainId,
  );
  const isTronTx = isTronChainId(historyItem.quote.srcChainId);

  return [isBridgeTx, isIntent, isTronTx].some(Boolean);
};
