import {
  StatusTypes,
  isCrossChain,
  isNonEvmChainId,
  isTronChainId,
} from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import type {
  BridgeHistoryItem,
  BridgeStatusControllerMessenger,
  BridgeStatusControllerState,
  StartPollingForBridgeTxStatusArgsSerialized,
} from '../types.js';
import { getMaxPendingHistoryItemAgeMs } from './feature-flags.js';
import { isApprovalTx, isAtomic7702BatchTx } from './transaction.js';

const TRANSACTION_STATUS_TO_STATUS_TYPES: Partial<
  Record<TransactionStatus, StatusTypes>
> = {
  [TransactionStatus.failed]: StatusTypes.FAILED,
  [TransactionStatus.submitted]: StatusTypes.PENDING,
  [TransactionStatus.confirmed]: StatusTypes.COMPLETE,
};

const updateHistoryItem = (
  oldHistoryItem: BridgeHistoryItem,
  txMeta?: Partial<
    Pick<TransactionMeta, 'id' | 'actionId' | 'status' | 'hash'>
  >,
  historyItemOverrides?: Partial<
    Pick<BridgeHistoryItem, 'approvalTxId' | 'quoteIds' | 'quote'>
  >,
): Partial<BridgeHistoryItem> => {
  return {
    ...oldHistoryItem,
    txMetaId: txMeta?.id ?? oldHistoryItem.txMetaId,
    originalTransactionId: oldHistoryItem.originalTransactionId ?? txMeta?.id,
    actionId: txMeta?.actionId ?? oldHistoryItem.actionId,
    approvalTxId:
      historyItemOverrides?.approvalTxId ?? oldHistoryItem.approvalTxId,
    status: {
      ...oldHistoryItem.status,
      srcChain: {
        ...oldHistoryItem.status.srcChain,
        txHash: txMeta?.hash ?? oldHistoryItem.status.srcChain?.txHash,
      },
      status:
        (txMeta?.status && TRANSACTION_STATUS_TO_STATUS_TYPES[txMeta.status]
          ? TRANSACTION_STATUS_TO_STATUS_TYPES[txMeta.status]
          : oldHistoryItem.status?.status) ?? StatusTypes.PENDING,
    },
    ...(historyItemOverrides?.quote && { quote: historyItemOverrides.quote }),
    ...(historyItemOverrides?.quoteIds && {
      quoteIds: historyItemOverrides.quoteIds,
    }),
  };
};

export const rekeyHistoryItemInState = (
  state: BridgeStatusControllerState,
  oldKey: string,
  newKey: string,
  txMeta?: { id: string; hash?: string },
  historyItemOverrides?: Partial<
    Pick<BridgeHistoryItem, 'approvalTxId' | 'quoteIds' | 'quote'>
  >,
): boolean => {
  const historyItem = state.txHistory[oldKey];
  if (!historyItem) {
    return false;
  }

  state.txHistory[newKey] = {
    ...historyItem,
    ...updateHistoryItem(historyItem, txMeta, historyItemOverrides),
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

  return historyEntries.find(([key, historyItem]) => {
    const {
      txMetaId,
      actionId,
      batchId,
      status: {
        srcChain: { txHash },
      },
    } = historyItem;

    const isInitialBatchTx =
      (Boolean(batchId) && batchId === txMeta.batchId) ||
      key === txMeta.batchId;

    const isTxMetaIdMatch = txMetaId === txMeta.id || key === txMeta.id;

    if (isBatchSellHistoryItem(historyItem)) {
      if (isAtomic7702BatchTx(txMeta)) {
        return isInitialBatchTx || isTxMetaIdMatch;
      }
      // STX batch-sell
      const isInitialBatchSellStxTrade =
        isInitialBatchTx && !txMetaId && !actionId;
      return !isInitialBatchSellStxTrade && isTxMetaIdMatch;
    }

    // Exclude approval transactions when matching by actionId to prevent
    // premature quote event publishing
    const isInitialRegularTx =
      Boolean(actionId) &&
      key === txMeta.actionId &&
      !(txMeta.type && isApprovalTx(txMeta.type));

    const isTxHashMatch = txHash
      ? txHash.toLowerCase() === txMeta.hash?.toLowerCase()
      : false;

    return [
      isInitialBatchTx,
      isInitialRegularTx,
      isTxMetaIdMatch,
      isTxHashMatch,
    ].some(Boolean);
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

  return historyEntries.find(([key, value]) => {
    if (value.approvalTxId && value.approvalTxId === txMeta.id) {
      return true;
    }

    // approvalTxId is written only after the approval hash resolves
    // until then the pre-submit actionId maps to the approval
    return (
      Boolean(txMeta.actionId) &&
      Boolean(value.actionId) &&
      key === txMeta.actionId &&
      Boolean(txMeta.type && isApprovalTx(txMeta.type))
    );
  });
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
    customSlippage,
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
    ...(customSlippage !== undefined && { customSlippage }),
    pricingData: {
      amountSent: quoteResponse?.sentAmount?.amount ?? '0',
      amountSentInUsd: quoteResponse?.sentAmount?.usd ?? undefined,
      quotedGasInUsd: quoteResponse?.gasFee?.total?.usd ?? undefined,
      quotedReturnInUsd: quoteResponse?.toTokenAmount?.usd ?? undefined,
      quotedGasAmount: quoteResponse?.gasFee?.total?.amount ?? undefined,
    },
    initialDestAssetBalance,
    targetContractAddress,
    account: selectedAddress,
    status: {
      // We always have a PENDING status when we start polling for a tx, don't need the Bridge API for that
      // Also we know the bare minimum fields for status at this point in time
      status:
        (bridgeTxMeta?.status &&
          TRANSACTION_STATUS_TO_STATUS_TYPES[bridgeTxMeta.status]) ??
        StatusTypes.PENDING,
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
