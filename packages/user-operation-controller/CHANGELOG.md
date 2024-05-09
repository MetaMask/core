# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/transaction-controller` peer dependency to `^29.0.0` ([#4272](https://github.com/MetaMask/core/pull/4272))

## [9.0.0]

### Changed

- **BREAKING** Bump `@metamask/keyring-controller` peer dependency to ^16.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))
- Bump `@metamask/transaction-controller` to `^28.1.1` ([#4229](https://github.com/MetaMask/core/pull/4229))
- Bump `@metamask/gas-fee-controller` to `^15.1.1` ([#4220](https://github.com/MetaMask/core/pull/4220), [#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/approval-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/polling-controller` to `^6.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))

## [8.0.1]

### Fixed

- Support number gas values in user operation receipts ([#4161](https://github.com/MetaMask/core/pull/4161))

## [8.0.0]

### Changed

- **BREAKING** Bump peer dependency on `@metamask/keyring-controller` to `^15.0.0` and Pass CAIP-2 scope to execution context ([#4090](https://github.com/MetaMask/core/pull/4090))
- Allow gas limits to be changed during #addPaymasterData ([#3942](https://github.com/MetaMask/core/pull/3942))

## [7.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/gas-fee-controller` to `^15.0.0` ([#4121](https://github.com/MetaMask/core/pull/4121))
- **BREAKING:** Bump peer dependency `@metamask/transaction-controller` to `^26.0.0` ([#4121](https://github.com/MetaMask/core/pull/4121))
- Bump dependency `@metamask/network-controller` to `^18.1.0` ([#4121](https://github.com/MetaMask/core/pull/4121))

## [6.0.2]

### Fixed

- Include gas fees in user operations when using a paymaster ([#4032](https://github.com/MetaMask/core/pull/4032))

## [6.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [6.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/approval-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/gas-fee-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/keyring-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/network-controller` to `^18.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/transaction-controller` to `^25.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump `@metamask/polling-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` dependency and peer dependency to `^13.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- **BREAKING:** Bump `@metamask/transaction-controller` dependency and peer dependency to `^24.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/approval-controller` to `^5.1.3` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/gas-fee-controller` to `^13.0.2` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/network-controller` to `^17.2.1` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3954](https://github.com/MetaMask/core/pull/3954))
- Bump `@metamask/polling-controller` to `^5.0.1` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Replace `ethereumjs-util` with `bn.js` ([#3943](https://github.com/MetaMask/core/pull/3943))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@10.0.0...HEAD
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@9.0.0...@metamask/user-operation-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@8.0.1...@metamask/user-operation-controller@9.0.0
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@8.0.0...@metamask/user-operation-controller@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@7.0.0...@metamask/user-operation-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@6.0.2...@metamask/user-operation-controller@7.0.0
[6.0.2]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@6.0.1...@metamask/user-operation-controller@6.0.2
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@6.0.0...@metamask/user-operation-controller@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@5.0.0...@metamask/user-operation-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@4.0.0...@metamask/user-operation-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@3.0.0...@metamask/user-operation-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@2.0.0...@metamask/user-operation-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@1.0.0...@metamask/user-operation-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/user-operation-controller@1.0.0
