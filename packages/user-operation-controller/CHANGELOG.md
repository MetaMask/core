# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` dependency and peer dependency to `^23.0.0` ([#3925](https://github.com/MetaMask/core/pull/3925))

## [3.0.0]

### Changed

- **BREAKING**: Add required `from` property to `PrepareUserOperationRequest` ([#3844](https://github.com/MetaMask/core/pull/3844))
- **BREAKING**: Add required `from` property to `AddUserOperationRequest` ([#3844](https://github.com/MetaMask/core/pull/3844))
- **BREAKING**: Make `smartContractAccount` optional in `AddUserOperationOptions` ([#3844](https://github.com/MetaMask/core/pull/3844))
  - Use current account snap by default if not provided ([#3844](https://github.com/MetaMask/core/pull/3844))
- Delete user operation if rejected during approval ([#3844](https://github.com/MetaMask/core/pull/3844))
- Set `userFeeLevel` to `custom` in transaction event if using a paymaster ([#3844](https://github.com/MetaMask/core/pull/3844))
- Validate arguments when calling `addUserOperationFromTransaction` ([#3844](https://github.com/MetaMask/core/pull/3844))

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` peer dependency to `^5.1.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/gas-fee-controller` peer dependency to `^13.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^17.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^21.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/message-manager` to `^7.3.8` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/polling-controller` to `^5.0.0` ([#3821](https://github.com/MetaMask/core/pull/3821))

### Removed

- Remove `@metamask/polling-controller` peer dependency ([#3823](https://github.com/MetaMask/core/pull/3823))
  - This was mistakenly added as a peer dependency in v1. Now it's a regular dependency.

## [1.0.0]

### Added

- Initial Release ([#3749](https://github.com/MetaMask/core/pull/3749))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@3.0.0...@metamask/user-operation-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@2.0.0...@metamask/user-operation-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@1.0.0...@metamask/user-operation-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/user-operation-controller@1.0.0
