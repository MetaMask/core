# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [11.0.0]
### Changed
- **BREAKING:** Update `eth-block-tracker` to v7 ([#196](https://github.com/MetaMask/eth-json-rpc-middleware/pull/196), [#188](https://github.com/MetaMask/eth-json-rpc-middleware/pull/188))
  - This changes the expected type of the `blockTracker` parameter for the following functions:
    - `createBlockCacheMiddleware`
    - `createBlockRefMiddleware`
    - `createBlockRefRewriteMiddleware`
    - `createBlockTrackerInspectorMiddleware`
    - `createRetryOnEmptyMiddleware`
  - Only the type change is breaking; there is no functional change here.
- **BREAKING:** Add new required parameters for the `fetch` middleware ([#192](https://github.com/MetaMask/eth-json-rpc-middleware/pull/192), [#190](https://github.com/MetaMask/eth-json-rpc-middleware/pull/190))
  - The required parameters are `fetch` and `btoa`. Previously we would either use the global by that name (if one existed), or a polyfill. Those polyfills have been removed.
- Replace `json-stable-stringify` with `safe-stable-stringify` ([#104](https://github.com/MetaMask/eth-json-rpc-middleware/pull/104))
  - This should slightly improve performance of the inlight cache and block cache middleware

### Removed
- **BREAKING:** Remove `providerFromEngine` and `providerFromMiddleware` ([#194](https://github.com/MetaMask/eth-json-rpc-middleware/pull/194))
  - These are now provided by the package `@metamask/eth-json-rpc-provider` instead
- **BREAKING:** Remove unnecessary `suppressUnauthorized` option ([#193](https://github.com/MetaMask/eth-json-rpc-middleware/pull/193))

### Fixed
- **BREAKING:** Fix types for `createWalletMiddleware` ([#111](https://github.com/MetaMask/eth-json-rpc-middleware/pull/111))
  - This middleware had previously included a number of errors, where the type contradicted the Ethereum JSON-RPC specification and how we've been using this middleware in practice. They should all now match the specification.

## [10.0.0]
### Changed
- **BREAKING:** Rename the package from `eth-json-rpc-middleware` to `@metamask/eth-json-rpc-middleware` ([#180](https://github.com/MetaMask/eth-json-rpc-middleware/pull/180))
- Change all middleware request and response types to `unknown` ([#183](https://github.com/MetaMask/eth-json-rpc-middleware/pull/183))
  - This more accurately reflects the expectations of the middleware, and the way they had been used. This was required to more easily compose this middleware with others that had non-matching types.
- The block cache and the inflight cache middleware types have been updated to include the `skipCache` request property ([#178](https://github.com/MetaMask/eth-json-rpc-middleware/pull/178))
  - This property was always supported, but it was missing from the type.

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

[Unreleased]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v11.0.0...HEAD
[11.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v10.0.0...v11.0.0
[10.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v9.0.1...v10.0.0
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
