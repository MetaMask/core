import { arrayify, hexlify } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { parse } from '@ethersproject/transactions';
import type {
  TransactionControllerGetTransactionsAction,
  TransactionControllerUpdateTransactionAction,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';
import _ from 'lodash';

// Ignoring TypeScript errors here because this import is disallowed for production builds, because
// the `package.json` file is above the root directory.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import packageJson from '../package.json';
import { API_BASE_URL, SENTINEL_API_BASE_URL_MAP } from './constants';
import type {
  SmartTransaction,
  SmartTransactionsStatus,
  FeatureFlags,
} from './types';
import {
  APIType,
  SmartTransactionStatuses,
  SmartTransactionCancellationReason,
  SmartTransactionMinedTx,
  cancellationReasonToStatusMap,
  ClientId,
} from './types';

export function isSmartTransactionPending(smartTransaction: SmartTransaction) {
  return smartTransaction.status === SmartTransactionStatuses.PENDING;
}

export const isSmartTransactionStatusResolved = (
  stxStatus: SmartTransactionsStatus | string,
) => stxStatus === 'uuid_not_found';

// TODO use actual url once API is defined
export function getAPIRequestURL(apiType: APIType, chainId: string): string {
  const chainIdDec = parseInt(chainId, 16);
  switch (apiType) {
    case APIType.GET_FEES: {
      return `${API_BASE_URL}/networks/${chainIdDec}/getFees`;
    }

    case APIType.ESTIMATE_GAS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/estimateGas`;
    }

    case APIType.SUBMIT_TRANSACTIONS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/submitTransactions?stxControllerVersion=${packageJson.version}`;
    }

    case APIType.CANCEL: {
      return `${API_BASE_URL}/networks/${chainIdDec}/cancel`;
    }

    case APIType.BATCH_STATUS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/batchStatus`;
    }

    case APIType.LIVENESS: {
      return `${SENTINEL_API_BASE_URL_MAP[chainIdDec]}/network`;
    }

    default: {
      throw new Error(`Invalid APIType`); // It can never get here thanks to TypeScript.
    }
  }
}

export const calculateStatus = (stxStatus: SmartTransactionsStatus) => {
  if (isSmartTransactionStatusResolved(stxStatus)) {
    return SmartTransactionStatuses.RESOLVED;
  }
  const cancellations = [
    SmartTransactionCancellationReason.WOULD_REVERT,
    SmartTransactionCancellationReason.TOO_CHEAP,
    SmartTransactionCancellationReason.DEADLINE_MISSED,
    SmartTransactionCancellationReason.INVALID_NONCE,
    SmartTransactionCancellationReason.USER_CANCELLED,
  ];
  if (stxStatus?.minedTx === SmartTransactionMinedTx.NOT_MINED) {
    if (
      stxStatus.cancellationReason ===
      SmartTransactionCancellationReason.NOT_CANCELLED
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
  } else if (stxStatus?.minedTx === SmartTransactionMinedTx.SUCCESS) {
    return SmartTransactionStatuses.SUCCESS;
  } else if (stxStatus?.minedTx === SmartTransactionMinedTx.CANCELLED) {
    return SmartTransactionStatuses.CANCELLED;
  } else if (stxStatus?.minedTx === SmartTransactionMinedTx.REVERTED) {
    return SmartTransactionStatuses.REVERTED;
  } else if (stxStatus?.minedTx === SmartTransactionMinedTx.UNKNOWN) {
    return SmartTransactionStatuses.UNKNOWN;
  }
  return SmartTransactionStatuses.UNKNOWN;
};

/**
 * Returns processing time for an STX in seconds.
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

export const mapKeysToCamel = (
  obj: Record<string, any>,
): Record<string, any> => {
  if (!_.isObject(obj)) {
    return obj;
  }
  const mappedValues = _.mapValues(obj, (val: Record<string, any>) => {
    if (_.isArray(val)) {
      return val.map(mapKeysToCamel);
    } else if (_.isObject(val)) {
      return mapKeysToCamel(val);
    }
    return val;
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return _.mapKeys(mappedValues, (value, key) => _.camelCase(key));
};

export async function handleFetch(request: string, options?: RequestInit) {
  const response = await fetch(request, options);
  const json = await response.json();
  if (!response.ok) {
    console.log(`response`, response);
    throw new Error(
      `Fetch error:${JSON.stringify({
        status: response.status,
        ...mapKeysToCamel(json),
      })}`,
    );
  }
  return json;
}

export const isSmartTransactionCancellable = (
  stxStatus: SmartTransactionsStatus,
): boolean => {
  return (
    stxStatus.minedTx === SmartTransactionMinedTx.NOT_MINED &&
    (!stxStatus.cancellationReason ||
      stxStatus.cancellationReason ===
        SmartTransactionCancellationReason.NOT_CANCELLED)
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
  smartTransactionsFeatureFlags: FeatureFlags['smartTransactions'],
) => {
  return clientId === ClientId.Extension
    ? smartTransactionsFeatureFlags?.extensionReturnTxHashAsap
    : smartTransactionsFeatureFlags?.mobileReturnTxHashAsap;
};

export const shouldMarkRegularTransactionsAsFailed = ({
  smartTransaction,
  clientId,
  getFeatureFlags,
}: {
  smartTransaction: SmartTransaction;
  clientId: ClientId;
  getFeatureFlags: () => FeatureFlags;
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
  const { smartTransactions: smartTransactionsFeatureFlags } =
    getFeatureFlags() ?? {};
  const returnTxHashAsapEnabled = getReturnTxHashAsap(
    clientId,
    smartTransactionsFeatureFlags,
  );
  return Boolean(returnTxHashAsapEnabled && transactionId);
};

export const markRegularTransactionsAsFailed = ({
  smartTransaction,
  getRegularTransactions,
  updateTransaction,
}: {
  smartTransaction: SmartTransaction;
  getRegularTransactions: TransactionControllerGetTransactionsAction['handler'];
  updateTransaction: TransactionControllerUpdateTransactionAction['handler'];
}) => {
  const { transactionId, status, txHashes } = smartTransaction;

  const transactionsToFail = getRegularTransactions().filter(
    (tx) => (tx.hash && txHashes?.includes(tx.hash)) || tx.id === transactionId,
  );

  if (!transactionsToFail.length) {
    throw new Error('Cannot find regular transaction to mark it as failed');
  }

  for (const tx of transactionsToFail) {
    if (tx.status === TransactionStatus.failed) {
      continue; // Already marked as failed.
    }
    const updatedTransaction: TransactionMeta = {
      ...tx,
      status: TransactionStatus.failed,
      error: {
        name: 'SmartTransactionFailed',
        message: `Smart transaction failed with status: ${status}`,
      },
    };

    updateTransaction(
      updatedTransaction,
      `Smart transaction status: ${status}`,
    );
  }
};
