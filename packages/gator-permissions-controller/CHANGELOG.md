# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/transaction-controller` from `^62.17.0` to `^62.19.0` ([#7996](https://github.com/MetaMask/core/pull/7996), [#8005](https://github.com/MetaMask/core/pull/8005), [#8031](https://github.com/MetaMask/core/pull/8031))

## [2.0.0]

### Changed

- **BREAKING:** Refactor `GatorPermissionsController`: simplified config, permission storage, and public API ([#7847](https://github.com/MetaMask/core/pull/7847))
  - Constructor now requires `config`, internal configuration is removed from controller state
  - New `initialize()` function performs a syncronisation process if required when the controller is first initialized
  - Replaces `gatorPermissionsMapSerialized` with `grantedPermissions` property in internal state, replaces related types, and utility functions
  - `fetchAndUpdateGatorPermissions()` no longer accepts parameters and resolves to `void`
  - `getPendingRevocations` / `pendingRevocations` getter replaced by `isPendingRevocation(permissionContext)`; list on `state.pendingRevocations`
- Bump `@metamask/transaction-controller` from `^62.11.0` to `^62.17.0` ([#7775](https://github.com/MetaMask/core/pull/7775), [#7802](https://github.com/MetaMask/core/pull/7802), [#7832](https://github.com/MetaMask/core/pull/7832), [#7854](https://github.com/MetaMask/core/pull/7854), [#7872](https://github.com/MetaMask/core/pull/7872)), ([#7897](https://github.com/MetaMask/core/pull/7897))

## [1.1.2]

### Fixed

- Bump `@metamask/transaction-controller` from `^62.10.0` to `^62.11.0` to resolve mismatching `WebSocketState` enum export in `@metamask/core-backend` transient dependency ([#7760](https://github.com/MetaMask/core/pull/7760))

## [1.1.1]

### Changed

- Bump `@metamask/transaction-controller` from `^62.9.2` to `^62.10.0` ([#7737](https://github.com/MetaMask/core/pull/7737))

### Fixed

- Correctly validate `erc20-token-revocation` terms when decoding permission. ([#7729](https://github.com/MetaMask/core/pull/7729))

## [1.1.0]

### Changed

- Calls to `permissionsProvider_submitRevocation` now include the hash of the transaction that revoked the permission if available. ([#7503](https://github.com/MetaMask/core/pull/7503))
- Bump `@metamask/transaction-controller` from `^62.9.1` to `^62.9.2` ([#7642](https://github.com/MetaMask/core/pull/7642))

### Fixed

- Ensure revocation transaction is successful before marking stored permission as revoked ([#7503](https://github.com/MetaMask/core/pull/7503))

## [1.0.0]

### Changed

- Bump `@metamask/snaps-controllers` from `^14.0.1` to `^17.2.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Bump `@metamask/snaps-sdk` from `^9.0.0` to `^10.3.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Bump `@metamask/snaps-utils` from `^11.0.0` to `^11.7.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Bump `@metamask/transaction-controller` from `^62.5.0` to `^62.9.1` ([#7430](https://github.com/MetaMask/core/pull/7430), [#7494](https://github.com/MetaMask/core/pull/7494), [#7596](https://github.com/MetaMask/core/pull/7596), [#7602](https://github.com/MetaMask/core/pull/7602), [#7604](https://github.com/MetaMask/core/pull/7604))
- **BREAKING:** Gator Permissions Controller and Gator Permission Decoder core types have been updated to comply with 7715 spec revisions ([#7613](https://github.com/MetaMask/core/pull/7613))
  - Bump `@metamask/7715-permission-type` from `^0.4.0` to `^0.5.0`

## [0.8.0]

### Added

- Export `DELEGATION_FRAMEWORK_VERSION` constant to indicate the supported Delegation Framework version ([#7195](https://github.com/MetaMask/core/pull/7195))

### Changed

- **BREAKING:** Permission decoding now rejects `TimestampEnforcer` caveats with zero `timestampBeforeThreshold` values ([#7195](https://github.com/MetaMask/core/pull/7195))
- `PermissionResponseSanitized` now includes `rules` property for stronger typing support ([#7195](https://github.com/MetaMask/core/pull/7195))
- Permission decoding now resolves `erc20-token-revocation` permission type ([#7299](https://github.com/MetaMask/core/pull/7299))
- Differentiate `erc20-token-revocation` permissions from `other` in controller state ([#7318](https://github.com/MetaMask/core/pull/7318))
- Bump `@metamask/transaction-controller` from `^62.3.1` to `^62.5.0` ([#7289](https://github.com/MetaMask/core/pull/7289), [#7325](https://github.com/MetaMask/core/pull/7325))

## [0.7.0]

### Added

- Refresh gator permissions map after revocation state change ([#7235](https://github.com/MetaMask/core/pull/7235))
- New `submitDirectRevocation` method for already-disabled delegations that don't require an on-chain transaction ([#7244](https://github.com/MetaMask/core/pull/7244))

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7220](https://github.com/MetaMask/core/pull/7220), [#7236](https://github.com/MetaMask/core/pull/7236), [#7257](https://github.com/MetaMask/core/pull/7257))
  - The dependencies moved are:
    - `@metamask/snaps-controllers` (^14.0.1)
    - `@metamask/transaction-controller` (^62.3.1)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

## [0.6.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` from `^61.1.0` to `^62.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [0.5.0]

### Fixed

- Does not add a pending revocation if user cancels the transaction ([#7157](https://github.com/MetaMask/core/pull/7157))
- **BREAKING** The GatorPermissionsController messenger must allow `TransactionController:transactionApproved` and `TransactionController:transactionRejected` events ([#7157](https://github.com/MetaMask/core/pull/7157))

## [0.4.0]

### Added

- **BREAKING:** Expose list of pending revocations in state ([#7055](https://github.com/MetaMask/core/pull/7055))
  - Add `pendingRevocations` property to state
  - Add `pendingRevocations` getter to controller, which accesses the same property in state
- **BREAKING:** The GatorPermissionsController messenger must allow `TransactionController:transactionConfirmed`, `TransactionController:transactionFailed`, and `TransactionController:transactionDropped` events ([#6713](https://github.com/MetaMask/core/pull/6713))
- Add `submitRevocation` and `addPendingRevocation` methods to GatorPermissionsController ([#6713](https://github.com/MetaMask/core/pull/6713))
  - These are also available as actions (`GatorPermissionsController:submitRevocation` and `GatorPermissionsController:addPendingRevocation`)

### Changed

- **BREAKING:** Add `@metamask/transaction-controller` as peer dependency ([#7058](https://github.com/MetaMask/core/pull/7058))

## [0.3.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6461](https://github.com/MetaMask/core/pull/6461))
  - Previously, `GatorPermissionsController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Metadata property `anonymous` renamed to `includeInDebugSnapshot` ([#6461](https://github.com/MetaMask/core/pull/6461))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [0.2.2]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [0.2.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [0.2.0]

### Added

- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6552](https://github.com/MetaMask/core/pull/6552))
- Add method to decode permission from `signTypedData` ([#6556](https://github.com/MetaMask/core/pull/6556))

### Changed

- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))
- Function `decodePermissionFromPermissionContextForOrigin` is now synchronous ([#6656](https://github.com/MetaMask/core/pull/6656))

### Fixed

- Fix incorrect default Gator Permissions SnapId ([#6546](https://github.com/MetaMask/core/pull/6546))

## [0.1.0]

### Added

- Initial release ([#6033](https://github.com/MetaMask/core/pull/6033))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@1.1.2...@metamask/gator-permissions-controller@2.0.0
[1.1.2]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@1.1.1...@metamask/gator-permissions-controller@1.1.2
[1.1.1]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@1.1.0...@metamask/gator-permissions-controller@1.1.1
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@1.0.0...@metamask/gator-permissions-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.8.0...@metamask/gator-permissions-controller@1.0.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.7.0...@metamask/gator-permissions-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.6.0...@metamask/gator-permissions-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.5.0...@metamask/gator-permissions-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.4.0...@metamask/gator-permissions-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.3.0...@metamask/gator-permissions-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.2...@metamask/gator-permissions-controller@0.3.0
[0.2.2]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.1...@metamask/gator-permissions-controller@0.2.2
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.0...@metamask/gator-permissions-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.1.0...@metamask/gator-permissions-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/gator-permissions-controller@0.1.0
