# `@metamask/gator-permissions-controller`

A dedicated controller for reading gator permissions from profile sync storage. This controller fetches data from the encrypted user storage database and caches it locally, providing fast access to permissions across devices while maintaining privacy through client-side encryption.

## Installation

`yarn add @metamask/gator-permissions-controller`

or

`npm install @metamask/gator-permissions-controller`

## Usage

### Basic Setup

```typescript
import { GatorPermissionsController } from '@metamask/gator-permissions-controller';

// Create the controller with required config
const gatorPermissionsController = new GatorPermissionsController({
  messenger: yourMessenger,
  config: {
    supportedPermissionTypes: [
      'native-token-stream',
      'native-token-periodic',
      'erc20-token-stream',
      'erc20-token-periodic',
      'erc20-token-revocation',
    ],
    // Optional: override the default gator permissions provider Snap id
    // gatorPermissionsProviderSnapId: 'npm:@metamask/gator-permissions-snap',
  },
});
```

### Fetch from Profile Sync

```typescript
// Fetch all permissions
const permissions =
  await gatorPermissionsController.fetchAndUpdateGatorPermissions();

// Fetch permissions and update internal state
const permissions =
  await gatorPermissionsController.fetchAndUpdateGatorPermissions();
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
