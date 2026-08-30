import { QuoteStatusState } from './constants.js';
import { QuoteStatusStateFsm } from './quote-status-state-fsm.js';
import {
  QuoteStatusEntryStoreOptions,
  QuoteStatusPersistEntry,
  QuoteStatusRuntimeEntry,
} from './types.js';

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
   * @returns The tracked entry (the existing one when the key is already
   * present, otherwise the newly created entry).
   */
  put(
    key: string,
    value: Omit<QuoteStatusRuntimeEntry, 'createdAt' | 'lastAttemptAt'>,
  ): QuoteStatusRuntimeEntry {
    // If an entry for this key is already in the queue
    // do not overwrite it. Re-enqueueing would reset state and
    // could cause duplicate SUBMITTED events.
    const existing = this.#items.get(key);
    if (existing) {
      if (!existing.txMetaId && value.txMetaId) {
        existing.txMetaId = value.txMetaId;
        this.#persistToState();
      }
      return existing;
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
    return entry;
  }

  /**
   * Returns an iterator over all tracked entries.
   *
   * Stale entries are transitioned to {@link QuoteStatusState.Expired} first (but
   * kept in the store), so the iterator reflects their up-to-date terminal state.
   *
   * @returns An iterator over the currently tracked entries.
   */
  values(): IterableIterator<QuoteStatusRuntimeEntry> {
    this.expireStaleEntries();
    return this.#items.values();
  }

  /**
   * Returns every tracked entry matching the provided quote identifier.
   *
   * Stale entries are transitioned to {@link QuoteStatusState.Expired} first so
   * callers observe their up-to-date terminal state.
   *
   * @param quoteId - Quote identifier to match.
   * @returns The matching entries (empty when none exist).
   */
  getByQuoteId(quoteId: string): QuoteStatusRuntimeEntry[] {
    this.expireStaleEntries();

    const matches: QuoteStatusRuntimeEntry[] = [];
    for (const entry of this.#items.values()) {
      if (entry.quoteId === quoteId) {
        matches.push(entry);
      }
    }

    return matches;
  }

  /**
   * Number of entries currently tracked by the store.
   *
   * Note that this includes terminal entries (`Completed`/`Expired`), which are
   * retained rather than evicted; call {@link expireStaleEntries} (or
   * {@link values}) first when an up-to-date view of entry states is required.
   *
   * @returns The count of tracked entries.
   */
  get size(): number {
    return this.#items.size;
  }

  /**
   * Looks up an entry by its transaction metadata identifier.
   *
   * If the matching entry has exceeded its TTL it is transitioned to
   * {@link QuoteStatusState.Expired} (but kept) before being returned.
   *
   * @param txMetaId - Transaction metadata identifier to search for.
   * @returns The matching entry, or `null` if none exists.
   */
  getByTxMetaId(txMetaId: string): QuoteStatusRuntimeEntry | null {
    for (const entry of this.#items.values()) {
      if (entry.txMetaId === txMetaId) {
        this.expireEntryIfStale(entry);
        return entry;
      }
    }

    return null;
  }

  /**
   * Looks up every entry sharing the given transaction metadata identifier.
   *
   * A single 7702/nested batch transaction submits multiple quotes under one
   * source tx hash and one `txMetaId`, producing several entries that must all
   * be finalized together. Each matching entry has its TTL checked (and is
   * transitioned to {@link QuoteStatusState.Expired} if stale) before being
   * returned.
   *
   * @param txMetaId - Transaction metadata identifier to search for.
   * @returns The matching entries (empty when none exist).
   */
  getAllByTxMetaId(txMetaId: string): QuoteStatusRuntimeEntry[] {
    const matches: QuoteStatusRuntimeEntry[] = [];
    for (const entry of this.#items.values()) {
      if (entry.txMetaId === txMetaId) {
        this.expireEntryIfStale(entry);
        matches.push(entry);
      }
    }

    return matches;
  }

  /**
   * Retrieves an entry by key.
   *
   * If the entry has exceeded its TTL it is transitioned to
   * {@link QuoteStatusState.Expired} (but kept) before being returned.
   *
   * @param key - Unique map key for the entry.
   * @returns The matching entry, or `null` if absent.
   */
  get(key: string): QuoteStatusRuntimeEntry | null {
    const entry = this.#items.get(key);
    if (!entry) {
      return null;
    }

    this.expireEntryIfStale(entry);
    return entry;
  }

  /**
   * Persists the current snapshot after an in-place mutation of a tracked entry.
   *
   * Used when fields such as `lastAttemptAt` are mutated directly on an entry
   * the caller already holds. No-ops if the entry is no longer tracked (e.g. the
   * store was cleared in the meantime), so persistence only reflects live entries.
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
   * Transitions every stale entry to {@link QuoteStatusState.Expired}, keeping it
   * in the store.
   *
   * Expired entries are retained so that later interactions with the same quote
   * (e.g. a duplicate `reportSubmitted`) can be recognized and rejected. Each
   * transition persists the updated snapshot via the entry's FSM subscription;
   * already-terminal entries cannot transition and are left untouched.
   */
  expireStaleEntries(): void {
    for (const entry of this.#items.values()) {
      if (this.entryHasExpired(entry)) {
        entry.status.transitionTo(QuoteStatusState.Expired);
      }
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
   * Transitions an entry to {@link QuoteStatusState.Expired} (keeping it) if it
   * has exceeded its TTL.
   *
   * The transition persists the updated snapshot via the entry's FSM
   * subscription. Already-terminal entries cannot transition and are left
   * untouched.
   *
   * @param entry - Entry to check and possibly expire.
   * @returns `true` if the entry was stale, otherwise `false`.
   */
  expireEntryIfStale(entry: QuoteStatusRuntimeEntry): boolean {
    if (this.entryHasExpired(entry)) {
      entry.status.transitionTo(QuoteStatusState.Expired);
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
