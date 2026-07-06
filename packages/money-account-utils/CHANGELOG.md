# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add mUSD token constants and guards, ported from MetaMask Mobile ([#9397](https://github.com/MetaMask/core/pull/9397))
  - Constants: `MUSD_TOKEN` (without client icon assets), `MUSD_DECIMALS`, `MUSD_TOKEN_ADDRESS`, `MUSD_TOKEN_ADDRESS_BY_CHAIN`, `MUSD_TOKEN_ASSET_ID_BY_CHAIN`, `MUSD_CURRENCY`, `MUSD_MONEY_ACCOUNT_CHAIN_IDS`
  - Guards: `isMusdToken`, `isMusdTokenOnChain`, `isMusdOnMoneyAccountChain`

[Unreleased]: https://github.com/MetaMask/core/
