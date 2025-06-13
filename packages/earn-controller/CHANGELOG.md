# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/stake-sdk` to `^3.2.1` ([#5972](https://github.com/MetaMask/core/pull/5972))
- Bump `@metamask/transaction-controller` to `^57.3.0` ([#5954](https://github.com/MetaMask/core/pull/5954))

## [1.1.0]

### Changed

- Replace hardcoded `"lendingWithdraw"` in `LendingTransactionTypes` with `TransactionType.lendingWithdraw` ([#5936](https://github.com/MetaMask/core/pull/5936))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))

## [1.0.0]

### Added

- **BREAKING:** Added `addTransactionFn` option to the controller contructor which accepts the `TransactionController` `addTransaction` method ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added `@ethersproject/bignumber` as a dependency ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added `reselect` as a dependency ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added new lending-related types: ([#5828](https://github.com/MetaMask/core/pull/5828))
  - `LendingMarketWithPosition`
  - `LendingPositionWithMarket`
  - `LendingPositionWithMarketReference`
- Added new lending-related selectors: ([#5828](https://github.com/MetaMask/core/pull/5828))
  - `selectLendingMarkets`
  - `selectLendingPositions`
  - `selectLendingMarketsWithPosition`
  - `selectLendingPositionsByProtocol`
  - `selectLendingMarketByProtocolAndTokenAddress`
  - `selectLendingMarketForProtocolAndTokenAddress`
  - `selectLendingPositionsByChainId`
  - `selectLendingMarketsByChainId`
  - `selectLendingMarketsByProtocolAndId`
  - `selectLendingMarketForProtocolAndId`
  - `selectLendingPositionsWithMarket`
  - `selectLendingMarketsForChainId`
  - `selectIsLendingEligible`
  - `selectLendingPositionsByProtocolChainIdMarketId`
  - `selectLendingMarketsByTokenAddress`
  - `selectLendingMarketsByChainIdAndOutputTokenAddress`
  - `selectLendingMarketsByChainIdAndTokenAddress`
- Added exports from `@metamask/stake-sdk`: ([#5828](https://github.com/MetaMask/core/pull/5828))
  - `isSupportedLendingChain`
  - `isSupportedPooledStakingChain`
  - `CHAIN_ID_TO_AAVE_POOL_CONTRACT`
- Added new lending-related methods to `EarnController`: ([#5828](https://github.com/MetaMask/core/pull/5828))
  - `refreshLendingMarkets`
  - `refreshLendingPositions`
  - `refreshLendingEligibility`
  - `refreshLendingData`
  - `getLendingPositionHistory`
  - `getLendingMarketDailyApysAndAverages`
  - `executeLendingDeposit`
  - `executeLendingWithdraw`
  - `executeLendingTokenApprove`
  - `getLendingTokenAllowance`
  - `getLendingTokenMaxWithdraw`
  - `getLendingTokenMaxDeposit`
- **BREAKING:** Added `lending` key to the controller state to replace `stablecoin_lending` ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added optional `env` option which accepts an `EarnEnvironments` enum ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added async lending state data update on constructor initialization ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added refresh of lending positions and market data when the network state is updated ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added refresh of lending positions when the user account address is updated ([#5828](https://github.com/MetaMask/core/pull/5828))
- Added refresh of lending positions when a transaction matching lending type is confirmed ([#5828](https://github.com/MetaMask/core/pull/5828))

### Changed

- **BREAKING:** Updated `refreshPooledStakingVaultDailyApys` method to take chain id as its first param ([#5828](https://github.com/MetaMask/core/pull/5828))
- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- **BREAKING:** updates controller state to allow pooled staking data to be stored per supported chain id ([#5828](https://github.com/MetaMask/core/pull/5828))
- Updated `refreshPooledStakingData` to refresh pooled staking data for all supported chains ([#5828](https://github.com/MetaMask/core/pull/5828))
- Updated these methods to take an optional chain id to control which chain data is fetched for ([#5828](https://github.com/MetaMask/core/pull/5828))
  - `refreshPooledStakingVaultMetadata`
  - `refreshPooledStakes`
  - `refreshPooledStakingVaultDailyApys`
  - `refreshPooledStakingVaultApyAverages`
- Updated `refreshStakingEligibility` to update the eligibility in the lending state scope as well pooled staking ([#5828](https://github.com/MetaMask/core/pull/5828))
- Updated `refreshPooledStakes` method to take an optional chain id to control which chain data is fetched for ([#5828](https://github.com/MetaMask/core/pull/5828))
- Updated to refresh pooled staking data for all chains when the network state is updated ([#5828](https://github.com/MetaMask/core/pull/5828))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))
- Bump `@metamask/stake-sdk` dependency to `^3.2.0` ([#5828](https://github.com/MetaMask/core/pull/5828))

### Removed

- **BREAKING:** Removed lending-related types: ([#5828](https://github.com/MetaMask/core/pull/5828))
  - `StablecoinLendingState`
  - `StablecoinVault`
- **BREAKING:** Removed `stablecoin_lending` key from the controller state to replace with `lending` ([#5828](https://github.com/MetaMask/core/pull/5828))

## [0.15.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^30.0.0` ([#5888](https://github.com/MetaMask/core/pull/5888))
- Bump `@metamask/controller-utils` to `^11.9.0` ([#5812](https://github.com/MetaMask/core/pull/5812))

## [0.14.0]

### Changed

- **BREAKING:** bump `@metamask/accounts-controller` peer dependency to `^29.0.0` ([#5802](https://github.com/MetaMask/core/pull/5802))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))

## [0.13.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^28.0.0` ([#5763](https://github.com/MetaMask/core/pull/5763))
- Bump `@metamask/base-controller` from `^8.0.0` to `^8.0.1` ([#5722](https://github.com/MetaMask/core/pull/5722))

## [0.12.0]

### Changed

- **BREAKING:** Hardcoded Ethereum mainnet as selected chainId ([#5650](https://github.com/MetaMask/core/pull/5650))

## [0.11.0]

### Added

- Refresh staking data when staking txs are confirmed ([#5607](https://github.com/MetaMask/core/pull/5607))

### Changed

- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

## [0.10.0]

### Changed

- **BREAKING:** Updated `EarnController` methods (`refreshPooledStakingData`, `refreshPooledStakes`, and `refreshStakingEligibility`) to use an options bag parameter ([#5537](https://github.com/MetaMask/core/pull/5537))

## [0.9.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

## [0.8.0]

### Changed

- Updated refreshPooledStakingVaultDailyApys days arg default value to 365 ([#5453](https://github.com/MetaMask/core/pull/5453))

## [0.7.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))

## [0.6.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))

## [0.5.0]

### Added

- Add pooled staking vault daily apys and vault apy averages to earn controller ([#5368](https://github.com/MetaMask/core/pull/5368))

## [0.4.0]

### Added

- Add resetCache arg to `refreshPooledStakingData` and `refreshPooledStakes` in EarnController ([#5334](https://github.com/MetaMask/core/pull/5334))

## [0.3.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^23.0.0` to `^24.0.0` ([#5318](https://github.com/MetaMask/core/pull/5318))

## [0.2.1]

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [0.2.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^22.0.0` to `^23.0.0` ([#5292](https://github.com/MetaMask/core/pull/5292))
- Bump `@metamask/controller-utils` dependency from `^11.4.5` to `^11.5.0`([#5272](https://github.com/MetaMask/core/pull/5272))

## [0.1.0]

### Added

- Initial release ([#5271](https://github.com/MetaMask/core/pull/5271))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@1.1.0...HEAD
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@1.0.0...@metamask/earn-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.15.0...@metamask/earn-controller@1.0.0
[0.15.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.14.0...@metamask/earn-controller@0.15.0
[0.14.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.13.0...@metamask/earn-controller@0.14.0
[0.13.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.12.0...@metamask/earn-controller@0.13.0
[0.12.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.11.0...@metamask/earn-controller@0.12.0
[0.11.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.10.0...@metamask/earn-controller@0.11.0
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.9.0...@metamask/earn-controller@0.10.0
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.8.0...@metamask/earn-controller@0.9.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.7.0...@metamask/earn-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.6.0...@metamask/earn-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.5.0...@metamask/earn-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.4.0...@metamask/earn-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.3.0...@metamask/earn-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.2.1...@metamask/earn-controller@0.3.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.2.0...@metamask/earn-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@0.1.0...@metamask/earn-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/earn-controller@0.1.0
