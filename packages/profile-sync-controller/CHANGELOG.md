# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [12.0.0]

### Added

- **BREAKING:** Add new public method `setIsBackupAndSyncFeatureEnabled` to `UserStorageController` ([#5636](https://github.com/MetaMask/core/pull/5636))
  - This replaces `enableProfileSyncing` and `disableProfileSyncing` and will be used as the main method to enable and disable backup and sync features from now on.
- **BREAKING:** Add new `isAccountSyncingEnabled` state property to `UserStorageController` ([#5636](https://github.com/MetaMask/core/pull/5636))
  - This property is `true` by default.

### Removed

- **BREAKING:** Remove `isAccountSyncingEnabled` `env` property from `UserStorageController` constructor ([#5629](https://github.com/MetaMask/core/pull/5629))
- **BREAKING:** Remove unused action handlers: `setIsBackupAndSyncFeatureEnabled`, `syncInternalAccountsWithUserStorage` and `saveInternalAccountToUserStorage`. ([#5638](https://github.com/MetaMask/core/pull/5638))
  - These actions should not be callable through the messaging system.

## [11.0.1]

### Changed

- Bump accounts dependencies ([#5565](https://github.com/MetaMask/core/pull/5565))

### Fixed

- Update origin used for `SnapController:handleRequest` ([#5616](https://github.com/MetaMask/core/pull/5616))

## [11.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^27.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))
- **BREAKING:** Bump peer dependency `@metamask/network-controller` to `^23.0.0` ([#5507](https://github.com/MetaMask/core/pull/5507))

### Fixed

- Peer dependencies `@metamask/keyring-controller` and `@metamask/network-controller` are no longer also direct dependencies ([#5464](https://github.com/MetaMask/core/pull/5464)))

## [10.1.0]

### Added

- Add primary SRP switching support for `AuthenticationController` and `UserStorageController` ([#5478](https://github.com/MetaMask/core/pull/5478))

## [10.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^21.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^26.0.0` ([#5439](https://github.com/MetaMask/core/pull/5439))
- **BREAKING** `UserStorageController` and `AuthenticationController` now use the SDK under the hood ([#5413](https://github.com/MetaMask/core/pull/5413))
  - **BREAKING** `AuthenticationController` state entry `sessionData` has changed shape to fully reflect the `LoginResponse` SDK type.
  - **BREAKING** `UserStorageController` cannot use the `AuthenticationController:performSignOut` action anymore.
- **BREAKING:** Bump `@metamask/keyring-internal-api` from `^5.0.0` to `^6.0.0` ([#5347](https://github.com/MetaMask/core/pull/5347))

## [9.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency to `^20.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency to `^25.0.0` ([#5426](https://github.com/MetaMask/core/pull/5426))
- Bump `@metamask/keyring-internal-api` from `^4.0.3` to `^5.0.0` ([#5405](https://github.com/MetaMask/core/pull/5405))

## [8.1.1]

### Changed

- Bump `@metamask/keyring-controller"` from `^19.2.0` to `^19.2.1` ([#5373](https://github.com/MetaMask/core/pull/5373))
- Bump `@metamask/keyring-api"` from `^17.0.0` to `^17.2.0` ([#5366](https://github.com/MetaMask/core/pull/5366))

## [8.1.0]

### Added

- Create RPC middleware using RPC services ([#5290](https://github.com/MetaMask/core/pull/5290))

### Changed

- Use `KeyringController:withKeyring` for account syncing operations ([#5345](https://github.com/MetaMask/core/pull/5345))
  - Add accounts in bulk during big sync
  - Filter and keep only HD accounts from the primary SRP for all account sync operations
- Bump `@metamask/keyring-controller` dependency from `^19.1.0` to `^19.2.0` ([#5357](https://github.com/MetaMask/core/pull/5357))

## [8.0.0]

### Added

- Add `perform{BatchSetStorage,DeleteStorage,BatchDeleteStorage}` as messenger actions ([#5311](https://github.com/MetaMask/core/pull/5311))
- Add optional `validateAgainstSchema` option when creating user storage entry paths ([#5326](https://github.com/MetaMask/core/pull/5326))

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^23.0.0` to `^24.0.0` ([#5318](https://github.com/MetaMask/core/pull/5318))
- Change `maxNumberOfAccountsToAdd` default value from `100` to `Infinity` ([#5322](https://github.com/MetaMask/core/pull/5322))

### Removed

- Removed unused events from `UserStorageController` ([#5324](https://github.com/MetaMask/core/pull/5324))

## [7.0.1]

### Changed

- Bump `@metamask/base-controller` from `^7.1.1` to `^8.0.0` ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/keyring-controller` from `^19.0.6` to `^19.0.7` ([#5305](https://github.com/MetaMask/core/pull/5305))
- Bump `@metamask/network-controller` from `^22.2.0` to `^22.2.1` ([#5305](https://github.com/MetaMask/core/pull/5305))

## [7.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^22.0.0` to `^23.0.0` ([#5292](https://github.com/MetaMask/core/pull/5292))

## [6.0.0]

### Changed

- Improve logic & dependencies between profile sync, auth, user storage & notifications ([#5275](https://github.com/MetaMask/core/pull/5275))
- Mark `@metamask/snaps-controllers` peer dependency bump as breaking in CHANGELOG ([#5267](https://github.com/MetaMask/core/pull/5267))
- Fix eslint warnings & errors ([#5261](https://github.com/MetaMask/core/pull/5261))
- Rename `ControllerMessenger` to `Messenger` ([#5244](https://github.com/MetaMask/core/pull/5244))
- Bump snaps-sdk to v6.16.0 ([#5220](https://github.com/MetaMask/core/pull/5220))
- **BREAKING:** Bump `@metamask/snaps-controllers` peer dependency from `^9.10.0` to `^9.19.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/snaps-sdk` from `^6.16.0` to `^6.17.1` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/snaps-utils` from `^8.9.0` to `^8.10.0` ([#5265](https://github.com/MetaMask/core/pull/5265))
- Bump `@metamask/keyring-api"` from `^16.1.0` to `^17.0.0` ([#5280](https://github.com/MetaMask/core/pull/5280))

### Removed

- **BREAKING:** Remove metametrics dependencies in UserStorageController ([#5278](https://github.com/MetaMask/core/pull/5278))

## [5.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^21.0.0` to `^22.0.0` ([#5218](https://github.com/MetaMask/core/pull/5218))
- Bump `@metamask/keyring-api` from `^14.0.0` to `^16.1.0` ([#5190](https://github.com/MetaMask/core/pull/5190)), ([#5208](https://github.com/MetaMask/core/pull/5208))

## [4.1.1]

### Changed

- Bump `@metamask/keyring-api` from `^13.0.0` to `^14.0.0` ([#5177](https://github.com/MetaMask/core/pull/5177))

## [4.1.0]

### Changed

- Persist `isAccountSyncingReadyToBeDispatched` state value ([#5147](https://github.com/MetaMask/core/pull/5147))

## [4.0.1]

### Added

- Add optional sentry context parameter to erroneous situation callbacks ([#5139](https://github.com/MetaMask/core/pull/5139))

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^20.0.0` to `^21.0.0` ([#5140](https://github.com/MetaMask/core/pull/5140))
- Bump `@metamask/base-controller` from `7.1.0` to `^7.1.1` ([#5135](https://github.com/MetaMask/core/pull/5135))
- Bump `@metamask/keyring-api` from `^12.0.0` to `^13.0.0` ([#5066](https://github.com/MetaMask/core/pull/5066))
- Bump `@metamask/keyring-internal-api` from `^1.0.0` to `^2.0.0` ([#5066](https://github.com/MetaMask/core/pull/5066)), ([#5136](https://github.com/MetaMask/core/pull/5136))
- Bump `@metamask/keyring-controller` from `^19.0.2` to `^19.0.3` ([#5140](https://github.com/MetaMask/core/pull/5140))

## [3.3.0]

### Added

- Add a `customProvider` option to the sdk `JwtBearerAuth` class ([#5105](https://github.com/MetaMask/core/pull/5105))

### Changed

- Bump `eslint` to `^9.11.1` and migrate to flat config ([#4727](https://github.com/MetaMask/core/pull/4727))
- Bump `@metamask/keyring-api` from `^12.0.0` to `^13.0.0` and `@metamask/keyring-internal-api` from `^1.0.0` to `^1.1.0` ([#5066](https://github.com/MetaMask/core/pull/5066))

## [3.2.0]

### Added

- feat: improve profile sync services logs ([#5101](https://github.com/MetaMask/core/pull/5101))

### Changed

- feat: decouple account sync logic from `UserStorageController` ([#5078](https://github.com/MetaMask/core/pull/5078))
- Bump `@metamask/base-controller` from `^7.0.0` to `^7.1.0` ([#5079](https://github.com/MetaMask/core/pull/5079))

## [3.1.1]

### Changed

- Use new `@metamask/keyring-internal-api@^1.0.0`( [#4695](https://github.com/MetaMask/core/pull/4695))
  - This package has been split out from the Keyring API.
- Bump `@metamask/keyring-api` from `^10.1.0` to `^12.0.0` ([#4695](https://github.com/MetaMask/core/pull/4695))

## [3.1.0]

### Changed

- Revamp user storage encryption process ([#4981](https://github.com/MetaMask/core/pull/4981))
  - Stop using a random salt when generating scrypt keys and use a shared one
  - Re-encrypt data fetched by `getUserStorageAllFeatureEntries` and `getUserStorage` with the shared salt if fetched entries were encrypted with random salts

### Fixed

- Remove `#assertLoggedIn()` assertion when signing out a user, ensuring `performSignOut` does not error when a user is already signed out ([#5013](https://github.com/MetaMask/core/pull/5013))

## [3.0.0]

### Added

- Add optional constructor arguments for `config.networkSyncing` to UserStorageController: `maxNumberOfAccountsToAdd`, `onNetworkAdded`, `onNetworkUpdated`, `onNetworkRemoved` ([#4701](https://github.com/MetaMask/core/pull/4701))
- Add new UserStorageController method `syncNetworks`, which can be used to initiate the main network sync ([#4701](https://github.com/MetaMask/core/pull/4701))
- Add optional property `hasNetworkSyncingSyncedAtLeastOnce` to UserStorageController state ([#4701](https://github.com/MetaMask/core/pull/4701))

### Changed

- **BREAKING:** The controller messenger must now allow the actions `NetworkController:getState`, `NetworkController:addNetwork`, `NetworkController:removeNetwork`, and `NetworkController:updateNetwork` ([#4701](https://github.com/MetaMask/core/pull/4701))
- **BREAKING:** The controller messenger must now allow the event `NetworkController:networkRemoved` ([#4701](https://github.com/MetaMask/core/pull/4701))
- Bump `@metamask/keyring-controller` from `^19.0.0` to `^19.0.1` ([#5012](https://github.com/MetaMask/core/pull/5012))
- Bump `@metamask/network-controller` from `^22.0.2` to `^22.1.0` ([#5012](https://github.com/MetaMask/core/pull/5012))

### Fixed

- Make implicit peer dependencies explicit ([#4974](https://github.com/MetaMask/core/pull/4974))
  - Add the following packages as peer dependencies of this package to satisfy peer dependency requirements from other dependencies:
    - `@metamask/providers` `^18.1.0` (required by `@metamask/keyring-api`)
    - `webextension-polyfill` `^0.10.0 || ^0.11.0 || ^0.12.0` (required by `@metamask/providers`)
  - These dependencies really should be present in projects that consume this package (e.g. MetaMask clients), and this change ensures that they now are.
  - Furthermore, we are assuming that clients already use these dependencies, since otherwise it would be impossible to consume this package in its entirety or even create a working build. Hence, the addition of these peer dependencies is really a formality and should not be breaking.
- Fix user storage controller to use the user-storage batch API to upsert remote networks rather than upserting them one at a time ([#4701](https://github.com/MetaMask/core/pull/4701))
- Correct ESM-compatible build so that imports of the following packages that re-export other modules via `export *` are no longer corrupted: ([#5011](https://github.com/MetaMask/core/pull/5011))
  - `@metamask/keyring-api`
  - `loglevel`
  - `nock`
  - `siwe`

## [2.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^18.0.0` to `^19.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^19.0.0` to `^20.0.0` ([#4195](https://github.com/MetaMask/core/pull/4956))

## [1.0.2]

### Added

- new analytics callback and various helpers & improvements ([#4944](https://github.com/MetaMask/core/pull/4944))
  - new `UserStorageController` state keys: `hasAccountSyncingSyncedAtLeastOnce` and `isAccountSyncingReadyToBeDispatched`
  - new `onAccountSyncErroneousSituation` analytics callback to track how often erroneous situations happen during account syncing

### Changed

- set `hasAccountSyncingSyncedAtLeastOnce` also for a profile id that has never synced accounts before ([#4944](https://github.com/MetaMask/core/pull/4944))

## [1.0.1]

### Added

- add batch delete endpoint support for both UserStorageController & SDK ([#4938](https://github.com/MetaMask/core/pull/4938))

### Changed

- use better type system for user storage ([#4907](https://github.com/MetaMask/core/pull/4907))

### Fixed

- account sync infinite account creation bug ([#4933](https://github.com/MetaMask/core/pull/4933))

## [1.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` peer dependency from `^17.2.0` to `^18.0.0` ([#4915](https://github.com/MetaMask/core/pull/4915))
- **BREAKING:** Bump `@metamask/accounts-controller` peer dependency from `^18.1.1` to `^19.0.0` ([#4915](https://github.com/MetaMask/core/pull/4915))

## [0.9.8]

### Changed

- **BREAKING:** Bump `@metamask/network-controller` peer dependency to `^22.0.0` ([#4841](https://github.com/MetaMask/core/pull/4841))

### Fixed

- prevent multiple parallel account syncs by checking the value of `isAccountSyncingInProgress` before dispatching account syncing ([#4901](https://github.com/MetaMask/core/pull/4901))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@12.0.0...HEAD
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@11.0.1...@metamask/profile-sync-controller@12.0.0
[11.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@11.0.0...@metamask/profile-sync-controller@11.0.1
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@10.1.0...@metamask/profile-sync-controller@11.0.0
[10.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@10.0.0...@metamask/profile-sync-controller@10.1.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@9.0.0...@metamask/profile-sync-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@8.1.1...@metamask/profile-sync-controller@9.0.0
[8.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@8.1.0...@metamask/profile-sync-controller@8.1.1
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@8.0.0...@metamask/profile-sync-controller@8.1.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@7.0.1...@metamask/profile-sync-controller@8.0.0
[7.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@7.0.0...@metamask/profile-sync-controller@7.0.1
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@6.0.0...@metamask/profile-sync-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@5.0.0...@metamask/profile-sync-controller@6.0.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@4.1.1...@metamask/profile-sync-controller@5.0.0
[4.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@4.1.0...@metamask/profile-sync-controller@4.1.1
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@4.0.1...@metamask/profile-sync-controller@4.1.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@4.0.0...@metamask/profile-sync-controller@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@3.3.0...@metamask/profile-sync-controller@4.0.0
[3.3.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@3.2.0...@metamask/profile-sync-controller@3.3.0
[3.2.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@3.1.1...@metamask/profile-sync-controller@3.2.0
[3.1.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@3.1.0...@metamask/profile-sync-controller@3.1.1
[3.1.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@3.0.0...@metamask/profile-sync-controller@3.1.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@2.0.0...@metamask/profile-sync-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@1.0.2...@metamask/profile-sync-controller@2.0.0
[1.0.2]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@1.0.1...@metamask/profile-sync-controller@1.0.2
[1.0.1]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@1.0.0...@metamask/profile-sync-controller@1.0.1
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.8...@metamask/profile-sync-controller@1.0.0
[0.9.8]: https://github.com/MetaMask/core/compare/@metamask/profile-sync-controller@0.9.7...@metamask/profile-sync-controller@0.9.8
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
