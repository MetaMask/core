# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@3.0.0...@metamask/accounts-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.2...@metamask/accounts-controller@3.0.0
[2.0.2]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.1...@metamask/accounts-controller@2.0.2
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@2.0.0...@metamask/accounts-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/accounts-controller@1.0.0...@metamask/accounts-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/accounts-controller@1.0.0
