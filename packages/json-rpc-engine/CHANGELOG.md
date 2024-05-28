# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [8.0.2]

### Changed

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/json-rpc-engine@8.0.2...HEAD
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
