# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Add refresh and revoke token handling ([#5917](https://github.com/MetaMask/core/pull/5917))
  - **BREAKING:** `authenticate` need extra `refreshToken` and `revokeToken` params, persist refresh token in state and store revoke token temporarily for user in next step
  - `createToprfKeyAndBackupSeedPhrase`, `fetchAllSeedPhrases` store revoke token in vault
  - check for token expired in toprf call, refresh token and retry if expired
  - `submitPassword` revoke refresh token and replace with new one after password submit to prevent malicious use if refresh token leak in persisted state

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/seedless-onboarding-controller@1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/seedless-onboarding-controller@1.0.0
