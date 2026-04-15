# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- Revert "Release 912.0.0 (#8451)" ([#8451](https://github.com/MetaMask/core/pull/8451))
- Release 912.0.0 ([#8451](https://github.com/MetaMask/core/pull/8451))
- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- feat: extract generate-action-types CLI into @metamask/messenger-cli ([#8378](https://github.com/MetaMask/core/pull/8378))
- feat(messenger): add `generate-action-types` CLI tool as subpath export ([#8264](https://github.com/MetaMask/core/pull/8264))
- chore: simplify auto-generated file header comment ([#8279](https://github.com/MetaMask/core/pull/8279))
- chore: Update Core Platform controllers to expose all methods through messenger ([#8193](https://github.com/MetaMask/core/pull/8193))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: Update `generate-method-action-types` script to be used in a single package ([#7983](https://github.com/MetaMask/core/pull/7983))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- Release/752.0.0 ([#7642](https://github.com/MetaMask/core/pull/7642))

### Added

- Add `connectivityControllerSelectors` with `selectConnectivityStatus` and `selectIsOffline` selectors ([#7701](https://github.com/MetaMask/core/pull/7701))
  - `selectConnectivityStatus` returns the current connectivity status from the controller state
  - `selectIsOffline` is a memoized selector that returns `true` when the device is offline

### Changed

- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

## [0.2.0]

### Added

- Add `init` method to asynchronously fetch and set the initial connectivity status from the adapter ([#7679](https://github.com/MetaMask/core/pull/7679))
  - The controller now initializes with a default state (online) and requires calling `init()` to fetch the actual status
  - This method can be called through the messenger action `ConnectivityController:init`
- Add `setConnectivityStatus` method to manually set connectivity status ([#7676](https://github.com/MetaMask/core/pull/7676))
  - The method is exposed as a messenger action `ConnectivityController:setConnectivityStatus`

### Changed

- **BREAKING:** `ConnectivityAdapter.getStatus()` must now return a `Promise<ConnectivityStatus>` (async) ([#7679](https://github.com/MetaMask/core/pull/7679))
  - Adapter implementations must update their `getStatus()` method to return a Promise
  - This change enables asynchronous initialization of the controller via the `init()` method
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [0.1.0]

### Added

- Initial release ([#7623](https://github.com/MetaMask/core/pull/7623))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/connectivity-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/connectivity-controller@0.1.0...@metamask/connectivity-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/connectivity-controller@0.1.0
