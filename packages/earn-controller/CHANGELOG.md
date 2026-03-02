# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Release/833.0.0 ([#8031](https://github.com/MetaMask/core/pull/8031))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- Release 828.0.0 ([#8005](https://github.com/MetaMask/core/pull/8005))

## [11.1.1]

### Changed

- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/keyring-api` from `^21.0.0` to `^21.5.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/account-tree-controller` from `^4.0.0` to `^4.1.1` ([#7869](https://github.com/MetaMask/core/pull/7869)), ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [11.1.0]

### Added

- Add Tron staking APY support with `tron_staking` state, methods, and selectors ([#7448](https://github.com/MetaMask/core/pull/7448))

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7258](https://github.com/MetaMask/core/pull/7258), [#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642))
  - The dependencies moved are:
    - `@metamask/account-tree-controller` (^4.0.0)
    - `@metamask/network-controller` (^29.0.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.18.0` ([#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583))

## [11.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/network-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/account-tree-controller` from `^3.0.0` to `^4.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/account-tree-controller` from `^2.0.0` to `^3.0.0` ([#7100](https://github.com/MetaMask/core/pull/7100))
- Bump `@metamask/controller-utils` from `^11.14.1` to `^11.15.0` ([#7003](https://github.com/MetaMask/core/pull/7003))

## [9.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6445](https://github.com/MetaMask/core/pull/6445))
  - Previously, `EarnController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6445](https://github.com/MetaMask/core/pull/6445))
- **BREAKING:** Bump `@metamask/account-tree-controller` from `^1.0.0` to `^2.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [8.0.2]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- Bump `@metamask/transaction-controller` from `^60.7.0` to `^60.8.0` ([#6883](https://github.com/MetaMask/core/pull/6883))

## [8.0.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/controller-utils` from `^11.14.0` to `^11.14.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [8.0.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6555](https://github.com/MetaMask/core/pull/6555))

### Changed

- **BREAKING:** Bump peer dependency `@metamask/account-tree-controller` from `^0.12.1` to `^1.0.0` ([#6652](https://github.com/MetaMask/core/pull/6652), [#6676](https://github.com/MetaMask/core/pull/6676))
- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.0` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.4.0` ([#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632))
- Bump `@metamask/keyring-api` from `^20.1.0` to `^21.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))

## [7.0.0]

### Added

- Added `@metamask/keyring-api` as a dependency ([#6402](https://github.com/MetaMask/core/pull/6402))
- Added `@metamask/account-tree-controller` as a dev and peer dependency ([#6402](https://github.com/MetaMask/core/pull/6402))

### Changed

- **BREAKING:** `EarnController` messenger must now allow `AccountTreeController:selectedAccountGroupChange` and `AccountTreeController:getAccountsFromSelectedAccountGroup` for BIP-44 compatibility and must not allow `AccountsController:selectedAccountChange` and `AccountsController:getSelectedAccount` ([#6402](https://github.com/MetaMask/core/pull/6402))
- `executeLendingDeposit`, `executeLendingWithdraw` and `executeLendingTokenApprove` now throw errors if no selected address is found ([#6402](https://github.com/MetaMask/core/pull/6402))
- `getLendingTokenAllowance`, `getLendingTokenMaxWithdraw` and `getLendingTokenMaxDeposit` now return `undefined` is no selected address is found ([#6402](https://github.com/MetaMask/core/pull/6402))
- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

### Removed

- Removed `@metamask/accounts-controller` as a dev and peer dependency ([#6402](https://github.com/MetaMask/core/pull/6402))

## [6.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))

## [5.0.0]

### Added

- **BREAKING:** Added mandatory parameter `selectedNetworkClientId` to `EarnController` constructor ([#6153](https://github.com/MetaMask/core/pull/6153))
- **BREAKING:** Added mandatory `chainId` parameter to `executeLendingTokenApprove`, `executeLendingWithdraw`, `executeLendingDeposit`, `getLendingMarketDailyApysAndAverages` and `getLendingPositionHistory` methods ([#6153](https://github.com/MetaMask/core/pull/6153))
- **BREAKING:** Changed `refreshPooledStakingVaultDailyApys` to accept an options object with `chainId`, `days`, and `order` properties, where `chainId` is a new option, instead of separate parameters `days` and `order` ([#6153](https://github.com/MetaMask/core/pull/6153))
- Added optional `chainId` parameter to `refreshPooledStakingVaultApyAverages`, `refreshPooledStakingVaultMetadata` and `refreshPooledStakes` (defaults to Ethereum) ([#6153](https://github.com/MetaMask/core/pull/6153))

### Changed

- **BREAKING:** Removed usages of `NetworkController:getState` for GNS removal. ([#6153](https://github.com/MetaMask/core/pull/6153))
- **BREAKING:** `EarnController` messenger must now allow `NetworkController:networkDidChange` and must not allow `NetworkController:getState` and `NetworkController:stateChange` ([#6153](https://github.com/MetaMask/core/pull/6153))
- `refreshPooledStakingData` now refreshes for all supported chains, not just global chain ([#6153](https://github.com/MetaMask/core/pull/6153))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))

## [4.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))

## [3.0.0]

### Changed

- **BREAKING:** Removed `chainId` parameter from `refreshPooledStakingVaultMetadata`, `refreshPooledStakingVaultDailyApys`, `refreshPooledStakingVaultApyAverages`, and `refreshPooledStakes` methods. ([#6106](https://github.com/MetaMask/core/pull/6106))
- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))

## [2.0.1]

### Changed

- Changes `EarnController.addTransaction` gasLimit logic in several methods such that the param can be set undefined through contract method param `gasOptions.gasLimit` being set to `none` ([#6038](https://github.com/MetaMask/core/pull/6038))
  - `executeLendingDeposit`
  - `executeLendingWithdraw`
  - `executeLendingTokenApprove`

## [2.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [1.1.1]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@11.1.1...HEAD
[11.1.1]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@11.1.0...@metamask/earn-controller@11.1.1
[11.1.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@11.0.0...@metamask/earn-controller@11.1.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@10.0.0...@metamask/earn-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@9.0.0...@metamask/earn-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@8.0.2...@metamask/earn-controller@9.0.0
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@8.0.1...@metamask/earn-controller@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@8.0.0...@metamask/earn-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@7.0.0...@metamask/earn-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@6.0.0...@metamask/earn-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@5.0.0...@metamask/earn-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@4.0.0...@metamask/earn-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@3.0.0...@metamask/earn-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@2.0.1...@metamask/earn-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@2.0.0...@metamask/earn-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@1.1.1...@metamask/earn-controller@2.0.0
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/earn-controller@1.1.0...@metamask/earn-controller@1.1.1
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
