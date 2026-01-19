# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Complete rewrite of AssetsController with middleware architecture for unified asset management across all blockchain networks (EVM and non-EVM) ([#7657](https://github.com/MetaMask/core/pull/7657))
- Add data sources for fetching balances: `BackendWebsocketDataSource` (real-time), `AccountsApiDataSource` (HTTP polling), `SnapDataSource` (Solana/Bitcoin/Tron), `RpcDataSource` (direct RPC) ([#7657](https://github.com/MetaMask/core/pull/7657))
- Add enrichment middlewares: `DetectionMiddleware`, `TokenDataSource`, `PriceDataSource` ([#7657](https://github.com/MetaMask/core/pull/7657))
- Add `customAssets` state for user-added custom tokens with `addCustomAsset`, `removeCustomAsset`, `getCustomAssets` actions ([#7657](https://github.com/MetaMask/core/pull/7657))
- Add comprehensive type definitions for CAIP-19 asset identifiers, metadata, balances, and prices ([#7657](https://github.com/MetaMask/core/pull/7657))
- Add app lifecycle management (start/stop on app open/close and keyring lock/unlock) ([#7657](https://github.com/MetaMask/core/pull/7657))
- Add dynamic chain assignment algorithm for optimal data source selection ([#7657](https://github.com/MetaMask/core/pull/7657))
- Initial release ([#7587](https://github.com/MetaMask/core/pull/7587))

[Unreleased]: https://github.com/MetaMask/core/
