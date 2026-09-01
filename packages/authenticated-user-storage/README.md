# `@metamask/authenticated-user-storage`

A TypeScript SDK for MetaMask's Authenticated User Storage API. Unlike E2EE user-storage, authenticated user storage holds **structured JSON** scoped to the authenticated user. The server can read and validate the contents, which allows other backend services to consume the data (e.g. delegation execution, notification delivery).

The SDK currently supports three domains:

- **Delegations** -- immutable, EIP-712 signed delegation records (list, create, revoke).
- **Notification Preferences** -- mutable per-user notification settings (get, put).
- **Assets watchlist** -- mutable per-user list of CAIP-19 asset identifiers (get, set).

## Installation

`yarn add @metamask/authenticated-user-storage`

or

`npm install @metamask/authenticated-user-storage`

## Usage

### Creating a service

`AuthenticatedUserStorageService` extends `BaseDataService` and requires a messenger and an environment:

- **`messenger`** -- a namespaced messenger for registering actions and events. The messenger must have access to `AuthenticationController:getBearerToken` to retrieve access tokens.
- **`env`** -- selects the backend environment (`DEV`, `UAT`, or `PRD`).

```typescript
import { Messenger } from '@metamask/messenger';
import { AuthenticatedUserStorageService } from '@metamask/authenticated-user-storage';
import type {
  AuthenticatedUserStorageMessenger,
  AuthenticatedUserStorageActions,
  AuthenticatedUserStorageEvents,
} from '@metamask/authenticated-user-storage';

// Create the messenger
const messenger = new Messenger<
  'AuthenticatedUserStorageService',
  AuthenticatedUserStorageActions,
  AuthenticatedUserStorageEvents
>({
  namespace: 'AuthenticatedUserStorageService',
  parent: rootMessenger,
});

// Instantiate the service
const service = new AuthenticatedUserStorageService({
  messenger,
  environment: 'prod',
});
```

The `environment` option selects the backend environment:

| Value    | Server                                |
| -------- | ------------------------------------- |
| `'dev'`  | `user-storage.dev-api.cx.metamask.io` |
| `'uat'`  | `user-storage.uat-api.cx.metamask.io` |
| `'prod'` | `user-storage.api.cx.metamask.io`     |

### Calling methods via the messenger

Once instantiated, all service methods are available as messenger actions. This allows any consumer with access to the messenger to call them without needing a direct reference to the service instance:

```typescript
const delegations = await rootMessenger.call(
  'AuthenticatedUserStorageService:listDelegations',
);
```

### Delegations

Delegations are immutable once stored. They can only be revoked (deleted), not updated.

```typescript
import type { DelegationSubmission } from '@metamask/authenticated-user-storage';

// List all delegations for the authenticated user
const delegations = await service.listDelegations();

// Submit a new signed delegation
const submission: DelegationSubmission = {
  signedDelegation: { ... },
  metadata: { ... },
};
await service.createDelegation(submission, 'extension');

// Revoke a delegation by its hash
await service.revokeDelegation('0xdae6d1...');
```

### Notification preferences

Preferences are mutable. The first call creates the record; subsequent calls update it.

```typescript
import type { NotificationPreferences } from '@metamask/authenticated-user-storage';

// Retrieve current preferences (returns null if none have been set)
const prefs = await service.getNotificationPreferences();

// Create or update preferences
const updated: NotificationPreferences = {
  walletActivity: { ... },
  marketing: { ... },
  perps: { ... },
  socialAI: { ... },
};
await service.putNotificationPreferences(updated, 'extension');
```

### Assets watchlist

The assets-watchlist is a mutable per-user singleton blob. The first call to `setAssetsWatchlist` creates the record; subsequent calls overwrite it. Each entry in `assets` is a [CAIP-19](https://chainagnostic.org/CAIPs/caip-19) asset identifier (e.g. `eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`). The blob carries an explicit `version: 1` literal so the shape can evolve without breaking existing consumers.

The SDK enforces a maximum of `ASSETS_WATCHLIST_MAX_ASSETS` (100) entries on writes; oversized blobs throw a superstruct `StructError` before the request is sent.

```typescript
import { ASSETS_WATCHLIST_MAX_ASSETS } from '@metamask/authenticated-user-storage';
import type { AssetsWatchlistBlob } from '@metamask/authenticated-user-storage';

// Retrieve the current assets-watchlist (returns null on the first read)
const watchlist = await service.getAssetsWatchlist();

// Create or update the assets-watchlist
const updated: AssetsWatchlistBlob = {
  version: 1,
  assets: [
    'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    'eip155:1/slip44:60',
  ],
};
await service.setAssetsWatchlist(updated, 'extension');
```

## Response validation

All API responses are validated at runtime using [`@metamask/superstruct`](https://github.com/MetaMask/superstruct) schemas before being returned to callers. If the server returns data that doesn't match the expected shape, the SDK throws with details about the structural mismatch rather than silently returning malformed data.

## Error handling

HTTP errors are represented as `HttpError` from `@metamask/controller-utils`. All errors are encouraged to bubble up to the caller. The service policy provided by `BaseDataService` automatically retries transient failures before propagating the error.

```typescript
import { HttpError } from '@metamask/controller-utils';

try {
  await service.createDelegation(submission);
} catch (error) {
  if (error instanceof HttpError) {
    console.error(error.message);
    // e.g. "Failed to create delegation: 409"
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
