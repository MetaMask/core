# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.3.0]
### Added
- Migrate `@metamask/eth-json-rpc-provider` into the core monorepo ([#1738](https://github.com/MetaMask/core/pull/1738))

### Changed
- Export `SafeEventEmitterProvider` as class instead of type ([#1738](https://github.com/MetaMask/core/pull/1738))
- Bump `@metamask/json-rpc-engine` from `^7.1.0` to `^7.2.0` ([#1895](https://github.com/MetaMask/core/pull/1895))
- Bump `@metamask/utils` from `^8.1.0` to `^8.2.0` ([#1895](https://github.com/MetaMask/core/pull/1895))
- Bump `@metamask/auto-changelog` from `^3.2.0` to `^3.4.3` ([#1870](https://github.com/MetaMask/core/pull/1870), [#1905](https://github.com/MetaMask/core/pull/1905), [#1997](https://github.com/MetaMask/core/pull/1997))

## [2.2.0]
### Changed
- Add missing ISC license information ([#24](https://github.com/MetaMask/eth-json-rpc-provider/pull/24))

## [2.1.0]
### Changed
- Bump `@metamask/json-rpc-engine` from `^7.0.0` to `^7.1.0` ([#25](https://github.com/MetaMask/eth-json-rpc-provider/pull/25))
- Bump `@metamask/utils` from `^5.0.1` to `^8.1.0` ([#25](https://github.com/MetaMask/eth-json-rpc-provider/pull/25))

## [2.0.0]
### Fixed
- **BREAKING:** Update minimum Node.js version to 16 ([#20](https://github.com/MetaMask/eth-json-rpc-provider/pull/20))
- Switched json-rpc-engine@^6.1.0 -> @metamask/json-rpc-engine@^7.0.0 ([#16](https://github.com/MetaMask/eth-json-rpc-provider/pull/16))
  - **BREAKING**: Typescript type updates
- Updated dependencies: ([#16](https://github.com/MetaMask/eth-json-rpc-provider/pull/16))
  - Bumped @metamask/safe-event-emitter@^2.0.0->^3.0.0
  - Added @metamask/utils@5.0.1

Release `v2.0.0` is identical to `v1.0.1` aside from Node.js version requirement imposed by a dependency updates has been made explicit.

## [1.0.1] [RETRACTED]
### Changed
- **BREAKING:** Update minimum Node.js version to 16 ([#20](https://github.com/MetaMask/eth-json-rpc-provider/pull/20))
- Switched json-rpc-engine@^6.1.0 -> @metamask/json-rpc-engine@^7.0.0 ([#16](https://github.com/MetaMask/eth-json-rpc-provider/pull/16))
  - **BREAKING**: Typescript type updates
- Updated dependencies: ([#16](https://github.com/MetaMask/eth-json-rpc-provider/pull/16))
  - Bumped @metamask/safe-event-emitter@^2.0.0->^3.0.0
  - Added @metamask/utils@5.0.1

## [1.0.0]
### Added
- Initial release, including `providerFromEngine` and `providerFromMiddleware`.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.3.0...HEAD
[2.3.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.2.0...@metamask/eth-json-rpc-provider@2.3.0
[2.2.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.1.0...@metamask/eth-json-rpc-provider@2.2.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.0.0...@metamask/eth-json-rpc-provider@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@1.0.1...@metamask/eth-json-rpc-provider@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@1.0.0...@metamask/eth-json-rpc-provider@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eth-json-rpc-provider@1.0.0
