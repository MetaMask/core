import type { Hex } from '@metamask/utils';

/**
 * Token metadata for a single token
 */
export type TokenListToken = {
  name: string;
  symbol: string;
  decimals: number;
  address: string;
  occurrences: number;
  aggregators: string[];
  iconUrl: string;
};

/**
 * Map of token addresses to token metadata
 */
export type TokenListMap = Record<string, TokenListToken>;

/**
 * Cache entry containing token list data and timestamp
 */
type DataCache = {
  timestamp: number;
  data: TokenListMap;
};

/**
 * Cache structure mapping chain IDs to token lists
 */
export type TokensChainsCache = {
  [chainId: Hex]: DataCache;
};

/**
 * Service for managing token list cache outside of controller state
 * This provides in-memory token metadata storage without persisting to disk
 */
export class TokenCacheService {
  readonly #cache: Map<Hex, DataCache> = new Map();

  readonly #cacheThreshold: number;

  /**
   * Creates a new TokenCacheService instance
   *
   * @param cacheThreshold - Time in milliseconds before cache is considered stale (default: 24 hours)
   */
  constructor(cacheThreshold: number = 24 * 60 * 60 * 1000) {
    this.#cacheThreshold = cacheThreshold;
  }

  /**
   * Get cache entry for a specific chain
   *
   * @param chainId - Chain ID in hex format
   * @returns Cache entry with token list data and timestamp, or undefined if not cached
   */
  get(chainId: Hex): DataCache | undefined {
    return this.#cache.get(chainId);
  }

  /**
   * Set cache entry for a specific chain
   *
   * @param chainId - Chain ID in hex format
   * @param data - Token list data to cache
   * @param timestamp - Optional timestamp (defaults to current time)
   */
  set(chainId: Hex, data: TokenListMap, timestamp: number = Date.now()): void {
    this.#cache.set(chainId, { data, timestamp });
  }

  /**
   * Check if cache entry for a chain is still valid (not expired)
   *
   * @param chainId - Chain ID in hex format
   * @returns True if cache exists and is not expired
   */
  isValid(chainId: Hex): boolean {
    const entry = this.#cache.get(chainId);
    if (!entry) {
      return false;
    }
    return Date.now() - entry.timestamp < this.#cacheThreshold;
  }

  /**
   * Get all cached token lists across all chains
   *
   * @returns Complete cache structure with all chains
   */
  getAll(): TokensChainsCache {
    const result: TokensChainsCache = {};
    this.#cache.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Clear all cached token lists
   */
  clear(): void {
    this.#cache.clear();
  }

  /**
   * Remove cache entry for a specific chain
   *
   * @param chainId - Chain ID in hex format
   * @returns True if an entry was removed
   */
  delete(chainId: Hex): boolean {
    return this.#cache.delete(chainId);
  }

  /**
   * Get number of cached chains
   *
   * @returns Count of cached chains
   */
  get size(): number {
    return this.#cache.size;
  }
}
