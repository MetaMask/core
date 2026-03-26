# `@metamask/authenticated-user-storage`

A TypeScript SDK for MetaMask's Authenticated User Storage API. Unlike end-to-end encrypted user storage (where the server stores opaque ciphertext), authenticated user storage holds **structured JSON** scoped to the authenticated user. The server can read and validate the contents, which allows other backend services to consume the data (e.g. delegation execution, notification delivery).

The SDK currently supports two domains:

- **Delegations** -- immutable, EIP-712 signed delegation records (list, create, revoke).
- **Notification Preferences** -- mutable per-user notification settings (get, put).

## Installation

`yarn add @metamask/authenticated-user-storage`

or

`npm install @metamask/authenticated-user-storage`

## Usage

### Creating a client

```typescript
import { AuthenticatedUserStorage, Env } from '@metamask/authenticated-user-storage';

const storage = new AuthenticatedUserStorage({
  env: Env.PRD,
  getAccessToken: async () => {
    // Return a valid JWT access token for the current user.
    return myAuthProvider.getToken();
  },
});
```

The `env` option selects the backend environment:

| `Env` value | Server |
| --- | --- |
| `Env.DEV` | `user-storage.dev-api.cx.metamask.io` |
| `Env.UAT` | `user-storage.uat-api.cx.metamask.io` |
| `Env.PRD` | `user-storage.api.cx.metamask.io` |

### Delegations

Delegations are immutable once stored. They can only be revoked (deleted), not updated.

```typescript
import type { Hex, DelegationSubmission } from '@metamask/authenticated-user-storage';

// List all delegations for the authenticated user
const delegations = await storage.delegations.list();

// Submit a new signed delegation
const submission: DelegationSubmission = {
  signedDelegation: { ... },
  metadata: { ... },
};
await storage.delegations.create(submission, 'extension');

// Revoke a delegation by its hash
await storage.delegations.revoke('0xdae6d1...');
```

### Notification preferences

Preferences are mutable. The first call creates the record; subsequent calls update it.

```typescript
import type { NotificationPreferences, Hex } from '@metamask/authenticated-user-storage';

// Retrieve current preferences (returns null if none have been set)
const prefs = await storage.preferences.getNotifications();

// Create or update preferences
const updated: NotificationPreferences = {
  walletActivity: { ... },
  marketing: { ... },
  perps: { ... },
  socialAI: { ... },
};
await storage.preferences.putNotifications(updated, 'extension');
```

## Error handling

All methods throw `AuthenticatedUserStorageError` on failure. The error message includes the HTTP status code and the server's error response when available.

```typescript
import { AuthenticatedUserStorageError } from '@metamask/authenticated-user-storage';

try {
  await storage.delegations.create(submission);
} catch (error) {
  if (error instanceof AuthenticatedUserStorageError) {
    console.error(error.message);
    // e.g. "failed to create delegation. HTTP 409 message: delegation already exists, error: Conflict"
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
