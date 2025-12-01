# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `submitDirectRevocation` method for already-disabled delegations that don't require an on-chain transaction ([#7244](https://github.com/MetaMask/core/pull/7244))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.6.0...HEAD
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.5.0...@metamask/gator-permissions-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.4.0...@metamask/gator-permissions-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.3.0...@metamask/gator-permissions-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.2...@metamask/gator-permissions-controller@0.3.0
[0.2.2]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.1...@metamask/gator-permissions-controller@0.2.2
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.2.0...@metamask/gator-permissions-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/gator-permissions-controller@0.1.0...@metamask/gator-permissions-controller@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/gator-permissions-controller@0.1.0
