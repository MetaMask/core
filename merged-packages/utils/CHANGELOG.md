# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
  -  New data types added. These are `Keyring`, `Transaction` (`LegacyTransaction`, `EIP2930Transaction`, `EIP1559Transaction`), `SignedTransaction`, `Signature`, and `Eip1024EncryptedData`.

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

[Unreleased]: https://github.com/MetaMask/utils/compare/v5.0.2...HEAD
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
