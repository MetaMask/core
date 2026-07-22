# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `ConfigRegistryControllerStateChangedEvent` (`ConfigRegistryController:stateChanged`) to the controller's events ([#9595](https://github.com/MetaMask/core/pull/9595))
- Add `ConfigRegistryController.getNetworkConfigByCaip2ChainId` method to retrieve a network config by its CAIP-2 chain ID ([#0000](https://github.com/MetaMask/core/pull/0000))
  - The method returns the network config if found, or `undefined` if not found.
  - The method is also accessible via the controller's messenger as `ConfigRegistryController:getNetworkConfigByCaip2ChainId`.

### Changed

- Bump `@metamask/utils` from `^11.9.0` to `^11.11.0` ([#9074](https://github.com/MetaMask/core/pull/9074))
- Bump `@metamask/controller-utils` from `^12.1.1` to `^12.3.0` ([#9083](https://github.com/MetaMask/core/pull/9083), [#9218](https://github.com/MetaMask/core/pull/9218))
- Bump `@metamask/profile-sync-controller` from `^28.1.1` to `^28.3.0` ([#9119](https://github.com/MetaMask/core/pull/9119), [#9463](https://github.com/MetaMask/core/pull/9463))
- Bump `@metamask/keyring-controller` from `^27.0.0` to `^27.1.0` ([#9129](https://github.com/MetaMask/core/pull/9129))
- Bump `@metamask/polling-controller` from `^16.0.6` to `^16.0.8` ([#9218](https://github.com/MetaMask/core/pull/9218), [#9349](https://github.com/MetaMask/core/pull/9349))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

### Removed

- **BREAKING:** Removed `ConfigRegistryControllerStateChangeEvent` type in favor of `ConfigRegistryControllerStateChangedEvent` ([#9595](https://github.com/MetaMask/core/pull/9595))

## [0.4.1]

### Changed

- Bump `@metamask/remote-feature-flag-controller` from `^4.2.1` to `^4.2.2` ([#8986](https://github.com/MetaMask/core/pull/8986))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.1.1` ([#9058](https://github.com/MetaMask/core/pull/9058))
- Bump `@metamask/keyring-controller` from `^26.0.0` to `^27.0.0` ([#9058](https://github.com/MetaMask/core/pull/9058))

## [0.4.0]

### Changed

- **BREAKING:** `RegistryNetworkConfigSchema.assets.native.coingeckoCoinId` is now optional ([#8970](https://github.com/MetaMask/core/pull/8970))
  - The controller now accepts chains with no `assets.native.coingeckoCoinId` property in their configuration.

## [0.3.2]

### Changed

- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))
- Bump `@metamask/profile-sync-controller` from `^28.0.2` to `^28.1.1` ([#8783](https://github.com/MetaMask/core/pull/8783), [#8912](https://github.com/MetaMask/core/pull/8912))
- Bump `@metamask/polling-controller` from `^16.0.5` to `^16.0.6` ([#8834](https://github.com/MetaMask/core/pull/8834))
- Bump `@metamask/keyring-controller` from `^25.5.0` to `^26.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [0.3.1]

### Changed

- Bump `@metamask/keyring-controller` from `^25.3.0` to `^25.5.0` ([#8665](https://github.com/MetaMask/core/pull/8665), [#8722](https://github.com/MetaMask/core/pull/8722))
- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/polling-controller` from `^16.0.4` to `^16.0.5` ([#8755](https://github.com/MetaMask/core/pull/8755))
- Bump `@metamask/remote-feature-flag-controller` from `^4.2.0` to `^4.2.1` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [0.3.0]

### Changed

- Bump `@metamask/keyring-controller` from `^25.1.1` to `^25.3.0` ([#8363](https://github.com/MetaMask/core/pull/8363), [#8634](https://github.com/MetaMask/core/pull/8634))
- Bump `@metamask/profile-sync-controller` from `^28.0.1` to `^28.0.2` ([#8325](https://github.com/MetaMask/core/pull/8325))
- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.2.0` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373), [#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

### Fixed

- `ConfigRegistryApiService` now accepts chains with no `assets.listUrl` property ([#8624](https://github.com/MetaMask/core/pull/8624))

## [0.2.0]

### Changed

- **BREAKING:** `ConfigRegistryControllerMessenger` now requires `KeyringController:getState` action to be allowed ([#8230](https://github.com/MetaMask/core/pull/8230))
- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/keyring-controller` from `^25.1.0` to `^25.1.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/polling-controller` from `^16.0.3` to `^16.0.4` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/profile-sync-controller` from `^28.0.0` to `^28.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/remote-feature-flag-controller` from `^4.1.0` to `^4.2.0` ([#8317](https://github.com/MetaMask/core/pull/8317))

## [0.1.1]

### Changed

- Bump `@metamask/profile-sync-controller` from `^27.1.0` to `^28.0.0` ([#8162](https://github.com/MetaMask/core/pull/8162))

## [0.1.0]

### Added

- Initial release ([#7668](https://github.com/MetaMask/core/pull/7668), [#7809](https://github.com/MetaMask/core/pull/7809))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.4.1...HEAD
[0.4.1]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.4.0...@metamask/config-registry-controller@0.4.1
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.3.2...@metamask/config-registry-controller@0.4.0
[0.3.2]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.3.1...@metamask/config-registry-controller@0.3.2
[0.3.1]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.3.0...@metamask/config-registry-controller@0.3.1
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.2.0...@metamask/config-registry-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.1.1...@metamask/config-registry-controller@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/config-registry-controller@0.1.0...@metamask/config-registry-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/config-registry-controller@0.1.0
