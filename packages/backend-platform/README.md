# `@metamask/backend-platform`

Backend platform services for MetaMask, providing real-time account activity monitoring and WebSocket connection management.

## Overview

This package provides two main services:

- **`WebSocketService`**: Robust WebSocket client with automatic reconnection, request timeout handling, and subscription management
- **`AccountActivityService`**: High-level account activity monitoring service that uses WebSocket subscriptions to provide real-time transaction and balance updates

## Features

### WebSocketService
- ✅ **Automatic Reconnection**: Smart reconnection with exponential backoff
- ✅ **Request Timeout Detection**: Automatically reconnects on stale connections  
- ✅ **Subscription Management**: Centralized tracking of channel subscriptions
- ✅ **Direct Callback Routing**: High-performance message routing without EventEmitter overhead
- ✅ **Connection Health Monitoring**: Proactive connection state management

### AccountActivityService  
- ✅ **Automatic Account Management**: Subscribes/unsubscribes accounts based on selection changes
- ✅ **Real-time Transaction Updates**: Receives transaction status changes instantly
- ✅ **Balance Monitoring**: Tracks balance changes with comprehensive transfer details
- ✅ **CAIP-10 Address Support**: Works with multi-chain address formats
- ✅ **Fallback Polling Integration**: Coordinates with polling controllers for offline scenarios
- ✅ **Performance Optimization**: Direct callback routing and minimal subscription tracking

## Installation

```bash
yarn add @metamask/backend-platform
```

or

```bash
npm install @metamask/backend-platform
```

## Quick Start

### Basic Usage

```typescript
import { WebSocketService, AccountActivityService } from '@metamask/backend-platform';

// Initialize WebSocket service
const webSocketService = new WebSocketService({
  messenger: webSocketMessenger,
  url: 'wss://api.metamask.io/ws',
  timeout: 15000,
  requestTimeout: 20000,
});

// Initialize Account Activity service  
const accountActivityService = new AccountActivityService({
  messenger: accountActivityMessenger,
  webSocketService,
});

// Connect and subscribe to account activity
await webSocketService.connect();
await accountActivityService.subscribeAccounts({
  address: 'eip155:0:0x742d35cc6634c0532925a3b8d40c4e0e2c6e4e6'
});

// Listen for real-time updates
messenger.subscribe('AccountActivityService:transactionUpdated', (tx) => {
  console.log('New transaction:', tx);
});

messenger.subscribe('AccountActivityService:balanceUpdated', ({ address, updates }) => {
  console.log(`Balance updated for ${address}:`, updates);
});
```

### Integration with Controllers

```typescript
// Coordinate with TokenBalancesController for fallback polling
messenger.subscribe('BackendWebSocketService:connectionStateChanged', (info) => {
  if (info.state === 'CONNECTED') {
    // Reduce polling when WebSocket is active
    messenger.call('TokenBalancesController:updateChainPollingConfigs', 
      { '0x1': { interval: 600000 } }, // 10 min backup polling
      { immediateUpdate: false }
    );
  } else {
    // Increase polling when WebSocket is down  
    const defaultInterval = messenger.call('TokenBalancesController:getDefaultPollingInterval');
    messenger.call('TokenBalancesController:updateChainPollingConfigs',
      { '0x1': { interval: defaultInterval } },
      { immediateUpdate: true }
    );
  }
});
```

## Documentation

### Service Documentation
- 📖 [**WebSocketService**](./docs/websocket-service.md) - WebSocket connection management
- 📖 [**AccountActivityService**](./docs/account-activity-service.md) - Account activity monitoring  
- 📖 [**Integration Guide**](./docs/integration-guide.md) - Complete integration walkthrough

### Key Topics
- [Configuration Options](./docs/websocket-service.md#configuration-options)
- [Account Management](./docs/account-activity-service.md#account-management)
- [Event System](./docs/account-activity-service.md#event-system)
- [Error Handling](./docs/integration-guide.md#error-handling-and-recovery)
- [Performance Optimization](./docs/integration-guide.md#performance-monitoring)
- [Testing](./docs/integration-guide.md#testing-integration)

## API Reference

### WebSocketService

```typescript
class WebSocketService {
  constructor(options: WebSocketServiceOptions);
  
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  
  // Subscription management
  subscribe(options: SubscriptionOptions): Promise<SubscriptionInfo>;
  isChannelSubscribed(channel: string): boolean;
  getSubscriptionByChannel(channel: string): SubscriptionInfo | undefined;
}
```

### AccountActivityService

```typescript
class AccountActivityService {
  constructor(options: AccountActivityServiceOptions);
  
  // Account subscription
  subscribeAccounts(subscription: AccountSubscription): Promise<void>;
  unsubscribeAccounts(subscription: AccountSubscription): Promise<void>;
  getCurrentSubscribedAccount(): string | null;
  
  // Lifecycle
  cleanup(): void;
}
```

## Supported Address Formats

The services support CAIP-10 address formats for multi-chain compatibility:

```typescript
// Ethereum (all chains)
'eip155:0:0x742d35cc6634c0532925a3b8d40c4e0e2c6e4e6'

// Ethereum mainnet specific  
'eip155:1:0x742d35cc6634c0532925a3b8d40c4e0e2c6e4e6'

// Solana (all chains)
'solana:0:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'

// Raw address (fallback)
'0x742d35cc6634c0532925a3b8d40c4e0e2c6e4e6'
```

## Environment Configuration

### Development
```bash
METAMASK_WEBSOCKET_URL=wss://gateway.dev-api.cx.metamask.io/v1
```

### Production
Uses default production URL: `wss://api.metamask.io/ws`

## Integration Examples

### MetaMask Extension
See [Integration Guide](./docs/integration-guide.md#metamask-extension-integration) for modular controller initialization patterns.

### MetaMask Mobile  
See [Integration Guide](./docs/integration-guide.md#mobile-integration) for React Native specific configuration.

## TypeScript Support

This package is written in TypeScript and exports all necessary type definitions:

```typescript
import type {
  WebSocketService,
  WebSocketServiceOptions,
  AccountActivityService, 
  AccountActivityServiceOptions,
  AccountActivityMessage,
  Transaction,
  BalanceUpdate,
  WebSocketState,
} from '@metamask/backend-platform';
```

## Error Handling

The services provide comprehensive error handling and recovery:

```typescript
// Connection error handling
messenger.subscribe('BackendWebSocketService:connectionStateChanged', (info) => {
  if (info.state === 'ERROR') {
    console.error('WebSocket error:', info.error);
  }
});

// Subscription error handling  
messenger.subscribe('AccountActivityService:subscriptionError', ({ addresses, error }) => {
  console.error('Subscription failed:', addresses, error);
});
```

## Performance

- **Direct Callback Routing**: Zero-allocation message processing
- **Single Connection**: Multiple subscriptions share one WebSocket connection
- **Minimal State Tracking**: Optimized memory usage  
- **Smart Reconnection**: Exponential backoff prevents connection storms
- **Request Timeout Detection**: Proactive stale connection handling

## Testing

The package includes comprehensive test coverage:

```bash
# Run tests
yarn test

# Run with coverage
yarn test:coverage
```

Mock implementations are available for testing:

```typescript
const mockWebSocketService = {
  connect: jest.fn(),
  subscribe: jest.fn(), 
  disconnect: jest.fn(),
};
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

### Development Setup

```bash
# Install dependencies
yarn install

# Build the package  
yarn build

# Run tests
yarn test

# Run linting
yarn lint
```

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.