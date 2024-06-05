# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [15.0.1]

### Fixed

- No longer add domains that have been granted permissions to `domains` state (nor create a selected network proxy for it) unless the `useRequestQueuePreference` flag is true ([#4368](https://github.com/MetaMask/core/pull/4368))

## [15.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/permission-controller` to `^10.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [14.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/permission-controller` to `^9.1.1` ([#4342](https://github.com/MetaMask/core/pull/4342))

## [13.0.0]

### Changed

- `getProviderAndBlockTracker` now returns the `NetworkController`'s globally selected network client proxy if the `domain` arg is either `metamask` or a snap (identified as starting with `npm:` or `local:`) ([#4259](https://github.com/MetaMask/core/pull/4259))
- **BREAKING:** Now when `setNetworkClientIdForDomain` is called with a snap's domain (identified as starting with `npm:` or `local:`), the `domain` will not be added to state and no proxy will be created for this domain in the `domainProxyMap` ([#4258](https://github.com/MetaMask/core/pull/4258))
  - In order to remove snaps that made it into `domains` state prior to this change, consumers will need to run a migration.
- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [12.0.1]

### Fixed

- When `getProviderAndBlockTracker` is called with a `domain` for which there is no cached `networkProxy` in the `domainProxyMap`, if the `useRequestQueue` preference is off and the `domain` does not have permissions the newly created `networkProxy` for this `domain` will be pointed at the `NetworkController`'s own proxy of the globally selected `networkClient`. ([#4187](https://github.com/MetaMask/core/pull/4187))

## [12.0.0]

### Added

- These changes keep the per domain proxies (stored in domainProxyMap) pointing to the correct network client instance when the "Select networks for each site" toggle is turned on and off.
  - **BREAKING:** A parameter `useRequestQueuePreference` which should point to the current preferences state for `useRequestQueue` is now required by the constructor ([#4130](https://github.com/MetaMask/core/pull/4130))
  - - **BREAKING:** An `onPreferencesStateChange` argument that should subscribe to `PreferencesController` state changes and call a callback with the updated state is now a required parameter in the constructor options object. ([#4130](https://github.com/MetaMask/core/pull/4130))

### Removed

- The `getUseRequestQueue` parameter is no longer expected by the constructor. ([#4130](https://github.com/MetaMask/core/pull/4130))

## [11.0.0]

### Added

- Now exports the `Domain` type ([#4104](https://github.com/MetaMask/core/pull/4104))

### Changed

- Previously the `SelectedNetworkController` only constructed proxies for domains that had permissions. Other domains have no associated proxy and the `getProviderAndBlockTracker` method would throw an error. This was problematic because we grab the network client for an origin a single time when constructing an RPC pipeline for that origin in the MetaMask extension. We don't re-create the RPC pipeline when permissions change. That means that the pipeline is setup with the wrong network client and cannot be updated. The following changes ensure seamlessly proxying calls during sessions where a dapp connects/disconnects and provides a path for clients to prune inactive proxies:
  - **BREAKING:** `SelectedNetworkController` now expects a `domainProxyMap` param - which is a Map of Domain to NetworkProxy - in its constructor ([#4104](https://github.com/MetaMask/core/pull/4104))
    - This `domainProxyMap` is expected to automatically delete entries for domains that are no longer connected to the wallet. The `SelectedNetworkController` handles _adding_ entries, but it can't handle removal, as it doesn't know which connections are active.
    - You can pass in a plain `Map` here and it will work, but during longer sessions this might grow unbounded, resulting in a memory leak.
  - **BREAKING:** `SelectedNetworkController` now requires `NetworkController:getSelectedNetworkClient` as an allowed action ([#4063](https://github.com/MetaMask/core/pull/4063))
  - `getProviderAndBlockTracker` method no longer throws an error if the `useRequestQueue` flag is false ([#4063](https://github.com/MetaMask/core/pull/4063))
  - `getProviderAndBlockTracker` method no longer throws an error if there is no `networkClientId` set for the passed domain. Now it returns a proxy pointed at the globally selected network instead. ([#4063](https://github.com/MetaMask/core/pull/4063))
- Bump dependency `@metamask/network-controller` to `^18.1.0` ([#4121](https://github.com/MetaMask/core/pull/4121))

### Fixed

- Previously when a domain's permission was removed from `PermissionsController`, it's network client proxy would continue to point at the `networkClientId` it was last set to. Now it is set to follow the globally selected network ([#4063](https://github.com/MetaMask/core/pull/4063))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@15.0.1...HEAD
[15.0.1]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@15.0.0...@metamask/selected-network-controller@15.0.1
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@14.0.0...@metamask/selected-network-controller@15.0.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@13.0.0...@metamask/selected-network-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@12.0.1...@metamask/selected-network-controller@13.0.0
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@12.0.0...@metamask/selected-network-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@11.0.0...@metamask/selected-network-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/selected-network-controller@10.0.1...@metamask/selected-network-controller@11.0.0
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
