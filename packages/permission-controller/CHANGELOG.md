# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [7.1.0]
### Added
- Add `SubjectMetadataController:addSubjectMetadata` action ([#3733](https://github.com/MetaMask/core/pull/3733))

## [7.0.0]
### Changed
- **BREAKING:** Bump `@metamask/approval-controller` peer dependency from `^5.0.0` to `^5.1.1` ([#3680](https://github.com/MetaMask/core/pull/3680), [#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/base-controller` to `^4.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695))
- Bump `@metamask/controller-utils` to `^8.0.1` ([#3695](https://github.com/MetaMask/core/pull/3695), [#3678](https://github.com/MetaMask/core/pull/3678), [#3667](https://github.com/MetaMask/core/pull/3667), [#3580](https://github.com/MetaMask/core/pull/3580))
- Bump `@metamask/json-rpc-engine` to `^7.3.1` ([#3695](https://github.com/MetaMask/core/pull/3695))

### Fixed
- Remove `@metamask/approval-controller` dependency ([#3607](https://github.com/MetaMask/core/pull/3607))

## [6.0.0]
### Added
- Add new handler to `permissionRpcMethods.handlers` for `wallet_revokePermissions` RPC method ([#1889](https://github.com/MetaMask/core/pull/1889))

### Changed
- **BREAKING:** Bump `@metamask/base-controller` to ^4.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
  - This is breaking because the type of the `messenger` has backward-incompatible changes. See the changelog for this package for more.
- **BREAKING:** Update `PermittedRpcMethodHooks` type so it must support signature for `wallet_revokePermission` hook ([#1889](https://github.com/MetaMask/core/pull/1889))
- Bump `@metamask/approval-controller` to ^5.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))
- Bump `@metamask/controller-utils` to ^6.0.0 ([#2063](https://github.com/MetaMask/core/pull/2063))

## [5.0.1]
### Changed
- Bump `@metamask/json-rpc-engine` from `^7.1.0` to `^7.2.0` ([#1895](https://github.com/MetaMask/core/pull/1895))
- Bump dependency on `@metamask/rpc-errors` to ^6.1.0 ([#1653](https://github.com/MetaMask/core/pull/1653))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.1
- Bump `@metamask/utils` from `8.1.0` to `8.2.0` ([#1957](https://github.com/MetaMask/core/pull/1957))
- Bump `@metamask/auto-changelog` from `^3.2.0` to `^3.4.3` ([#1870](https://github.com/MetaMask/core/pull/1870), [#1905](https://github.com/MetaMask/core/pull/1905), [#1997](https://github.com/MetaMask/core/pull/1997))

## [5.0.0]
### Changed
- **BREAKING:** Remove `undefined` from RestrictedMethodParameters type union and from type parameter for RestrictedMethodOptions ([#1749])(https://github.com/MetaMask/core/pull/1749))
- **BREAKING:** Update from `json-rpc-engine@^6.1.0` to `@metamask/json-rpc-engine@^7.1.1` ([#1749])(https://github.com/MetaMask/core/pull/1749))
- Update from `eth-rpc-errors@^4.0.2` to `@metamask/rpc-errors@^6.0.0` ([#1749])(https://github.com/MetaMask/core/pull/1749))
- Bump dependency on `@metamask/utils` to ^8.1.0 ([#1639](https://github.com/MetaMask/core/pull/1639))
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^4.0.0
- Bump dependency on `@metamask/base-controller` to ^3.2.3
- Bump dependency on `@metamask/controller-utils` to ^5.0.2

## [4.1.2]
### Changed
- Update TypeScript to v4.8.x ([#1718](https://github.com/MetaMask/core/pull/1718))
- Bump dependency on `@metamask/controller-utils` to ^5.0.0

## [4.1.1]
### Changed
- Bump dependency and peer dependency on `@metamask/approval-controller` to ^3.5.1
- Bump dependency on `@metamask/base-controller` to ^3.2.1
- Bump dependency on `@metamask/controller-utils` to ^4.3.2

## [4.1.0]
### Changed
- Update `@metamask/utils` to `^6.2.0` ([#1514](https://github.com/MetaMask/core/pull/1514))

## [4.0.1]
### Fixed
- Fix permissions RPC method types ([#1464](https://github.com/MetaMask/core/pull/1464))
  - The RPC method handlers were mistakenly typed as an array rather than a tuple

## [4.0.0]
### Changed
- **BREAKING:** Bump to Node 16 ([#1262](https://github.com/MetaMask/core/pull/1262))
- **BREAKING:** Update `@metamask/approval-controller` dependency and peer dependency
- The export `permissionRpcMethods` has a slightly different type; the second generic type variable of the `getPermissions` handler is now `undefined` rather than `void` ([#1372](https://github.com/MetaMask/core/pull/1372))
- Add `@metamask/utils` dependency ([#1275](https://github.com/MetaMask/core/pull/1275))
- Remove `@metamask/types` dependency ([#1372](https://github.com/MetaMask/core/pull/1372))
- Change type of constructor parameter `unrestrictedMethods` to be readonly ([#1395](https://github.com/MetaMask/core/pull/1395))

### Removed
- **BREAKING**: Remove namespaced permissions ([#1337](https://github.com/MetaMask/core/pull/1337))
  - Namespaced permissions are no longer supported. Consumers should replace namespaced permissions with equivalent caveat-based implementations.
- **BREAKING**: Remove `targetKey` concept ([#1337](https://github.com/MetaMask/core/pull/1337))
  - The target key/name distinction only existed to support namespaced permissions, which are removed as of this release. Henceforth, permissions only have "names".
  - The `targetKey` property of permission specifications has been renamed to `targetName`.

## [3.2.0]
### Added
- Allow restricting permissions by subject type ([#1233](https://github.com/MetaMask/core/pull/1233))

### Changed
- Move `SubjectMetadataController` to permission-controller package ([#1234](https://github.com/MetaMask/core/pull/1234))
- Update minimum `eth-rpc-errors` version from `4.0.0` to `4.0.2` ([#1215](https://github.com/MetaMask/core/pull/1215))

## [3.1.0]
### Added
- Add side-effects to permissions ([#1069](https://github.com/MetaMask/core/pull/1069))

## [3.0.0]
### Removed
- **BREAKING:** Remove `isomorphic-fetch` ([#1106](https://github.com/MetaMask/controllers/pull/1106))
  - Consumers must now import `isomorphic-fetch` or another polyfill themselves if they are running in an environment without `fetch`

## [2.0.0]
### Added
- Add `updateCaveat` action ([#1071](https://github.com/MetaMask/core/pull/1071))

### Changed
- **BREAKING:** Update `@metamask/network-controller` peer dependency to v3 ([#1041](https://github.com/MetaMask/controllers/pull/1041))
- Rename this repository to `core` ([#1031](https://github.com/MetaMask/controllers/pull/1031))
- Update `@metamask/controller-utils` package ([#1041](https://github.com/MetaMask/controllers/pull/1041))

## [1.0.2]
### Fixed
- This package will now warn if a required package is not present ([#1003](https://github.com/MetaMask/core/pull/1003))

## [1.0.1]
### Changed
- Relax dependencies on `@metamask/approval-controller`, `@metamask/base-controller` and `@metamask/controller-utils` (use `^` instead of `~`) ([#998](https://github.com/MetaMask/core/pull/998))

## [1.0.0]
### Added
- Initial release
  - As a result of converting our shared controllers repo into a monorepo ([#831](https://github.com/MetaMask/core/pull/831)), we've created this package from select parts of [`@metamask/controllers` v33.0.0](https://github.com/MetaMask/core/tree/v33.0.0), namely:
    - Everything in `src/permissions`

    All changes listed after this point were applied to this package following the monorepo conversion.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@7.1.0...HEAD
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@7.0.0...@metamask/permission-controller@7.1.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@6.0.0...@metamask/permission-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@5.0.1...@metamask/permission-controller@6.0.0
[5.0.1]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@5.0.0...@metamask/permission-controller@5.0.1
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@4.1.2...@metamask/permission-controller@5.0.0
[4.1.2]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@4.1.1...@metamask/permission-controller@4.1.2
[4.1.1]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@4.1.0...@metamask/permission-controller@4.1.1
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@4.0.1...@metamask/permission-controller@4.1.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@4.0.0...@metamask/permission-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@3.2.0...@metamask/permission-controller@4.0.0
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@3.1.0...@metamask/permission-controller@3.2.0
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@3.0.0...@metamask/permission-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@2.0.0...@metamask/permission-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@1.0.2...@metamask/permission-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@1.0.1...@metamask/permission-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/permission-controller@1.0.0...@metamask/permission-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/permission-controller@1.0.0
