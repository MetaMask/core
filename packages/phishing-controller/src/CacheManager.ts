import { fetchTimeNow } from './utils';

/**
 * Generic cache entry type that wraps the data with a timestamp
 */
export type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

/**
 * Configuration options for CacheManager
 */
export type CacheManagerOptions<T> = {
  cacheTTL?: number;
  maxCacheSize?: number;
  initialCache?: Record<string, CacheEntry<T>>;
  updateState: (cache: Record<string, CacheEntry<T>>) => void;
};

/**
 * Generic cache manager with TTL and size limit support
 *
 * @template T - The type of data to cache
 */
export class CacheManager<T> {
  #cacheTTL: number;

  #maxCacheSize: number;

  readonly #cache: Map<string, CacheEntry<T>>;

  readonly #updateState: (cache: Record<string, CacheEntry<T>>) => void;

  /**
   * Constructor for CacheManager
   *
   * @param options - Cache configuration options
   * @param options.cacheTTL - Time to live in seconds for cached entries
   * @param options.maxCacheSize - Maximum number of entries in the cache
   * @param options.initialCache - Initial cache state
   * @param options.updateState - Function to update the state when cache changes
   */
  constructor({
    cacheTTL = 300, // 5 minutes default
    maxCacheSize = 100,
    initialCache = {},
    updateState,
  }: CacheManagerOptions<T>) {
    this.#cacheTTL = cacheTTL;
    this.#maxCacheSize = maxCacheSize;
    this.#cache = new Map(Object.entries(initialCache));
    this.#updateState = updateState;
    this.#evictEntries();
  }

  /**
   * Set the time-to-live for cached entries
   *
   * @param ttl - The TTL in seconds
   */
  setTTL(ttl: number): void {
    this.#cacheTTL = ttl;
  }

  /**
   * Get the current TTL setting
   *
   * @returns The TTL in seconds
   */
  getTTL(): number {
    return this.#cacheTTL;
  }

  /**
   * Set the maximum cache size
   *
   * @param maxSize - The maximum cache size
   */
  setMaxSize(maxSize: number): void {
    this.#maxCacheSize = maxSize;
    this.#evictEntries();
  }

  /**
   * Get the current maximum cache size
   *
   * @returns The maximum cache size
   */
  getMaxSize(): number {
    return this.#maxCacheSize;
  }

  /**
   * Get the current cache size
   *
   * @returns The current number of entries in the cache
   */
  getSize(): number {
    return this.#cache.size;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.#cache.clear();
    this.#persistCache();
  }

  /**
   * Get a cached result if it exists and is not expired
   *
   * @param key - The cache key
   * @returns The cached data or undefined if not found or expired
   */
  get(key: string): T | undefined {
    const cacheEntry = this.#cache.get(key);
    if (!cacheEntry) {
      return undefined;
    }

    // Check if the entry is expired
    const now = fetchTimeNow();
    if (now - cacheEntry.timestamp > this.#cacheTTL) {
      // Entry expired, remove it from cache
      this.#cache.delete(key);
      this.#persistCache();
      return undefined;
    }

    return cacheEntry.data;
  }

  /**
   * Add an entry to the cache, evicting oldest entries if necessary
   *
   * @param key - The cache key
   * @param data - The data to cache
   */
  set(key: string, data: T): void {
    this.#cache.set(key, {
      data,
      timestamp: fetchTimeNow(),
    });

    this.#evictEntries();
    this.#persistCache();
  }

  /**
   * Check if a key exists in the cache (regardless of expiration)
   *
   * @param key - The cache key
   * @returns True if the key exists
   */
  has(key: string): boolean {
    return this.#cache.has(key);
  }

  /**
   * Delete a specific entry from the cache
   *
   * @param key - The cache key
   * @returns True if an entry was deleted
   */
  delete(key: string): boolean {
    const result = this.#cache.delete(key);
    if (result) {
      this.#persistCache();
    }
    return result;
  }

  /**
   * Get all keys in the cache
   *
   * @returns Array of cache keys
   */
  keys(): string[] {
    return Array.from(this.#cache.keys());
  }

  /**
   * Get all entries in the cache (including expired ones)
   * Useful for debugging or persistence
   *
   * @returns Record of all cache entries
   */
  getAllEntries(): Record<string, CacheEntry<T>> {
    return Object.fromEntries(this.#cache);
  }

  /**
   * Persist the current cache state
   */
  #persistCache(): void {
    this.#updateState(Object.fromEntries(this.#cache));
  }

  /**
   * Evict oldest entries if cache exceeds max size
   */
  #evictEntries(): void {
    if (this.#cache.size <= this.#maxCacheSize) {
      return;
    }

    const entriesToRemove = this.#cache.size - this.#maxCacheSize;
    let count = 0;
    // Delete the oldest entries (Map maintains insertion order)
    for (const key of this.#cache.keys()) {
      if (count >= entriesToRemove) {
        break;
      }
      this.#cache.delete(key);
      count += 1;
    }
  }
}
