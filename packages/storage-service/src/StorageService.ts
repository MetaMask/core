import { InMemoryStorageAdapter } from './InMemoryStorageAdapter';
import type {
  StorageAdapter,
  StorageServiceMessenger,
  StorageServiceOptions,
} from './types';
import { SERVICE_NAME } from './types';

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'setItem',
  'getItem',
  'removeItem',
  'getAllKeys',
  'clear',
] as const;

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
 *     const result = await this.messenger.call(
 *       'StorageService:getItem',
 *       'SnapController',
 *       `${snapId}:sourceCode`,
 *     );
 *     return result as string | null; // Caller must validate/cast
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
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Store large data in storage.
   *
   * ⚠️ **Designed for large values (100KB+), not many small ones.**
   * Each storage operation has I/O overhead. For best performance,
   * store one large object rather than many small key-value pairs.
   *
   * @example Good: Store entire cache as one value
   * ```typescript
   * await service.setItem('TokenList', 'cache', { '0x1': [...], '0x38': [...] });
   * ```
   *
   * @example Avoid: Many small values
   * ```typescript
   * // ❌ Don't do this - too many small writes
   * await service.setItem('TokenList', 'cache:0x1', [...]);
   * await service.setItem('TokenList', 'cache:0x38', [...]);
   * ```
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   * @param key - Storage key (e.g., 'npm:@metamask/example-snap:sourceCode').
   * @param value - Data to store (should be 100KB+ for optimal use).
   */
  async setItem(namespace: string, key: string, value: unknown): Promise<void> {
    // Adapter handles serialization and wrapping with metadata
    await this.#storage.setItem(namespace, key, value);

    // Publish event so other controllers can react to changes
    // Event type: StorageService:itemSet:namespace
    // Payload: [value, key]
    this.#messenger.publish(
      `${SERVICE_NAME}:itemSet:${namespace}` as const,
      value,
      key,
    );
  }

  /**
   * Retrieve data from storage.
   *
   * Returns `unknown` since there's no schema validation.
   * Callers should validate or cast the result to the expected type.
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   * @param key - Storage key (e.g., 'npm:@metamask/example-snap:sourceCode').
   * @returns Parsed data or null if not found. Type is `unknown` - caller must validate.
   */
  async getItem(namespace: string, key: string): Promise<unknown> {
    // Adapter handles deserialization and unwrapping
    return await this.#storage.getItem(namespace, key);
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
   *
   * @param namespace - Controller namespace (e.g., 'SnapController').
   */
  async clear(namespace: string): Promise<void> {
    await this.#storage.clear(namespace);
  }
}
