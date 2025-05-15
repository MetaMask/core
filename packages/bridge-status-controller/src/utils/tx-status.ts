import type { Step } from '@metamask/bridge-controller';
import { ActionTypes, StatusTypes } from '@metamask/bridge-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';

import type { BridgeHistoryItem, SolanaTransactionMeta } from '../types';

export const isIncompleteTransactionCleanup = (status: TransactionStatus) =>
  [TransactionStatus.approved, TransactionStatus.signed].includes(status);

export const isBridgeTransaction = (type?: TransactionType) =>
  type === TransactionType.bridge;

/**
 * Internal type defining the relevant parts of a transaction object
 * needed for bridge status utility functions.
 */
type BridgeTransaction = Pick<SolanaTransactionMeta, 'isBridgeTx'> & {
  bridgeInfo?: {
    status?: string;
    destTxHash?: string;
  };
};

/**
 *
 * @param transaction
 */
export function isBridgeComplete(transaction: BridgeTransaction): boolean {
  return Boolean(
    transaction.isBridgeTx &&
      transaction.bridgeInfo &&
      (transaction.bridgeInfo.status === StatusTypes.COMPLETE ||
        transaction.bridgeInfo.status === 'COMPLETE') &&
      typeof transaction.bridgeInfo.destTxHash === 'string' &&
      transaction.bridgeInfo.destTxHash.length > 0,
  );
}

/**
 *
 * @param transaction
 * @param baseStatusKey
 */
export function isBridgeFailed(
  transaction: BridgeTransaction,
  baseStatusKey: TransactionStatus,
): boolean {
  const bridgeFailed = Boolean(
    transaction.isBridgeTx &&
      transaction.bridgeInfo &&
      (transaction.bridgeInfo.status === StatusTypes.FAILED ||
        transaction.bridgeInfo.status === 'FAILED'),
  );
  const baseFailed = baseStatusKey === TransactionStatus.failed;

  return bridgeFailed || baseFailed;
}

/**
 *
 * @param transaction
 * @param baseStatusKey
 */
export function getBridgeStatusKey(
  transaction: BridgeTransaction,
  baseStatusKey: TransactionStatus,
) {
  if (!transaction.isBridgeTx || !transaction.bridgeInfo) {
    return baseStatusKey;
  }

  if (isBridgeFailed(transaction, baseStatusKey)) {
    return TransactionStatus.failed;
  }

  if (
    isBridgeComplete(transaction) &&
    baseStatusKey === TransactionStatus.confirmed
  ) {
    return TransactionStatus.confirmed;
  }

  return TransactionStatus.submitted;
}

export const getSrcTxStatus = (initialTransaction: TransactionMeta) => {
  return initialTransaction.status === TransactionStatus.confirmed
    ? StatusTypes.COMPLETE
    : StatusTypes.PENDING;
};

export const getDestTxStatus = ({
  bridgeTxHistoryItem,
  srcTxStatus,
}: {
  bridgeTxHistoryItem?: BridgeHistoryItem;
  srcTxStatus: StatusTypes;
}) => {
  if (srcTxStatus !== StatusTypes.COMPLETE) {
    return null;
  }

  if (bridgeTxHistoryItem?.status.status === StatusTypes.FAILED) {
    return StatusTypes.FAILED;
  }

  return bridgeTxHistoryItem?.status.destChain?.txHash
    ? StatusTypes.COMPLETE
    : StatusTypes.PENDING;
};

const getBridgeActionStatus = (bridgeHistoryItem: BridgeHistoryItem) => {
  return bridgeHistoryItem.status ? bridgeHistoryItem.status.status : null;
};

/**
 * swap actions can have step.srcChainId === step.destChainId, and can occur on
 * EITHER the quote.srcChainId or the quote.destChainId
 * Despite not having any actual timestamp,we can infer the status of the swap action
 * based on the status of the source chain tx if srcChainId and destChainId are the same*
 *
 * @param bridgeHistoryItem - The bridge history item
 * @param step - The step of the bridge history item
 * @param srcChainTxMeta - The source chain transaction meta
 */
const getSwapActionStatus = (
  bridgeHistoryItem: BridgeHistoryItem,
  step: Step,
  srcChainTxMeta?: TransactionMeta,
) => {
  const isSrcAndDestChainSame = step.srcChainId === step.destChainId;
  const isSwapOnSrcChain =
    step.srcChainId === bridgeHistoryItem.quote.srcChainId;

  if (isSrcAndDestChainSame && isSwapOnSrcChain) {
    // if the swap action is on the src chain (i.e. step.srcChainId === step.destChainId === bridgeHistoryItem.quote.srcChainId),
    // we check the source chain tx status, since we know when it's confirmed
    const isSrcChainTxConfirmed =
      srcChainTxMeta?.status === TransactionStatus.confirmed;
    return isSrcChainTxConfirmed ? StatusTypes.COMPLETE : StatusTypes.PENDING;
  }
  // if the swap action is on the dest chain, we check the bridgeHistoryItem.status,
  // since we don't know when the dest tx is confirmed
  if (srcChainTxMeta?.status === TransactionStatus.confirmed) {
    return bridgeHistoryItem.status ? bridgeHistoryItem.status.status : null;
  }

  // If the source chain tx is not confirmed, we know the swap hasn't started
  // use null to represent this as we don't have an equivalent in StatusTypes
  return null;
};

/**
 * @param bridgeHistoryItem.bridgeHistoryItem
 * @param bridgeHistoryItem - The bridge history item
 * @param step - The step of the bridge history item
 * @param srcChainTxMeta - The source chain transaction meta
 * @param bridgeHistoryItem.step
 * @param bridgeHistoryItem.srcChainTxMeta
 * @returns The status of the Step
 */
export const getStepStatus = ({
  bridgeHistoryItem,
  step,
  srcChainTxMeta,
}: {
  bridgeHistoryItem?: BridgeHistoryItem;
  step: Step;
  srcChainTxMeta?: TransactionMeta;
}) => {
  if (!bridgeHistoryItem) {
    return StatusTypes.UNKNOWN;
  }

  if (step.action === ActionTypes.SWAP) {
    return getSwapActionStatus(bridgeHistoryItem, step, srcChainTxMeta);
  } else if (step.action === ActionTypes.BRIDGE) {
    return getBridgeActionStatus(bridgeHistoryItem);
  }

  return StatusTypes.UNKNOWN;
};

/**
 * Checks if at least 10 minutes have passed since the bridge tx was submitted
 *
 * @param status - The status of the bridge history item
 * @param bridgeHistoryItem - The bridge history item
 * @returns Whether the bridge history item should be treated as delayed
 */
export const getIsDelayed = (
  status: StatusTypes,
  bridgeHistoryItem?: BridgeHistoryItem,
) => {
  const tenMinutesInMs = 10 * 60 * 1000;
  return Boolean(
    status === StatusTypes.PENDING &&
      bridgeHistoryItem?.startTime &&
      Date.now() >
        bridgeHistoryItem.startTime +
          tenMinutesInMs +
          bridgeHistoryItem.estimatedProcessingTimeInSeconds * 1000,
  );
};
