# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Ensure refs in tsconfig files are synced with internal deps ([#8384](https://github.com/MetaMask/core/pull/8384))

### Added

- Add `fetchBalanceWithFallback` facade that selects Money API or RPC balance sources from the `moneyAccountBalanceSource` remote feature flag (`api` | `rpc` | `api-only` | `rpc-only`; default `rpc` = RPC primary with Money API fallback). Returns canonical amounts plus `source` and `usedFallback` provenance; reports validation/unavailable source defects via messenger `captureException`; throws `MoneyAccountBalanceFetchError` when all eligible sources fail. ([#9554](https://github.com/MetaMask/core/pull/9554))
- Permit `MoneyAccountApiDataService:fetchPositions` on the balance service messenger so the facade can read Money API balances. ([#9554](https://github.com/MetaMask/core/pull/9554))
- Export `CanonicalMoneyAccountBalanceResponse`, balance-source constants/types, and `MoneyAccountBalanceFetchError` / `MoneyAccountBalanceUnavailableError` / `MoneyAccountBalanceValidationError`. ([#9554](https://github.com/MetaMask/core/pull/9554))

## [2.2.0]

### Added

- Add optional `trace` constructor option to `MoneyAccountBalanceService` for tracing network requests (RPC calls and the Veda APY API fetch). Tracing is best-effort and does not affect query results if it fails. ([#9434](https://github.com/MetaMask/core/pull/9434))

### Changed

- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [2.1.2]

### Changed

- Bump `@metamask/network-controller` from `^33.0.0` to `^34.0.0` ([#9349](https://github.com/MetaMask/core/pull/9349))

## [2.1.1]

### Changed

- Bump `@metamask/controller-utils` from `^12.2.0` to `^12.3.0` ([#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/network-controller` from `^32.0.0` to `^33.0.0` ([#9218](https://github.com/MetaMask/core/pull/9218))

## [2.1.0]

### Changed

- Fetch on-chain Money account balances at the `pending` block tag instead of `latest`, so a balance refetch triggered by `TransactionController:transactionConfirmed` returns the post-transaction balance immediately rather than stale data for up to ~20 seconds. ([#9163](https://github.com/MetaMask/core/pull/9163))
  - Applies to `getMoneyAccountBalance`, `getMusdBalance`, `getVmusdBalance`, and `getMusdEquivalentValue`. As a result these reads now reflect pending (mempool-inclusive) state. `getExchangeRate` and the on-chain `Accountant.base()` token-address lookup intentionally remain on `latest`.

## [2.0.0]

### Added

- Add `getMoneyAccountBalance` method that fetches the account's mUSD wallet balance and vault shares valued in mUSD in a single Multicall3 `aggregate3` request. ([#9100](https://github.com/MetaMask/core/pull/9100))
- Add optional `underlyingToken` field to `VaultConfig` (validated by `VaultConfigStruct`). When present, `getMusdBalance` reads the underlying mUSD token address from config and skips the on-chain `Accountant.base()` call; when absent it falls back to reading `base()` on-chain. ([#9100](https://github.com/MetaMask/core/pull/9100))
- Add support for configuring the balance `staleTime` at runtime via the `moneyAccountBalanceStaletime` remote feature flag. The flag is read during `init()` and updated on `RemoteFeatureFlagController:stateChange`; absent or malformed values fall back to the default of 60 seconds. ([#9100](https://github.com/MetaMask/core/pull/9100))

### Changed

- **BREAKING:** Rename `musdSHFvd` to `vmusd` across the public API to align with the vmUSD token name: ([#9100](https://github.com/MetaMask/core/pull/9100))
  - `getMusdSHFvdBalance` method → `getVmusdBalance`
  - `MoneyAccountBalanceServiceGetMusdSHFvdBalanceAction` type → `MoneyAccountBalanceServiceGetVmusdBalanceAction`
  - `MoneyAccountBalanceService:getMusdSHFvdBalance` messenger action string → `MoneyAccountBalanceService:getVmusdBalance`
  - `MoneyAccountBalanceResponse.musdSHFvdValueInMusd` property → `vmusdValueInMusd`
- Increase the default `staleTime` for on-chain balance reads (`getMusdBalance`, `getVmusdBalance`, `getMusdEquivalentValue`, and the default for `getExchangeRate`) from 30 seconds to 60 seconds. This default is now overridable via the `moneyAccountBalanceStaletime` remote feature flag. ([#9100](https://github.com/MetaMask/core/pull/9100))
- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.2.0` ([#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083))
- Bump `@metamask/base-data-service` from `^0.1.2` to `^0.1.3` ([#8799](https://github.com/MetaMask/core/pull/8799))
- Bump `@metamask/remote-feature-flag-controller` from `^4.2.1` to `^4.2.2` ([#8986](https://github.com/MetaMask/core/pull/8986))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@2.2.0...HEAD
[2.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@2.1.2...@metamask/money-account-balance-service@2.2.0
[2.1.2]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@2.1.1...@metamask/money-account-balance-service@2.1.2
[2.1.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@2.1.0...@metamask/money-account-balance-service@2.1.1
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@2.0.0...@metamask/money-account-balance-service@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@1.0.2...@metamask/money-account-balance-service@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@1.0.1...@metamask/money-account-balance-service@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@1.0.0...@metamask/money-account-balance-service@1.0.1
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@0.2.0...@metamask/money-account-balance-service@1.0.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@0.1.0...@metamask/money-account-balance-service@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-balance-service@0.1.0
