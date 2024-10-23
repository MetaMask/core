# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.7]

### Added

- add support for DELETE ONE endpoint ([#4776](https://github.com/MetaMask/core/pull/4776))

### Fixed

- imported accounts won't be synced anymore by account syncing ([#4777](https://github.com/MetaMask/core/pull/4777))

## [0.9.6]

### Added

- add DELETE endpoint support ([#4758](https://github.com/MetaMask/core/pull/4758))

## [0.9.5]

### Fixed

- **BREAKING** react native scrypt now takes a `UInt8Array` password argument instead of a `string` ([#4755](https://github.com/MetaMask/core/pull/4755))

## [0.9.4]

### Fixed

- Account syncing performance issues and bugs ([#4746](https://github.com/MetaMask/core/pull/4746))
  - Batch `GET` / `PUT` will now encrypt and decrypt sequentially in order to leverage the in-memory cache
  - `nameLastUpdatedAt` will stop being saved to user storage if account name is a default name
  - `waitForExpectedValue` has been removed and will stop waiting for `AccountsController:accountAdded` callback
  - `randomBytes` leftover from sync -> async encryption migration was removed

## [0.9.3]

### Fixed

- Only fire `onAccountNameUpdated` when account name has changed ([#4735](https://github.com/MetaMask/core/pull/4735))

## [0.9.2]

### Changed

- Bump accounts related packages ([#4713](https://github.com/MetaMask/core/pull/4713)), ([#4728](https://github.com/MetaMask/core/pull/4728))
  - Those packages are now built slightly differently and are part of the [accounts monorepo](https://github.com/MetaMask/accounts).
  - Bump `@metamask/keyring-api` from `^8.1.0` to `^8.1.4`

## [0.9.1]

### Changed

- improve account syncing performance ([#4726](https://github.com/MetaMask/core/pull/4726))
  - check if `isEvmAccountType` before saving an account in user storage in account syncing
  - check for correct `KeyringType` before saving an account in user storage in account syncing
  - wait for `AccountsController:accountAdded` event to fire before adding another account in account syncing
- update 'eth-{simple,hd,snap}-keyring' + 'keyring-api' ([#4713](https://github.com/MetaMask/core/pull/4713))

## [0.9.0]

### Added

- add batch PUT endpoint for account syncing ([#4724](https://github.com/MetaMask/core/pull/4724))
- add batch PUT endpoint support ([#4723](https://github.com/MetaMask/core/pull/4723))

## [0.8.1]

### Changed

- move and organize shared profile sync dependencies ([#4717](https://github.com/MetaMask/core/pull/4717))

### Fixed

- fix: profile-sync-controller mobile compilation issues ([#4721](https://github.com/MetaMask/core/pull/4721))
  - mobile does not support exported async arrow functions, so needed to convert these into normal async functions

## [0.8.0]

### Fixed

- **BREAKING** update profile-sync notification settings path hash ([#4711](https://github.com/MetaMask/core/pull/4711))
  - changing this path also means the underlying storage hash has changed. But this will align with our existing solutions that are in prod.

## [0.7.0]

### Changed

- update subpath exports to use new .d.cts definition files. ([#4709](https://github.com/MetaMask/core/pull/4709))
- move profile-sync-sdk snap methods to snap auth class ([#4708](https://github.com/MetaMask/core/pull/4708))
  - move and validate `connectSnap` and `isSnapConnected` methods to only be available for SRP auth.

### Removed

- test: remove unused test mock ([#4703](https://github.com/MetaMask/core/pull/4703))

## [0.6.0]

### Added

- Add network synchronisation logic ([#4694](https://github.com/MetaMask/core/pull/4694), [#4687](https://github.com/MetaMask/core/pull/4687), [#4685](https://github.com/MetaMask/core/pull/4685), [#4684](https://github.com/MetaMask/core/pull/4684))
- Add a `canSync` check for account synchronisation ([#4690](https://github.com/MetaMask/core/pull/4690))
- Add `onAccountAdded` and `onAccountNameUpdated` events to `UserStorageController` ([#4707](https://github.com/MetaMask/core/pull/4707))

### Changed

- Bump `@metamask/snaps-sdk` from `^6.1.1` to `^6.5.0` ([#4689](https://github.com/MetaMask/core/pull/4689))
- Bump `@metamask/snaps-utils` from `^7.8.1` to `^8.1.1` ([#4689](https://github.com/MetaMask/core/pull/4689))
- Bump peer dependency `@metamask/snaps-controllers` from `^9.3.0` to `^9.7.0` ([#4689](https://github.com/MetaMask/core/pull/4689))

### Removed

- **BREAKING:** Remove `getAccountByAddress` action ([#4693](https://github.com/MetaMask/core/pull/4693))

### Fixed

- Produce and export ESM-compatible TypeScript type declaration files in addition to CommonJS-compatible declaration files ([#4648](https://github.com/MetaMask/core/pull/4648))
  - Previously, this package shipped with only one variant of type declaration
    files, and these files were only CommonJS-compatible, and the `exports`
    field in `package.json` linked to these files. This is an anti-pattern and
    was rightfully flagged by the
    ["Are the Types Wrong?"](https://arethetypeswrong.github.io/) tool as
    ["masquerading as CJS"](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseCJS.md).
    All of the ATTW checks now pass.
- Remove chunk files ([#4648](https://github.com/MetaMask/core/pull/4648)).
  - Previously, the build tool we used to generate JavaScript files extracted
    common code to "chunk" files. While this was intended to make this package
    more tree-shakeable, it also made debugging more difficult for our
    development teams. These chunk files are no longer present.
- Remove extra slash when constructing user storage url ([#4702](https://github.com/MetaMask/core/pull/4702))
- Await encryption promise ([#4705](https://github.com/MetaMask/core/pull/4705))

## [0.5.0]

### Added

- add isSnapConnected method to the Authentication SDK ([#4668](https://github.com/MetaMask/core/pull/4668))
- add `accountAdded` and `accountRenamed` events when triggering account syncing ([#4665](https://github.com/MetaMask/core/pull/4665))
- prevent accounts controller events being used when sync is in progress ([#4675](https://github.com/MetaMask/core/pull/4675))
  - add `isAccountSyncingInProgress` to `UserStorageController`
  - add `isAccountSyncingInProgress` checks to abort processing `accountAdded` and `accountRenamed` events.

### Removed

- account sync throttling ([#4675](https://github.com/MetaMask/core/pull/4675))
  - remove `maxSyncInterval`; `lastSyncedAt`; `shouldSync` from `UserStorageController`

## [0.4.0]

### Added

- add `maxSyncInterval` for account syncing to `UserStorageController` prevent multiple sync requests ([#4659](https://github.com/MetaMask/core/pull/4659))
- add optional `NativeScrypt` property to `UserStorageController` to allow the scrypt implementation to be swapped out for a native version. Improving mobile performance ([#4656](https://github.com/MetaMask/core/pull/4656))

## [0.3.0]

### Added

- add granular account syncing ([#4629](https://github.com/MetaMask/core/pull/4629))
  - add accounts user storage schema
  - add method `saveInternalAccountToUserStorage` to `UserStorageController`
  - add method `syncInternalAccountsWithUserStorage` to `UserStorageController`
  - add `@metamask/accounts-controller` dev dependency
  - add `@metamask/keyring-api` dev dependency
- add infura OIDC identifier ([#4654](https://github.com/MetaMask/core/pull/4654))
- define and export new types: `AuthenticationControllerGetStateAction`, `AuthenticationControllerStateChangeEvent`, `Events` ([#4633](https://github.com/MetaMask/core/pull/4633))
- SDK and controller support for `GET /api/v1/userstorage/:feature` endpoint ([#4626](https://github.com/MetaMask/core/pull/4626))
  - add method `performGetStorageAllFeatureEntries` to `UserStorageController`
  - add `ALLOW_ARBITRARY_KEYS` to `USER_STORAGE_SCHEMA` to allow wildcard/getAll for entries for a feature
- add subpath exports to `@metamask/profile-sync-controller` ([#4604](https://github.com/MetaMask/core/pull/4604))
  - add `@metamask/profile-sync-controller/sdk` export
  - add `@metamask/profile-sync-controller/user-storage` export
  - add `@metamask/profile-sync-controller/auth` export

### Changed

- Bump `typescript` from `~5.1.6` to `~5.2.2` ([#4584](https://github.com/MetaMask/core/pull/4584))
- Fix controllers with missing or incorrect messenger action/event types ([#4633](https://github.com/MetaMask/core/pull/4633))
- **BREAKING:** `AuthenticationControllerMessenger` must allow internal events defined in the `Events` type ([#4633](https://github.com/MetaMask/core/pull/4633))
- `AuthenticationControllerActions` is widened to include the `AuthenticationController:getState` action ([#4633](https://github.com/MetaMask/core/pull/4633))
- Replaced `@metamask/profile-sync-controller/sdk` to use the same encryption file as `UserStorageController` ([#4649](https://github.com/MetaMask/core/pull/4649))

### Fixed

- update subpath exports internal `package.json` files to resolve `jest-haste-map` errors ([#4650](https://github.com/MetaMask/core/pull/4650))

## [0.2.1]

### Added

- unlock checks for when controller methods are called ([#4569](https://github.com/MetaMask/core/pull/4569))

### Changed

- **BREAKING** made `MOCK_ENCRYPTED_STORAGE_DATA` fixture a function to be lazily evaluated ([#4592](https://github.com/MetaMask/core/pull/4592))
- Bump `typescript` from `~5.0.4` to `~5.1.6` ([#4576](https://github.com/MetaMask/core/pull/4576))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.7...HEAD
[0.9.7]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.6...@metamask/profile-sync-controller@0.9.7
[0.9.6]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.5...@metamask/profile-sync-controller@0.9.6
[0.9.5]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.4...@metamask/profile-sync-controller@0.9.5
[0.9.4]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.3...@metamask/profile-sync-controller@0.9.4
[0.9.3]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.2...@metamask/profile-sync-controller@0.9.3
[0.9.2]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.1...@metamask/profile-sync-controller@0.9.2
[0.9.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.0...@metamask/profile-sync-controller@0.9.1
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.8.1...@metamask/profile-sync-controller@0.9.0
[0.8.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.8.0...@metamask/profile-sync-controller@0.8.1
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.7.0...@metamask/profile-sync-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.6.0...@metamask/profile-sync-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.5.0...@metamask/profile-sync-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.4.0...@metamask/profile-sync-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.3.0...@metamask/profile-sync-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.2.1...@metamask/profile-sync-controller@0.3.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.2.0...@metamask/profile-sync-controller@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.4...@metamask/profile-sync-controller@0.2.0
[0.1.4]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.3...@metamask/profile-sync-controller@0.1.4
[0.1.3]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.2...@metamask/profile-sync-controller@0.1.3
[0.1.2]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.1...@metamask/profile-sync-controller@0.1.2
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.1.0...@metamask/profile-sync-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/profile-sync-controller@0.1.0
