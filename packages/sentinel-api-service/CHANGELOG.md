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
  - Target a selectable Sentinel environment via the `environment` constructor option and the `SentinelEnvironment` enum (`Dev`, `Uat`, `Prod`), defaulting to `Prod`
  - Disable retries by default (`maxRetries: 0`) to match the single-request behaviour of the clients this service replaces; callers can opt in via `policyOptions.maxRetries`
  - Export the `SentinelApiServiceOptions` type describing the constructor options

[Unreleased]: https://github.com/MetaMask/core/
