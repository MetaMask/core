# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add and export new types `AssetsContractControllerMessenger`, `AssetsContractControllerActions`, `AssetsContractControllerEvents`, `AssetsContractControllerGetERC20StandardAction`, `AssetsContractControllerGetERC721StandardAction`, `AssetsContractControllerGetERC1155StandardAction`, `AssetsContractControllerGetERC20BalanceOfAction`, `AssetsContractControllerGetERC20TokenDecimalsAction`, `AssetsContractControllerGetERC20TokenNameAction`, `AssetsContractControllerGetERC721NftTokenIdAction`, `AssetsContractControllerGetERC721TokenURIAction`, `AssetsContractControllerGetERC721AssetNameAction`, `AssetsContractControllerGetERC721AssetSymbolAction`, `AssetsContractControllerGetERC721OwnerOfAction`, `AssetsContractControllerGetERC1155TokenURIAction`, `AssetsContractControllerGetERC1155BalanceOfAction`, `AssetsContractControllerTransferSingleERC1155Action`, `AssetsContractControllerGetTokenStandardAndDetailsAction`, `AssetsContractControllerGetBalancesInSingleCallAction` [#4397](https://github.com/MetaMask/core/pull/4397)

## [34.0.0]

### Added

- Add `AccountTrackerControllerGetStateAction`, `AccountTrackerControllerActions`, `AccountTrackerControllerStateChangeEvent`, and `AccountTrackerControllerEvents` types ([#4407](https://github.com/MetaMask/core/pull/4407))
- Add `setIntervalLength` and `getIntervalLength` methods to `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - `setIntervalLength` replaces updating the polling interval via `configure`.

### Changed

- **BREAKING** `TokenBalancesController` messenger must allow the action `AccountsController:getSelectedAccount` and remove `PreferencesController:getState`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenDetectionController` messenger must allow the action `AccountsController:getAccount`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenDetectionController` messenger must allow the event `AccountsController:selectedEvmAccountChange` and remove `AccountsController:selectedAccountChange`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenRatesController` messenger must allow the action `AccountsController:getAccount`, `AccountsController:getSelectedAccount` and remove `PreferencesController:getState`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenRatesController` messenger must allow the event `AccountsController:selectedEvmAccountChange` and remove `PreferencesController:stateChange`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokensController` messenger must allow the action `AccountsController:getAccount`, `AccountsController:getSelectedAccount`.
- **BREAKING** `TokensController` messenger must allow the event `AccountsController:selectedEvmAccountChange`. ([#4219](https://github.com/MetaMask/core/pull/4219))
- Upgrade AccountTrackerController to BaseControllerV2 ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** Convert `AccountInformation` from interface to type ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** Rename `AccountTrackerState` to `AccountTrackerControllerState` and convert from interface to type ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** `AccountTrackerController` now inherits from `StaticIntervalPollingController` instead of `StaticIntervalPollingControllerV1` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - The constructor now takes a single options object rather than three arguments. Some options have been removed; see later entries.
- **BREAKING:** The `AccountTrackerController` messenger must now allow the actions `PreferencesController:getState`, `NetworkController:getState`, and `NetworkController:getNetworkClientById` ([#4407](https://github.com/MetaMask/core/pull/4407))
- **BREAKING:** The `refresh` method is no longer pre-bound to the controller ([#4407](https://github.com/MetaMask/core/pull/4407))
  - You may now need to pre-bind it e.g. `accountTrackerController.refresh.bind(accountTrackerController)`.
- Bump `@metamask/accounts-controller` to `^17.1.0` ([#4460](https://github.com/MetaMask/core/pull/4460))

### Removed

- **BREAKING** `TokensController` removes `selectedAddress` constructor argument. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING** `TokenDetectionController` removes `selectedAddress` constructor argument. ([#4219](https://github.com/MetaMask/core/pull/4219))
- **BREAKING:** Remove `AccountTrackerConfig` type ([#4407](https://github.com/MetaMask/core/pull/4407))
  - Some of these properties have been merged into the options that the `AccountTrackerController` constructor takes.
- **BREAKING:** Remove `config` property and `configure` method from `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - The controller now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `provider`, `getMultiAccountBalancesEnabled`, `getCurrentChainId`, and `getNetworkClientById` from configuration options for `AccountTrackerController` ([#4407](https://github.com/MetaMask/core/pull/4407))
  - The provider is now obtained directly from the network controller on demand.
  - The messenger is now used in place of the callbacks.

## [33.0.0]

### Added

- **BREAKING:** Add `messenger` as a constructor option for `AccountTrackerController` ([#4225](https://github.com/MetaMask/core/pull/4225))
- **BREAKING:** Add `messenger` option to `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - This messenger must allow the actions `TokensController:getState`, `NetworkController:getNetworkClientById`, `NetworkController:getState`, and `PreferencesController:getState` and allow the events `PreferencesController:stateChange`, `TokensController:stateChange`, and `NetworkController:stateChange`.
- Add types `TokenRatesControllerGetStateAction`, `TokenRatesControllerActions`, `TokenRatesControllerStateChangeEvent`, `TokenRatesControllerEvents`, `TokenRatesControllerMessenger`([#4314](https://github.com/MetaMask/core/pull/4314))
- Add function `getDefaultTokenRatesControllerState` ([#4314](https://github.com/MetaMask/core/pull/4314))
- Add `enable` and `disable` methods to `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - These are used to stop and restart polling.
- Export `ContractExchangeRates` type ([#4314](https://github.com/MetaMask/core/pull/4314))
  - Add `AccountTrackerControllerMessenger` type
- **BREAKING:** The `NftController` messenger must now allow `AccountsController:getAccount` and `AccountsController:getSelectedAccount` as messenger actions and `AccountsController:selectedEvmAccountChange` as a messenger event ([#4221](https://github.com/MetaMask/core/pull/4221))
- **BREAKING:** `NftDetectionController` messenger must now allow `AccountsController:getSelectedAccount` as a messenger action ([#4221](https://github.com/MetaMask/core/pull/4221))
- Token price API support for mantle network ([#4376](https://github.com/MetaMask/core/pull/4376))

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/accounts-controller` to `^17.0.0` ([#4413](https://github.com/MetaMask/core/pull/4413))
- **BREAKING:** `TokenRatesController` now inherits from `StaticIntervalPollingController` instead of `StaticIntervalPollingControllerV1` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - The constructor now takes a single options object rather than three arguments. Some options have been removed; see later entries.
- **BREAKING:** Rename `TokenRatesState` to `TokenRatesControllerState`, and convert from `interface` to `type` ([#4314](https://github.com/MetaMask/core/pull/4314))
- The `NftController` now reads the selected address via the `AccountsController`, using the `AccountsController:selectedEvmAccountChange` messenger event to stay up to date ([#4221](https://github.com/MetaMask/core/pull/4221))
- `NftDetectionController` now reads the currently selected account from `AccountsController` instead of `PreferencesController` ([#4221](https://github.com/MetaMask/core/pull/4221))
- Bump `@metamask/keyring-api` to `^8.0.0` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/eth-snap-keyring` to `^4.3.1` ([#4405](https://github.com/MetaMask/core/pull/4405))
- Bump `@metamask/keyring-controller` to `^17.1.0` ([#4413](https://github.com/MetaMask/core/pull/4413))

### Removed

- **BREAKING:** Remove `nativeCurrency`, `chainId`, `selectedAddress`, `allTokens`, and `allDetectedTokens` from configuration options for `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - The messenger is now used to obtain information from other controllers where this data was originally expected to come from.
- **BREAKING:** Remove `config` property and `configure` method from `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - The controller now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `TokenRatesController` ([#4314](https://github.com/MetaMask/core/pull/4314))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `TokenRatesConfig` type ([#4314](https://github.com/MetaMask/core/pull/4314))
  - Some of these properties have been merged into the options that `TokenRatesController` takes.
- **BREAKING:** Remove `NftController` constructor options `selectedAddress`. ([#4221](https://github.com/MetaMask/core/pull/4221))
- **BREAKING:** Remove `AccountTrackerController` constructor options `getIdentities`, `getSelectedAddress` and `onPreferencesStateChange` ([#4225](https://github.com/MetaMask/core/pull/4225))
- **BREAKING:** Remove `value` property from the data for each token in `state.marketData` ([#4364](https://github.com/MetaMask/core/pull/4364))
  - The `price` property should be used instead.

### Fixed

- Prevent unnecessary state updates when executing the `NftController`'s `updateNftMetadata` method by comparing the metadata of fetched NFTs and NFTs in state and synchronizing state updates using a mutex lock. ([#4325](https://github.com/MetaMask/core/pull/4325))
- Prevent the use of market data when not available for a given token ([#4361](https://github.com/MetaMask/core/pull/4361))
- Fix `refresh` method remaining locked indefinitely after it was run successfully. Now lock is released on successful as well as failed runs. ([#4270](https://github.com/MetaMask/core/pull/4270))
- `TokenRatesController` uses checksum instead of lowercase format for token addresses ([#4377](https://github.com/MetaMask/core/pull/4377))

## [32.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump dependency and peer dependency `@metamask/accounts-controller` to `^16.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^7.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/keyring-controller` to `^17.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/preferences-controller` to `^13.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/polling-controller` to `^8.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [31.0.0]

### Added

- **BREAKING:** The `NftDetectionController` now takes a `messenger`, which can be used for communication ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This messenger must allow the following actions `ApprovalController:addRequest`, `NetworkController:getState`, `NetworkController:getNetworkClientById`, and `PreferencesController:getState`, and must allow the events `PreferencesController:stateChange` and `NetworkController:stateChange`
- Add `NftDetectionControllerMessenger` type ([#4312](https://github.com/MetaMask/core/pull/4312))
- Add `NftControllerGetStateAction`, `NftControllerActions`, `NftControllerStateChangeEvent`, and `NftControllerEvents` types ([#4310](https://github.com/MetaMask/core/pull/4310))
- Add `NftController:getState` and `NftController:stateChange` as an available action and event to the `NftController` messenger ([#4310](https://github.com/MetaMask/core/pull/4310))

### Changed

- **BREAKING:** Change `TokensController` to inherit from `BaseController` rather than `BaseControllerV1` ([#4304](https://github.com/MetaMask/core/pull/4304))
  - The constructor now takes a single options object rather than three arguments, and all properties in `config` are now part of options.
- **BREAKING:** Rename `TokensState` type to `TokensControllerState` ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Make all `TokensController` methods and properties starting with `_` private ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Convert `Token` from `interface` to `type` ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Replace `balanceError` property in `Token` with `hasBalanceError`; update `TokenBalancesController` so that it no longer captures the error resulting from getting the balance of an ERC-20 token ([#4304](https://github.com/MetaMask/core/pull/4304))
- **BREAKING:** Change `NftDetectionController` to inherit from `StaticIntervalPollingController` rather than `StaticIntervalPollingControllerV1` ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The constructor now takes a single options object rather than three arguments, and all properties in `config` are now part of options.
- **BREAKING:** Convert `ApiNft`, `ApiNftContract`, `ApiNftLastSale`, and `ApiNftCreator` from `interface` to `type` ([#4312](https://github.com/MetaMask/core/pull/4312))
- **BREAKING:** Change `NftController` to inherit from `BaseController` rather than `BaseControllerV1` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - The constructor now takes a single options object rather than three arguments, and all properties in `config` are now part of options.
- **BREAKING:** Convert `Nft`, `NftContract`, and `NftMetadata` from `interface` to `type` ([#4310](https://github.com/MetaMask/core/pull/4310))
- **BREAKING:** Rename `NftState` to `NftControllerState`, and convert to `type` ([#4310](https://github.com/MetaMask/core/pull/4310))
- **BREAKING:** Rename `getDefaultNftState` to `getDefaultNftControllerState` ([#4310](https://github.com/MetaMask/core/pull/4310))
- **BREAKING:** Bump dependency and peer dependency `@metamask/accounts-controller` to `^15.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^6.0.2` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/keyring-controller` to `^16.1.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/preferences-controller` to `^12.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Change `NftDetectionController` method `detectNfts` so that `userAddress` option is optional ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This will default to the currently selected address as kept by PreferencesController.
- Bump `async-mutex` to `^0.5.0` ([#4335](https://github.com/MetaMask/core/pull/4335))
- Bump `@metamask/polling-controller` to `^7.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

### Removed

- **BREAKING:** Remove `config` property and `configure` method from `TokensController` ([#4304](https://github.com/MetaMask/core/pull/4304))
  - The `TokensController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `TokensController` ([#4304](https://github.com/MetaMask/core/pull/4304))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `TokensConfig` type ([#4304](https://github.com/MetaMask/core/pull/4304))
  - These properties have been merged into the options that `TokensController` takes.
- **BREAKING:** Remove `config` property and `configure` method from `TokensController` ([#4312](https://github.com/MetaMask/core/pull/4312))
  - `TokensController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `NftDetectionController` ([#4312](https://github.com/MetaMask/core/pull/4312))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `chainId` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now read the `networkClientId` from the NetworkController state through the messenger when needed.
- **BREAKING:** Remove `getNetworkClientById` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now call `NetworkController:getNetworkClientId` through the messenger object.
- **BREAKING:** Remove `onPreferencesStateChange` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now call `PreferencesController:stateChange` through the messenger object.
- **BREAKING:** Remove `onNetworkStateChange` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - The controller will now read the `networkClientId` from the NetworkController state through the messenger when needed.
- **BREAKING:** Remove `getOpenSeaApiKey` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This was never used.
- **BREAKING:** Remove `getNftApi` as a `NftDetectionController` constructor argument ([#4312](https://github.com/MetaMask/core/pull/4312))
  - This was never used.
- **BREAKING:** Remove `NftDetectionConfig` type ([#4312](https://github.com/MetaMask/core/pull/4312))
  - These properties have been merged into the options that `NftDetectionController` takes.
- **BREAKING:** Remove `config` property and `configure` method from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - `NftController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `notify`, `subscribe`, and `unsubscribe` methods from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Remove `onPreferencesStateChange` as a `NftController` constructor argument ([#4310](https://github.com/MetaMask/core/pull/4310))
  - The controller will now call `PreferencesController:stateChange` through the messenger object.
- **BREAKING:** Remove `onNetworkStateChange` as a `NftController` constructor argument ([#4310](https://github.com/MetaMask/core/pull/4310))
  - The controller will now call `NetworkController:stateChange` through the messenger object.
- **BREAKING:** Remove `NftConfig` type ([#4310](https://github.com/MetaMask/core/pull/4310))
  - These properties have been merged into the options that `NftController` takes.
- **BREAKING:** Remove `config` property and `configure` method from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - `NftController` now takes a single options object which can be used for configuration, and configuration is now kept internally.
- **BREAKING:** Remove `hub` property from `NftController` ([#4310](https://github.com/MetaMask/core/pull/4310))
  - Use the controller messenger for subscribing to and publishing events instead.
- **BREAKING:** Modify `TokenListController` so that tokens fetched from the API and stored in state will no longer have `storage` and `erc20` properties ([#4235](https://github.com/MetaMask/core/pull/4235))
  - These properties were never officially supported, but they were present in state anyway.

## [30.0.0]

### Added

- Adds a new field `marketData` to the state of `TokenRatesController` ([#4206](https://github.com/MetaMask/core/pull/4206))
- Adds a new `RatesController` to manage prices for non-EVM blockchains ([#4242](https://github.com/MetaMask/core/pull/4242))

### Changed

- **BREAKING:** Changed price and token API endpoints from `*.metafi.codefi.network` to `*.api.cx.metamask.io` ([#4301](https://github.com/MetaMask/core/pull/4301))
- When fetching token list for Linea Mainnet, use `occurrenceFloor` parameter of 1 instead of 3, and filter tokens to those with a `lineaTeam` aggregator or more than 3 aggregators ([#4253](https://github.com/MetaMask/core/pull/4253))
- **BREAKING:** The NftController messenger must now allow the `NetworkController:getNetworkClientById` action ([#4305](https://github.com/MetaMask/core/pull/4305))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.2` ([#4332](https://github.com/MetaMask/core/pull/4332))
- Bump `@metamask/keyring-api` to `^6.1.1` ([#4262](https://github.com/MetaMask/core/pull/4262))

### Removed

- **BREAKING:** Removed `contractExchangeRates` and `contractExchangeRatesByChainId` from the state of `TokenRatesController` ([#4206](https://github.com/MetaMask/core/pull/4206))

### Fixed

- Only update NFT state when metadata actually changes ([#4143](https://github.com/MetaMask/core/pull/4143))

## [29.0.0]

### Added

- Add token detection on 7 more networks ([#4184](https://github.com/MetaMask/core/pull/4184))
  - New supported networks are: cronos, celo, gnosis, fantom, polygon_zkevm, moonbeam, and moonriver

### Changed

- **BREAKING** Changed `NftDetectionController` constructor `options` argument ([#4178](https://github.com/MetaMask/core/pull/4178))
  - Added `options.disabled` and `options.selectedAddress` properties
- **BREAKING** Bump `@metamask/keyring-controller` peer dependency to ^16.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- **BREAKING** Bump `@metamask/accounts-controller` peer dependency to ^14.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- **BREAKING** Bump `@metamask/preferences-controller` peer dependency to ^11.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/keyring-api` to `^6.0.0` ([#4193](https://github.com/MetaMask/core/pull/4193))
- Lower number of tokens returned by API calls ([#4207](https://github.com/MetaMask/core/pull/4207))
  - Limit changed from `200` to `50`
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/approval-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/polling-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))

## [28.0.0]

### Added

- Add reservoir migration ([#4030](https://github.com/MetaMask/core/pull/4030))

### Changed

- Fix getting nft tokenURI ([#4136](https://github.com/MetaMask/core/pull/4136))
- **BREAKING** Bump peer dependency on `@metamask/keyring-controller` ([#4090](https://github.com/MetaMask/core/pull/4090))
- Fix token detection during account change ([#4133](https://github.com/MetaMask/core/pull/4133))
- Fix update nft metadata when toggles off ([#4096](https://github.com/MetaMask/core/pull/4096))
- Adds `tokenMethodIncreaseAllowance` ([#4069](https://github.com/MetaMask/core/pull/4069))
- Fix mantle token mispriced ([#4045](https://github.com/MetaMask/core/pull/4045))

## [27.2.0]

### Added

- `CodefiTokenPricesServiceV2` exports `SUPPORTED_CHAIN_IDS`, an array of chain IDs supported by Codefi Price API V2. ([#4079](https://github.com/MetaMask/core/pull/4079))

- Added `tokenURI` key to `compareNftMetadata` function to compare nft metadata entries with. ([#3856](https://github.com/MetaMask/core/pull/3856))

## [27.1.0]

### Added

- Add `updateNftMetadata` method to `NftController` to update metadata for the requested NFTs ([#4008](https://github.com/MetaMask/core/pull/4008))

## [27.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [27.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/accounts-controller` to `^12.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/approval-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/keyring-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/preferences-controller` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Relax `TokensControllerGetStateAction` and `TokensControllerStateChangeEvent` types so that they no longer constrain the `TokensController` state in the action handler and event payload to `Record<string, Json>` ([#3949](https://github.com/MetaMask/core/pull/3949))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/polling-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [26.0.0]

### Added

- **BREAKING:** `TokenDetectionController` newly subscribes to the `PreferencesController:stateChange`, `AccountsController:selectedAccountChange`, `KeyringController:lock`, and `KeyringController:unlock` events, and allows messenger actions `AccountsController:getSelectedAccount`, `NetworkController:getNetworkClientById`, `NetworkController:getNetworkConfigurationByNetworkClientId`, `NetworkController:getState`, `KeyringController:getState`, `PreferencesController:getState`, `TokenListController:getState`, `TokensController:getState`, and `TokensController:addDetectedTokens` ([#3775](https://github.com/MetaMask/core/pull/3775/), [#3923](https://github.com/MetaMask/core/pull/3923/), [#3938](https://github.com/MetaMask/core/pull/3938))
- `TokensController` now exports `TokensControllerActions`, `TokensControllerGetStateAction`, `TokensControllerAddDetectedTokensAction`, `TokensControllerEvents`, and `TokensControllerStateChangeEvent` ([#3690](https://github.com/MetaMask/core/pull/3690/))

### Changed

- **BREAKING:** Add `@metamask/accounts-controller` `^11.0.0` as dependency and peer dependency ([#3775](https://github.com/MetaMask/core/pull/3775/), [#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** Add `@metamask/keyring-controller` `^13.0.0` as dependency and peer dependency ([#3775](https://github.com/MetaMask/core/pull/3775), [#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** Bump `@metamask/preferences-controller` dependency and peer dependency to `^8.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** `TokenDetectionController` is merged with `DetectTokensController` from the `metamask-extension` repo ([#3775](https://github.com/MetaMask/core/pull/3775/), [#3923](https://github.com/MetaMask/core/pull/3923)), ([#3938](https://github.com/MetaMask/core/pull/3938))
  - **BREAKING:** `TokenDetectionController` now resets its polling interval to the default value of 3 minutes when token detection is triggered by external controller events `KeyringController:unlock`, `TokenListController:stateChange`, `PreferencesController:stateChange`, `AccountsController:selectedAccountChange`.
  - **BREAKING:** `TokenDetectionController` now refetches tokens on `NetworkController:networkDidChange` if the `networkClientId` is changed instead of `chainId`.
  - **BREAKING:** `TokenDetectionController` cannot initiate polling or token detection if `KeyringController` state is locked.
  - **BREAKING:** The `detectTokens` method input option `accountAddress` has been renamed to `selectedAddress`.
  - **BREAKING:** The `detectTokens` method now excludes tokens that are already included in the `TokensController`'s `detectedTokens` list from the batch of incoming tokens it sends to the `TokensController` `addDetectedTokens` method.
  - **BREAKING:** The constructor for `TokenDetectionController` expects a new required property `trackMetaMetricsEvent`, which defines the callback that is called in the `detectTokens` method.
  - **BREAKING:** In Mainnet, even if the `PreferenceController`'s `useTokenDetection` option is set to false, automatic token detection is performed on the legacy token list (token data from the contract-metadata repo).
  - **BREAKING:** The `TokensState` type is now defined as a type alias rather than an interface. ([#3690](https://github.com/MetaMask/core/pull/3690/))
    - This is breaking because it could affect how this type is used with other types, such as `Json`, which does not support TypeScript interfaces.
  - The constructor option `selectedAddress` no longer defaults to `''` if omitted. Instead, the correct address is assigned using the `AccountsController:getSelectedAccount` messenger action.
- **BREAKING:** Change type of `provider` property in `AssetsContractController` from `any` to `Provider` from `@metamask/network-controller` ([#3818](https://github.com/MetaMask/core/pull/3818))
- **BREAKING:** Change type of `provider` property in `TokensController` from `any` to `Provider` from `@metamask/network-controller` ([#3818](https://github.com/MetaMask/core/pull/3818))
- Bump `@metamask/approval-controller` to `^5.1.3` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/ethjs-unit` to `^0.3.0` ([#3897](https://github.com/MetaMask/core/pull/3897))
- Bump `@metamask/network-controller` to `^17.2.1` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/polling-controller` to `^5.0.1` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3970](https://github.com/MetaMask/core/pull/3970), [#3954](https://github.com/MetaMask/core/pull/3954))
- Replace `ethereumjs-util` with `@ethereumjs/util` and `bn.js` ([#3943](https://github.com/MetaMask/core/pull/3943))
- Update `CodefiTokenPricesServiceV2` so that requests to the price API now use the `No-Cache` HTTP header ([#3939](https://github.com/MetaMask/core/pull/3939))

### Removed

- **BREAKING:** `TokenDetectionController` constructor no longer accepts options `networkClientId`, `onPreferencesStateChange`, `getPreferencesState`, `getTokensState`, or `addDetectedTokens` ([#3690](https://github.com/MetaMask/core/pull/3690/), [#3775](https://github.com/MetaMask/core/pull/3775/), [#3938](https://github.com/MetaMask/core/pull/3938))
- **BREAKING:** `TokenDetectionController` no longer allows the `NetworkController:stateChange` event. ([#3775](https://github.com/MetaMask/core/pull/3775/))
  - The `NetworkController:networkDidChange` event can be used instead.
- **BREAKING:** `TokenDetectionController` constructor no longer accepts options `networkClientId`, `onPreferencesStateChange`, `getPreferencesState`, `getTokensState`, or `addDetectedTokens` ([#3690](https://github.com/MetaMask/core/pull/3690/), [#3775](https://github.com/MetaMask/core/pull/3775/), [#3938](https://github.com/MetaMask/core/pull/3938))
- **BREAKING:** `TokenBalancesController` constructor no longer accepts options `onTokensStateChange`, `getSelectedAddress` ([#3690](https://github.com/MetaMask/core/pull/3690/))

### Fixed

- `TokenDetectionController.detectTokens()` now reads the chain ID keyed state properties from `TokenListController` and `TokensController` rather than incorrectly using the globally selected state properties when a network client ID is passed ([#3914](https://github.com/MetaMask/core/pull/3914))
- Fix `PreferencesController` state listener in `NftDetectionController` so that NFT detection is not run when any preference changes, but only when NFT detection is enabled ([#3917](https://github.com/MetaMask/core/pull/3917))
- Fix `isTokenListSupportedForNetwork` so that it returns false for chain 1337 ([#3777](https://github.com/MetaMask/core/pull/3777))
  - When used in combination with `TokensController`, this makes it possible to import an ERC-20 token on a locally run chain.

## [25.0.0]

### Added

- Add Linea to price api supported chains ([#3797](https://github.com/MetaMask/core/pull/3797))

### Changed

- **BREAKING:** Convert `TokenBalancesController` to `BaseControllerV2` ([#3750](https://github.com/MetaMask/core/pull/3750))
  - The constructor parameters have changed; rather than accepting a "config" parameter for interval and tokens we now pass both values as controller options, and a "state" parameter, there is now just a single object for all constructor arguments. This object has a mandatory `messenger` and an optional `state`, `tokens`, `interval` properties a disabled property has also been added.
  - State now saves tokens balances as strings and not as a BNs.
  - Additional BN export has been removed as it was intended to be removed in the next major release.
- **BREAKING:** Bump `@metamask/approval-controller` peer dependency to `^5.1.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/preferences-controller` peer dependency to `^7.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/polling-controller` to `^5.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [24.0.0]

### Added

- Add `getDefaultTokenListState` function to `TokenListController` ([#3744](https://github.com/MetaMask/core/pull/3744))
- Add `getDefaultNftState` function to the `NftController` ([#3742](https://github.com/MetaMask/core/pull/3742))
- Add `getDefaultTokensState` function to the `TokensController` ([#3743](https://github.com/MetaMask/core/pull/3743))

### Changed

- **BREAKING:** Bump `@metamask/preferences-controller` to ^6.0.0
- Price API perf improvements ([#3753](https://github.com/MetaMask/core/pull/3753), [#3755](https://github.com/MetaMask/core/pull/3755))
  - Reduce token batch size from 100 to 30
  - Sort token addresses in query params for more cache hits

## [23.1.0]

### Added

- Add support to `CodefiTokenPricesServiceV2` for tracking degraded service ([#3691](https://github.com/MetaMask/core/pull/3691))
  - The constructor has two new options: `onDegraded` and `degradedThreshold`. `onDegraded` is an event handler for instances of degraded service (i.e. failed or slow requests), and `degradedThreshold` determines how slow a request has to be before we consider service to be degraded.

## [23.0.0]

### Added

- Add `onBreak` handler to `CodefiTokenPricesServiceV2` ([#3677](https://github.com/MetaMask/core/pull/3677))
  - This allows listening for "circuit breaks", which can indicate an outage. Useful for metrics.
- Add `fetchTokenContractExchangeRates` utility method ([#3657](https://github.com/MetaMask/core/pull/3657))
- `TokenListController` now exports a `TokenListControllerMessenger` type ([#3609](https://github.com/MetaMask/core/pull/3609)).
- `TokenDetectionController` exports types `TokenDetectionControllerMessenger`, `TokenDetectionControllerActions`, `TokenDetectionControllerGetStateAction`, `TokenDetectionControllerEvents`, `TokenDetectionControllerStateChangeEvent` ([#3609](https://github.com/MetaMask/core/pull/3609)).
- Add `enable` and `disable` methods to `TokenDetectionController`, which control whether the controller is able to make polling requests or all of its network calls are blocked. ([#3609](https://github.com/MetaMask/core/pull/3609)).
  - Note that if the controller is initiated without the `disabled` constructor option set to `false`, the `enable` method will need to be called before the controller can make polling requests in response to subscribed events.

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` dependency and peer dependency from `^5.1.0` to `^5.1.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/network-controller` dependency and peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/preferences-controller` dependency and peer dependency from `^5.0.0` to `^5.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Update `OpenSeaV2Contract` type, renaming `supply` to `total_supply` ([#3692](https://github.com/MetaMask/core/pull/3692))
- **BREAKING:** `TokenDetectionController` is upgraded to extend `BaseControllerV2` and `StaticIntervalPollingController` ([#3609](https://github.com/MetaMask/core/pull/3609)).
  - The constructor now expects an options object as its only argument, with required properties `messenger`, `networkClientId`, required callbacks `onPreferencesStateChange`, `getBalancesInSingleCall`, `addDetectedTokens`, `getTokenState`, `getPreferencesState`, and optional properties `disabled`, `interval`, `selectedAddress`.
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/polling-controller` to `^4.0.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `cockatiel` from `3.1.1` to `^3.1.2` ([#3682](https://github.com/MetaMask/core/pull/3682))
- Bump `@metamask/controller-utils` from `8.0.0` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

### Fixed

- Fix error caused by OpenSea API rename of `supply` to `total_supply` ([#3692](https://github.com/MetaMask/core/pull/3692))
- Fix `CodefiTokenPricesServiceV2` support for Shiden ([#3683](https://github.com/MetaMask/core/pull/3683))
- Improve how `CodefiTokenPricesServiceV2` handles token price update failures ([#3687](https://github.com/MetaMask/core/pull/3687))
  - Previously a single failed token price update would prevent all other token prices from updating as well. With this update, we log and error and continue when we fail to update a token price, ensuring the others still get updated.

## [22.0.0]

### Changed

- **BREAKING:** OpenSea V2 API is used instead of V1 ([#3654](https://github.com/MetaMask/core/pull/3654))
  - `NftDetectionController` constructor now requires the `NftController.getNftApi` function.
  - NFT controllers will no longer return `last_sale` information for NFTs fetched after the OpenSea V2 update

## [21.0.0]

### Added

- Add `CodefiTokenPricesServiceV2` ([#3600](https://github.com/MetaMask/core/pull/3600), [#3655](https://github.com/MetaMask/core/pull/3655), [#3655](https://github.com/MetaMask/core/pull/3655))
  - This class can be used for the new `tokenPricesService` argument for TokenRatesController. It uses a MetaMask API to fetch prices for tokens instead of CoinGecko.
  - The `CodefiTokenPricesServiceV2` will retry if the token price update fails
    - We retry each request up to 3 times using a randomized exponential backoff strategy
    - If the token price update still fails 12 times consecutively (3 update attempts, each of which has 4 calls due to retries), we stop trying for 30 minutes before we try again.
- Add polling by `networkClientId` to `AccountTrackerController` ([#3586](https://github.com/MetaMask/core/pull/3586))
  - A new state property, `accountByChainId` has been added for keeping track of account balances across chains
  - `AccountTrackerController` implements `PollingController` and can now poll by `networkClientId` via the new methods `startPollingByNetworkClientId`, `stopPollingByPollingToken`, and `stopPollingByPollingToken`.
  - `AccountTrackerController` accepts an optional `networkClientId` value on the `refresh` method
  - `AccountTrackerController` accepts an optional `networkClientId` value as the last parameter of the `syncBalanceWithAddresses` method
- Support token detection on Base and zkSync ([#3584](https://github.com/MetaMask/core/pull/3584))
- Support token detection on Arbitrum and Optimism ([#2035](https://github.com/MetaMask/core/pull/2035))

### Changed

- **BREAKING:** `TokenRatesController` now takes a required argument `tokenPricesService` ([#3600](https://github.com/MetaMask/core/pull/3600))
  - This object is responsible for fetching the prices for tokens held by this controller.
- **BREAKING:** Update signature of `TokenRatesController.updateExchangeRatesByChainId` ([#3600](https://github.com/MetaMask/core/pull/3600), [#3653](https://github.com/MetaMask/core/pull/3653))
  - Change the type of `tokenAddresses` from `string[]` to `Hex[]`
- **BREAKING:** `AccountTrackerController` constructor params object requires `getCurrentChainId` and `getNetworkClientById` hooks ([#3586](https://github.com/MetaMask/core/pull/3586))
  - These are needed for the new "polling by `networkClientId`" feature
- **BREAKING:** `AccountTrackerController` has a new required state property, `accountByChainId`([#3586](https://github.com/MetaMask/core/pull/3586))
  - This is needed to track balances accross chains. It was introduced for the "polling by `networkClientId`" feature, but is useful on its own as well.
- **BREAKING:** `AccountTrackerController` adds a mutex to `refresh` making it only possible for one call to be executed at time ([#3586](https://github.com/MetaMask/core/pull/3586))
- **BREAKING:** `TokensController.watchAsset` now performs on-chain validation of the asset's symbol and decimals, if they're defined in the contract ([#1745](https://github.com/MetaMask/core/pull/1745))
  - The `TokensController` constructor no longer accepts a `getERC20TokenName` option. It was no longer needed due to this change.
  - Add new method `_getProvider`, though this is intended for internal use and should not be called externally.
  - Additionally, if the symbol and decimals are defined in the contract, they are no longer required to be passed to `watchAsset`
- **BREAKING:** Update controllers that rely on provider to listen to `NetworkController:networkDidChange` instead of `NetworkController:stateChange` ([#3610](https://github.com/MetaMask/core/pull/3610))
  - The `networkDidChange` event is safer in cases where the provider is used because the provider is guaranteed to have been updated by the time that event is emitted. The same is not true of the `stateChange` event.
  - The following controllers now accept a `onNetworkDidChange` constructor option instead of a `onNetworkStateChange` option:
    - `TokensController`
    - `AssetsContractController`
- Update `@metamask/polling-controller` to v3 ([#3636](https://github.com/MetaMask/core/pull/3636))
  - This update adds two new methods to each polling controller: `_startPollingByNetworkClientId` and `_stopPollingByPollingTokenSetId`. These methods are intended for internal use, and should not be called directly.
  - The affected controllers are:
    - `AccountTrackerController`
    - `CurrencyRateController`
    - `NftDetectionController`
    - `TokenDetectionController`
    - `TokenListController`
    - `TokenRatesController`
- Update `@metamask/controller-utils` to v7 ([#3636](https://github.com/MetaMask/core/pull/3636))
- Update `TokenListController` to fetch prefiltered set of tokens from the API, reducing response data and removing the need for filtering logic ([#2054](https://github.com/MetaMask/core/pull/2054))
- Update `TokenRatesController` to request token rates from the Price API in batches of 100 ([#3650](https://github.com/MetaMask/core/pull/3650))
- Add dependencies `cockatiel` and `lodash` ([#3586](https://github.com/MetaMask/core/pull/3586), [#3655](https://github.com/MetaMask/core/pull/3655))

### Removed

- **BREAKING:** Remove `fetchExchangeRate` method from TokenRatesController ([#3600](https://github.com/MetaMask/core/pull/3600))
  - This method (not to be confused with `updateExchangeRate`, which is still present) was only ever intended to be used internally and should not be accessed directly.
- **BREAKING:** Remove `getChainSlug` method from TokenRatesController ([#3600](https://github.com/MetaMask/core/pull/3600))
  - This method was previously used in TokenRatesController to access the CoinGecko API. There is no equivalent.
- **BREAKING:** Remove `CoinGeckoResponse` and `CoinGeckoPlatform` types ([#3600](https://github.com/MetaMask/core/pull/3600))
  - These types were previously used in TokenRatesController to represent data returned from the CoinGecko API. There is no equivalent.
- **BREAKING:** The TokenRatesController now only supports updating and polling rates for tokens tracked by the TokensController ([#3639](https://github.com/MetaMask/core/pull/3639))
  - The `tokenAddresses` option has been removed from `startPollingByNetworkClientId`
  - The `tokenContractAddresses` option has been removed from `updateExchangeRatesByChainId`
- **BREAKING:** `TokenRatesController.fetchAndMapExchangeRates` is no longer exposed publicly ([#3621](https://github.com/MetaMask/core/pull/3621))

### Fixed

- Prevent `TokenRatesController` from making redundant token rate updates when tokens change ([#3647](https://github.com/MetaMask/core/pull/3647), [#3663](https://github.com/MetaMask/core/pull/3663))
  - Previously, token rates would be re-fetched for the globally selected network on all TokensController state changes, but now token rates are always performed for a deduplicated and normalized set of addresses, and changes to this set determine whether rates should be re-fetched.
- Prevent redundant overlapping token rate updates in `TokenRatesController` ([#3635](https://github.com/MetaMask/core/pull/3635))
- Fix `TokenRatesController` bug where the `contractExchangeRates` state would sometimes be stale after calling `updateExchangeRatesByChainId` ([#3624](https://github.com/MetaMask/core/pull/3624))
- Make `TokenRatesController.updateExchangeRatesByChainId` respect `disabled` state ([#3596](https://github.com/MetaMask/core/pull/3596))
- Fix error in `NftController` when attempt to get NFT information from on-chain fails, and ensure metadata always contains contract address and blank `name` field ([#3629](https://github.com/MetaMask/core/pull/3629))
  - When fetching on-chain NFT information fails, we now proceed with whatever we have (either the OpenSea metadata, or a blank metadata object)
  - Previously, if we were unable to retrieve NFT metadata from on-chain or OpenSea, the returned NFT metadata would be missing a `name` field and the contract address. Now the returned metadata always has those entries, though the `name` is set to `null`.
  - This affects `watchNft` and `addNft` methods

## [20.0.0]

### Added

- **BREAKING**: `TokenRatesControllerState` now has required `contractExchangeRatesByChainId` property which an object keyed by `chainId` and `nativeCurrency` ([#2015](https://github.com/MetaMask/core/pull/2015))
- **BREAKING**: `TokenRatesController` constructor params now requires `getNetworkClientById` ([#2015](https://github.com/MetaMask/core/pull/2015))
- Add types `CurrencyRateControllerEvents` and `CurrencyRateControllerActions` ([#2029](https://github.com/MetaMask/core/pull/2029))
- Add polling-related methods to TokenRatesController ([#2015](https://github.com/MetaMask/core/pull/2015))
  - `startPollingByNetworkClientId`
  - `stopPollingByPollingToken`
  - `stopAllPolling`
  - `_executePoll`
- Add `updateExchangeRatesByChainId` method to TokenRatesController ([#2015](https://github.com/MetaMask/core/pull/2015))
  - This is a lower-level version of `updateExchangeRates` that takes chain ID, native currency, and token addresses.
- `TokenRatesController` constructor params now accepts optional `interval` and `threshold` ([#2015](https://github.com/MetaMask/core/pull/2015))
- `TokenRatesController.fetchExchangeRate()` now accepts an optional `tokenAddresses` as the last parameter ([#2015](https://github.com/MetaMask/core/pull/2015))
- `TokenRatesController.getChainSlug()` now accepts an optional `chainId` parameter ([#2015](https://github.com/MetaMask/core/pull/2015))
- `TokenRatesController.fetchAndMapExchangeRates()` now accepts an optional `tokenAddresses` as the last parameter ([#2015](https://github.com/MetaMask/core/pull/2015))

### Changed

- **BREAKING:** Bump dependency on `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/approval-controller` to ^5.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/polling-controller` to ^2.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/preferences-controller` to ^5.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [19.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0
- Add optional `networkClientId` and `userAddress` args to remaining `NftController` public methods ([#2006](https://github.com/MetaMask/core/pull/2006))
  - `watchNft`, `removeNft`, `removeAndIgnoreNft`, `removeNftContract`, `updateNftFavoriteStatus`, and `checkAndUpdateAllNftsOwnershipStatus` methods on `NftController` all now accept an optional options object argument containing `networkClientId` and `userAddress` to identify where in state to mutate.
  - **BREAKING**: `addNft` no longer accepts a `chainId` property in its options argument since this value can be retrieved by the `networkClientId` property and is therefore redundant.
  - **BREAKING**: The third and fourth arguments on NftController's `addNftVerifyOwnership` method, have been replaced with an options object containing optional properties `networkClientId`, `userAddress` and `source`. This method signature is more aligned with the options pattern for passing `networkClientId` and `userAddress` on this controller and elsewhere.
  - **BREAKING**: `checkAndUpdateSingleNftOwnershipStatus` on NftController no longer accepts a `chainId` in its options argument. This is replaced with an optional `networkClientId` property which can be used to fetch chainId.
    **\*BREAKING**: The fourth argument of the `isNftOwner` method on `NftController` is now an options object with an optional `networkClientId` property. This method signature is more aligned with the options pattern for passing `networkClientId` on this controller and elsewhere.
  - **BREAKING**: `validateWatchNft` method on `NftController` is now private.
  - **BREAKING**: `detectNfts` on `NftDetectionController` now accepts a single object argument with optional properties `networkClientId` and `userAddress`, rather than taking these as two sequential arguments.
- Bump dependency `@metamask/eth-query` from ^3.0.1 to ^4.0.0 ([#2028](https://github.com/MetaMask/core/pull/2028))
- Bump dependency on `@metamask/polling-controller` to ^1.0.2
- Bump `@metamask/utils` from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

### Fixed

- Add name and symbol to the payload returned by the `ERC1155Standard` class `getDetails` method for `ERC1155` contracts ([#1727](https://github.com/MetaMask/core/pull/1727))

## [18.0.0]

### Changed

- **BREAKING**: `CurrencyRateController` is now keyed by `nativeCurrency` (i.e. ticker) for `conversionDate`, `conversionRate`, and `usdConversionRate` in the `currencyRates` object. `nativeCurrency`, `pendingNativeCurrency`, and `pendingCurrentCurrency` have been removed.
  - ```
    export type CurrencyRateState = {
      currentCurrency: string;
      currencyRates: Record<
        string, // nativeCurrency
        {
          conversionDate: number | null;
          conversionRate: number | null;
          usdConversionRate: number | null;
        }
      >;
    };
    ```
- **BREAKING**: `CurrencyRateController` now extends `PollingController` ([#1805](https://github.com/MetaMask/core/pull/1805))
  - `start()` and `stop()` methods replaced with `startPollingByNetworkClientId()`, `stopPollingByPollingToken()`, and `stopAllPolling()`
- **BREAKING:** `CurrencyRateController` now sends the `NetworkController:getNetworkClientById` action via messaging controller ([#1805](https://github.com/MetaMask/core/pull/1805))

### Fixed

- Parallelize network requests in assets controllers for performance enhancement ([#1801](https://github.com/MetaMask/core/pull/1801))
- Fix token detection on accounts when user changes account after token detection request is inflight ([#1848](https://github.com/MetaMask/core/pull/1848))

## [17.0.0]

### Changed

- **BREAKING:** Bump dependency on `@metamask/polling-controller` to ^1.0.0
- Bump dependency and peer dependency on `@metamask/network-controller` to ^15.1.0

## [16.0.0]

### Added

- Add way to start and stop different polling sessions for the same network client ID by providing extra scoping data ([#1776](https://github.com/MetaMask/core/pull/1776))
  - Add optional second argument to `stopPollingByPollingToken` (formerly `stopPollingByNetworkClientId`)
  - Add optional second argument to `onPollingCompleteByNetworkClientId`
- Add support for token detection for Linea mainnet and Linea Goerli ([#1799](https://github.com/MetaMask/core/pull/1799))

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- **BREAKING:** Make `executePoll` in TokenListController private ([#1810](https://github.com/MetaMask/core/pull/1810))
- **BREAKING:** Update TokenListController to rename `stopPollingByNetworkClientId` to `stopPollingByPollingToken` ([#1810](https://github.com/MetaMask/core/pull/1810))
- Add missing dependency on `@metamask/polling-controller` ([#1831](https://github.com/MetaMask/core/pull/1831))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.1
- Bump dependency and peer dependency on `@metamask/preferences-controller` to ^4.4.3
- Fix support for NFT metadata stored outside IPFS ([#1772](https://github.com/MetaMask/core/pull/1772))

## [15.0.0]

### Changed

- **BREAKING**: `NftController` now expects `getNetworkClientById` in constructor options ([#1698](https://github.com/MetaMask/core/pull/1698))
- **BREAKING**: `NftController.addNft` function signature has changed ([#1698](https://github.com/MetaMask/core/pull/1698))
  - Previously
    ```
    address: string,
    tokenId: string,
    nftMetadata?: NftMetadata,
    accountParams?: {
      userAddress: string;
      chainId: Hex;
    },
    source = Source.Custom,
    ```
    now:
    ```
    tokenAddress: string,
    tokenId: string,
    {
      nftMetadata?: NftMetadata;
      chainId?: Hex; // extracts from AccountParams
      userAddress?: string // extracted from AccountParams
      source?: Source;
      networkClientId?: NetworkClientId; // new
    },
    ```
- `NftController.addNftVerifyOwnership`: Now accepts optional 3rd argument `networkClientId` which is used to fetch NFT metadata and determine by which chainId the added NFT should be stored in state. Also accepts optional 4th argument `source` used for metrics to identify the flow in which the NFT was added to the wallet. ([#1698](https://github.com/MetaMask/core/pull/1698))
- `NftController.isNftOwner`: Now accepts optional `networkClientId` which is used to instantiate the provider for the correct chain and call the NFT contract to verify ownership ([#1698](https://github.com/MetaMask/core/pull/1698))
- `NftController.addNft` will use the chainId value derived from `networkClientId` if provided ([#1698](https://github.com/MetaMask/core/pull/1698))
- `NftController.watchNft` options now accepts optional `networkClientId` which is used to fetch NFT metadata and determine by which chainId the added NFT should be stored in state ([#1698](https://github.com/MetaMask/core/pull/1698))
- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.0
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0

### Fixed

- Fix bug in TokensController where batched `addToken` overwrote each other because mutex was acquired after reading state ([#1768](https://github.com/MetaMask/core/pull/1768))

## [14.0.0]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))
- Update `@metamask/rpc-errors` to `^6.0.0` ([#1690](https://github.com/MetaMask/core/pull/1690))

### Removed

- **BREAKING:** Remove AbortController polyfill
  - This package now assumes that the AbortController global exists

## [13.0.0]

### Changed

- **BREAKING**: `TokensController` now expects `getNetworkClientById` in constructor options ([#1676](https://github.com/MetaMask/core/pull/1676))
- **BREAKING**: `TokensController.addToken` now accepts a single options object ([#1676](https://github.com/MetaMask/core/pull/1676))
  ```
    {
      address: string;
      symbol: string;
      decimals: number;
      name?: string;
      image?: string;
      interactingAddress?: string;
      networkClientId?: NetworkClientId;
    }
  ```
- **BREAKING:** Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- **CHANGED**: `TokensController.addToken` will use the chain ID value derived from state for `networkClientId` if provided ([#1676](https://github.com/MetaMask/core/pull/1676))
- **CHANGED**: `TokensController.addTokens` now accepts an optional `networkClientId` as the last parameter ([#1676](https://github.com/MetaMask/core/pull/1676))
- **CHANGED**: `TokensController.addTokens` will use the chain ID value derived from state for `networkClientId` if provided ([#1676](https://github.com/MetaMask/core/pull/1676))
- **CHANGED**: `TokensController.watchAsset` options now accepts optional `networkClientId` which is used to get the ERC-20 token name if provided ([#1676](https://github.com/MetaMask/core/pull/1676))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))
- Bump dependency on `@metamask/preferences-controller` to ^4.4.1 ([#1676](https://github.com/MetaMask/core/pull/1676))

## [12.0.0]

### Added

- Add `AssetsContractController` methods `getProvider`, `getChainId`, `getERC721Standard`, and `getERC1155Standard` ([#1638](https://github.com/MetaMask/core/pull/1638))

### Changed

- **BREAKING**: Add `getNetworkClientById` to `AssetsContractController` constructor options ([#1638](https://github.com/MetaMask/core/pull/1638))
- Add optional `networkClientId` parameter to various `AssetContractController` methods ([#1638](https://github.com/MetaMask/core/pull/1638))
- The affected methods are:
  - `getERC20BalanceOf`
  - `getERC20TokenDecimals`
  - `getERC20TokenName`
  - `getERC721NftTokenId`
  - `getTokenStandardAndDetails`
  - `getERC721TokenURI`
  - `getERC721AssetName`
  - `getERC721AssetSymbol`
  - `getERC721OwnerOf`
  - `getERC1155TokenURI`
  - `getERC1155BalanceOf`
  - `transferSingleERC1155`
  - `getBalancesInSingleCall`

## [11.1.0]

### Added

- Add `tokenURI` to `NftMetadata` type ([#1577](https://github.com/MetaMask/core/pull/1577))
- Populate token URL for NFT metadata under `tokenURI` ([#1577](https://github.com/MetaMask/core/pull/1577))

### Changed

- Bump dependency and peer dependency on `@metamask/approval-controller` to ^3.5.1
- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2
- Bump dependency and peer dependency on `@metamask/network-controller` to ^12.1.2
- Bump dependency and peer dependency on `@metamask/preferences-controller` to ^4.4.0
- Update NftController to add fallback for when IPFS gateway is disabled ([#1577](https://github.com/MetaMask/core/pull/1577))

## [11.0.1]

### Changed

- Replace `eth-query` ^2.1.2 with `@metamask/eth-query` ^3.0.1 ([#1546](https://github.com/MetaMask/core/pull/1546))

## [11.0.0]

### Added

- Add a `stop` method to stop polling

### Changed

- **BREAKING**: New required constructor parameters for the `TokenRatesController` ([#1497](https://github.com/MetaMask/core/pull/1497), [#1511](https://github.com/MetaMask/core/pull/1511))
  - The new required parameters are `ticker`, `onSelectedAddress`, and `onPreferencesStateChange`
- **BREAKING:** Remove `onCurrencyRateStateChange` constructor parameter from `TokenRatesController` ([#1496](https://github.com/MetaMask/core/pull/1496))
- **BREAKING:** Disable `TokenRatesController` automatic polling ([#1501](https://github.com/MetaMask/core/pull/1501))
  - Polling must be started explicitly by calling the `start` method
  - The token rates are not updated upon state changes when polling is disabled.
- **BREAKING:** Replace the `poll` method with `start` ([#1501](https://github.com/MetaMask/core/pull/1501))
  - The `start` method does not offer a way to change the interval. That must be done by calling `.configure` instead
- **BREAKING:** Remove `TokenRatecontroller` setter for `chainId` and `tokens` properties ([#1505](https://github.com/MetaMask/core/pull/1505))
- Bump @metamask/abi-utils from 1.2.0 to 2.0.1 ([#1525](https://github.com/MetaMask/core/pull/1525))
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))
- Remove unnecessary `babel-runtime` dependency ([#1504](https://github.com/MetaMask/core/pull/1504))

### Fixed

- Fix bug where token rates were incorrect after first update if initialized with a non-Ethereum selected network ([#1497](https://github.com/MetaMask/core/pull/1497))
- Fix bug where token rates would be invalid if event handlers were triggered in the wrong order ([#1496](https://github.com/MetaMask/core/pull/1496), [#1511](https://github.com/MetaMask/core/pull/1511))
- Prevent redundant token rate updates ([#1512](https://github.com/MetaMask/core/pull/1512))

## [10.0.0]

### Added

- The method `getERC20TokenName` has been added to `AssetsContractController` ([#1127](https://github.com/MetaMask/core/pull/1127))
  - This method gets the token name from the token contract

### Changed

- **BREAKING:** The tokens controller now requires `onTokenListStateChange` and `getERC20TokenName` as constructor parameters ([#1127](https://github.com/MetaMask/core/pull/1127))
  - The `getERC20TokenName` method is used to get the token name for tokens added via `wallet_watchAsset`
  - The `onTokenListStateChange` method is used to trigger a name update when the token list changes. On each change, token names are copied from the token list if they're missing from token controller state.
- **BREAKING:** The signature of the tokens controller method `addToken` has changed
  - The fourth and fifth positional parameters (`image` and `interactingAddress`) have been replaced by an `options` object
  - The new options parameter includes the `image` and `interactingAddress` properties, and a new `name` property
- The token detection controller now sets the token name when new tokens are detected ([#1127](https://github.com/MetaMask/core/pull/1127))
- The `Token` type now includes an optional `name` field ([#1127](https://github.com/MetaMask/core/pull/1127))

## [9.2.0]

### Added

- Add validation that the nft standard matches the type argument of a `wallet_watchAsset` request when type is 'ERC721' or 'ERC1155' ([#1455](https://github.com/MetaMask/core/pull/1455))

## [9.1.0]

### Added

- Add a fifth argument, `source`, to NftController's `addNft` method ([#1417](https://github.com/MetaMask/core/pull/1417))
  - This argument can be used to specify whether the NFT was detected, added manually, or suggested by a dapp

### Fixed

- Fix `watchNft` in NftController to ensure that if the network changes before the user accepts the request, the NFT is added to the chain ID and address before the request was initiated ([#1417](https://github.com/MetaMask/core/pull/1417))

## [9.0.0]

### Added

- **BREAKING**: Add required options `getSelectedAddress` and `getMultiAccountBalancesEnabled` to AccountTrackerController constructor and make use of them when refreshing account balances ([#1146](https://github.com/MetaMask/core/pull/1146))
  - Previously, the controller would refresh all account balances, but these options can be used to only refresh the currently selected account
- **BREAKING:** Add logic to support validating and adding ERC721 and ERC1155 tokens to NFTController state via `wallet_watchAsset` API. ([#1173](https://github.com/MetaMask/core/pull/1173), [#1406](https://github.com/MetaMask/core/pull/1406))
  - The `NFTController` now has a new `watchNFT` method that can be called to send a message to the `ApprovalController` and prompt the user to add an NFT to their wallet state.
  - The `NFTController` now requires an instance of a ControllerMessenger to be passed to its constructor. This is messenger is used to pass the `watchNFT` message to the `ApprovalController`.

### Changed

- Add dependency on `@ethersproject/address` ([#1173](https://github.com/MetaMask/core/pull/1173))
- Replace `eth-rpc-errors` with `@metamask/rpc-errors` ([#1173](https://github.com/MetaMask/core/pull/1173))

## [8.0.0]

### Added

- Support NFT detection on Ethereum Mainnet custom RPC endpoints ([#1360](https://github.com/MetaMask/core/pull/1360))
- Enable token detection for the Aurora network ([#1327](https://github.com/MetaMask/core/pull/1327))

### Changed

- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Change format of chain ID in state to 0x-prefixed hex string ([#1367](https://github.com/MetaMask/core/pull/1367))
  - The functions `isTokenDetectionSupportedForNetwork` and `formatIconUrlWithProxy` now expect a chain ID as type `Hex` rather than as a decimal `string`
  - The assets contract controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The NFT controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The NFT controller methods `addNft`, `checkAndUpdateSingleNftOwnershipStatus`, `findNftByAddressAndTokenId`, `updateNft`, and `resetNftTransactionStatusByTransactionId` now expect the chain ID to be type `Hex` rather than a decimal `string`
  - The NFT controller state properties `allNftContracts` and `allNfts` are now keyed by address and `Hex` chain ID, rather than by address and decimal `string` chain ID
    - This requires a state migration
  - The NFT detection controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The token detection controller now expects the `chainId` configuration entry as type `Hex` rather than decimal `string`
  - The token list controller now expects the `chainId` constructor parameter as type `Hex` rather than decimal `string`
  - The token list controller state property `tokensChainsCache` is now keyed by `Hex` chain ID rather than by decimal `string` chain ID.
    - This requires a state migration
  - The token rates controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The token rates controller `chainId` setter now expects the chain ID as `Hex` rather than as a decimal string
  - The tokens controller now expects the `chainId` configuration entry and constructor parameter as type `Hex` rather than decimal `string`
  - The tokens controller `addDetectedTokens` method now accepts the `chainId` property of the `detectionDetails` parameter to be of type `Hex` rather than decimal `string`.
  - The tokens controller state properties `allTokens`, `allIgnoredTokens`, and `allDetectedTokens` are now keyed by chain ID in `Hex` format rather than decimal `string`.
    - This requires a state migration
- **BREAKING:** Use approval controller for suggested assets ([#1261](https://github.com/MetaMask/core/pull/1261), [#1268](https://github.com/MetaMask/core/pull/1268))
  - The actions `ApprovalController:acceptRequest` and `ApprovalController:rejectRequest` are no longer required by the token controller messenger.
  - The `suggestedAssets` state has been removed, which means that suggested assets are no longer persisted in state
  - The return type for `watchAsset` has changed. It now returns a Promise that settles after the request has been confirmed or rejected.
- **BREAKING:** Initialize controllers with the current network ([#1361](https://github.com/MetaMask/core/pull/1361))
  - The following controllers now have a new `chainId` required constructor parameter:
    - `AssetsContractController`
    - `NftController`
    - `NftDetectionController`
    - `TokenRatesController`
    - `TokensController`
- **BREAKING:** The token list controller messenger requires the `NetworkController:stateChange` event instead of the `NetworkController:providerConfigChange` event ([#1329](https://github.com/MetaMask/core/pull/1329))
- **BREAKING:** The token list controller `onNetworkStateChange` option now has a more restrictive type ([#1329](https://github.com/MetaMask/core/pull/1329))
  - The event handler parameter type has been changed from `NetworkState | ProviderConfig` to `NetworkState`
- **BREAKING:** Update the account tracker controller `provider` type ([#1266](https://github.com/MetaMask/core/pull/1266))
  - The `provider` setter and the `provider` config entry now use our `Provider` type from `eth-query` rather than `any`
- **BREAKING:** Update`@metamask/preferences-controller` dependency and add it as a peer dependency ([#1393](https://github.com/MetaMask/core/pull/1393))
- **BREAKING:** Update `@metamask/approval-controller` and `@metamask/network-controller` dependencies and peer dependencies
- Bump @metamask/abi-utils from 1.1.0 to 1.2.0 ([#1287](https://github.com/MetaMask/core/pull/1287))
- Bump @metamask/utils from 5.0.1 to 5.0.2 ([#1271](https://github.com/MetaMask/core/pull/1271))

### Removed

- **BREAKING:** Remove the `networkType` configuration option from the NFT detection controller, NFT controller, and tokens controller ([#1360](https://github.com/MetaMask/core/pull/1360), [#1359](https://github.com/MetaMask/core/pull/1359))
- **BREAKING:** Remove the `SuggestedAssetMeta` and `SuggestedAssetMetaBase` types from the token controller ([#1268](https://github.com/MetaMask/core/pull/1268))
- **BREAKING:** Remove the `acceptWatchAsset` and `rejectWatchAsset` methods from the token controller ([#1268](https://github.com/MetaMask/core/pull/1268))
  - Suggested assets can be accepted or rejected using the approval controller instead

## [7.0.0]

### Changed

- **BREAKING**: peerDeps: @metamask/network-controller@6.0.0->8.0.0 ([#1196](https://github.com/MetaMask/core/pull/1196))

## [6.0.0]

### Changed

- **BREAKING:** Create approval requests using `@metamask/approval-controller` ([#1166](https://github.com/MetaMask/core/pull/1166))

## [5.1.0]

### Added

- Support watching assets on a specific account ([#1124](https://github.com/MetaMask/core/pull/1124))

## [5.0.1]

### Changed

- Update `@metamask/contract-metadata` from 2.1.0 to 2.3.1 ([#1141](https://github.com/MetaMask/core/pull/1141))

## [5.0.0]

### Removed

- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [4.0.1]

### Fixed

- Update Nft Controller to add the NFT back to its own group if we are re-importing it ([#1082](https://github.com/MetaMask/core/pull/1082))

## [4.0.0]

### Added

- Add Sepolia support to the currency rate controller ([#1041](https://github.com/MetaMask/controllers/pull/1041))
  - The currency rate controller will now treat Sepolia as a testnet, and return the Mainnet exchange rate when asked for the Sepolia exchange rate.

### Changed

- **BREAKING:** Update `@metamask/network-controller` peer dependency to v3 ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- **BREAKING:** Migrate from `metaswap` to `metafi` subdomain for OpenSea proxy and token icons API ([#1060](https://github.com/MetaMask/core/pull/1060))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update ERC20Standard to use `@metamask/abi-utils` instead of `@ethersproject/abi` ([#985](https://github.com/MetaMask/controllers/pull/985))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## Removed

- **BREAKING**: Drop support for Ropsten, Rinkeby, and Kovan ([#1041](https://github.com/MetaMask/controllers/pull/1041))
  - The currency rate controller no longer has special handling of these three networks. It used to return the Mainnet exchange rate for these three networks, but now it includes no special handling for them.
  - The NFT controller no longer supports the Rinkeby OpenSea test API.

## [3.0.1]

### Changed

- Export `isTokenDetectionSupportedForNetwork` function ([#1034](https://github.com/MetaMask/controllers/pull/1034))
- Update `@metamask/contract-metadata` from 1.35.0 to 2.1.0 ([#1013](https://github.com/MetaMask/controllers/pull/1013))

### Fixed

- Fix token controller state updates ([#1015](https://github.com/MetaMask/controllers/pull/1015))
  - Attempts to empty the list of "added", "ignored", or "detected" tokens were not saved in state correctly, resulting in that operation being undone after switching account or network.

## [3.0.0]

### Changed

- **BREAKING:** A new private property, controlled by the `start` and `stop` methods, is added to the CurrencyRateController: `enabled`. When this is false, no network requests will be made from the controller. Previously, setNativeCurrency or setCurrentCurrency would trigger a network request. That is now prevented if `enabled` is false. ([#1002](https://github.com/MetaMask/core/pull/1002))

### Fixed

- The TokenRatesController no longer overwrites the `disabled` config property passed to the constructor, allowing the controller to be instantiated with `config.disabled` set to either true or false. ([#1002](https://github.com/MetaMask/core/pull/1002))
- This package will now warn if a required package is not present ([#1003](https://github.com/MetaMask/core/pull/1003))

## [2.0.0]

### Changed

- **BREAKING:** Update `onNetworkStateChange`, a constructor option for several controllers, to take an object with a `providerConfig` property instead of `provider` ([#995](https://github.com/MetaMask/core/pull/995))
  - This affects:
    - AssetsContractController
    - NftController
    - NftDetectionController
    - TokenDetectionController
    - TokenListController
    - TokenRatesController
    - TokenController
- **BREAKING:** [TokenDetectionController] Update `getNetworkState` constructor option to take an object with `providerConfig` property rather than `providerConfig` ([#995](https://github.com/MetaMask/core/pull/995))
- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, `@metamask/network-controller`, and `@metamask/preferences-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.1]

### Fixed

- Fix race condition where some token detections can get mistakenly added to the wrong account ([#956](https://github.com/MetaMask/core/pull/956))

## [1.0.0]

### Added

- Initial release

  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:

    - Everything in `src/assets`
    - Asset-related functions from `src/util.ts` and accompanying tests

    All changes listed after this point were applied to this package following the monorepo conversion.

### Changed

- Use Ethers for AssetsContractController ([#845](https://github.com/MetaMask/core/pull/845))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@34.0.0...HEAD
[34.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@33.0.0...@metamask/assets-controllers@34.0.0
[33.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@32.0.0...@metamask/assets-controllers@33.0.0
[32.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@31.0.0...@metamask/assets-controllers@32.0.0
[31.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@30.0.0...@metamask/assets-controllers@31.0.0
[30.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@29.0.0...@metamask/assets-controllers@30.0.0
[29.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@28.0.0...@metamask/assets-controllers@29.0.0
[28.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.2.0...@metamask/assets-controllers@28.0.0
[27.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.1.0...@metamask/assets-controllers@27.2.0
[27.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.0.1...@metamask/assets-controllers@27.1.0
[27.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@27.0.0...@metamask/assets-controllers@27.0.1
[27.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@26.0.0...@metamask/assets-controllers@27.0.0
[26.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@25.0.0...@metamask/assets-controllers@26.0.0
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@24.0.0...@metamask/assets-controllers@25.0.0
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@23.1.0...@metamask/assets-controllers@24.0.0
[23.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@23.0.0...@metamask/assets-controllers@23.1.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@22.0.0...@metamask/assets-controllers@23.0.0
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@21.0.0...@metamask/assets-controllers@22.0.0
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@20.0.0...@metamask/assets-controllers@21.0.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@19.0.0...@metamask/assets-controllers@20.0.0
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@18.0.0...@metamask/assets-controllers@19.0.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@17.0.0...@metamask/assets-controllers@18.0.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@16.0.0...@metamask/assets-controllers@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@15.0.0...@metamask/assets-controllers@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@14.0.0...@metamask/assets-controllers@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@13.0.0...@metamask/assets-controllers@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@12.0.0...@metamask/assets-controllers@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@11.1.0...@metamask/assets-controllers@12.0.0
[11.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@11.0.1...@metamask/assets-controllers@11.1.0
[11.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@11.0.0...@metamask/assets-controllers@11.0.1
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@10.0.0...@metamask/assets-controllers@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@9.2.0...@metamask/assets-controllers@10.0.0
[9.2.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@9.1.0...@metamask/assets-controllers@9.2.0
[9.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@9.0.0...@metamask/assets-controllers@9.1.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@8.0.0...@metamask/assets-controllers@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@7.0.0...@metamask/assets-controllers@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@6.0.0...@metamask/assets-controllers@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.1.0...@metamask/assets-controllers@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.0.1...@metamask/assets-controllers@5.1.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@5.0.0...@metamask/assets-controllers@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@4.0.1...@metamask/assets-controllers@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@4.0.0...@metamask/assets-controllers@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@3.0.1...@metamask/assets-controllers@4.0.0
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@3.0.0...@metamask/assets-controllers@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@2.0.0...@metamask/assets-controllers@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@1.0.1...@metamask/assets-controllers@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/assets-controllers@1.0.0...@metamask/assets-controllers@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/assets-controllers@1.0.0
