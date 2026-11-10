# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add support for Node.js 26 ([#10981](https://github.com/MetaMask/core/pull/10981))

### Changed

- Bump `@metamask/utils` from `^11.12.0` to `^12.0.1` ([#10192](https://github.com/MetaMask/core/pull/10192), [#11107](https://github.com/MetaMask/core/pull/11107))
- Bump `@metamask/rpc-errors` from `^7.0.2` to `^7.0.3` ([#10718](https://github.com/MetaMask/core/pull/10718))

## [11.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#9536](https://github.com/MetaMask/core/pull/9536))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- **BREAKING:** Bump minimum Node.js version to 22 ([#9976](https://github.com/MetaMask/core/pull/9976))
- **BREAKING:** Bump TypeScript target to ES2022 ([#10019](https://github.com/MetaMask/core/pull/10019))
  - This package now ships ES2022 code, requiring a compatible modern environment or bundler configuration to consume.
- Bump `@metamask/utils` from `^11.9.0` to `^11.12.0` ([#9074](https://github.com/MetaMask/core/pull/9074), [#10076](https://github.com/MetaMask/core/pull/10076))
- Bump `@metamask/messenger` from `^1.2.0` to `^3.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392), [#10160](https://github.com/MetaMask/core/pull/10160))

## [10.5.0]

### Added

- Export `assertExpectedHooks` utility ([#8747](https://github.com/MetaMask/core/pull/8747))

## [10.4.0]

### Added

- Add legacy `createOriginMiddleware` utility ([#8734](https://github.com/MetaMask/core/pull/8734))

## [10.3.0]

### Added

- Add `createOriginMiddleware` utility to `v2` ([#8522](https://github.com/MetaMask/core/pull/8522))
- Add `createMethodMiddleware` utility to `v2` ([#8506](https://github.com/MetaMask/core/pull/8506), [#8583](https://github.com/MetaMask/core/pull/8583))
  - This utility allows JSON-RPC method implementations to use both the hooks pattern and the messenger.
- Add legacy `createMethodMiddleware` ([#8583](https://github.com/MetaMask/core/pull/8583))
  - Consolidates bespoke `makeMethodMiddlewareMaker` implementations from the MetaMask extension and mobile clients.
  - Handlers may now declare `actionNames` and receive a delegated messenger as the sixth argument to `implementation`, mirroring the v2 `createMethodMiddleware`.
  - Deprecated in favor of the v2 `createMethodMiddleware`.

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))

## [10.2.4]

### Fixed

- `JsonRpcServer.handle()` no longer throws or produces unhandled promise rejections when the `onError` callback throws or rejects ([#8071](https://github.com/MetaMask/core/pull/8071))

## [10.2.3]

### Fixed

- Clone `JsonRpcEngineV2` return values to prevent returning frozen objects ([#8077](https://github.com/MetaMask/core/pull/8077))

## [10.2.2]

### Fixed

- Preserve `data.cause` in RPC errors when using JsonRpcEngine compatibility tools ([#7838](https://github.com/MetaMask/core/pull/7838))

## [10.2.1]

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))

### Fixed

- Ensure non-object data in RPC errors is deserialized correctly when using JsonRpcEngine compatibility tools ([#7638](https://github.com/MetaMask/core/pull/7638))

## [10.2.0]

### Added

- Add `JsonRpcEngineV2` ([#6176](https://github.com/MetaMask/core/pull/6176), [#6971](https://github.com/MetaMask/core/pull/6971), [#6975](https://github.com/MetaMask/core/pull/6975), [#6990](https://github.com/MetaMask/core/pull/6990), [#6991](https://github.com/MetaMask/core/pull/6991), [#7032](https://github.com/MetaMask/core/pull/7032), [#7001](https://github.com/MetaMask/core/pull/7001), [#7061](https://github.com/MetaMask/core/pull/7061), [#7065](https://github.com/MetaMask/core/pull/7065))
  - This is a complete rewrite of `JsonRpcEngine`, intended to replace the original implementation. See the readme for details.

## [10.1.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

## [10.1.0]

### Changed

- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

### Deprecated

- `JsonRpcEngine` and related types ([#6176](https://github.com/MetaMask/core/pull/6176))
  - To be replaced by `JsonRpcEngineV2`.

## [10.0.3]

### Changed

- Bump `@metamask/utils` from `^11.0.1` to `^11.1.0` ([#5223](https://github.com/MetaMask/core/pull/5223))

## [10.0.2]

### Changed

- Bump `@metamask/utils` from `^10.0.0` to `^11.0.1` ([#5080](https://github.com/MetaMask/core/pull/5080))
- Bump `@metamask/rpc-errors` from `^7.0.0` to `^7.0.2` ([#5080](https://github.com/MetaMask/core/pull/5080))

## [10.0.1]

### Changed

- Bump `@metamask/utils` from `^9.1.0` to `^10.0.0` ([#4831](https://github.com/MetaMask/core/pull/4831))

## [10.0.0]

### Fixed

- **BREAKING**: Bump `@metamask/rpc-errors` from `^6.3.1` to `^7.0.0` ([#4773](https://github.com/MetaMask/core/pull/4773))
  - This modifies the top-level error message for serialized internal JSON-RPC errors to include the actual error message, instead of the generic `Internal JSON-RPC Error.` string.

## [9.0.3]

### Changed

- Bump TypeScript from `~5.0.4` to `~5.2.2` ([#4576](https://github.com/MetaMask/core/pull/4576), [#4584](https://github.com/MetaMask/core/pull/4584))

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files. ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.

## [9.0.2]

### Changed

- Bump TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/utils` from `^9.0.0` to `^9.1.0` ([#4529](https://github.com/MetaMask/core/pull/4529))

## [9.0.1]

### Changed

- Bump `@metamask/rpc-errors` from `6.2.1` to `^6.3.1` ([#4516](https://github.com/MetaMask/core/pull/4516))
- Bump `@metamask/utils` from `^8.3.0` to `^9.0.0` ([#4516](https://github.com/MetaMask/core/pull/4516))

## [9.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 18.18 ([#3611](https://github.com/MetaMask/core/pull/3611))

## [8.0.2]

### Changed

- Widen the `error` parameter of `JsonRpcEngineReturnHandler`, `JsonRpcEngineEndCallback` function types from `JsonRpcEngineCallbackError` to `unknown` ([#3906](https://github.com/MetaMask/core/pull/3906))
- Narrow the function parameters `req`, `callback` of the last overload of the `handle` method of the `JsonRpcEngine` class ([#3906](https://github.com/MetaMask/core/pull/3906))
  - This applies to the overload with two function parameters, one required and one optional, and no generic parameters.
  - `req` is narrowed from `unknown` to `(JsonRpcRequest | JsonRpcNotification)[] | JsonRpcRequest | JsonRpcNotification`.
  - `callback` is narrowed from `any` to `(error: unknown, response: never) => void`.
- Bump TypeScript version to `~4.9.5` ([#4084](https://github.com/MetaMask/core/pull/4084))

## [8.0.1]

### Fixed

- Fix `types` field in `package.json` ([#4047](https://github.com/MetaMask/core/pull/4047))

## [8.0.0]

### Added

- **BREAKING**: Add ESM build ([#3998](https://github.com/MetaMask/core/pull/3998))
  - It's no longer possible to import files from `./dist` directly.

## [7.3.3]

### Changed

- Bump `@metamask/rpc-errors` to `^6.2.1` ([#3954](https://github.com/MetaMask/core/pull/3954))

## [7.3.2]

### Changed

- Bump `@metamask/utils` to `^8.3.0` ([#3769](https://github.com/MetaMask/core/pull/3769))

## [7.3.1]

### Changed

- There are no consumer-facing changes to this package. This version is a part of a synchronized release across all packages in our monorepo.

## [7.3.0]

### Added

- This package was migrated from `MetaMask/json-rpc-engine` to the
  `MetaMask/core` monorepo ([#1895](https://github.com/MetaMask/core/pull/1895))
  - See [`MetaMask/json-rpc-engine`](https://github.com/MetaMask/json-rpc-engine/blob/main/CHANGELOG.md)
    for the original changelog.

### Changed

- Bump `@metamask/utils` from `^8.1.0` to `^8.2.0` ([#1895](https://github.com/MetaMask/core/pull/1895))
- Bump `@metamask/rpc-errors` from `^6.0.0` to `^6.1.0` ([#1882](https://github.com/MetaMask/core/pull/1882))
- Bump `@metamask/auto-changelog` from `3.4.2` to `3.4.3` ([#1997](https://github.com/MetaMask/core/pull/1997))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@11.0.0...HEAD
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.5.0...@metamask/json-rpc-engine@11.0.0
[10.5.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.4.0...@metamask/json-rpc-engine@10.5.0
[10.4.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.3.0...@metamask/json-rpc-engine@10.4.0
[10.3.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.2.4...@metamask/json-rpc-engine@10.3.0
[10.2.4]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.2.3...@metamask/json-rpc-engine@10.2.4
[10.2.3]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.2.2...@metamask/json-rpc-engine@10.2.3
[10.2.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.2.1...@metamask/json-rpc-engine@10.2.2
[10.2.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.2.0...@metamask/json-rpc-engine@10.2.1
[10.2.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.1.1...@metamask/json-rpc-engine@10.2.0
[10.1.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.1.0...@metamask/json-rpc-engine@10.1.1
[10.1.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.0.3...@metamask/json-rpc-engine@10.1.0
[10.0.3]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.0.2...@metamask/json-rpc-engine@10.0.3
[10.0.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.0.1...@metamask/json-rpc-engine@10.0.2
[10.0.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.0.0...@metamask/json-rpc-engine@10.0.1
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@9.0.3...@metamask/json-rpc-engine@10.0.0
[9.0.3]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@9.0.2...@metamask/json-rpc-engine@9.0.3
[9.0.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@9.0.1...@metamask/json-rpc-engine@9.0.2
[9.0.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@9.0.0...@metamask/json-rpc-engine@9.0.1
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@8.0.2...@metamask/json-rpc-engine@9.0.0
[8.0.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@8.0.1...@metamask/json-rpc-engine@8.0.2
[8.0.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@8.0.0...@metamask/json-rpc-engine@8.0.1
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.3.3...@metamask/json-rpc-engine@8.0.0
[7.3.3]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.3.2...@metamask/json-rpc-engine@7.3.3
[7.3.2]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.3.1...@metamask/json-rpc-engine@7.3.2
[7.3.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.3.0...@metamask/json-rpc-engine@7.3.1
[7.3.0]: https://github.com/MetaMask/core/releases/tag/@metamask/json-rpc-engine@7.3.0
