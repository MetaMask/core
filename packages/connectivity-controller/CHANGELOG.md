# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `init` method to asynchronously fetch and set the initial connectivity status from the adapter ([#7679](https://github.com/MetaMask/core/pull/7679))
  - The controller now initializes with a default state (online) and requires calling `init()` to fetch the actual status
- Add `setConnectivityStatus` method to manually set connectivity status ([#7676](https://github.com/MetaMask/core/pull/7676))
  - The method is exposed as a messenger action `ConnectivityController:setConnectivityStatus`

### Changed

- **BREAKING:** `ConnectivityAdapter.getStatus()` must now return a `Promise<ConnectivityStatus>` (async) ([#7679](https://github.com/MetaMask/core/pull/7679))
  - Adapter implementations must update their `getStatus()` method to return a Promise
  - This change enables asynchronous initialization of the controller via the `init()` method

## [0.1.0]

### Added

- Initial release ([#7623](https://github.com/MetaMask/core/pull/7623))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/connectivity-controller@0.1.0...HEAD
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/connectivity-controller@0.1.0
