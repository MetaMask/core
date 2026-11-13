import { arrayify, hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { parse } from '@ethersproject/transactions';
import {
  SentinelCancellationReason,
  SentinelMinedTxStatus,
} from '@metamask/sentinel-api-service';
import type {
  TransactionControllerFailTransactionAction,
  TransactionControllerGetTransactionsAction,
} from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import { hasProperty } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type {
  SmartTransaction,
  SmartTransactionsStatus,
  SmartTransactionsNetworkConfig,
} from './types.js';
import {
  SmartTransactionStatuses,
  cancellationReasonToStatusMap,
  ClientId,
} from './types.js';

export function isSmartTransactionPending(smartTransaction: SmartTransaction) {
  return smartTransaction.status === SmartTransactionStatuses.PENDING;
}

export const isSmartTransactionStatusResolved = (
  stxStatus: SmartTransactionsStatus | string,
) => stxStatus === 'uuid_not_found';

export const calculateStatus = (
  stxStatus: SmartTransactionsStatus,
): SmartTransactionStatuses => {
  if (isSmartTransactionStatusResolved(stxStatus)) {
    return SmartTransactionStatuses.RESOLVED;
  }
  const cancellations = [
    SentinelCancellationReason.WouldRevert,
    SentinelCancellationReason.TooCheap,
    SentinelCancellationReason.DeadlineMissed,
    SentinelCancellationReason.InvalidNonce,
    SentinelCancellationReason.UserCancelled,
  ];
  if (stxStatus?.minedTx === SentinelMinedTxStatus.NotMined) {
    if (
      stxStatus.cancellationReason === SentinelCancellationReason.NotCancelled
    ) {
      return SmartTransactionStatuses.PENDING;
    }

    const isCancellation =
      cancellations.findIndex(
        (cancellation) => cancellation === stxStatus.cancellationReason,
      ) > -1;
    if (stxStatus.cancellationReason && isCancellation) {
      if (!stxStatus.isSettled) {
        return SmartTransactionStatuses.PENDING;
      }
      return cancellationReasonToStatusMap[stxStatus.cancellationReason];
    }
  } else if (stxStatus?.minedTx === SentinelMinedTxStatus.Success) {
    return SmartTransactionStatuses.SUCCESS;
  } else if (stxStatus?.minedTx === SentinelMinedTxStatus.Cancelled) {
    return SmartTransactionStatuses.CANCELLED;
  } else if (stxStatus?.minedTx === SentinelMinedTxStatus.Reverted) {
    return SmartTransactionStatuses.REVERTED;
  }
  return SmartTransactionStatuses.UNKNOWN;
};

/**
 * Returns processing time for an STX in seconds.
 *
 * @param smartTransactionSubmittedtime
 * @returns Processing time in seconds.
 */
export const getStxProcessingTime = (
  smartTransactionSubmittedtime: number | undefined,
): number | undefined => {
  if (!smartTransactionSubmittedtime) {
    return undefined;
  }
  return Math.round((Date.now() - smartTransactionSubmittedtime) / 1000);
};

export const getErrorData = (error: unknown): string => {
  if (error && typeof error === 'object' && hasProperty(error, 'data')) {
    const { data } = error;
    if (data && typeof data === 'object') {
      if (hasProperty(data, 'error') && typeof data.error === 'string') {
        return data.error;
      }
      return JSON.stringify(data);
    }
  }

  return error instanceof Error ? error.message : String(error);
};

export const isSmartTransactionCancellable = (
  stxStatus: SmartTransactionsStatus,
): boolean => {
  return (
    stxStatus.minedTx === SentinelMinedTxStatus.NotMined &&
    (!stxStatus.cancellationReason ||
      stxStatus.cancellationReason === SentinelCancellationReason.NotCancelled)
  );
};

export const incrementNonceInHex = (nonceInHex: string): string => {
  const nonceInDec = new BigNumber(nonceInHex, 16).toString(10);
  return hexlify(Number(nonceInDec) + 1);
};

const isType4Transaction = (signedTxHex: string) => {
  return typeof signedTxHex === 'string' && signedTxHex.startsWith('0x04');
};

export const getTxHash = (signedTxHex: any) => {
  if (!signedTxHex) {
    return '';
  }
  try {
    const parsed = parse(signedTxHex);
    return parsed?.hash ?? '';
  } catch (error) {
    if (isType4Transaction(signedTxHex)) {
      return hexlify(keccak256(arrayify(signedTxHex)));
    }
    throw error;
  }
};

export const getSmartTransactionMetricsProperties = (
  smartTransaction: SmartTransaction,
) => {
  if (!smartTransaction) {
    return {};
  }
  const smartTransactionStatusMetadata = smartTransaction.statusMetadata;
  return {
    stx_status: smartTransaction.status,
    type: smartTransaction.type,
    processing_time: getStxProcessingTime(smartTransaction.time),
    is_smart_transaction: true,
    stx_enabled: true,
    current_stx_enabled: true,
    stx_user_opt_in: true,
    stx_duplicated: smartTransactionStatusMetadata?.duplicated,
    stx_timed_out: smartTransactionStatusMetadata?.timedOut,
    stx_proxied: smartTransactionStatusMetadata?.proxied,
    stx_original_transaction_status:
      smartTransactionStatusMetadata?.originalTransactionStatus,
  };
};

export const getSmartTransactionMetricsSensitiveProperties = (
  smartTransaction: SmartTransaction,
) => {
  if (!smartTransaction) {
    return {};
  }
  return {
    token_from_symbol: smartTransaction.sourceTokenSymbol,
    token_to_symbol: smartTransaction.destinationTokenSymbol,
    account_hardware_type: smartTransaction.accountHardwareType,
    account_type: smartTransaction.accountType,
    device_model: smartTransaction.deviceModel,
  };
};

export const getReturnTxHashAsap = (
  clientId: ClientId,
  featureFlags: SmartTransactionsNetworkConfig,
) => {
  return clientId === ClientId.Extension
    ? featureFlags.extensionReturnTxHashAsap
    : featureFlags.mobileReturnTxHashAsap;
};

export const shouldMarkRegularTransactionsAsFailed = ({
  smartTransaction,
  clientId,
  featureFlags,
}: {
  smartTransaction: SmartTransaction;
  clientId: ClientId;
  featureFlags: SmartTransactionsNetworkConfig;
}): boolean => {
  const { status, transactionId } = smartTransaction;
  const failureStatuses: SmartTransactionStatuses[] = [
    SmartTransactionStatuses.CANCELLED,
    SmartTransactionStatuses.CANCELLED_USER_CANCELLED,
    SmartTransactionStatuses.UNKNOWN,
    SmartTransactionStatuses.RESOLVED,
  ];
  if (
    !status ||
    !failureStatuses.includes(status as SmartTransactionStatuses)
  ) {
    return false;
  }
  const returnTxHashAsapEnabled = getReturnTxHashAsap(clientId, featureFlags);
  return Boolean(returnTxHashAsapEnabled && transactionId);
};

export const markRegularTransactionsAsFailed = ({
  smartTransaction,
  getRegularTransactions,
  failTransaction,
}: {
  smartTransaction: SmartTransaction;
  getRegularTransactions: TransactionControllerGetTransactionsAction['handler'];
  failTransaction: TransactionControllerFailTransactionAction['handler'];
}) => {
  const { transactionId, status, statusMetadata, txHashes } = smartTransaction;
  const originalTransactionStatus = statusMetadata?.originalTransactionStatus;

  const transactionsToFail = getRegularTransactions().filter(
    (tx) => (tx.hash && txHashes?.includes(tx.hash)) || tx.id === transactionId,
  );

  if (!transactionsToFail.length) {
    throw new Error('Cannot find regular transaction to mark it as failed');
  }

  const errorMessage = originalTransactionStatus
    ? `Smart transaction failed with status: ${status}, originalTransactionStatus: ${originalTransactionStatus}`
    : `Smart transaction failed with status: ${status}`;

  for (const tx of transactionsToFail) {
    if (tx.status === TransactionStatus.failed) {
      continue; // Already marked as failed.
    }

    const error = new Error(errorMessage);
    error.name = 'SmartTransactionFailed';

    // Fail via the TransactionController's `failTransaction` action rather than
    // `updateTransaction` so the transaction lifecycle events
    // (`transactionFailed`, `transactionStatusUpdated`, `transactionFinished`)
    // are emitted. Downstream subscribers such as the bridge status controller
    // and metrics rely on these events; a plain state update leaves e.g. bridge
    // transactions stuck as pending forever.
    failTransaction(tx.id, error);
  }
};
