import { BridgeClientId, BridgeStatusControllerMessenger } from '../types';
import {
  QuoteStatusState,
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusUpdateBackendStatus,
  QuoteStatusUpdateWithRetryOutcomeType,
} from './constants';
import { QuoteStatusApiService } from './quote-status-api-service';
import { QuoteStatusUpdateManager } from './quotes-status-update-manager';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome';
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

describe('QuoteStatusUpdateManager', () => {
  let mockUpdate: jest.Mock;

  /**
   * Builds a manager with stubbed callbacks and the mocked API service.
   *
   * @param overrides - Partial constructor options to override the defaults.
   * @returns The manager and its stubbed callbacks.
   */
  function createManager(
    overrides: Partial<
      ConstructorParameters<typeof QuoteStatusUpdateManager>[0]
    > = {},
  ): {
    manager: QuoteStatusUpdateManager;
    onPersistUpdates: jest.Mock;
    onError: jest.Mock;
    isEnabled: jest.Mock;
  } {
    const onPersistUpdates = jest.fn();
    const onError = jest.fn();
    const isEnabled = jest.fn().mockReturnValue(true);

    const manager = new QuoteStatusUpdateManager({
      messenger: {
        call: jest.fn(),
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

    return { manager, onPersistUpdates, onError, isEnabled };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    mockUpdate = jest
      .fn()
      .mockResolvedValue(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusUpdateWithRetryOutcomeType.RetryableExhausted,
        ),
      );
    (QuoteStatusApiService as unknown as jest.Mock).mockImplementation(() => ({
      updateQuoteStatusWithRetry: mockUpdate,
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('constructor / processInitial', () => {
    it('processes each rehydrated entry', async () => {
      createManager({
        initialData: { 'quote-1:0xabc': createPersistEntry() },
      });
      await flush();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          quoteId: 'quote-1',
          srcTxHash: '0xabc',
          newStatus: QuoteStatusUpdateBackendStatus.Submitted,
        }),
        expect.anything(),
      );
    });

    it('does not start the retry timer when there are no entries', async () => {
      createManager();
      await flush();
      mockUpdate.mockClear();

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS * 2);

      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('removes a rehydrated entry already in a terminal state', async () => {
      const { onPersistUpdates } = createManager({
        initialData: {
          'quote-1:0xabc': createPersistEntry({
            status: QuoteStatusState.Completed,
          }),
        },
      });
      await flush();

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(onPersistUpdates).toHaveBeenCalledWith({});
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
          newStatus: QuoteStatusUpdateBackendStatus.Submitted,
        }),
        expect.anything(),
      );
    });

    it('removes the entry and stops the timer once the update is accepted', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          QuoteStatusUpdateWithRetryOutcomeType.Accepted,
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
          newStatus: QuoteStatusUpdateBackendStatus.FinalizedSuccess,
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
          newStatus: QuoteStatusUpdateBackendStatus.FinalizedFailed,
        }),
        expect.anything(),
      );
    });

    it('surfaces an error when the entry cannot transition to the finalized state', async () => {
      const { manager, onError } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      manager.reportFinalised('tx-1', true);
      await flush();
      onError.mockClear();

      manager.reportFinalised('tx-1', true);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain(
        'cannot transition from "FinalizedSuccess" to "FinalizedSuccess"',
      );
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

    it('stops the timer when all entries have expired', async () => {
      const { manager } = createManager({ entryTtlMs: 500 });
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      mockUpdate.mockClear();

      // First tick (at 1000ms) is past the 500ms TTL: the entry is evicted and
      // the timer stops.
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
            QuoteStatusUpdateWithRetryOutcomeType.Interrupted,
          ),
        )
        .mockResolvedValueOnce(
          new QuoteStatusUpdateWithRetryOutcome(
            QuoteStatusUpdateWithRetryOutcomeType.Accepted,
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
          QuoteStatusUpdateWithRetryOutcomeType.Accepted,
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
          QuoteStatusUpdateWithRetryOutcomeType.Accepted,
        ),
      );
      await flush();

      const reportedStatuses = mockUpdate.mock.calls.map(
        ([payload]) => payload.newStatus,
      );
      expect(reportedStatuses).toContain(
        QuoteStatusUpdateBackendStatus.FinalizedSuccess,
      );
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
          QuoteStatusUpdateWithRetryOutcomeType.NonRetryable,
          response,
        ),
      );
    }

    it('drops the entry when the backend is already finalized', async () => {
      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'invalid transition',
        type: QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction,
        currentStatus: QuoteStatusUpdateBackendStatus.FinalizedSuccess,
        newStatus: QuoteStatusUpdateBackendStatus.Submitted,
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
        currentStatus: QuoteStatusUpdateBackendStatus.FinalizedSuccess,
        newStatus: QuoteStatusUpdateBackendStatus.Submitted,
      } as QuoteStatusUpdateResponse);
      const { manager } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      const reportedStatuses = mockUpdate.mock.calls.map(
        ([payload]) => payload.newStatus,
      );
      expect(reportedStatuses).toContain(
        QuoteStatusUpdateBackendStatus.FinalizedSuccess,
      );
    });

    it('surfaces an error and evicts when local state cannot match the backend', async () => {
      const { manager, onError } = createManager();
      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();
      manager.reportFinalised('tx-1', false);
      await flush();

      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'mismatch',
        type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
        currentStatus: QuoteStatusUpdateBackendStatus.FinalizedSuccess,
        newStatus: QuoteStatusUpdateBackendStatus.FinalizedFailed,
      } as QuoteStatusUpdateResponse);
      onError.mockClear();

      await jest.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
      await flush();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain(
        'cannot transition from "FinalizedFailed" to "FinalizedSuccess"',
      );
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
        'evicting due to non-retryable error',
      );
      expect(onError.mock.calls[0][0].details).toStrictEqual({
        quoteId: 'quote-1',
        errorType: QuoteStatusUpdateBackendErrorType.QuoteNotFound,
      });
    });

    it('evicts when a mismatch reports a non-finalized current status', async () => {
      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'mismatch',
        type: QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch,
        currentStatus: QuoteStatusUpdateBackendStatus.Submitted,
        newStatus: QuoteStatusUpdateBackendStatus.Submitted,
      } as QuoteStatusUpdateResponse);
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toContain(
        'evicting due to non-retryable error',
      );
    });

    it('drops the entry when an invalid transition reports a failed backend status', async () => {
      resolveNonRetryableOnce({
        statusCode: 400,
        message: 'invalid transition',
        type: QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction,
        currentStatus: QuoteStatusUpdateBackendStatus.FinalizedFailed,
        newStatus: QuoteStatusUpdateBackendStatus.Submitted,
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
    it('surfaces an error when the entry cannot be retrieved after being stored', () => {
      const { manager, onError } = createManager({ entryTtlMs: -1 });

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe(
        'reporting submitted status but entry was not found',
      );
    });

    it('ignores an unrecognized retry outcome type', async () => {
      mockUpdate.mockResolvedValueOnce(
        new QuoteStatusUpdateWithRetryOutcome(
          'unknown' as QuoteStatusUpdateWithRetryOutcomeType,
        ),
      );
      const { manager, onError } = createManager();

      manager.reportSubmitted('quote-1', '0xabc', 'tx-1');
      await flush();

      expect(onError).not.toHaveBeenCalled();
    });
  });
});
