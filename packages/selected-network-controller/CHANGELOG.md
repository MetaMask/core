# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [10.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [10.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/permission-controller` to `^9.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/json-rpc-engine` to `^8.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))

## [9.0.0]

### Added

- Listen to permissions changes and add/remove `domains` ([#3969](https://github.com/MetaMask/core/pull/3969))

### Changed

- **BREAKING** remove `perDomainNetwork` from state ([#3989](https://github.com/MetaMask/core/pull/3989))
- **BREAKING** Add dependency and peer dependency on `@metamask/permission-controller` ^8.0.1 ([#4000](https://github.com/MetaMask/core/pull/4000))

## [8.0.0]

### Changed

- **BREAKING:** `setNetworkClientIdForDomain` now throws an error if passed `metamask` for the domain param ([#3908](https://github.com/MetaMask/core/pull/3908)).
- **BREAKING:** `setNetworkClientIdForDomain` now fails and throws an error if the passed in `domain` is not currently permissioned in the `PermissionsController` ([#3908](https://github.com/MetaMask/core/pull/3908)).
- **BREAKING:** the `domains` state now no longer contains a `metamask` domain key. Consumers should instead use the `selectedNetworkClientId` from the `NetworkController` to get the selected network for the `metamask` domain ([#3908](https://github.com/MetaMask/core/pull/3908)).
- **BREAKING:** `getProviderAndBlockTracker` now throws an error if called with any domain while the `perDomainNetwork` flag is false. Consumers should instead use the `provider` and `blockTracker` from the `NetworkController` when the `perDomainNetwork` flag is false ([#3908](https://github.com/MetaMask/core/pull/3908)).
- **BREAKING:** `getProviderAndBlockTracker` now throws an error if called with a domain that does not have a networkClientId set ([#3908](https://github.com/MetaMask/core/pull/3908)).
- **BREAKING:** `getNetworkClientIdForDomain` now returns the `selectedNetworkClientId` for the globally selected network if the `perDomainNetwork` flag is false or if the domain is not in the `domains` state ([#3908](https://github.com/MetaMask/core/pull/3908)).

### Removed

- **BREAKING:** Remove logic in `selectedNetworkMiddleware` to set a default `networkClientId` for the requesting origin in the `SelectedNetworkController` when not already set. Now if `networkClientId` is not already set for the requesting origin, the middleware will not set a default `networkClientId` for that origin in the `SelectedNetworkController` but will continue to add the `selectedNetworkClientId` from the `NetworkController` to the `networkClientId` property on the request object ([#3908](https://github.com/MetaMask/core/pull/3908)).

### Fixed

- The `SelectedNetworkController` now listens for `networkConfiguration` removal events on the `NetworkController` and updates domains pointed at a removed `networkClientId` to the `selectedNetworkClientId` ([#3926](https://github.com/MetaMask/core/pull/3926)).

## [7.0.1]

### Changed

- Selected network controller should update all domains when perDomainNetwork feature flag is off ([#3834](https://github.com/MetaMask/core/pull/3834))

## [7.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/swappable-obj-proxy` to `^2.2.0` ([#3784](https://github.com/MetaMask/core/pull/3784))
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3760](https://github.com/MetaMask/core/pull/3760), [#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/json-rpc-engine` to `^7.3.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` dependency and peer dependency from `^17.0.0` to `^17.1.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/json-rpc-engine` to `^7.3.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [5.0.0]

### Added

- Add `SelectedNetworkMiddlewareJsonRpcRequest` type ([#1970](https://github.com/MetaMask/core/pull/1970)).
- Add `setPerDomainNetwork` method to reset proxies when flag toggled ([#3593](https://github.com/MetaMask/core/pull/3593)).
- Add `state` as a constructor argument ([#3585](https://github.com/MetaMask/core/pull/3585)).

### Changed

- **BREAKING:** Rename `SelectedNetworkControllerAction` to `SelectedNetworkControllerActions` and `SelectedNetworkControllerEvent` to `SelectedNetworkControllerEvents` for consistency with corresponding type exports from other controllers ([#1970](https://github.com/MetaMask/core/pull/1970)).
- **BREAKING:** `createSelectedNetworkMiddleware` return type is constrained to satisfy `JsonRpcMiddleware<JsonRpcParams, Json>`, and its `req` parameter is constrained to satisfy `SelectedNetworkMiddlewareJsonRpcRequest` ([#1970](https://github.com/MetaMask/core/pull/1970)).

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/network-controller` to ^17.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [3.1.2]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^16.0.0

## [3.1.1]

### Changed

- Bump `@metamask/json-rpc-engine` from `^7.1.0` to `^7.2.0` ([#1895](https://github.com/MetaMask/core/pull/1895))

## [3.1.0]

### Added

- Add `getProviderAndBlockTracker` method to get a proxy provider from `NetworkController` for a given origin/domain. ([#1806](https://github.com/MetaMask/core/pull/1806))

### Changed

- No longer update `selectedNetworkClientId` when the `NetworkController` provider changes. ([#1806](https://github.com/MetaMask/core/pull/1806))
- Bump dependency and peer dependency on `@metamask/network-controller` to ^15.1.0

## [3.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^14.0.0 ([#1747](https://github.com/MetaMask/core/pull/1747))
- **BREAKING:** Move from `json-rpc-engine` ^7.1.1 to `@metamask/json-rpc-engine` ^8.0.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to ^15.0.0
- Bump dependency on `@metamask/base-controller` to ^3.2.3 ([#1747](https://github.com/MetaMask/core/pull/1747))

### Fixed

- `setNetworkClientIdForDomain()` will now ignore the passed in domain value and set the `networkClientId` for the metamask domain instead when the `state.perDomainNetwork` flag is false (default) ([#1757](https://github.com/MetaMask/core/pull/1757))

## [2.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [2.0.0]

### Changed

- **BREAKING**: Bump peer dependency on `@metamask/network-controller` to ^13.0.0 ([#1633](https://github.com/MetaMask/core/pull/1633))

## [1.0.0]

### Added

- Initial Release ([#1643](https://github.com/MetaMask/core/pull/1643))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@10.0.1...HEAD
[10.0.1]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@10.0.0...@metamask/selected-network-controller@10.0.1
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@9.0.0...@metamask/selected-network-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@8.0.0...@metamask/selected-network-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@7.0.1...@metamask/selected-network-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@7.0.0...@metamask/selected-network-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@6.0.0...@metamask/selected-network-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@5.0.0...@metamask/selected-network-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@4.0.0...@metamask/selected-network-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@3.1.2...@metamask/selected-network-controller@4.0.0
[3.1.2]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@3.1.1...@metamask/selected-network-controller@3.1.2
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@3.1.0...@metamask/selected-network-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@3.0.0...@metamask/selected-network-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@2.0.1...@metamask/selected-network-controller@3.0.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@2.0.0...@metamask/selected-network-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@1.0.0...@metamask/selected-network-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/selected-network-controller@1.0.0
