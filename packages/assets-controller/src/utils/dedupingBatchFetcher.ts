/**
 * Executes the underlying batched fetch for a set of keys. Only keys that have
 * a value need to be present in the returned record; keys the source had no
 * data for are simply omitted (they are still marked fresh — see
 * {@link DedupingBatchFetcher.fetch}).
 *
 * @param keys - The keys to fetch (already filtered to stale, not-inflight keys).
 * @returns The fetched values keyed by key.
 */
export type BatchFetchFn<Key extends string, Value> = (
  keys: Key[],
) => Promise<Record<Key, Value>>;

export type DedupingBatchFetcherOptions<Key extends string, Value> = {
  /** Performs the actual batched fetch for stale, not-inflight keys. */
  fetchBatch: BatchFetchFn<Key, Value>;
  /**
   * Minimum age (ms) before a key is considered stale and re-fetched. Keys
   * fetched more recently than this are skipped entirely.
   */
  freshnessTtlMs: number;
};

/**
 * Deduplicates batched fetches by key across two dimensions:
 *
 * 1. **Freshness TTL** — keys fetched within `freshnessTtlMs` are skipped
 *    entirely. Note the freshness window only starts once a fetch *completes*,
 *    so it does not cover requests that are still in flight.
 * 2. **Inflight coalescing** — if a fetch is already in progress for a key,
 *    concurrent callers join the existing promise instead of issuing a new
 *    request. This covers the request-in-flight window the freshness TTL
 *    structurally cannot.
 *
 * Both layers are per-key, so a call for a partially-overlapping set of keys
 * reuses the fresh/inflight keys and only fetches the genuinely-missing ones.
 *
 * The fetch is batched: all stale, not-inflight keys from a single `fetch()`
 * call are passed to `fetchBatch` together, then split into per-key results so
 * each key can be joined independently.
 */
export class DedupingBatchFetcher<Key extends string, Value> {
  readonly #fetchBatch: BatchFetchFn<Key, Value>;

  #freshnessTtlMs: number;

  /** Tracks the last successful fetch time per key (freshness gating). */
  readonly #fetchedAt = new Map<Key, number>();

  /**
   * Per-key inflight fetch promises. Each resolves to the value, or `undefined`
   * if the batch failed or returned no data for that key.
   */
  readonly #inflight = new Map<Key, Promise<Value | undefined>>();

  constructor(options: DedupingBatchFetcherOptions<Key, Value>) {
    this.#fetchBatch = options.fetchBatch;
    this.#freshnessTtlMs = options.freshnessTtlMs;
  }

  /**
   * Minimum age (ms) before a key is re-fetched.
   *
   * @returns The current freshness TTL in milliseconds.
   */
  get freshnessTtlMs(): number {
    return this.#freshnessTtlMs;
  }

  set freshnessTtlMs(ms: number) {
    this.#freshnessTtlMs = ms;
  }

  /**
   * Fetch values for the given keys, deduplicating against fresh and inflight
   * fetches.
   *
   * @param keys - The keys to fetch.
   * @returns Values keyed by key. Only contains entries for keys that were
   * actually fetched (or joined from inflight) and had a value.
   */
  async fetch(keys: Key[]): Promise<Record<Key, Value>> {
    const { staleKeys, inflightKeys } = this.#partition(keys);

    if (staleKeys.length === 0 && inflightKeys.length === 0) {
      return {} as Record<Key, Value>;
    }

    // Start a fetch for stale keys and join any fetches already in progress.
    const batchPromise =
      staleKeys.length > 0 ? this.#startBatchFetch(staleKeys) : undefined;
    const values = await this.#joinInflight(inflightKeys);

    if (batchPromise) {
      Object.assign(values, await batchPromise);
    }

    return values;
  }

  /**
   * Clear the freshness cache, forcing the next fetch to re-request every key
   * regardless of TTL. Does not affect inflight fetches.
   */
  invalidate(): void {
    this.#fetchedAt.clear();
  }

  /**
   * Clear freshness for specific keys only, forcing the next fetch to
   * re-request those keys regardless of TTL. Does not affect inflight fetches.
   *
   * @param keys - Keys to mark stale.
   */
  invalidateKeys(keys: Key[]): void {
    for (const key of keys) {
      this.#fetchedAt.delete(key);
    }
  }

  /** Clear all freshness and inflight state. */
  destroy(): void {
    this.#fetchedAt.clear();
    this.#inflight.clear();
  }

  /**
   * Split keys into those that need a fresh fetch and those already being
   * fetched by another caller. Keys still within the freshness TTL are dropped.
   *
   * @param keys - The keys to classify.
   * @returns `staleKeys` (need fetching) and `inflightKeys` (join existing fetch).
   */
  #partition(keys: Key[]): { staleKeys: Key[]; inflightKeys: Key[] } {
    const now = Date.now();
    const staleKeys: Key[] = [];
    const inflightKeys: Key[] = [];

    for (const key of keys) {
      if (this.#isFresh(key, now)) {
        continue;
      }
      if (this.#inflight.has(key)) {
        inflightKeys.push(key);
      } else {
        staleKeys.push(key);
      }
    }

    return { staleKeys, inflightKeys };
  }

  /**
   * Returns true if the key's last fetch is still within the freshness TTL.
   *
   * @param key - The key to check.
   * @param now - Current timestamp (avoids repeated clock reads).
   * @returns True if the key was fetched within the freshness TTL.
   */
  #isFresh(key: Key, now: number): boolean {
    const fetchedAt = this.#fetchedAt.get(key);
    return fetchedAt !== undefined && now - fetchedAt < this.#freshnessTtlMs;
  }

  /**
   * Launch a batch fetch and register a per-key inflight promise for each key
   * so concurrent callers can join. On success, all requested keys are marked
   * fresh — including keys the source returned no value for, since the absence
   * of a value is itself a valid answer that should not be re-asked until the
   * TTL expires. A failed batch leaves keys stale so they are retried.
   *
   * @param staleKeys - Keys to fetch (none of which are already inflight).
   * @returns The batch fetch promise.
   */
  #startBatchFetch(staleKeys: Key[]): Promise<Record<Key, Value>> {
    const batchPromise = this.#fetchBatch(staleKeys).then((values) => {
      const fetchedAt = Date.now();
      for (const key of staleKeys) {
        this.#fetchedAt.set(key, fetchedAt);
      }
      return values;
    });

    for (const key of staleKeys) {
      const perKey = batchPromise.then(
        (values) => values[key],
        () => undefined,
      );
      this.#inflight.set(key, perKey);
    }

    // Clean up inflight entries once the batch settles (success or failure).
    // Rejection is already surfaced to the caller via the returned batchPromise.
    batchPromise
      .finally(() => {
        for (const key of staleKeys) {
          this.#inflight.delete(key);
        }
      })
      .catch(() => undefined);

    return batchPromise;
  }

  /**
   * Join the inflight fetches for the given keys and collect their values. Keys
   * whose inflight fetch produced no value are omitted.
   *
   * @param inflightKeys - Keys whose fetches are already in progress.
   * @returns Values keyed by key.
   */
  async #joinInflight(inflightKeys: Key[]): Promise<Record<Key, Value>> {
    const values = {} as Record<Key, Value>;

    const results = await Promise.all(
      inflightKeys.map(async (key) => {
        const value = await this.#inflight.get(key);
        return [key, value] as const;
      }),
    );

    for (const [key, value] of results) {
      if (value !== undefined) {
        values[key] = value;
      }
    }

    return values;
  }
}
