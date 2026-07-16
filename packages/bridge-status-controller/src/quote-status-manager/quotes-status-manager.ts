import { TransactionStatus } from '@metamask/transaction-controller';

import { BridgeClientId, BridgeStatusControllerMessenger } from '../types.js';
import {
  getTransactionMetaById,
  hasNestedSwapTransactions,
  isCrossChainTx,
} from '../utils/transaction.js';
import {
  QuoteStatusState,
  QuoteStatusStateToBackendStatus,
  QuoteStatusUpdateBackendErrorType,
  QuoteStatusBackendStatus,
  QuoteStatusFetchWithRetryOutcomeType,
} from './constants.js';
import { QuoteStatusUpdateError } from './errors.js';
import { QuoteStatusApiService } from './quote-status-api-service.js';
import { QuoteStatusEntryStore } from './quote-status-entry-store.js';
import { QuoteStatusGetWithRetryOutcome } from './quote-status-get-with-retry-outcome.js';
import { QuoteStatusStateFsm } from './quote-status-state-fsm.js';
import { QuoteStatusUpdateWithRetryOutcome } from './quote-status-update-with-retry-outcome.js';
import { QuoteStatusPersistEntry, QuoteStatusRuntimeEntry } from './types.js';

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
export class QuoteStatusManager {
  readonly #messenger: BridgeStatusControllerMessenger;

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
    this.#messenger = messenger;

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
  }

  /**
   * Whether quote-status tracking and backend sync are currently active.
   *
   * Reflects the latest value returned by the optional `isEnabled` predicate
   * supplied at construction time. When no predicate was provided, this is
   * always `false` and all public methods that gate on enablement no-op.
   *
   * @returns `true` when the `isEnabled` predicate returns a truthy value.
   */
  get enabled(): boolean {
    return Boolean(this.#isEnabled?.());
  }

  /**
   * Reports that a previously submitted quote has finalized on-chain.
   *
   * Looks up the tracked entry by its transaction metadata id, transitions it to
   * the appropriate terminal state, and processes the update. No-ops when the
   * manager is disabled, and surfaces an error when the entry is missing or
   * cannot transition to the finalized state.
   *
   * A single 7702/nested batch transaction submits multiple quotes under one
   * `txMetaId`, so every entry sharing that id is finalized together.
   *
   * @param txMetaId - Transaction metadata id of the finalized quote(s).
   * @param success - Whether the transaction finalized successfully.
   */
  reportFinalised(txMetaId: string, success: boolean): void {
    if (!this.#isEnabled?.()) {
      return;
    }

    const entries = this.#quoteStatusEntryStore.getAllByTxMetaId(txMetaId);

    if (entries.length === 0) {
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

    let hasEntryToProcess = false;

    for (const entry of entries) {
      if (!entry.status.canTransitionTo(nextState)) {
        // This is expected, there are race conditions where
        // reportFinalized can be called twice. If the second
        // call fails due to the first completed sucesfully
        // backend will report that we cannot transition outside
        // a final state, which is correct and we can safely skip
        // this entry.
        continue;
      }

      entry.status.transitionTo(nextState);
      hasEntryToProcess = true;
    }

    if (!hasEntryToProcess) {
      return;
    }

    this.#ensureRetryTimerRunning();

    for (const entry of entries) {
      if (entry.status.state === nextState) {
        this.#processEntry(entry);
      }
    }
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

    // Once a quote has advanced past `Submitted` (finalized or terminal), it is
    // done: reporting `SUBMITTED` again would be rejected by the backend as an
    // invalid transition. Retained terminal entries let us recognize and drop
    // these late/duplicate submissions instead of looping on a 400.
    const isQuoteAlreadyTracked = this.#quoteStatusEntryStore
      .getByQuoteId(quoteId)
      .some((entry) => entry.status.state !== QuoteStatusState.Submitted);
    if (isQuoteAlreadyTracked) {
      return;
    }

    const entryKey = QuoteStatusEntryStore.hash({
      quoteId,
      srcTxHash,
    });

    const entry = this.#quoteStatusEntryStore.put(entryKey, {
      quoteId,
      srcTxHash,
      txMetaId,
      status: new QuoteStatusStateFsm(QuoteStatusState.Submitted),
    });

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
   * Reconciles quote-status entries whose finalization was missed while the
   * client was closed. Called once during initialization.
   *
   * Swap/bridge source transactions report their final status through the
   * `TransactionController:transactionStatusUpdated` subscription
   * ({@link #onTransactionConfirmed}/{@link #onTransactionFailed}). When a source
   * transaction reaches a terminal state while the client is not running, that
   * event is never re-emitted on the next startup, so the persisted entry would
   * remain `Submitted` until it expires via TTL. This replays the missed terminal
   * event for both swaps and bridges: a confirmed source transaction is reported
   * as a finalized success and a failed/dropped one as a finalized failure.
   *
   * `rejected` is ignored because the transaction was never broadcast.
   */
  init(): void {
    this.#processInitial();

    for (const entry of this.#quoteStatusEntryStore.values()) {
      // Only entries still awaiting finalization need catching up. Entries
      // already in a finalized state are re-sent by `processInitial()`.
      if (
        entry.status.state !== QuoteStatusState.Submitted ||
        !entry.txMetaId
      ) {
        continue;
      }

      const txMeta = getTransactionMetaById(this.#messenger, entry.txMetaId);
      if (!txMeta) {
        continue;
      }

      // Reconcile swaps and bridges alike: a terminal source transaction
      // finalizes the quote status. `hasNestedSwapTransactions` also covers
      // batch/7702 swaps whose type may still read as `batch` rather than `swap`.
      const isCrossChainTrade =
        (txMeta.type !== undefined && isCrossChainTx(txMeta.type)) ||
        hasNestedSwapTransactions(txMeta);
      if (!isCrossChainTrade) {
        continue;
      }

      if (txMeta.status === TransactionStatus.confirmed) {
        this.reportFinalised(entry.txMetaId, true);
      } else if (
        txMeta.status === TransactionStatus.failed ||
        txMeta.status === TransactionStatus.dropped
      ) {
        this.reportFinalised(entry.txMetaId, false);
      }
    }
  }

  /**
   * Fetches the current quote status from the backend with automatic retries.
   *
   * Unlike {@link reportSubmitted} and {@link reportFinalised}, this is a
   * read-only query and does not mutate tracked entries. Returns `null` when
   * the manager is disabled ({@link enabled} is `false`).
   *
   * @param quoteId - Identifier of the quote whose status should be fetched.
   * @param options - Retry configuration.
   * @param options.maxRetries - Maximum number of retries after the initial attempt.
   * @param options.delayMsBetweenRetries - Delay in milliseconds between attempts.
   * @returns The quote status outcome, or `undefined` when the manager is disabled.
   */
  async getStatus(
    quoteId: string,
    options: {
      maxRetries?: number;
      delayMsBetweenRetries?: number;
    } = {
      maxRetries: 0,
      delayMsBetweenRetries: 1000,
    },
  ): Promise<QuoteStatusGetWithRetryOutcome | undefined> {
    if (!this.#isEnabled?.()) {
      return undefined;
    }

    const response = this.#quoteStatusApiService
      .getQuoteStatusWithRetry(
        {
          quoteId,
        },
        {
          maxRetries: options.maxRetries ?? 0,
          delayMsBetweenRetries: options.delayMsBetweenRetries ?? 1000,
        },
      )
      // Errors already reported by #onError handlers of `getQuoteStatusWithRetry()`
      .catch(() => undefined);

    return response;
  }

  /**
   * Processes every entry rehydrated from persisted data on startup and starts
   * the retry timer if any entries still require further updates.
   */
  #processInitial(): void {
    for (const entry of this.#quoteStatusEntryStore.values()) {
      this.#processEntry(entry);
    }

    // Terminal entries (Completed/Expired) are retained, so the store is never
    // empty. Only start the retry timer when there is an entry whose status
    // still needs to be reported; otherwise it would tick forever doing nothing.
    if (this.#hasPendingUpdates()) {
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
   * Retry tick: re-processes every entry. Reading `values()` first transitions
   * TTL-expired entries to `Expired` (keeping them), and `#processEntry` no-ops
   * for terminal/acknowledged entries. When no entry has a status left to report
   * the timer stops until new work is enqueued.
   */
  #processRetries(): void {
    if (!this.#isEnabled?.()) {
      return;
    }

    // Snapshot first: `#processEntry` can mutate the store (e.g. transitioning an
    // accepted entry to a terminal state), so iterating a live iterator would be
    // unsafe.
    const entries = [...this.#quoteStatusEntryStore.values()];

    if (!this.#hasPendingUpdates()) {
      this.#stopRetryTimer();
      return;
    }

    for (const entry of entries) {
      this.#processEntry(entry);
    }
  }

  /**
   * Returns whether any tracked entry still has a status that needs to be
   * reported to the backend.
   *
   * Terminal entries (`Completed`/`Expired`) and entries whose current status
   * has already been acknowledged are excluded, so this is the signal used to
   * decide whether the retry timer has any work left to do.
   *
   * @returns `true` when at least one entry has an unreported status.
   */
  #hasPendingUpdates(): boolean {
    for (const entry of this.#quoteStatusEntryStore.values()) {
      const { state } = entry.status;
      const isTerminal =
        state === QuoteStatusState.Completed ||
        state === QuoteStatusState.Expired;
      if (!isTerminal && entry.acknowledgedState !== state) {
        return true;
      }
    }

    return false;
  }

  /**
   * Stops the retry timer when there are no entries left whose status needs
   * reporting. Since terminal entries are retained, the store is never empty, so
   * the timer's idle condition is "no pending updates" rather than "no entries".
   */
  #stopRetryTimerIfIdle(): void {
    if (!this.#hasPendingUpdates()) {
      this.#stopRetryTimer();
    }
  }

  /**
   * Pushes a single entry's current status to the backend and reconciles the
   * local state with the request outcome.
   *
   * Terminal entries are kept but no longer reported. Accepted finalized updates
   * advance the entry to `Completed` (kept so duplicate reports are rejected);
   * accepted non-final updates (e.g. `Submitted`) are kept tracked so a later
   * {@link reportFinalised} can find them, while being flagged so the retry loop
   * stops re-sending the acknowledged status. Updates whose status advanced
   * mid-flight are reprocessed, retryable failures are left for the next retry
   * tick, and non-retryable failures are delegated to
   * {@link #handleNonRetryableUpdateStatusError}.
   *
   * @param entry - The runtime entry to process.
   */
  #processEntry(entry: QuoteStatusRuntimeEntry): void {
    // The backend already accepted the entry's current status, so there is
    // nothing new to report. The entry is kept tracked (e.g. a `Submitted`
    // quote awaiting finalization) until its status advances past the
    // acknowledged one, at which point it is reprocessed.
    if (entry.acknowledgedState === entry.status.state) {
      return;
    }

    const sentStatus = entry.status.state;
    const sentStatusBackend = QuoteStatusStateToBackendStatus[sentStatus];

    // Terminal states (`Completed`/`Expired`) have no backend status to report.
    // The entry is retained so future interactions with the quote are rejected.
    if (sentStatusBackend === null) {
      this.#stopRetryTimerIfIdle();
      return;
    }

    // Re-checked before each retry attempt so an in-flight retry stops early when
    // the entry has since advanced, been acknowledged, become terminal, or
    // expired (a later `reportFinalised` re-triggers processing). This avoids
    // firing a request the backend would reject (e.g. `SUBMITTED` after
    // finalization).
    const retry = (): boolean => {
      const live = this.#quoteStatusEntryStore.get(
        QuoteStatusEntryStore.hash(entry),
      );
      return Boolean(
        live &&
        live.status.state === sentStatus &&
        live.acknowledgedState !== sentStatus,
      );
    };

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
          retry,
        },
      )
      .then((outcome) => {
        switch (outcome.type) {
          case QuoteStatusFetchWithRetryOutcomeType.Accepted: {
            const current = this.#quoteStatusEntryStore.get(
              QuoteStatusEntryStore.hash(entry),
            );
            // The entry can only be absent if the store was cleared (e.g. via
            // `destroy`) while the request was in flight; nothing left to do.
            if (!current) {
              return undefined;
            }
            if (current.status.state !== sentStatus) {
              // The status advanced mid-flight; report the newer status.
              this.#processEntry(current);
              return undefined;
            }
            if (
              sentStatus === QuoteStatusState.FinalizedSuccess ||
              sentStatus === QuoteStatusState.FinalizedFailed
            ) {
              // A finalized status was accepted; advance to the terminal
              // `Completed` state and keep the entry so any later duplicate
              // `reportSubmitted` for this quote is rejected instead of looping.
              this.#markCompleted(current);

              return undefined;
            }
            // A non-final status (e.g. `Submitted`) was accepted. The quote is
            // not done yet: it still needs to be finalized via a later
            // `reportFinalised`, which looks the entry up by `txMetaId`. Keep
            // the entry tracked and record the acknowledgement so the retry
            // loop stops re-sending the already-accepted status.
            current.acknowledgedState = sentStatus;
            this.#quoteStatusEntryStore.update(current);
            this.#stopRetryTimerIfIdle();
            return undefined;
          }
          case QuoteStatusFetchWithRetryOutcomeType.NonRetryable:
            this.#handleNonRetryableUpdateStatusError(entry, outcome);
            return undefined;
          case QuoteStatusFetchWithRetryOutcomeType.Interrupted:
            this.#processEntry(entry);
            return undefined;
          case QuoteStatusFetchWithRetryOutcomeType.RetryableExhausted:
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
   * Advances an entry to the terminal `Completed` state and stops the retry
   * timer if no work remains. The entry is kept in the store so later duplicate
   * reports for the same quote are recognized and rejected.
   *
   * @param entry - The runtime entry to complete.
   * @param finalizedState - Optional finalized state the backend reports as
   * current. When provided and reachable, the entry is first advanced through it
   * so the FSM's forward-only path (`Submitted -> FinalizedX -> Completed`) is
   * respected before reaching `Completed`.
   */
  #markCompleted(
    entry: QuoteStatusRuntimeEntry,
    finalizedState?: QuoteStatusState,
  ): void {
    if (finalizedState && entry.status.canTransitionTo(finalizedState)) {
      entry.status.transitionTo(finalizedState);
    }

    if (entry.status.canTransitionTo(QuoteStatusState.Completed)) {
      entry.status.transitionTo(QuoteStatusState.Completed);
    }

    this.#stopRetryTimerIfIdle();
  }

  /**
   * Advances an entry to the terminal `Expired` state (abandoning it) and stops
   * the retry timer if no work remains. The entry is kept in the store so later
   * interactions with the same quote are rejected.
   *
   * @param entry - The runtime entry to abandon.
   */
  #markExpired(entry: QuoteStatusRuntimeEntry): void {
    if (entry.status.canTransitionTo(QuoteStatusState.Expired)) {
      entry.status.transitionTo(QuoteStatusState.Expired);
    }

    this.#stopRetryTimerIfIdle();
  }

  /**
   * Reconciles local state in response to a non-retryable backend error.
   *
   * When the backend reports a terminal status, the entry is either advanced to
   * match and reprocessed (if it is behind) or converged to `Completed` (if it
   * is already finalized), surfacing an error only for a genuine status
   * discrepancy. Other non-retryable errors that cannot be reconciled mark the
   * entry `Expired` (abandoned). Entries are always kept in the store so future
   * interactions with the quote are rejected rather than looping.
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

    const backendFinalizedToState: Partial<
      Record<QuoteStatusBackendStatus, QuoteStatusState>
    > = {
      [QuoteStatusBackendStatus.FinalizedSuccess]:
        QuoteStatusState.FinalizedSuccess,
      [QuoteStatusBackendStatus.FinalizedFailed]:
        QuoteStatusState.FinalizedFailed,
    };

    // The transition we requested is invalid because the backend is already in a
    // terminal state (e.g. we re-sent `SUBMITTED` after finalization). There is
    // nothing left to report, so advance the entry to `Completed` and keep it.
    if (
      response?.type ===
        QuoteStatusUpdateBackendErrorType.InvalidStatusTransaction &&
      (response.currentStatus === QuoteStatusBackendStatus.FinalizedSuccess ||
        response.currentStatus === QuoteStatusBackendStatus.FinalizedFailed)
    ) {
      this.#markCompleted(
        entry,
        backendFinalizedToState[response.currentStatus],
      );
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
      const nextState = backendFinalizedToState[response.currentStatus];

      if (nextState) {
        // We are behind the backend's terminal status; advance our local state
        // and reprocess so the correct finalization status is reported.
        if (entry.status.canTransitionTo(nextState)) {
          entry.status.transitionTo(nextState);
          this.#processEntry(entry);
          return;
        }

        // The backend reports a finalized status but we cannot transition there.
        // If we already hold that same finalized state, this can be a stale
        // `SUBMITTED` response racing with an in-flight finalized update. Do not
        // complete in this case: keep the entry pending so the finalized update
        // can continue retrying on transient backend errors such as
        // `CONCURRENT_UPDATE`.
        if (entry.status.state === nextState) {
          return;
        }

        // Any other non-transitionable finalized mismatch indicates we've reached
        // (or passed) a terminal state but disagree with the backend's final
        // status. Converge to `Completed` (kept) rather than expiring.
        if (
          entry.status.state !== QuoteStatusState.Completed &&
          entry.status.state !== QuoteStatusState.Expired
        ) {
          // Genuine discrepancy between our finalized status and the backend's
          // (e.g. we observed the opposite outcome); surface it for visibility,
          // but still complete the entry instead of looping or abandoning it.
          this.#onError?.(
            new QuoteStatusUpdateError(
              `reporting finalization status but entry cannot transition from "${entry.status.state}" to "${nextState}"`,
              { quoteId: entry.quoteId },
            ),
          );
        }
        this.#markCompleted(entry);
        return;
      }
    }

    // Any non-retryable error we could not reconcile means we cannot make
    // progress on this entry, so abandon it rather than leaving it stuck.
    this.#markExpired(entry);
    this.#onError?.(
      new QuoteStatusUpdateError(
        `abandoning entry due to non-retryable error`,
        {
          quoteId: entry.quoteId,
          errorType: response?.type,
        },
      ),
    );
  }
}
