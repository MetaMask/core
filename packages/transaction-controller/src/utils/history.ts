import jsonDiffer from 'fast-json-patch';
import { cloneDeep, merge } from 'lodash';

import type {
  TransactionHistory,
  TransactionHistoryEntry,
  TransactionMeta,
} from '../types';

/**
 * The maximum allowed length of the `transaction.history` property.
 */
export const MAX_HISTORY_LENGTH = 100;

/**
 * A list of trarnsaction history paths that may be used for display. These entries will not be
 * compressed.
 */
export const DISPLAYED_TRANSACTION_HISTORY_PATHS = [
  '/status',
  '/txParams/gasPrice',
  '/txParams/gas',
  '/estimatedBaseFee',
  '/blockTimestamp',
];

/**
 * Build a new version of the provided transaction with an initial history
 * entry, which is just a snapshot of the transaction.
 *
 * @param transactionMeta - TransactionMeta to add initial history snapshot to.
 * @returns A copy of `transactionMeta` with a new `history` property.
 */
export function addInitialHistorySnapshot(
  transactionMeta: TransactionMeta,
): TransactionMeta {
  const snapshot = snapshotFromTransactionMeta(transactionMeta);
  return merge({}, transactionMeta, { history: [snapshot] });
}

/**
 * Builds a new version of the transaction with a new history entry if
 * it has a `history` property, or just returns the transaction.
 *
 * @param transactionMeta - TransactionMeta to add history entry to.
 * @param note - Note to add to history entry.
 * @returns A copy of `transactionMeta` with a new `history` entry if it has an
 * existing non-empty `history` array.
 */
export function updateTransactionHistory(
  transactionMeta: TransactionMeta,
  note: string,
): TransactionMeta {
  if (!transactionMeta.history) {
    return transactionMeta;
  }

  const currentState = snapshotFromTransactionMeta(transactionMeta);
  const previousState = replayHistory(transactionMeta.history);
  const newHistoryEntry = generateHistoryEntry(
    previousState,
    currentState,
    note,
  );

  if (newHistoryEntry.length === 0) {
    return transactionMeta;
  }

  // Casts required here because this list has two separate types of entries:
  // TransactionMeta and TransactionHistoryEntry. The only TransactionMeta is the first
  // entry, but TypeScript loses that type information when `slice` is called for some reason.
  let updatedHistory = [
    ...transactionMeta.history,
    newHistoryEntry,
  ] as TransactionHistory;

  if (updatedHistory.length > MAX_HISTORY_LENGTH) {
    updatedHistory = compressTransactionHistory(updatedHistory);
  }

  return merge({}, transactionMeta, {
    history: updatedHistory,
  });
}

/**
 * Compress the transaction history, if it is possible to do so without compressing entries used
 * for display. History entries are merged together to make room for a single new entry.
 *
 * @param transactionHistory - The transaction history to compress.
 * @returns A compressed transaction history.
 */
function compressTransactionHistory(
  transactionHistory: TransactionHistory,
): TransactionHistory {
  const initialEntry = transactionHistory[0];
  // Casts required here because this list has two separate types of entries:
  // TransactionMeta and TransactionHistoryEntry. The only TransactionMeta is the first
  // entry, but TypeScript loses that type information when `slice` is called for some reason.
  const historyEntries = transactionHistory.slice(
    1,
  ) as TransactionHistoryEntry[];

  const firstNonDisplayedEntryIndex = historyEntries.findIndex(
    (historyEntry) => {
      return !historyEntry.some(({ path }) =>
        DISPLAYED_TRANSACTION_HISTORY_PATHS.includes(path),
      );
    },
  );

  // If no non-displayed entry is found, let history exceed max size.
  // TODO: Move data used for display to another property, so that we can more reliably limit
  // history size or remove it altogether.
  if (firstNonDisplayedEntryIndex === -1) {
    return transactionHistory;
  }

  // If a non-displayed entry is found that we can remove, merge it with another entry.
  // The entry we're merging with might be a "displayed" entry, but that's OK, merging more changes
  // in does not break our display logic.
  const mergeTargetEntryIndex =
    // Merge with previous entry if there is no next entry.
    // We default to merging with next because the next entry might also be non-displayed, so it
    // might be removed in a future trim, saving more space.
    firstNonDisplayedEntryIndex === historyEntries.length - 1
      ? firstNonDisplayedEntryIndex - 1
      : firstNonDisplayedEntryIndex + 1;
  const firstIndexToMerge = Math.min(
    firstNonDisplayedEntryIndex,
    mergeTargetEntryIndex,
  );
  const firstEntryToMerge = historyEntries[firstIndexToMerge];
  const secondEntryToMerge = historyEntries[firstIndexToMerge + 1];

  const beforeMergeState = replayHistory([
    initialEntry,
    ...historyEntries.slice(0, firstIndexToMerge),
  ]);
  const afterMergeState = replayHistory([
    beforeMergeState,
    firstEntryToMerge,
    secondEntryToMerge,
  ]);
  const mergedHistoryEntry = generateHistoryEntry(
    beforeMergeState,
    afterMergeState,
    `${String(firstEntryToMerge[0].note)}, ${String(
      secondEntryToMerge[0].note,
    )}`,
  );

  historyEntries.splice(firstIndexToMerge, 2, mergedHistoryEntry);
  return [initialEntry, ...historyEntries];
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
