# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0]

### Uncategorized

- export `KnownSessionProperties` from chain-agnostic-permission package ([#5522](https://github.com/MetaMask/core.git/pull/5522))
- throw error in caveat validator when caip25:endowment permission caveat when no scopes are requested ([#5548](https://github.com/MetaMask/core.git/pull/5548))
- chore: add more chain agnostic utility functions for interfacing w/ caip25 permission ([#5536](https://github.com/MetaMask/core.git/pull/5536))

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

[Unreleased]: https://github.com/MetaMask/core.git/compare/@metamask/chain-agnostic-permission@0.3.0...HEAD
[0.3.0]: https://github.com/MetaMask/core.git/compare/@metamask/chain-agnostic-permission@0.2.0...@metamask/chain-agnostic-permission@0.3.0
[0.2.0]: https://github.com/MetaMask/core.git/compare/@metamask/chain-agnostic-permission@0.1.0...@metamask/chain-agnostic-permission@0.2.0
[0.1.0]: https://github.com/MetaMask/core.git/releases/tag/@metamask/chain-agnostic-permission@0.1.0
