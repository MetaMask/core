# `@metamask/storage-service`

A platform-agnostic service for storing large, infrequently accessed controller data outside of memory.

## Problem

Controllers store large, infrequently-accessed data in Redux state, causing:
- **State bloat**: 10.79 MB total, with 10.18 MB (92%) in just 2 controllers
- **Slow app startup**: Parsing 10.79 MB on every launch
- **High memory usage**: All data loaded, even if rarely accessed
- **Slow persist operations**: Up to 6.26 MB written per controller change

**Production measurements** (MetaMask Mobile):
- SnapController sourceCode: 6.09 MB (55% of state)
- TokenListController cache: 4.09 MB (37% of state)
- **Combined**: 10.18 MB in just 2 controllers

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
} from '@metamask/storage-service';
import FilesystemStorage from 'redux-persist-filesystem-storage';

// Create platform-specific adapter
const mobileStorageAdapter: StorageAdapter = {
  async getItem(key: string) {
    return await FilesystemStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    await FilesystemStorage.setItem(key, value, Device.isIos());
  },
  async removeItem(key: string) {
    await FilesystemStorage.removeItem(key);
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
import { StorageService, type StorageAdapter } from '@metamask/storage-service';

// Create IndexedDB adapter
const extensionStorageAdapter: StorageAdapter = {
  async getItem(key: string) {
    const db = await openDB();
    return await db.get('storage-service', key);
  },
  async setItem(key: string, value: string) {
    const db = await openDB();
    await db.put('storage-service', value, key);
  },
  async removeItem(key: string) {
    const db = await openDB();
    await db.delete('storage-service', key);
  },
  async getAllKeys() {
    const db = await openDB();
    return await db.getAllKeys('storage-service');
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

#### `clearNamespace(namespace: string): Promise<void>`

Clear all data for a namespace.

```typescript
await service.clearNamespace('SnapController');
```

## StorageAdapter Interface

Implement this interface to provide platform-specific storage:

```typescript
export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys?(): Promise<string[]>; // Optional
  clear?(): Promise<void>; // Optional
}
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

Keys are automatically prefixed: `storage:{namespace}:{key}`

Examples:
- `storage:SnapController:npm:@metamask/bitcoin-wallet-snap:sourceCode`
- `storage:TokenListController:tokensChainsCache`

This provides:
- Namespace isolation (prevents collisions)
- Easy debugging (clear key format)
- Scoped clearing (clearNamespace removes all keys for controller)

## Real-World Impact

**Production measurements** (MetaMask Mobile):

**Per-controller**:
- SnapController: 6.09 MB → 170 KB (98% reduction)
- TokenListController: 4.09 MB → 5 bytes (99.9% reduction)

**Combined**:
- Total state: 10.79 MB → 0.85 MB (**92% reduction**)
- App startup: 92% less data to parse
- Memory freed: 10.18 MB
- Disk I/O: Up to 10.18 MB less per persist operation

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

