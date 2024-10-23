# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- deps: @metamask/rpc-errors@^6.3.1->^7.0.0 ([#4769](https://github.com/MetaMask/core/pull/4769))

## [4.1.5]

### Fixed

- Bump `@metamask/json-rpc-engine` to `^10.0.0` ([#4798](https://github.com/MetaMask/core/pull/4798))

## [4.1.4]

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [4.1.3]

### Changed

- Bump `typescript` from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- Fix SafeEventEmitterProvider invalid default params ([#4603](https://github.com/MetaMask/core/pull/4603))

## [4.1.2]

### Changed

- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/json-rpc-engine` from `^9.0.1` to `^9.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))

## [4.1.1]

### Changed

- Bump `@metamask/json-rpc-engine` to `^9.0.1` ([#4517](https://github.com/MetaMask/core/pull/4517))
- Bump `@metamask/rpc-errors` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` to `^9.0.0` ([#4516](https://github.com/MetaMask/core/pull/4516))

## [4.1.0]

### Added

- Make `SafeEventEmitterProvider` EIP-1193 compatible by adding a `request` method ([#4422](https://github.com/MetaMask/core/pull/4422))
  - Now `SafeEventEmitterProvider` is compatible with `@metamask/eth-query`, `@metamask/ethjs-query`, `BrowserProvider` from Ethers v6 and `Web3Provider` from Ethers v5

### Deprecated

- Mark `sendAsync` method as deprecated in favor of `request` method ([#4422](https://github.com/MetaMask/core/pull/4422))

## [4.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))
- Bump `@metamask/json-rpc-engine` to `^9.0.0` ([#4352](https://github.com/MetaMask/core/pull/4352))

## [3.0.2]

### Changed

- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))
- Bump `@metamask/json-rpc-engine` to `^8.0.2` ([#4234](https://github.com/MetaMask/core/pull/4234))

## [3.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [3.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

### Changed

- Bump `@metamask/json-rpc-engine` to `^8.0.0` ([#4039](https://github.com/MetaMask/core/pull/4039))

## [2.3.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))
- Bump `@metamask/json-rpc-engine` to `^7.3.2` ([#3821](https://github.com/MetaMask/core/pull/3821))

## [2.3.1]

### Changed

- Bump `@metamask/json-rpc-engine` to `^7.3.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.5...HEAD
[4.1.5]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.4...@metamask/eth-json-rpc-provider@4.1.5
[4.1.4]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.3...@metamask/eth-json-rpc-provider@4.1.4
[4.1.3]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.2...@metamask/eth-json-rpc-provider@4.1.3
[4.1.2]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.1...@metamask/eth-json-rpc-provider@4.1.2
[4.1.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.0...@metamask/eth-json-rpc-provider@4.1.1
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.0.0...@metamask/eth-json-rpc-provider@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@3.0.2...@metamask/eth-json-rpc-provider@4.0.0
[3.0.2]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@3.0.1...@metamask/eth-json-rpc-provider@3.0.2
[3.0.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@3.0.0...@metamask/eth-json-rpc-provider@3.0.1
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.3.2...@metamask/eth-json-rpc-provider@3.0.0
[2.3.2]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.3.1...@metamask/eth-json-rpc-provider@2.3.2
[2.3.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.3.0...@metamask/eth-json-rpc-provider@2.3.1
[2.3.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.2.0...@metamask/eth-json-rpc-provider@2.3.0
[2.2.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.1.0...@metamask/eth-json-rpc-provider@2.2.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@2.0.0...@metamask/eth-json-rpc-provider@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@1.0.1...@metamask/eth-json-rpc-provider@2.0.0
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@1.0.0...@metamask/eth-json-rpc-provider@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eth-json-rpc-provider@1.0.0
