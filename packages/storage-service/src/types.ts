import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import type { StorageServiceMethodActions } from './StorageService-method-action-types';

/**
 * Platform-agnostic storage adapter interface.
 * Each client (mobile, extension) implements this interface
 * with their preferred storage mechanism.
 *
 * ⚠️ **Designed for large, infrequently accessed data (100KB+)**
 *
 * ✅ **Use for:**
 * - Snap source code (~6 MB per snap)
 * - Token metadata caches (~4 MB)
 * - Large API response caches
 *
 * ❌ **Avoid for:**
 * - Small values (< 10 KB) - use controller state instead
 * - Frequently accessed data - use controller state instead
 * - Many small key-value pairs - use a single large object instead
 *
 * @example Mobile implementation using FilesystemStorage
 * @example Extension implementation using IndexedDB
 * @example Tests using InMemoryStorageAdapter
 */
export type StorageAdapter = {
  /**
   * Retrieve an item from storage.
   * Adapter is responsible for building the full storage key.
   *
   * @param namespace - The controller namespace (e.g., 'SnapController').
   * @param key - The data key (e.g., 'snap-id:sourceCode').
   * @returns The JSON value, or null if not found.
   */
  getItem(namespace: string, key: string): Promise<Json | null>;

  /**
   * Store a large JSON value in storage.
   *
   * ⚠️ **Store large values, not many small ones.**
   * Each storage operation has I/O overhead. For best performance:
   * - Store one large object rather than many small key-value pairs
   * - Minimum recommended size: 100 KB per value
   *
   * Adapter is responsible for:
   * - Building the full storage key
   * - Serializing to string (JSON.stringify)
   *
   * @param namespace - The controller namespace (e.g., 'SnapController').
   * @param key - The data key (e.g., 'snap-id:sourceCode').
   * @param value - The JSON value to store.
   */
  setItem(namespace: string, key: string, value: Json): Promise<void>;

  /**
   * Remove an item from storage.
   * Adapter is responsible for building the full storage key.
   *
   * @param namespace - The controller namespace (e.g., 'SnapController').
   * @param key - The data key (e.g., 'snap-id:sourceCode').
   */
  removeItem(namespace: string, key: string): Promise<void>;

  /**
   * Get all keys for a specific namespace.
   * Should return keys without the 'storage:namespace:' prefix.
   *
   * Adapter is responsible for:
   * - Filtering keys by prefix: 'storage:{namespace}:'
   * - Stripping the prefix from returned keys
   * - Returning only the key portion after the prefix
   *
   * @param namespace - The namespace to get keys for (e.g., 'SnapController').
   * @returns Array of keys without prefix (e.g., ['snap1:sourceCode', 'snap2:sourceCode']).
   */
  getAllKeys(namespace: string): Promise<string[]>;

  /**
   * Clear all items for a specific namespace.
   *
   * Adapter is responsible for:
   * - Finding all keys with prefix: 'storageService:{namespace}:'
   * - Removing all matching keys
   *
   * @param namespace - The namespace to clear (e.g., 'SnapController').
   */
  clear(namespace: string): Promise<void>;
};

/**
 * Options for constructing a {@link StorageService}.
 */
export type StorageServiceOptions = {
  /**
   * The messenger suited for this service.
   */
  messenger: StorageServiceMessenger;

  /**
   * Storage adapter for persisting data.
   * If not provided, uses in-memory storage (data lost on restart).
   * Production clients MUST provide a persistent storage adapter.
   */
  storage?: StorageAdapter;
};

// Service name constant
export const SERVICE_NAME = 'StorageService';

/**
 * Storage key prefix for all keys managed by StorageService.
 * Keys are formatted as: {STORAGE_KEY_PREFIX}{namespace}:{key}
 * Example: 'storageService:SnapController:snap-id:sourceCode'
 */
export const STORAGE_KEY_PREFIX = 'storageService:';

/**
 * All actions that {@link StorageService} exposes to other consumers.
 * Action types are auto-generated from the service methods.
 */
export type StorageServiceActions = StorageServiceMethodActions;

/**
 * Event published when a storage item is set.
 * Event type includes namespace only, key passed in payload.
 *
 * @example
 * Subscribe to all changes in TokenListController:
 * messenger.subscribe('StorageService:itemSet:TokenListController', (key, value) => {
 *   // key = 'cache:0x1', 'cache:0x38', etc.
 *   // value = the data that was set
 *   if (key.startsWith('cache:')) {
 *     const chainId = key.replace('cache:', '');
 *     // React to cache change for specific chain
 *   }
 * });
 */
export type StorageServiceItemSetEvent = {
  type: `${typeof SERVICE_NAME}:itemSet:${string}`;
  payload: [key: string, value: Json];
};

/**
 * All events that {@link StorageService} publishes.
 */
export type StorageServiceEvents = StorageServiceItemSetEvent;

/**
 * Actions from other messengers that {@link StorageService} calls.
 */
type AllowedActions = never;

/**
 * Events from other messengers that {@link StorageService} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events that
 * {@link StorageService} needs to access.
 */
export type StorageServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  StorageServiceActions | AllowedActions,
  StorageServiceEvents | AllowedEvents
>;
