# `@metamask/permission-controller`

A controller that implements an object capability-inspired permission system for MetaMask. This controller mediates access to JSON-RPC methods and other resources (targets) by different subjects (websites, snaps, or other extensions), managing permissions and their associated caveats.

## Features

- **Permission Management**: Create, update, and revoke permissions for different subjects
- **JSON-RPC Middleware**: Control access to JSON-RPC methods through middleware
- **Caveat Support**: Flexible permission attenuation through caveats
- **Endowment System**: Manage and control access to special capabilities (endowments)
- **Subject Management**: Track and manage different subjects (websites, snaps, extensions)
- **Type Safety**: Written in TypeScript with comprehensive type definitions
- **State Management**: Maintains persistent state of all permissions
- **Incremental Permissions**: Support for incremental permission grants
- **Approval Flow**: Integrated with approval system for permission requests

## Installation

```bash
yarn add @metamask/permission-controller
```

or

```bash
npm install @metamask/permission-controller
```

## Usage

Here's how to use the PermissionController:

```typescript
import { PermissionController } from '@metamask/permission-controller';

// Define permission specifications
const permissionSpecs = {
  wallet_getAccounts: {
    permissionType: 'RestrictedMethod',
    targetName: 'wallet_getAccounts',
    methodImplementation: async (req) => {
      // Implementation
      return ['0x...'];
    },
    allowedCaveats: ['exposedAccounts'],
  },
  snap_dialog: {
    permissionType: 'Endowment',
    targetName: 'snap_dialog',
    endowmentGetter: async ({ origin }) => {
      // Return endowment implementation
      return ['alert', 'confirm', 'prompt'];
    },
  },
};

// Define caveat specifications
const caveatSpecs = {
  exposedAccounts: {
    type: 'exposedAccounts',
    validator: (caveat) => {
      // Validate caveat
      return typeof caveat.value === 'string';
    },
  },
};

// Initialize the controller
const controller = new PermissionController({
  messenger,
  permissionSpecifications: permissionSpecs,
  caveatSpecifications: caveatSpecs,
  unrestrictedMethods: ['eth_blockNumber', 'net_version'],
});

// Request permissions
const permissions = await controller.requestPermissions(
  { origin: 'https://app.example.com' },
  {
    wallet_getAccounts: {
      caveats: [{ type: 'exposedAccounts', value: ['0x...'] }],
    },
  },
);

// Check permissions
const hasPermission = controller.hasPermission(
  'https://app.example.com',
  'wallet_getAccounts',
);

// Get permissions
const subjectPermissions = controller.getPermissions('https://app.example.com');

// Get endowments
const endowments = await controller.getEndowments(
  'https://app.example.com',
  'snap_dialog',
);

// Grant permissions
await controller.grantPermissions({
  subject: { origin: 'https://app.example.com' },
  approvedPermissions: {
    wallet_getAccounts: {
      caveats: [{ type: 'exposedAccounts', value: ['0x...'] }],
    },
  },
});

// Revoke permissions
controller.revokePermissions('https://app.example.com', ['wallet_getAccounts']);

// Update caveat
controller.updateCaveat(
  'https://app.example.com',
  'wallet_getAccounts',
  'exposedAccounts',
  ['0x...'],
);

// Create middleware
const permissionMiddleware = controller.createPermissionMiddleware();
```

## State Management

The controller maintains state with the following structure:

```typescript
interface PermissionControllerState {
  subjects: {
    [origin: string]: {
      origin: string;
      permissions: {
        [targetName: string]: {
          id: string;
          parentCapability: string;
          invoker: string;
          date: number;
          caveats?: Caveat[];
        };
      };
    };
  };
}

interface Caveat {
  type: string;
  value: unknown;
}
```

## Permission Types

The controller supports different types of permissions:

- **RestrictedMethod**: Controls access to JSON-RPC methods
- **Endowment**: Provides special capabilities to subjects
- **Internal**: Used for internal MetaMask functionality

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  await controller.requestPermissions(
    { origin: 'https://app.example.com' },
    { wallet_getAccounts: {} },
  );
} catch (error) {
  if (error.code === 4100) {
    // Handle unauthorized error
  } else if (error.code === 4200) {
    // Handle user rejection
  }
}
```

## Architecture

For a detailed understanding of how the PermissionController works, please read the [Architecture](./ARCHITECTURE.md) document.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
