import { QuoteStatusStateFsm } from './quote-status-state-fsm';
import {
  QuoteStatusEntryStoreOptions,
  QuoteStatusPersistEntry,
  QuoteStatusRuntimeEntry,
} from './types';

/**
 * In-memory store for quote status update entries.
 *
 * The store deduplicates entries by key, tracks timestamps used for retries and
 * TTL eviction, and persists a cloned snapshot on each mutating operation.
 */
export class QuoteStatusEntryStore {
  readonly #items: Map<string, QuoteStatusRuntimeEntry>;

  readonly #entryTtlMs: number;

  /**
   * Creates a deterministic key for persisted quote status entries.
   *
   * @param entry - Entry identity fields.
   * @param entry.quoteId - Quote identifier.
   * @param entry.srcTxHash - Source transaction hash.
   * @returns Stable key in `${quoteId}:${srcTxHash}` format.
   */
  static hash(
    entry: Pick<QuoteStatusPersistEntry, 'quoteId' | 'srcTxHash'>,
  ): string {
    return `${entry.quoteId}:${entry.srcTxHash}`;
  }

  readonly #onPersistUpdates: (
    updates: Record<string, QuoteStatusPersistEntry>,
  ) => void;

  /**
   * Creates a quote status entry store.
   *
   * @param options - Store dependencies and retention configuration.
   * @param options.onPersistUpdates - Callback invoked with cloned snapshot updates.
   * @param options.entryTtlMs - Entry time-to-live in milliseconds.
   * @param options.initial - Optional initial persisted entries used to seed the store.
   */
  constructor({
    onPersistUpdates,
    entryTtlMs,
    initial,
  }: QuoteStatusEntryStoreOptions) {
    this.#onPersistUpdates = onPersistUpdates;
    this.#entryTtlMs = entryTtlMs;
    this.#items = new Map(
      Object.entries(initial ?? {}).map(([key, entry]) => {
        const quoteStatusStateFsm = new QuoteStatusStateFsm(entry.status);

        return [
          key,
          // Entries from `initialDeferredUpdates` come from Immer-managed controller
          // state, which deep-freezes all nested objects. Cloning each entry here
          // ensures the in-memory queue holds mutable objects so that mutations
          // (e.g. updating `status` or `lastAttemptAt`) work correctly without
          // throwing a "read only property" error.
          { ...entry, status: quoteStatusStateFsm },
        ];
      }),
    );

    // Subscribe each seeded FSM after the map (and `#onPersistUpdates`) are set
    // so that any later state transition persists the updated snapshot.
    for (const entry of this.#items.values()) {
      this.#subscribeToStatusUpdates(entry);
    }
  }

  /**
   * Subscribes the entry's FSM so that every state transition persists the
   * current snapshot. Kept in one place so seeded and runtime-added entries
   * behave identically.
   *
   * @param entry - Entry whose FSM should trigger persistence on transition.
   */
  #subscribeToStatusUpdates(entry: QuoteStatusRuntimeEntry): void {
    entry.status.onStateUpdate(() => this.#persistToState());
  }

  /**
   * Adds a new entry when the key is not already present.
   *
   * If an entry already exists, only a missing `txMetaId` is backfilled to avoid
   * resetting timestamps and creating duplicate submission updates.
   *
   * @param key - Unique map key for the entry.
   * @param value - Entry payload without internal timestamps.
   * @param value.quoteId - Quote identifier.
   * @param value.srcTxHash - Source transaction hash.
   * @param value.status - Latest quote status.
   * @param value.txMetaId - Optional transaction metadata identifier.
   */
  put(
    key: string,
    value: Omit<QuoteStatusRuntimeEntry, 'createdAt' | 'lastAttemptAt'>,
  ): void {
    // If an entry for this key is already in the queue
    // do not overwrite it. Re-enqueueing would reset state and
    // could cause duplicate SUBMITTED events.
    const existing = this.#items.get(key);
    if (existing) {
      if (!existing.txMetaId && value.txMetaId) {
        existing.txMetaId = value.txMetaId;
        this.#persistToState();
      }
      return;
    }

    const now = Date.now();
    const entry: QuoteStatusRuntimeEntry = {
      ...value,
      createdAt: now,
      lastAttemptAt: now,
    };
    this.#items.set(key, entry);
    this.#subscribeToStatusUpdates(entry);
    this.#persistToState();
  }

  /**
   * Returns an iterator over all live entries.
   *
   * Expired entries are evicted first, so the iterator only yields entries that
   * are still within their TTL.
   *
   * @returns An iterator over the currently tracked, non-expired entries.
   */
  values(): IterableIterator<QuoteStatusRuntimeEntry> {
    this.removeExpiredEntries();
    return this.#items.values();
  }

  /**
   * Number of entries currently tracked by the store.
   *
   * Note that this may include entries that have exceeded their TTL but have
   * not yet been evicted; call {@link removeExpiredEntries} (or {@link values})
   * first when an accurate live count is required.
   *
   * @returns The count of tracked entries.
   */
  get size(): number {
    return this.#items.size;
  }

  /**
   * Looks up an entry by its transaction metadata identifier.
   *
   * If the matching entry has exceeded its TTL it is evicted and `null` is
   * returned instead.
   *
   * @param txMetaId - Transaction metadata identifier to search for.
   * @returns The matching live entry, or `null` if none exists or it expired.
   */
  getByTxMetaId(txMetaId: string): QuoteStatusRuntimeEntry | null {
    for (const entry of this.#items.values()) {
      if (entry.txMetaId === txMetaId) {
        const expired = this.removeEntryIfExpired(entry);
        return expired ? null : entry;
      }
    }

    return null;
  }

  /**
   * Retrieves an entry by key.
   *
   * If the entry has exceeded its TTL it is evicted and `null` is returned
   * instead.
   *
   * @param key - Unique map key for the entry.
   * @returns The matching live entry, or `null` if absent or expired.
   */
  get(key: string): QuoteStatusRuntimeEntry | null {
    const entry = this.#items.get(key);
    if (!entry) {
      return null;
    }

    return this.removeEntryIfExpired(entry) ? null : entry;
  }

  /**
   * Removes an entry by key and persists the updated snapshot.
   *
   * @param key - Unique map key for the entry to remove.
   */
  delete(key: string): void {
    if (this.#removeEntry(key)) {
      this.#persistToState();
    }
  }

  /**
   * Removes an entry by key and tears down its FSM listeners.
   *
   * Centralizes deletion so every removal path detaches the persistence
   * listener, preventing leaks and stale persist callbacks from FSMs the
   * caller may still hold a reference to.
   *
   * @param key - Unique map key for the entry to remove.
   * @returns `true` when an entry was present and removed, otherwise `false`.
   */
  #removeEntry(key: string): boolean {
    const entry = this.#items.get(key);
    if (!entry) {
      return false;
    }

    entry.status.removeAllListeners();
    this.#items.delete(key);
    return true;
  }

  /**
   * Persists the current snapshot after an in-place mutation of a tracked entry.
   *
   * Used when fields such as `lastAttemptAt` are mutated directly on an entry
   * the caller already holds. No-ops if the entry is no longer tracked (e.g. it
   * was evicted in the meantime), so persistence only reflects live entries.
   *
   * @param entry - The mutated entry to persist.
   */
  update(entry: QuoteStatusRuntimeEntry): void {
    if (!this.#items.has(QuoteStatusEntryStore.hash(entry))) {
      return;
    }

    this.#persistToState();
  }

  /**
   * Emits a cloned, serializable snapshot of all tracked entries via the
   * `onPersistUpdates` callback.
   *
   * Each entry's FSM is flattened to its plain `status` value so the snapshot
   * contains no class instances and is safe to store in controller state.
   */
  #persistToState(): void {
    const cloned: Record<string, QuoteStatusPersistEntry> = {};
    for (const [key, entry] of this.#items) {
      cloned[key] = { ...entry, status: entry.status.state };
    }
    this.#onPersistUpdates(cloned);
  }

  /**
   * Removes all entries whose age exceeds the configured TTL.
   *
   * This method batches removals and persists once at the end to avoid emitting
   * redundant state updates for each removed entry.
   */
  removeExpiredEntries(): void {
    let changed = false;

    for (const [key, entry] of this.#items) {
      if (this.entryHasExpired(entry)) {
        this.#removeEntry(key);
        changed = true;
      }
    }

    if (changed) {
      this.#persistToState();
    }
  }

  /**
   * Determines whether an entry has outlived the configured TTL.
   *
   * Expiry is measured from the entry's `createdAt` timestamp, not its last
   * attempt, so an entry's total lifetime is bounded regardless of retries.
   *
   * @param entry - Entry to check.
   * @returns `true` if the entry's age exceeds the TTL.
   */
  entryHasExpired(entry: QuoteStatusRuntimeEntry): boolean {
    const now = Date.now();
    return now - entry.createdAt > this.#entryTtlMs;
  }

  /**
   * Evicts an entry if it has exceeded its TTL, persisting the snapshot when it
   * does.
   *
   * @param entry - Entry to check and possibly remove.
   * @returns `true` if the entry was expired and removed, otherwise `false`.
   */
  removeEntryIfExpired(entry: QuoteStatusRuntimeEntry): boolean {
    if (this.entryHasExpired(entry)) {
      this.#removeEntry(QuoteStatusEntryStore.hash(entry));
      this.#persistToState();
      return true;
    }

    return false;
  }

  /**
   * Removes every entry from the store.
   *
   * Detaches each entry's FSM listeners before clearing to prevent leaks and
   * stale persist callbacks. Does not emit a persistence update; callers are
   * expected to use this during teardown.
   */
  clear(): void {
    for (const entry of this.#items.values()) {
      entry.status.removeAllListeners();
    }

    this.#items.clear();
  }
}
