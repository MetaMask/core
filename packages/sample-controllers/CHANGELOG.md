# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))

## [4.0.3]

### Changed

- Bump `@metamask/network-controller` from `^29.0.0` to `^30.0.0` ([#7996](https://github.com/MetaMask/core/pull/7996))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [4.0.2]

### Changed

- Bump `@metamask/network-controller` from `^28.0.0` to `^29.0.0` ([#7642](https://github.com/MetaMask/core/pull/7642))

## [4.0.1]

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7258](https://github.com/MetaMask/core/pull/7258), [#7534](https://github.com/MetaMask/core/pull/7534), [#7583](https://github.com/MetaMask/core/pull/7583), [#7604](https://github.com/MetaMask/core/pull/7604))
  - The dependencies moved are:
    - `@metamask/network-controller` (^28.0.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` from `^25.0.0` to `^26.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [3.0.0]

### Changed

- **BREAKING:** Migrate to new `Messenger` class ([#6335](https://github.com/MetaMask/core/pull/6335))
- **BREAKING:** Rename metadata property `anonymous` to `includeInDebugSnapshot` ([#6335](https://github.com/MetaMask/core/pull/6335))
- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [2.0.2]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))

## [2.0.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [2.0.0]

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
- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6471](https://github.com/MetaMask/core/pull/6471))

### Changed

- **BREAKING:** The messenger for `SampleGasPricesController` now expects `NetworkController:getNetworkClientById` to be allowed, and no longer expects `NetworkController:getState` to be allowed ([#6168](https://github.com/MetaMask/core/pull/6168))
- **BREAKING:** `SampleGasPricesController.updateGasPrices` now takes a required `chainId` option ([#6168](https://github.com/MetaMask/core/pull/6168))
- `SampleGasPricesController` will now automatically update gas prices when the globally selected chain changes ([#6168](https://github.com/MetaMask/core/pull/6168))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.4.0` ([#6284](https://github.com/MetaMask/core/pull/6284), [#6355](https://github.com/MetaMask/core/pull/6355), [#6465](https://github.com/MetaMask/core/pull/6465), [#6632](https://github.com/MetaMask/core/pull/6632))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

### Removed

- **BREAKING:** `SampleGasPricesController` no longer takes a `gasPricesService` option ([#6168](https://github.com/MetaMask/core/pull/6168))
  - The controller now expects `SampleGasPricesService` to have been instantiated ahead of time
- **BREAKING:** Remove `SampleAbstractGasPricesService` ([#6168](https://github.com/MetaMask/core/pull/6168))

## [1.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))
- Bump `@metamask/base-controller` from ^8.0.0 to ^8.0.1 ([#5722](https://github.com/MetaMask/core/pull/5722))

## [0.1.0]

### Added

- Initial release of @metamask/sample-controllers.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@4.0.3...HEAD
[4.0.3]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@4.0.2...@metamask/sample-controllers@4.0.3
[4.0.2]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@4.0.1...@metamask/sample-controllers@4.0.2
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@4.0.0...@metamask/sample-controllers@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@3.0.0...@metamask/sample-controllers@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@2.0.2...@metamask/sample-controllers@3.0.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@2.0.1...@metamask/sample-controllers@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@2.0.0...@metamask/sample-controllers@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@1.0.0...@metamask/sample-controllers@2.0.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/sample-controllers@0.1.0...@metamask/sample-controllers@1.0.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/sample-controllers@0.1.0
