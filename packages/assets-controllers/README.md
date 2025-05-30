# `@metamask/assets-controllers`

A comprehensive suite of controllers for managing various digital assets in MetaMask, including ERC-20, ERC-721, and ERC-1155 tokens (including NFTs), as well as handling currency rates and DeFi positions.

## Features

- **Token Management**: Complete handling of ERC-20, ERC-721, and ERC-1155 tokens
- **NFT Support**: Track and manage NFT collections with OpenSea integration
- **Multi-Chain Support**: Handle assets across different blockchain networks
- **DeFi Integration**: Track DeFi positions and balances
- **Real-time Updates**: Automatic polling and updates for balances and rates
- **Exchange Rates**: Track and convert between different currencies and tokens
- **Contract Interactions**: Convenient methods for token contract operations

## Installation

```bash
yarn add @metamask/assets-controllers
```

or

```bash
npm install @metamask/assets-controllers
```

## Controllers

This package features the following controllers:

### Account and Asset Management

- [**AccountTrackerController**](src/AccountTrackerController.ts)

  - Maintains up-to-date list of accounts in the selected keychain
  - Auto-updates on schedule or on demand
  - Tracks account balances and staked balances

- [**AssetsContractController**](src/AssetsContractController.ts)

  - Provides contract interaction methods
  - Retrieves token information
  - Handles token transfers
  - Example:

    ```typescript
    const controller = new AssetsContractController({
      messenger,
      chainId: '0x1',
    });

    // Get token details
    const name = await controller.getERC721AssetName(tokenAddress);
    const symbol = await controller.getERC721AssetSymbol(tokenAddress);
    const balance = await controller.getERC721BalanceOf(
      tokenAddress,
      ownerAddress,
    );
    ```

### NFT Management

- [**CollectibleDetectionController**](src/CollectibleDetectionController.ts)

  - Auto-detects ERC-721 tokens for selected address
  - Periodic updates of NFT holdings

- [**CollectiblesController**](src/CollectiblesController.ts)

  - Tracks ERC-721 and ERC-1155 tokens
  - Integrates with OpenSea for metadata
  - Example:

    ```typescript
    const controller = new CollectiblesController({
      messenger,
      networkType: 'mainnet',
      options: {
        openSeaEnabled: true,
        ipfsGateway: 'https://ipfs.io/ipfs/',
      },
    });

    // Add a collectible
    await controller.addCollectible({
      address: '0x...',
      tokenId: '123',
    });
    ```

### Rate Management

- [**CurrencyRateController**](src/CurrencyRateController.ts)

  - Tracks exchange rates for native currencies
  - Special handling for testnet tokens

- [**RatesController**](src/RatesController/RatesController.ts)

  - Manages exchange rates for various cryptocurrencies
  - Supports non-EVM chains (BTC, SOL, etc.)
  - Example:

    ```typescript
    const controller = new RatesController({
      interval: 180000,
      includeUsdRate: true,
      state: {
        fiatCurrency: 'eur',
        cryptocurrencies: [Cryptocurrency.Btc],
      },
    });

    await controller.start();
    ```

### Token Management

- [**TokenBalancesController**](src/TokenBalancesController.ts)

  - Tracks ERC-20 token balances
  - Periodic balance updates

- [**TokenDetectionController**](src/TokenDetectionController.ts)

  - Auto-detects ERC-20 tokens
  - Periodic scanning for new tokens

- [**TokenListController**](src/TokenListController.ts)

  - Maintains list of known ERC-20 tokens
  - Uses MetaSwap API for metadata

- [**TokensController**](src/TokensController.ts)

  - Central management of token data
  - Example:

    ```typescript
    const controller = new TokensController({
      messenger,
      chainId: '0x1',
    });

    // Add a token
    await controller.addToken({
      address: '0x...',
      symbol: 'TOKEN',
      decimals: 18,
    });
    ```

### DeFi Integration

- [**DeFiPositionsController**](src/DeFiPositionsController/DeFiPositionsController.ts)

  - Tracks DeFi positions
  - Periodic updates of position values
  - Example:

    ```typescript
    const controller = new DeFiPositionsController({
      messenger,
      chainId: '0x1',
    });

    // Get positions
    const positions = controller.getPositions();
    ```

## State Management

Each controller maintains its own state and can be subscribed to for updates:

```typescript
messenger.subscribe(`${controllerName}:stateChange`, (state) => {
  console.log('New state:', state);
});
```

## Error Handling

Controllers implement comprehensive error handling and retry mechanisms:

```typescript
try {
  await controller.updateExchangeRates();
} catch (error) {
  if (error.message.includes('Rate limit exceeded')) {
    // Handle rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await controller.updateExchangeRates();
  }
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
