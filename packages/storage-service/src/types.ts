import type { Messenger } from '@metamask/messenger';

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
   * @returns The value as a string, or null if not found.
   */
  getItem(namespace: string, key: string): Promise<unknown>;

  /**
   * Store a large value in storage.
   *
   * ⚠️ **Store large values, not many small ones.**
   * Each storage operation has I/O overhead. For best performance:
   * - Store one large object rather than many small key-value pairs
   * - Minimum recommended size: 100 KB per value
   *
   * Adapter is responsible for:
   * - Building the full storage key
   * - Wrapping value with metadata (timestamp, etc.)
   * - Serializing to string (JSON.stringify)
   *
   * @param namespace - The controller namespace (e.g., 'SnapController').
   * @param key - The data key (e.g., 'snap-id:sourceCode').
   * @param value - The value to store (will be wrapped and serialized by adapter).
   */
  setItem(namespace: string, key: string, value: unknown): Promise<void>;

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
 * Action for storing data in the storage service.
 */
export type StorageServiceSetItemAction = {
  type: `${typeof SERVICE_NAME}:setItem`;
  handler: <T>(namespace: string, key: string, value: T) => Promise<void>;
};

/**
 * Action for retrieving data from the storage service.
 */
export type StorageServiceGetItemAction = {
  type: `${typeof SERVICE_NAME}:getItem`;
  handler: <T>(namespace: string, key: string) => Promise<T | null>;
};

/**
 * Action for removing data from the storage service.
 */
export type StorageServiceRemoveItemAction = {
  type: `${typeof SERVICE_NAME}:removeItem`;
  handler: (namespace: string, key: string) => Promise<void>;
};

/**
 * Action for getting all keys for a namespace.
 */
export type StorageServiceGetAllKeysAction = {
  type: `${typeof SERVICE_NAME}:getAllKeys`;
  handler: (namespace: string) => Promise<string[]>;
};

/**
 * Action for clearing all data for a namespace.
 */
export type StorageServiceClearAction = {
  type: `${typeof SERVICE_NAME}:clear`;
  handler: (namespace: string) => Promise<void>;
};

/**
 * All actions that {@link StorageService} exposes to other consumers.
 */
export type StorageServiceActions =
  | StorageServiceSetItemAction
  | StorageServiceGetItemAction
  | StorageServiceRemoveItemAction
  | StorageServiceGetAllKeysAction
  | StorageServiceClearAction;

/**
 * Event published when a storage item is set.
 * Event type includes namespace only, key passed in payload.
 *
 * @example
 * Subscribe to all changes in TokenListController:
 * messenger.subscribe('StorageService:itemSet:TokenListController', (value, key) => {
 *   // value = the data that was set
 *   // key = 'cache:0x1', 'cache:0x38', etc.
 *   if (key.startsWith('cache:')) {
 *     const chainId = key.replace('cache:', '');
 *     // React to cache change for specific chain
 *   }
 * });
 */
export type StorageServiceItemSetEvent = {
  type: `${typeof SERVICE_NAME}:itemSet:${string}`;
  payload: [value: unknown, key: string];
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
