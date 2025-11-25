import type { StorageAdapter } from './types';
import { STORAGE_KEY_PREFIX } from './types';

/**
 * Wrapper for stored data with metadata.
 * Each adapter can define its own wrapper structure.
 */
type StoredDataWrapper<T = unknown> = {
  /** Timestamp when data was stored (milliseconds since epoch). */
  timestamp: number;
  /** The actual data being stored. */
  data: T;
};

/**
 * In-memory storage adapter (default fallback).
 * Implements the {@link StorageAdapter} interface using a Map.
 *
 * ⚠️ **Warning**: Data is NOT persisted - lost on restart.
 *
 * **Suitable for:**
 * - Testing (isolated, no mocking needed)
 * - Development (quick start, zero config)
 * - Temporary/ephemeral data
 *
 * **Not suitable for:**
 * - Production (unless data is truly ephemeral)
 * - Data that needs to persist across restarts
 *
 * @example
 * ```typescript
 * const adapter = new InMemoryStorageAdapter();
 * await adapter.setItem('key', 'value');
 * const value = await adapter.getItem('key'); // Returns 'value'
 * // After restart: data is lost
 * ```
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  // Explicitly implement StorageAdapter interface
  /**
   * Internal storage map.
   */
  readonly #storage: Map<string, string>;

  /**
   * Constructs a new InMemoryStorageAdapter.
   */
  constructor() {
    this.#storage = new Map();
  }

  /**
   * Retrieve an item from in-memory storage.
   * Deserializes and unwraps the stored data.
   *
   * @param namespace - The controller namespace.
   * @param key - The data key.
   * @returns The unwrapped data, or null if not found.
   */
  async getItem(namespace: string, key: string): Promise<unknown> {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const serialized = this.#storage.get(fullKey);

    if (!serialized) {
      return null;
    }

    try {
      const wrapper: StoredDataWrapper = JSON.parse(serialized);
      return wrapper.data;
    } catch (error) {
      // istanbul ignore next - defensive error handling for corrupted data
      console.error(`Failed to parse stored data for ${fullKey}:`, error);
      // istanbul ignore next
      return null;
    }
  }

  /**
   * Store an item in in-memory storage.
   * Wraps with metadata and serializes to string.
   *
   * @param namespace - The controller namespace.
   * @param key - The data key.
   * @param value - The value to store (will be wrapped and serialized).
   */
  async setItem(namespace: string, key: string, value: unknown): Promise<void> {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const wrapper: StoredDataWrapper = {
      timestamp: Date.now(),
      data: value,
    };
    this.#storage.set(fullKey, JSON.stringify(wrapper));
  }

  /**
   * Remove an item from in-memory storage.
   *
   * @param namespace - The controller namespace.
   * @param key - The data key.
   */
  async removeItem(namespace: string, key: string): Promise<void> {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    this.#storage.delete(fullKey);
  }

  /**
   * Get all keys for a namespace.
   * Returns keys without the 'storage:namespace:' prefix.
   *
   * @param namespace - The namespace to get keys for.
   * @returns Array of keys (without prefix) for this namespace.
   */
  async getAllKeys(namespace: string): Promise<string[]> {
    const prefix = `${STORAGE_KEY_PREFIX}${namespace}:`;
    return Array.from(this.#storage.keys())
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
  }

  /**
   * Clear all items for a namespace.
   *
   * @param namespace - The namespace to clear.
   */
  async clear(namespace: string): Promise<void> {
    const prefix = `${STORAGE_KEY_PREFIX}${namespace}:`;
    const keysToDelete = Array.from(this.#storage.keys()).filter((key) =>
      key.startsWith(prefix),
    );
    keysToDelete.forEach((key) => this.#storage.delete(key));
  }
}
