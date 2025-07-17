# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added a optional param `maxKeyChainLength` in `submitGlobalPassword` function.([#6134](https://github.com/MetaMask/core/pull/6134))
- Separated vault update logic from `revokeRefreshToken`, `revokeRefreshToken` now accepts a revokeToken instead of password. ([#6134](https://github.com/MetaMask/core/pull/6134))

### Fixed

- remove `access_token` validation when the wallet is locked. ([#6133](https://github.com/MetaMask/core/pull/6133))
- remove `revoke_token` validation from `#parseVault` and `createNewVaultWithAuthData` to handle the case when
  max key chain length exceeds. ([#6136](https://github.com/MetaMask/core/pull/6136))

## [2.1.0]

### Added

- Added `access_token` and `metadata_access_token` in seedless controller state. ([#6060](https://github.com/MetaMask/core/pull/6060))
  - `access_token` can be used by profile sync pairing and for other apis access after wallet is unlocked.
  - `metadata_access_token` is used to give access for web3auth metadata apis.

## [2.0.1]

### Fixed

- remove buffer usage in seedless controller ([#6080](https://github.com/MetaMask/core/pull/6080))

## [2.0.0]

### Added

- Added `PrivateKey sync` feature to the controller ([#5948](https://github.com/MetaMask/core/pull/5948)).
  - **BREAKING** Updated controller methods signatures.
  - removed `addNewSeedPhraseBackup` and replaced with `addNewSecretData` method.
  - added `addNewSecretData` method implementation to support adding different secret data types.
  - renamed `fetchAllSeedPhrases` method to `fetchAllSecretData` and updated the return value to `Record<SecretType, Uint8Array[]>`.
  - added new error message, `MissingKeyringId` which will throw if no `keyringId` is provided during seed phrase (Mnemonic) backup.
- Added a check for `duplicate data` before adding it to the metadata store. ([#5955](https://github.com/MetaMask/core/pull/5955))
  - renamed `getSeedPhraseBackupHash` to `getSecretDataBackupState` and added optional param (`type`) to look for data with specific type in the controller backup state.
  - updated `updateBackupMetadataState` method param with `{ keyringId?: string; data: Uint8Array; type: SecretType }`. Previously , `{ keyringId: string; seedPhrase: Uint8Array }`.
- Added `submitGlobalPassword`. ([#5995](https://github.com/MetaMask/core/pull/5995))
- Added `storeKeyringEncryptionKey` and `loadKeyringEncryptionKey`. ([#5995](https://github.com/MetaMask/core/pull/5995))
- Added validations in `fetchAllSecretData`. ([#6047](https://github.com/MetaMask/core/pull/6047))
  - Throwing `NoSecretDataFound` error when the client receives the empty secret data from the metadata store.
  - Throwing `InvalidPrimarySecretDataType` error when the first secret data backup is not a `Mnemonic`. First backup must always be a `Mnemonic`
    since generating a new mnemonic (SRP) is the only way to create a new wallet for a Social Login user.

### Changed

- Refresh and revoke token handling ([#5917](https://github.com/MetaMask/core/pull/5917))
  - **BREAKING:** `authenticate` need extra `refreshToken` and `revokeToken` params, persist refresh token in state and store revoke token temporarily for user in next step
  - `createToprfKeyAndBackupSeedPhrase`, `fetchAllSecretData` store revoke token in vault
  - check for token expired in toprf call, refresh token and retry if expired
  - `submitPassword` revoke refresh token and replace with new one after password submit to prevent malicious use if refresh token leak in persisted state
- Removed `recoveryRatelimitCache` from the controller state. ([#5976](https://github.com/MetaMask/core/pull/5976)).
- **BREAKING:** Changed `syncLatestGlobalPassword`. ([#5995](https://github.com/MetaMask/core/pull/5995))
  - removed parameter `oldPassword`
  - no longer verifying old password
  - explicitly requring unlocked controller
- **BREAKING** Changed data structure of return values from `fetchAllSecretData`. ([#6047](https://github.com/MetaMask/core/pull/6047))
  - Now returns `SecretMetadata[]` object instead of `Record<SecretType, Uint8Array[]>`
- Bump `@metamask/utils` from `^11.2.0` to `^11.4.2` ([#6054](https://github.com/MetaMask/core/pull/6054))

### Removed

- Removed `recoverCurrentDevicePassword`. ([#5995](https://github.com/MetaMask/core/pull/5995))

## [1.0.0]

### Added

- Initial release of the seedless onboarding controller ([#5874](https://github.com/MetaMask/core/pull/5874), [#5875](https://github.com/MetaMask/core/pull/5875), [#5880](https://github.com/MetaMask/core/pull/5880))
  - This controller allows MM extension and mobile users to login with google, apple accounts. This controller communicates with web3auth nodes + relies on toprf sdk (unreleased) to perform CRU operations related to backing up srps.
  - The controller contains the following methods:
    - `authenticate`: Authenticate OAuth user, generate Valid Authentication Token to interact with TOPRF Services and determine if the user has already registered or not.
    - `createToprfKeyAndBackupSeedPhrase`: Create a new TOPRF encryption key using given password, encrypt the Seed Phrase and store the encrypted data in the metadata store.
    - `addNewSeedPhraseBackup`: Add and encrypt a new seed phrase backup to the metadata store without create a new TOPRF encryption key.
    - `fetchAllSeedPhrases`: Retrieve the encrypted backed-up Seed Phrases from the metadatastore and return decrypted Seed Phrases.
    - `changePassword`: Update the password of the seedless onboarding flow
    - `updateBackupMetadataState`: Update the backup metadata state of the controller.
    - `verifyVaultPassword`: Verify the password validity by decrypting the vault
    - `getSeedPhraseBackupHash`: Get the hash of the seed phrase backup for the given seed phrase from the state.
    - `submitPassword`: Validate a password and unlock the controller.
    - `setLocked`: Remove secrets from state and set the controller status to locked.
    - `syncLatestGlobalPassword`: Sync the latest global password to the controller. This is useful for syncing the password change update across multiple devices.
    - `recoverCurrentDevicePassword`:
      - Recover the vault which is encrypted with the outdated password with the new password.
      - This is useful when user wants to sync the current device without logging out.
      - e.g. User enters the new password, decrypts the current vault (which was initially encrypted with old password) using the new password and recover the Key data.
    - `checkIsPasswordOutdated`: Check if the password is current device is outdated, i.e. user changed password in another device.
    - `clearState`: Reset the state of the controller to the defaults.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@2.1.0...HEAD
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@2.0.1...@metamask/seedless-onboarding-controller@2.1.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@2.0.0...@metamask/seedless-onboarding-controller@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@1.0.0...@metamask/seedless-onboarding-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/seedless-onboarding-controller@1.0.0
