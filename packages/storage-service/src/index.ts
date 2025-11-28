// Export service class
export { StorageService } from './StorageService';

// Export adapters
export { InMemoryStorageAdapter } from './InMemoryStorageAdapter';

// Export types from types.ts
export type {
  StorageAdapter,
  StorageGetResult,
  StorageServiceOptions,
  StorageServiceActions,
  StorageServiceEvents,
  StorageServiceMessenger,
  StorageServiceItemSetEvent,
} from './types';

// Export individual action types from generated file
export type {
  StorageServiceSetItemAction,
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceGetAllKeysAction,
  StorageServiceClearAction,
} from './StorageService-method-action-types';

// Export service name and storage key prefix constants
export { SERVICE_NAME, STORAGE_KEY_PREFIX } from './types';
