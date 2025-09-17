# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.0]

### Added

- **BREAKING** Add additional allowed actions to the `MultichainAccountService` messenger
  - `KeyringController:getKeyringsByType` and `KeyringController:addNewKeyring` actions were added.
- Add `createMultichainAccountWallet` method to create a new multichain account wallet from a mnemonic ([#6478](https://github.com/MetaMask/core/pull/6478))
  - An action handler was also registered for this method so that it can be called from the clients.

### Changed

- **BREAKING:** Rename `MultichainAccountWallet.alignGroup` to `alignAccountsOf` ([#6595](https://github.com/MetaMask/core/pull/6595))
- **BREAKING:** Rename `MultichainAccountGroup.align` to `alignAccounts` ([#6595](https://github.com/MetaMask/core/pull/6595))
- Add timeout and retry mechanism to EVM discovery ([#6609](https://github.com/MetaMask/core/pull/6609)), ([#6621](https://github.com/MetaMask/core/pull/6621))
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

## [0.8.0]

### Added

- Add mutable operation lock (per wallets) ([#6527](https://github.com/MetaMask/core/pull/6527))
  - Operations such as discovery, alignment, group creation will now lock an internal mutex (per wallets).
- Add wallet status tracking with `:walletStatusChange` event ([#6527](https://github.com/MetaMask/core/pull/6527))
  - This can be used to track what's the current status of a wallet (e.g. which operation is currently running OR if the wallet is ready to run any new operations).
- Add `MultichainAccountWalletStatus` enum ([#6527](https://github.com/MetaMask/core/pull/6527))
  - Enumeration of all possible wallet statuses.
- Add `MultichainAccountWallet.status` ([#6527](https://github.com/MetaMask/core/pull/6527))
  - To get the current status of a multichain account wallet instance.
- Add multichain account group lifecycle events ([#6441](https://github.com/MetaMask/core/pull/6441))
  - Add `multichainAccountGroupCreated` event emitted from wallet level when new groups are created.
  - Add `multichainAccountGroupUpdated` event emitted from wallet level when groups are synchronized.

### Changed

- **BREAKING:** Bump peer dependency `@metamask/account-api` from `^0.9.0` to `^0.12.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- **BREAKING:** Rename `alignGroups` to `alignAccounts` for `MultichainAccountWallet` ([#6560](https://github.com/MetaMask/core/pull/6560))
- **BREAKING:** Rename `MultichainAccountWallet.discoverAndCreateAccounts` to `discoverAccounts` for `MultichainAccountWallet` and `*Provider*` types ([#6560](https://github.com/MetaMask/core/pull/6560))
- **BREAKING:** Remove `MultichainAccountService:getIsAlignementInProgress` action ([#6527](https://github.com/MetaMask/core/pull/6527))
  - This is now being replaced with the wallet's status logic.
- Bump `@metamask/keyring-api` from `^20.1.0` to `^21.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- Bump `@metamask/keyring-internal-api` from `^8.1.0` to `^9.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- Bump `@metamask/keyring-snap-client` from `^7.0.0` to `^8.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))
- Bump `@metamask/eth-snap-keyring` from `^16.1.0` to `^17.0.0` ([#6560](https://github.com/MetaMask/core/pull/6560))

## [0.7.0]

### Added

- Add `discoverAndCreateAccounts` methods for EVM and Solana providers ([#6397](https://github.com/MetaMask/core/pull/6397))
- Add `discoverAndCreateAccounts` method to `MultichainAccountWallet` to orchestrate provider discovery ([#6397](https://github.com/MetaMask/core/pull/6397))
- **BREAKING** Add additional allowed actions to the `MultichainAccountService` messenger
  - `NetworkController:getNetworkClientById` and `NetworkController:findNetworkClientIdByChainId` were added.

### Changed

- Bump `@metamask/base-controller` from `^8.2.0` to `^8.3.0` ([#6465](https://github.com/MetaMask/core/pull/6465))

## [0.6.0]

### Added

- Add `setBasicFunctionality` method to control providers state and trigger wallets alignment ([#6332](https://github.com/MetaMask/core/pull/6332))
  - Add `AccountProviderWrapper` to handle Snap account providers behavior according to the basic functionality flag.

### Changed

- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))
- **BREAKING**: Rename `BaseAccountProvider` to `BaseBip44AccountProvider` for clarity ([#6332](https://github.com/MetaMask/core/pull/6332))

### Fixed

- Move account event subscriptions to the constructor ([#6394](https://github.com/MetaMask/core/pull/6394))
- Clear state before re-initilizing the service ([#6394](https://github.com/MetaMask/core/pull/6394))

## [0.5.0]

### Added

- Allow for multichain account group alignment through the `align` method ([#6326](https://github.com/MetaMask/core/pull/6326))
  - You can now call alignment from the group, wallet and service levels.

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` from `^22.0.0` to `^23.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))
- Bump accounts related packages ([#6309](https://github.com/MetaMask/core/pull/6309))
  - Bump `@metamask/keyring-api` from `^20.0.0` to `^20.1.0`
  - Bump `@metamask/keyring-internal-api` from `^8.0.0` to `^8.1.0`
  - Bump `@metamask/eth-snap-keyring` from `^16.0.0` to `^16.1.0`

## [0.4.0]

### Added

- Allow custom account providers ([#6231](https://github.com/MetaMask/core/pull/6231))
  - You can now pass an extra option `providers` in the service's constructor.
- Add multichain account group creation support ([#6222](https://github.com/MetaMask/core/pull/6222)), ([#6238](https://github.com/MetaMask/core/pull/6238)), ([#6240](https://github.com/MetaMask/core/pull/6240))
  - This includes the new actions `MultichainAccountService:createNextMultichainAccountGroup` and `MultichainAccountService:createMultichainAccountGroup`.
- Export `MultichainAccountWallet` and `MultichainAccountGroup` types ([#6220](https://github.com/MetaMask/core/pull/6220))

### Changed

- **BREAKING:** Use `KeyringAccount` instead of `InternalAccount` ([#6227](https://github.com/MetaMask/core/pull/6227))
- **BREAKING:** Bump peer dependency `@metamask/account-api` from `^0.3.0` to `^0.9.0` ([#6214](https://github.com/MetaMask/core/pull/6214)), ([#6216](https://github.com/MetaMask/core/pull/6216)), ([#6222](https://github.com/MetaMask/core/pull/6222)), ([#6248](https://github.com/MetaMask/core/pull/6248))
- **BREAKING:** Rename `MultichainAccount` to `MultichainAccountGroup` ([#6216](https://github.com/MetaMask/core/pull/6216)), ([#6219](https://github.com/MetaMask/core/pull/6219))
  - The naming was confusing and since a `MultichainAccount` is also an `AccountGroup` it makes sense to have the suffix there too.
- **BREAKING:** Rename `getMultichainAccount*` to `getMultichainAccountGroup*` ([#6216](https://github.com/MetaMask/core/pull/6216)), ([#6219](https://github.com/MetaMask/core/pull/6219))
  - The naming was confusing and since a `MultichainAccount` is also an `AccountGroup` it makes sense to have the suffix there too.

## [0.3.0]

### Added

- Add multichain account/wallet syncs ([#6165](https://github.com/MetaMask/core/pull/6165))
  - Those are getting sync'd during `AccountsController:account{Added,Removed}` events.
- Add actions `MultichainAccountService:getMultichain{Account,Accounts,AccountWallet,AccountWallets}` ([#6193](https://github.com/MetaMask/core/pull/6193))

### Changed

- **BREAKING:** Add `@metamask/account-api` peer dependency ([#6115](https://github.com/MetaMask/core/pull/6115)), ([#6146](https://github.com/MetaMask/core/pull/6146))

## [0.2.1]

### Fixed

- Add missing `name` class field ([#6173](https://github.com/MetaMask/core/pull/6173))

## [0.2.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^31.0.0` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))

## [0.1.0]

### Added

- Add `MultichainAccountService` ([#6141](https://github.com/MetaMask/core/pull/6141)), ([#6165](https://github.com/MetaMask/core/pull/6165))
  - This service manages multichain accounts/wallets.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.9.0...HEAD
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.8.0...@metamask/multichain-account-service@0.9.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.7.0...@metamask/multichain-account-service@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.6.0...@metamask/multichain-account-service@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.5.0...@metamask/multichain-account-service@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.4.0...@metamask/multichain-account-service@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.3.0...@metamask/multichain-account-service@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.2.1...@metamask/multichain-account-service@0.3.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.2.0...@metamask/multichain-account-service@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.1.0...@metamask/multichain-account-service@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-account-service@0.1.0
