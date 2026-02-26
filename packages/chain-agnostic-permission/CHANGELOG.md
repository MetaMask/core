# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- feat: bump `accounts` deps + use new `AccountProvider.createAccounts` ([#7857](https://github.com/MetaMask/core/pull/7857))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))

### Changed

- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.19.0` ([#7583](https://github.com/MetaMask/core/pull/7583), [#7995](https://github.com/MetaMask/core/pull/7995))

## [1.4.0]

### Added

- Add `Bip122AccountChangedNotifications` property in `KnownSessionProperties` enum ([#7537](https://github.com/MetaMask/core/pull/7537))

### Changed

- Remove `@metamask/network-controller` dependency ([#7561](https://github.com/MetaMask/core/pull/7561))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/network-controller` from `^27.0.0` to `^27.1.0` ([#7534](https://github.com/MetaMask/core/pull/7534))
- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))
- Bump `@metamask/permission-controller` from `^12.1.1` to `^12.2.0` ([#7559](https://github.com/MetaMask/core/pull/7559))

## [1.3.0]

### Added

- Add `TronAccountChangedNotifications` property in `KnownSessionProperties` enum ([#7304](https://github.com/MetaMask/core/pull/7304))

### Changed

- Bump `@metamask/network-controller` from `^26.0.0` to `^27.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202), [#7258](https://github.com/MetaMask/core/pull/7258))
- Bump `@metamask/controller-utils` from `^11.15.0` to `^11.16.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/permission-controller` from `^12.1.0` to `^12.1.1` ([#6988](https://github.com/MetaMask/core/pull/6988), [#7202](https://github.com/MetaMask/core/pull/7202))

## [1.2.2]

### Changed

- Bump `@metamask/network-controller` from `^24.3.1` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/permission-controller` from `^11.1.1` to `^12.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [1.2.1]

### Changed

- Bump `@metamask/network-controller` from `^24.2.1` to `^24.3.1` ([#6845](https://github.com/MetaMask/core/pull/6845), [#6883](https://github.com/MetaMask/core/pull/6883), [#6940](https://github.com/MetaMask/core/pull/6940))
- Bump `@metamask/permission-controller` from `^11.1.0` to `^11.1.1` ([#6940](https://github.com/MetaMask/core/pull/6940))

## [1.2.0]

### Changed

- Bump `@metamask/utils` from `^11.4.2` to `^11.8.1` ([#6588](https://github.com/MetaMask/core/pull/6588), [#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/controller-utils` from `^11.12.0` to `^11.14.1` ([#6620](https://github.com/MetaMask/core/pull/6620), [#6629](https://github.com/MetaMask/core/pull/6629), [#6807](https://github.com/MetaMask/core/pull/6807))
- Add return type annotation to `getCaip25PermissionFromLegacyPermissions` to make its return output assignable to `RequestedPermissions` ([#6382](https://github.com/MetaMask/core/pull/6382))
- Bump `@metamask/network-controller` from `^24.1.0` to `^24.2.1` ([#6678](https://github.com/MetaMask/core/pull/6678), [#6807](https://github.com/MetaMask/core/pull/6807))
- Bump `@metamask/permission-controller` from `^11.0.6` to `^11.1.0` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [1.1.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.11.0` to `^11.12.0` ([#6303](https://github.com/MetaMask/core/pull/6303))
- Bump `@metamask/network-controller` from `^24.0.1` to `^24.1.0` ([#6303](https://github.com/MetaMask/core/pull/6303))
- Bump accounts related packages ([#6309](https://github.com/MetaMask/core/pull/6309))
  - Bump `@metamask/keyring-internal-api` from `^8.0.0` to `^8.1.0`

## [1.1.0]

### Added

- Added `getCaip25PermissionFromLegacyPermissions` and `requestPermittedChainsPermissionIncremental` misc functions. ([#6225](https://github.com/MetaMask/core/pull/6225))

### Changed

- Bump `@metamask/controller-utils` from `^11.10.0` to `^11.11.0` ([#6069](https://github.com/MetaMask/core/pull/6069))
- Bump `@metamask/network-controller` from `^24.0.0` to `^24.0.1` ([#6148](https://github.com/MetaMask/core/pull/6148))
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

## [1.0.0]

### Changed

- This package is now considered stable ([#6013](https://github.com/MetaMask/core/pull/6013))

## [0.8.0]

### Changed

- `isInternalAccountInPermittedAccountIds` now returns `false` when passed an `InternalAccount` in which `scopes` is `undefined` ([#6000](https://github.com/MetaMask/core/pull/6000))
- Bump `@metamask/network-controller` to `^24.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [0.7.1]

### Changed

- Bump `@metamask/keyring-internal-api` to `^6.2.0` ([#5871](https://github.com/MetaMask/core/pull/5871))
- Bump `@metamask/controller-utils` to `^11.10.0` ([#5935](https://github.com/MetaMask/core/pull/5935))
- Bump `@metamask/network-controller` to `^23.6.0` ([#5935](https://github.com/MetaMask/core/pull/5935),[#5882](https://github.com/MetaMask/core/pull/5882))
- Change `caip25CaveatBuilder` to list unsupported scopes in the unsupported scopes error ([#5806](https://github.com/MetaMask/core/pull/5806))

### Fixed

- Fix `isInternalAccountInPermittedAccountIds` and `isCaipAccountIdInPermittedAccountIds` to correctly handle comparison against `permittedAccounts` values of the `wallet:<namespace>:<address>` format ([#5980](https://github.com/MetaMask/core/pull/5980))

## [0.7.0]

### Changed

- Bump `@metamask/api-specs` to `^0.14.0` ([#5817](https://github.com/MetaMask/core/pull/5817))
- Bump `@metamask/network-controller` to `^23.5.0` ([#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765), [#5812](https://github.com/MetaMask/core/pull/5812))

## [0.6.0]

### Changed

- Fix `getAllNamespacesFromCaip25CaveatValue` to return the reference instead of full scope when passed in values are `wallet` namespaced ([#5759](https://github.com/MetaMask/core/pull/5759))
- Bump `@metamask/network-controller` to `^23.3.0` ([#5789](https://github.com/MetaMask/core/pull/5789))

## [0.5.0]

### Added

- Added `getCaipAccountIdsFromCaip25CaveatValue`, `isInternalAccountInPermittedAccountIds`, and `isCaipAccountIdInPermittedAccountIds` account id functions. ([#5609](https://github.com/MetaMask/core/pull/5609))
- Added `getAllScopesFromCaip25CaveatValue`, `getAllWalletNamespacesFromCaip25CaveatValue`, `getAllScopesFromPermission`, `getAllScopesFromCaip25CaveatValue`, and `isNamespaceInScopesObject`
  scope functions. ([#5609](https://github.com/MetaMask/core/pull/5609))
- Added `getCaip25CaveatFromPermission` misc functions. ([#5609](https://github.com/MetaMask/core/pull/5609))

### Changed

- **BREAKING:** Renamed `setPermittedAccounts` to `setNonSCACaipAccountIdsInCaip25CaveatValue`. ([#5609](https://github.com/MetaMask/core/pull/5609))
- **BREAKING:** Renamed `setPermittedChainIds` to `setChainIdinCaip25CaveatValue`. ([#5609](https://github.com/MetaMask/core/pull/5609))
- **BREAKING:** Renamed `addPermittedChainId` to `addCaipChainIdInCaip25CaveatValue`. ([#5609](https://github.com/MetaMask/core/pull/5609))
- Bump `@metamask/controller-utils` to `^11.7.0` ([#5583](https://github.com/MetaMask/core/pull/5583))
- Bump `@metamask/network-controller` to `^23.2.0` ([#5583](https://github.com/MetaMask/core/pull/5583))

## [0.4.0]

### Added

- Add and Export `isKnownSessionPropertyValue` validation utility function ([#5647](https://github.com/MetaMask/core/pull/5647))
- Add and Export `getCaipAccountIdsFromScopesObjects` filtering utility function ([#5647](https://github.com/MetaMask/core/pull/5647))
- Add and Export `getAllScopesFromScopesObjects` filtering utility function ([#5647](https://github.com/MetaMask/core/pull/5647))
- Add and Export `getSupportedScopeObjects` filtering utility function ([#5647](https://github.com/MetaMask/core/pull/5647))

## [0.3.0]

### Added

- Export `KnownSessionProperties` enum ([#5522](https://github.com/MetaMask/core/pull/5522))
- Add more chain agnostic utility functions for interfacing w/ caip25 permission ([#5536](https://github.com/MetaMask/core/pull/5536))
  - New `setPermittedAccounts` function that allows setting accounts for any CAIP namespace, not just EVM scopes.
  - New `addPermittedChainId` and `setPermittedChainIds` functions for managing permitted chains across any CAIP namespace.
  - New `generateCaip25Caveat` function to generate a valid `endowment:caip25` permission caveat from given accounts and chains of any CAIP namespace.
  - New `isWalletScope` utility function to detect wallet-related scopes.

### Changed

- **BREAKING:** An error is now thrown in the caveat validator when a `caip25:endowment` permission caveat has no scopes in either `requiredScopes` or `optionalScopes` ([#5548](https://github.com/MetaMask/core/pull/5548))

## [0.2.0]

### Added

- Add validation for session properties in CAIP-25 caveat ([#5491](https://github.com/MetaMask/core/pull/5491))
- Add `KnownSessionProperties` enum with initial `SolanaAccountChangedNotifications` property ([#5491](https://github.com/MetaMask/core/pull/5491))
- Add `isSupportedSessionProperty` function to validate session properties ([#5491](https://github.com/MetaMask/core/pull/5491))
- Add `getPermittedAccountsForScopes` helper function to get permitted accounts for specific scopes ([#5491](https://github.com/MetaMask/core/pull/5491))
- Update merger function to properly merge session properties ([#5491](https://github.com/MetaMask/core/pull/5491))

### Changed

- **BREAKING:** Updated `Caip25CaveatValue` type to make `sessionProperties` a required field instead of optional ([#5491](https://github.com/MetaMask/core/pull/5491))
- Bump `@metamask/network-controller` to `^23.1.0` ([#5507](https://github.com/MetaMask/core/pull/5507), [#5518](https://github.com/MetaMask/core/pull/5518))

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.4.0...HEAD
[1.4.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.3.0...@metamask/chain-agnostic-permission@1.4.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.2.2...@metamask/chain-agnostic-permission@1.3.0
[1.2.2]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.2.1...@metamask/chain-agnostic-permission@1.2.2
[1.2.1]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.2.0...@metamask/chain-agnostic-permission@1.2.1
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.1.1...@metamask/chain-agnostic-permission@1.2.0
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.1.0...@metamask/chain-agnostic-permission@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@1.0.0...@metamask/chain-agnostic-permission@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.8.0...@metamask/chain-agnostic-permission@1.0.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.7.1...@metamask/chain-agnostic-permission@0.8.0
[0.7.1]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.7.0...@metamask/chain-agnostic-permission@0.7.1
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.6.0...@metamask/chain-agnostic-permission@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.5.0...@metamask/chain-agnostic-permission@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.4.0...@metamask/chain-agnostic-permission@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.3.0...@metamask/chain-agnostic-permission@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.2.0...@metamask/chain-agnostic-permission@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.1.0...@metamask/chain-agnostic-permission@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/chain-agnostic-permission@0.1.0
