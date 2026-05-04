import type { BridgeClientId } from '@metamask/bridge-controller';
import { getClientHeaders } from '@metamask/bridge-controller';

import {
  QUOTE_STATUS_UPDATE_IMMEDIATE_MAX_RETRIES,
  QUOTE_STATUS_UPDATE_IMMEDIATE_RETRY_DELAY_MS,
  QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS,
  QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS,
  QuoteStatusUpdateErrorType,
  QuoteStatusUpdateType,
  QuoteStatusUpdateSendWithRetryResult,
} from './constants';
import type {
  BridgeStatusControllerMessenger,
  DeferredStatusUpdateEntry,
  QuoteStatusUpdateResponse,
} from './types';
import { getJwt } from './utils/authentication';
import { sleep } from './utils/helpers';

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
 */
export class QuoteStatusUpdateManager {
  readonly #messenger: BridgeStatusControllerMessenger;

  readonly #clientId: BridgeClientId;

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
   * Tracks which keys have an in-flight #processSingleEntry call to prevent
   * concurrent processing of the same entry.
   */
  readonly #inFlight = new Set<string>();

  #retryIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor({
    messenger,
    clientId,
    apiBaseUrl,
    initialDeferredUpdates,
    persistDeferredUpdates,
  }: {
    messenger: BridgeStatusControllerMessenger;
    clientId: BridgeClientId;
    apiBaseUrl: string;
    initialDeferredUpdates?: Record<string, DeferredStatusUpdateEntry>;
    persistDeferredUpdates: (
      updates: Record<string, DeferredStatusUpdateEntry>,
    ) => void;
  }) {
    this.#messenger = messenger;
    this.#clientId = clientId;
    this.#apiBaseUrl = apiBaseUrl;
    this.#persistDeferredUpdates = persistDeferredUpdates;

    this.#deferredRetryQueue = new Map(
      Object.entries(initialDeferredUpdates ?? {}).map(([key, entry]) => [
        key,
        // Entries from `initialDeferredUpdates` come from Immer-managed controller
        // state, which deep-freezes all nested objects. Cloning each entry here
        // ensures the in-memory queue holds mutable objects so that mutations like
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
    const key = this.#enqueue({
      quoteId,
      srcTxHash,
      txMetaId,
      pendingStatuses: [QuoteStatusUpdateType.Submitted],
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
    const matchingKey = this.#findKeyByTxMetaId(txMetaId);
    if (!matchingKey) {
      return;
    }

    const entry = this.#deferredRetryQueue.get(
      matchingKey,
    ) as DeferredStatusUpdateEntry;

    entry.pendingStatuses.push(
      success
        ? QuoteStatusUpdateType.FinalizedSuccess
        : QuoteStatusUpdateType.FinalizedFailure,
    );
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
      console.error(
        `QuoteStatusUpdateManager: evicting deferred retry for quote ${entry.quoteId} — exceeded 12-hour retry window`,
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
          entry.pendingStatuses.shift();

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

      try {
        const response = await this.#updateQuoteStatus(
          entry.quoteId,
          entry.srcTxHash,
          finalizationStatus,
        );

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
    console.error(
      `QuoteStatusUpdateManager: finalization retries exhausted for quote ${entry.quoteId} — evicting`,
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
    status: string,
  ): Promise<QuoteStatusUpdateSendWithRetryResult> {
    const retryableTypes: Set<string> = new Set([
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

      const response = await this.#updateQuoteStatus(
        entry.quoteId,
        entry.srcTxHash,
        status,
      );

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
    console.error(
      `QuoteStatusUpdateManager: non-retryable error "${type}" for quote ${entry.quoteId} — evicting`,
    );
  }

  #removeEntry(key: string): void {
    this.#deferredRetryQueue.delete(key);
    this.#persistToState();
    if (this.#deferredRetryQueue.size === 0) {
      this.#stopRetryTimer();
    }
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
        console.error(
          `QuoteStatusUpdateManager: evicting deferred retry for quote ${entry.quoteId} — exceeded 12-hour retry window`,
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
   * @returns The parsed error response, or undefined on success
   */
  readonly #updateQuoteStatus = async (
    quoteId: string,
    srcTxHash: string,
    newStatus: string,
  ): Promise<QuoteStatusUpdateResponse | undefined> => {
    // This method uses `globalThis.fetch` and reads the raw
    // `Response` (including JSON on non-2xx). Wrappers like `handleFetch` that
    // throw on non-2xx would prevent typed error handling in callers.
    const res = await globalThis.fetch(
      `${this.#apiBaseUrl}/quote/updateStatus`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getClientHeaders({
            clientId: this.#clientId,
            jwt: await getJwt(this.#messenger),
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

    return (await res.json()) as QuoteStatusUpdateResponse;
  };
}
