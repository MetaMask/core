# `@metamask/assets-controllers`

Controllers which manage interactions involving ERC-20, ERC-721, and ERC-1155 tokens (including NFTs).

## Installation

`yarn add @metamask/assets-controllers`

or

`npm install @metamask/assets-controllers`

## Controllers

This package features the following controllers:

- [**AccountTrackerController**](src/AccountTrackerController.ts) keeps a updated list of the accounts in the currently selected keychain which is updated automatically on a schedule or on demand.
- [**AssetsContractController**](src/AssetsContractController.ts) provides a set of convenience methods that use contracts to retrieve information about tokens, read token balances, and transfer tokens.
- [**CollectibleDetectionController**](src/CollectibleDetectionController.ts) keeps a periodically updated list of ERC-721 tokens assigned to the currently selected address.
- [**CollectiblesController**](src/CollectiblesController.ts) tracks ERC-721 and ERC-1155 tokens assigned to the currently selected address, using OpenSea to retrieve token information.
- [**CurrencyRateController**](src/CurrencyRateController.ts) keeps a periodically updated value of the exchange rate from the currently selected "native" currency to another (handling testnet tokens specially).
- [**RatesController**](src/RatesController/RatesController.ts) keeps a periodically updated value for the exchange rates for different cryptocurrencies. The difference between the `RatesController` and `CurrencyRateController` is that the second one is coupled to the `NetworksController` and is EVM specific, whilst the first one can handle different blockchain currencies like BTC and SOL.
- [**TokenBalancesController**](src/TokenBalancesController.ts) keeps a periodically updated set of balances for the current set of ERC-20 tokens.
- [**TokenDetectionController**](src/TokenDetectionController.ts) keeps a periodically updated list of ERC-20 tokens assigned to the currently selected address.
- [**TokenListController**](src/TokenListController.ts) uses the MetaSwap API to keep a periodically updated list of known ERC-20 tokens along with their metadata.
- [**TokenRatesController**](src/TokenRatesController.ts) keeps a periodically updated list of exchange rates for known ERC-20 tokens relative to the currently selected native currency.
- [**TokensController**](src/TokensController.ts) stores the ERC-20 and ERC-721 tokens, along with their metadata, that are listed in the wallet under the currently selected address on the currently selected chain.

### `RatesController`

The `RatesController` is responsible for managing the state related to cryptocurrency exchange rates and periodically updating these rates by fetching new data from an external API.

```ts
// Initialize the RatesController
const ratesController = new RatesController({
  interval: 180000,
  includeUsdRate: true,
  state: {
    fiatCurrency: 'eur',
    cryptocurrencies: [Cryptocurrency.Btc],
  },
});

// Start the polling process
ratesController.start().then(() => {
  console.log('Polling for exchange rates has started.');
});

// Stop the polling process after some time
setTimeout(() => {
  ratesController.stop().then(() => {
    console.log('Polling for exchange rates has stopped.');
  });
}, 300000);
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
