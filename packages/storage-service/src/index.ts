// Export service class
export { StorageService } from './StorageService';

// Export adapters
export { InMemoryStorageAdapter } from './InMemoryStorageAdapter';

// Export types
export type {
  StorageAdapter,
  StorageServiceOptions,
  StorageServiceActions,
  StorageServiceEvents,
  StorageServiceMessenger,
  StorageServiceSetItemAction,
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceGetAllKeysAction,
  StorageServiceClearAction,
  StorageServiceItemSetEvent,
} from './types';

// Export service name and storage key prefix constants
export { SERVICE_NAME, STORAGE_KEY_PREFIX } from './types';
