# Network Enablement Controller

A MetaMask controller for managing network enablement state across different blockchain networks.

## Overview

The NetworkEnablementController tracks which networks are enabled/disabled for the user and provides methods to toggle network states. It supports both EVM (EIP-155) and non-EVM networks like Solana.

## Installation

```bash
npm install @metamask/network-enablement-controller
```

## Usage

### Basic Controller Usage

```typescript
import { NetworkEnablementController } from '@metamask/network-enablement-controller';

// Create controller instance
const controller = new NetworkEnablementController({
  messenger,
  state: {
    enabledNetworkMap: {
      eip155: {
        '0x1': true, // Ethereum mainnet enabled
        '0xa': false, // Optimism disabled
      },
      solana: {
        'solana:mainnet': true,
      },
    },
  },
});

// Enable a network
controller.setEnabledNetwork('0x1'); // Hex format for EVM
controller.setEnabledNetwork('eip155:1'); // CAIP-2 format for EVM
controller.setEnabledNetwork('solana:mainnet'); // CAIP-2 format for Solana

// Disable a network
controller.setDisabledNetwork('0xa');

// Check if network is enabled
const isEnabled = controller.isNetworkEnabled('0x1');

// Get all enabled networks for a namespace
const evmNetworks = controller.getEnabledNetworksForNamespace('eip155');

// Get all enabled networks across all namespaces
const allNetworks = controller.getAllEnabledNetworks();
```

### Using Selectors (Redux-style)

The controller also provides selectors that can be used in Redux contexts or any state management system:

```typescript
import {
  selectIsNetworkEnabled,
  selectAllEnabledNetworks,
  selectEnabledNetworksForNamespace,
  selectEnabledEvmNetworks,
  selectEnabledSolanaNetworks,
} from '@metamask/network-enablement-controller';

// Get controller state
const state = controller.state;

// Check if a specific network is enabled
const isEthereumEnabled = selectIsNetworkEnabled('0x1')(state);
const isSolanaEnabled = selectIsNetworkEnabled('solana:mainnet')(state);

// Get all enabled networks across all namespaces
const allEnabledNetworks = selectAllEnabledNetworks(state);
// Returns: { eip155: ['0x1'], solana: ['solana:mainnet'] }

// Get enabled networks for a specific namespace
const evmNetworks = selectEnabledNetworksForNamespace('eip155')(state);
const solanaNetworks = selectEnabledNetworksForNamespace('solana')(state);

// Convenience selectors for specific network types
const enabledEvmNetworks = selectEnabledEvmNetworks(state);
const enabledSolanaNetworks = selectEnabledSolanaNetworks(state);

// Get total count of enabled networks
const totalEnabled = selectEnabledNetworksCount(state);

// Check if any networks are enabled for a namespace
const hasEvmNetworks = selectHasEnabledNetworksForNamespace('eip155')(state);
```

## API Reference

### Controller Methods

#### `setEnabledNetwork(chainId: Hex | CaipChainId): void`

Enables a network for the user. Accepts either Hex chain IDs (for EVM networks) or CAIP-2 chain IDs (for any blockchain network).

#### `setDisabledNetwork(chainId: Hex | CaipChainId): void`

Disables a network for the user. Prevents disabling the last remaining enabled network.

#### `isNetworkEnabled(chainId: Hex | CaipChainId): boolean`

Checks if a network is currently enabled. Returns false for unknown networks.

#### `getEnabledNetworksForNamespace(namespace: CaipNamespace): string[]`

Gets all enabled networks for a specific namespace.

#### `getAllEnabledNetworks(): Record<CaipNamespace, string[]>`

Gets all enabled networks across all namespaces.

### Selectors

#### `selectIsNetworkEnabled(chainId: Hex | CaipChainId)`

Returns a selector function that checks if a specific network is enabled.

#### `selectAllEnabledNetworks`

Returns a selector function that gets all enabled networks across all namespaces.

#### `selectEnabledNetworksForNamespace(namespace: CaipNamespace)`

Returns a selector function that gets enabled networks for a specific namespace.

#### `selectEnabledNetworksCount`

Returns a selector function that gets the total count of enabled networks.

#### `selectHasEnabledNetworksForNamespace(namespace: CaipNamespace)`

Returns a selector function that checks if any networks are enabled for a namespace.

#### `selectEnabledEvmNetworks`

Returns a selector function that gets all enabled EVM networks.

#### `selectEnabledSolanaNetworks`

Returns a selector function that gets all enabled Solana networks.

## Chain ID Formats

The controller supports two chain ID formats:

1. **Hex format**: Traditional EVM chain IDs (e.g., `'0x1'` for Ethereum mainnet)
2. **CAIP-2 format**: Chain Agnostic Improvement Proposal format (e.g., `'eip155:1'` for Ethereum mainnet, `'solana:mainnet'` for Solana)

## Network Types

### EVM Networks (eip155 namespace)

- Ethereum Mainnet: `'0x1'` or `'eip155:1'`
- Optimism: `'0xa'` or `'eip155:10'`
- Arbitrum One: `'0xa4b1'` or `'eip155:42161'`

### Solana Networks (solana namespace)

- Solana Mainnet: `'solana:mainnet'`
- Solana Testnet: `'solana:testnet'`

## State Persistence

The controller state is automatically persisted and restored between sessions. The `enabledNetworkMap` is stored anonymously to protect user privacy.

## Safety Features

- **At least one network enabled**: The controller ensures at least one network is always enabled
- **Unknown network protection**: Prevents enabling networks not configured in the system
- **Exclusive mode**: When enabling non-popular networks, all other networks are disabled
- **Last network protection**: Prevents disabling the last remaining enabled network
