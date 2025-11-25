# `@metamask/storage-service`

A platform-agnostic service for storing large, infrequently accessed controller data outside of memory.

## Problem

Controllers store large, infrequently-accessed data in Redux state, causing:
- **State bloat**: 10.79 MB total, with 9.94 MB (92%) in just 2 controllers
- **Slow app startup**: Parsing 10.79 MB on every launch
- **High memory usage**: All data loaded, even if rarely accessed
- **Slow persist operations**: Up to 5.95 MB written per controller change

**Production measurements** (MetaMask Mobile):
- SnapController sourceCode: 5.95 MB (55% of state)
- TokenListController cache: 3.99 MB (37% of state)
- **Combined**: 9.94 MB in just 2 controllers

## Solution

`StorageService` provides a messenger-based API for controllers to store large data on disk instead of in memory. Data is loaded lazily only when needed.

## Installation

`yarn add @metamask/storage-service`

or

`npm install @metamask/storage-service`

## Architecture

The service is **platform-agnostic** and accepts an optional `StorageAdapter`:

- **With Adapter** (Production): Client provides platform-specific storage
  - Mobile: FilesystemStorage adapter → Data persists
  - Extension: IndexedDB adapter → Data persists
  
- **Without Adapter** (Default): Uses in-memory storage
  - Testing: No setup needed, isolated tests
  - Development: Quick start, no config
  - ⚠️ Data lost on restart

## Events

StorageService publishes events when data changes, enabling reactive patterns:

**Events published**:
- `StorageService:itemSet:{namespace}` - When data is stored
  - Payload: `[value, key]`
- `StorageService:itemRemoved:{namespace}` - When data is removed
  - Payload: `[key]`

**Example - Subscribe to changes**:
```typescript
// In another controller
this.messenger.subscribe(
  'StorageService:itemSet:ControllerA',
  (value, key) => {
    console.log(`ControllerA stored data: ${key}`);
    // React to changes without coupling
  },
);
```

## Usage

### Via Messenger (Recommended)

The service is designed to be used via a messenger, allowing controllers to access storage without direct dependencies.

#### 1. Controller Setup

```typescript
import type {
  StorageServiceSetItemAction,
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
} from '@metamask/storage-service';

// Grant access to storage actions
type AllowedActions =
  | StorageServiceSetItemAction
  | StorageServiceGetItemAction
  | StorageServiceRemoveItemAction;

type SnapControllerMessenger = Messenger<
  'SnapController',
  SnapControllerActions | AllowedActions,
  SnapControllerEvents
>;

class SnapController extends BaseController<
  'SnapController',
  SnapControllerState,
  SnapControllerMessenger
> {
  async storeSnapSourceCode(snapId: string, sourceCode: string) {
    // Store 3.86 MB of source code on disk, not in state
    await this.messenger.call(
      'StorageService:setItem',
      'SnapController',
      `${snapId}:sourceCode`,
      sourceCode,
    );
  }

  async getSnapSourceCode(snapId: string): Promise<string | null> {
    // Load source code only when snap needs to execute
    return await this.messenger.call(
      'StorageService:getItem',
      'SnapController',
      `${snapId}:sourceCode`,
    );
  }
}
```

#### 2. Service Initialization (Client)

**Mobile:**

```typescript
import {
  StorageService,
  type StorageAdapter,
  STORAGE_KEY_PREFIX,
} from '@metamask/storage-service';
import FilesystemStorage from 'redux-persist-filesystem-storage';

// Adapters handle key building and serialization
const mobileStorageAdapter: StorageAdapter = {
  async getItem(namespace: string, key: string) {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const serialized = await FilesystemStorage.getItem(fullKey);
    if (!serialized) return null;
    const wrapper = JSON.parse(serialized);
    return wrapper.data;
  },
  async setItem(namespace: string, key: string, value: unknown) {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const wrapper = { timestamp: Date.now(), data: value };
    await FilesystemStorage.setItem(fullKey, JSON.stringify(wrapper), Device.isIos());
  },
  async removeItem(namespace: string, key: string) {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    await FilesystemStorage.removeItem(fullKey);
  },
  async getAllKeys(namespace: string) {
    const prefix = `${STORAGE_KEY_PREFIX}${namespace}:`;
    const allKeys = await FilesystemStorage.getAllKeys();
    return allKeys
      .filter((k: string) => k.startsWith(prefix))
      .map((k: string) => k.slice(prefix.length));
  },
  async clear(namespace: string) {
    const keys = await this.getAllKeys(namespace);
    await Promise.all(keys.map((k) => this.removeItem(namespace, k)));
  },
};

// Initialize service
const service = new StorageService({
  messenger: storageServiceMessenger,
  storage: mobileStorageAdapter,
});
```

**Extension:**

```typescript
import {
  StorageService,
  type StorageAdapter,
  STORAGE_KEY_PREFIX,
} from '@metamask/storage-service';

// Adapters handle key building and serialization
const extensionStorageAdapter: StorageAdapter = {
  async getItem(namespace: string, key: string) {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const db = await openDB();
    const serialized = await db.get('storage-service', fullKey);
    if (!serialized) return null;
    const wrapper = JSON.parse(serialized);
    return wrapper.data;
  },
  async setItem(namespace: string, key: string, value: unknown) {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const wrapper = { timestamp: Date.now(), data: value };
    const db = await openDB();
    await db.put('storage-service', JSON.stringify(wrapper), fullKey);
  },
  async removeItem(namespace: string, key: string) {
    const fullKey = `${STORAGE_KEY_PREFIX}${namespace}:${key}`;
    const db = await openDB();
    await db.delete('storage-service', fullKey);
  },
  async getAllKeys(namespace: string) {
    const prefix = `${STORAGE_KEY_PREFIX}${namespace}:`;
    const db = await openDB();
    const allKeys = await db.getAllKeys('storage-service');
    return allKeys
      .filter((k: string) => k.startsWith(prefix))
      .map((k: string) => k.slice(prefix.length));
  },
  async clear(namespace: string) {
    const keys = await this.getAllKeys(namespace);
    await Promise.all(keys.map((k) => this.removeItem(namespace, k)));
  },
};

// Initialize service
const service = new StorageService({
  messenger: storageServiceMessenger,
  storage: extensionStorageAdapter,
});
```

**Testing:**

```typescript
import { StorageService } from '@metamask/storage-service';

// No storage adapter needed - uses in-memory by default
const service = new StorageService({
  messenger: testMessenger,
  // storage: undefined, // Optional - defaults to InMemoryStorageAdapter
});

// Works immediately, data isolated per test
await service.setItem('TestController', 'key', 'value');
```

#### 3. Delegate Actions to Controllers

```typescript
rootMessenger.delegate({
  actions: [
    'StorageService:setItem',
    'StorageService:getItem',
    'StorageService:removeItem',
  ],
  messenger: snapControllerMessenger,
});
```

### Direct Usage

You can also use the service directly without a messenger:

```typescript
import { StorageService, InMemoryStorageAdapter } from '@metamask/storage-service';

const service = new StorageService({
  messenger: myMessenger,
  storage: new InMemoryStorageAdapter(),
});

await service.setItem('MyController', 'myKey', { data: 'value' });
const data = await service.getItem('MyController', 'myKey');
```

## API

### `StorageService`

#### `setItem<T>(namespace: string, key: string, value: T): Promise<void>`

Store data in storage.

- `namespace` - Controller namespace (e.g., 'SnapController')
- `key` - Storage key (e.g., 'npm:@metamask/bitcoin-wallet-snap:sourceCode')
- `value` - Data to store (will be JSON stringified)

```typescript
await service.setItem('SnapController', 'snap-id:sourceCode', sourceCode);
```

#### `getItem<T>(namespace: string, key: string): Promise<T | null>`

Retrieve data from storage.

- `namespace` - Controller namespace
- `key` - Storage key
- **Returns**: Parsed data or null if not found

```typescript
const sourceCode = await service.getItem('SnapController', 'snap-id:sourceCode');
```

#### `removeItem(namespace: string, key: string): Promise<void>`

Remove data from storage.

```typescript
await service.removeItem('SnapController', 'snap-id:sourceCode');
```

#### `getAllKeys(namespace: string): Promise<string[]>`

Get all keys for a namespace (without prefix).

```typescript
const keys = await service.getAllKeys('SnapController');
// Returns: ['snap-id-1:sourceCode', 'snap-id-2:sourceCode', ...]
```

#### `clear(namespace: string): Promise<void>`

Clear all data for a namespace.

```typescript
await service.clear('SnapController');
```

## StorageAdapter Interface

Implement this interface to provide platform-specific storage. Adapters are responsible for:
- Building the full storage key (e.g., `storageService:namespace:key`)
- Wrapping data with metadata (timestamp) before serialization
- Serializing/deserializing data (JSON.stringify/parse)

```typescript
export type StorageAdapter = {
  getItem(namespace: string, key: string): Promise<unknown>;
  setItem(namespace: string, key: string, value: unknown): Promise<void>;
  removeItem(namespace: string, key: string): Promise<void>;
  getAllKeys(namespace: string): Promise<string[]>;
  clear(namespace: string): Promise<void>;
};
```

## When to Use

✅ **Use StorageService for:**
- Large data (> 100 KB)
- Infrequently accessed data
- Data that doesn't need to be in Redux state
- Examples: Snap source code (6 MB), cached API responses (4 MB)

❌ **Don't use for:**
- Frequently accessed data (use controller state)
- Small data (< 10 KB - overhead not worth it)
- Data needed for UI rendering
- Critical data that must be in Redux

## Storage Key Format

Adapters build keys with prefix: `storageService:{namespace}:{key}`

Examples:
- `storageService:SnapController:npm:@metamask/bitcoin-wallet-snap:sourceCode`
- `storageService:TokenListController:cache:0x1`

This provides:
- Namespace isolation (prevents collisions)
- Easy debugging (clear key format)
- Scoped clearing (clear removes all keys for controller)

## Real-World Impact

**Production measurements** (MetaMask Mobile):

**Per-controller**:
- SnapController: 5.95 MB sourceCode → 166 KB metadata (97% reduction)
- TokenListController: 3.99 MB cache → 61 bytes metadata (99.9% reduction)

**Combined**:
- Total state: 10.79 MB → 0.85 MB (**92% reduction**)
- App startup: 92% less data to parse
- Memory freed: 9.94 MB
- Disk I/O: Up to 9.94 MB less per persist operation

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

