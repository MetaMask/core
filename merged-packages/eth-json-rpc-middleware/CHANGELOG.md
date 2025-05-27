# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [17.0.1]
### Fixed
- Bump `@metamask/eth-block-tracker` to 12.0.0 ([#372](https://github.com/MetaMask/eth-json-rpc-middleware/pull/372))
  - `getLatestBlock` will no longer hang, but reject, if an error is thrown while making the request.
  - This error will also no longer be wrapped under "PollingBlockTracker - encountered an error while attempting to update latest block".

## [17.0.0]
### Changed
- **BREAKING:** Support version `2.0.0` of EIP-5792 ([#370](https://github.com/MetaMask/eth-json-rpc-middleware/pull/370))
  - Add `atomicRequired` property to `SendCallsStruct`.
  - Make `from` optional in `SendCallsStruct`.
  - Add `atomic` property to `GetCallsStatusResult`.
  - Validate `address` in `GetCapabilitiesParams` is added to wallet.
  - Use `-32602` code for all EIP-5792 schema errors.

## [16.0.1]
### Fixed
- Fix `fetch` middleware so that non-standard JSON-RPC error responses are no longer treated as successful responses ([#367](https://github.com/MetaMask/eth-json-rpc-middleware/pull/367))
  - A "non-standard" error response is one with an `error` field but where there are more properties in the error object than expected

## [16.0.0]
### Added
- Support updated EIP-5792 specification ([#363](https://github.com/MetaMask/eth-json-rpc-middleware/pull/363))
  - Add optional `id` to `SendCallsParams`.
  - Add optional `capabilities` to each call in `SendCallsParams`.
  - Add `optional` property to both top-level and call-level capabilities.
  - Add `SendCallsResult` type.
  - Add `id`, `version`, and optional `capabilities` to `GetCallsStatusResult`.
  - Add `GetCallsStatusCode` enum.
  - Add `GetCallsStatusHook` type.
  - Add optional `chainIds` argument to `GetCapabilitiesParams`.

### Changed
- **BREAKING:** Support updated EIP-5792 specification ([#363](https://github.com/MetaMask/eth-json-rpc-middleware/pull/363))
  - Return `SendCallsResult` from `wallet_sendCalls` instead of `string`.
  - Change `GetCallsStatusParams` to contain `Hex` instead of `string`. 
  - Change `status` in `GetCallsStatusResult` to `number` instead of `string`.
  - Replace `GetTransactionReceiptsByBatchIdHook` with `GetCallsStatusHook`.

### Removed
- **BREAKING:** Support updated EIP-5792 specification ([#363](https://github.com/MetaMask/eth-json-rpc-middleware/pull/363))
  - Remove `GetCallsStatusReceipt` type.
  - Remove `GetTransactionReceiptsByBatchIdHook` type.

## [15.3.0]
### Added
- Support EIP-5792 ([#357](https://github.com/MetaMask/eth-json-rpc-middleware/pull/359))
  - Add support for RPC methods:
    - `wallet_sendCalls`
    - `wallet_getCallsStatus`
    - `wallet_getCapabilities`
  - Add optional hooks to `WalletMiddlewareOptions`:
    - `getCapabilities`
    - `getTransactionReceiptsByBatchId`
    - `processSendCalls`
  - Add types:
    - `GetCallsStatusParams`
    - `GetCallsStatusReceipt`
    - `GetCallsStatusResult`
    - `GetCapabilitiesHook`
    - `GetCapabilitiesParams`
    - `GetCapabilitiesResult`
    - `GetTransactionReceiptsByBatchIdHook`
    - `ProcessSendCallsHook`
    - `SendCalls`
    - `SendCallsParams`

## [15.2.0]
### Added
- Add a way to pass an RPC service to `createFetchMiddleware` ([#357](https://github.com/MetaMask/eth-json-rpc-middleware/pull/357))
  - The new, recommended function signature is now `createFetchMiddleware({ rpcService: AbstractRpcService; options?: { originHttpHeaderKey?: string; } })`, where `AbstractRpcService` matches the same interface from `@metamask/network-controller`
  - This allows us to support automatic failover to a secondary node when the network goes down

### Changed
- Bump `@metamask/utils` to `^11.1.0` ([#358](https://github.com/MetaMask/eth-json-rpc-middleware/pull/358))

### Deprecated
- Deprecate passing an RPC endpoint to `createFetchMiddleware` ([#357](https://github.com/MetaMask/eth-json-rpc-middleware/pull/357))
  - See recommended function signature above
  - The existing signature `createFetchMiddleware({ btoa: typeof btoa; fetch: typeof fetch; rpcUrl: string; originHttpHeaderKey?: string; })` will be removed in a future major version
- Deprecate `PayloadWithOrigin` type ([#357](https://github.com/MetaMask/eth-json-rpc-middleware/pull/357))
  - There is no replacement for this type; it will be removed in a future major version.

## [15.1.2]
### Changed
- Fix validation of primary type for signTypedDataV3 and signTypedDataV4 ([#353](https://github.com/MetaMask/eth-json-rpc-middleware/pull/353))
  - It was updated to handle `undefined` input

## [15.1.1]
### Changed
- Bump `@metamask/eth-block-tracker` from `^11.0.3` to `^11.0.4` ([#351](https://github.com/MetaMask/eth-json-rpc-middleware/pull/351))
- Bump `@metamask/eth-json-rpc-provider` from `^4.1.5` to `^4.1.7` ([#351](https://github.com/MetaMask/eth-json-rpc-middleware/pull/351))
- Bump `@metamask/eth-sig-util` from `^7.0.3` to `^8.1.2` ([#351](https://github.com/MetaMask/eth-json-rpc-middleware/pull/351))
- Bump `@metamask/json-rpc-engine` from `^10.0.0` to `^10.0.2` ([#351](https://github.com/MetaMask/eth-json-rpc-middleware/pull/351))
- Bump `@metamask/rpc-errors` from `^7.0.0` to `^7.0.2` ([#351](https://github.com/MetaMask/eth-json-rpc-middleware/pull/351))
- Bump `@metamask/utils` from `^9.1.0` to `^11.0.1` ([#351](https://github.com/MetaMask/eth-json-rpc-middleware/pull/351))

## [15.1.0]
### Changed
- Improved validation of primary type for signTypedDataV3 and signTypedDataV4 ([#350](https://github.com/MetaMask/eth-json-rpc-middleware/pull/350))

## [15.0.1]
### Changed
- Bump `@metamask/eth-block-tracker` from `^11.0.1` to `^11.0.3` ([#347](https://github.com/MetaMask/eth-json-rpc-middleware/pull/347))

## [15.0.0]
### Changed
- **BREAKING**: Update `@metamask/rpc-errors` from `^6.3.1` to `^7.0.0` ([#342](https://github.com/MetaMask/eth-json-rpc-middleware/pull/342))
- **BREAKING**: Update `@metamask/json-rpc-engine` from `^9.0.2` to `^10.0.0` ([#342](https://github.com/MetaMask/eth-json-rpc-middleware/pull/342))
- Bump `@metamask/eth-json-rpc-provider` from `^4.1.1` to `^4.1.5` ([#342](https://github.com/MetaMask/eth-json-rpc-middleware/pull/342))

### Removed
- **BREAKING**: Remove `eth_sign` support ([#320](https://github.com/MetaMask/eth-json-rpc-middleware/pull/320))
  - The functions `ethSign` and `processEthSignMessage` have been removed

## [14.0.2]
### Fixed
- Allow the string "cosmos" in the "verifyingContract" field of EIP-712 signatures ([#333](https://github.com/MetaMask/eth-json-rpc-middleware/pull/333))
  - This change was made to support Ethermint's EIP-712 implementation, which was broken by validation added in v14.0.0

## [14.0.1]
### Fixed
- Request validation should not throw if verifyingContract is not defined in typed signature ([#328](https://github.com/MetaMask/eth-json-rpc-middleware/pull/328))

## [14.0.0]
### Changed
- **BREAKING:** Adapt to EIP-1193 provider changes by replacing the deprecated `sendAsync` method with the `request` method ([#317](https://github.com/MetaMask/eth-json-rpc-middleware/pull/317))
  - **BREAKING:** Refactor `providerAsMiddleware` and middleware functions `retryOnEmpty`, `block-ref` to use the `request` method.
- Bump `@metamask/eth-block-tracker` from `^10.0.0` to `^11.0.1` ([#323](https://github.com/MetaMask/eth-json-rpc-middleware/pull/323))
- Bump `@metamask/eth-json-rpc-provider` from `^4.0.0` to `^4.1.1` ([#323](https://github.com/MetaMask/eth-json-rpc-middleware/pull/323), [#317](https://github.com/MetaMask/eth-json-rpc-middleware/pull/317))
- Bump `@metamask/eth-sig-util` from `^7.0.0` to `^7.0.3` ([#323](https://github.com/MetaMask/eth-json-rpc-middleware/pull/323))
- Bump `@metamask/json-rpc-engine` from `^9.0.0` to `^9.0.2` ([#323](https://github.com/MetaMask/eth-json-rpc-middleware/pull/323))
- Bump `@metamask/rpc-errors` from `^6.0.0` to `^6.3.1` ([#323](https://github.com/MetaMask/eth-json-rpc-middleware/pull/323))
- Bump `@metamask/utils` from `^8.1.0` to `^9.1.0` ([#323](https://github.com/MetaMask/eth-json-rpc-middleware/pull/323))

### Security
- **BREAKING:** Typed signature validation only replaces `0X` prefix with `0x`, and contract address normalization is removed for decimal and octal values ([#318](https://github.com/MetaMask/eth-json-rpc-middleware/pull/318))
  - Threat actors have been manipulating `eth_signTypedData_v4` fields to cause failures in blockaid's detectors.
  - Extension crashes with an error when performing Malicious permit with a non-0x prefixed integer address.
  - This fixes an issue where the key value row or petname component disappears if a signed address is prefixed by "0X" instead of "0x".

## [13.0.0]
### Changed
- **BREAKING**: Drop support for Node.js v16; add support for Node.js v20, v22 ([#312](https://github.com/MetaMask/eth-json-rpc-middleware/pull/312))
- Update `@metamask/eth-json-rpc-provider` from `^3.0.2` to `^4.0.0` ([#313](https://github.com/MetaMask/eth-json-rpc-middleware/pull/313))
- Update `@metamask/eth-block-tracker` from `^9.0.3` to `^10.0.0` ([#313](https://github.com/MetaMask/eth-json-rpc-middleware/pull/313))
- Update `@metamask/json-rpc-engine` from `^8.0.2` to `^9.0.0` ([#313](https://github.com/MetaMask/eth-json-rpc-middleware/pull/313))

## [12.1.2]
### Fixed
- Update `@metamask/eth-block-tracker` from `^9.0.2` to `^9.0.3` ([#306](https://github.com/MetaMask/eth-json-rpc-middleware/pull/306))
  - Use updated versions of `@metamask/eth-json-rpc-engine` and `@metamask/eth-json-rpc-provider`
- Update `@metamask/eth-json-rpc-provider` from `^2.1.0` to `^3.0.2` ([#306](https://github.com/MetaMask/eth-json-rpc-middleware/pull/306))
  - Use updated version of `@metamask/eth-json-rpc-engine`
- Update `@metamask/json-rpc-engine` from `^7.1.1` to `^8.0.2` ([#306](https://github.com/MetaMask/eth-json-rpc-middleware/pull/306))
  - Maintenance updates

## [12.1.1]
### Fixed
- Update from `eth-block-tracker@^8.0.0` to `@metamask/eth-block-tracker@^9.0.2` ([#303](https://github.com/MetaMask/eth-json-rpc-middleware/pull/303))
  - Mitigates polling-loop related concurrency issue in the block tracker.

## [12.1.0]
### Added
- Add `signatureMethod` property to `MessageParams` ([#273](https://github.com/MetaMask/eth-json-rpc-middleware/pull/273))
- Add `version` property to `eth_signTypedData` message params ([#282](https://github.com/MetaMask/eth-json-rpc-middleware/pull/282))

### Changed
- Update message types ([#282](https://github.com/MetaMask/eth-json-rpc-middleware/pull/282))

## [12.0.1]
### Changed
- Bump @metamask/json-rpc-engine from 7.1.1 to 7.2.0 ([#256](https://github.com/MetaMask/eth-json-rpc-middleware/pull/256))
- Bump @metamask/utils from 8.1.0 to 8.2.0 ([#258](https://github.com/MetaMask/eth-json-rpc-middleware/pull/258))
- Bump @metamask/rpc-errors from 6.0.0 to 6.1.0 ([#253](https://github.com/MetaMask/eth-json-rpc-middleware/pull/253))
- Bump @metamask/eth-json-rpc-provider from 2.1.0 to 2.2.0 ([#252](https://github.com/MetaMask/eth-json-rpc-middleware/pull/252))
- Update `retryOnEmpty` middleware to not retry "execution reverted" errors ([#254](https://github.com/MetaMask/eth-json-rpc-middleware/pull/254))

### Fixed
- Fix `signTransaction` and `sendTransaction` so it preserves transaction data instead of overwriting it ([#263](https://github.com/MetaMask/eth-json-rpc-middleware/pull/263))

## [12.0.0]
### Changed
- **BREAKING:** Minimum Node.js version is now v16 ([#243](https://github.com/MetaMask/eth-json-rpc-middleware/pull/243))
- **BREAKING:** Bump `@metamask/utils` from `^5.0.2` to `^8.1.0` ([#241](https://github.com/MetaMask/eth-json-rpc-middleware/pull/241))
- **BREAKING:** Bump `@metamask/eth-json-rpc-provider` from `^1.0.0` to `^2.1.0` ([#245](https://github.com/MetaMask/eth-json-rpc-middleware/pull/245))
- **BREAKING:** Migrate from eth-rpc-errors `^4.0.3` to `@metamask/rpc-errors` `^6.0.0` ([#245](https://github.com/MetaMask/eth-json-rpc-middleware/pull/245))
- **BREAKING:** Migrate from json-rpc-engine `^6.1.0` to `@metamask/json-rpc-engine` `^7.1.1` ([#245](https://github.com/MetaMask/eth-json-rpc-middleware/pull/245))
- Bump `@metamask/eth-sig-util` from `^6.0.0` to `^7.0.0` ([#248](https://github.com/MetaMask/eth-json-rpc-middleware/pull/248))
- Bump `@metamask/eth-block-tracker` from `^7.0.1` to `^8.0.0` ([#245](https://github.com/MetaMask/eth-json-rpc-middleware/pull/245))
- Replace deep-cloning implemantation `clone` with `klona/full`([#250](https://github.com/MetaMask/eth-json-rpc-middleware/pull/250))

## [11.0.2]
### Changed
- Bump @metamask/eth-sig-util from ^5.0.0 to ^6.0.0 ([#236](https://github.com/MetaMask/eth-json-rpc-middleware/pull/236))

## [11.0.1]
### Changed
- Bump @metamask/utils from ^3.5.0 to ^5.0.2 ([#201](https://github.com/MetaMask/eth-json-rpc-middleware/pull/201))
- Bump eth-block-tracker from ^7.0.0 to ^7.0.1 ([#204](https://github.com/MetaMask/eth-json-rpc-middleware/pull/204))

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

[Unreleased]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v17.0.1...HEAD
[17.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v17.0.0...v17.0.1
[17.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v16.0.1...v17.0.0
[16.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v16.0.0...v16.0.1
[16.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v15.3.0...v16.0.0
[15.3.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v15.2.0...v15.3.0
[15.2.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v15.1.2...v15.2.0
[15.1.2]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v15.1.1...v15.1.2
[15.1.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v15.1.0...v15.1.1
[15.1.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v15.0.1...v15.1.0
[15.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v15.0.0...v15.0.1
[15.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v14.0.2...v15.0.0
[14.0.2]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v14.0.1...v14.0.2
[14.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v14.0.0...v14.0.1
[14.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v13.0.0...v14.0.0
[13.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v12.1.2...v13.0.0
[12.1.2]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v12.1.1...v12.1.2
[12.1.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v12.1.0...v12.1.1
[12.1.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v12.0.1...v12.1.0
[12.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v12.0.0...v12.0.1
[12.0.0]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v11.0.2...v12.0.0
[11.0.2]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v11.0.1...v11.0.2
[11.0.1]: https://github.com/MetaMask/eth-json-rpc-middleware/compare/v11.0.0...v11.0.1
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
