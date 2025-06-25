# `@metamask/backend-platform`

Backend platform utilities and services for MetaMask.

## Installation

`yarn add @metamask/backend-platform`

or

`npm install @metamask/backend-platform`

## Features

- **WebSocket Service**: Robust WebSocket client with automatic reconnection, circuit breaker pattern, and service degradation detection
- **Account Activity Service**: Monitor account transactions and balance changes across multiple chains
- **Price Service**: Real-time price feed subscriptions and updates (internal use)
- **Type-safe utilities**: Common types and utility functions for backend operations, including keyring-api compatibility
- **Account Activity Service**: Monitor account transactions and balance changes across multiple chains
- **Price Service**: Real-time price feed subscriptions and updates (internal use)
- **Type-safe utilities**: Common types and utility functions for backend operations, including keyring-api compatibility
- **Service patterns**: Following MetaMask's service architecture guidelines

## Usage

### WebSocket Service

The WebSocket Service provides enterprise-grade WebSocket connectivity with automatic reconnection, circuit breaker patterns, and comprehensive error handling.

The WebSocket Service provides enterprise-grade WebSocket connectivity with automatic reconnection, circuit breaker patterns, and comprehensive error handling.

```typescript
import { WebSocketService, WebSocketState } from '@metamask/backend-platform';

// Create a WebSocket service instance
const websocketService = new WebSocketService({
  messenger: restrictedMessenger, // RestrictedMessenger instance
  messenger: restrictedMessenger, // RestrictedMessenger instance
  url: 'wss://your-internal-backend.com/ws',
  timeout: 15000,
  timeout: 15000,
  maxReconnectAttempts: 5,
  policyOptions: {
    maxRetries: 3,
    maxConsecutiveFailures: 5,
    circuitBreakDuration: 60000,
    degradedThreshold: 3000,
  },
});

// Set up event handlers
websocketService.on('connected', () => {
  console.log('Connected to WebSocket server');
});

websocketService.on('message', (message) => {
  console.log('Received message:', message);
});

websocketService.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Handle service policy events
// Handle service policy events
websocketService.onBreak((data) => {
  console.warn('Circuit breaker triggered:', data);
});

websocketService.onDegraded(() => {
  console.warn('Service is degraded');
});

websocketService.onRetry((data) => {
  console.log('Retrying connection:', data);
});

// Connect and send messages
async function example() {
  try {
    await websocketService.connect();
    
    const response = await websocketService.sendRequest({
      event: 'getUserAccount',
      data: { userId: 'user123' },
    const response = await websocketService.sendRequest({
      event: 'getUserAccount',
      data: { userId: 'user123' },
    });
    
    console.log('Response:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Create subscriptions with automatic lifecycle management
const subscription = await websocketService.subscribe({
  method: 'account_activity',
  params: { address: '0x1234...' },
  onNotification: (notification) => {
    console.log('Account activity:', notification.params);
  }
});

// Later, unsubscribe
await subscription.unsubscribe();

// Create subscriptions with automatic lifecycle management
const subscription = await websocketService.subscribe({
  method: 'account_activity',
  params: { address: '0x1234...' },
  onNotification: (notification) => {
    console.log('Account activity:', notification.params);
  }
});

// Later, unsubscribe
await subscription.unsubscribe();
```

### Account Activity Service

The Account Activity Service monitors account transactions and balance changes across multiple blockchain networks using CAIP-10 formatted addresses.
### Account Activity Service

The Account Activity Service monitors account transactions and balance changes across multiple blockchain networks using CAIP-10 formatted addresses.

```typescript
import { AccountActivityService } from '@metamask/backend-platform';
import { AccountActivityService } from '@metamask/backend-platform';

// Create the service with a WebSocket service dependency
const accountActivityService = new AccountActivityService({
  messenger: restrictedMessenger,
  webSocketService: websocketService,
  maxActiveSubscriptions: 50,
  processAllTransactions: true,
});

// Subscribe to account activity (CAIP-10 format)
await accountActivityService.subscribeAccounts([{
  address: 'eip155:1:0x1234567890123456789012345678901234567890' // Ethereum mainnet
}]);

await accountActivityService.subscribeAccounts([{
  address: 'solana:101:ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX' // Solana mainnet
}]);

// The service automatically receives and processes:
// - Transaction updates
// - Balance changes
// - Account activity notifications

// Service automatically manages subscriptions - no need to manually track them

// Unsubscribe from specific accounts
await accountActivityService.unsubscribeAccounts(['eip155:1:0x1234...']);
```

### Type Definitions

The package provides comprehensive TypeScript types, including re-exports from `@metamask/keyring-api`:
### Type Definitions

The package provides comprehensive TypeScript types, including re-exports from `@metamask/keyring-api`:

```typescript
import type { 
  Transaction,
  TransactionType,
  TransactionStatus,
  FeeType,
  AccountBalancesUpdatedEvent,
  AccountBalancesUpdatedEventPayload,
  TransactionWithKeyringBalanceUpdate,
} from '@metamask/backend-platform';

// All types are compatible with the MetaMask keyring-api
const transaction: Transaction = {
  id: 'unique-tx-id',
  account: 'account-uuid',
  chain: 'eip155:1',
  // ... other transaction properties
};

// Balance updates follow the keyring-api structure
const balanceUpdate: AccountBalancesUpdatedEventPayload = {
  balances: {
    'account-uuid': {
      'eip155:1/erc20:0x...': {
        unit: 'USDC',
        amount: '1000000'
      }
    }
  }
// All types are compatible with the MetaMask keyring-api
const transaction: Transaction = {
  id: 'unique-tx-id',
  account: 'account-uuid',
  chain: 'eip155:1',
  // ... other transaction properties
};

// Balance updates follow the keyring-api structure
const balanceUpdate: AccountBalancesUpdatedEventPayload = {
  balances: {
    'account-uuid': {
      'eip155:1/erc20:0x...': {
        unit: 'USDC',
        amount: '1000000'
      }
    }
  }
};
```

## Architecture

This package follows MetaMask's service architecture patterns:

- **Service Policy Integration**: Uses `@metamask/controller-utils` for retry logic, circuit breaker pattern, and service degradation detection
- **Event-driven Architecture**: All services implement an event emitter pattern for handling connection states and messages
- **Type Safety**: Comprehensive TypeScript types for all service interactions, with full keyring-api compatibility
- **Event-driven Architecture**: All services implement an event emitter pattern for handling connection states and messages
- **Type Safety**: Comprehensive TypeScript types for all service interactions, with full keyring-api compatibility
- **Error Handling**: Robust error handling with automatic retries and fallback mechanisms
- **Cross-Platform Support**: WebSocket service works in both Node.js and browser environments
- **CAIP Standards**: Account Activity Service uses CAIP-10 for cross-chain account identification

## Services
- **Cross-Platform Support**: WebSocket service works in both Node.js and browser environments
- **CAIP Standards**: Account Activity Service uses CAIP-10 for cross-chain account identification

## Services

### WebSocket Service Features
### WebSocket Service Features

- **Automatic Reconnection**: Configurable reconnection attempts with exponential backoff
- **Circuit Breaker**: Prevents cascading failures by temporarily stopping requests when service is down
- **Service Degradation Detection**: Monitors service performance and triggers callbacks when degraded
- **Message Correlation**: Automatic correlation of request/response messages with unique IDs
- **RFC 6455 Compliance**: Proper PING/PONG control frame handling for keep-alive
- **Subscription Management**: High-level subscription API with automatic lifecycle management
- **Message Correlation**: Automatic correlation of request/response messages with unique IDs
- **RFC 6455 Compliance**: Proper PING/PONG control frame handling for keep-alive
- **Subscription Management**: High-level subscription API with automatic lifecycle management
- **Connection State Management**: Comprehensive state tracking and event emission
- **Cross-Platform**: Native WebSocket in browsers, 'ws' package in Node.js

### Account Activity Service Features

- **Multi-Chain Support**: Monitor accounts across different blockchain networks
- **CAIP-10 Addresses**: Uses standard CAIP-10 format for cross-chain account identification
- **Real-time Updates**: Receive transaction confirmations and balance changes instantly
- **Subscription Management**: Efficiently manage multiple account subscriptions
- **Balance Transformation**: Automatic conversion to keyring-api compatible format
- **Transaction Processing**: Unified transaction format using keyring-api standards

### Price Service Features (Internal)

- **Real-time Price Feeds**: Subscribe to cryptocurrency price updates
- **Symbol Management**: Support for multiple trading pairs and symbols
- **WebSocket Transport**: Built on top of the WebSocket service for reliability
- **Caching**: Intelligent price data caching with configurable intervals
- **Change Detection**: Configurable price change thresholds for notifications

## Integration Examples

### Complete Setup with MetaMask Controller

```typescript
import { 
  WebSocketService, 
  AccountActivityService 
} from '@metamask/backend-platform';

// Setup in your MetaMask controller
const websocketMessenger = this.controllerMessenger.getRestricted({
  name: 'WebSocketService',
  allowedActions: [],
  allowedEvents: [],
});

const activityMessenger = this.controllerMessenger.getRestricted({
  name: 'AccountActivityService', 
  allowedActions: [],
  allowedEvents: [],
});

// Initialize services
const websocketService = new WebSocketService({
  messenger: websocketMessenger,
  url: 'wss://api.metamask.io/ws',
  timeout: 10000,
  maxReconnectAttempts: 5,
});

const accountActivityService = new AccountActivityService({
  messenger: activityMessenger,
  webSocketService: websocketService,
  maxActiveSubscriptions: 100,
});

// Connect and start monitoring
await websocketService.connect();
await accountActivityService.subscribeAccounts([
  { address: 'eip155:1:0x...' }, // Ethereum
  { address: 'solana:101:...' }, // Solana
]);
```
- **Cross-Platform**: Native WebSocket in browsers, 'ws' package in Node.js

### Account Activity Service Features

- **Multi-Chain Support**: Monitor accounts across different blockchain networks
- **CAIP-10 Addresses**: Uses standard CAIP-10 format for cross-chain account identification
- **Real-time Updates**: Receive transaction confirmations and balance changes instantly
- **Subscription Management**: Efficiently manage multiple account subscriptions
- **Balance Transformation**: Automatic conversion to keyring-api compatible format
- **Transaction Processing**: Unified transaction format using keyring-api standards

### Price Service Features (Internal)

- **Real-time Price Feeds**: Subscribe to cryptocurrency price updates
- **Symbol Management**: Support for multiple trading pairs and symbols
- **WebSocket Transport**: Built on top of the WebSocket service for reliability
- **Caching**: Intelligent price data caching with configurable intervals
- **Change Detection**: Configurable price change thresholds for notifications

## Integration Examples

### Complete Setup with MetaMask Controller

```typescript
import { 
  WebSocketService, 
  AccountActivityService 
} from '@metamask/backend-platform';

// Setup in your MetaMask controller
const websocketMessenger = this.controllerMessenger.getRestricted({
  name: 'WebSocketService',
  allowedActions: [],
  allowedEvents: [],
});

const activityMessenger = this.controllerMessenger.getRestricted({
  name: 'AccountActivityService', 
  allowedActions: [],
  allowedEvents: [],
});

// Initialize services
const websocketService = new WebSocketService({
  messenger: websocketMessenger,
  url: 'wss://api.metamask.io/ws',
  timeout: 10000,
  maxReconnectAttempts: 5,
});

const accountActivityService = new AccountActivityService({
  messenger: activityMessenger,
  webSocketService: websocketService,
  maxActiveSubscriptions: 100,
});

// Connect and start monitoring
await websocketService.connect();
await accountActivityService.subscribeAccounts([
  { address: 'eip155:1:0x...' }, // Ethereum
  { address: 'solana:101:...' }, // Solana
]);
```

## API Documentation

For detailed API documentation, please visit [our TypeDoc page](https://metamask.github.io/core/modules/_metamask_backend_platform.html). 