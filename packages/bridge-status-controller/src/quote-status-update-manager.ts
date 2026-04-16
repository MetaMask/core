import type { BridgeClientId } from '@metamask/bridge-controller';
import { getClientHeaders } from '@metamask/bridge-controller';
import {
  HttpError,
  createServicePolicy,
  ConstantBackoff,
} from '@metamask/controller-utils';

import {
  QUOTE_STATUS_UPDATE_RETRY_INTERVAL_MS,
  QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS,
  QuoteStatusUpdateType,
} from './constants';
import type {
  BridgeStatusControllerMessenger,
  DeferredStatusUpdateEntry,
  FetchFunction,
} from './types';
import { getJwt } from './utils/authentication';

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

  readonly #fetchFn: FetchFunction;

  readonly #clientId: BridgeClientId;

  readonly #apiBaseUrl: string;

  readonly #deferredRetryQueue: Map<string, DeferredStatusUpdateEntry>;

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
    fetchFn,
    clientId,
    apiBaseUrl,
    initialDeferredUpdates,
    persistDeferredUpdates,
  }: {
    messenger: BridgeStatusControllerMessenger;
    fetchFn: FetchFunction;
    clientId: BridgeClientId;
    apiBaseUrl: string;
    initialDeferredUpdates?: Record<string, DeferredStatusUpdateEntry>;
    persistDeferredUpdates: (
      updates: Record<string, DeferredStatusUpdateEntry>,
    ) => void;
  }) {
    this.#messenger = messenger;
    this.#fetchFn = fetchFn;
    this.#clientId = clientId;
    this.#apiBaseUrl = apiBaseUrl;
    this.#persistDeferredUpdates = persistDeferredUpdates;

    this.#deferredRetryQueue = new Map(
      Object.entries(initialDeferredUpdates ?? {}),
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
   * Does not persist — the caller is responsible for resetting state.
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

  #processSingleEntry(key: string): void {
    const entry = this.#deferredRetryQueue.get(key);
    if (!entry || this.#inFlight.has(key)) {
      return;
    }

    if (entry.pendingStatuses.length === 0) {
      this.#removeEntry(key);
      return;
    }

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

    this.#inFlight.add(key);

    this.#sendWithRetry(
      entry.quoteId,
      entry.srcTxHash,
      entry.pendingStatuses[0],
    )
      .then(() => {
        entry.pendingStatuses.shift();

        if (entry.pendingStatuses.length > 0) {
          this.#persistToState();
          this.#inFlight.delete(key);
          this.#processSingleEntry(key);
        } else {
          this.#inFlight.delete(key);
          this.#removeEntry(key);
        }
        return undefined;
      })
      .catch((error: unknown) => {
        this.#inFlight.delete(key);

        if (error instanceof HttpError && error.httpStatus === 400) {
          if (entry.txMetaId) {
            entry.pendingStatuses.shift();
          } else {
            this.#removeEntry(key);
            console.error(
              `QuoteStatusUpdateManager: HTTP 400 for quote ${entry.quoteId} with no txMetaId — evicting`,
            );
            return;
          }
        }

        entry.lastAttemptAt = Date.now();
        this.#persistToState();
      });
  }

  async #sendWithRetry(
    quoteId: string,
    srcTxHash: string,
    status: string,
  ): Promise<void> {
    const policy = createServicePolicy({
      maxRetries: 6,
      backoff: new ConstantBackoff(5_000),
    });
    await policy.execute(() =>
      this.#updateQuoteStatus(quoteId, srcTxHash, status),
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
      if (
        now - entry.createdAt >
        QUOTE_STATUS_UPDATE_RETRY_MAX_LIFETIME_MS
      ) {
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

  readonly #updateQuoteStatus = async (
    quoteId: string,
    srcTxHash: string,
    newStatus: string,
  ): Promise<void> => {
    await this.#fetchFn(`${this.#apiBaseUrl}/quote/updateStatus`, {
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
    });
  };
}
