# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `SampleGasPricesController.updateGasPrices` is now callable via the messaging system ([#6168](https://github.com/MetaMask/core/pull/6168))
  - An action type, `SampleGasPricesControllerUpdateGasPricesAction`, is now available for use
- `SamplePetnamesController.assignPetname` is now callable via the messaging system ([#6168](https://github.com/MetaMask/core/pull/6168))
  - An action type, `SamplePetnamesControllerAssignPetnameAction`, is now available for use
- Export new types for `SampleGasPricesService` ([#6168](https://github.com/MetaMask/core/pull/6168))
  - `SampleGasPricesServiceActions`
  - `SampleGasPricesServiceEvents`
  - `SampleGasPricesServiceFetchGasPricesAction`
  - `SampleGasPricesServiceMessenger`
- Export `getDefaultPetnamesControllerState` ([#6168](https://github.com/MetaMask/core/pull/6168))

### Changed

- **BREAKING:** The messenger for `SampleGasPricesController` now expects `NetworkController:getNetworkClientById` to be allowed, and no longer expects `NetworkController:getState` to be allowed ([#6168](https://github.com/MetaMask/core/pull/6168))
- **BREAKING:** `SampleGasPricesController.updateGasPrices` now takes a required `chainId` option ([#6168](https://github.com/MetaMask/core/pull/6168))
- `SampleGasPricesController` will now automatically update gas prices when the globally selected chain changes ([#6168](https://github.com/MetaMask/core/pull/6168))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.2.0` ([#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

### Removed

- **BREAKING:** `SampleGasPricesController` no longer takes a `gasPricesService` option ([#6168](https://github.com/MetaMask/core/pull/6168))
  - The controller now expects `SampleGasPricesService` to have been instantiated ahead of time

## [1.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))

## [0.1.0]

### Added

- Initial release of @metamask/sample-controllers.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@0.1.0...@metamask/sample-controllers@1.0.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/sample-controllers@0.1.0
