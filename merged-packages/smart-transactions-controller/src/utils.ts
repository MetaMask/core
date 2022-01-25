import jsonDiffer from 'fast-json-patch';
import { cloneDeep } from 'lodash';
import {
  APIType,
  SmartTransaction,
  SmartTransactionsStatus,
  SmartTransactionStatuses,
  SmartTransactionCancellationReason,
  SmartTransactionMinedTx,
  cancellationReasonToStatusMap,
} from './types';
import { API_BASE_URL } from './constants';

export function isSmartTransactionPending(smartTransaction: SmartTransaction) {
  return smartTransaction.status === SmartTransactionStatuses.PENDING;
}

export const isSmartTransactionStatusResolved = (
  status: SmartTransactionsStatus | string,
) => status === 'uuid_not_found';

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
      return `${API_BASE_URL}/networks/${chainIdDec}/submitTransactions`;
    }

    case APIType.CANCEL: {
      return `${API_BASE_URL}/networks/${chainIdDec}/cancel`;
    }

    case APIType.BATCH_STATUS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/batchStatus`;
    }

    case APIType.LIVENESS: {
      return `${API_BASE_URL}/networks/${chainIdDec}/health`;
    }

    default: {
      throw new Error(`Invalid APIType`); // It can never get here thanks to TypeScript.
    }
  }
}

export const calculateStatus = (status: SmartTransactionsStatus) => {
  if (isSmartTransactionStatusResolved(status)) {
    return SmartTransactionStatuses.RESOLVED;
  }
  const cancellations = [
    SmartTransactionCancellationReason.WOULD_REVERT,
    SmartTransactionCancellationReason.TOO_CHEAP,
    SmartTransactionCancellationReason.DEADLINE_MISSED,
    SmartTransactionCancellationReason.INVALID_NONCE,
    SmartTransactionCancellationReason.USER_CANCELLED,
  ];
  if (status?.minedTx === SmartTransactionMinedTx.NOT_MINED) {
    if (
      status.cancellationReason ===
      SmartTransactionCancellationReason.NOT_CANCELLED
    ) {
      return SmartTransactionStatuses.PENDING;
    }

    const isCancellation =
      cancellations.findIndex(
        (cancellation) => cancellation === status.cancellationReason,
      ) > -1;
    if (status.cancellationReason && isCancellation) {
      return cancellationReasonToStatusMap[status.cancellationReason];
    }
  } else if (status?.minedTx === SmartTransactionMinedTx.SUCCESS) {
    return SmartTransactionStatuses.SUCCESS;
  } else if (status?.minedTx === SmartTransactionMinedTx.REVERTED) {
    return SmartTransactionStatuses.REVERTED;
  } else if (status?.minedTx === SmartTransactionMinedTx.UNKNOWN) {
    return SmartTransactionStatuses.UNKNOWN;
  }
  return SmartTransactionStatuses.UNKNOWN;
};

/**
  Generates an array of history objects sense the previous state.
  The object has the keys
    op (the operation performed),
    path (the key and if a nested object then each key will be separated with a `/`)
    value
  with the first entry having the note and a timestamp when the change took place
  @param {Object} previousState - the previous state of the object
  @param {Object} newState - the update object
  @param {string} [note] - a optional note for the state change
  @returns {Array}
*/
export function generateHistoryEntry(
  previousState: any,
  newState: any,
  note: string,
) {
  const entry: any = jsonDiffer.compare(previousState, newState);
  // Add a note to the first op, since it breaks if we append it to the entry
  if (entry[0]) {
    if (note) {
      entry[0].note = note;
    }

    entry[0].timestamp = Date.now();
  }
  return entry;
}

/**
  Recovers previous txMeta state obj
  @returns {Object}
*/
export function replayHistory(_shortHistory: any) {
  const shortHistory = cloneDeep(_shortHistory);
  return shortHistory.reduce(
    (val: any, entry: any) => jsonDiffer.applyPatch(val, entry).newDocument,
  );
}

/**
 * Snapshot {@code txMeta}
 * @param {Object} txMeta - the tx metadata object
 * @returns {Object} a deep clone without history
 */
export function snapshotFromTxMeta(txMeta: any) {
  const shallow = { ...txMeta };
  delete shallow.history;
  return cloneDeep(shallow);
}

/**
 * Returns processing time for an STX in seconds.
 * @param {number} smartTransactionSubmittedtime
 * @returns {number} Processing time in seconds.
 */
export const getStxProcessingTime = (
  smartTransactionSubmittedtime: number | undefined,
): number | undefined => {
  if (!smartTransactionSubmittedtime) {
    return undefined;
  }
  return Math.round((Date.now() - smartTransactionSubmittedtime) / 1000);
};

export async function handleFetch(request: string, options?: RequestInit) {
  const response = await fetch(request, options);
  const json = await response.json();
  if (!response.ok) {
    const { error: type, error_details: message } = json;
    console.log(`response`, response);
    throw new Error(
      `Fetch error:${JSON.stringify({
        status: response.status,
        type,
        message,
      })}`,
    );
  }
  return json;
}
