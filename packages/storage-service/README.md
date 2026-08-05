# `@metamask/storage-service`

A platform-agnostic service for storing large, infrequently accessed controller data outside of memory.

## When to Use

✅ **Use StorageService for:**

- Large data (> 100 KB)
- Infrequently accessed data
- Data that doesn't need to be in Redux state
- Examples: Snap source code, cached API responses

❌ **Don't use for:**

- Frequently accessed data (use controller state)
- Small data (< 10 KB - overhead not worth it)
- Data needed for UI rendering

## Installation

`yarn add @metamask/storage-service`

or

`npm install @metamask/storage-service`

## Usage

### Controller Setup

```typescript
import type {
  StorageServiceSetItemAction,
  StorageServiceGetItemAction,
} from '@metamask/storage-service';

// Grant access to storage actions
type AllowedActions =
  | StorageServiceSetItemAction
  | StorageServiceGetItemAction;

class MyController extends BaseController<...> {
  async storeData(id: string, data: string) {
    await this.messenger.call(
      'StorageService:setItem',
      'MyController',
      `${id}:data`,
      data,
    );
  }

  async getData(id: string): Promise<string | undefined> {
    const { result, error } = await this.messenger.call(
      'StorageService:getItem',
      'MyController',
      `${id}:data`,
    );
    if (error) {
      throw error;
    }
    // result is undefined if key doesn't exist
    return result as string | undefined;
  }
}
```

### Service Initialization

The service accepts an optional `StorageAdapter` for platform-specific storage:

```typescript
import { StorageService, type StorageAdapter } from '@metamask/storage-service';

// Production: Provide a platform-specific adapter
const service = new StorageService({
  messenger: storageServiceMessenger,
  storage: myPlatformAdapter, // FilesystemStorage, IndexedDB, etc.
});

// Testing: Uses in-memory storage by default
const testService = new StorageService({
  messenger: testMessenger,
  // No adapter needed - data isolated per test
});
```

### Events

Subscribe to storage changes:

```typescript
this.messenger.subscribe(
  'StorageService:itemSet:MyController',
  (key, value) => {
    console.log(`Data stored: ${key}`);
  },
);
```

## StorageAdapter Interface

Implement this interface to provide platform-specific storage:

```typescript
import type { Json } from '@metamask/utils';

// Response type for getItem - distinguishes found, not found, and error
type StorageGetResult =
  | { result: Json; error?: never } // Data found
  | { result?: never; error: Error } // Error occurred
  | Record<string, never>; // Key doesn't exist (empty object)

export type StorageAdapter = {
  getItem(namespace: string, key: string): Promise<StorageGetResult>;
  setItem(namespace: string, key: string, value: Json): Promise<void>;
  removeItem(namespace: string, key: string): Promise<void>;
  getAllKeys(namespace: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
};
```

Adapters are responsible for:

- Building the full storage key (e.g., `storageService:namespace:key`)
- Serializing/deserializing JSON data
- Returning the correct response format for getItem

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
