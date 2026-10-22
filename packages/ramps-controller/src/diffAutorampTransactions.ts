import type { AutorampTransactionSummary } from './autoramp-types.js';

/**
 * Last-seen autoramp transaction statuses for one autoramp.
 * `syncedAt` is the epoch ms of the first successful fetch.
 */
export type AutorampTransactionRecord = {
  /** Epoch ms of the first successful sync. Null until that fetch lands. */
  syncedAt: number | null;
  /** Last seen status string per transaction id. */
  statuses: { [transactionId: string]: string };
};

/**
 * Persisted autoramp transaction records, keyed by autoramp id.
 */
export type AutorampTransactionRecords = {
  [autorampId: string]: AutorampTransactionRecord;
};

/**
 * One transaction that is new or whose status changed since the stored record.
 */
export type AutorampTransactionChange = {
  transaction: AutorampTransactionSummary;
  /** Previous status. Absent when the transaction id is new. */
  previousStatus?: string;
};

/**
 * Compares a fetched autoramp transaction page with the last stored record.
 *
 * A missing record, or one whose `syncedAt` is null, is the first sync: the
 * record is seeded and no changes are returned. Later fetches report an id
 * that was not stored, or a status string that differs. Transactions absent
 * from `fetched` stay in the record. No intermediate statuses are synthesized.
 *
 * @param record - Stored record for this autoramp, if any.
 * @param fetched - Newest page from the autoramp transactions API.
 * @param now - Epoch ms used as `syncedAt` on the first successful sync.
 * @returns The changes to publish and the record to persist.
 */
export function diffAutorampTransactions(
  record: AutorampTransactionRecord | undefined,
  fetched: AutorampTransactionSummary[],
  now: number,
): {
  changes: AutorampTransactionChange[];
  nextRecord: AutorampTransactionRecord;
} {
  if (record?.syncedAt === null || record === undefined) {
    const statuses: { [transactionId: string]: string } = {};
    for (const transaction of fetched) {
      statuses[transaction.id] = transaction.status;
    }
    return {
      changes: [],
      nextRecord: {
        syncedAt: now,
        statuses,
      },
    };
  }

  const statuses: { [transactionId: string]: string } = {
    ...record.statuses,
  };
  const changes: AutorampTransactionChange[] = [];
  for (const transaction of fetched) {
    if (!Object.hasOwn(statuses, transaction.id)) {
      changes.push({ transaction });
    } else if (statuses[transaction.id] !== transaction.status) {
      changes.push({
        transaction,
        previousStatus: statuses[transaction.id],
      });
    }
    statuses[transaction.id] = transaction.status;
  }

  return {
    changes,
    nextRecord: {
      syncedAt: record.syncedAt,
      statuses,
    },
  };
}
