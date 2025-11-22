import type { StorageAdapter } from './types';
import { STORAGE_KEY_PREFIX } from './types';

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
  /**
   * Internal storage map.
   */
  #storage: Map<string, string>;

  /**
   * Constructs a new InMemoryStorageAdapter.
   */
  constructor() {
    this.#storage = new Map();
  }

  /**
   * Retrieve an item from in-memory storage.
   *
   * @param key - The storage key.
   * @returns The value as a string, or null if not found.
   */
  async getItem(key: string): Promise<string | null> {
    return this.#storage.get(key) ?? null;
  }

  /**
   * Store an item in in-memory storage.
   *
   * @param key - The storage key.
   * @param value - The string value to store.
   */
  async setItem(key: string, value: string): Promise<void> {
    this.#storage.set(key, value);
  }

  /**
   * Remove an item from in-memory storage.
   *
   * @param key - The storage key.
   */
  async removeItem(key: string): Promise<void> {
    this.#storage.delete(key);
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

