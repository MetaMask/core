# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0]

### Added

- **BREAKING:** Add `refreshToken` to controller state ([#5917](https://github.com/MetaMask/core/pull/5917))
  - The clients will require a migration to populate this property
- Add `revokeToken` to controller state ([#5917](https://github.com/MetaMask/core/pull/5917))
  - This property is not persisted
- **BREAKING:** Add required argument `refreshJWTToken` to controller constructor ([#5917](https://github.com/MetaMask/core/pull/5917))
  - This argument is the callback function which will do the JWT Token refresh operation.
- **BREAKING:** Add required argument `revokeRefreshToken` to controller constructor ([#5917] (https://github.com/MetaMask/core/pull/5917))
  - This argument is the callback function which will revoke the current `refreshToken` in state and replaced with the new value.
- **BREAKING:** Add param (`options`) to `addNewSecretData` (formerly `addNewSeedPhraseBackup`) to support passing a backup keyring ID ([#5948](https://github.com/MetaMask/core/pull/5948))
  - The keyring ID is required when backing up a seed phrase (mnemonic), or else an error will be thrown
- Export `SecretType` enum ([#5948](https://github.com/MetaMask/core/pull/5948))
- Add optional argument `refreshToken `authenticate` method ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add optional argument `refreshToken` to `authenticate` method ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add optional argument `skipLock` to `authenticate` method ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add new method `refreshNodeAuthTokens` ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add new method `revokeRefreshToken` ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add new method `checkNodeAuthTokenExpired` ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add new method `decodeNodeAuthToken` ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add `refreshToken` property to `AuthenticatedUserDetails` ([#5917](https://github.com/MetaMask/core/pull/5917))
- Add optional param (`type`) to `getSecretDataBackupState` (previously `getSeedPhraseBackupHash`) to look for data with specific type in the controller backup state ([#5955](https://github.com/MetaMask/core/pull/5955))

### Changed

- **BREAKING:** Replace `addNewSeedPhraseBackup` with `addNewSecretData` to allow for storing not just mnemonics but also private keys ([#5948](https://github.com/MetaMask/core/pull/5948))
- **BREAKING:** Rename `fetchAllSeedPhrases` with `fetchAllSecretData`, change return type from `Promise<Uint8Array[]>` to `Promise<Record<SecretType, Uint8Array[]>>` to include not only mnemonics but also private keys ([#5948](https://github.com/MetaMask/core/pull/5948))
- **BREAKING:** The `updateBackupMetadataState` method now takes an object or array of objects which contain `keyringId` and `data` properties rather than `keyringId` and `seedPhrase` properties ([#5955](https://github.com/MetaMask/core/pull/5955))
- **BREAKING:** Rename `getSeedPhraseBackupHash` to `getSecretDataBackupState` ([#5955](https://github.com/MetaMask/core/pull/5955))
- **BREAKING:** Change type of `socialBackupsMetadata` property in state: remove `id` property, add required property `type`, optional property `keyringId` ([#5955](https://github.com/MetaMask/core/pull/5955))
  - This also affects the `SocialBackupsMetadata` type itself
- Ensure mnemonics and private keys are not added to the metadata store if they already exist in the controller backup state ([#5955](https://github.com/MetaMask/core/pull/5955))

### Removed

- **BREAKING:** Remove `recoveryRatelimitCache` from the controller state ([#5796](https://github.com/MetaMask/core/pull/5976))
  - Clients will need a migration to remove this from users' local state

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@2.0.0...HEAD
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@1.0.0...@metamask/seedless-onboarding-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/seedless-onboarding-controller@1.0.0
