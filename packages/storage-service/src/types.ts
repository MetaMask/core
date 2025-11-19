import type { Messenger } from '@metamask/messenger';

/**
 * Platform-agnostic storage adapter interface.
 * Each client (mobile, extension) implements this interface
 * with their preferred storage mechanism.
 *
 * @example Mobile implementation using FilesystemStorage
 * @example Extension implementation using IndexedDB
 * @example Tests using InMemoryStorageAdapter
 */
export interface StorageAdapter {
  /**
   * Retrieve an item from storage.
   *
   * @param key - The storage key.
   * @returns The value as a string, or null if not found.
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Store an item in storage.
   *
   * @param key - The storage key.
   * @param value - The string value to store.
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Remove an item from storage.
   *
   * @param key - The storage key.
   */
  removeItem(key: string): Promise<void>;

  /**
   * Get all keys in storage (optional).
   * If not implemented, the service will maintain its own registry.
   *
   * @returns Array of all keys in storage.
   */
  getAllKeys?(): Promise<string[]>;

  /**
   * Clear all items in storage (optional).
   * Not typically used - prefer clearNamespace for scoped clearing.
   */
  clear?(): Promise<void>;
}

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
export type StorageServiceClearNamespaceAction = {
  type: `${typeof SERVICE_NAME}:clearNamespace`;
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
  | StorageServiceClearNamespaceAction;

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
 * Event published when a storage item is removed.
 * Event type includes namespace only, key passed in payload.
 */
export type StorageServiceItemRemovedEvent = {
  type: `${typeof SERVICE_NAME}:itemRemoved:${string}`;
  payload: [key: string];
};

/**
 * All events that {@link StorageService} publishes.
 */
export type StorageServiceEvents =
  | StorageServiceItemSetEvent
  | StorageServiceItemRemovedEvent;

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

