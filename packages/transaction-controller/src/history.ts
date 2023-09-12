import jsonDiffer from 'fast-json-patch';
import { cloneDeep } from 'lodash';

import type {
  TransactionHistory,
  TransactionHistoryEntry,
  TransactionMeta,
} from './types';

/**
 * Generates a history entry from the previous and new transaction metadata.
 *
 * @param previousState - The previous transaction metadata.
 * @param currentState - The new transaction metadata.
 * @param note - A note for the transaction metada update.
 * @returns An array of history operation.
 */
function generateHistoryEntry(
  previousState: any,
  currentState: TransactionMeta,
  note: string,
): TransactionHistoryEntry {
  const historyOperationsEntry = jsonDiffer.compare(
    previousState,
    currentState,
  ) as TransactionHistoryEntry;
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
 * Compares and adds history entry to the provided transactionMeta history.
 *
 * @param transactionMeta - TransactionMeta to add history entry to.
 * @param note - Note to add to history entry.
 */
export function updateTransactionHistory(
  transactionMeta: TransactionMeta,
  note: string,
): void {
  const currentState = snapshotFromTransactionMeta(transactionMeta);
  const previousState = replayHistory(
    transactionMeta.history as TransactionHistory,
  );

  const historyEntry = generateHistoryEntry(previousState, currentState, note);

  if (historyEntry.length) {
    transactionMeta?.history?.push(historyEntry);
  }
}

/**
 * Recovers previous transactionMeta from passed history array.
 *
 * @param transactionHistory - The transaction metadata to replay.
 * @returns The transaction metadata.
 */
function replayHistory(
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
