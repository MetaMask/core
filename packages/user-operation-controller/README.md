# `@metamask/user-operation-controller`

A controller that manages the creation and lifecycle of EIP-4337 User Operations in MetaMask. This controller enables account abstraction by handling the preparation, signing, and submission of user operations to bundlers.

## Features

- **User Operation Management**: Create and manage EIP-4337 compliant user operations
- **Transaction Conversion**: Convert regular transactions into user operations
- **Smart Contract Account Support**: Works with different smart contract account implementations
- **Gas Fee Management**: Handles gas fee estimation and updates
- **Approval Flow**: Built-in user approval workflow
- **State Persistence**: Maintains persistent state of user operations
- **Event System**: Comprehensive event system for operation lifecycle
- **Bundler Integration**: Handles interaction with EIP-4337 bundlers

## Installation

```bash
yarn add @metamask/user-operation-controller
```

or

```bash
npm install @metamask/user-operation-controller
```

## Usage

Here's how to use the UserOperationController:

```typescript
import { UserOperationController } from '@metamask/user-operation-controller';

// Initialize the controller
const controller = new UserOperationController({
  entrypoint: '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // EntryPoint contract address
  getGasFeeEstimates: async () => {
    // Function to get gas fee estimates
    return gasFeeEstimates;
  },
  messenger,
  state: {
    userOperations: {},
  },
});

// Create a new user operation
const response = await controller.addUserOperation(
  {
    data: '0x...', // Transaction data
    to: '0x...', // Destination address
    value: '0x0', // Amount in wei
    maxFeePerGas: '0x...',
    maxPriorityFeePerGas: '0x...',
  },
  {
    networkClientId: 'mainnet',
    origin: 'dapp.example.com',
    requireApproval: true,
  },
);

// Get operation hash
const hash = await response.hash();

// Get final transaction hash
const txHash = await response.transactionHash();

// Convert a transaction to user operation
const txResponse = await controller.addUserOperationFromTransaction(
  {
    from: '0x...',
    to: '0x...',
    value: '0x0',
    data: '0x...',
    maxFeePerGas: '0x...',
    maxPriorityFeePerGas: '0x...',
  },
  {
    networkClientId: 'mainnet',
    origin: 'dapp.example.com',
  },
);

// Start polling for user operations on a network
const pollingToken = controller.startPollingByNetworkClientId('mainnet');
```

## State Management

The controller maintains state with the following structure:

```typescript
interface UserOperationControllerState {
  userOperations: Record<string, UserOperationMetadata>;
}

interface UserOperationMetadata {
  id: string;
  chainId: string;
  origin: string;
  status: UserOperationStatus;
  userOperation: UserOperation;
  bundlerUrl?: string;
  error?: {
    message: string;
    code?: string;
    stack?: string;
  };
  // ... other metadata
}
```

## User Operation Structure

The controller creates and manages user operations following the EIP-4337 specification:

```typescript
interface UserOperation {
  sender: string; // The account making the operation
  nonce: string; // Anti-replay parameter
  initCode: string; // Code to create new account (if needed)
  callData: string; // The data for the main execution
  callGasLimit: string; // Gas for main execution
  verificationGasLimit: string; // Gas for verification
  preVerificationGas: string; // Gas for pre-verification
  maxFeePerGas: string; // Max fee per gas
  maxPriorityFeePerGas: string; // Max priority fee
  paymasterAndData: string; // Paymaster information
  signature: string; // Operation signature
}
```

## Events

The controller emits various events during the user operation lifecycle:

- `stateChange`: When the controller's state changes
- Status updates through the event hub:
  - `userOperationPending`
  - `userOperationConfirmed`
  - `userOperationFailed`

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  const response = await controller.addUserOperation(/* ... */);
  const hash = await response.hash();
} catch (error) {
  if (error.code === 'USER_REJECTED') {
    // Handle user rejection
  } else if (error.code === 'BUNDLER_ERROR') {
    // Handle bundler errors
  }
}
```

## Compatibility

This package relies implicitly upon the `EventEmitter` module. This module is available natively in Node.js, but when using this package for the browser, make sure to use a polyfill such as `events`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
