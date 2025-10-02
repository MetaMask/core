# `@metamask/bridge-status-controller`

A controller that manages and tracks the status of cross-chain bridge transactions in MetaMask. This controller provides functionality to monitor bridge transactions, handle transaction approvals, and manage transaction state across different blockchain networks.

## Features

- **Bridge Transaction Status Tracking**: Polls and updates the status of cross-chain bridge transactions
- **Smart Transaction Support**: Handles both regular and smart transactions (STX)
- **Multi-Chain Support**: Works with both EVM and Solana chains
- **Transaction History Management**: Maintains a persistent history of bridge transactions
- **Event System**: Emits events for transaction state changes (completion, failure)
- **Automatic Status Recovery**: Restarts polling for incomplete transactions after browser restarts

## Installation

```bash
yarn add @metamask/bridge-status-controller
```

or

```bash
npm install @metamask/bridge-status-controller
```

## Usage

Here's how to initialize and use the BridgeStatusController:

```typescript
import { BridgeStatusController } from '@metamask/bridge-status-controller';

const controller = new BridgeStatusController({
  messenger, // Controller messaging system
  clientId, // Bridge client identifier
  fetchFn, // Function for making HTTP requests
  addTransactionFn, // Function to add transactions
  estimateGasFeeFn, // Function to estimate gas fees
  config: {
    customBridgeApiBaseUrl: 'https://your-bridge-api.com', // Optional
  },
});

// Start monitoring a bridge transaction
controller.startPollingForBridgeTxStatus({
  bridgeTxMeta: {
    id: 'transaction-id',
    // ... other transaction metadata
  },
  statusRequest: {
    srcChainId: '1', // Ethereum mainnet
    srcTxHash: '0x...', // Source transaction hash
  },
  quoteResponse: {
    // ... quote response data
  },
  startTime: Date.now(),
  slippagePercentage: 0.5,
});

// Listen for bridge transaction completion
messenger.subscribe(
  'BridgeStatusController:bridgeTransactionComplete',
  ({ bridgeHistoryItem }) => {
    console.log('Bridge transaction completed:', bridgeHistoryItem);
  },
);

// Listen for bridge transaction failure
messenger.subscribe(
  'BridgeStatusController:bridgeTransactionFailed',
  ({ bridgeHistoryItem }) => {
    console.log('Bridge transaction failed:', bridgeHistoryItem);
  },
);

// Reset state for an address
controller.wipeBridgeStatus({
  address: '0x...',
  ignoreNetwork: false,
});
```

## State Management

The controller maintains state with the following structure:

```typescript
interface BridgeStatusControllerState {
  txHistory: {
    [txId: string]: {
      txMetaId: string;
      quote: QuoteData;
      startTime: number;
      estimatedProcessingTimeInSeconds: number;
      slippagePercentage: number;
      status: {
        status: StatusTypes;
        srcChain: {
          chainId: string;
          txHash: string;
        };
      };
      // ... other transaction details
    };
  };
}
```

## API Reference

### Methods

- `startPollingForBridgeTxStatus(args)`: Start polling for bridge transaction status
- `wipeBridgeStatus(args)`: Clear bridge status for a specific address
- `resetState()`: Reset the controller state to default
- `submitTx(args)`: Submit a new bridge transaction

### Events

- `bridgeTransactionComplete`: Emitted when a bridge transaction completes successfully
- `bridgeTransactionFailed`: Emitted when a bridge transaction fails
- `stateChange`: Emitted when the controller's state changes

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
