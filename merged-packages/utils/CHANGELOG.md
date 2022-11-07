# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MetaMask/utils/compare/v3.3.1...HEAD
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
