# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^36.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))

## [7.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/account-api` from `^0.12.0` to `^1.0.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- **BREAKING:** Bump `@metamask/eth-snap-keyring` from `^18.0.0` to `^19.0.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
  - Required to invoke `createAccounts` on any account management Snaps.
- **BREAKING:** Use new `AccountProvider.createAccounts` method with `CreateAccountOptions` ([#7857](https://github.com/MetaMask/core/pull/7857))
  - All account providers now accept `CreateAccountOptions` with `type` field.
  - Added `capabilities` property to all account providers defining supported account creation types.
- Bump `@metamask/accounts-controller` from `^35.0.2` to `^36.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/keyring-api` from `^21.0.0` to `^21.5.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/keyring-internal-api` from `^9.0.0` to `^10.0.0` ([#7857](https://github.com/MetaMask/core/pull/7857))
- Bump `@metamask/keyring-snap-client` from `^8.0.0` to `^8.2.0` ([#7857](https://github.com/MetaMask/core/pull/7857))

## [6.0.0]

### Changed

- **BREAKING** A performance refactor was made around all the classes in this package ([#6654](https://github.com/MetaMask/core/pull/6654))
  - The `MultichainAccountService` is refactored to construct a top level service state for its `init` function, this state is passed down to the `MultichainAccountWallet` and `MultichainAccountGroup` classes in slices for them to construct their internal states.
  - Additional state is generated at the entry points where it needs to be updated i.e. `createMultichainAccountGroup`, `discoverAccounts` and `alignAccounts`.
  - We no longer prevent group creation if some providers' `createAccounts` calls fail during group creation, only if they all fail.
  - The `getAccounts` method in the `BaseBip44AccountProvider` class no longer relies on fetching the entire list of internal accounts from the `AccountsController`, instead it gets the specific accounts that it stores in its internal accounts list.
  - The `EvmAccountProvider` no longer fetches from the `AccountController` to get an account for its ID, we deterministically get the associated account ID through `getUUIDFromAddressOfNormalAccount`.
  - The `EvmAccountProvider` now uses the `getAccount` method from the `AccountsController` when fetching an account after account creation as it is more efficient.
  - Add logic in the `createMultichainAccountWallet` method in `MultichainAccountService` so that it can handle all entry points: importing an SRP, recovering a vault and creating a new vault.
  - Add a `getAccountIds` method which returns all the account ids pertaining to a group.
  - Add an `addAccounts` method on the `BaseBip44AccountProvider` class which keeps track of all the account IDs that pertain to it.
- Bump `@metamask/keyring-controller` from `^25.0.0` to `^25.1.0` ([#7713](https://github.com/MetaMask/core/pull/7713))

### Removed

- **BREAKING** A performance refactor was made around all the classes in this package ([#6654](https://github.com/MetaMask/core/pull/6654))
  - Remove `#handleOnAccountAdded` and `#handleOnAccountRemoved` methods in `MultichainAccountService` due to internal state being updated within the service.
  - Remove `getAccountContext` (and associated map) in the `MultichainAccountService` as the service no longer uses that method.
  - Remove the `sync` method in favor of the sole `init` method for both `MultichainAccountWallet` and `MultichainAccountGroup`.

## [5.1.0]

### Added

- Recover from Snap account de-sync when Snap has more accounts than MetaMask ([#7671](https://github.com/MetaMask/core/pull/7671))

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.0` to `^35.0.2` ([#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642))
- Remove Sentry log before attempting Snap account re-sync ([#7675](https://github.com/MetaMask/core/pull/7675))

## [5.0.0]

### Added

- Wait for Snap platform to be ready before any wallet/group operations ([#7266](https://github.com/MetaMask/core/pull/7266))
- Add `SnapAccountProvider.withSnap` protected helper ([#7266](https://github.com/MetaMask/core/pull/7266))
  - This is used to protect any Snap operation behind a guard that checks if the Snap platform is ready.
- Add `MultichainAccountService:ensureCanUseSnapPlatform` method and action.
  - This will resolve once the Snap platform is ready for the first time and will throw afterward if Snap platform has been disabled dynamically.
  - This action is mostly used internally by any Snap-based account providers.

### Changed

- **BREAKING:** The `SnapAccountProvider.client` property is now private ([#7266](https://github.com/MetaMask/core/pull/7266))
  - You now need to use `SnapAccountProvider.withSnap` to access to it.
- Bump `@metamask/snaps-controllers` from `^14.0.1` to `^17.2.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Bump `@metamask/snaps-sdk` from `^9.0.0` to `^10.3.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Bump `@metamask/snaps-utils` from `^11.0.0` to `^11.7.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Remove dependency on `@metamask/error-reporting-service` ([#7542](https://github.com/MetaMask/core/pull/7542))
  - The service no longer needs `ErrorReportingService:captureException`.

## [4.1.0]

### Added

- Add `config.discovery.enabled` option for all account provider config objects ([#7447](https://github.com/MetaMask/core/pull/7447))
- Add `{EVM,SOL,BTC,TRX}_ACCOUNT_PROVIDER_DEFAULT_CONFIG` ([#7447](https://github.com/MetaMask/core/pull/7447))

## [4.0.1]

### Changed

- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209))
  - The dependencies moved are:
    - `@metamask/accounts-controller` (^35.0.0)
    - `@metamask/error-reporting-service` (^3.0.0)
    - `@metamask/keyring-controller` (^25.0.0)
    - `@metamask/snaps-controllers` (^14.0.1)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

### Fixed

- Harden EVM discovery in case of bad RPC response ([#7434](https://github.com/MetaMask/core/pull/7434))
  - If the response was not hex-formatted, then the EVM discovery was continuously running.

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/keyring-controller` from `^24.0.0` to `^25.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^34.0.0` to `^35.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [3.0.0]

### Added

- **BREAKING:** Added error reporting around account creation with the `ErrorReportingService` ([#7044](https://github.com/MetaMask/core/pull/7044))
  - The `@metamask/error-reporting-service` is now a peer dependency.
- Add `MultichainAccountService.resyncAccounts` method and action ([#7087](https://github.com/MetaMask/core/pull/7087)), ([#7093](https://github.com/MetaMask/core/pull/7093))
- Add `*AccountProvider.resyncAccounts` method ([#7087](https://github.com/MetaMask/core/pull/7087))

### Changed

- **BREAKING:** Make `init` method `async` ([#7087](https://github.com/MetaMask/core/pull/7087))
  - While this is not yet really used, we might want to make some `async` calls (like `resyncAccounts`) in `init` directly at some point.
- Add optional tracing configuration ([#7006](https://github.com/MetaMask/core/pull/7006))
  - For now, only the account discovery is being traced.
- Limit Bitcoin and Tron providers to 3 concurrent account creations by default when creating multichain account groups ([#7052](https://github.com/MetaMask/core/pull/7052))

## [2.1.0]

### Added

- Add per-provider throttling for non-EVM account creation to improve performance on low-end devices ([#7000](https://github.com/MetaMask/core/pull/7000))
  - Solana provider is now limited to 3 concurrent account creations by default when creating multichain account groups.
  - Other providers remain unthrottled by default.

## [2.0.1]

### Fixed

- Use `groupIndex` for account creations on `TrxAccountProvider` instead of the outdated `derivationPath` ([#7010](https://github.com/MetaMask/core/pull/7010)), ([#7018](https://github.com/MetaMask/core/pull/7018))

## [2.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6544](https://github.com/MetaMask/core/pull/6544))
  - Previously, `MultichainAccountService` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Bump `@metamask/accounts-controller` from `^33.0.0` to `^34.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/keyring-controller` from `^23.0.0` to `^24.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/eth-snap-keyring` from `^17.0.0` to `^18.0.0` ([#6951](https://github.com/MetaMask/core/pull/6951))

## [1.6.2]

### Changed

- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [1.6.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [1.6.0]

### Changed

- Update Bitcoin account provider to only create/discover Native SegWit (P2wpkh) accounts ([#6783](https://github.com/MetaMask/core/pull/6783))

## [1.5.0]

### Added

- Add an optional `options` parameter to `MultichainAccountWallet.createMultichainAccountGroup()` ([#6759](https://github.com/MetaMask/core/pull/6759))
  - Introduces `options.waitForAllProvidersToFinishCreatingAccounts`, that will make `createMultichainAccountGroup` await either only the EVM provider or all the providers to have created their accounts depending on the value. Defaults to `false` (only awaits for EVM accounts creation by default).

## [1.4.0]

### Changed

- Only await for EVM account creation in `MultichainAccountWallet.createMultichainAccountGroup()` instead of all types of providers ([#6755](https://github.com/MetaMask/core/pull/6755))
  - Other type of providers will create accounts in the background and won't throw errors in case they fail to do so.
  - Multichain account groups will now be "misaligned" for a short period of time, until each of the other providers finish creating their accounts.

## [1.3.0]

### Added

- Add `{Btc/Trx}AccountProvider` account providers ([#6662](https://github.com/MetaMask/core/pull/6662))

### Changed

- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

## [1.2.0]

### Changed

- Add more internal logs ([#6729](https://github.com/MetaMask/core/pull/6729))

## [1.1.0]

### Added

- Add a timeout around Solana account creation ([#6704](https://github.com/MetaMask/core/pull/6704))
  - This timeout can be configured at the client level through the config passed to the `MultichainAccountService`.

## [1.0.0]

### Changed

- Bump package version to v1.0 to mark stabilization ([#6676](https://github.com/MetaMask/core/pull/6676))

## [0.11.0]

### Added

- Add missing exports for providers (`{EVM,SOL}_ACCOUNT_PROVIDER_NAME` + `${Evm,Sol}AccountProvider}`) ([#6660](https://github.com/MetaMask/core/pull/6660))
  - These are required when setting the new account providers when constructing the service.

## [0.10.0]

### Added

- Add timeout and retry mechanism to Solana discovery ([#6624](https://github.com/MetaMask/core/pull/6624))
- Add custom account provider configs ([#6624](https://github.com/MetaMask/core/pull/6624))
  - This new config can be set by the clients to update discovery timeout/retry values.

### Fixed

- No longer create temporary EVM account during discovery ([#6650](https://github.com/MetaMask/core/pull/6650))
  - We used to create the EVM account and remove it if there was no activity for that account. Now we're just deriving the next address directly, which avoids state mutation.
  - This prevents `:accountAdded` event from being published, which also prevents account-tree and multichain-account service updates.
  - Backup & sync will no longer synchronize this temporary account group, which was causing a bug that persisted it on the user profile and left it permanently.

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@7.0.0...HEAD
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@6.0.0...@metamask/multichain-account-service@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@5.1.0...@metamask/multichain-account-service@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@5.0.0...@metamask/multichain-account-service@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@4.1.0...@metamask/multichain-account-service@5.0.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@4.0.1...@metamask/multichain-account-service@4.1.0
[4.0.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@4.0.0...@metamask/multichain-account-service@4.0.1
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@3.0.0...@metamask/multichain-account-service@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@2.1.0...@metamask/multichain-account-service@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@2.0.1...@metamask/multichain-account-service@2.1.0
[2.0.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@2.0.0...@metamask/multichain-account-service@2.0.1
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.6.2...@metamask/multichain-account-service@2.0.0
[1.6.2]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.6.1...@metamask/multichain-account-service@1.6.2
[1.6.1]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.6.0...@metamask/multichain-account-service@1.6.1
[1.6.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.5.0...@metamask/multichain-account-service@1.6.0
[1.5.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.4.0...@metamask/multichain-account-service@1.5.0
[1.4.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.3.0...@metamask/multichain-account-service@1.4.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.2.0...@metamask/multichain-account-service@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.1.0...@metamask/multichain-account-service@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@1.0.0...@metamask/multichain-account-service@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.11.0...@metamask/multichain-account-service@1.0.0
[0.11.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.10.0...@metamask/multichain-account-service@0.11.0
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/multichain-account-service@0.9.0...@metamask/multichain-account-service@0.10.0
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
