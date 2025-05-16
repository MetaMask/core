# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/network-controller` to `^23.4.0` ([#5765](https://github.com/MetaMask/core/pull/5765))
- Bump `@metamask/controller-utils` to `^11.8.0` ([#5765](https://github.com/MetaMask/core/pull/5765))
- Change `caip25CaveatBuilder` to list unsupported scopes in the unsupported scopes error ([#5806](https://github.com/MetaMask/core/pull/5806))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.6.0...HEAD
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.5.0...@metamask/chain-agnostic-permission@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.4.0...@metamask/chain-agnostic-permission@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.3.0...@metamask/chain-agnostic-permission@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.2.0...@metamask/chain-agnostic-permission@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.1.0...@metamask/chain-agnostic-permission@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/chain-agnostic-permission@0.1.0
