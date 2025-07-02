# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [11.4.2]

### Fixed

- Improve performance of `isValidChecksumAddress` and `isValidHexAddress` functions ([#248](https://github.com/MetaMask/utils/pull/248))

## [11.4.1]

### Fixed

- Improve performance of `getChecksumAddress` function ([#246](https://github.com/MetaMask/utils/pull/246))

## [11.4.0]

### Changed

- Deprecate local `exactOptional` implementation ([#244](https://github.com/MetaMask/utils/pull/244))
  - Use the one from `@metamask/superstruct@>=3.2.0` instead.

## [11.3.0]

### Added

- Add default JSON-RPC generics that extend `Json` to `Json` ([#241](https://github.com/MetaMask/utils/pull/241))

### Changed

- Deprecate `Keyring` types ([#236](https://github.com/MetaMask/utils/pull/236))
  - These should now be imported from `@metamask/keyring-utils`.

## [11.2.0]

### Added

- Add optional `signEip7702Authorization` method to `Keyring` type ([#231](https://github.com/MetaMask/utils/pull/231))

## [11.1.0]

### Added

- Add additional CAIP-19 types (`CaipAsset{Namespace,Reference,TokenId}` support ([#227](https://github.com/MetaMask/utils/pull/227))
- Add CAIP-19 `CaipAssetTypeOrId` ([#229](https://github.com/MetaMask/utils/pull/229))
  - This one combines both `CaipAssetType` and `CaipAssetId` to avoid relying on `superstruct.union`, resulting in better error messages.
- Add `definePattern` superstruct helper ([#228](https://github.com/MetaMask/utils/pull/228))
  - Allow to define a `superstruct.pattern` while naming the struct and enforcing its type.

### Changed

- Use named structs for all CAIP types ([#228](https://github.com/MetaMask/utils/pull/228))

## [11.0.1]

### Fixed

- Improve error message for invalid JSON values ([#224](https://github.com/MetaMask/utils/pull/224))

## [11.0.0]

### Changed

- **BREAKING:** `generateRandomMnemonic` now returns `Promise<void>` instead of `void` ([#222](https://github.com/MetaMask/utils/pull/222))

## [10.0.1]

### Added

- Add Solana CAIP namespace ([#219](https://github.com/MetaMask/utils/pull/219))

## [10.0.0]

### Changed

- **BREAKING:** Drop support for Node.js versions 16, 21 ([#212](https://github.com/MetaMask/utils/pull/212))
- Improve JSON validation performance ([#218](https://github.com/MetaMask/utils/pull/218))

## [9.3.0]

### Added

- Add support for CAIP-19 ([#183](https://github.com/MetaMask/utils/pull/183))
- Add `Bip122` member to `KnownCaipNamespace` ([#213](https://github.com/MetaMask/utils/pull/213))

## [9.2.1]

### Fixed

- Fix wrong types for CAIP-2 and CAIP-10 structs ([#210](https://github.com/MetaMask/utils/pull/210))

## [9.2.0]

### Added

- Add `Wallet` member to `KnownCaipNamespace` enum ([#207](https://github.com/MetaMask/utils/pull/207))

## [9.1.0]

### Added

- Add `PublicInterface` type ([#197](https://github.com/MetaMask/utils/pull/197))

## [9.0.0]

### Changed

- **BREAKING:** The return types of functions `getChecksumAddress`, `numberToHex`, `bigIntToHex` are narrowed from `string` to `Hex` ([#193](https://github.com/MetaMask/utils/pull/193))

### Fixed

- Bump `@metamask/superstruct` from `^3.0.0` to `^3.1.0` ([#194](https://github.com/MetaMask/utils/pull/194))
  - If `@metamask/utils` `<=8.5.0` is used with `@metamask/superstruct` `>=3.1.0` the following error may be encountered:
  ```ts
  error TS2742: The inferred type of 'ExampleType' cannot be named without a reference to '@metamask/utils/node_modules/@metamask/superstruct'. This is likely not portable. A type annotation is necessary.
  ```
  This can be resolved by updating `@metamask/utils` to `>=9.0.0`.

## [8.5.0]

### Changed

- Bump dependency `semver` from `^5.7.1` to `^7.6.0` ([#181](https://github.com/MetaMask/utils/pull/181)).

### Fixed

- Replace dependency `superstruct` `^1.0.3` with ESM-compatible `@metamask/superstruct` `^3.0.0` ([#185](https://github.com/MetaMask/utils/pull/185)).
  - This fixes the issue of this package being unusable by any TypeScript project that uses `Node16` or `NodeNext` as its `moduleResolution` option.
- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#182](https://github.com/MetaMask/utils/pull/182))
  - Previously, this package shipped with only one variant of type declaration files, and these files were only CommonJS-compatible, and the `exports` field in `package.json` linked to these files. This is an anti-pattern and was rightfully flagged by the ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md). All of the ATTW checks now pass.
- Remove chunk files ([#182](https://github.com/MetaMask/utils/pull/182)).
  - Previously, the build tool we used to generate JavaScript files extracted common code to "chunk" files. While this was intended to make this package more tree-shakeable, it also made debugging more difficult for our development teams. These chunk files are no longer present.

## [8.4.0]

### Added

- Add `toCaipChainId` utility function ([#175](https://github.com/MetaMask/utils/pull/175))
- Add `KnownCaipNamespace` enum ([#175](https://github.com/MetaMask/utils/pull/175))

### Changed

- Update docs for `createDeferredPromise` to caution against using `suppressUnhandledRejection` ([#174](https://github.com/MetaMask/utils/pull/174))

### Fixed

- Fix `createSandbox` to assign a unique name to the sandbox directory, so that it can be used in multiple concurrently running Jest tests ([#171](https://github.com/MetaMask/utils/pull/171))

## [8.3.0]

### Added

- Add `createDeferredPromise` ([#164](https://github.com/MetaMask/utils/pull/164))

## [8.2.1]

### Fixed

- Fix issue with source maps where line numbers were incorrect for src/error.ts ([#156](https://github.com/MetaMask/utils/pull/156))

## [8.2.0]

### Added

- Add struct utils for validating JSON objects with optional values ([#136](https://github.com/MetaMask/utils/pull/136))
- Add filesystem utils ([#148](https://github.com/MetaMask/utils/pull/148))
- Add error utils ([#146](https://github.com/MetaMask/utils/pull/146), [#151](https://github.com/MetaMask/utils/pull/151))
- Add base64 encoding and decoding functions ([#145](https://github.com/MetaMask/utils/pull/145))

### Changed

- Use `tsup` for bundling ([#144](https://github.com/MetaMask/utils/pull/144))
  - This makes the package fully compliant with ES modules.
- Bump `@ethereumjs/tx` from `4.1.2` to `4.2.0` ([#133](https://github.com/MetaMask/utils/pull/133))

## [8.1.0]

### Changed

- Make types for JSON-RPC-related structs more accurate ([#134](https://github.com/MetaMask/utils/pull/134))
  - Aligning `JsonRpcParams` to be optional, yet not `undefined`.
  - Updated types:
    - `InferWithParams`
    - `JsonRpcNotificationStruct`
    - `JsonRpcParamsStruct`
    - `JsonRpcRequestStruct`

## [8.0.0]

### Changed

- **BREAKING:** `JsonRpcParams` type no longer accepts `undefined` as value, as `undefined` is not a valid JSON type ([#130](https://github.com/MetaMask/utils/pull/130))

## [7.1.0]

### Added

- Add CAIP-2 and CAIP-10 types ([#116](https://github.com/MetaMask/utils/pull/116))

## [7.0.0]

### Added

- Add `getKnownPropertyNames` function ([#111](https://github.com/MetaMask/utils/pull/111))

### Changed

- **BREAKING:** Build the package as both CJS and ESM ([#115](https://github.com/MetaMask/utils/pull/115), [#124](https://github.com/MetaMask/utils/pull/124))
  - It's no longer possible to import from the `dist` folder. Everything must be imported from `@metamask/utils`.
- Bump `semver` to `^7.5.4` ([#123](https://github.com/MetaMask/utils/pull/123))

## [6.2.0]

### Added

- Add address related utils ([#112](https://github.com/MetaMask/utils/pull/112))
  - `isValidHexAddress` has been added to check the validity of an hex address
  - `getChecksumAddress` has been added to calculate the ERC-55 mixed-case checksum of an hex address
  - `isValidChecksumAddress` has been added to check the validity of an ERC-55 mixed-case checksum address

## [6.1.0]

### Added

- Add optional `destroy` method to `Keyring` type ([#108](https://github.com/MetaMask/utils/pull/108))

## [6.0.1]

### Fixed

- Strip `__proto__` and `constructor` JSON properties in `getSafeJson` ([#105](https://github.com/MetaMask/utils/pull/105))

## [6.0.0]

### Changed

- **BREAKING:** Bump minimum Node version to 16 ([#102](https://github.com/MetaMask/utils/pull/102))
- **BREAKING:** Target `ES2020` ([#102](https://github.com/MetaMask/utils/pull/102))

### Fixed

- Fix JSON validation security issue ([#103](https://github.com/MetaMask/utils/pull/103))
  - This adds a new function `getSafeJson` which validates and returns sanitized JSON.

## [5.0.2]

### Changed

- The `Keyring` exposes a new optional method `init` ([#99](https://github.com/MetaMask/utils/pull/99))

### Fixed

- Bump `@ethereumjs/tx` to `4.1.2` to address runtime compatibility issues ([#100](https://github.com/MetaMask/utils/pull/100))

## [5.0.1]

### Fixed

- Keep original type when using `hasProperty` if defined ([#94](https://github.com/MetaMask/utils/pull/94))

## [5.0.0]

### Changed

- **BREAKING:** Update `Keyring` type ([#89](https://github.com/MetaMask/utils/pull/89))
  - The `Keyring` class now uses the data types `TypedTransaction` and `TxData` from `@ethereumjs/tx` (`v4.1.1`).
  - The `Keyring` now exposes a new optional method called `generateRandomMnemonic`.

## [4.0.0]

### Changed

- Export new modules (`keyring`, `transaction-types`, and `encryption-types`) ([#86](https://github.com/MetaMask/utils/pull/86))
- **BREAKING:** Improve JSON validation ([#85](https://github.com/MetaMask/utils/pull/85))
  - Fixes edge cases in our JSON validation logic.
  - The previous function used for JSON validation (`validateJsonAndGetSize`) was removed.
    - The `isValidJson` function now uses the new JSON validation logic.
    - To get the size of a JSON value, you can use the `getJsonSize` function.

## [3.6.0]

### Added

- Add `Keyring` types ([#74](https://github.com/MetaMask/utils/pull/74))
  - New data types added. These are `Keyring`, `Transaction` (`LegacyTransaction`, `EIP2930Transaction`, `EIP1559Transaction`), `SignedTransaction`, `Signature`, and `Eip1024EncryptedData`.

## [3.5.0]

### Changed

- Improve the `hasProperty` function ([#79](https://github.com/MetaMask/utils/pull/79), [#80](https://github.com/MetaMask/utils/pull/80))
  - This function now acts as a type guard, informing TypeScript that the property exists.
  - The function is now compatible with more types of objects, such as Errors and class instances.

## [3.4.1]

### Fixed

- Bump `superstruct` to `^1.0.3` ([#71](https://github.com/MetaMask/utils/pull/71))

## [3.4.0]

### Added

- Add types and utility functions for validating versions and checksums ([#67](https://github.com/MetaMask/utils/pull/67), [#69](https://github.com/MetaMask/utils/pull/69))

### Fixed

- JSON-RPC types now have a default generic `Params` value ([#54](https://github.com/MetaMask/utils/pull/54))

## [3.3.1]

### Fixed

- JSON-RPC parameters are now properly cast to Json upon validation ([#51](https://github.com/MetaMask/utils/pull/51))

## [3.3.0]

### Added

- Add more assertion utils ([#49](https://github.com/MetaMask/utils/pull/49))
- Add JSON-RPC error validation functions ([#46](https://github.com/MetaMask/utils/pull/46))
- Add convenience function for creating a `DataView` ([#45](https://github.com/MetaMask/utils/pull/45))

### Fixed

- Update JSON validation logic ([#47](https://github.com/MetaMask/utils/pull/47))
  - Validation would previously allow for `undefined` values, which is not a standard JSON type

## [3.2.0]

### Added

- Add `PendingJsonRpcResponse` type ([#43](https://github.com/MetaMask/utils/pull/43))
- Add utils for converting between numbers and hex ([#41](https://github.com/MetaMask/utils/pull/41))
- Add coercion utils ([#38](https://github.com/MetaMask/utils/pull/38))

## [3.1.0]

### Added

- Add assertion utils ([#33](https://github.com/MetaMask/utils/pull/33))
- Add util functions for encoding and decoding bytes ([#34](https://github.com/MetaMask/utils/pull/34))

### Fixed

- Make JSON-RPC error `data` property optional ([#31](https://github.com/MetaMask/utils/pull/31))
- Don't include test files in dist folder ([#35](https://github.com/MetaMask/utils/pull/35))
- Fix typo in README ([#28](https://github.com/MetaMask/utils/pull/28))

## [3.0.3]

### Fixed

- Allow omitting JSON-RPC params when params can be undefined ([#29](https://github.com/MetaMask/utils/pull/29))

## [3.0.2]

### Fixed

- Bump `superstruct` to ^0.16.5 ([#26](https://github.com/MetaMask/utils/pull/26))
  - `superstruct`s 0.16.1 through 0.16.4 were not compatible with Node 14; this restores that compatibility.

## [3.0.1]

### Fixed

- Promote `@types/debug` from development dependencies to production dependencies ([#23](https://github.com/MetaMask/utils/pull/23))

## [3.0.0]

### Added

- Add logging functions ([#20](https://github.com/MetaMask/utils/pull/20))
- Add frozen collections (implemented in [#5](https://github.com/MetaMask/utils/pull/5) but exported in [#19](https://github.com/MetaMask/utils/pull/19))

### Changed

- **BREAKING:** Improve types and type validation ([#19](https://github.com/MetaMask/utils/pull/19))
  - Various type changes have been made that might be breaking:
    - The `JsonRpcRequest` and `JsonRpcNotification` types now include a generic constraint requiring that the `Params` type extends the `JsonRpcParams` type.
    - The `JsonRpcSuccess` and `JsonRpcResponse` types now include a generic contraint for the `Result` type, requiring that it extends the `Json` type.
    - Various validation functions now accept `unknown` parameters rather than specific types. This should not be breaking except that it may affect type inference for the parameters passed in.
  - New JSON-related functions have been added:
    - `assertIsJsonRpcResponse`
    - `isJsonRpcResponse`
    - `InferWithParams`
    - `JsonRpcParams`
  - New JSON Struct types have been added:
    - `JsonRpcErrorStruct`
    - `JsonRpcFailureStruct`
    - `JsonRpcIdStruct`
    - `JsonRpcParamsStruct`
    - `JsonRpcRequestStruct`
    - `JsonRpcResponseStruct`
    - `JsonRpcSuccessStruct`
    - `JsonRpcVersionStruct`
    - `JsonStruct`

## [2.1.0]

### Added

- Add JSON storage validation and limit utilities ([#14](https://github.com/MetaMask/utils/pull/14))
  - Adds a new function `validateJsonAndGetSize`.

## [2.0.0]

### Added

- Add more JSON utils ([#8](https://github.com/MetaMask/utils/pull/8))

### Changed

- **BREAKING:** Refactor and expand time utils ([#9](https://github.com/MetaMask/utils/pull/9))
  - Adds a new function, `inMilliseconds`, and moves the time constants into a TypeScript `enum`.

## [1.0.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/utils/compare/v11.4.2...HEAD
[11.4.2]: https://github.com/MetaMask/utils/compare/v11.4.1...v11.4.2
[11.4.1]: https://github.com/MetaMask/utils/compare/v11.4.0...v11.4.1
[11.4.0]: https://github.com/MetaMask/utils/compare/v11.3.0...v11.4.0
[11.3.0]: https://github.com/MetaMask/utils/compare/v11.2.0...v11.3.0
[11.2.0]: https://github.com/MetaMask/utils/compare/v11.1.0...v11.2.0
[11.1.0]: https://github.com/MetaMask/utils/compare/v11.0.1...v11.1.0
[11.0.1]: https://github.com/MetaMask/utils/compare/v11.0.0...v11.0.1
[11.0.0]: https://github.com/MetaMask/utils/compare/v10.0.1...v11.0.0
[10.0.1]: https://github.com/MetaMask/utils/compare/v10.0.0...v10.0.1
[10.0.0]: https://github.com/MetaMask/utils/compare/v9.3.0...v10.0.0
[9.3.0]: https://github.com/MetaMask/utils/compare/v9.2.1...v9.3.0
[9.2.1]: https://github.com/MetaMask/utils/compare/v9.2.0...v9.2.1
[9.2.0]: https://github.com/MetaMask/utils/compare/v9.1.0...v9.2.0
[9.1.0]: https://github.com/MetaMask/utils/compare/v9.0.0...v9.1.0
[9.0.0]: https://github.com/MetaMask/utils/compare/v8.5.0...v9.0.0
[8.5.0]: https://github.com/MetaMask/utils/compare/v8.4.0...v8.5.0
[8.4.0]: https://github.com/MetaMask/utils/compare/v8.3.0...v8.4.0
[8.3.0]: https://github.com/MetaMask/utils/compare/v8.2.1...v8.3.0
[8.2.1]: https://github.com/MetaMask/utils/compare/v8.2.0...v8.2.1
[8.2.0]: https://github.com/MetaMask/utils/compare/v8.1.0...v8.2.0
[8.1.0]: https://github.com/MetaMask/utils/compare/v8.0.0...v8.1.0
[8.0.0]: https://github.com/MetaMask/utils/compare/v7.1.0...v8.0.0
[7.1.0]: https://github.com/MetaMask/utils/compare/v7.0.0...v7.1.0
[7.0.0]: https://github.com/MetaMask/utils/compare/v6.2.0...v7.0.0
[6.2.0]: https://github.com/MetaMask/utils/compare/v6.1.0...v6.2.0
[6.1.0]: https://github.com/MetaMask/utils/compare/v6.0.1...v6.1.0
[6.0.1]: https://github.com/MetaMask/utils/compare/v6.0.0...v6.0.1
[6.0.0]: https://github.com/MetaMask/utils/compare/v5.0.2...v6.0.0
[5.0.2]: https://github.com/MetaMask/utils/compare/v5.0.1...v5.0.2
[5.0.1]: https://github.com/MetaMask/utils/compare/v5.0.0...v5.0.1
[5.0.0]: https://github.com/MetaMask/utils/compare/v4.0.0...v5.0.0
[4.0.0]: https://github.com/MetaMask/utils/compare/v3.6.0...v4.0.0
[3.6.0]: https://github.com/MetaMask/utils/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/MetaMask/utils/compare/v3.4.1...v3.5.0
[3.4.1]: https://github.com/MetaMask/utils/compare/v3.4.0...v3.4.1
[3.4.0]: https://github.com/MetaMask/utils/compare/v3.3.1...v3.4.0
[3.3.1]: https://github.com/MetaMask/utils/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/MetaMask/utils/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/MetaMask/utils/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/MetaMask/utils/compare/v3.0.3...v3.1.0
[3.0.3]: https://github.com/MetaMask/utils/compare/v3.0.2...v3.0.3
[3.0.2]: https://github.com/MetaMask/utils/compare/v3.0.1...v3.0.2
[3.0.1]: https://github.com/MetaMask/utils/compare/v3.0.0...v3.0.1
[3.0.0]: https://github.com/MetaMask/utils/compare/v2.1.0...v3.0.0
[2.1.0]: https://github.com/MetaMask/utils/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/MetaMask/utils/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/MetaMask/utils/releases/tag/v1.0.0
