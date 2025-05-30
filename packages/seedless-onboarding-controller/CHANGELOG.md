# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial implementation of the seedless onboarding controller. ([#5874](https://github.com/MetaMask/core/pull/5874))
  - Authenticate OAuth user using the seedless onboarding flow and determine if the user is already registered or not
  - Create a new Toprf key and backup seed phrase
  - Add a new seed phrase backup to the metadata store
  - Add array of new seed phrase backups to the metadata store in batch (useful in multi-srp flow)
  - Fetch seed phrase metadata from the metadata store
  - Update the password of the seedless onboarding flow
- Support multi SRP sync using social login. ([#5875](https://github.com/MetaMask/core/pull/5875))
  - Update Metadata to support multiple types of secrets (SRP, PrivateKey).
  - Add `Controller Lock` which will sync with `Keyring Lock`.
  - Updated `VaultEncryptor` type in constructor args and is compulsory to provided relevant encryptor to constructor.
  - Added new non-persisted states, `encryptionKey` and `encryptionSalt` to decrypt the vault when password is not available.
  - Update `password` param in `fetchAllSeedPhrases` method to optional. If password is not provided, `cached EncryptionKey` will be used.
- Password sync features implementation. ([#5877](https://github.com/MetaMask/core/pull/5877))
  - checkIsPasswordOutdated to check current password is outdated compare to global password
  - Add password outdated check to add SRPs / change password
  - recover old password using latest global password
  - sync latest global password to reset vault to use latest password and persist latest auth pubkey
- Updated `toprf-secure-backup` to `0.3.1`. ([#5880](https://github.com/MetaMask/core/pull/5880))
  - added an optional constructor param, `topfKeyDeriver` to assist the `Key derivation` in `toprf-seucre-backup` sdk and adds an additinal security
  - added new state value, `recoveryRatelimitCache` to the controller to parse the `RecoveryError` correctly and synchroize the error data (numberOfAttempts) across multiple devices.

[Unreleased]: https://github.com/MetaMask/core/
