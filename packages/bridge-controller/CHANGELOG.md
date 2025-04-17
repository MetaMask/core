# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/bridge-controller@16.0.0...HEAD
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
