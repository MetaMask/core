# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- fix(AssetController): switch price from Controller to state ([#7744](https://github.com/MetaMask/core/pull/7744))

### Added

- Complete rewrite of AssetsController with middleware architecture for unified asset management across all blockchain networks (EVM and non-EVM) ([#7685](https://github.com/MetaMask/core/pull/7685))
- Initial release ([#7587](https://github.com/MetaMask/core/pull/7587))
- Add `MulticallClient` for batching RPC calls using Multicall3 contract ([#7677](https://github.com/MetaMask/core/pull/7677))
- Add batch utilities (`divideIntoBatches`, `reduceInBatchesSerially`) for processing arrays in batches ([#7677](https://github.com/MetaMask/core/pull/7677))
- Add `TokenDetector` service for detecting ERC-20 tokens with non-zero balances on a chain ([#7683](https://github.com/MetaMask/core/pull/7683))
- Add `BalanceFetcher` service for fetching token balances for user's imported/detected tokens ([#7684](https://github.com/MetaMask/core/pull/7684))
- Add `viem` dependency for ABI encoding/decoding in MulticallClient
- Add configurable polling intervals for `RpcDataSource` via `RpcDataSourceConfig` in `initDataSources` ([#7709](https://github.com/MetaMask/core/pull/7709))
- Add comprehensive unit tests for data sources (`AccountsApiDataSource`, `BackendWebsocketDataSource`, `PriceDataSource`, `TokenDataSource`, `SnapDataSource`), `DetectionMiddleware`, and `AssetsController` ([#7714](https://github.com/MetaMask/core/pull/7714))

### Changed

- Bump `@metamask/keyring-controller` from `^25.0.0` to `^25.1.0` ([#7713](https://github.com/MetaMask/core/pull/7713))
- Refactor `MulticallClient` to use viem for ABI encoding/decoding instead of manual implementation
- Refactor `RpcDataSource` to delegate polling to `BalanceFetcher` and `TokenDetector` services ([#7709](https://github.com/MetaMask/core/pull/7709))
- Refactor `BalanceFetcher` and `TokenDetector` to extend `StaticIntervalPollingControllerOnly` for independent polling management ([#7709](https://github.com/MetaMask/core/pull/7709))

[Unreleased]: https://github.com/MetaMask/core/
