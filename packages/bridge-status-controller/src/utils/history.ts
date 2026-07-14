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
import { getMaxPendingHistoryItemAgeMs } from './feature-flags';

const updateHistoryItem = (
  oldHistoryItem: BridgeHistoryItem,
  txMeta: { id: string; hash?: string },
): Partial<BridgeHistoryItem> => {
  return {
    ...oldHistoryItem,
    txMetaId: txMeta.id,
    originalTransactionId: oldHistoryItem.originalTransactionId ?? txMeta.id,
    status: {
      ...oldHistoryItem.status,
      srcChain: {
        ...oldHistoryItem.status.srcChain,
        txHash: txMeta.hash ?? oldHistoryItem.status.srcChain?.txHash,
      },
    },
  };
};

export const rekeyHistoryItemInState = (
  state: BridgeStatusControllerState,
  oldKey: string,
  newKey: string,
  txMeta: { id: string; hash?: string },
): boolean => {
  const historyItem = state.txHistory[oldKey];
  if (!historyItem) {
    return false;
  }

  state.txHistory[newKey] = {
    ...historyItem,
    ...updateHistoryItem(historyItem, txMeta),
  };
  delete state.txHistory[oldKey];
  return true;
};

export const isBatchSellHistoryItem = (
  historyItem: BridgeHistoryItem,
): boolean => Boolean(historyItem?.batchSellData);

/**
 * Returns the history entry that matches the txMeta by id, actionId, batchId, or txHash
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
      status: {
        srcChain: { txHash },
      },
    } = value;
    return (
      key === txMeta.id ||
      key === txMeta.actionId ||
      txMetaId === txMeta.id ||
      (actionId ? actionId === txMeta.actionId : false) ||
      // When the batch is not atomic (BatchSell), ignore batchId matching to prevent txs
      // in the batch from getting marked complete/failed too early if one fails
      // Multiple BatchSell STX trades may have the same batchId
      (Boolean(batchId) &&
        !isBatchSellHistoryItem(value) &&
        batchId === txMeta.batchId) ||
      (txHash ? txHash.toLowerCase() === txMeta.hash?.toLowerCase() : false)
    );
  });
};

/**
 * Returns the history entry whose approvalTxId matches the approval transaction
 *
 * @param txHistory - The transaction history
 * @param txMeta - The transaction meta
 * @returns The history entry that matches the txMeta
 */
export const getMatchingHistoryEntryForApprovalTxMeta = (
  txHistory: BridgeStatusControllerState['txHistory'],
  txMeta: TransactionMeta,
): [string, BridgeHistoryItem] | undefined => {
  const historyEntries = Object.entries(txHistory);

  return historyEntries.find(([_, value]) =>
    value.approvalTxId ? value.approvalTxId === txMeta.id : false,
  );
};

/**
 * Returns the BatchSell history items in the same batch as the provided tx hash.
 *
 * @param txHistory - The bridge status controller's history to search for matching history items
 * @param txHashOrId - the hash or txMeta.id of a single trade in a BatchSell
 * @returns The matching history items for the tx hash and a boolean indicating if it's a 7702 batch.
 * @example
 * getBatchSellHistoryItemsForTxHash(txHistory, id)
 * If id is the hash or txMetaId of a BatchSell trade, it will return the history items for
 * the trade and all other trades in the same batch.
 */
export const getBatchSellHistoryItemsForTxHash = (
  txHistory: BridgeStatusControllerState['txHistory'],
  txHashOrId?: string,
): { historyItems: BridgeHistoryItem[]; is7702Batch: boolean } => {
  const historyItems = Object.values(txHistory);

  if (!txHashOrId) {
    return {
      historyItems: [],
      is7702Batch: false,
    };
  }

  /**
   * Either a delegation tx or a single STX BatchSell trade
   */
  const parentHistoryItem = historyItems.find(
    ({ status, txMetaId }) =>
      status.srcChain.txHash?.toLowerCase() === txHashOrId.toLowerCase() ||
      txMetaId === txHashOrId,
  );

  // Match by batchId or by quoteId
  const matchingHistoryItems =
    parentHistoryItem?.quoteIds?.map((quoteId) => txHistory[quoteId]) ??
    historyItems.filter(
      ({ batchId }) =>
        batchId &&
        parentHistoryItem?.batchId &&
        batchId === parentHistoryItem.batchId,
    );

  return {
    historyItems: matchingHistoryItems.filter((item) => item !== undefined),
    is7702Batch:
      Boolean(parentHistoryItem) &&
      Boolean(parentHistoryItem?.quoteIds?.length),
  };
};

/**
 * Determines the key to use for storing a bridge history item.
 * Uses actionId for pre-submission tracking, or bridgeTxMetaId for post-submission.
 *
 * @deprecated specify an explicit history key instead
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
): BridgeHistoryItem => {
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
    tokenSecurityTypeDestination,
    inputPrimaryDenomination,
    batchSellData,
    quoteIds,
  } = args;

  // Write all non-status fields to state so we can reference the quote in Activity list without the Bridge API
  // We know it's in progress but not the exact status yet
  const txHistoryItem: BridgeHistoryItem = {
    txMetaId: bridgeTxMeta?.id,
    actionId,
    originalTransactionId: originalTransactionId ?? bridgeTxMeta?.id, // Keep original for intent transactions
    batchId: bridgeTxMeta?.batchId,
    quote: quoteResponse.quote,
    quoteId: quoteResponse.quoteId,
    startTime,
    estimatedProcessingTimeInSeconds:
      quoteResponse.estimatedProcessingTimeInSeconds,
    slippagePercentage,
    pricingData: {
      amountSent: quoteResponse?.sentAmount?.amount ?? '0',
      amountSentInUsd: quoteResponse?.sentAmount?.usd ?? undefined,
      quotedGasInUsd: quoteResponse?.gasFee?.effective?.usd ?? undefined,
      quotedReturnInUsd: quoteResponse?.toTokenAmount?.usd ?? undefined,
      quotedGasAmount: quoteResponse?.gasFee?.effective?.amount ?? undefined,
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
        // We don't set the initial tx hash for STX transactions because they return a hash on submission
        // but it is not finalized until confirmation on chain
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
    ...(tokenSecurityTypeDestination !== undefined && {
      tokenSecurityTypeDestination,
    }),
    ...(inputPrimaryDenomination !== undefined && {
      inputPrimaryDenomination,
    }),
  };

  if (batchSellData) {
    txHistoryItem.batchSellData = batchSellData;
  }
  if (quoteIds) {
    txHistoryItem.quoteIds = quoteIds;
  }

  return txHistoryItem;
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

  return Date.now() - historyItem.startTime > maxPendingHistoryItemAgeMs;
};
