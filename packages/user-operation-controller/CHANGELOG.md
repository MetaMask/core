# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [14.0.2]

### Uncategorized

- Release 193.0.0 ([#4643](https://github.com/MetaMask/core/pull/4643))
- Release 191.0.0 ([#4639](https://github.com/MetaMask/core/pull/4639))
- Release 190.0.0 ([#4631](https://github.com/MetaMask/core/pull/4631))
- Release 188.0.0 ([#4625](https://github.com/MetaMask/core/pull/4625))
- Release 185.0.0 ([#4618](https://github.com/MetaMask/core/pull/4618))
- Release 183.0.0 ([#4601](https://github.com/MetaMask/core/pull/4601))
- Release/181.0.0 ([#4562](https://github.com/MetaMask/core/pull/4562))

### Changed

- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

## [14.0.1]

### Changed

- Remove `@metamask/approval-controller`, `@metamask/gas-fee-controller`, `@metamask/keyring-controller`, `@metamask/network-controller`, and `@metamask/transaction-controller` dependencies [#4556](https://github.com/MetaMask/core/pull/4556)
  - These were listed under `peerDependencies` already, so they were redundant as dependencies.
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.0` to `^6.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/controller-utils` from `^11.0.0` to `^11.0.2` ([#4517](https://github.com/MetaMask/core/pull/4517), [#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/polling-controller` from `^9.0.0` to `^9.0.1` ([#4548](https://github.com/MetaMask/core/pull/4548))
- Bump `@metamask/rpc-errors` from `^6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` from `^8.3.0` to `^9.1.0` ([#4516](https://github.com/MetaMask/core/pull/4516), [#4529](https://github.com/MetaMask/core/pull/4529))

### Fixed

- Replace `superstruct` with ESM-compatible `@metamask/superstruct` `^3.1.0` ([#3645](https://github.com/MetaMask/core/pull/3645))
  - This fixes the issue of this package being unusable by any TypeScript project that uses `Node16` or `NodeNext` as its `moduleResolution` option.

## [14.0.0]

### Changed

- **BREAKING:** Bump peerDependency `@metamask/network-controller` to `^20.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- **BREAKING:** Bump peerDependency `@metamask/gas-fee-controller` to `^19.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- **BREAKING:** Bump peerDependency `@metamask/transaction-controller` to `^35.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))
- Bump `@metamask/polling-controller` to `^9.0.0` ([#4508](https://github.com/MetaMask/core/pull/4508))

## [13.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/gas-fee-controller` to `^18.0.0` ([#4498](https://github.com/MetaMask/core/pull/4498))
- **BREAKING:** Bump dependency and peer dependency `@metamask/transaction-controller` to `^34.0.0` ([#4498](https://github.com/MetaMask/core/pull/4498))

## [12.0.1]

### Changed

- Bump `@metamask/transaction-controller` to `^33.0.1` ([#4460](https://github.com/MetaMask/core/pull/4460))

## [12.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^7.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/gas-fee-controller` to `^17.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/keyring-controller` to `^17.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^19.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- **BREAKING:** Bump dependency and peer dependency `@metamask/transaction-controller` to `^32.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/base-controller` to `^6.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/controller-utils` to `^11.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))
- Bump `@metamask/polling-controller` to `^8.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [11.0.0]

### Added

- Add support for "swap+send" transactions ([#4298](https://github.com/MetaMask/core/pull/4298))
  - Add optional properties `destinationTokenAmount`, `sourceTokenAddress`, `sourceTokenAmount`, `sourceTokenDecimals`, and `swapAndSendRecipient` to `TransactionMeta`
  - Add `swapAndSend` as a new entry in `TransactionType` enum
  - When persisting this type of transaction, copy source tokens, destination tokens, and recipient from swap data, and emit `TransactionController:newSwapAndSend` controller event

### Changed

- **BREAKING:** Bump dependency and peer dependency `@metamask/approval-controller` to `^6.0.2` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/gas-fee-controller` to `^16.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/keyring-controller` to `^16.1.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/network-controller` to `^18.1.3` ([#4342](https://github.com/MetaMask/core/pull/4342))
- **BREAKING:** Bump dependency and peer dependency `@metamask/transaction-controller` to `^31.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `@metamask/controller-utils` to `^10.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))
- Bump `@metamask/polling-controller` to `^7.0.0` ([#4342](https://github.com/MetaMask/core/pull/4342))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@14.0.2...HEAD
[14.0.2]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@14.0.1...@metamask/user-operation-controller@14.0.2
[14.0.1]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@14.0.0...@metamask/user-operation-controller@14.0.1
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@13.0.0...@metamask/user-operation-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@12.0.1...@metamask/user-operation-controller@13.0.0
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@12.0.0...@metamask/user-operation-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@11.0.0...@metamask/user-operation-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/user-operation-controller@10.0.0...@metamask/user-operation-controller@11.0.0
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
