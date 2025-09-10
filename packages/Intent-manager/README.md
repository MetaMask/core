<!-- cSpell:words cowswap unregisters -->

# `@metamask/intent-manager`

A comprehensive intent management system for MetaMask that orchestrates cross-chain token swaps and bridging operations through multiple decentralized exchange (DEX) providers. This package provides order execution and lifecycle management for user intents.

## Overview

The Intent Manager provides a unified interface for:

- **Cross-Chain Operations**: Support for token swaps and bridging across different blockchain networks
- **Order Lifecycle Management**: Handle order submission, execution tracking, and status monitoring
- **Provider Management**: Pluggable architecture for adding new DEX providers
- **State Management**: Track intent orders and maintain execution history

## Key Features

- 🔄 **Cross-chain token swaps** through multiple providers
- 🏪 **Multi-provider support** with extensible provider architecture
- 📊 **Real-time order tracking** and status updates
- 🛡️ **Order lifecycle management** with comprehensive error handling

## Installation

```bash
yarn add @metamask/intent-manager
```

or

```bash
npm install @metamask/intent-manager
```

## Quick Start

```typescript
import { IntentManager } from '@metamask/intent-manager';
import type { IntentSubmissionParams } from '@metamask/intent-manager';

// Initialize the intent manager
const intentManager = new IntentManager();

// Submit an intent order (order data would come from backend)
const submissionParams: IntentSubmissionParams = {
  providerName: 'cowswap',
  chainId: 1, // Ethereum Mainnet
  orderData: {
    sellToken: '0xA0b86a33E6441e6e80D0c4C6C7527d72', // USDC
    buyToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH
    sellAmount: '1000000000000000000', // 1 token (18 decimals)
    // ... other order data from backend
  },
  signature: '0x...', // User signature
  userAddress: '0x742d35Cc6634C0532925a3b8D4C9db96',
};

const order = await intentManager.submitIntent(submissionParams);

// Monitor order status
const status = await intentManager.getOrderStatus(
  order.id,
  'cowswap',
  1
);
```

## API Reference

### IntentManager

The main class that orchestrates intent operations across multiple providers.

#### Constructor

```typescript
new IntentManager(initialState?: Partial<IntentManagerState>)
```

#### Core Methods

##### `submitIntent(params): Promise<IntentOrder>`

Submits an intent order with the provided order data.

```typescript
const order = await intentManager.submitIntent({
  providerName: 'cowswap',
  chainId: 1,
  orderData: {
    // Order data from backend
  },
  signature: '0x...',
  userAddress: '0x...',
});
```

##### `getOrderStatus(orderId, providerName, chainId): Promise<IntentOrder>`

Retrieves the current status of an order.

```typescript
const status = await intentManager.getOrderStatus(
  'order-123',
  'cowswap',
  1
);
```

##### `cancelOrder(orderId, providerName, chainId): Promise<boolean>`

Cancels a pending order.

```typescript
const cancelled = await intentManager.cancelOrder(
  'order-123',
  'cowswap',
  1
);
```

#### Provider Management

##### `registerProvider(provider): void`

Registers a new intent provider.

```typescript
const customProvider = new CustomProvider(config);
intentManager.registerProvider(customProvider);
```

##### `unregisterProvider(providerName): boolean`

Unregisters an intent provider.

```typescript
const removed = intentManager.unregisterProvider('cowswap');
```

##### `getAvailableProviders(criteria?): BaseIntentProvider[]`

Gets available providers, optionally filtered by criteria.

```typescript
const providers = intentManager.getAvailableProviders({
  chainId: 1,
  tokenPair: ['0x...', '0x...'],
  amount: '1000000000000000000',
});
```

## Core Types



### IntentOrder

Order information and status.

```typescript
type IntentOrder = {
  id: string;
  status: IntentOrderStatus;
  txHash?: string;
  createdAt: number;
  updatedAt: number;
  metadata: Record<string, unknown>;
};
```

### IntentOrderStatus

```typescript
enum IntentOrderStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}
```

### ProviderSelectionCriteria

Criteria for filtering and sorting providers.

```typescript
type ProviderSelectionCriteria = {
  chainId: number;
  tokenPair: [string, string];
  amount: string;
  preferredProviders?: string[];
  excludedProviders?: string[];
};
```

## Supported Providers

### CowSwap

The package includes built-in support for CowSwap, a DEX aggregator that provides:

- **MEV Protection**: Orders are protected from front-running and sandwich attacks
- **Gas-free Trading**: No gas fees for failed transactions
- **Multi-chain Support**: Ethereum, Arbitrum, Base, Avalanche, and Polygon
- **Batch Auctions**: Efficient price discovery through batch settlement

### Adding Custom Providers

You can extend the system by implementing the `BaseIntentProvider` interface:

```typescript
import { BaseIntentProvider } from '@metamask/intent-manager';

class CustomProvider extends BaseIntentProvider {
  constructor(config: IntentProviderConfig) {
    super(config);
  }

  getName(): string {
    return 'custom-dex';
  }

  getVersion(): string {
    return '1.0.0';
  }

  getSupportedChains(): number[] {
    return [1, 42161]; // Ethereum and Arbitrum
  }

  async submitOrder(params: IntentSubmissionParams): Promise<IntentOrder> {
    // Implement order submission logic
  }

  async getOrderStatus(orderId: string, chainId: number): Promise<IntentOrder> {
    // Implement status checking logic
  }

  async cancelOrder(orderId: string, chainId: number): Promise<boolean> {
    // Implement order cancellation logic
  }
}

// Register the custom provider
const customProvider = new CustomProvider(config);
intentManager.registerProvider(customProvider);
```

## Error Handling

The Intent Manager provides comprehensive error handling:

```typescript
try {
  const order = await intentManager.submitIntent(submissionParams);
} catch (error) {
  if (error.message.includes('Unsupported chain')) {
    // Handle unsupported chain error
  } else if (error.message.includes('Provider not found')) {
    // Handle provider error
  } else {
    // Handle other errors
  }
}
```

## Best Practices



### Order Monitoring

- **Poll Status Regularly**: Check order status periodically for updates
- **Handle Timeouts**: Implement timeout logic for long-running orders
- **Retry Failed Orders**: Consider retrying with different providers

```typescript
async function monitorOrder(orderId: string, provider: string, chainId: number) {
  const maxAttempts = 60; // 5 minutes with 5-second intervals
  let attempts = 0;

  while (attempts < maxAttempts) {
    const order = await intentManager.getOrderStatus(orderId, provider, chainId);

    if (order.status === IntentOrderStatus.COMPLETED) {
      return order;
    } else if (order.status === IntentOrderStatus.FAILED) {
      throw new Error(`Order failed: ${order.id}`);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }

  throw new Error('Order monitoring timeout');
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

### Development

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Run tests in watch mode
yarn test:watch

# Build the package
yarn build

# Generate documentation
yarn build:docs
```

## License

MIT
