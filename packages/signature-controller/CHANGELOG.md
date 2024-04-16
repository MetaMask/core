# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [14.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [14.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/approval-controller` to `^6.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump dependency and peer dependency on `@metamask/keyring-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- **BREAKING:** Bump dependency and peer dependency on `@metamask/logging-controller` to `^3.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/controller-utils` to `^9.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
- Bump `@metamask/message-manager` to `^8.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [13.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` dependency and peer dependency to `^13.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/approval-controller` to `^5.1.3` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/controller-utils` to `^8.0.4` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/logging-controller` to `^2.0.3` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/message-manager` to `^7.3.9` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3954](https://github.com/MetaMask/core/pull/3954))
- Remove dependency `ethereumjs-util` ([#3943](https://github.com/MetaMask/core/pull/3943))

## [12.0.0]

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` peer dependency to `^5.1.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^12.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- **BREAKING:** Bump `@metamask/logging-controller` peer dependency to `^2.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/controller-utils` to `^8.0.2` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/message-manager` to `^7.3.8` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [11.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` to ^12.1.0
- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))

### Fixed

- Fix `stateChange` subscriptions with selectors ([#3702](https://github.com/MetaMask/core/pull/3702))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` to ^12.0.0

## [9.0.0]

### Changed

- **BREAKING:** Bump `@metamask/approval-controller` dependency and peer dependency from `^5.0.0` to `^5.1.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3680](https://github.com/MetaMask/core/pull/3680))
- **BREAKING:** Bump `@metamask/keyring-controller` dependency and peer dependency from `^10.0.0` to `^11.0.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Bump `@metamask/logging-controller` dependency and peer dependency from `^2.0.0` to `^2.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))
- Bump `@metamask/message-manager` to `^7.3.7` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/approval-controller` to ^5.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/keyring-controller` to ^10.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/logging-controller` to ^2.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/message-manager` to ^7.3.6 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [7.0.0]

### Changed

- **BREAKING**: Add `@metamask/keyring-controller` as a dependency and peer dependency
  - This was relied upon by past versions, but this was not reflected in the package manifest until now
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))

## [6.1.3]

### Changed

- Move from `eth-rpc-errors` ^4.0.2 to `@metamask/rpc-errors` ^6.1.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.1
- Bump dependency and peer dependency on `@metamask/logging-controller` to ^1.0.4

## [6.1.2]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.0
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to 5.0.2
- Bump dependency on `@metamask/message-manager` to ^7.3.5

## [6.1.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

## [6.1.0]

### Changed

- Add `LoggingController` logs on signature operation stages ([#1692](https://github.com/MetaMask/core/pull/1692))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0
- Bump dependency on `@metamask/keyring-controller` to ^8.0.0
- Bump dependency on `@metamask/logging-controller` to ^1.0.2
- Bump dependency on `@metamask/message-manager` to ^7.3.3

## [6.0.0]

### Changed

- **BREAKING**: Removed `keyringController` property from constructor option ([#1593](https://github.com/MetaMask/core/pull/1593))

## [5.3.1]

### Changed

- Bump dependency and peer dependency on `@metamask/approval-controller` to ^3.5.1
- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2
- Bump dependency on `@metamask/message-manager` to ^7.3.1

## [5.3.0]

### Added

- Add new methods `setDeferredSignSuccess` and `setDeferredSignError` ([#1506](https://github.com/MetaMask/core/pull/1506))

### Changed

- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [5.2.0]

### Added

- Add `messages` getter that returns all messages ([#1469](https://github.com/MetaMask/core/pull/1469))
- Add `setMessageMetadata` method for customizing the metadata for an individual message ([#1469](https://github.com/MetaMask/core/pull/1469))

## [5.1.0]

### Changed

- Report approval success using result callbacks ([#1458](https://github.com/MetaMask/core/pull/1458))

## [5.0.0]

### Added

- **BREAKING** Add sign version to approval message in Signature Controller ([#1440](https://github.com/MetaMask/core/pull/1440))
  - Method `newUnsignedTypedMessage` on the SignatureController now requires a fourth argument: `signingOpts`
  - Method `signMessage` on the SignatureController no longer expects a `version` as a second argument. The second argument is now `signingOpts` which was previously the third argument.

## [4.0.1]

### Fixed

- Remove optional parameter from newUnsignedTypedMessage function ([#1436](https://github.com/MetaMask/core/pull/1436))

## [4.0.0]

### Changed

- **BREAKING:** `newUnsignedXMessage` middlewares now creates and awaits approvals itself. ([#1377](https://github.com/MetaMask/core/pull/1377))

### Removed

- **BREAKING:** Removed `cancelXMessage` and `signXMessage` from public API. ([#1377](https://github.com/MetaMask/core/pull/1377))

## [3.0.0]

### Added

- Add support for deferred signing ([#1364](https://github.com/MetaMask/core/pull/1364))
  - If the parameter `deferSetAsSigned` is set, the message won't be set as signed when the keyring is asked to sign it
- Emit the event `${methodName}:signed` when the keying is asked to sign a message ([#1364](https://github.com/MetaMask/core/pull/1364))
- Add methods `setTypedMessageInProgress` and `setPersonalMessageInProgress` to set a message status to `inProgress` ([#1339](https://github.com/MetaMask/core/pull/1339))

### Changed

- **BREAKING:** The constructor option `getCurrentChainId` now expects a `Hex` return value rather than `string` ([#1367](https://github.com/MetaMask/core/pull/1367))
- **BREAKING:** Update `@metamask/approval-controller` dependency and add it as a peer dependency ([#1393](https://github.com/MetaMask/core/pull/1393))
- Add `@metamask/utils` dependency ([#1367](https://github.com/MetaMask/core/pull/1367))

## [2.0.0]

### Added

- **BREAKING:** Add `getCurrentChainId` argument to constructor ([#1350](https://github.com/MetaMask/core/pull/1350))

## [1.0.0]

### Added

- Initial release ([#1214](https://github.com/MetaMask/core/pull/1214))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@14.0.1...HEAD
[14.0.1]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@14.0.0...@metamask/signature-controller@14.0.1
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@13.0.0...@metamask/signature-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@12.0.0...@metamask/signature-controller@13.0.0
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@11.0.0...@metamask/signature-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@10.0.0...@metamask/signature-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@9.0.0...@metamask/signature-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@8.0.0...@metamask/signature-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@7.0.0...@metamask/signature-controller@8.0.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@6.1.3...@metamask/signature-controller@7.0.0
[6.1.3]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@6.1.2...@metamask/signature-controller@6.1.3
[6.1.2]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@6.1.1...@metamask/signature-controller@6.1.2
[6.1.1]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@6.1.0...@metamask/signature-controller@6.1.1
[6.1.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@6.0.0...@metamask/signature-controller@6.1.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.3.1...@metamask/signature-controller@6.0.0
[5.3.1]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.3.0...@metamask/signature-controller@5.3.1
[5.3.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.2.0...@metamask/signature-controller@5.3.0
[5.2.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.1.0...@metamask/signature-controller@5.2.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@5.0.0...@metamask/signature-controller@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@4.0.1...@metamask/signature-controller@5.0.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@4.0.0...@metamask/signature-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@3.0.0...@metamask/signature-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@2.0.0...@metamask/signature-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/signature-controller@1.0.0...@metamask/signature-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/signature-controller@1.0.0
