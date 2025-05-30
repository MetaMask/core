# `@metamask/network-controller`

A controller that manages network configurations and provides interfaces to interact with different blockchain networks in MetaMask. This controller handles network selection, RPC endpoint management, network client creation, and network state management.

## Features

- **Network Management**: Add, remove, and update network configurations
- **Multi-Chain Support**: Handle multiple blockchain networks simultaneously
- **RPC Endpoint Management**: Configure and manage multiple RPC endpoints per network
- **Failover Support**: Automatic RPC endpoint failover for improved reliability
- **Network Client Registry**: Maintain a registry of network clients for different chains
- **State Management**: Track network states, configurations, and metadata
- **Event System**: Rich event system for network-related changes
- **Type Safety**: Written in TypeScript for enhanced type safety
- **Infura Integration**: Built-in support for Infura networks

## Installation

```bash
yarn add @metamask/network-controller
```

or

```bash
npm install @metamask/network-controller
```

## Usage

Here's how to use the NetworkController:

```typescript
import { NetworkController } from '@metamask/network-controller';

// Initialize the controller
const controller = new NetworkController({
  infuraProjectId: 'your-infura-project-id',
  // Optional: Enable RPC failover
  isRpcFailoverEnabled: true,
  // Optional: Additional default networks
  additionalDefaultNetworks: [
    {
      chainId: '0x89', // Polygon
      ticker: 'MATIC',
    },
  ],
  // Optional: Custom RPC service options
  getRpcServiceOptions: () => ({
    retries: 3,
    timeout: 10000,
  }),
});

// Initialize provider
await controller.initializeProvider();

// Add a new network
await controller.addNetwork({
  chainId: '0x89',
  nickname: 'Polygon Mainnet',
  rpcUrl: 'https://polygon-rpc.com',
  ticker: 'MATIC',
  blockExplorerUrl: 'https://polygonscan.com',
});

// Update a network
await controller.updateNetwork({
  chainId: '0x89',
  nickname: 'Polygon',
  rpcUrl: 'https://polygon-rpc.com',
  ticker: 'MATIC',
  blockExplorerUrl: 'https://polygonscan.com',
});

// Remove a network
controller.removeNetwork('0x89');

// Switch networks
await controller.setActiveNetwork('networkClientId');

// Get current network state
const chainId = controller.getSelectedChainId();
const networkConfig = controller.getNetworkConfigurationByChainId(chainId);

// Enable/Disable RPC failover
controller.enableRpcFailover();
controller.disableRpcFailover();

// Reset connection
await controller.resetConnection();

// Subscribe to network events
messenger.subscribe('NetworkController:stateChange', (state) => {
  console.log('Network state changed:', state);
});

messenger.subscribe('NetworkController:networkAdded', (config) => {
  console.log('Network added:', config);
});

messenger.subscribe('NetworkController:networkRemoved', (config) => {
  console.log('Network removed:', config);
});
```

## State Management

The controller maintains state with the following structure:

```typescript
interface NetworkState {
  // Currently selected network client ID
  selectedNetworkClientId: NetworkClientId;

  // Network configurations by chain ID
  networkConfigurationsByChainId: Record<Hex, NetworkConfiguration>;

  // Network metadata (accessibility, EIP-1559 support, etc.)
  networksMetadata: NetworksMetadata;
}

interface NetworkConfiguration {
  chainId: Hex;
  nickname?: string;
  rpcEndpoints: RpcEndpoint[];
  ticker: string;
  blockExplorerUrl?: string;
  defaultRpcEndpointIndex: number;
}
```

## Network Operations

The controller provides methods for various network operations:

```typescript
// Find network client ID by chain ID
const networkClientId = controller.findNetworkClientIdByChainId('0x1');

// Get network configuration
const config = controller.getNetworkConfigurationByChainId('0x1');

// Get network client
const client = controller.getNetworkClientById(networkClientId);

// Check if a network is available
const isAvailable = controller.getNetworkStatus('0x1').isAvailable;
```

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  await controller.addNetwork({
    chainId: '0x89',
    rpcUrl: 'https://polygon-rpc.com',
    // ...
  });
} catch (error) {
  if (error.message.includes('already exists')) {
    // Handle duplicate network error
  } else if (error.message.includes('Invalid chain ID')) {
    // Handle invalid chain ID error
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
