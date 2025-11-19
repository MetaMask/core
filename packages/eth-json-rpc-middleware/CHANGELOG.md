# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: Remove unused ESLint ignore directives ([#7154](https://github.com/MetaMask/core/pull/7154))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- chore: Disable ESLint cache by default ([#7082](https://github.com/MetaMask/core/pull/7082))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- test(eth-json-rpc-middleware): Round out test suite ([#6967](https://github.com/MetaMask/core/pull/6967))
- Release/642.0.0 ([#6962](https://github.com/MetaMask/core/pull/6962))
- Release 641.0.0 ([#6940](https://github.com/MetaMask/core/pull/6940))

### Changed

- **BREAKING:** Migrate to `JsonRpcEngineV2` ([#7065](https://github.com/MetaMask/core/pull/7065))
  - Migrates all middleware from `JsonRpcEngine` to `JsonRpcEngineV2`.
  - Signatures of various middleware dependencies, e.g. `processTransaction` of `createWalletMiddleware`, have changed
    and must be updated by consumers.
    - Be advised that request objects are now deeply frozen, and cannot be mutated.
  - To continue using this package with the legacy `JsonRpcEngine`, use the `asLegacyMiddleware` backwards compatibility function.
- **BREAKING:** Use `InternalProvider` instead of `SafeEventEmitterProvider` ([#6796](https://github.com/MetaMask/core/pull/6796))
  - Wherever a `SafeEventEmitterProvider` was expected, an `InternalProvider` is now expected instead.
- **BREAKING:** Stop retrying `undefined` results for methods that include a block tag parameter ([#7001](https://github.com/MetaMask/core/pull/7001))
  - The `retryOnEmpty` middleware will now throw an error if it encounters an `undefined` result when dispatching
    a request with a later block number than the originally requested block number.
  - In practice, this should happen rarely if ever.
- Migrate all uses of `interface` to `type` ([#6885](https://github.com/MetaMask/core/pull/6885))

## [21.0.0]

### Changed

- **BREAKING:** Increase minimum Node.js version from `^18.16` to `^18.18` ([#6866](https://github.com/MetaMask/core/pull/6866))
- Bump `@metamask/eth-block-tracker` from `^12.2.1` to `^14.0.0` ([#6866](https://github.com/MetaMask/core/pull/6866), [#6883](https://github.com/MetaMask/core/pull/6883))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- This package was migrated from `MetaMask/eth-json-rpc-middleware` to the
  `MetaMask/core` monorepo.
  - See [`MetaMask/eth-json-rpc-middleware`](https://github.com/MetaMask/eth-json-rpc-middleware/blob/main/CHANGELOG.md)
    for the original changelog.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-middleware@21.0.0...HEAD
[21.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eth-json-rpc-middleware@21.0.0
