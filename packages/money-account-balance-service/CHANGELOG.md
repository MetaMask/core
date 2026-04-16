# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `money-account-balance-service` to the root `tsconfig.json` and `tsconfig.build.json` files so that it is usable ([#8477](https://github.com/MetaMask/core/pull/8477))

## [0.1.0]

### Added

- Add `MoneyAccountBalanceService` data service ([#8428](https://github.com/MetaMask/core/pull/8428))
  - Fetch mUSD ERC-20 balance via RPC (`getMusdBalance`)
  - Fetch musdSHFvd vault share balance via RPC (`getMusdSHFvdBalance`)
  - Fetch Veda Accountant exchange rate via RPC (`getExchangeRate`)
  - Compute mUSD-equivalent value of vault share holdings (`getMusdEquivalentValue`)
  - Fetch vault APY from the Veda performance REST API (`getVaultApy`)

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/money-account-balance-service@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/money-account-balance-service@0.1.0
