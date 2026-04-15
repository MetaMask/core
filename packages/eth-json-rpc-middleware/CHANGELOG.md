# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- chore: bump `@metamask/auto-changelog` to `^6.0.0` ([#8441](https://github.com/MetaMask/core/pull/8441))
- chore: Use Oxfmt for import sorting instead of `import-x/order` ([#8438](https://github.com/MetaMask/core/pull/8438))
- chore: Replace Prettier with Oxfmt ([#8434](https://github.com/MetaMask/core/pull/8434))
- chore: remove `@metamask/error-reporting-service` package ([#8323](https://github.com/MetaMask/core/pull/8323))
- fix: Clone `JsonRpcEngineV2` results to prevent returning frozen objects ([#8077](https://github.com/MetaMask/core/pull/8077))
- chore: secure PUBLISH_PREVIEW_NPM_TOKEN with GitHub environment ([#8011](https://github.com/MetaMask/core/pull/8011))
- Release/825.0.0 ([#7996](https://github.com/MetaMask/core/pull/7996))
- chore: upgrade `typedoc` from `^0.24.8` to `^0.25.13` ([#7898](https://github.com/MetaMask/core/pull/7898))
- chore: migrate Jest from v27 to v29 ([#7894](https://github.com/MetaMask/core/pull/7894))
- Release/782.0.0 ([#7810](https://github.com/MetaMask/core/pull/7810))
- chore: upgrade Jest-related packages to latest 27.x versions ([#7792](https://github.com/MetaMask/core/pull/7792))
- Release/751.0.0 ([#7634](https://github.com/MetaMask/core/pull/7634))
- Release 748.0.0 ([#7604](https://github.com/MetaMask/core/pull/7604))
- Release/741.0.0 ([#7583](https://github.com/MetaMask/core/pull/7583))
- chore: Replace deprecated error reporting service calls with `Messenger.captureException` ([#7542](https://github.com/MetaMask/core/pull/7542))
- Release 733.0.0 ([#7541](https://github.com/MetaMask/core/pull/7541))
- Release 732.0.0 ([#7534](https://github.com/MetaMask/core/pull/7534))
- chore(lint): Fix suppressed ESLint errors in `eth-json-rpc-middleware` package ([#7475](https://github.com/MetaMask/core/pull/7475))
- Release/714.0.0 ([#7330](https://github.com/MetaMask/core/pull/7330))
- chore: Update ESLint config packages to v15 ([#7305](https://github.com/MetaMask/core/pull/7305))
- Release/699.0.0 ([#7258](https://github.com/MetaMask/core/pull/7258))
- Revert "Release 687.0.0" ([#7201](https://github.com/MetaMask/core/pull/7201))
- Release 687.0.0 ([#7190](https://github.com/MetaMask/core/pull/7190))
- chore: Remove unused ESLint ignore directives ([#7154](https://github.com/MetaMask/core/pull/7154))
- chore: Update `typescript` to v5.3 ([#7081](https://github.com/MetaMask/core/pull/7081))
- chore: Disable ESLint cache by default ([#7082](https://github.com/MetaMask/core/pull/7082))
- fix: Fix build script not working because of missing `@ts-bridge/cli` dependency ([#7040](https://github.com/MetaMask/core/pull/7040))
- test(eth-json-rpc-middleware): Round out test suite ([#6967](https://github.com/MetaMask/core/pull/6967))
- Release/642.0.0 ([#6962](https://github.com/MetaMask/core/pull/6962))
- Release 641.0.0 ([#6940](https://github.com/MetaMask/core/pull/6940))

## [23.1.1]

### Changed

- Bump `@metamask/eth-json-rpc-provider` from `^6.0.0` to `^6.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/message-manager` from `^14.1.0` to `^14.1.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/json-rpc-engine` from `^10.2.1` to `^10.2.4` ([#7856](https://github.com/MetaMask/core/pull/7856), [#8078](https://github.com/MetaMask/core/pull/8078), [#8317](https://github.com/MetaMask/core/pull/8317))

## [23.1.0]

### Added

- Add prototype pollution validation for `signTypedData` methods (V1, V3, V4) to block dangerous properties (`__proto__`, `constructor`, `prototype`, etc.) in message data. ([#7732](https://github.com/MetaMask/core/pull/7732))

### Changed

- Bump `@metamask/eth-block-tracker` from `^15.0.0` to `^15.0.1` ([#7642](https://github.com/MetaMask/core/pull/7642))
- Bump `@metamask/json-rpc-engine` from `^10.2.0` to `^10.2.1` ([#7642](https://github.com/MetaMask/core/pull/7642))

## [23.0.0]

### Added

- Support for `wallet_getSupportedExecutionPermissions` and `wallet_getGrantedExecutionPermissions` RPC methods ([#7603](https://github.com/MetaMask/core/pull/7603))

### Changed

- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- **BREAKING:** Changed `wallet_requestExecutionPermissions` to comply with 7715 spec revisions.

## [22.0.1]

### Fixed

- Include `WalletContext` in EIP-7715 requests ([#7331](https://github.com/MetaMask/core/pull/7331))

## [22.0.0]

### Added

- Add new function `providerAsMiddlewareV2` for converting an `InternalProvider` into a `JsonRpcEngine` v2-compatible middleware ([#7138](https://github.com/MetaMask/core/pull/7138))

### Changed

- **BREAKING:** Migrate all middleware from `JsonRpcEngine` to `JsonRpcEngineV2` ([#7065](https://github.com/MetaMask/core/pull/7065))
  - To continue using this package with the legacy `JsonRpcEngine`, use the `asLegacyMiddleware` backwards compatibility function.
- **BREAKING:** Change the signatures of hooks for `createWalletMiddleware` ([#7065](https://github.com/MetaMask/core/pull/7065))
  - To wit:
    - `getAccounts` takes an origin argument (`string`) instead of a `JsonRpcRequest`
    - `processDecryptMessage` and `processEncryptionPublicKey` take a `MessageRequest` from `@metamask/message-manager` instead of `JsonRpcRequest`
    - `processPersonalMessage`, `processTransaction`, `processSignTransaction`, `processTypedMessage`, `processTypedMessageV3` and `processTypedMessageV4` take a `context` as the third argument, before any other arguments
  - Be advised that request objects are now deeply frozen, and cannot be mutated.
- **BREAKING:** Use `InternalProvider` instead of `SafeEventEmitterProvider` ([#6796](https://github.com/MetaMask/core/pull/6796))
  - Wherever a `SafeEventEmitterProvider` was expected, an `InternalProvider` is now expected instead.
- **BREAKING:** Stop retrying `undefined` results for methods that include a block tag parameter ([#7001](https://github.com/MetaMask/core/pull/7001))
  - The `retryOnEmpty` middleware will now throw an error if it encounters an `undefined` result when dispatching
    a request with a later block number than the originally requested block number.
  - In practice, this should happen rarely if ever.
- **BREAKING:** Migrate all uses of `interface` to `type` ([#6885](https://github.com/MetaMask/core/pull/6885))
- Bump `@metamask/message-manager` from `^14.0.0` to `^14.1.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/json-rpc-engine` from `^10.1.1` to `^10.2.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/eth-json-rpc-provider` from `^5.0.1` to `^6.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- Bump `@metamask/eth-block-tracker` from `^14.0.0` to `^15.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [21.0.0]

### Changed

- **BREAKING:** Increase minimum Node.js version from `^18.16` to `^18.18` ([#6866](https://github.com/MetaMask/core/pull/6866))
- Bump `@metamask/eth-block-tracker` from `^12.2.1` to `^14.0.0` ([#6866](https://github.com/MetaMask/core/pull/6866), [#6883](https://github.com/MetaMask/core/pull/6883))
- Bump `@metamask/network-controller` from `^24.2.2` to `^24.3.0` ([#6883](https://github.com/MetaMask/core/pull/6883))
- This package was migrated from `MetaMask/eth-json-rpc-middleware` to the
  `MetaMask/core` monorepo.
  - See [`MetaMask/eth-json-rpc-middleware`](https://github.com/MetaMask/eth-json-rpc-middleware/blob/main/CHANGELOG.md)
    for the original changelog.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-middleware@23.1.1...HEAD
[23.1.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-middleware@23.1.0...@metamask/eth-json-rpc-middleware@23.1.1
[23.1.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-middleware@23.0.0...@metamask/eth-json-rpc-middleware@23.1.0
[23.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-middleware@22.0.1...@metamask/eth-json-rpc-middleware@23.0.0
[22.0.1]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-middleware@22.0.0...@metamask/eth-json-rpc-middleware@22.0.1
[22.0.0]: https://github.com/MetaMask/core/compare/@metamask/eth-json-rpc-middleware@21.0.0...@metamask/eth-json-rpc-middleware@22.0.0
[21.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/eth-json-rpc-middleware@21.0.0
