import jsonDiffer from 'fast-json-patch';
import { cloneDeep } from 'lodash';

import type {
  TransactionHistory,
  TransactionHistoryEntry,
  TransactionMeta,
} from '../types';

/**
 * Add initial history snapshot to the provided transactionMeta history.
 *
 * @param transactionMeta - TransactionMeta to add initial history snapshot to.
 */
export function addInitialHistorySnapshot(transactionMeta: TransactionMeta) {
  const snapshot = snapshotFromTransactionMeta(transactionMeta);
  transactionMeta.history = [snapshot];
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
  if (!transactionMeta.history) {
    return;
  }

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
 * Generates a history entry from the previous and new transaction metadata.
 *
 * @param previousState - The previous transaction metadata.
 * @param currentState - The new transaction metadata.
 * @param note - A note for the transaction metada update.
 * @returns An array of history operation.
 */
function generateHistoryEntry(
  // TODO: Replace `any` with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (val, entry: any) => jsonDiffer.applyPatch(val, entry).newDocument,
  ) as TransactionMeta;
}

/**
 * Clone the transaction meta data without the history property.
 *
 * @param transactionMeta - The transaction metadata to snapshot.
 * @returns A deep clone of transaction metadata without history property.
 */
function snapshotFromTransactionMeta(
  transactionMeta: TransactionMeta,
): TransactionMeta {
  const snapshot = { ...transactionMeta };
  delete snapshot.history;
  return cloneDeep(snapshot);
}
