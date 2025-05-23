# `@metamask/bridge-controller`

A controller that manages cross-chain bridge quote fetching and transaction preparation functionality for MetaMask. This controller enables users to perform token swaps across different blockchain networks by fetching quotes from various bridge providers and handling the necessary transaction preparations.

## Features

- **Cross-Chain Quote Fetching**: Fetches and manages quotes for cross-chain token swaps
- **Multi-Chain Support**: Supports multiple blockchain networks including:
  - Ethereum Mainnet
  - BSC
  - Polygon
  - zkSync Era
  - Avalanche
  - Optimism
  - Arbitrum
  - Linea
  - Base
  - Solana
- **Smart Transaction Support**: Handles both regular and smart transactions
- **Real-time Quote Updates**: Automatically refreshes quotes at configurable intervals
- **Token Allowance Management**: Handles ERC20 token approvals for bridge contracts
- **Price Impact Monitoring**: Tracks and reports price impact for swaps
- **Error Handling**: Comprehensive error handling for quote fetching and transaction preparation

## Installation

```bash
yarn add @metamask/bridge-controller
```

or

```bash
npm install @metamask/bridge-controller
```

## Usage

Here's how to initialize and use the BridgeController:

```typescript
import { BridgeController } from '@metamask/bridge-controller';

const controller = new BridgeController({
  messenger, // Controller messaging system
  clientId: 'metamask', // Bridge client identifier
  getLayer1GasFee: async ({ transactionParams, chainId }) => {
    // Function to estimate L1 gas fees for L2 transactions
    return estimatedGasFee;
  },
  fetchFn: fetch, // Function for making HTTP requests
  config: {
    customBridgeApiBaseUrl: 'https://your-bridge-api.com', // Optional
  },
  trackMetaMetricsFn: (eventName, properties) => {
    // Function to track metrics
  },
});

// Update quote request parameters
await controller.updateBridgeQuoteRequestParams(
  {
    srcChainId: '1', // Ethereum mainnet
    destChainId: '137', // Polygon
    srcTokenAddress: '0x...', // Source token address
    destTokenAddress: '0x...', // Destination token address
    amount: '1000000000000000000', // Amount in smallest unit
    slippage: 1, // Slippage percentage
  },
  {
    // Context for analytics
  },
);

// Listen for state changes
messenger.subscribe('BridgeController:stateChange', (state) => {
  console.log('New quotes:', state.quotes);
  console.log('Quote status:', state.quotesLoadingStatus);
});

// Check ERC20 allowance
const allowance = await controller.getBridgeERC20Allowance(
  '0x...', // Token contract address
  '0x1', // Chain ID in hex
);
```

## State Management

The controller maintains state with the following structure:

```typescript
interface BridgeControllerState {
  quoteRequest: {
    srcTokenAddress: string;
    destTokenAddress?: string;
    srcChainId?: string;
    destChainId?: string;
    amount?: string;
    slippage?: number;
    // ... other request parameters
  };
  quotes: QuoteResponse[];
  quotesLastFetched: number | null;
  quotesLoadingStatus: RequestStatus | null;
  quoteFetchError: string | null;
  quotesRefreshCount: number;
  assetExchangeRates: Record<string, number>;
}
```

## API Reference

### Methods

- `updateBridgeQuoteRequestParams(params, context)`: Update quote request parameters and fetch new quotes
- `getBridgeERC20Allowance(contractAddress, chainId)`: Get token allowance for bridge contract
- `setChainIntervalLength()`: Set quote refresh interval based on source chain
- `resetState()`: Reset controller state to default

### Events

- `stateChange`: Emitted when the controller's state changes
- `quotesRequested`: Emitted when new quotes are requested
- `quoteError`: Emitted when quote fetching fails

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
