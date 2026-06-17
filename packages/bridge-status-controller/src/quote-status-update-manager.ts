import type { BridgeClientId } from '@metamask/bridge-controller';
import { getClientHeaders } from '@metamask/bridge-controller';

import {
  QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES,
  QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS,
  QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS,
  QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS,
  QuoteStatusUpdateErrorType,
  QuoteStatusUpdateSendWithRetryResult,
  QuoteStatusUpdateStatus,
} from './constants';
import { QuoteStatusUpdateError } from './errors';
import type {
  BridgeStatusControllerMessenger,
  DeferredStatusUpdateEntry,
  QuoteStatusUpdateResponse,
} from './types';
import { getJwt } from './utils/authentication';
import { sleep } from './utils/helpers';
import { validateQuoteStatusUpdateResponse } from './utils/validators';

/**
 * Handles reporting quote status updates (SUBMITTED / FINALISED) to the
 * Bridge API via a single persisted deferred retry queue.
 *
 * Each entry holds a FIFO queue of status strings (`pendingStatuses`) to
 * send in order. {@link reportSubmitted} creates an entry with `SUBMITTED`
 * as the first pending status. {@link reportFinalised} appends the final
 * outcome (`FINALIZED_SUCCESS` or `FINALIZED_FAILURE`). Processing sends
 * `pendingStatuses[0]`, and on success shifts it off. The entry is deleted
 * once the queue is empty.
 *
 * Entries are retried every {@link QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS}
 * for up to {@link QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS}.
 *
 * **Note:** Non-retryable errors such as `SVM_TRADE_DESERIALIZE_FAILED` are evicted
 *           from the retry logic since they cannot be mitigated on the client side.
 *           In the future, we might consider including these errors in the retry mechanism
 *           with a {@link QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS} expiration, but for now,
 *           we exclude them to prevent excessive network  calls for errors that are expected to
 *           fail due to backend issues.
 *
 * **Note:** If we fail to finalize after {@link QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES} attempts,
 *           we currently evict the request. However, we may want to consider enqueueing these cases and
 *           allowing retries every 30 minutes for up to 12 hours, similar to how we currently handle
 *           "submitted" statuses.
 */
/**
 * Sentinel returned by {@link QuoteStatusUpdateManager.updateQuoteStatus} when
 * the status to send is no longer the head of the entry's queue — e.g. a
 * finalization was queued while we awaited authentication. The POST is skipped
 * so we never report a status the quote has already moved past.
 */
const SUPERSEDED = Symbol('superseded');

export class QuoteStatusUpdateManager {
  readonly #messenger: BridgeStatusControllerMessenger;

  readonly #clientId: BridgeClientId;

  readonly #clientProduct: string;

  readonly #clientVersion: string | undefined;

  readonly #apiBaseUrl: string;

  /**
   * In-memory deferred quote status updates keyed by `${quoteId}:${srcTxHash}`.
   * Each value holds a FIFO `pendingStatuses` list and metadata; the map is
   * cloned into controller state via {@link #persistToState} whenever it changes.
   */
  readonly #deferredRetryQueue: Map<string, DeferredStatusUpdateEntry>;

  /**
   * Writes the full deferred-queue snapshot to {@link BridgeStatusController}
   * state as `deferredStatusUpdates` (replacing the prior record). Injected by
   * the controller constructor; invoked from {@link #persistToState} after
   * cloning the map so Immer does not freeze live entries.
   *
   * @param updates - Plain record mirroring {@link #deferredRetryQueue} keys and entries.
   */
  readonly #persistDeferredUpdates: (
    updates: Record<string, DeferredStatusUpdateEntry>,
  ) => void;

  /**
   * Optional callback invoked whenever an entry is evicted due to a
   * non-recoverable condition (expired retry window, exhausted finalization
   * retries, or a permanently non-retryable API error). Receives the eviction
   * reason as an `Error` so callers can forward it to error-reporting services.
   */
  readonly #onError: ((error: QuoteStatusUpdateError) => void) | undefined;

  /**
   * Optional callback that returns whether quote-status update reporting is
   * currently enabled. Called lazily at each decision point so that toggling a
   * remote feature flag takes effect immediately without re-instantiation.
   */
  readonly #isEnabled: (() => boolean) | undefined;

  /**
   * Tracks which keys have an in-flight #processSingleEntry call to prevent
   * concurrent processing of the same entry.
   */
  readonly #inFlight = new Set<string>();

  #retryIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor({
    messenger,
    clientId,
    clientProduct,
    clientVersion,
    apiBaseUrl,
    initialDeferredUpdates,
    persistDeferredUpdates,
    onError,
    isEnabled,
  }: {
    messenger: BridgeStatusControllerMessenger;
    clientId: BridgeClientId;
    clientProduct: string;
    clientVersion?: string;
    apiBaseUrl: string;
    initialDeferredUpdates?: Record<string, DeferredStatusUpdateEntry>;
    persistDeferredUpdates: (
      updates: Record<string, DeferredStatusUpdateEntry>,
    ) => void;
    onError?: (error: QuoteStatusUpdateError) => void;
    isEnabled?: () => boolean;
  }) {
    this.#messenger = messenger;
    this.#clientId = clientId;
    this.#clientProduct = clientProduct;
    this.#clientVersion = clientVersion;
    this.#apiBaseUrl = apiBaseUrl;
    this.#persistDeferredUpdates = persistDeferredUpdates;
    this.#onError = onError;
    this.#isEnabled = isEnabled;

    this.#deferredRetryQueue = new Map(
      Object.entries(initialDeferredUpdates ?? {}).map(([key, entry]) => [
        key,
        // Entries from `initialDeferredUpdates` come from Immer-managed controller
        // state, which deep-freezes all nested objects. Cloning each entry here
        // ensures the in-memory queue holds mutable objects so that mutations
        // work correctly without throwing a "read only property" error.
        { ...entry, pendingStatuses: [...entry.pendingStatuses] },
      ]),
    );

    this.#dropExpiredEntries();

    // If there are items to be processed, start the poller and
    // immediately attempt to process all entries (don't wait for
    // the first interval tick).
    if (this.#deferredRetryQueue.size > 0) {
      this.#ensureRetryTimerRunning();
      let delay = 0;
      for (const key of this.#deferredRetryQueue.keys()) {
        setTimeout(() => this.#processSingleEntry(key), delay);
        delay += 125;
      }
    }
  }

  /**
   * Enqueues a SUBMITTED status report and immediately attempts to send it.
   *
   * @param quoteId - The quote id
   * @param srcTxHash - The source transaction hash
   * @param txMetaId - Optional transaction meta id for finalization tracking
   */
  reportSubmitted(quoteId: string, srcTxHash: string, txMetaId?: string): void {
    if (!this.#isEnabled?.()) {
      return;
    }
    const key = this.#enqueue({
      quoteId,
      srcTxHash,
      txMetaId,
      pendingStatuses: [QuoteStatusUpdateStatus.Submitted],
    });
    this.#processSingleEntry(key);
  }

  /**
   * Appends the final outcome to the entry's pending statuses queue.
   *
   * If the entry is not currently in-flight, triggers processing
   * immediately. Otherwise the outcome will be picked up once the
   * current in-flight call completes and the retry loop continues.
   *
   * @param txMetaId - The transaction meta id
   * @param success - Whether the transaction succeeded
   */
  reportFinalised(txMetaId: string, success: boolean): void {
    if (!this.#isEnabled?.()) {
      return;
    }
    const matchingKey = this.#findKeyByTxMetaId(txMetaId);
    if (!matchingKey) {
      return;
    }

    const entry = this.#deferredRetryQueue.get(
      matchingKey,
    ) as DeferredStatusUpdateEntry;

    // A finalized quote can never return to SUBMITTED. Replace any not-yet-sent
    // pre-finalization statuses (e.g. a queued SUBMITTED) with the final
    // outcome, so we report only the terminal status. Sending SUBMITTED after
    // the backend has mapped the quote to a terminal status on-chain would 400
    // ("Invalid status transition from FINALIZED_SUCCESS to SUBMITTED").
    entry.pendingStatuses = [
      success
        ? QuoteStatusUpdateStatus.FinalizedSuccess
        : QuoteStatusUpdateStatus.FinalizedFailed,
    ];
    this.#persistToState();

    if (!this.#inFlight.has(matchingKey)) {
      this.#processSingleEntry(matchingKey);
    }
  }

  /**
   * Stops the deferred retry timer and clears the in-memory queue.
   * Does not persist, the caller is responsible for resetting state.
   */
  destroy(): void {
    this.#stopRetryTimer();
    this.#deferredRetryQueue.clear();
    this.#inFlight.clear();
  }

  #enqueue(
    entry: Omit<DeferredStatusUpdateEntry, 'createdAt' | 'lastAttemptAt'>,
  ): string {
    const key = `${entry.quoteId}:${entry.srcTxHash}`;

    // If an entry for this key is already in the queue
    // do not overwrite it. Re-enqueueing would reset state and
    // could cause duplicate SUBMITTED events.
    const existing = this.#deferredRetryQueue.get(key);
    if (existing) {
      if (!existing.txMetaId && entry.txMetaId) {
        existing.txMetaId = entry.txMetaId;
        this.#persistToState();
      }
      return key;
    }

    const now = Date.now();
    this.#deferredRetryQueue.set(key, {
      ...entry,
      createdAt: now,
      lastAttemptAt: now,
    });
    this.#persistToState();
    this.#ensureRetryTimerRunning();
    return key;
  }

  #findKeyByTxMetaId(txMetaId: string): string | undefined {
    for (const [key, entry] of this.#deferredRetryQueue) {
      if (entry.txMetaId === txMetaId) {
        return key;
      }
    }
    return undefined;
  }

  /**
   * Sends the next pending status for one deferred entry: runs
   * {@link #sendWithRetry} for `pendingStatuses[0]`, then applies the
   * {@link QuoteStatusUpdateSendWithRetryResult} (shift queue on success, persist and keep for
   * deferred interval on retryable, or no-op when already handled inside
   * {@link #sendWithRetry}). Skips if the row is gone, already in flight,
   * has no pending statuses, or exceeded the max retry lifetime.
   *
   * @param key - Deferred map key (`${quoteId}:${srcTxHash}`).
   */
  #processSingleEntry(key: string): void {
    // Skip processing if the feature has been disabled after this entry was
    // already scheduled. The entry remains in state and will be retried the
    // next time the feature is re-enabled (e.g. on service-worker restart).
    if (!this.#isEnabled?.()) {
      return;
    }

    // Row may have been removed by another path or never existed for this key.
    const entry = this.#deferredRetryQueue.get(key);
    // Do not start a second in-flight send for the same key (#sendWithRetry is async).
    if (!entry || this.#inFlight.has(key)) {
      return;
    }

    // Defensive cleanup: an empty FIFO should not stay in the map.
    if (entry.pendingStatuses.length === 0) {
      this.#removeEntry(key);
      return;
    }

    // Stop retrying stale bridge submissions after the configured window.
    if (
      Date.now() - entry.createdAt >
      QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS
    ) {
      this.#onError?.(
        new QuoteStatusUpdateError(
          `evicting deferred retry cause it exceeded the expiration window`,
          {
            quoteId: entry.quoteId,
          },
        ),
      );
      this.#removeEntry(key);
      return;
    }

    // Mutex: mark before awaiting so concurrent callers bail at the guard above.
    this.#inFlight.add(key);

    // FIFO: always POST the head of the queue (SUBMITTED before finalization, etc.).
    const currentStatus = entry.pendingStatuses[0];

    this.#sendWithRetry(key, entry, currentStatus)
      .then((result) => {
        // Finalization / eviction already ran inside #sendWithRetry; state is current.
        if (result === QuoteStatusUpdateSendWithRetryResult.Handled) {
          return undefined;
        }

        if (result === QuoteStatusUpdateSendWithRetryResult.Success) {
          // API accepted this status; move on to the next pending value if any.
          // Only shift when the head is still the status we sent — a concurrent
          // reportFinalised may have collapsed the queue while the POST was in
          // flight, in which case the head is the finalization status to keep.
          if (entry.pendingStatuses[0] === currentStatus) {
            entry.pendingStatuses.shift();
          }

          if (entry.pendingStatuses.length > 0) {
            // Persist the shortened queue, release the lock, then continue same key.
            this.#persistToState();
            this.#inFlight.delete(key);
            this.#processSingleEntry(key);
          } else {
            // Queue drained for this quote+hash; drop the row and stop timers if idle.
            this.#inFlight.delete(key);
            this.#removeEntry(key);
          }
          return undefined;
        }

        // Retryable — immediate retries exhausted, keep in deferred queue
        // Release mutex so the 30m poller (or constructor stagger) can retry later.
        this.#inFlight.delete(key);
        // Touch lastAttempt for observability / future ordering; persist survives restart.
        entry.lastAttemptAt = Date.now();
        this.#persistToState();
        return undefined;
      })
      .catch(() => {
        // Network / unexpected failures — keep entry for deferred retry
        // Same as retryable path: clear in-flight, bump timestamp, persist for resume.
        this.#inFlight.delete(key);
        entry.lastAttemptAt = Date.now();
        this.#persistToState();
      });
  }

  /**
   * Attempts to send the corrected finalization status with up to
   * {@link QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES} retries.
   * On failure, the entry is evicted.
   *
   * @param key - The deferred queue key
   * @param entry - The deferred status update entry
   */
  async #attemptFinalizationWithRetries(
    key: string,
    entry: DeferredStatusUpdateEntry,
  ): Promise<void> {
    const finalizationStatus = entry.pendingStatuses[0];

    for (
      let attempt = 0;
      attempt <= QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES;
      attempt++
    ) {
      if (attempt > 0) {
        await sleep(QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS);
      }

      // Stop if the entry was removed (drained, evicted, reset) while we were
      // awaiting — keep no stale requests in flight against a gone entry.
      if (!this.#shouldKeepProcessing(key)) {
        return;
      }

      try {
        const response = await this.#updateQuoteStatus(
          entry.quoteId,
          entry.srcTxHash,
          finalizationStatus,
          key,
        );

        // Entry was collapsed or removed while sending — stop here.
        if (response === SUPERSEDED) {
          return;
        }

        // Request succeeded, remove entry from queue.
        if (response === undefined) {
          this.#removeEntry(key);
          return;
        }
      } catch {
        // Network error, continue retrying
      }
    }

    this.#removeEntry(key);
    this.#onError?.(
      new QuoteStatusUpdateError(
        `evicting due to finalization retries exhausted for quote`,
        {
          quoteId: entry.quoteId,
        },
      ),
    );
  }

  /**
   * Sends a status update, immediately retrying up to
   * {@link QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES} times when the
   * response is {@link QuoteStatusUpdateErrorType.ConcurrentUpdate} or
   * {@link QuoteStatusUpdateErrorType.TransactionNotIndexed}.
   *
   * If a non-retryable actionable error is received mid-retry (e.g.
   * {@link QuoteStatusUpdateErrorType.QuoteStatusOnChainMismatch} or
   * {@link QuoteStatusUpdateErrorType.InvalidStatusTransaction}), the
   * retry loop is aborted and finalization is attempted immediately.
   *
   * Returns one of three {@link QuoteStatusUpdateSendWithRetryResult} outcomes:
   * - {@link QuoteStatusUpdateSendWithRetryResult.Success} — 2xx accepted
   * - {@link QuoteStatusUpdateSendWithRetryResult.Retryable} — immediate retries exhausted, entry stays in deferred queue
   * - {@link QuoteStatusUpdateSendWithRetryResult.Handled} — finalization or eviction was performed internally
   *
   * Throws only on network-level / unexpected failures (no response body).
   *
   * @param key - The deferred queue key
   * @param entry - The deferred status update entry
   * @param status - The status string to send
   * @returns The outcome of the send attempt
   */
  async #sendWithRetry(
    key: string,
    entry: DeferredStatusUpdateEntry,
    status: QuoteStatusUpdateStatus,
  ): Promise<QuoteStatusUpdateSendWithRetryResult> {
    const retryableTypes: Set<QuoteStatusUpdateErrorType> = new Set([
      QuoteStatusUpdateErrorType.ConcurrentUpdate,
      QuoteStatusUpdateErrorType.TransactionNotIndexed,
    ]);

    for (
      let attempt = 0;
      attempt <= QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES;
      attempt++
    ) {
      if (attempt > 0) {
        await sleep(QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS);
      }

      // The entry may have been finalized, evicted, or reset by another code
      // path while we were awaiting. Stop issuing requests so we don't keep
      // POSTing a status the backend has already moved past (e.g. SUBMITTED
      // after a successful FINALIZED_SUCCESS) once the queue no longer holds it.
      if (!this.#shouldKeepProcessing(key)) {
        this.#inFlight.delete(key);
        return QuoteStatusUpdateSendWithRetryResult.Handled;
      }

      const response = await this.#updateQuoteStatus(
        entry.quoteId,
        entry.srcTxHash,
        status,
        key,
      );

      // A finalization was queued while sending; release the mutex and
      // re-process so the entry reports the final status directly.
      if (response === SUPERSEDED) {
        this.#inFlight.delete(key);
        this.#processSingleEntry(key);
        return QuoteStatusUpdateSendWithRetryResult.Handled;
      }

      if (response === undefined) {
        return QuoteStatusUpdateSendWithRetryResult.Success;
      }

      if (!retryableTypes.has(response.type)) {
        await this.#handleNonRetryableError(key, entry, response);
        return QuoteStatusUpdateSendWithRetryResult.Handled;
      }
    }

    return QuoteStatusUpdateSendWithRetryResult.Retryable;
  }

  /**
   * Handles a non-retryable error response by either attempting finalization
   * with the corrected status or evicting the entry.
   *
   * @param key - The deferred queue key
   * @param entry - The deferred status update entry
   * @param response - The non-retryable error response
   */
  async #handleNonRetryableError(
    key: string,
    entry: DeferredStatusUpdateEntry,
    response: QuoteStatusUpdateResponse,
  ): Promise<void> {
    const { type } = response;

    // `INVALID_STATUS_TRANSITION` reports the quote's *persisted* status in
    // `currentStatus`. When that is already terminal the lifecycle is complete
    // server-side, so there is nothing left to send. Re-POSTing it would always
    // 400 (e.g. FINALIZED_SUCCESS -> FINALIZED_SUCCESS) and, because the entry is
    // persisted, keep looping across service-worker restarts. Drop the entry.
    if (
      type === QuoteStatusUpdateErrorType.InvalidStatusTransaction &&
      (response.currentStatus === QuoteStatusUpdateStatus.FinalizedSuccess ||
        response.currentStatus === QuoteStatusUpdateStatus.FinalizedFailed)
    ) {
      this.#inFlight.delete(key);
      this.#removeEntry(key);
      return;
    }

    if (
      type === QuoteStatusUpdateErrorType.InvalidStatusTransaction ||
      type === QuoteStatusUpdateErrorType.QuoteStatusOnChainMismatch
    ) {
      const finalizationStatus = response.currentStatus;
      entry.pendingStatuses = [finalizationStatus];
      this.#persistToState();
      this.#inFlight.delete(key);
      await this.#attemptFinalizationWithRetries(key, entry);
      return;
    }

    // Any other error type — do not retry, evict
    this.#inFlight.delete(key);
    this.#removeEntry(key);
    this.#onError?.(
      new QuoteStatusUpdateError(`evicting due to non-retryable error`, {
        quoteId: entry.quoteId,
        errorType: type,
      }),
    );
  }

  #removeEntry(key: string): void {
    this.#deferredRetryQueue.delete(key);
    this.#persistToState();
    if (this.#deferredRetryQueue.size === 0) {
      this.#stopRetryTimer();
    }
  }

  /**
   * Whether an in-flight retry loop should keep issuing requests for `key`.
   *
   * Returns `false` once the entry has left the live queue (drained, evicted,
   * reset, or expired) or the feature has been disabled, so loops awaiting a
   * retry delay abort instead of POSTing a status the backend has already
   * moved past.
   *
   * @param key - The deferred queue key being processed.
   * @returns `true` while the entry is still queued and reporting is enabled.
   */
  #shouldKeepProcessing(key: string): boolean {
    return (this.#isEnabled?.() ?? true) && this.#deferredRetryQueue.has(key);
  }

  #ensureRetryTimerRunning(): void {
    if (this.#retryIntervalId !== null) {
      return;
    }
    this.#retryIntervalId = setInterval(
      () => this.#processDeferredRetries(),
      QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS,
    );
  }

  #stopRetryTimer(): void {
    if (this.#retryIntervalId !== null) {
      clearInterval(this.#retryIntervalId);
      this.#retryIntervalId = null;
    }
  }

  #processDeferredRetries(): void {
    this.#dropExpiredEntries();

    if (this.#deferredRetryQueue.size === 0) {
      this.#stopRetryTimer();
      return;
    }

    for (const key of this.#deferredRetryQueue.keys()) {
      this.#processSingleEntry(key);
    }
  }

  #dropExpiredEntries(): void {
    const now = Date.now();
    let changed = false;

    for (const [key, entry] of this.#deferredRetryQueue) {
      if (now - entry.createdAt > QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS) {
        this.#deferredRetryQueue.delete(key);
        this.#onError?.(
          new QuoteStatusUpdateError(
            `evicting deferred retry cause it exceeded the expiration window`,
            {
              quoteId: entry.quoteId,
            },
          ),
        );
        changed = true;
      }
    }

    if (changed) {
      this.#persistToState();
    }
  }

  /**
   * Clones entries before persisting so the controller's state management
   * (Immer) does not freeze the in-memory Map objects.
   */
  #persistToState(): void {
    const cloned: Record<string, DeferredStatusUpdateEntry> = {};
    for (const [key, entry] of this.#deferredRetryQueue) {
      cloned[key] = { ...entry, pendingStatuses: [...entry.pendingStatuses] };
    }
    this.#persistDeferredUpdates(cloned);
  }

  /**
   * Calls the Bridge API updateStatus endpoint.
   *
   * Returns `undefined` on 2xx, or the parsed error response body on non-2xx
   * so callers can branch on the typed error.
   *
   * @param quoteId - The quote id
   * @param srcTxHash - The source transaction hash
   * @param newStatus - The new status to report
   * @param key - Optional deferred-queue key; when provided, the POST is
   * skipped (returning {@link SUPERSEDED}) if `newStatus` is no longer the head
   * of the entry's queue after authentication resolves.
   * @returns The parsed error response, `undefined` on success, or
   * {@link SUPERSEDED} when the status was superseded before sending.
   */
  readonly #updateQuoteStatus = async (
    quoteId: string,
    srcTxHash: string,
    newStatus: QuoteStatusUpdateStatus,
    key?: string,
  ): Promise<QuoteStatusUpdateResponse | undefined | typeof SUPERSEDED> => {
    // Resolve auth first; a finalization may be queued (via reportFinalised)
    // while we await it.
    const jwt = await getJwt(this.#messenger);

    // A finalized quote can never return to SUBMITTED. If the head changed
    // while we were resolving auth (collapsed to a finalization, or the entry
    // was removed), skip the POST so we don't report an obsolete status.
    if (
      key !== undefined &&
      this.#deferredRetryQueue.get(key)?.pendingStatuses[0] !== newStatus
    ) {
      return SUPERSEDED;
    }

    // This method uses `globalThis.fetch` and reads the raw
    // `Response` (including JSON on non-2xx). Wrappers like `handleFetch` that
    // throw on non-2xx would prevent typed error handling in callers.
    const res = await globalThis.fetch(
      `${this.#apiBaseUrl}/quote/updateStatus`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-metamask-clientproduct': this.#clientProduct,
          ...(this.#clientVersion
            ? { 'x-metamask-clientversion': this.#clientVersion }
            : {}),
          ...getClientHeaders({
            clientId: this.#clientId,
            jwt,
          }),
        },
        body: JSON.stringify({
          quoteId,
          newStatus,
          srcTxHash,
        }),
      },
    );

    if (res.ok) {
      return undefined;
    }

    const data = await res.json();

    try {
      validateQuoteStatusUpdateResponse(data);
      return data;
    } catch (error) {
      this.#onError?.(
        new QuoteStatusUpdateError(
          'unexpected response shape from quote/updateStatus',
          { quoteId },
        ),
      );
      throw error;
    }
  };
}
