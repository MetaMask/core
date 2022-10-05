# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [9.0.1]
### Changed
- Update `@metamask/eth-sig-util` from v3 to v5 ([#133](https://github.com/MetaMask/eth-json-rpc-middleware/pull/133), [#150](https://github.com/MetaMask/eth-json-rpc-middleware/pull/150))
- Remove unused dependencies ([#133](https://github.com/MetaMask/eth-json-rpc-middleware/pull/133))

### Fixed
- Fix `block-ref` middleware, and prevent it from making a duplicate request ([#151](https://github.com/MetaMask/eth-json-rpc-middleware/pull/151))
- Fix `retryOnEmpty` middleware and prevent it from making duplicate requests ([#147](https://github.com/MetaMask/eth-json-rpc-middleware/pull/147))

## [9.0.0]
### Added
- Add logging ([#140](https://github.com/MetaMask/eth-json-rpc-middleware/pull/140))
  - You will not be able to see log messages by default, but you can turn them on for this library by setting the `DEBUG` environment variable to `metamask:eth-json-rpc-middleware:*` or `metamask:*`.

### Changed
- **BREAKING:** Require Node >= 14 ([#137](https://github.com/MetaMask/eth-json-rpc-middleware/pull/137))

## [8.1.0]
### Added
- Expose `SafeEventEmitterProvider` type ([#127](https://github.com/MetaMask/eth-json-rpc-middleware/pull/127))

### Fixed
- Move `eth-block-tracker` from `devDependencies` to `dependencies` ([#125](https://github.com/MetaMask/eth-json-rpc-middleware/pull/125))
  - We depend upon this package only for types.

## [8.0.2]
### Added
- Added `suppressUnauthorized` param to `getAccounts` ([#116](https://github.com/MetaMask/eth-json-rpc-middleware/pull/116))

### Security
- Bump `node-fetch` to resolve vulnerability ([#115](https://github.com/MetaMask/eth-json-rpc-middleware/pull/115))

## [8.0.1]
### Fixed
- Restore support for query strings in fetch middleware  ([#109](https://github.com/MetaMask/eth-json-rpc-middleware/pull/109))
  - As of `v7.0.0`, query strings were silently dropped from RPC URLs passed in. Now they are preserved, as was the case in `v6.0.0`.

## [8.0.0] - 2021-11-04
### Added
- **BREAKING:** Add `eth_signTransaction` support ([#96](https://github.com/MetaMask/eth-json-rpc-middleware/pull/96))
  - We consider this breaking because a wallet application may not support this method, and would have to explicitly block it until its implications can be adequately represented to the user.
- Add `send` method to provider and `ethersProviderAsMiddleware` ([#97](https://github.com/MetaMask/eth-json-rpc-middleware/pull/97))

## [7.0.1] - 2021-03-26
### Fixed
- `blockTrackerInspectorMiddleware` ([#88](https://github.com/MetaMask/eth-json-rpc-middleware/pull/88))
  - Due to an error introduced in [#68](https://github.com/MetaMask/eth-json-rpc-middleware/pull/68), this middleware would sometimes hang indefinitely.

## [7.0.0] - 2021-03-25
### Added
- TypeScript types ([#68](https://github.com/MetaMask/eth-json-rpc-middleware/pull/68))

### Changed
- **(BREAKING)** Move middleware files to `/src` folder ([#60](https://github.com/MetaMask/eth-json-rpc-middleware/pull/60))
- **(BREAKING)** Convert all exports to named ([#81](https://github.com/MetaMask/eth-json-rpc-middleware/pull/81))
- Migrate to TypeScript ([#68](https://github.com/MetaMask/eth-json-rpc-middleware/pull/68))
- Replace `url` dependency with native URL global ([#67](https://github.com/MetaMask/eth-json-rpc-middleware/pull/67))
- Ask bundlers to ignore Node-specific depedencies in browser environments ([#78](https://github.com/MetaMask/eth-json-rpc-middleware/pull/78), [#84](https://github.com/MetaMask/eth-json-rpc-middleware/pull/84))
- Removed various unused production dependencies ([#10](https://github.com/MetaMask/eth-json-rpc-middleware/pull/10), [#80](https://github.com/MetaMask/eth-json-rpc-middleware/pull/80))

### Removed
- **(BREAKING)** Parity middleware ([#63](https://github.com/MetaMask/eth-json-rpc-middleware/pull/63))
  - Previously imported as `eth-json-rpc-middleware/wallet-parity.js`
- **(BREAKING)** Scaffold middleware ([#60](https://github.com/MetaMask/eth-json-rpc-middleware/pull/60))
  - This was just a re-export from `json-rpc-engine`.

### Fixed
- `retryOnEmpty` middleware error messages ([#58](https://github.com/MetaMask/eth-json-rpc-middleware/pull/58))
  - They were referencing a different middleware.
- Default unrecognized methods to never be cached ([#66](https://github.com/MetaMask/eth-json-rpc-middleware/pull/66))
- Only publish necessary files ([#70](https://github.com/MetaMask/eth-json-rpc-middleware/pull/70))
- Robustify `providerFromEngine` callback parameter validation ([#76](https://github.com/MetaMask/eth-json-rpc-middleware/pull/76))
  - Previously, it only errored if the parameter was falsy. Now, it will error if it is not a function.
  - Passing the previous implementation a truthy, non-function value would cause fatal downstream errors.
- Prevent caching unrecognized requests ([#75](https://github.com/MetaMask/eth-json-rpc-middleware/pull/75))
  - Previously, nonsense values were sometimes cached, resulting in an ugly state and possibly a minor performance penalty.

## [6.0.0] - 2020-09-22
### Changed
- **(BREAKING)** Delete VM middleware ([#56](https://github.com/MetaMask/eth-json-rpc-middleware/pull/56))
  - Previously imported as `eth-json-rpc-middleware/vm.js`

## [5.1.0] - 2020-09-22
### Changed
- `json-rpc-engine@5.3.0` ([#53](https://github.com/MetaMask/eth-json-rpc-middleware/pull/53))
- `eth-rpc-errors@3.0.0` ([#55](https://github.com/MetaMask/eth-json-rpc-middleware/pull/55))

[Unreleased]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v9.0.1...HEAD
[9.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v9.0.0...v9.0.1
[9.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v8.1.0...v9.0.0
[8.1.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v8.0.2...v8.1.0
[8.0.2]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v8.0.1...v8.0.2
[8.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v8.0.0...v8.0.1
[8.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v7.0.1...v8.0.0
[7.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v7.0.0...v7.0.1
[7.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v6.0.0...v7.0.0
[6.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v5.1.0...v6.0.0
[5.1.0]: https://github.com/MetaMask/eth-json-rpc-middleware/releases/tag/v5.1.0
