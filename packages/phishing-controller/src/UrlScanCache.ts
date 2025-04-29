import type { PhishingDetectionScanResult } from './types';
import { fetchTimeNow } from './utils';

/**
 * Cache entry for URL scan results
 */
export type UrlScanCacheEntry = {
  result: PhishingDetectionScanResult;
  timestamp: number;
};

/**
 * Default values for URL scan cache
 */
export const DEFAULT_URL_SCAN_CACHE_TTL = 300; // 5 minutes in seconds
export const DEFAULT_URL_SCAN_CACHE_MAX_SIZE = 100;

/**
 * UrlScanCache class
 *
 * Handles caching of URL scan results with TTL and size limits
 */
export class UrlScanCache {
  #cacheTTL: number;

  #maxCacheSize: number;

  readonly #cache: Map<string, UrlScanCacheEntry>;

  readonly #updateState: (cache: Record<string, UrlScanCacheEntry>) => void;

  /**
   * Constructor for UrlScanCache
   *
   * @param options - Cache configuration options
   * @param options.cacheTTL - Time to live in seconds for cached entries
   * @param options.maxCacheSize - Maximum number of entries in the cache
   * @param options.initialCache - Initial cache state
   * @param options.updateState - Function to update the state when cache changes
   */
  constructor({
    cacheTTL = DEFAULT_URL_SCAN_CACHE_TTL,
    maxCacheSize = DEFAULT_URL_SCAN_CACHE_MAX_SIZE,
    initialCache = {},
    updateState,
  }: {
    cacheTTL?: number;
    maxCacheSize?: number;
    initialCache?: Record<string, UrlScanCacheEntry>;
    updateState: (cache: Record<string, UrlScanCacheEntry>) => void;
  }) {
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
   * Set the maximum cache size
   *
   * @param maxSize - The maximum cache size
   */
  setMaxSize(maxSize: number): void {
    this.#maxCacheSize = maxSize;
    this.#evictEntries();
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
   * @param hostname - The hostname to check
   * @returns The cached scan result or undefined if not found or expired
   */
  get(hostname: string): PhishingDetectionScanResult | undefined {
    const cacheEntry = this.#cache.get(hostname);
    if (!cacheEntry) {
      return undefined;
    }

    // Check if the entry is expired
    const now = fetchTimeNow();
    if (now - cacheEntry.timestamp > this.#cacheTTL) {
      // Entry expired, remove it from cache
      this.#cache.delete(hostname);
      this.#persistCache();
      return undefined;
    }

    return cacheEntry.result;
  }

  /**
   * Add an entry to the cache, evicting oldest entries if necessary
   *
   * @param hostname - The hostname to cache
   * @param result - The scan result to cache
   */
  add(hostname: string, result: PhishingDetectionScanResult): void {
    this.#cache.set(hostname, {
      result,
      timestamp: fetchTimeNow(),
    });

    this.#evictEntries();

    this.#persistCache();
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
    // Delete the oldest entries
    for (const key of this.#cache.keys()) {
      if (count >= entriesToRemove) {
        break;
      }
      this.#cache.delete(key);
      count += 1;
    }
  }
}
