# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [10.1.1]

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

## [10.1.0]

### Changed

- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))

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
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
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

- Migrate `@metamask/json-rpc-engine` into the core monorepo ([#1895](https://github.com/MetaMask/core/pull/1895))

### Changed

- Bump `@metamask/utils` from `^8.1.0` to `^8.2.0` ([#1895](https://github.com/MetaMask/core/pull/1895))
- Bump `@metamask/rpc-errors` from `^6.0.0` to `^6.1.0` ([#1882](https://github.com/MetaMask/core/pull/1882))
- Bump `@metamask/auto-changelog` from `3.4.2` to `3.4.3` ([#1997](https://github.com/MetaMask/core/pull/1997))

## [7.2.0]

### Added

- Applied eslint rules from core monorepo ([#172](https://github.com/MetaMask/json-rpc-engine/pull/172))

## [7.1.1]

### Changed

- Bumped `@metamask/utils` from `^5.0.2` to `^8.1.0` [#158](https://github.com/MetaMask/json-rpc-engine/pull/158) ([#162](https://github.com/MetaMask/json-rpc-engine/pull/162))
- Bumped `@metamask/rpc-errors` from `^5.0.0` to `^6.0.0` ([#162](https://github.com/MetaMask/json-rpc-engine/pull/162))

## [7.1.0]

### Changed

- Bumped `@metamask/safe-event-emitter` from `^2.0.0` to `^3.0.0` ([#148](https://github.com/MetaMask/json-rpc-engine/pull/148))
- Bumped `@metamask/utils` from `^5.0.1` to `^5.0.2` ([#151](https://github.com/MetaMask/json-rpc-engine/pull/151))

### Fixed

- Fixed handling of empty batch array in requests ([#153](https://github.com/MetaMask/json-rpc-engine/pull/153))

## [7.0.0]

### Added

- Added JSON-RPC notification handling ([#104](https://github.com/MetaMask/json-rpc-engine/pull/104))
- Added `destroy` method ([#106](https://github.com/MetaMask/json-rpc-engine/pull/106))

### Changed

- **BREAKING:** Require a minimum Node version of 16 ([#139](https://github.com/MetaMask/json-rpc-engine/pull/139))
- **BREAKING:** Use `@metamask/utils` types ([#105](https://github.com/MetaMask/json-rpc-engine/pull/105))
  - The JSON-RPC engine and all middleware now use `@metamask/utils` JSON-RPC types
- **(BREAKING)** Return a `null` instead of `undefined` response `id` for malformed request objects ([#91](https://github.com/MetaMask/json-rpc-engine/pull/91))
  - This is very unlikely to be breaking in practice, but the behavior could have been relied on.
- Change package name to `@metamask/json-rpc-engine` ([#139](https://github.com/MetaMask/json-rpc-engine/pull/139))
- Use `@metamask/rpc-errors` ([#138](https://github.com/MetaMask/json-rpc-engine/pull/138))

## [6.1.0] - 2020-11-20

### Added

- Add `PendingJsonRpcResponse` interface for use in middleware ([#75](https://github.com/MetaMask/json-rpc-engine/pull/75))

### Changed

- Use `async`/`await` and `try`/`catch` instead of Promise methods everywhere ([#74](https://github.com/MetaMask/json-rpc-engine/pull/74))
  - Consumers may notice improved stack traces on certain platforms.

## [6.0.0] - 2020-11-19

### Added

- Add docstrings for public `JsonRpcEngine` methods ([#70](https://github.com/MetaMask/json-rpc-engine/pull/70))

### Changed

- **(BREAKING)** Refactor exports ([#69](https://github.com/MetaMask/json-rpc-engine/pull/69))
  - All exports are now named, and available via the package entry point.
  - All default exports have been removed.
- **(BREAKING)** Convert `asMiddleware` to instance method ([#69](https://github.com/MetaMask/json-rpc-engine/pull/69))
  - The `asMiddleware` export has been removed.
- **(BREAKING)** Add runtime typechecks to `JsonRpcEngine.handle()`, and error responses if they fail ([#70](https://github.com/MetaMask/json-rpc-engine/pull/70))
  - Requests will now error if:
    - The request is not a plain object, or if the `method` property is not a `string`. Empty strings are allowed.
    - A `next` middleware callback is called with a truthy, non-function parameter.
- Migrate to TypeScript ([#69](https://github.com/MetaMask/json-rpc-engine/pull/69))
- Hopefully improve stack traces by removing uses of `Promise.then` and `.catch` internally ([#70](https://github.com/MetaMask/json-rpc-engine/pull/70))
- Make some internal `JsonRpcEngine` methods `static` ([#71](https://github.com/MetaMask/json-rpc-engine/pull/71))

## [5.4.0] - 2020-11-07

### Changed

- Make the TypeScript types not terrible ([#66](https://github.com/MetaMask/json-rpc-engine/pull/66), [#67](https://github.com/MetaMask/json-rpc-engine/pull/67))

## [5.3.0] - 2020-07-30

### Changed

- Response object errors no longer include a `stack` property

## [5.2.0] - 2020-07-24

### Added

- Promise signatures for `engine.handle` ([#55](https://github.com/MetaMask/json-rpc-engine/pull/55))
  - So, in addition to `engine.handle(request, callback)`, you can do e.g. `await engine.handle(request)`.

### Changed

- Remove `async` and `promise-to-callback` dependencies
  - These dependencies were used internally for middleware flow control.
    They have been replaced with Promises and native `async`/`await`, which means that some operations are _no longer_ eagerly executed.
    This change may affect consumers that depend on the eager execution of middleware _during_ request processing, _outside of_ middleware functions and request handlers.
    - In general, it is a bad practice to work with state that depends on middleware execution, while the middleware are executing.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@10.1.1...HEAD
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
[7.3.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.2.0...@metamask/json-rpc-engine@7.3.0
[7.2.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.1.1...@metamask/json-rpc-engine@7.2.0
[7.1.1]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.1.0...@metamask/json-rpc-engine@7.1.1
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@7.0.0...@metamask/json-rpc-engine@7.1.0
[7.0.0]: https://github.com/MetaMask/core/compare/json-rpc-engine@6.1.0...@metamask/json-rpc-engine@7.0.0
[6.1.0]: https://github.com/MetaMask/core/compare/json-rpc-engine@6.0.0...json-rpc-engine@6.1.0
[6.0.0]: https://github.com/MetaMask/core/compare/json-rpc-engine@5.4.0...json-rpc-engine@6.0.0
[5.4.0]: https://github.com/MetaMask/core/compare/json-rpc-engine@5.3.0...json-rpc-engine@5.4.0
[5.3.0]: https://github.com/MetaMask/core/compare/json-rpc-engine@5.2.0...json-rpc-engine@5.3.0
[5.2.0]: https://github.com/MetaMask/core/releases/tag/json-rpc-engine@5.2.0
