# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [37.0.0]

## [36.2.0]

### Changed

- Bump `@metamask/keyring-api` from `^18.0.0` to `^19.0.0` ([#6146](https://github.com/MetaMask/core/pull/6146))

## [36.1.0]

### Changed

- Include EVM assetIds in `isNativeAddress` util when checking whether an address string is a native token ([#6076](https://github.com/MetaMask/core/pull/6076))

## [36.0.0]

### Changed

- Bump `@metamask/multichain-network-controller` from `^0.9.0` to `^0.10.0` ([#6114](https://github.com/MetaMask/core/pull/6114))
- **BREAKING** Require `destWalletAddress` in `isValidQuoteRequest` if bridging to or from Solana ([#6091](https://github.com/MetaMask/core/pull/6091))
- Bump `@metamask/assets-controllers` to `^72.0.0` ([#6120](https://github.com/MetaMask/core/pull/6120))

## [35.0.0]

### Added

- Add an optional `isSingleSwapBridgeButtonEnabled` feature flag that indicates whether Swap and Bridge entrypoints should be combined ([#6078](https://github.com/MetaMask/core/pull/6078))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/assets-controllers` from `^69.0.0` to `^71.0.0` ([#6061](https://github.com/MetaMask/core/pull/6061), [#6098](https://github.com/MetaMask/core/pull/6098))
- **BREAKING:** Bump peer dependency `@metamask/snaps-controllers` from `^12.0.0` to `^14.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- **BREAKING** Remove `isSnapConfirmationEnabled` feature flag from `ChainConfigurationSchema` validation ([#6077](https://github.com/MetaMask/core/pull/6077))
- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [34.0.0]

### Added

- **BREAKING** Add a required `gasIncluded` quote request parameter to indicate whether the bridge-api should return gasless swap quotes. The clients need to pass in a Boolean value indicating whether the user is opted in to STX and if their current network has STX support ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `gasIncluded` to QuoteResponse, which indicates whether the quote includes tx fees (gas-less) ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `feeData.txFees` to QuoteResponse, which contains data about tx fees taken from either the source or destination asset ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `includedTxFees` to QuoteMetadata, which clients can display as the included tx fee when displaying a gasless quote ([#6039](https://github.com/MetaMask/core/pull/6039))
- Calculate and return value of `includedTxFees` ([#6039](https://github.com/MetaMask/core/pull/6039))

### Changed

- Consolidate validator and type definitions for `QuoteResponse`, `BridgeAsset` and `PlatformConfigSchema` so new response fields only need to be defined once ([#6030](https://github.com/MetaMask/core/pull/6030))
- Add `txFees` to total sentAmount ([#6039](https://github.com/MetaMask/core/pull/6039))
- When gas is included and is taken from the destination token amount, ignore network fees in `adjustedReturn` calculation ([#6039](https://github.com/MetaMask/core/pull/6039))

### Fixed

- Calculate EVM token exchange rates accurately in `selectExchangeRateByChainIdAndAddress` when the `marketData` conversion rate is in the native currency ([#6030](https://github.com/MetaMask/core/pull/6030))
- Convert `trade.value` to decimal when calculating relayer fee ([#6039](https://github.com/MetaMask/core/pull/6039))
- Revert QuoteResponse ChainId schema to expect a number instead of a string ([#6045](https://github.com/MetaMask/core/pull/6045))

## [33.0.1]

### Fixed

- Set correct `can_submit` property on Unified SwapBridge events ([#5993](https://github.com/MetaMask/core/pull/5993))
- Use activeQuote to populate default properties for Submitted and Failed events, if tx fails before being confirmed on chain ([#5993](https://github.com/MetaMask/core/pull/5993))

## [33.0.0]

### Added

- Add `stopPollingForQuotes` handler that stops quote polling without resetting the bridge controller's state ([#5994](https://github.com/MetaMask/core/pull/5994))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/assets-controller` to `^69.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^58.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump dependency `@metamask/gas-fee-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump dependency `@metamask/multichain-network-controller` to `^0.9.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump dependency `@metamask/polling-controller` to `^14.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [32.2.0]

### Changed

- Export feature flag util for bridge status controller ([#5961](https://github.com/MetaMask/core/pull/5961))

## [32.1.2]

### Changed

- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))
- Bump `@metamask/transaction-controller` to `^57.3.0` ([#5954](https://github.com/MetaMask/core/pull/5954))

## [32.1.1]

### Fixed

- Fetch `minimumBalanceForRentExemptionInLamports` asynchronously to prevent blocking the getQuote network call ([#5921](https://github.com/MetaMask/core/pull/5921))
- Fix invalid `getMinimumBalanceForRentExemption` commitment parameter ([#5921](https://github.com/MetaMask/core/pull/5921))

## [32.1.0]

### Added

- Include all invalid quote properties in sentry logs ([#5913](https://github.com/MetaMask/core/pull/5913))

## [32.0.1]

### Fixed

- Remove `error_message` property from QuotesRequested event payload ([#5900](https://github.com/MetaMask/core/pull/5900))
- Fail gracefully when fee calculations return invalid value or throw errors
  - Filter out single quote if `TransactionController.getLayer1GasFee` returns `undefined` ([#5910](https://github.com/MetaMask/core/pull/5910))
  - Filter out single quote if an error is thrown by `getLayer1GasFee` ([#5910](https://github.com/MetaMask/core/pull/5910))
  - Filter out single quote if an error is thrown by Solana snap's `getFeeForTransaction` method ([#5910](https://github.com/MetaMask/core/pull/5910))

## [32.0.0]

### Added

- **BREAKING:** Add required property `minimumBalanceForRentExemptionInLamports` to `BridgeState` ([#5827](https://github.com/MetaMask/core/pull/5827))
- Add selector `selectMinimumBalanceForRentExemptionInSOL` ([#5827](https://github.com/MetaMask/core/pull/5827))

### Changed

- Add new dependency `uuid` ([#5827](https://github.com/MetaMask/core/pull/5827))

## [31.0.0]

### Added

- Add `SEI` network support ([#5695](https://github.com/MetaMask/core/pull/5695))
  - Add `SEI` into constants `ALLOWED_BRIDGE_CHAIN_IDS`, `SWAPS_TOKEN_OBJECT` and `NETWORK_TO_NAME_MAP`

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^68.0.0` ([#5894](https://github.com/MetaMask/core/pull/5894))

## [30.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^67.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^57.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^11.0.0` to `^12.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/keyring-api` dependency from `^17.4.0` to `^18.0.0` ([#5871](https://github.com/MetaMask/core/pull/5871))

## [29.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^66.0.0` ([#5872](https://github.com/MetaMask/core/pull/5872))

## [28.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^65.0.0` ([#5863](https://github.com/MetaMask/core/pull/5863))

## [27.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^64.0.0` ([#5854](https://github.com/MetaMask/core/pull/5854))

## [26.0.0]

### Added

- **BREAKING:** Added a required `minimumVersion` to feature flag response schema ([#5834](https://github.com/MetaMask/core/pull/5834))

### Changed

- Consume `bridgeConfigV2` in the feature flag response schema for Mobile and export `DEFAULT_FEATURE_FLAG_CONFIG` ([#5837](https://github.com/MetaMask/core/pull/5837))

## [25.1.0]

### Added

- Added optional `isUnifiedUIEnabled` flag to chain-level feature-flag `ChainConfiguration` type and updated the validation schema to accept the new flag ([#5783](https://github.com/MetaMask/core/pull/5783))
- Add and export `calcSlippagePercentage`, a utility that calculates the absolute slippage percentage based on the adjusted return and the sent amount ([#5723](https://github.com/MetaMask/core/pull/5723)).
- Error logs for invalid getQuote responses ([#5816](https://github.com/MetaMask/core/pull/5816))

### Changed

- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

## [25.0.1]

### Fixed

- Use zero address as solana's default native address instead of assetId ([#5799](https://github.com/MetaMask/core/pull/5799))

## [25.0.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/assets-controllers` peer dependency to `^63.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- **BREAKING:** bump `@metamask/transaction-controller` peer dependency to `^56.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))

## [24.0.0]

### Added

- Sentry traces for `BridgeQuotesFetched` and `SwapQuotesFetched` events ([#5780](https://github.com/MetaMask/core/pull/5780))
- Export `isCrossChain` utility ([#5780](https://github.com/MetaMask/core/pull/5780))

### Changed

- **BREAKING:** Remove `BridgeToken` export ([#5768](https://github.com/MetaMask/core/pull/5768))
- `traceFn` added to BridgeController constructor to enable clients to pass in a custom sentry trace handler ([#5768](https://github.com/MetaMask/core/pull/5768))

## [23.0.0]

### Changed

- **BREAKING** Rename `QuoteResponse.bridgePriceData` to `priceData` ([#5784](https://github.com/MetaMask/core/pull/5784))

### Fixed

- Handle cancelled bridge quote polling gracefully by skipping state updates ([#5787](https://github.com/MetaMask/core/pull/5787))

## [22.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^62.0.0` ([#5780](https://github.com/MetaMask/core/pull/5780))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [21.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- **BREAKING:** Bump `@metamask/assets-controller` peer dependency to `^61.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^55.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))

## [20.0.0]

### Changed

- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))
- Update `Quote` type with `bridgePriceData`, which includes metadata about transferred amounts and the trade's priceImpact ([#5721](https://github.com/MetaMask/core/pull/5721))
- Include submitted quote's `priceImpact` as a property in analytics events ([#5721](https://github.com/MetaMask/core/pull/5721))
- **BREAKING:** Add additional required properties to Submitted, Completed, Failed and SnapConfirmationViewed events ([#5721](https://github.com/MetaMask/core/pull/5721))
- **BREAKING:** Use `RemoteFeatureFlagController` to fetch feature flags, removed client specific feature flag keys. The feature flags you receive are now client specific based on the `RemoteFeatureFlagController` state. ([#5708](https://github.com/MetaMask/core/pull/5708))

### Fixed

- Update MetricsSwapType.SINGLE to `single_chain` to match segment events schema ([#5721](https://github.com/MetaMask/core/pull/5721))

## [19.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` peer dependency to `^60.0.0` ([#5717](https://github.com/MetaMask/core/pull/5717))

## [18.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` peer dependency to `^59.0.0` ([#5712](https://github.com/MetaMask/core/pull/5712))

## [17.0.0]

### Added

- Add analytics events for the Unified SwapBridge experience ([#5684](https://github.com/MetaMask/core/pull/5684))

### Changed

- Bump `@metamask/multichain-network-controller` dependency to `^0.5.1` ([#5678](https://github.com/MetaMask/core/pull/5678))
- **BREAKING:** trackMetaMetricsFn added to BridgeController constructor to enable clients to pass in a custom analytics handler ([#5684](https://github.com/MetaMask/core/pull/5684))
- **BREAKING:** added a context argument to `updateBridgeQuoteRequestParams` to provide values required for analytics events ([#5684](https://github.com/MetaMask/core/pull/5684))

### Fixed

- Fixes undefined native EVM exchange rates and snap handler calls ([#5696](https://github.com/MetaMask/core/pull/5696))

## [16.0.0]

### Changed

- **BREAKING** Bump `@metamask/assets-controllers` peer dependency to `^58.0.0` ([#5672](https://github.com/MetaMask/core/pull/5672))
- **BREAKING** Bump `@metamask/snaps-controllers` peer dependency from ^9.19.0 to ^11.0.0 ([#5639](https://github.com/MetaMask/core/pull/5639))
- Bump `@metamask/multichain-network-controller` dependency to `^0.5.0` ([#5669](https://github.com/MetaMask/core/pull/5669))

## [15.0.0]

### Changed

- **BREAKING:** Bump `@metamask/assets-controllers` peer dependency to `^57.0.0` ([#5665](https://github.com/MetaMask/core/pull/5665))

## [14.0.0]

### Added

- **BREAKING:** Add `@metamask/assets-controllers` as a required peer dependency at `^56.0.0` ([#5614](https://github.com/MetaMask/core/pull/5614))
- Add `reselect` as a dependency at `^5.1.1` ([#5614](https://github.com/MetaMask/core/pull/5614))
- **BREAKING:** assetExchangeRates added to BridgeController state to support tokens which are not supported by assets controllers ([#5614](https://github.com/MetaMask/core/pull/5614))
- selectExchangeRateByChainIdAndAddress selector added, which looks up exchange rates from assets and bridge controller states ([#5614](https://github.com/MetaMask/core/pull/5614))
- selectBridgeQuotes selector added, which returns sorted quotes including their metadata ([#5614](https://github.com/MetaMask/core/pull/5614))
- selectIsQuoteExpired selector added, which returns whether quotes are expired or stale ([#5614](https://github.com/MetaMask/core/pull/5614))

### Changed

- **BREAKING:** Change TokenAmountValues key types from BigNumber to string ([#5614](https://github.com/MetaMask/core/pull/5614))
- **BREAKING:** Assets controller getState actions have been added to `AllowedActions` so clients will need to include `TokenRatesController:getState`,`MultichainAssetsRatesController:getState` and `CurrencyRateController:getState` in controller initializations ([#5614](https://github.com/MetaMask/core/pull/5614))
- Make srcAsset and destAsset optional in Step type to be optional ([#5614](https://github.com/MetaMask/core/pull/5614))
- Make QuoteResponse trade generic to support Solana quotes which have string trade data ([#5614](https://github.com/MetaMask/core/pull/5614))
- Bump `@metamask/multichain-network-controller` peer dependency to `^0.4.0` ([#5649](https://github.com/MetaMask/core/pull/5649))

## [13.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^54.0.0` ([#5615](https://github.com/MetaMask/core/pull/5615))

## [12.0.0]

### Added

- Occurrences added to BridgeToken type ([#5572](https://github.com/MetaMask/core/pull/5572))

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^53.0.0` ([#5585](https://github.com/MetaMask/core/pull/5585))
- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

## [11.0.0]

### Added

- BREAKING: Bump dependency @metamask/keyring-api to ^17.2.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- BREAKING: Bump dependency @metamask/multichain-network-controller to ^0.3.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- BREAKING: Bump dependency @metamask/snaps-utils to ^8.10.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- BREAKING: Bump peer dependency @metamask/snaps-controllers to ^9.19.0 ([#5486](https://github.com/MetaMask/core/pull/5486))
- Solana constants, utils, quote and token support ([#5486](https://github.com/MetaMask/core/pull/5486))
- Utilities to convert chainIds between `ChainId`, `Hex`, `string` and `CaipChainId` ([#5486](https://github.com/MetaMask/core/pull/5486))
- Add `refreshRate` feature flag to enable chain-specific quote refresh intervals ([#5486](https://github.com/MetaMask/core/pull/5486))
- `isNativeAddress` and `isSolanaChainId` utilities that can be used by both the controller and clients ([#5486](https://github.com/MetaMask/core/pull/5486))

### Changed

- Replace QuoteRequest usages with `GenericQuoteRequest` to support both EVM and multichain input parameters ([#5486](https://github.com/MetaMask/core/pull/5486))
- Make `QuoteRequest.slippage` optional ([#5486](https://github.com/MetaMask/core/pull/5486))
- Deprecate `SwapsTokenObject` and replace usages with multichain BridgeAsset ([#5486](https://github.com/MetaMask/core/pull/5486))
- Changed `bridgeFeatureFlags.extensionConfig.chains` to key configs by CAIP chainIds ([#5486](https://github.com/MetaMask/core/pull/5486))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^52.0.0` ([#5513](https://github.com/MetaMask/core/pull/5513))

## [9.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^51.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- Bump `@metamask/polling-controller` to `^13.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^50.0.0` ([#5496](https://github.com/MetaMask/core/pull/5496))

## [7.0.0]

### Changed

- Bump `@metamask/accounts-controller` dev dependency to `^26.1.0` ([#5481](https://github.com/MetaMask/core/pull/5481))
- **BREAKING:** Allow changing the Bridge API url through the `config` param in the constructor. Remove previous method of doing it through `process.env`. ([#5465](https://github.com/MetaMask/core/pull/5465))

### Fixed

- Make `QuoteResponse.approval` optional to align with response from API ([#5475](https://github.com/MetaMask/core/pull/5475))
- Export enums properly rather than as types ([#5466](https://github.com/MetaMask/core/pull/5466))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^49.0.0` ([#5471](https://github.com/MetaMask/core/pull/5471))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^48.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^47.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [3.0.0]

### Changed

- **BREAKING:** Switch over from `ethers` at v6 to `@ethersproject` packages at v5.7.0 for mobile compatibility ([#5416](https://github.com/MetaMask/core/pull/5416))
- Improve `BridgeController` API response validation readability by using `@metamask/superstruct` ([#5408](https://github.com/MetaMask/core/pull/5408))

## [2.0.0]

### Added

- Mobile feature flags ([#5359](https://github.com/MetaMask/core/pull/5359))

### Changed

- **BREAKING:** Change `BridgeController` state structure to have all fields at root of state ([#5406](https://github.com/MetaMask/core/pull/5406))
- **BREAKING:** Change `BridgeController` state defaults to `null` instead of `undefined` ([#5406](https://github.com/MetaMask/core/pull/5406))

## [1.0.0]

### Added

- Initial release ([#5317](https://github.com/MetaMask/core/pull/5317))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@37.0.0...HEAD
[37.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@36.2.0...@metamask/bridge-controller@37.0.0
[36.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@36.1.0...@metamask/bridge-controller@36.2.0
[36.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@36.0.0...@metamask/bridge-controller@36.1.0
[36.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@35.0.0...@metamask/bridge-controller@36.0.0
[35.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@34.0.0...@metamask/bridge-controller@35.0.0
[34.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@33.0.1...@metamask/bridge-controller@34.0.0
[33.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@33.0.0...@metamask/bridge-controller@33.0.1
[33.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.2.0...@metamask/bridge-controller@33.0.0
[32.2.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.1.2...@metamask/bridge-controller@32.2.0
[32.1.2]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.1.1...@metamask/bridge-controller@32.1.2
[32.1.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.1.0...@metamask/bridge-controller@32.1.1
[32.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.0.1...@metamask/bridge-controller@32.1.0
[32.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@32.0.0...@metamask/bridge-controller@32.0.1
[32.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@31.0.0...@metamask/bridge-controller@32.0.0
[31.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@30.0.0...@metamask/bridge-controller@31.0.0
[30.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@29.0.0...@metamask/bridge-controller@30.0.0
[29.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@28.0.0...@metamask/bridge-controller@29.0.0
[28.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@27.0.0...@metamask/bridge-controller@28.0.0
[27.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@26.0.0...@metamask/bridge-controller@27.0.0
[26.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@25.1.0...@metamask/bridge-controller@26.0.0
[25.1.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@25.0.1...@metamask/bridge-controller@25.1.0
[25.0.1]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@25.0.0...@metamask/bridge-controller@25.0.1
[25.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@24.0.0...@metamask/bridge-controller@25.0.0
[24.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@23.0.0...@metamask/bridge-controller@24.0.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@22.0.0...@metamask/bridge-controller@23.0.0
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@21.0.0...@metamask/bridge-controller@22.0.0
[21.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@20.0.0...@metamask/bridge-controller@21.0.0
[20.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@19.0.0...@metamask/bridge-controller@20.0.0
[19.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@18.0.0...@metamask/bridge-controller@19.0.0
[18.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@17.0.0...@metamask/bridge-controller@18.0.0
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@16.0.0...@metamask/bridge-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@15.0.0...@metamask/bridge-controller@16.0.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@14.0.0...@metamask/bridge-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@13.0.0...@metamask/bridge-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@12.0.0...@metamask/bridge-controller@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@11.0.0...@metamask/bridge-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@10.0.0...@metamask/bridge-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@9.0.0...@metamask/bridge-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@8.0.0...@metamask/bridge-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@7.0.0...@metamask/bridge-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@6.0.0...@metamask/bridge-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@5.0.0...@metamask/bridge-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@4.0.0...@metamask/bridge-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@3.0.0...@metamask/bridge-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@2.0.0...@metamask/bridge-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@1.0.0...@metamask/bridge-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/bridge-controller@1.0.0
