import { describe, expect, it } from 'vitest';

import type { AutorampTransactionSummary } from './autoramp-types.js';
import type { AutorampTransactionRecord } from './diffAutorampTransactions.js';
import { diffAutorampTransactions } from './diffAutorampTransactions.js';

const NOW = 1_700_000_000_000;

const transaction = (
  id: string,
  status: string,
): AutorampTransactionSummary => ({
  id,
  autorampId: 'ar-1',
  status,
  sourceAmount: '100.00',
  destinationAmount: '18.00',
  createdAt: '2026-06-01T00:00:00Z',
});

const synced = (
  statuses: { [transactionId: string]: string },
  syncedAt = NOW - 1_000,
): AutorampTransactionRecord => ({
  syncedAt,
  statuses,
});

describe('diffAutorampTransactions', () => {
  it('seeds a non-empty first sync and reports no changes', () => {
    expect(
      diffAutorampTransactions(
        undefined,
        [transaction('tx-1', 'FundsReviewInProgress')],
        NOW,
      ),
    ).toStrictEqual({
      changes: [],
      nextRecord: {
        syncedAt: NOW,
        statuses: { 'tx-1': 'FundsReviewInProgress' },
      },
    });
  });

  it('sets syncedAt on an empty first sync and reports no changes', () => {
    expect(diffAutorampTransactions(undefined, [], NOW)).toStrictEqual({
      changes: [],
      nextRecord: {
        syncedAt: NOW,
        statuses: {},
      },
    });
  });

  it('treats a null syncedAt as the first sync', () => {
    expect(
      diffAutorampTransactions(
        { syncedAt: null, statuses: { 'tx-old': 'Completed' } },
        [transaction('tx-1', 'Completed')],
        NOW,
      ),
    ).toStrictEqual({
      changes: [],
      nextRecord: {
        syncedAt: NOW,
        statuses: { 'tx-1': 'Completed' },
      },
    });
  });

  it('reports a new transaction after the first sync', () => {
    const fetched = transaction('tx-2', 'FundsReviewInProgress');

    expect(
      diffAutorampTransactions(
        synced({ 'tx-1': 'Completed' }),
        [transaction('tx-1', 'Completed'), fetched],
        NOW,
      ),
    ).toStrictEqual({
      changes: [{ transaction: fetched }],
      nextRecord: synced({
        'tx-1': 'Completed',
        'tx-2': 'FundsReviewInProgress',
      }),
    });
  });

  it('reports a status change', () => {
    const fetched = transaction('tx-1', 'Completed');

    expect(
      diffAutorampTransactions(
        synced({ 'tx-1': 'PayoutInProgress' }),
        [fetched],
        NOW,
      ),
    ).toStrictEqual({
      changes: [{ transaction: fetched, previousStatus: 'PayoutInProgress' }],
      nextRecord: synced({ 'tx-1': 'Completed' }),
    });
  });

  it('reports nothing when the status is unchanged', () => {
    expect(
      diffAutorampTransactions(
        synced({ 'tx-1': 'Completed' }),
        [transaction('tx-1', 'Completed')],
        NOW,
      ),
    ).toStrictEqual({
      changes: [],
      nextRecord: synced({ 'tx-1': 'Completed' }),
    });
  });

  it('reports one change when a status was skipped between fetches', () => {
    const fetched = transaction('tx-1', 'Completed');

    expect(
      diffAutorampTransactions(
        synced({ 'tx-1': 'FundsReviewInProgress' }),
        [fetched],
        NOW,
      ),
    ).toStrictEqual({
      changes: [
        { transaction: fetched, previousStatus: 'FundsReviewInProgress' },
      ],
      nextRecord: synced({ 'tx-1': 'Completed' }),
    });
  });

  it('leaves a transaction that is absent from the fetch untouched', () => {
    expect(
      diffAutorampTransactions(
        synced({ 'tx-1': 'PayoutInProgress', 'tx-2': 'Completed' }),
        [transaction('tx-2', 'Completed')],
        NOW,
      ),
    ).toStrictEqual({
      changes: [],
      nextRecord: synced({
        'tx-1': 'PayoutInProgress',
        'tx-2': 'Completed',
      }),
    });
  });

  it('reports a status that moves backwards like any other change', () => {
    const fetched = transaction('tx-1', 'ConversionInProgress');

    expect(
      diffAutorampTransactions(synced({ 'tx-1': 'Completed' }), [fetched], NOW),
    ).toStrictEqual({
      changes: [{ transaction: fetched, previousStatus: 'Completed' }],
      nextRecord: synced({ 'tx-1': 'ConversionInProgress' }),
    });
  });
});
