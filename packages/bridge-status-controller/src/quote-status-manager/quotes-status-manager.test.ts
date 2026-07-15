import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { BridgeClientId, BridgeStatusControllerMessenger } from '../types';
import {
  QuoteStatusState,
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusBackendStatus,
  QuoteStatusFetchWithRetryOutcomeType,
} from './constants';
import { QuoteStatusApiService } from './quote-status-api-service';
import { QuoteStatusGetWithRetryOutcome } from './quote-status-get-with-retry-outcome';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome';
import { QuoteStatusManager } from './quotes-status-manager';
import type {
  QuoteStatusPersistEntry,
  QuoteStatusUpdateResponse,
} from './types';

jest.mock('./quote-status-api-service');

const TTL_MS = 60_000;
const UPDATE_INTERVAL_MS = 1000;

/**
 * Creates a manually-resolvable promise.
 *
 * @returns The promise and its resolver.
 */
function deferred<Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
} {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((_resolve) => {
    resolve = _resolve;
  });
  return { promise, resolve };
}

/**
 * Flushes pending microtasks (and zero-delay timers) under fake timers.
 *
 * @returns A promise that resolves once queued callbacks have run.
 */
async function flush(): Promise<void> {
  await jest.advanceTimersByTimeAsync(0);
}

/**
 * Builds a persisted entry used to seed the manager via `initialData`.
 *
 * @param overrides - Fields to override on the default entry.
 * @returns A serializable persisted entry.
 */
function createPersistEntry(
  overrides: Partial<QuoteStatusPersistEntry> = {},
): QuoteStatusPersistEntry {
  const now = Date.now();
  return {
    quoteId: 'quote-1',
    srcTxHash: '0xabc',
    status: QuoteStatusState.Submitted,
    createdAt: now,
    lastAttemptAt: now,
    ...overrides,
  };
}

/**
 * Builds a minimal transaction meta used to seed the messenger's
 * `TransactionController:getState` response for `init` reconciliation tests.
 *
 * @param overrides - Fields to override on the default transaction meta.
 * @returns A transaction meta object.
 */
function createTxMeta(
  overrides: Partial<TransactionMeta> = {},
): TransactionMeta {
  return {
    id: 'tx-1',
    status: TransactionStatus.confirmed,
    type: TransactionType.bridge,
    ...overrides,
  } as TransactionMeta;
}

describe('QuoteStatusUpdateManager', () => {
  let mockUpdate: jest.Mock;

  let mockGetQuoteStatusWithRetry: jest.Mock;

  /**
   * Builds a manager with stubbed callbacks and the mocked API service.
   *
   * @param overrides - Partial constructor options to override the defaults.
   * @param transactions - Transactions returned by the mocked
   * `TransactionController:getState` action, used by `init` reconciliation.
   * @returns The manager and its stubbed callbacks.
   */
  function createManager(
    overrides: Partial<
      ConstructorParameters<typeof QuoteStatusManager>[0]
    > = {},
    transactions: TransactionMeta[] = [],
  ): {
    manager: QuoteStatusManager;
    onPersistUpdates: jest.Mock;
    onError: jest.Mock;
    isEnabled: jest.Mock;
    messengerCall: jest.Mock;
  } {
    const onPersistUpdates = jest.fn();
    const onError = jest.fn();
    const isEnabled = jest.fn().mockReturnValue(true);
    const messengerCall = jest.fn((action: string) => {
      if (action === 'TransactionController:getState') {
        return { transactions };
      }
      return undefined;
    });

    const manager = new QuoteStatusManager({
      messenger: {
        call: messengerCall,
      } as unknown as BridgeStatusControllerMessenger,
      clientId: BridgeClientId.EXTENSION,
      clientProduct: 'test-product',
      apiBaseUrl: 'https://bridge.api.test',
      onPersistUpdates,
      onError,
      isEnabled,
      entryTtlMs: TTL_MS,
      updateIntervalMs: UPDATE_INTERVAL_MS,
      initialData: {},
      ...overrides,
    });

    return { manager, onPersistUpdates, onError, isEnabled, messengerCall };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    mockUpdate = jest
      .fn()
      .mockResolvedValue(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
        ),
      );
    mockGetQuoteStatusWithRetry = jest
      .fn()
      .mockResolvedValue(
        new QuoteStatusGetWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
    (QuoteStatusApiService as unknown as jest.Mock).mockImplementation(() => ({
      updateQuoteStatusWithRetry: mockUpdate,
      getQuoteStatusWithRetry: mockGetQuoteStatusWithRetry,
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('init', () => {
    describe('processInitial', () => {
      it('does not process rehydrated entries before init is called', async () => {
        createManager({
          initialData: { 'quote-1:0xabc': createPersistEntry() },
        });
        await flush();

        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it('processes each rehydrated entry', async () => {
        const { manager } = createManager({
          initialData: { 'quote-1:0xabc': createPersistEntry() },
        });

        manager.init();
        await flush();

        expect(mockUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            quoteId: 'quote-1',
            srcTxHash: '0xabc',
            newStatus: QuoteStatusBackendStatus.Submitted,
          }),
          expect.anything(),
        );
      });

      it('does not start the retry timer when there are no entries', async () => {
        const { manager } = createManager();

        manager.init();
        await flush();
        mockUpdate.mockClear();

        await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS * 2);

        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it('keeps a rehydrated entry already in a terminal state and rejects new submissions', async () => {
        const { manager } = createManager({
          initialData: {
            'quote-1:0xabc': createPersistEntry({
              status: QuoteStatusState.Completed,
            }),
          },
        });

        manager.init();
        await flush();

        expect(mockUpdate).not.toHaveBeenCalled();

        // The retained terminal entry causes a later submission for the same
        // quote to be rejected instead of re-sending SUBMITTED.
        manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
        await flush();

        expect(mockUpdate).not.toHaveBeenCalled();
      });
    });

    describe('reconciliation of missed finalizations', () => {
      /**
       * Collects the `newStatus` values reported to the backend so far.
       *
       * @returns The list of reported backend statuses.
       */
      function getReportedStatuses(): QuoteStatusBackendStatus[] {
        return mockUpdate.mock.calls.map(([payload]) => payload.newStatus);
      }

      it('reports finalized success when the source transaction confirmed', async () => {
        const { manager, onError } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({ txMetaId: 'tx-1' }),
            },
          },
          [createTxMeta({ id: 'tx-1', status: TransactionStatus.confirmed })],
        );

        manager.init();
        await flush();

        expect(onError).not.toHaveBeenCalled();
        expect(getReportedStatuses()).toContain(
          QuoteStatusBackendStatus.FinalizedSuccess,
        );
      });

      it('reports finalized failure when the source transaction failed', async () => {
        const { manager } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({ txMetaId: 'tx-1' }),
            },
          },
          [createTxMeta({ id: 'tx-1', status: TransactionStatus.failed })],
        );

        manager.init();
        await flush();

        expect(getReportedStatuses()).toContain(
          QuoteStatusBackendStatus.FinalizedFailed,
        );
      });

      it('reports finalized failure when the source transaction was dropped', async () => {
        const { manager } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({ txMetaId: 'tx-1' }),
            },
          },
          [createTxMeta({ id: 'tx-1', status: TransactionStatus.dropped })],
        );

        manager.init();
        await flush();

        expect(getReportedStatuses()).toContain(
          QuoteStatusBackendStatus.FinalizedFailed,
        );
      });

      it('reconciles swaps tracked as batch transactions via nested swap transactions', async () => {
        const { manager } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({ txMetaId: 'tx-1' }),
            },
          },
          [
            createTxMeta({
              id: 'tx-1',
              status: TransactionStatus.confirmed,
              type: TransactionType.batch,
              nestedTransactions: [{ type: TransactionType.swap }],
            } as Partial<TransactionMeta>),
          ],
        );

        manager.init();
        await flush();

        expect(getReportedStatuses()).toContain(
          QuoteStatusBackendStatus.FinalizedSuccess,
        );
      });

      it('does not finalize entries that have no txMetaId', async () => {
        const { manager } = createManager(
          {
            initialData: { 'quote-1:0xabc': createPersistEntry() },
          },
          [createTxMeta({ id: 'tx-1', status: TransactionStatus.confirmed })],
        );

        manager.init();
        await flush();

        expect(getReportedStatuses()).not.toContain(
          QuoteStatusBackendStatus.FinalizedSuccess,
        );
      });

      it('does not finalize when the source transaction cannot be found', async () => {
        const { manager } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({ txMetaId: 'tx-1' }),
            },
          },
          [],
        );

        manager.init();
        await flush();

        expect(getReportedStatuses()).not.toContain(
          QuoteStatusBackendStatus.FinalizedSuccess,
        );
      });

      it('does not finalize when the source transaction is not a swap or bridge', async () => {
        const { manager } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({ txMetaId: 'tx-1' }),
            },
          },
          [
            createTxMeta({
              id: 'tx-1',
              status: TransactionStatus.confirmed,
              type: TransactionType.simpleSend,
            }),
          ],
        );

        manager.init();
        await flush();

        expect(getReportedStatuses()).not.toContain(
          QuoteStatusBackendStatus.FinalizedSuccess,
        );
      });

      it('ignores a rejected source transaction', async () => {
        const { manager, onError } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({ txMetaId: 'tx-1' }),
            },
          },
          [createTxMeta({ id: 'tx-1', status: TransactionStatus.rejected })],
        );

        manager.init();
        await flush();

        expect(onError).not.toHaveBeenCalled();
        const reported = getReportedStatuses();
        expect(reported).not.toContain(
          QuoteStatusBackendStatus.FinalizedSuccess,
        );
        expect(reported).not.toContain(
          QuoteStatusBackendStatus.FinalizedFailed,
        );
      });

      it('does not re-finalize entries that are already in a finalized state', async () => {
        const { manager, onError } = createManager(
          {
            initialData: {
              'quote-1:0xabc': createPersistEntry({
                status: QuoteStatusState.FinalizedSuccess,
                txMetaId: 'tx-1',
              }),
            },
          },
          [createTxMeta({ id: 'tx-1', status: TransactionStatus.failed })],
        );

        manager.init();
        await flush();

        expect(onError).not.toHaveBeenCalled();
        // processInitial re-sends the finalized status, but reconciliation must
        // not transition it again based on the on-chain status.
        expect(getReportedStatuses()).not.toContain(
          QuoteStatusBackendStatus.FinalizedFailed,
        );
      });
    });
  });

  describe('enabled', () => {
    it('returns true when the isEnabled predicate returns true', () => {
      const { manager } = createManager({
        isEnabled: jest.fn().mockReturnValue(true),
      });

      expect(manager.enabled).toBe(true);
    });

    it('returns false when the isEnabled predicate returns false', () => {
      const { manager } = createManager({
        isEnabled: jest.fn().mockReturnValue(false),
      });

      expect(manager.enabled).toBe(false);
    });

    it('returns false when no isEnabled predicate was provided', () => {
      const { manager } = createManager({ isEnabled: undefined });

      expect(manager.enabled).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('does nothing when the manager is disabled', async () => {
      const { manager } = createManager({
        isEnabled: jest.fn().mockReturnValue(false),
      });

      const result = await manager.getStatus('quote-1');

      expect(mockGetQuoteStatusWithRetry).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('delegates to the API service with the default retry options when enabled', async () => {
      const { manager } = createManager();

      await manager.getStatus('quote-1');

      expect(mockGetQuoteStatusWithRetry).toHaveBeenCalledWith(
        { quoteId: 'quote-1' },
        { maxRetries: 0, delayMsBetweenRetries: 1000 },
      );
    });

    it('passes custom options to the API service', async () => {
      const { manager } = createManager();

      await manager.getStatus('quote-1', {
        maxRetries: 3,
        delayMsBetweenRetries: 500,
      });

      expect(mockGetQuoteStatusWithRetry).toHaveBeenCalledWith(
        { quoteId: 'quote-1' },
        { maxRetries: 3, delayMsBetweenRetries: 500 },
      );
    });

    it('resolves with the outcome returned by the API service', async () => {
      const outcome = new QuoteStatusGetWithRetryOutcome(
        QuoteStatusFetchWithRetryOutcomeType.Accepted,
      );
      mockGetQuoteStatusWithRetry.mockResolvedValueOnce(outcome);
      const { manager } = createManager();

      const result = await manager.getStatus('quote-1');

      expect(result).toBe(outcome);
    });

    it('resolves with undefined when the API service rejects', async () => {
      mockGetQuoteStatusWithRetry.mockRejectedValueOnce(new Error('boom'));
      const { manager } = createManager();

      const result = await manager.getStatus('quote-1');

      expect(result).toBeUndefined();
    });
  });

  describe('reportSubmitted', () => {
    it('does nothing when the manager is disabled', async () => {
      const { manager, onPersistUpdates } = createManager({
        isEnabled: jest.fn().mockReturnValue(false),
      });

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(onPersistUpdates).not.toHaveBeenCalled();
    });

    it('tracks the quote and reports the submitted status', async () => {
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteId: 'quote-1',
          srcTxHash: '0xabc',
          newStatus: QuoteStatusBackendStatus.Submitted,
        }),
        expect.anything(),
      );
    });

    it('stops re-sending the submitted status once it is accepted', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      const { manager, onPersistUpdates } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      onPersistUpdates.mockClear();
      mockUpdate.mockClear();

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS * 2);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('does not re-send an already-acknowledged submitted status on a repeat report', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      // A repeat report for the same still-Submitted quote finds the acknowledged
      // entry and short-circuits instead of re-sending the accepted status.
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('keeps the entry tracked after submission is accepted so it can be finalized', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      // Finalization arrives long after the submission was acknowledged. The
      // entry must still be tracked so the finalized status is reported.
      manager.reportFinalised('tx-1', true);
      await flush();

      expect(onError).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          newStatus: QuoteStatusBackendStatus.FinalizedSuccess,
        }),
        expect.anything(),
      );
    });

    it('rejects a new submission for a quote that already finalized', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      const { manager } = createManager();

      // Drive the quote to the terminal Completed state.
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      manager.reportFinalised('tx-1', true);
      await flush();
      mockUpdate.mockClear();

      // A late/duplicate submission (even with a different source tx hash) is
      // dropped instead of re-sending SUBMITTED to an already-finalized quote.
      manager.reportSubmitted('quote-1', '0xnew', 'tx-2');
      await flush();

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('rejects a new submission for a quote whose entry expired', async () => {
      const { manager } = createManager({ entryTtlMs: 500 });

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      // Move past the TTL so the entry transitions to Expired (but is retained).
      jest.setSystemTime(new Date('2024-01-01T01:00:00Z'));
      mockUpdate.mockClear();

      manager.reportSubmitted('quote-1', '0xnew', 'tx-2');
      await flush();

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('reportFinalised', () => {
    it('does nothing when the manager is disabled', () => {
      const { manager, onError } = createManager({
        isEnabled: jest.fn().mockReturnValue(false),
      });

      manager.reportFinalised('tx-1', true);

      expect(onError).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('surfaces an error when the entry is not found', () => {
      const { manager, onError } = createManager();

      manager.reportFinalised('tx-missing', true);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe(
        'reporting finalization status but entry was not found',
      );
    });

    it('transitions to FinalizedSuccess and reports it', async () => {
      const { manager } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      manager.reportFinalised('tx-1', true);
      await flush();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          newStatus: QuoteStatusBackendStatus.FinalizedSuccess,
        }),
        expect.anything(),
      );
    });

    it('transitions to FinalizedFailed when the transaction failed', async () => {
      const { manager } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      manager.reportFinalised('tx-1', false);
      await flush();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          newStatus: QuoteStatusBackendStatus.FinalizedFailed,
        }),
        expect.anything(),
      );
    });

    it('ignores duplicate finalization when the entry cannot transition to the finalized state', async () => {
      const { manager, onError } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      manager.reportFinalised('tx-1', true);
      await flush();
      onError.mockClear();
      mockUpdate.mockClear();

      manager.reportFinalised('tx-1', true);
      await flush();

      expect(onError).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('completes and retains the entry once a finalized status is accepted', async () => {
      const { manager, onError } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      manager.reportFinalised('tx-1', true);
      await flush();

      // The entry is retained in the terminal Completed state, so a later
      // finalization for the same tx is ignored instead of surfacing an error.
      onError.mockClear();
      mockUpdate.mockClear();
      manager.reportFinalised('tx-1', true);
      await flush();

      expect(onError).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    describe('batch (7702/nested) finalization', () => {
      /**
       * Collects the `{ quoteId, newStatus }` pairs reported to the backend.
       *
       * @returns The reported quote id / status pairs.
       */
      function getReportedQuoteStatuses(): {
        quoteId: string;
        newStatus: QuoteStatusBackendStatus;
      }[] {
        return mockUpdate.mock.calls.map(([payload]) => ({
          quoteId: payload.quoteId,
          newStatus: payload.newStatus,
        }));
      }

      it('finalizes every quote sharing the batch txMetaId as success', async () => {
        const { manager, onError } = createManager();
        // A single 7702/nested batch submits multiple quotes under one txMetaId.
        manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
        manager.reportSubmitted('quote-2', '0xdef', 'tx-1');
        await flush();
        mockUpdate.mockClear();

        manager.reportFinalised('tx-1', true);
        await flush();

        expect(getReportedQuoteStatuses()).toStrictEqual(
          expect.arrayContaining([
            {
              quoteId: 'quote-1',
              newStatus: QuoteStatusBackendStatus.FinalizedSuccess,
            },
            {
              quoteId: 'quote-2',
              newStatus: QuoteStatusBackendStatus.FinalizedSuccess,
            },
          ]),
        );
        expect(onError).not.toHaveBeenCalled();
      });

      it('finalizes every quote sharing the batch txMetaId as failure', async () => {
        const { manager, onError } = createManager();
        manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
        manager.reportSubmitted('quote-2', '0xdef', 'tx-1');
        await flush();
        mockUpdate.mockClear();

        manager.reportFinalised('tx-1', false);
        await flush();

        expect(getReportedQuoteStatuses()).toStrictEqual(
          expect.arrayContaining([
            {
              quoteId: 'quote-1',
              newStatus: QuoteStatusBackendStatus.FinalizedFailed,
            },
            {
              quoteId: 'quote-2',
              newStatus: QuoteStatusBackendStatus.FinalizedFailed,
            },
          ]),
        );
        expect(onError).not.toHaveBeenCalled();
      });

      it('finalizes only the still-pending quotes and skips terminal siblings', async () => {
        const { manager, onError } = createManager({
          initialData: {
            'quote-1:0xabc': createPersistEntry({
              quoteId: 'quote-1',
              srcTxHash: '0xabc',
              txMetaId: 'tx-1',
            }),
            'quote-2:0xdef': createPersistEntry({
              quoteId: 'quote-2',
              srcTxHash: '0xdef',
              txMetaId: 'tx-1',
              status: QuoteStatusState.Completed,
            }),
          },
        });

        manager.init();
        await flush();
        mockUpdate.mockClear();

        manager.reportFinalised('tx-1', true);
        await flush();

        const reported = getReportedQuoteStatuses();
        expect(reported).toContainEqual({
          quoteId: 'quote-1',
          newStatus: QuoteStatusBackendStatus.FinalizedSuccess,
        });
        // The sibling already in a terminal state cannot transition again, so it
        // is skipped rather than re-reported or surfacing an error.
        expect(reported).not.toContainEqual({
          quoteId: 'quote-2',
          newStatus: QuoteStatusBackendStatus.FinalizedSuccess,
        });
        expect(onError).not.toHaveBeenCalled();
      });

      it('ignores a duplicate batch finalization once every quote is terminal', async () => {
        mockUpdate.mockResolvedValue(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          ),
        );
        const { manager, onError } = createManager();
        manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
        manager.reportSubmitted('quote-2', '0xdef', 'tx-1');
        await flush();
        manager.reportFinalised('tx-1', true);
        await flush();
        onError.mockClear();
        mockUpdate.mockClear();

        // Every entry is now Completed; a repeated batch finalization finds them
        // all in a terminal state and no-ops instead of re-reporting or erroring.
        manager.reportFinalised('tx-1', true);
        await flush();

        expect(onError).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
      });

      it('retains every batch entry as Completed once finalization is accepted', async () => {
        mockUpdate.mockResolvedValue(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          ),
        );
        const { manager, onPersistUpdates } = createManager();
        manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
        manager.reportSubmitted('quote-2', '0xdef', 'tx-1');
        await flush();

        manager.reportFinalised('tx-1', true);
        await flush();

        const lastSnapshot = onPersistUpdates.mock.calls.at(-1)?.[0];
        expect(lastSnapshot).toMatchObject({
          'quote-1:0xabc': expect.objectContaining({
            status: QuoteStatusState.Completed,
          }),
          'quote-2:0xdef': expect.objectContaining({
            status: QuoteStatusState.Completed,
          }),
        });
      });
    });
  });

  describe('destroy', () => {
    it('stops the retry timer', async () => {
      const { manager } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      manager.destroy();
      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS * 3);

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('retry timer', () => {
    it('re-processes non-terminal entries on each tick', async () => {
      const { manager } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);

      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('skips processing while the manager is disabled', async () => {
      const isEnabled = jest.fn().mockReturnValue(true);
      const { manager } = createManager({ isEnabled });
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();
      isEnabled.mockReturnValue(false);

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('stops the timer once all entries reach a terminal state via TTL', async () => {
      const { manager } = createManager({ entryTtlMs: 500 });
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      // First tick (at 1000ms) is past the 500ms TTL: the entry transitions to
      // the terminal Expired state (but is retained), so there is no pending work
      // left and the timer stops.
      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
      mockUpdate.mockClear();
      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS * 2);

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('processEntry outcomes', () => {
    it('re-processes the entry when the request is interrupted', async () => {
      mockUpdate
        .mockResolvedValueOnce(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Interrupted,
          ),
        )
        .mockResolvedValueOnce(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          ),
        );
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });

    it('persists the attempt timestamp when retries are exhausted', async () => {
      const { manager, onPersistUpdates } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(onPersistUpdates).toHaveBeenCalled();
    });

    it('persists the attempt timestamp when the request rejects', async () => {
      mockUpdate.mockRejectedValueOnce(new Error('boom'));
      const { manager, onPersistUpdates } = createManager();
      onPersistUpdates.mockClear();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(onPersistUpdates).toHaveBeenCalled();
    });

    it('does nothing when an accepted entry was evicted mid-flight', async () => {
      const accepted = deferred<QuoteStatusUpdateWithRetryOutcome>();
      mockUpdate.mockReturnValueOnce(accepted.promise);
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      manager.destroy();
      mockUpdate.mockClear();

      accepted.resolve(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      await flush();

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('reprocesses with the newer status when the status advanced mid-flight', async () => {
      const submittedAttempt = deferred<QuoteStatusUpdateWithRetryOutcome>();
      mockUpdate.mockReturnValueOnce(submittedAttempt.promise);
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      // The second attempt (for the finalized status) stays pending.
      mockUpdate.mockReturnValueOnce(
        deferred<QuoteStatusUpdateWithRetryOutcome>().promise,
      );
      manager.reportFinalised('tx-1', true);
      await flush();

      // Resolve the original Submitted attempt as accepted; the entry now holds
      // a newer (FinalizedSuccess) status, so it must be reprocessed.
      submittedAttempt.resolve(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      await flush();

      const reportedStatuses = mockUpdate.mock.calls.map(
        ([payload]) => payload.newStatus,
      );
      expect(reportedStatuses).toContain(
        QuoteStatusBackendStatus.FinalizedSuccess,
      );
    });

    it('passes a retry predicate that stops a stale in-flight retry', async () => {
      let submittedShouldProceed: (() => boolean) | undefined;
      mockUpdate.mockImplementationOnce(
        (_data: unknown, options: { retry?: () => boolean }) => {
          submittedShouldProceed = options.retry;
          return Promise.resolve(
            new QuoteStatusUpdateWithRetryOutcome(
              QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted,
            ),
          );
        },
      );
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      // While the entry is still Submitted and unacknowledged the retry proceeds.
      expect(submittedShouldProceed?.()).toBe(true);

      // Once finalization advances the entry, the SUBMITTED predicate reports
      // that the retry should stop (its status is no longer the one to report).
      manager.reportFinalised('tx-1', true);
      await flush();

      expect(submittedShouldProceed?.()).toBe(false);
    });

    it('retains the completed entry in the persisted snapshot', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      const { manager, onPersistUpdates } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      manager.reportFinalised('tx-1', true);
      await flush();

      const lastSnapshot = onPersistUpdates.mock.calls.at(-1)?.[0];
      expect(lastSnapshot).toMatchObject({
        'quote-1:0xabc': expect.objectContaining({
          status: QuoteStatusState.Completed,
        }),
      });
    });

    it('does not call getStatus after a FinalizedSuccess update is accepted', async () => {
      mockUpdate
        .mockResolvedValueOnce(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          ),
        )
        .mockResolvedValueOnce(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          ),
        );
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      manager.reportFinalised('tx-1', true);
      await flush();

      expect(mockGetQuoteStatusWithRetry).not.toHaveBeenCalled();
    });

    it('does not call getStatus after a FinalizedFailed update is accepted', async () => {
      mockUpdate
        .mockResolvedValueOnce(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          ),
        )
        .mockResolvedValueOnce(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusFetchWithRetryOutcomeType.Accepted,
          ),
        );
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      manager.reportFinalised('tx-1', false);
      await flush();

      expect(mockGetQuoteStatusWithRetry).not.toHaveBeenCalled();
    });

    it('does not call getStatus when a non-finalized update is accepted', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.Accepted,
        ),
      );
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(mockGetQuoteStatusWithRetry).not.toHaveBeenCalled();
    });
  });

  describe('handleNonRetryableUpdateStatusError', () => {
    /**
     * Resolves the next update attempt with a non-retryable outcome.
     *
     * @param response - The backend error response to attach.
     */
    function resolveNonRetryableOnce(
      response: QuoteStatusUpdateResponse,
    ): void {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
          response,
        ),
      );
    }

    it('drops the entry when the backend is already finalized', async () => {
      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'invalid transition',
        type: QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction,
        currentStatus: QuoteStatusBackendStatus.FinalizedSuccess,
        newStatus: QuoteStatusBackendStatus.Submitted,
      } as QuoteStatusUpdateResponse);
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS * 2);

      expect(onError).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('reconciles local state to the backend status on a mismatch', async () => {
      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'mismatch',
        type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
        currentStatus: QuoteStatusBackendStatus.FinalizedSuccess,
        newStatus: QuoteStatusBackendStatus.Submitted,
      } as QuoteStatusUpdateResponse);
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      const reportedStatuses = mockUpdate.mock.calls.map(
        ([payload]) => payload.newStatus,
      );
      expect(reportedStatuses).toContain(
        QuoteStatusBackendStatus.FinalizedSuccess,
      );
    });

    it('surfaces an error but completes (retains) when the local finalized status differs from the backend', async () => {
      const { manager, onError, onPersistUpdates } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      manager.reportFinalised('tx-1', false);
      await flush();

      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'mismatch',
        type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
        currentStatus: QuoteStatusBackendStatus.FinalizedSuccess,
        newStatus: QuoteStatusBackendStatus.FinalizedFailed,
      } as QuoteStatusUpdateResponse);
      onError.mockClear();

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
      await flush();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain(
        'cannot transition from "FinalizedFailed" to "FinalizedSuccess"',
      );
      // The backend is terminal, so the entry converges to Completed (kept)
      // rather than being abandoned to Expired.
      const lastSnapshot = onPersistUpdates.mock.calls.at(-1)?.[0];
      expect(lastSnapshot).toMatchObject({
        'quote-1:0xabc': expect.objectContaining({
          status: QuoteStatusState.Completed,
        }),
      });
    });

    it('keeps retrying finalized status when a racing mismatch reports the same finalized status', async () => {
      // Reproduces the EVM 7702 race: `SUBMITTED` and `FINALIZED_SUCCESS` are
      // reported back-to-back, so the in-flight `SUBMITTED` request can return a
      // mismatch carrying the already-finalized status while the entry is locally
      // FinalizedSuccess. The entry must stay FinalizedSuccess so retries for the
      // finalized update can continue.
      const submittedAttempt = deferred<QuoteStatusUpdateWithRetryOutcome>();
      mockUpdate.mockReturnValueOnce(submittedAttempt.promise);
      const { manager, onError, onPersistUpdates } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      // Finalization advances the entry to FinalizedSuccess while the SUBMITTED
      // request is still in flight. Keep its FINALIZED_SUCCESS attempt pending.
      mockUpdate.mockReturnValueOnce(
        deferred<QuoteStatusUpdateWithRetryOutcome>().promise,
      );
      manager.reportFinalised('tx-1', true);
      await flush();
      onError.mockClear();

      // The racing SUBMITTED request resolves with a mismatch reporting the
      // backend is already FinalizedSuccess.
      submittedAttempt.resolve(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusFetchWithRetryOutcomeType.NonRetryable,
          {
            statusCode: 400,
            message: 'mismatch',
            type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
            currentStatus: QuoteStatusBackendStatus.FinalizedSuccess,
            newStatus: QuoteStatusBackendStatus.Submitted,
          } as QuoteStatusUpdateResponse,
        ),
      );
      await flush();

      expect(onError).not.toHaveBeenCalled();
      const lastSnapshot = onPersistUpdates.mock.calls.at(-1)?.[0];
      expect(lastSnapshot).toMatchObject({
        'quote-1:0xabc': expect.objectContaining({
          status: QuoteStatusState.FinalizedSuccess,
        }),
      });
    });

    it('evicts and surfaces an error for an unreconcilable non-retryable error', async () => {
      resolveNonRetryableOnce({
        statusCode: 404,
        message: 'quote not found',
        type: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
      } as QuoteStatusUpdateResponse);
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain(
        'abandoning entry due to non-retryable error',
      );
      expect(onError.mock.calls[0][0].details).toStrictEqual({
        quoteId: 'quote-1',
        errorType: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
      });
    });

    it('abandons the entry when a mismatch reports a non-finalized current status', async () => {
      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'mismatch',
        type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
        currentStatus: QuoteStatusBackendStatus.Submitted,
        newStatus: QuoteStatusBackendStatus.Submitted,
      } as QuoteStatusUpdateResponse);
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain(
        'abandoning entry due to non-retryable error',
      );
    });

    it('drops the entry when an invalid transition reports a failed backend status', async () => {
      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'invalid transition',
        type: QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction,
        currentStatus: QuoteStatusBackendStatus.FinalizedFailed,
        newStatus: QuoteStatusBackendStatus.Submitted,
      } as QuoteStatusUpdateResponse);
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS * 2);

      expect(onError).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('ignores an unrecognized retry outcome type', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          'unknown' as QuoteStatusFetchWithRetryOutcomeType,
        ),
      );
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(onError).not.toHaveBeenCalled();
    });
  });
});
