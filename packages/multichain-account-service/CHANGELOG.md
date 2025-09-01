# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0]

### Added

- Add `setBasicFunctionality` method to control providers state and trigger wallets alignment ([#6332](https://github.com/MetaMask/core/pull/6332))
  - Add `AccountProviderWrapper` to handle Snap account providers behavior according to the basic functionality flag.
- Add `discoverAndCreateAccounts` methods for Evm and Solana providers ([#6397](https://github.com/MetaMask/core/pull/6397))
- Add `discoverAndCreateAccounts` method to `MultichainAccountWallet` to orchestrate provider discovery ([#6397](https://github.com/MetaMask/core/pull/6397))
- Add `createMultichainAccountWallet` method to create a new multichain account wallet from a mnemonic ([#6397](https://github.com/MetaMask/core/pull/6397))
- Register action handler for `createMultichainAccountWallet` method ([#6397](https://github.com/MetaMask/core/pull/6397))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.6.0...HEAD
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.5.0...@metamask/multichain-account-service@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.4.0...@metamask/multichain-account-service@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.3.0...@metamask/multichain-account-service@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.2.1...@metamask/multichain-account-service@0.3.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.2.0...@metamask/multichain-account-service@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.1.0...@metamask/multichain-account-service@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/multichain-account-service@0.1.0
