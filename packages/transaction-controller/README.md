# `@metamask/transaction-controller`

A controller that manages the lifecycle of Ethereum transactions in MetaMask. This controller handles transaction creation, status updates, gas fee management, approval flows, and transaction history tracking.

## Features

- **Transaction Management**: Create, update, and track transaction status
- **Gas Fee Management**: Automatic gas fee estimation and updates
- **Batch Transactions**: Support for submitting multiple transactions as a batch
- **Transaction History**: Comprehensive history tracking with notes and updates
- **Incoming Transaction Support**: Monitor and track incoming transactions
- **EIP-1559 Support**: Handle both legacy and EIP-1559 transaction types
- **State Persistence**: Maintains persistent state of transactions
- **Event System**: Rich event system for transaction lifecycle events
- **Search & Filtering**: Advanced transaction search and filtering capabilities

## Installation

```bash
yarn add @metamask/transaction-controller
```

or

```bash
npm install @metamask/transaction-controller
```

## Usage

Here's how to use the TransactionController:

```typescript
import { TransactionController } from '@metamask/transaction-controller';

// Initialize the controller
const controller = new TransactionController({
  // Required options
  disableHistory: false,
  disableSendFlowHistory: false,
  disableSwaps: false,
  getCurrentNetworkEIP1559Compatibility: async () => true,
  getNetworkClientRegistry: () => networkClientRegistry,
  getNetworkState: () => networkState,

  // Optional features
  getCurrentAccountEIP1559Compatibility: async () => true,
  getGasFeeEstimates: async (options) => gasFeeEstimates,
  incomingTransactions: {
    enabled: true,
    blockNumberThreshold: 1,
    etherscanApiKeysByChainId: {
      '0x1': 'YOUR-API-KEY',
    },
  },
});

// Add a new transaction
const txMeta = await controller.addTransaction({
  from: '0x...',
  to: '0x...',
  value: '0x0',
  data: '0x...',
  type: TransactionType.standard,
  maxFeePerGas: '0x...',
  maxPriorityFeePerGas: '0x...',
});

// Listen for transaction status updates
messenger.subscribe('TransactionController:stateChange', (state) => {
  console.log('New transactions state:', state);
});

messenger.subscribe(
  'TransactionController:transactionStatusUpdated',
  ({ transactionMeta }) => {
    console.log('Transaction status updated:', transactionMeta.status);
  },
);

// Search transactions
const filteredTxs = controller.getTransactions({
  searchCriteria: {
    status: 'confirmed',
    from: '0x...',
  },
  limit: 10,
});

// Update transaction
controller.updateTransaction(txMeta, 'User increased gas fee');

// Start monitoring incoming transactions
controller.startIncomingTransactionPolling();

// Handle batch transactions
controller.updateBatchTransactions({
  transactionId: txMeta.id,
  batchTransactions: [
    {
      to: '0x...',
      value: '0x0',
      data: '0x...',
    },
  ],
});
```

## State Management

The controller maintains state with the following structure:

```typescript
interface TransactionControllerState {
  transactions: TransactionMeta[];
  methodData: Record<string, MethodData>;
  lastFetchedBlockNumbers: { [key: string]: number | string };
  submitHistory: SubmitHistoryEntry[];
}

interface TransactionMeta {
  id: string;
  status: TransactionStatus;
  time: number;
  type: TransactionType;
  chainId: string;
  txParams: TransactionParams;
  history: TransactionHistory[];
  origin?: string;
  actionId?: string;
  isUserOperation?: boolean;
  // ... other metadata
}
```

## Events

The controller emits various events during the transaction lifecycle:

- `stateChange`: When the controller's state changes
- `transactionStatusUpdated`: When a transaction's status is updated
- `incomingTransactionsReceived`: When new incoming transactions are detected
- `transactionFinished`: When a transaction reaches a final state (confirmed/failed/rejected)

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  await controller.addTransaction(/* ... */);
} catch (error) {
  if (error.message.includes('insufficient funds')) {
    // Handle insufficient funds error
  } else if (error.message.includes('nonce too low')) {
    // Handle nonce error
  }
}
```

## Compatibility

This package relies implicitly upon the `EventEmitter` module. This module is available natively in Node.js, but when using this package for the browser, make sure to use a polyfill such as `events`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
