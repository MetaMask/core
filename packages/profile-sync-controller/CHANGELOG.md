# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]

### Added

- Add and export object `USER_STORAGE_SCHEMA`, function `getFeatureAndKeyFromPath`, and type `UserStoragePath` ([#4543](https://github.com/MetaMask/core/pull/4543))
- Add `connectSnap` method to the `JwtBearerAuth` class for connecting to snap after initializing the Profile Sync SDK ([#4560](https://github.com/MetaMask/core/pull/4560))

### Changed

- **BREAKING:** Enforce `UserStorageSchema` usage in all functions that get or set user storage ([#4543](https://github.com/MetaMask/core/pull/4543))
  - Keeps user storage entries consistent, and improves DX for consumers of user storage.
  - **BREAKING:** Remove `entryKey` function parameter from `performGetStorage` and `performSetStorage` methods of `UserStorageController`, and replace with `path` parameter of type `UserStoragePath`.
  - **BREAKING:** Remove `entryKey` function parameter from `createEntryPath`, and replace with `path` parameter of type `UserStoragePath`.
  - **BREAKING:** Remove `entryKey` property from type `UserStorageOptions`, and replace with `path` property of type `UserStoragePath`.
- **BREAKING:** Bump peerDependency `@metamask/snaps-controllers` from `^8.1.1` to `^9.3.0` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Remove `@metamask/snaps-controllers` dependency [#4556](https://github.com/MetaMask/core/pull/4556)
  - This was listed under `peerDependencies` already, so it was redundant as a dependency.
- Widen `isProfileSyncingEnabled` property of the `UserStorageControllerState` type from `boolean` to `boolean | null` ([#4551](https://github.com/MetaMask/core/pull/4551))
- Upgrade TypeScript version to `~5.0.4` and set `moduleResolution` option to `Node16` ([#3645](https://github.com/MetaMask/core/pull/3645))
- Bump `@metamask/base-controller` from `^6.0.1` to `^6.0.2` ([#4544](https://github.com/MetaMask/core/pull/4544))
- Bump `@metamask/snaps-sdk` from `^4.2.0` to `^6.1.1` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4547](https://github.com/MetaMask/core/pull/4547))
- Add new dependency `@metamask/snaps-utils` ([#3645](https://github.com/MetaMask/core/pull/3645), [#4547](https://github.com/MetaMask/core/pull/4547))

### Removed

- Remove object `USER_STORAGE_ENTRIES` and type `UserStorageEntryKeys` ([#4543](https://github.com/MetaMask/core/pull/4543))

## [0.1.4]

### Added

- added `LoginResponse` validation in profile syncing SDK ([#4541](https://github.com/MetaMask/core/pull/4541))

- added snap caching when calling the message signing snap ([#4532](https://github.com/MetaMask/core/pull/4532))

### Removed

- removed a server-side node dependency from profile-sync-sdk ([#4539](https://github.com/MetaMask/core/pull/4539))

### Fixed

- removed a catch statement call in AuthenticationController to prevent infinite crashes. ([#4533](https://github.com/MetaMask/core/pull/4533))

## [0.1.3]

### Changed

- Switch ethers to a devDependency ([#4518](https://github.com/MetaMask/core/pull/4518))

## [0.1.2]

### Added

- added platform field when logging in to receive correct OIDC access token ([#4480](https://github.com/MetaMask/core/pull/4480))

- added metametrics validation in constructor ([#4480](https://github.com/MetaMask/core/pull/4480))

### Changed

- updated the `getMetaMetricsId` interface to support async calls to metametrics ID ([#4477](https://github.com/MetaMask/core/pull/4477))

## [0.1.1]

### Added

- export `defaultState` for `AuthenticationController` and `UserStorageController`. ([#4441](https://github.com/MetaMask/core/pull/4441))

### Changed

- `AuthType`, `Env`, `Platform` are changed from const enums to enums ([#4441](https://github.com/MetaMask/core/pull/4441))

## [0.1.0]

### Added

- Initial release

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.4...@metamask/profile-sync-controller@0.2.0
[0.1.4]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.3...@metamask/profile-sync-controller@0.1.4
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.2...@metamask/profile-sync-controller@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.1...@metamask/profile-sync-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.0...@metamask/profile-sync-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-sync-controller@0.1.0
