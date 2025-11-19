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
  StorageServiceClearNamespaceAction,
  StorageServiceItemSetEvent,
  StorageServiceItemRemovedEvent,
} from './types';

// Export service name constant
export { SERVICE_NAME } from './types';

