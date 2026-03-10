# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: Update `generate-method-action-types` script to be used in a single package ([#7983](https://github.com/MetaMask/core/pull/7983))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))

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
