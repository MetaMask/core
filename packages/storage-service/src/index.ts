// Export service class
export { StorageService } from './StorageService.js';

// Export adapters
export { InMemoryStorageAdapter } from './InMemoryStorageAdapter.js';

// Export types from types.ts
export type {
  InitialStorageData,
  StorageAdapter,
  StorageGetResult,
  StorageServiceOptions,
  StorageServiceActions,
  StorageServiceEvents,
  StorageServiceMessenger,
  StorageServiceItemSetEvent,
} from './types.js';

// Export individual action types from generated file
export type {
  StorageServiceSetItemAction,
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceGetAllKeysAction,
  StorageServiceClearAction,
} from './StorageService-method-action-types.js';

// Export service name and storage key prefix constants
export { SERVICE_NAME, STORAGE_KEY_PREFIX } from './types.js';
