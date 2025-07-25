# `@metamask/multichain-network-controller`

A controller that manages multi-chain network configurations and interactions in MetaMask. This controller handles both EVM and non-EVM networks (like Bitcoin and Solana), providing seamless network switching, transaction activity tracking, and network state management across different blockchain networks.

## Features

- **Multi-Chain Support**:
  - EVM Networks (Ethereum, BSC, Polygon, etc.)
  - Bitcoin Network (BTC)
  - Solana Network (SOL)
- **Network Management**:
  - Add/Remove Networks (EVM networks)
  - Switch Between Networks
  - Network Status Tracking
- **Transaction Activity**: Track and cache transaction activity across networks
- **State Management**: Persistent storage of network configurations and states
- **Account Integration**: Automatic network switching based on account type
- **Type Safety**: Written in TypeScript with comprehensive type definitions
- **CAIP Compatibility**: Uses CAIP (Chain Agnostic Improvement Proposal) standards
- **Event System**: Rich event system for network-related changes

## Installation

```bash
yarn add @metamask/multichain-network-controller
```

or

```bash
npm install @metamask/multichain-network-controller
```

## Usage

Here's how to use the MultichainNetworkController:

```typescript
import { MultichainNetworkController } from '@metamask/multichain-network-controller';
import { NetworkService } from './your-network-service';

// Initialize the controller
const controller = new MultichainNetworkController({
  messenger,
  networkService: new NetworkService(),
  state: {
    isEvmSelected: true,
    selectedMultichainNetworkChainId: 'eip155:1', // Ethereum Mainnet
    networksWithTransactionActivity: {},
  },
});

// Switch to a different network
// EVM Network (using network client ID)
await controller.setActiveNetwork('mainnet');

// Non-EVM Network (using CAIP chain ID)
await controller.setActiveNetwork('solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ');

// Get networks with transaction activity
const activeNetworks =
  await controller.getNetworksWithTransactionActivityByAccounts();
console.log('Networks with activity:', activeNetworks);

// Remove a network (EVM only)
await controller.removeNetwork('eip155:1');

// Subscribe to network changes
messenger.subscribe(
  'MultichainNetworkController:networkDidChange',
  (networkId) => {
    console.log('Network changed to:', networkId);
  },
);

// Subscribe to state changes
messenger.subscribe('MultichainNetworkController:stateChange', (state) => {
  console.log('New state:', state);
});
```

## State Management

The controller maintains state with the following structure:

```typescript
interface MultichainNetworkControllerState {
  // Network configurations by chain ID
  multichainNetworkConfigurationsByChainId: Record<
    CaipChainId,
    MultichainNetworkConfiguration
  >;

  // Currently selected network chain ID
  selectedMultichainNetworkChainId: SupportedCaipChainId;

  // Whether EVM or non-EVM network is selected
  isEvmSelected: boolean;

  // Active networks by address
  networksWithTransactionActivity: ActiveNetworksByAddress;
}

interface MultichainNetworkConfiguration {
  isEvm: boolean;
  chainId: CaipChainId;
  name: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorerUrls?: string[];
  defaultBlockExplorerUrlIndex?: number;
}
```

## Network Types

The controller supports different types of networks:

- **EVM Networks**: Ethereum and EVM-compatible chains

  - Managed through NetworkController integration
  - Full support for adding/removing networks
  - Uses hex chain IDs internally

- **Non-EVM Networks**: Bitcoin and Solana
  - Pre-configured networks
  - Uses CAIP chain IDs
  - Limited to built-in configurations

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  await controller.setActiveNetwork('unsupported:chain');
} catch (error) {
  if (error.message.includes('Unsupported Caip chain ID')) {
    // Handle unsupported network error
  }
}

try {
  await controller.removeNetwork('solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ');
} catch (error) {
  if (error.message.includes('Removal of non-EVM networks is not supported')) {
    // Handle non-EVM network removal error
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
