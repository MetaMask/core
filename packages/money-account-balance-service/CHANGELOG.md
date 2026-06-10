# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/controller-utils` from `^12.1.1` to `^12.2.0` ([#9083](https://github.com/MetaMask/core/pull/9083))
- Bump `@metamask/base-data-service` from `^0.1.2` to `^0.1.3` ([#8799](https://github.com/MetaMask/core/pull/8799))
- Bump `@metamask/remote-feature-flag-controller` from `^4.2.1` to `^4.2.2` ([#8986](https://github.com/MetaMask/core/pull/8986))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.1.1` ([#9058](https://github.com/MetaMask/core/pull/9058))

## [1.0.2]

### Changed

- Bump `@metamask/network-controller` from `^31.0.0` to `^32.0.0` ([#8765](https://github.com/MetaMask/core/pull/8765), [#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))

## [1.0.1]

### Changed

- Bump `@metamask/base-data-service` from `^0.1.1` to `^0.1.2` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/network-controller` from `^30.1.0` to `^31.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/remote-feature-flag-controller` from `^4.2.0` to `^4.2.1` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [1.0.0]

### Added

- Add `VaultConfigNotAvailableError` and `VaultConfigValidationError` error classes for typed consumer error handling ([#8742](https://github.com/MetaMask/core/pull/8742))
- Add `LENS_ABI` constant for the Arctic Architecture Lens contract ([#8742](https://github.com/MetaMask/core/pull/8742))

### Changed

- **BREAKING:** `MoneyAccountBalanceService` no longer accepts vault config via constructor. Vault config is now read from `RemoteFeatureFlagController` state. Add `@metamask/remote-feature-flag-controller` as a dependency and permit `RemoteFeatureFlagController:getState`action and `RemoteFeatureFlagController:stateChange` event on the service's messenger. Service methods throw `VaultConfigNotAvailableError` until a valid config is available. ([#8742](https://github.com/MetaMask/core/pull/8742))
- **BREAKING:** `VaultConfig` fields have changed — `vaultAddress` → `boringVault`, `vaultChainId` → `chainId`; `underlyingTokenAddress` and `underlyingTokenDecimals` removed; `lensAddress` and `tellerAddress` added ([#8742](https://github.com/MetaMask/core/pull/8742))
- **BREAKING:** `MusdEquivalentValueResponse` shape has changed — `musdSHFvdBalance`, `exchangeRate`, and `musdEquivalentValue` replaced by a single `balanceOfInAssets` field ([#8742](https://github.com/MetaMask/core/pull/8742))
- Monad (`0x8f`) added to `VEDA_API_NETWORK_NAMES` ([#8742](https://github.com/MetaMask/core/pull/8742))
- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/network-controller` from `^30.0.1` to `^30.1.0` ([#8636](https://github.com/MetaMask/core/pull/8636))

## [0.2.0]

### Added

- Add `money-account-balance-service` to the root `tsconfig.json` and `tsconfig.build.json` files so that it is usable ([#8477](https://github.com/MetaMask/core/pull/8477))

## [0.1.0] [DEPRECATED]

### Added

- Add `MoneyAccountBalanceService` data service ([#8428](https://github.com/MetaMask/core/pull/8428))
  - Fetch mUSD ERC-20 balance via RPC (`getMusdBalance`)
  - Fetch musdSHFvd vault share balance via RPC (`getMusdSHFvdBalance`)
  - Fetch Veda Accountant exchange rate via RPC (`getExchangeRate`)
  - Compute mUSD-equivalent value of vault share holdings (`getMusdEquivalentValue`)
  - Fetch vault APY from the Veda performance REST API (`getVaultApy`)

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@1.0.2...HEAD
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@1.0.1...@metamask/money-account-balance-service@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@1.0.0...@metamask/money-account-balance-service@1.0.1
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@0.2.0...@metamask/money-account-balance-service@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@0.1.0...@metamask/money-account-balance-service@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-balance-service@0.1.0
