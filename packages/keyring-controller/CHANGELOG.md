# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [3.0.0]
### Changed
- **BREAKING:**: Bump eth-keyring-controller version to @metamask/eth-keyring-controller v10 ([#1072](https://github.com/MetaMask/core.git/pull/1072))
  - `exportSeedPhrase` now returns a `Uint8Array` typed SRP (can be converted to a string using [this approach](https://github.com/MetaMask/eth-hd-keyring/blob/53b0570559595ba5b3fd8c80e900d847cd6dee3d/index.js#L40)).  It was previously a Buffer.
  - The HD keyring included with the keyring controller has been updated from v4 to v6. See [the `eth-hd-keyring` changelog entries for v5 and v6](https://github.com/MetaMask/eth-hd-keyring/blob/main/CHANGELOG.md#600) for further details on breaking changes.

## [2.0.0]
### Changed
- **BREAKING:**: Require ES2020 support or greater ([#914](https://github.com/MetaMask/controllers/pull/914))
    - This change was introduced by an indirect dependency on `ethereumjs/util` v8
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/eth-sig-util` to v5 ([#914](https://github.com/MetaMask/controllers/pull/914))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041)) 

## [1.0.1]
### Changed
- Relax dependencies on `@metamask/base-controller`, `@metamask/controller-utils`, `@metamask/message-manager`, and `@metamask/preferences-controller` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - Everything in `src/keyring`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@4.0.0...HEAD
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@3.0.0...@metamask/keyring-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@2.0.0...@metamask/keyring-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@1.0.1...@metamask/keyring-controller@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/keyring-controller@1.0.0...@metamask/keyring-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/keyring-controller@1.0.0
