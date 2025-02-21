# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.2]

### Uncategorized

- fix: make sure wallet scope does not insert accounts ([#5374](https://github.com/MetaMask/core/pull/5374))
- feat: add `signEip7702Authorization` to `KeyringController` ([#5301](https://github.com/MetaMask/core/pull/5301))
- Fix invalid type import path in `@metamask/multichain` ([#5313](https://github.com/MetaMask/core/pull/5313))

## [2.1.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.4.5` to `^11.5.0` ([#5272](https://github.com/MetaMask/core/pull/5272))
- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

## [2.1.0]

### Added

- Add key Multichain API methods ([#4813](https://github.com/MetaMask/core/pull/4813))
  - Adds `getInternalScopesObject` and `getSessionScopes` helpers for transforming between `NormalizedScopesObject` and `InternalScopesObject`.
  - Adds handlers for `wallet_getSession`, `wallet_invokeMethod`, and `wallet_revokeSession` methods.
  - Adds `multichainMethodCallValidatorMiddleware` for validating Multichain API method params as defined in @metamask/api-specs.
  - Adds `MultichainMiddlewareManager` to multiplex a request to other middleware based on requested scope.
  - Adds `MultichainSubscriptionManager` to handle concurrent subscriptions across multiple scopes.
  - Adds `bucketScopes` which groups the scopes in a `NormalizedScopesObject` based on if the scopes are already supported, could be supported, or are not supportable.
  - Adds `getSupportedScopeObjects` helper for getting only the supported methods and notifications from each `NormalizedScopeObject` in a `NormalizedScopesObject`.

### Changed

- Bump `@metamask/controller-utils` from `^11.4.4` to `^11.4.5` ([#5012](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/permission-controller` from `^11.0.4` to `^11.0.5` ([#5012](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/utils` to `^11.0.1` and `@metamask/rpc-errors` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))

### Fixed

- Fixes `removeScope` mutator incorrectly returning malformed CAIP-25 caveat values ([#5183](https://github.com/MetaMask/core/pull/5183)).

## [2.0.0]

### Added

- Adds `caip25CaveatBuilder` helper that builds a specification for the CAIP-25 caveat that can be passed to the relevant `PermissionController` constructor param([#5064](https://github.com/MetaMask/core/pull/5064)).

### Changed

- **BREAKING:** The validator returned by `caip25EndowmentBuilder` now only verifies that there is single CAIP-25 caveat and nothing else([#5064](https://github.com/MetaMask/core/pull/5064)).

## [1.1.2]

### Changed

- Bump `@metamask/eth-json-rpc-filters` from `^7.0.0` to `^9.0.0` ([#5040](https://github.com/MetaMask/core/pull/5040))

## [1.1.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.4.3` to `^11.4.4` ([#5012](https://github.com/MetaMask/core/pull/5012))
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@metamask/api-specs`
  - `lodash`

## [1.1.0]

### Changed

- Revoke the CAIP-25 endowment if the only eip155 account or scope is removed ([#4978](https://github.com/MetaMask/core/pull/4978))

## [1.0.0]

### Added

- Initial release ([#4962](https://github.com/MetaMask/core/pull/4962))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain@2.1.2...HEAD
[2.1.2]: https://github.com/MetaMask/core/compare/@metamask/multichain@2.1.1...@metamask/multichain@2.1.2
[2.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain@2.1.0...@metamask/multichain@2.1.1
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain@2.0.0...@metamask/multichain@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.1.2...@metamask/multichain@2.0.0
[1.1.2]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.1.1...@metamask/multichain@1.1.2
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.1.0...@metamask/multichain@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain@1.0.0...@metamask/multichain@1.1.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain@1.0.0
