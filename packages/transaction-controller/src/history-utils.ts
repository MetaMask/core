import jsonDiffer from 'fast-json-patch';
import { cloneDeep } from 'lodash';

import type {
  TransactionMeta,
  ExtendedHistoryOperation,
  TransactionHistory,
} from './types';

/**
 * Generates a history entry from the previous and new transaction metadata.
 *
 * @param previousState - The previous transaction metadata.
 * @param currentState - The new transaction metadata.
 * @param note - A note for the transaction metada update.
 * @returns An array of history operation.
 */
export function generateHistoryEntry(
  previousState: any,
  currentState: TransactionMeta,
  note: string,
): ExtendedHistoryOperation[] {
  const historyOperationsEntry = jsonDiffer.compare(
    previousState,
    currentState,
  ) as ExtendedHistoryOperation[];
  // Add a note to the first operation, since it breaks if we append it to the entry
  if (historyOperationsEntry[0]) {
    if (note) {
      historyOperationsEntry[0].note = note;
    }
    historyOperationsEntry[0].timestamp = Date.now();
  }
  return historyOperationsEntry;
}

/**
 * Recovers previous transactionMeta from passed history array.
 *
 * @param transactionHistory - The transaction metadata to replay.
 * @returns The transaction metadata.
 */
export function replayHistory(
  transactionHistory: TransactionHistory,
): TransactionMeta {
  const shortHistory = cloneDeep(transactionHistory);
  return shortHistory.reduce(
    (val, entry: any) => jsonDiffer.applyPatch(val, entry).newDocument,
  ) as TransactionMeta;
}

/**
 * Clone the transaction meta data without the history property.
 *
 * @param transactionMeta - The transaction metadata to snapshot.
 * @returns A deep clone of transaction metadata without history property.
 */
export function snapshotFromTransactionMeta(
  transactionMeta: TransactionMeta,
): TransactionMeta {
  const snapshot = { ...transactionMeta };
  delete snapshot.history;
  return cloneDeep(snapshot);
}
