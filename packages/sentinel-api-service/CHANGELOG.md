# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release ([#0](https://github.com/MetaMask/core/pull/0))
  - Add `SentinelApiService` data service centralising all interactions with the MetaMask Sentinel API
  - Simulate transactions via `infura_simulateTransactions` (`simulateTransactions`)
  - Submit gas station relay transactions via `eth_sendRelayTransaction` (`submitRelayTransaction`)
  - Poll relay transaction status by UUID (`getRelayStatus`)
  - Fetch and cache the supported-network registry (`getNetworks`)
  - Authenticate requests with client identity headers (`X-Client-Id`, `X-Client-Version`) and a best-effort `Authorization` bearer token from `AuthenticationController:getBearerToken`

[Unreleased]: https://github.com/MetaMask/core/
