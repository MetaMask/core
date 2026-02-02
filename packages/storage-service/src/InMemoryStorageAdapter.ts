import type { Json } from '@metamask/utils';

import type {
  InitialStorageData,
  StorageAdapter,
  StorageGetResult,
} from './types';
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
 * @example Basic usage
 * ```typescript
 * const adapter = new InMemoryStorageAdapter();
 * await adapter.setItem('SnapController', 'snap-id:sourceCode', 'const x = 1;');
 * const value = await adapter.getItem('SnapController', 'snap-id:sourceCode'); // 'const x = 1;'
 * // After restart: data is lost
 * ```
 *
 * @example Initialize with data (useful for testing)
 * ```typescript
 * const adapter = new InMemoryStorageAdapter({
 *   SnapController: {
 *     'snap-id:sourceCode': 'const x = 1;',
 *     'snap-id:manifest': { name: 'My Snap' },
 *   },
 *   TokenListController: {
 *     cache: { '0x1': ['token1', 'token2'] },
 *   },
 * });
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
   *
   * @param initialData - Optional initial data to populate the storage.
   * Useful for setting up test fixtures without calling setItem multiple times.
   */
  constructor(initialData?: InitialStorageData) {
    this.#storage = new Map();

    if (initialData) {
      for (const [namespace, items] of Object.entries(initialData)) {
        for (const [key, value] of Object.entries(items)) {
          const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
          this.#storage.set(fullKey, JSON.stringify(value));
        }
      }
    }
  }

  /**
   * Retrieve an item from in-memory storage.
   * Deserializes JSON data from storage.
   *
   * @param namespace - The controller namespace.
   * @param key - The data key.
   * @returns StorageGetResult: { result } if found, {} if not found, { error } on failure.
   */
  async getItem(namespace: string, key: string): Promise<StorageGetResult> {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const serialized = this.#storage.get(fullKey);

    // Key not found - return empty object
    if (serialized === undefined) {
      return {};
    }

    try {
      const result = JSON.parse(serialized);
      return { result };
    } catch (error) {
      console.error(`Failed to parse stored data for ${fullKey}:`, error);
      return { error: error as Error };
    }
  }

  /**
   * Store an item in in-memory storage.
   * Serializes JSON data to string.
   *
   * @param namespace - The controller namespace.
   * @param key - The data key.
   * @param value - The JSON value to store.
   */
  async setItem(namespace: string, key: string, value: Json): Promise<void> {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    this.#storage.set(fullKey, JSON.stringify(value));
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
