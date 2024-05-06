# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [14.0.0]

### Changed

- **BREAKING** Bump `@metamask/keyring-controller` peer dependency to ^16.0.0 ([#4234](https://github.com/MetaMask/core/pull/4234))
- Bump `@metamask/keyring-api` to 6.0.0, `@metamask/eth-snap-keyring` to 4.0.0 and snap dependencies ([#4193](https://github.com/MetaMask/core/pull/4193))
- Bump `@metamask/base-controller` to `^5.0.2` ([#4232](https://github.com/MetaMask/core/pull/4232))

## [13.0.0]

### Changed

- Fix update setSelectedAccount to throw if the id is not found ([#4167](https://github.com/MetaMask/core/pull/4167))
- Fix normal account indexing naming with index gap ([#4089](https://github.com/MetaMask/core/pull/4089))
- **BREAKING** Bump peer dependency `@metamask/snaps-controllers` to `^6.0.3` and dependencies `@metamask/snaps-sdk` to `^3.1.1`, `@metamask/eth-snap-keyring` to `^3.0.0`([#4090](https://github.com/MetaMask/core/pull/4090))

## [12.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [12.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to `^5.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))
  - This version has a number of breaking changes. See the changelog for more.
- **BREAKING:** Bump peer dependency on `@metamask/keyring-controller` to `^14.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

### Removed

- **BREAKING:** Remove action and event types unrelated to `AccountsController` from `AccountsControllerActions` and `AccountsControllerEvents` ([#4031](https://github.com/MetaMask/core/pull/4031))

### Fixed

- **BREAKING:** Narrow allowed actions and event type for `AccountsController` messenger ([#4021](https://github.com/MetaMask/core/pull/4021), [#4031](https://github.com/MetaMask/core/pull/4031))
  - Narrow type parameter `AllowedAction` from `string` to `(KeyringControllerGetKeyringForAccountAction | KeyringControllerGetKeyringsByTypeAction | KeyringControllerGetAccountsAction)['type']`.
  - Narrow type parameter `AllowedEvent` from `string` to `(SnapStateChange | KeyringControllerStateChangeEvent)['type']`, removing other events from `SnapController` and `KeyringController`.

## [11.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^13.0.0` ([#4007](https://github.com/MetaMask/core/pull/4007))
- Replace `ethereumjs-util` with `@ethereumjs/util` and `ethereum-cryptography` ([#3943](https://github.com/MetaMask/core/pull/3943))

### Fixed

- Update `keyringTypeToName` to return the correct name for custody keyrings ([#3899](https://github.com/MetaMask/core/pull/3899))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^12.2.0` ([#3821](https://github.com/MetaMask/core/pull/3821))
- Bump `@metamask/base-controller` to `^4.1.1` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [9.0.0]

### Added

- Add methods to support ERC-4337 accounts ([#3602](https://github.com/MetaMask/core/pull/3602))
- Add getAccount action to AccountsController ([#1892](https://github.com/MetaMask/core/pull/1892))

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to ^12.1.0 ([#3747](https://github.com/MetaMask/core/pull/3747), [#3810](https://github.com/MetaMask/core/pull/3810))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency to ^4.0.0 ([#3747](https://github.com/MetaMask/core/pull/3747))
- Bump `@metamask/keyring-api` to ^3.0.0 ([#3747](https://github.com/MetaMask/core/pull/3747))
- Bump `@metamask/utils` to `^8.3.0`([#3769](https://github.com/MetaMask/core/pull/3769))

### Fixed

- Fix quick succession of submit password causing Accounts Controller state to be cleared ([#3802](https://github.com/MetaMask/core/pull/3802))

## [8.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` to ^12.0.0

## [7.0.1]

### Changed

- Bump snaps dependencies ([#3734](https://github.com/MetaMask/core/pull/3734))

## [7.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^10.0.0` to `^11.0.0` ([#3695](https://github.com/MetaMask/core/pull/3695))
- **BREAKING:** Add `@metamask/snaps-controllers` as a peer dependency ([#3607](https://github.com/MetaMask/core/pull/3607))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

## [6.0.0]

### Changed

- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- Bump `@metamask/keyring-controller` to ^10.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [5.0.0]

### Changed

- **BREAKING:** Bump dependency and peer dependency on `@metamask/keyring-controller` to ^9.0.0
- Bump `@metamask/snaps-utils` and `@metamask/snaps-controller` to 3.2.0 ([#1917](https://github.com/MetaMask/core/pull/1917), [#1944](https://github.com/MetaMask/core/pull/1944), [#1977](https://github.com/MetaMask/core/pull/1977))
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))
- Bump @metamask/keyring-api from 1.0.0 to 1.1.0 ([#1951](https://github.com/MetaMask/core/pull/1951))

## [4.0.0]

### Changed

- **BREAKING** Update the `onKeyringStateChange` and `onSnapStateChange` methods, and remove the `keyringApiEnabled` from the AccountsController ([#1839](https://github.com/MetaMask/core/pull/1839))
- Add getSelectedAccount and getAccountByAddress actions to AccountsController ([#1858](https://github.com/MetaMask/core/pull/1858))

## [3.0.0]

### Changed

- **BREAKING:** Bump dependency on `@metamask/eth-snap-keyring` to ^1.0.0 ([#1735](https://github.com/MetaMask/core/pull/1735))
- **BREAKING:** Bump dependency on `@metamask/keyring-api` to ^1.0.0 ([#1735](https://github.com/MetaMask/core/pull/1735))
- **BREAKING:** Bump dependency on `@metamask/snaps-utils` to ^3.0.0 ([#1735](https://github.com/MetaMask/core/pull/1735))
- Bump dependency and peer dependency on `@metamask/keyring-controller` to ^8.0.3

## [2.0.2]

### Changed

- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump peer dependency on `@metamask/keyring-controller` to ^8.0.2

## [2.0.1]

### Changed

- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))

### Fixed

- Remove unused `selectedAccount` from state metadata ([#1734](https://github.com/MetaMask/core/pull/1734))

## [2.0.0]

### Changed

- **BREAKING:** Bump peer dependency on `@metamask/keyring-controller` to ^8.0.0

## [1.0.0]

### Added

- Initial release ([#1637](https://github.com/MetaMask/core/pull/1637))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@14.0.0...HEAD
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@13.0.0...@metamask/accounts-controller@14.0.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@12.0.1...@metamask/accounts-controller@13.0.0
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@12.0.0...@metamask/accounts-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@11.0.0...@metamask/accounts-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@10.0.0...@metamask/accounts-controller@11.0.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@9.0.0...@metamask/accounts-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@8.0.0...@metamask/accounts-controller@9.0.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@7.0.1...@metamask/accounts-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@7.0.0...@metamask/accounts-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@6.0.0...@metamask/accounts-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@5.0.0...@metamask/accounts-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@4.0.0...@metamask/accounts-controller@5.0.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@3.0.0...@metamask/accounts-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.2...@metamask/accounts-controller@3.0.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.1...@metamask/accounts-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.0...@metamask/accounts-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@1.0.0...@metamask/accounts-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/accounts-controller@1.0.0
