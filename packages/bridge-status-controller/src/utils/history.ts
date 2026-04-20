import {
  StatusTypes,
  isCrossChain,
  isNonEvmChainId,
  isTronChainId,
} from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
  BridgeStatusControllerState,
  StartPollingForBridgeTxStatusArgsSerialized,
} from '../types';
import { getNetworkClientByChainId } from './network';
import { getMaxPendingHistoryItemAgeMs } from './feature-flags';

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
 * Returns the history entry that matches the txMeta by id, actionId, batchId, txHash, or approvalTxId
 *
 * @param txHistory - The transaction history
 * @param txMeta - The transaction meta
 * @returns The history entry that matches the txMeta
 */
export const getMatchingHistoryEntryForTxMeta = (
  txHistory: BridgeStatusControllerState['txHistory'],
  txMeta: TransactionMeta,
): [string, BridgeHistoryItem] | undefined => {
  const historyEntries = Object.entries(txHistory);

  return historyEntries.find(([key, value]) => {
    const {
      txMetaId,
      actionId,
      batchId,
      approvalTxId,
      status: {
        srcChain: { txHash },
      },
    } = value;
    return (
      key === txMeta.id ||
      key === txMeta.actionId ||
      txMetaId === txMeta.id ||
      (actionId && actionId === txMeta.actionId) ||
      (batchId && batchId === txMeta.batchId) ||
      (txHash && txHash.toLowerCase() === txMeta.hash?.toLowerCase()) ||
      (approvalTxId && approvalTxId === txMeta.id)
    );
  });
};

/**
 * Determines the key to use for storing a bridge history item.
 * Uses actionId for pre-submission tracking, or bridgeTxMetaId for post-submission.
 *
 * @param actionId - The action ID used for pre-submission tracking
 * @param bridgeTxMetaId - The transaction meta ID from bridgeTxMeta
 * @param syntheticTransactionId - The transactionId of the intent's placeholder transaction
 * @returns The key to use for the history item
 * @throws Error if neither actionId nor bridgeTxMetaId is provided
 */
export function getHistoryKey(
  actionId: string | undefined,
  bridgeTxMetaId: string | undefined,
  syntheticTransactionId?: string,
): string {
  const historyKey = actionId ?? bridgeTxMetaId ?? syntheticTransactionId;
  if (!historyKey) {
    throw new Error(
      'Cannot add tx to history: either actionId, bridgeTxMeta.id, or syntheticTransactionId must be provided',
    );
  }
  return historyKey;
}

export const getInitialHistoryItem = (
  args: StartPollingForBridgeTxStatusArgsSerialized,
): {
  historyKey: string;
  txHistoryItem: BridgeHistoryItem;
} => {
  const {
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
    activeAbTests,
    accountAddress: selectedAddress,
    originalTransactionId,
    actionId,
  } = args;
  // Determine the key for this history item:
  // - For pre-submission (non-batch EVM): use actionId
  // - For post-submission or other cases: use bridgeTxMeta.id
  const historyKey = getHistoryKey(
    actionId,
    bridgeTxMeta?.id,
    originalTransactionId,
  );

  // Write all non-status fields to state so we can reference the quote in Activity list without the Bridge API
  // We know it's in progress but not the exact status yet
  const txHistoryItem = {
    txMetaId: bridgeTxMeta?.id,
    actionId,
    originalTransactionId: originalTransactionId ?? bridgeTxMeta?.id, // Keep original for intent transactions
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
        // STX transactions don't have a final tx hash until they are mined, so we don't set it here
        txHash:
          isNonEvmChainId(quoteResponse.quote.srcChainId) || !isStxEnabled
            ? bridgeTxMeta?.hash
            : undefined,
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

export const isHistoryItemTooOld = (
  messenger: BridgeStatusControllerMessenger,
  historyItem: BridgeHistoryItem,
): boolean => {
  const maxPendingHistoryItemAgeMs = getMaxPendingHistoryItemAgeMs(messenger);

  const isWithinMaxPendingHistoryItemAgeMs = historyItem.startTime
    ? Date.now() - historyItem.startTime <= maxPendingHistoryItemAgeMs
    : false;

  return !isWithinMaxPendingHistoryItemAgeMs;
};

/*
 * Checks if a pending history item is older than 2 days and does not have a valid tx hash
 *
 * @param messenger - The messenger to use to get the transaction meta by hash or id
 * @param historyItem - The history item to check
 *
 * @returns true if the src tx hash is valid or we should still wait for it, false otherwise
 */
export const shouldWaitForSrcTxHash = async (
  messenger: BridgeStatusControllerMessenger,
  historyItem: BridgeHistoryItem,
): Promise<boolean> => {
  if (isHistoryItemTooOld(messenger, historyItem)) {
    return false;
  }

  if (isNonEvmChainId(historyItem.quote.srcChainId)) {
    return true;
  }

  // Otherwise check if the tx has been mined on chain
  const provider = getNetworkClientByChainId(
    messenger,
    historyItem.quote.srcChainId,
  );
  // When this happens it means the network was disabled while the tx was pending
  if (!provider) {
    return false;
  }

  if (!historyItem.status.srcChain.txHash) {
    return false;
  }

  // console.warn(
  //   '======historyItem.status.srcChain.txHash',
  //   historyItem.status.srcChain.txHash,
  //   historyItem.txMetaId,
  // );

  return provider
    .request({
      method: 'eth_getTransactionReceipt',
      params: [historyItem.status.srcChain.txHash],
    })
    .then((txReceipt) => {
      if (txReceipt) {
        return true;
      }
      return false;
    })
    .catch(() => {
      return false;
    });
};

export const incrementPollingAttempts = (
  historyItem: BridgeHistoryItem,
): NonNullable<BridgeHistoryItem['attempts']> => {
  const { attempts } = historyItem;
  const newAttempts = attempts
    ? {
        counter: attempts.counter + 1,
        lastAttemptTime: Date.now(),
      }
    : {
        counter: 1,
        lastAttemptTime: Date.now(),
      };
  return newAttempts;
};
