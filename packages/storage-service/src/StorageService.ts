import { InMemoryStorageAdapter } from './InMemoryStorageAdapter';
import type {
  StorageAdapter,
  StorageServiceMessenger,
  StorageServiceOptions,
} from './types';
import { SERVICE_NAME } from './types';

/**
 * StorageService provides a platform-agnostic way for controllers to store
 * large, infrequently accessed data outside of memory/Redux state.
 *
 * **Use cases:**
 * - Snap source code (6+ MB that's rarely accessed)
 * - Token metadata caches (4+ MB of cached data)
 * - Large cached responses from APIs
 * - Any data > 100 KB that's not frequently accessed
 *
 * **Benefits:**
 * - Reduces memory usage (data stays on disk)
 * - Faster Redux persist (less data to serialize)
 * - Faster app startup (less data to parse)
 * - Lazy loading (data loaded only when needed)
 *
 * **Platform Support:**
 * - Mobile: FilesystemStorage adapter
 * - Extension: IndexedDB adapter
 * - Tests/Dev: InMemoryStorageAdapter (default)
 *
 * @example Using the service via messenger
 *
 * ```typescript
 * // In a controller
 * type AllowedActions =
 *   | StorageServiceSetItemAction
 *   | StorageServiceGetItemAction;
 *
 * class SnapController extends BaseController {
 *   async storeSnapSourceCode(snapId: string, sourceCode: string) {
 *     await this.messenger.call(
 *       'StorageService:setItem',
 *       'SnapController',
 *       `${snapId}:sourceCode`,
 *       sourceCode,
 *     );
 *   }
 *
 *   async getSnapSourceCode(snapId: string): Promise<string | null> {
 *     return await this.messenger.call(
 *       'StorageService:getItem',
 *       'SnapController',
 *       `${snapId}:sourceCode`,
 *     );
 *   }
 * }
 * ```
 *
 * @example Initializing in a client
 *
 * ```typescript
 * // Mobile
 * const service = new StorageService({
 *   messenger: storageServiceMessenger,
 *   storage: filesystemStorageAdapter, // Platform-specific
 * });
 *
 * // Extension
 * const service = new StorageService({
 *   messenger: storageServiceMessenger,
 *   storage: indexedDBAdapter, // Platform-specific
 * });
 *
 * // Tests (uses in-memory by default)
 * const service = new StorageService({
 *   messenger: storageServiceMessenger,
 *   // No storage - uses InMemoryStorageAdapter
 * });
 * ```
 */
export class StorageService {
  /**
   * The name of the service.
   */
  readonly name: typeof SERVICE_NAME;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: StorageServiceMessenger;

  /**
   * The storage adapter for persisting data.
   */
  readonly #storage: StorageAdapter;

  /**
   * Constructs a new StorageService.
   *
   * @param options - The options.
   * @param options.messenger - The messenger suited for this service.
   * @param options.storage - Storage adapter for persisting data.
   * If not provided, uses InMemoryStorageAdapter (data lost on restart).
   */
  constructor({ messenger, storage }: StorageServiceOptions) {
    this.name = SERVICE_NAME;
    this.#messenger = messenger;
    this.#storage = storage ?? new InMemoryStorageAdapter();

    // Warn if using in-memory storage (data won't persist)
    if (!storage) {
      console.warn(
        `${SERVICE_NAME}: No storage adapter provided. Using in-memory storage. ` +
          'Data will be lost on restart. Provide a storage adapter for persistence.',
      );
    }

    // Register messenger actions
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:setItem`,
      this.setItem.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getItem`,
      this.getItem.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:removeItem`,
      this.removeItem.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getAllKeys`,
      this.getAllKeys.bind(this),
    );
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:clear`,
      this.clear.bind(this),
    );
  }

  /**
   * Store data in storage.
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   * @param key - Storage key (e.g., 'npm:@metamask/example-snap:sourceCode').
   * @param value - Data to store (will be JSON stringified).
   * @template T - The type of the value being stored.
   */
  async setItem<T>(namespace: string, key: string, value: T): Promise<void> {
    // Adapter handles serialization and wrapping with metadata
    await this.#storage.setItem(namespace, key, value as never);

    // Publish event so other controllers can react to changes
    // Event type: StorageService:itemSet:namespace
    // Payload: [value, key]
    this.#messenger.publish(
      `${SERVICE_NAME}:itemSet:${namespace}` as `${typeof SERVICE_NAME}:itemSet:${string}`,
      value,
      key,
    );
  }

  /**
   * Retrieve data from storage.
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   * @param key - Storage key (e.g., 'npm:@metamask/example-snap:sourceCode').
   * @returns Parsed data or null if not found.
   * @template T - The type of the value being retrieved.
   */
  async getItem<T>(namespace: string, key: string): Promise<T | null> {
    // Adapter handles deserialization and unwrapping
    const result = await this.#storage.getItem(namespace, key);
    return result as T | null;
  }

  /**
   * Remove data from storage.
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   * @param key - Storage key (e.g., 'npm:@metamask/example-snap:sourceCode').
   */
  async removeItem(namespace: string, key: string): Promise<void> {
    // Adapter builds full storage key (e.g., mobile: 'storageService:namespace:key')
    await this.#storage.removeItem(namespace, key);

    // Publish event so other controllers can react to removal
    // Event type: StorageService:itemRemoved:namespace
    // Payload: [key]
    this.#messenger.publish(
      `${SERVICE_NAME}:itemRemoved:${namespace}` as `${typeof SERVICE_NAME}:itemRemoved:${string}`,
      key,
    );
  }

  /**
   * Get all keys for a namespace.
   * Delegates to storage adapter which handles filtering.
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   * @returns Array of keys (without prefix) for this namespace.
   */
  async getAllKeys(namespace: string): Promise<string[]> {
    return await this.#storage.getAllKeys(namespace);
  }

  /**
   * Clear all data for a namespace.
   * Delegates to storage adapter which handles clearing.
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   */
  async clear(namespace: string): Promise<void> {
    await this.#storage.clear(namespace);
  }
}
