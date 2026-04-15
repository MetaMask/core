# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- chore(lint): Fix suppressed ESLint errors in `eth-json-rpc-provider` package ([#7497](https://github.com/MetaMask/core/pull/7497))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: Remove unused ESLint ignore directives ([#7154](https://github.com/MetaMask/core/pull/7154))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- chore: Disable ESLint cache by default ([#7082](https://github.com/MetaMask/core/pull/7082))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- feat: add `signEip7702Authorization` to `KeyringController` ([#5301](https://github.com/MetaMask/core/pull/5301))
- Release 293.0.0 ([#5272](https://github.com/MetaMask/core/pull/5272))
- Release 233.0.0 ([#4862](https://github.com/MetaMask/core/pull/4862))
- deps(eth-json-rpc-provider): @metamask/rpc-errors@^6.3.1->^7.0.0 ([#4799](https://github.com/MetaMask/core/pull/4799))
- Release 202.0.0 ([#4704](https://github.com/MetaMask/core/pull/4704))
- Add way to view pkg changes since latest release ([#1390](https://github.com/MetaMask/core/pull/1390))
- Release 184.0.0 ([#4607](https://github.com/MetaMask/core/pull/4607))
- Release 180.0.0 ([#4548](https://github.com/MetaMask/core/pull/4548))
- Release/173.0.0 ([#4519](https://github.com/MetaMask/core/pull/4519))
- Release/171.0.0 ([#4508](https://github.com/MetaMask/core/pull/4508))
- Bump Yarn to v4 ([#3612](https://github.com/MetaMask/core/pull/3612))
- Release 125.0.0 ([#4048](https://github.com/MetaMask/core/pull/4048))
- Release 123.0.0 ([#4007](https://github.com/MetaMask/core/pull/4007))
- Use Prettier to format changelogs ([#3850](https://github.com/MetaMask/core/pull/3850))
- Add script to update changelogs of a release candidate ([#3668](https://github.com/MetaMask/core/pull/3668))
- Check for unused dependencies in lint pipeline ([#2046](https://github.com/MetaMask/core/pull/2046))
- Enable `@typescript-eslint/no-explicit-any` ([#3660](https://github.com/MetaMask/core/pull/3660))
- Release 90.0.0 ([#2014](https://github.com/MetaMask/core/pull/2014))
- Revert "Release 90.0.0" ([#2012](https://github.com/MetaMask/core/pull/2012))
- Release 90.0.0 ([#2011](https://github.com/MetaMask/core/pull/2011))
- Record CHANGELOG entries from `@metamask/json-rpc-{engine,middleware-stream}` migrations ([#2003](https://github.com/MetaMask/core/pull/2003))
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#1957](https://github.com/MetaMask/core/pull/1957))
- Change `test` build scripts to only show output for failed tests by default ([#1949](https://github.com/MetaMask/core/pull/1949))
- Remove unused prepack scripts ([#1902](https://github.com/MetaMask/core/pull/1902))
- Add missing TS dep to eth-json-rpc-provider ([#1879](https://github.com/MetaMask/core/pull/1879))
- Record CHANGELOG entries from `eth-json-rpc-provider` migration ([#1855](https://github.com/MetaMask/core/pull/1855))
- Remove outdated `eth-json-rpc-provider` README content ([#1847](https://github.com/MetaMask/core/pull/1847))

## [6.0.1]

### Changed

- Bump `@metamask/json-rpc-engine` from `^10.2.0` to `^10.2.4` ([#7642](https://github.com/MetaMask/core/pull/7642), [#7856](https://github.com/MetaMask/core/pull/7856), [#8078](https://github.com/MetaMask/core/pull/8078), [#8317](https://github.com/MetaMask/core/pull/8317))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))

## [6.0.0]

### Added

- Add `providerFromMiddlewareV2` ([#7001](https://github.com/MetaMask/core/pull/7001))
  - This accepts the new middleware from `@metamask/json-rpc-engine/v2`.
- Add `context` option to `InternalProvider.request()` ([#7061](https://github.com/MetaMask/core/pull/7061))
  - Enables passing a `MiddlewareContext` to the JSON-RPC server.

### Changed

- Bump `@metamask/json-rpc-engine` from `^10.1.1` to `^10.2.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Replace `SafeEventEmitterProvider` with `InternalProvider` ([#6796](https://github.com/MetaMask/core/pull/6796))
  - The new class is behaviorally equivalent to the previous version except it does not extend `SafeEventEmitter`.
  - `SafeEventEmitterProvider` is for now still exported as a deprecated alias of `InternalProvider` for backwards compatibility.
- **BREAKING:** Migrate from `JsonRpcEngine` to `JsonRpcEngineV2` ([#7001](https://github.com/MetaMask/core/pull/7001))
  - Legacy `JsonRpcEngine` instances are wrapped in a `JsonRpcEngineV2` internally wherever they appear.
    This change should mostly be unobservable. However, due to differences in error handling, this may be breaking for consumers.

### Deprecated

- Deprecate `providerFromMiddleware` ([#7001](https://github.com/MetaMask/core/pull/7001))
  - Use `providerFromMiddlewareV2` instead, which supports the new middleware from `@metamask/json-rpc-engine/v2`.

### Removed

- **BREAKING:** Remove `providerFromEngine` ([#7001](https://github.com/MetaMask/core/pull/7001))
  - Use `InternalProvider` directly instead.

## [5.0.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))
- Bump `@metamask/json-rpc-engine` from `^10.1.0` to `^10.1.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [5.0.0]

### Changed

- **BREAKING:** Remove `'data'` event ([#6328](https://github.com/MetaMask/core/pull/6328))
  - This event was forwarding the `'notification'` event from the underlying `JsonRpcEngine`. It was rarely used in practice, and is now removed.
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/json-rpc-engine` from `^10.0.3` to `^10.1.0` ([#6678](https://github.com/MetaMask/core/pull/6678))

## [4.1.8]

### Changed

- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

## [4.1.7]

### Changed

- Bump `@metamask/json-rpc-engine` from `^10.0.1` to `^10.0.2` ([#5082](https://github.com/MetaMask/core/pull/5082))
- Bump `@metamask/utils` from `^10.0.0` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/rpc-errors` from `^7.0.0` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))

## [4.1.6]

### Changed

- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))
- Bump `@metamask/rpc-errors` from `^6.3.1` to `^7.0.0` ([#4769](https://github.com/MetaMask/core/pull/4769))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@6.0.1...HEAD
[6.0.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@6.0.0...@metamask/eth-json-rpc-provider@6.0.1
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@5.0.1...@metamask/eth-json-rpc-provider@6.0.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@5.0.0...@metamask/eth-json-rpc-provider@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.8...@metamask/eth-json-rpc-provider@5.0.0
[4.1.8]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.7...@metamask/eth-json-rpc-provider@4.1.8
[4.1.7]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.6...@metamask/eth-json-rpc-provider@4.1.7
[4.1.6]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-provider@4.1.5...@metamask/eth-json-rpc-provider@4.1.6
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
