# `@metamask/gas-fee-controller`

A controller that manages gas fee estimations in MetaMask. This controller handles fetching, calculating, and updating gas fee estimates for transactions, supporting both legacy gas pricing and EIP-1559 fee market calculations. It provides real-time gas fee estimates with time bounds and supports multiple networks.

## Features

- **EIP-1559 Support**: Full support for EIP-1559 fee market calculations
- **Legacy Gas Support**: Handles legacy gas price estimations for non-EIP-1559 networks
- **Multiple Networks**: Support for different networks with chain-specific calculations
- **Real-time Updates**: Automatic polling for latest gas fee estimates
- **Time Estimates**: Calculate transaction confirmation time estimates
- **Flexible API Sources**: Support for both RPC and external API gas estimates
- **State Management**: Maintains state of gas fee estimates per chain
- **Type Safety**: Written in TypeScript for enhanced type safety
- **Configurable Polling**: Adjustable polling intervals for gas price updates

## Installation

```bash
yarn add @metamask/gas-fee-controller
```

or

```bash
npm install @metamask/gas-fee-controller
```

## Usage

Here's how to use the GasFeeController:

```typescript
import { GasFeeController } from '@metamask/gas-fee-controller';

// Initialize the controller
const controller = new GasFeeController({
  // Polling interval in milliseconds (default: 15000)
  interval: 15000,

  // Required configuration
  messenger,
  getProvider: () => provider,

  // Network compatibility checks
  getCurrentNetworkEIP1559Compatibility: async () => true,
  getCurrentNetworkLegacyGasAPICompatibility: () => false,
  getCurrentAccountEIP1559Compatibility: () => true,

  // API endpoints for gas estimates
  EIP1559APIEndpoint: 'https://gas.api.example.com/v1/<chain_id>',
  legacyAPIEndpoint: 'https://legacy-gas.api.example.com/v1/<chain_id>',

  // Optional client identifier
  clientId: 'your-client-id',
});

// Start polling for gas fee estimates
const pollToken = await controller.getGasFeeEstimatesAndStartPolling();

// Get a one-time gas fee estimate
const estimates = await controller.fetchGasFeeEstimates({
  networkClientId: 'mainnet',
});

// Get time estimate for specific gas fees
const timeEstimate = controller.getTimeEstimate(
  '0x5208', // maxPriorityFeePerGas
  '0x5208', // maxFeePerGas
);

// Stop polling for specific token
controller.disconnectPoller(pollToken);

// Stop all polling
controller.stopPolling();

// Enable/Disable non-RPC gas fee APIs
controller.enableNonRPCGasFeeApis();
controller.disableNonRPCGasFeeApis();

// Subscribe to state changes
messenger.subscribe('GasFeeController:stateChange', (state) => {
  console.log('New gas fee estimates:', state);
});
```

## State Management

The controller maintains state with the following structure:

```typescript
interface GasFeeState {
  gasFeeEstimates: GasFeeEstimates;
  estimatedGasFeeTimeBounds: EstimatedGasFeeTimeBounds;
  gasEstimateType: GasEstimateType;
  gasFeeEstimatesByChainId: Record<Hex, SingleChainGasFeeState>;
  nonRPCGasFeeApisDisabled: boolean;
}

// EIP-1559 Gas Fee Estimates
interface FeeMarketEstimates {
  low: {
    minWaitTimeEstimate: number;
    maxWaitTimeEstimate: number;
    suggestedMaxPriorityFeePerGas: string;
    suggestedMaxFeePerGas: string;
  };
  medium: {
    // ... similar to low
  };
  high: {
    // ... similar to low
  };
  estimatedBaseFee: string;
  networkCongestion: number;
  latestPriorityFeeRange: string[];
  historicalPriorityFeeRange: string[];
  historicalBaseFeeRange: string[];
  priorityFeeTrend: 'up' | 'down' | 'level';
  baseFeeTrend: 'up' | 'down' | 'level';
}

// Legacy Gas Price Estimates
interface LegacyEstimates {
  low: string;
  medium: string;
  high: string;
}
```

## Gas Fee Calculation Types

The controller supports different types of gas fee calculations:

- `fee-market`: EIP-1559 style gas fees with base fee and priority fee
- `legacy`: Traditional gas price estimation
- `eth_gasPrice`: Simple gas price from eth_gasPrice RPC call
- `none`: No estimates available

## Error Handling

The controller provides comprehensive error handling:

```typescript
try {
  await controller.fetchGasFeeEstimates();
} catch (error) {
  if (error.message.includes('network not supported')) {
    // Handle unsupported network
  } else if (error.message.includes('api unavailable')) {
    // Handle API unavailability
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
