# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/chain-agnostic-permission@0.1.0...@metamask/chain-agnostic-permission@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/chain-agnostic-permission@0.1.0
