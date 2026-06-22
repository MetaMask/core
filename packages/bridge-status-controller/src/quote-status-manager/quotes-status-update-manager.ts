import { BridgeClientId, BridgeStatusControllerMessenger } from '../types';
import {
  QuoteStatusState,
  QuoteStatusStateToBackendStatus,
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusUpdateBackendStatus,
  QuoteStatusUpdateWithRetryOutcomeType,
} from './constants';
import { QuoteStatusUpdateError } from './errors';
import { QuoteStatusApiService } from './quote-status-api-service';
import { QuoteStatusEntryStore } from './quote-status-entry-store';
import { QuoteStatusStateFsm } from './quote-status-state-fsm';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome';
import { QuoteStatusPersistEntry, QuoteStatusRuntimeEntry } from './types';

/**
 * Tracks bridge/swap quotes through their lifecycle and keeps the backend in
 * sync with the latest known status of each quote.
 *
 * Quotes are reported via {@link reportSubmitted} and {@link reportFinalised},
 * stored as runtime entries, and pushed to the backend. Updates that fail in a
 * retryable way are retried on a periodic timer until each entry reaches a
 * terminal state, at which point it is evicted and the timer stops once the
 * store is empty.
 */
export class QuoteStatusUpdateManager {
  readonly #quoteStatusApiService: QuoteStatusApiService;

  readonly #quoteStatusEntryStore: QuoteStatusEntryStore;

  readonly #isEnabled: (() => boolean) | undefined;

  readonly #onError: ((error: QuoteStatusUpdateError) => void) | undefined;

  readonly #updateIntervalMs: number;

  /**
   * Handle for the periodic retry timer. While running, every
   * {@link QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS} all entries that have not yet
   * reached a terminal state (Completed/Expired) are re-processed. It is started
   * lazily when there is work to do and stopped once the store is empty.
   */
  #retryIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates a new manager and immediately processes any persisted entries.
   *
   * @param options - Constructor options.
   * @param options.messenger - Messenger used to communicate with the backend
   * API service.
   * @param options.clientId - Identifier of the client making the requests.
   * @param options.clientProduct - Name of the client product making the
   * requests.
   * @param options.clientVersion - Optional version of the client product.
   * @param options.apiBaseUrl - Base URL of the quote status backend API.
   * @param options.onPersistUpdates - Callback invoked to persist entry updates.
   * @param options.onError - Optional callback invoked when a non-recoverable
   * error occurs.
   * @param options.isEnabled - Optional predicate gating whether the manager
   * performs any work.
   * @param options.entryTtlMs - Time-to-live, in milliseconds, after which a
   * tracked entry is evicted.
   * @param options.updateIntervalMs - How often the manager re-processes entries that
   * have not yet reached a terminal state
   * @param options.initialData - Persisted entries to rehydrate on startup.
   */
  constructor({
    messenger,
    clientId,
    clientProduct,
    clientVersion,
    apiBaseUrl,
    onError,
    isEnabled,
    onPersistUpdates,
    entryTtlMs,
    updateIntervalMs,
    initialData,
  }: {
    messenger: BridgeStatusControllerMessenger;
    clientId: BridgeClientId;
    clientProduct: string;
    clientVersion?: string;
    apiBaseUrl: string;
    onPersistUpdates: (
      updates: Record<string, QuoteStatusPersistEntry>,
    ) => void;
    onError?: (error: QuoteStatusUpdateError) => void;
    isEnabled?: () => boolean;
    entryTtlMs: number;
    updateIntervalMs: number;
    initialData: Record<string, QuoteStatusPersistEntry>;
  }) {
    this.#isEnabled = isEnabled;
    this.#onError = onError;
    this.#updateIntervalMs = updateIntervalMs;

    this.#quoteStatusApiService = new QuoteStatusApiService({
      messenger,
      clientId,
      clientProduct,
      clientVersion,
      apiBaseUrl,
      onError,
    });

    this.#quoteStatusEntryStore = new QuoteStatusEntryStore({
      onPersistUpdates,
      entryTtlMs,
      initial: initialData,
    });

    this.#processInitial();
  }

  /**
   * Reports that a previously submitted quote has finalized on-chain.
   *
   * Looks up the tracked entry by its transaction metadata id, transitions it to
   * the appropriate terminal state, and processes the update. No-ops when the
   * manager is disabled, and surfaces an error when the entry is missing or
   * cannot transition to the finalized state.
   *
   * @param txMetaId - Transaction metadata id of the finalized quote.
   * @param success - Whether the transaction finalized successfully.
   */
  reportFinalised(txMetaId: string, success: boolean): void {
    if (!this.#isEnabled?.()) {
      return;
    }

    const entry = this.#quoteStatusEntryStore.getByTxMetaId(txMetaId);

    if (!entry) {
      this.#onError?.(
        new QuoteStatusUpdateError(
          'reporting finalization status but entry was not found',
          { quoteId: '' },
        ),
      );
      return;
    }

    const nextState = success
      ? QuoteStatusState.FinalizedSuccess
      : QuoteStatusState.FinalizedFailed;

    if (!entry.status.canTransitionTo(nextState)) {
      this.#onError?.(
        new QuoteStatusUpdateError(
          `reporting finalization status but entry cannot transition from "${entry.status.state}" to "${nextState}"`,
          { quoteId: entry.quoteId },
        ),
      );
      return;
    }

    entry.status.transitionTo(nextState);
    this.#ensureRetryTimerRunning();
    this.#processEntry(entry);
  }

  /**
   * Reports that a quote has been submitted on-chain and begins tracking it.
   *
   * Creates a new entry in the `Submitted` state, starts the retry timer, and
   * processes the initial status update. No-ops when the manager is disabled,
   * and surfaces an error if the entry cannot be retrieved after being stored.
   *
   * @param quoteId - Identifier of the submitted quote.
   * @param srcTxHash - Hash of the source-chain transaction for the quote.
   * @param txMetaId - Optional transaction metadata id used to correlate
   * finalization reports.
   */
  reportSubmitted(quoteId: string, srcTxHash: string, txMetaId?: string): void {
    if (!this.#isEnabled?.()) {
      return;
    }

    const entryKey = QuoteStatusEntryStore.hash({
      quoteId,
      srcTxHash,
    });

    this.#quoteStatusEntryStore.put(entryKey, {
      quoteId,
      srcTxHash,
      txMetaId,
      status: new QuoteStatusStateFsm(QuoteStatusState.Submitted),
    });

    const entry = this.#quoteStatusEntryStore.get(entryKey);

    if (!entry) {
      this.#onError?.(
        new QuoteStatusUpdateError(
          'reporting submitted status but entry was not found',
          { quoteId },
        ),
      );
      return;
    }

    this.#ensureRetryTimerRunning();
    this.#processEntry(entry);
  }

  /**
   * Tears down the manager by stopping the retry timer and clearing all tracked
   * entries.
   */
  destroy(): void {
    this.#stopRetryTimer();
    this.#quoteStatusEntryStore.clear();
  }

  /**
   * Processes every entry rehydrated from persisted data on startup and starts
   * the retry timer if any entries still require further updates.
   */
  #processInitial(): void {
    for (const entry of this.#quoteStatusEntryStore.values()) {
      this.#processEntry(entry);
    }

    // Entries that did not resolve synchronously (still Submitted, awaiting
    // finalization, or pending a successful update) must keep being retried
    // until they reach a terminal state (Completed/Expired), at which point they
    // are removed from the store and the timer stops on its own.
    if (this.#quoteStatusEntryStore.size > 0) {
      this.#ensureRetryTimerRunning();
    }
  }

  /**
   * Starts the periodic retry timer if it is not already running.
   *
   * The timer re-processes every non-terminal entry on each tick. It is
   * idempotent so callers can invoke it freely whenever new work is enqueued.
   */
  #ensureRetryTimerRunning(): void {
    if (this.#retryIntervalId !== null) {
      return;
    }

    this.#retryIntervalId = setInterval(
      () => this.#processRetries(),
      this.#updateIntervalMs,
    );
  }

  /**
   * Stops the periodic retry timer if it is running.
   */
  #stopRetryTimer(): void {
    if (this.#retryIntervalId !== null) {
      clearInterval(this.#retryIntervalId);
      this.#retryIntervalId = null;
    }
  }

  /**
   * Retry tick: re-processes every entry that has not yet reached a terminal
   * state. Reading `values()` first evicts TTL-expired entries, so expired
   * entries are dropped and never retried. When no entries remain there is
   * nothing left to report, so the timer stops until new work is enqueued.
   */
  #processRetries(): void {
    if (!this.#isEnabled?.()) {
      return;
    }

    // Snapshot first: `#processEntry` can mutate the store (e.g. removing an
    // accepted/terminal entry), so iterating a live iterator would be unsafe.
    const entries = [...this.#quoteStatusEntryStore.values()];

    if (entries.length === 0) {
      this.#stopRetryTimer();
      return;
    }

    for (const entry of entries) {
      this.#processEntry(entry);
    }
  }

  /**
   * Pushes a single entry's current status to the backend and reconciles the
   * local state with the request outcome.
   *
   * Terminal entries are removed, accepted updates are evicted (or reprocessed
   * if the status advanced mid-flight), retryable failures are left for the next
   * retry tick, and non-retryable failures are delegated to
   * {@link #handleNonRetryableUpdateStatusError}.
   *
   * @param entry - The runtime entry to process.
   */
  #processEntry(entry: QuoteStatusRuntimeEntry): void {
    const sentStatus = entry.status.state;
    const sentStatusBackend = QuoteStatusStateToBackendStatus[sentStatus];

    if (sentStatusBackend === null) {
      this.#removeEntry(entry);
      return;
    }

    this.#quoteStatusApiService
      .updateQuoteStatusWithRetry(
        {
          quoteId: entry.quoteId,
          srcTxHash: entry.srcTxHash,
          newStatus: sentStatusBackend,
        },
        {
          maxRetries: 5,
          delayMsBetweenRetries: 3000,
        },
      )
      .then((outcome) => {
        switch (outcome.type) {
          case QuoteStatusUpdateWithRetryOutcomeType.Accepted: {
            const current = this.#quoteStatusEntryStore.get(
              QuoteStatusEntryStore.hash(entry),
            );
            // The entry may have been evicted (e.g. via TTL) while the request
            // was in flight. If it is no longer tracked there is nothing left
            // to do, and reprocessing it would loop forever.
            if (!current) {
              return undefined;
            }
            if (current.status.state === sentStatus) {
              this.#removeEntry(current);
            } else {
              // The status advanced mid-flight; report the newer status.
              this.#processEntry(current);
            }
            return undefined;
          }
          case QuoteStatusUpdateWithRetryOutcomeType.NonRetryable:
            this.#handleNonRetryableUpdateStatusError(entry, outcome);
            return undefined;
          case QuoteStatusUpdateWithRetryOutcomeType.Interrupted:
            this.#processEntry(entry);
            return undefined;
          case QuoteStatusUpdateWithRetryOutcomeType.RetryableExhausted:
            entry.lastAttemptAt = Date.now();
            this.#quoteStatusEntryStore.update(entry);
            return undefined;
          default:
            return undefined;
        }
      })
      .catch(() => {
        entry.lastAttemptAt = Date.now();
        this.#quoteStatusEntryStore.update(entry);
      });
  }

  /**
   * Removes an entry from the store and stops the retry timer once no entries
   * remain to be processed.
   *
   * @param entry - The runtime entry to remove.
   */
  #removeEntry(entry: QuoteStatusRuntimeEntry): void {
    this.#quoteStatusEntryStore.delete(QuoteStatusEntryStore.hash(entry));

    // Once every entry has reached a terminal state (Completed/Expired) there is
    // nothing left to retry, so stop the timer rather than ticking forever.
    if (this.#quoteStatusEntryStore.size === 0) {
      this.#stopRetryTimer();
    }
  }

  /**
   * Reconciles local state in response to a non-retryable backend error.
   *
   * When the backend reports a terminal status, the entry is either advanced to
   * match and reprocessed, or evicted (surfacing an error) if it cannot
   * transition. Any error that cannot be reconciled results in the entry being
   * evicted so it does not loop forever.
   *
   * @param entry - The runtime entry whose update failed.
   * @param outcome - The non-retryable outcome returned by the API service,
   * including the backend response used for reconciliation.
   */
  #handleNonRetryableUpdateStatusError(
    entry: QuoteStatusRuntimeEntry,
    outcome: QuoteStatusUpdateWithRetryOutcome,
  ): void {
    const { response } = outcome;

    // The transition we requested is invalid because the backend is already in a
    // terminal state. There is nothing left to report, so drop the entry.
    if (
      response?.type ===
        QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction &&
      (response.currentStatus ===
        QuoteStatusUpdateBackendStatus.FinalizedSuccess ||
        response.currentStatus ===
          QuoteStatusUpdateBackendStatus.FinalizedFailed)
    ) {
      this.#removeEntry(entry);
      return;
    }

    // For mismatch errors the backend reports the status it currently has, which
    // lets us reconcile our local state. The discriminant check also narrows
    // `response` to the variant carrying `currentStatus`.
    if (
      response?.type ===
        QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction ||
      response?.type ===
        QuoteStatusUpdateBackendErrorType.QuoteStatusOnChainMismatch
    ) {
      const backendFinalizedToState: Partial<
        Record<QuoteStatusUpdateBackendStatus, QuoteStatusState>
      > = {
        [QuoteStatusUpdateBackendStatus.FinalizedSuccess]:
          QuoteStatusState.FinalizedSuccess,
        [QuoteStatusUpdateBackendStatus.FinalizedFailed]:
          QuoteStatusState.FinalizedFailed,
      };
      const nextState = backendFinalizedToState[response.currentStatus];

      if (nextState) {
        // Align our local state with the backend's observed terminal status and
        // reprocess so the correct finalization status is reported.
        if (entry.status.canTransitionTo(nextState)) {
          entry.status.transitionTo(nextState);
          this.#processEntry(entry);
          return;
        }

        // We cannot move our local state forward to match the backend (e.g. the
        // entry is already in a conflicting terminal state). Surface the conflict
        // and evict so we do not loop forever on an unresolvable mismatch.
        this.#onError?.(
          new QuoteStatusUpdateError(
            `reporting finalization status but entry cannot transition from "${entry.status.state}" to "${nextState}"`,
            { quoteId: entry.quoteId },
          ),
        );
        this.#removeEntry(entry);
        return;
      }
    }

    // Any non-retryable error we could not reconcile means we cannot make
    // progress on this entry, so evict it rather than leaving it stuck.
    this.#removeEntry(entry);
    this.#onError?.(
      new QuoteStatusUpdateError(`evicting due to non-retryable error`, {
        quoteId: entry.quoteId,
        errorType: response?.type,
      }),
    );
  }
}
