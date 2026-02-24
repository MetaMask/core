# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Expose missing public `AccountTreeController` methods through its messenger ([#7976](https://github.com/MetaMask/core/pull/7976/))
  - The following actions are now available:
    - `AccountTreeController:getAccountWalletObject`
    - `AccountTreeController:getAccountWalletObjects`
    - `AccountTreeController:getAccountGroupObject`
    - `AccountTreeController:clearState`
    - `AccountTreeController:syncWithUserStorage`
    - `AccountTreeController:syncWithUserStorageAtLeastOnce`
  - Corresponding action types (e.g. `AccountTreeControllerGetAccountWalletObjectAction`) are available as well.

### Changed

- Bump `@metamask/accounts-controller` from `^36.0.0` to `^36.0.1` ([#7996](https://github.com/MetaMask/core/pull/7996))

### Removed

- **BREAKING:** Remove `resolveNameConflict` from `AccountTreeController` ([#7976](https://github.com/MetaMask/core/pull/7976))
  - This method was only used internally.

## [4.1.1]

### Changed

- Bump `@metamask/accounts-controller` from `^35.0.2` to `^36.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))
- Bump `@metamask/multichain-account-service` from `^6.0.0` to `^7.0.0` ([#7897](https://github.com/MetaMask/core/pull/7897))

## [4.1.0]

### Added

- Add `getAccountContext` method and `AccountTreeController:getAccountContext` action ([#7741](https://github.com/MetaMask/core/pull/7741))
  - This can be used to map an account back to its position (wallet, group) in the account tree.

### Changed

- Bump `@metamask/snaps-sdk` from `^9.0.0` to `^10.3.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Bump `@metamask/snaps-utils` from `^11.0.0` to `^11.7.0` ([#7550](https://github.com/MetaMask/core/pull/7550))
- Upgrade `@metamask/utils` from `^11.8.1` to `^11.9.0` ([#7511](https://github.com/MetaMask/core/pull/7511))
- Move peer dependencies for controller and service packages to direct dependencies ([#7209](https://github.com/MetaMask/core/pull/7209), [#7437](https://github.com/MetaMask/core/pull/7437), [#7515](https://github.com/MetaMask/core/pull/7515), [#7594](https://github.com/MetaMask/core/pull/7594), [#7550](https://github.com/MetaMask/core/pull/7550), [#7604](https://github.com/MetaMask/core/pull/7604), [#7642](https://github.com/MetaMask/core/pull/7642), [#7678](https://github.com/MetaMask/core/pull/7678), [#7713](https://github.com/MetaMask/core/pull/7713), [#7849](https://github.com/MetaMask/core/pull/7849)), ([#7869](https://github.com/MetaMask/core/pull/7869))
  - The dependencies moved are:
    - `@metamask/accounts-controller` (^35.0.2)
    - `@metamask/keyring-controller` (^25.1.0)
    - `@metamask/multichain-account-service` (^6.0.0)
    - `@metamask/profile-sync-controller` (^27.1.0)
    - `@metamask/snaps-controllers` (^17.2.0)
  - In clients, it is now possible for multiple versions of these packages to exist in the dependency tree.
    - For example, this scenario would be valid: a client relies on `@metamask/controller-a` 1.0.0 and `@metamask/controller-b` 1.0.0, and `@metamask/controller-b` depends on `@metamask/controller-a` 1.1.0.
  - Note, however, that the versions specified in the client's `package.json` always "win", and you are expected to keep them up to date so as not to break controller and service intercommunication.

## [4.0.0]

### Changed

- **BREAKING:** Bump `@metamask/profile-sync-controller` from `^26.0.0` to `^27.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/multichain-account-service` from `^3.0.0` to `^4.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/keyring-controller` from `^24.0.0` to `^25.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))
- **BREAKING:** Bump `@metamask/accounts-controller` from `^34.0.0` to `^35.0.0` ([#7202](https://github.com/MetaMask/core/pull/7202))

## [3.0.0]

### Changed

- **BREAKING:** Bump `@metamask/multichain-account-service` from `^2.0.0` to `^3.0.0` ([#7100](https://github.com/MetaMask/core/pull/7100))

## [2.0.0]

### Changed

- **BREAKING:** Use new `Messenger` from `@metamask/messenger` ([#6380](https://github.com/MetaMask/core/pull/6380))
  - Previously, `AccountTreeController` accepted a `RestrictedMessenger` instance from `@metamask/base-controller`.
- **BREAKING:** Bump `@metamask/accounts-controller` from `^33.0.0` to `^34.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/keyring-controller` from `^23.0.0` to `^24.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/multichain-account-service` from `^1.0.0` to `^2.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- **BREAKING:** Bump `@metamask/profile-sync-controller` from `^25.0.0` to `^26.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
- Bump `@metamask/base-controller` from `^8.4.2` to `^9.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))

## [1.6.0]

### Changed

- Add optional account hidden/pinned state callbacks ([#6910](https://github.com/MetaMask/core/pull/6910))
  - Those callbacks can be used migrate existing account state into the tree metadata.
- Bump `@metamask/base-controller` from `^8.4.1` to `^8.4.2` ([#6917](https://github.com/MetaMask/core/pull/6917))

## [1.5.0]

### Changed

- Use non-EVM account names for group names ([#6831](https://github.com/MetaMask/core/pull/6831))
  - EVM accounts still take precedence over non-EVM accounts.
  - Before accounts get re-aligned, it is possible that a group contains only non-EVM accounts, in which case, the first non-EVM account name will be used for that account group.

### Fixed

- Fix wallet metadata cleanup when wallets are completely removed ([#6813](https://github.com/MetaMask/core/pull/6813))

## [1.4.2]

### Fixed

- Ensure `isLegacyAccountSyncingDisabled` is always set in `UserStorageSyncedWallet` after one successful full sync ([#6805](https://github.com/MetaMask/core/pull/6805))
  - This was not set in some rare edge case scenarios, and created situations were legacy syncs would always be re-triggered during full syncs.
  - We now verify this field is correctly set, and also catch empty objects for `UserStorageSyncedWallet`.

## [1.4.1]

### Changed

- Bump `@metamask/base-controller` from `^8.4.0` to `^8.4.1` ([#6807](https://github.com/MetaMask/core/pull/6807))

## [1.4.0]

### Changed

- Re-introduce computed names for account groups ([#6758](https://github.com/MetaMask/core/pull/6758))
  - Those names are computed using the old internal account names, allowing to automatically migrate them.
  - We only consider EVM account names.
  - This automatically handles conflicting names, similarly to backup & sync (adding a suffix ` (n)` in case of conflicts.
- Bump `@metamask/utils` from `^11.8.0` to `^11.8.1` ([#6708](https://github.com/MetaMask/core/pull/6708))

## [1.3.0]

### Changed

- Add more internal logs ([#6730](https://github.com/MetaMask/core/pull/6730))

### Fixed

- Preverve import time for account groups ([#6727](https://github.com/MetaMask/core/pull/6727))
  - We now wait sort accounts by their `importTime` before re-building the tree.
- Prevent `:account{Added,Removed}` to be used if `init` has not been called yet ([#6717](https://github.com/MetaMask/core/pull/6717))
  - We now wait for `init` to have been called at least once. Clients will need to ensure internal accounts are fully ready before calling `init`.
  - This should also enforce account group ordering, since all accounts will be ready to consume right away.

## [1.2.0]

### Added

- Add `reinit` method ([#6709](https://github.com/MetaMask/core/pull/6709))
  - This method can be used if we change the entire list of accounts of the `AccountsController` and want to re-initilize the tree with it.

### Changed

- Implicitly call `init` before mutating the tree ([#6709](https://github.com/MetaMask/core/pull/6709))
  - This ensure the tree is always using existing accounts before inserting/removing any new accounts if `init` has not been called yet.

### Fixed

- Fix use of unknown `group.metadata.name` when checking for group name uniqueness ([#6706](https://github.com/MetaMask/core/pull/6706))
- Added logic that prevents an account within a group from being out of order ([#6683](https://github.com/MetaMask/core/pull/6683))

## [1.1.0]

### Changed

- Set the `setAccountGroupName`'s option `autoHandleConflict` to `true` for all backup & sync operations ([#6697](https://github.com/MetaMask/core/pull/6697))
- Add new group naming for non-HD keyring accounts ([#6679](https://github.com/MetaMask/core/pull/6679)), ([#6696](https://github.com/MetaMask/core/pull/6696))
  - Hardware-wallet account groups are now named: "Ledger|Trezor|QR|Lattice|OneKey Account N".
  - Private key account groups are now named: "Imported Account N".
  - Snap account groups are now named: "Snap Account N".
- Account group names now use natural indexing as a fallback ([#6677](https://github.com/MetaMask/core/pull/6677)), ([#6679](https://github.com/MetaMask/core/pull/6679)), ([#6696](https://github.com/MetaMask/core/pull/6696))
  - If a user names his accounts without any indexes, we would just use the number of accounts to compute the next available index.

### Fixed

- Fix group naming for non-HD keyring accounts ([#6677](https://github.com/MetaMask/core/pull/6677)), ([#6679](https://github.com/MetaMask/core/pull/6679))
  - Previously, the first non-HD keyring account would start as `Account 2` as opposed to `Account 1` and thus subsequent group names were off as well.

## [1.0.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/multichain-account-service` from `^0.8.0` to `^1.0.0` ([#6652](https://github.com/MetaMask/core/pull/6652), [#6676](https://github.com/MetaMask/core/pull/6676))

## [0.18.1]

### Fixed

- Set `lastUpdatedAt` to `0` when generating default account group names ([#6672](https://github.com/MetaMask/core/pull/6672))
  - This created conflicts with backup and sync, where newly created local groups' names were taking precedence over user-defined backed up names.

## [0.18.0]

### Added

- Add `autoHandleConflict` parameter to `setAccountGroupName` method for automatic conflict resolution with suffix generation ([#6601](https://github.com/MetaMask/core/pull/6601))

### Changed

- Computed names (inherited from previous existing accounts) is disabled temporarily ([#6601](https://github.com/MetaMask/core/pull/6601))
  - They do interfere with the naming mechanism, so we disable them temporarily in favor of the new per-wallet sequential naming.

### Fixed

- Fix multi-wallet account group naming inconsistencies and duplicates ([#6601](https://github.com/MetaMask/core/pull/6601))
  - Implement proper per-wallet sequential numbering with highest account index parsing.
  - Add name persistence during group initialization to ensure consistency across app restarts.

## [0.17.0]

### Changed

- Single group sync events will not get enqueued anymore if a full sync is in progress ([#6651](https://github.com/MetaMask/core/pull/6651))
  - This prevents too many unnecessary storage fetches (which would prevent being rate limited).
  - This could rarely lead to inconsistencies until the next single updates or next full sync.

## [0.16.1]

### Added

- Export user storage paths for account syncing ([#6643](https://github.com/MetaMask/core/pull/6643))

### Changed

- Swallow group creation errors in backup and sync `createMultichainAccountGroup` ([#6642](https://github.com/MetaMask/core/pull/6642))

### Removed

- Remove full sync triggers when single sync operations are enqueued and `hasSyncedAtLeastOnce` is `false` ([#6634](https://github.com/MetaMask/core/pull/6634))

## [0.16.0]

### Changed

- **BREAKING:** Use `:getSelectedMultichainAccount` instead of `:getSelectedAccount` to compute currently selected account group ([#6608](https://github.com/MetaMask/core/pull/6608))
  - Coming from the old account model, a non-EVM account could have been selected and the lastly selected EVM account might not be using the same group index.
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

## [0.15.1]

### Fixed

- Check for group existence prior to emitting analytics event in `createMultichainAccountGroup` ([#6582](https://github.com/MetaMask/core/pull/6582))
- Fix logger initialization ([#6581](https://github.com/MetaMask/core/pull/6581))
  - There was a circular dependency between the controller and the logger itself, preventing the logger to be initialized properly.

## [0.15.0]

### Added

- Add `AccountWalletObject.status` support ([#6571](https://github.com/MetaMask/core/pull/6571)), ([#6578](https://github.com/MetaMask/core/pull/6578))
  - The `status` field will now report the current wallet status.
  - Uses `MultichainAccountService` to report on-going operations (discovery, alignment, account creations) for `AccountWalletEntropyObject` multichain account wallet objects.

### Changed

- **BREAKING:** Bump peer dependency `@metamask/multichain-account-service` from `^0.7.0` to `^0.8.0` ([#6571](https://github.com/MetaMask/core/pull/6571)), ([#6578](https://github.com/MetaMask/core/pull/6578))
- **BREAKING:** Bump peer dependency `@metamask/account-api` from `^0.9.0` to `^0.12.0` ([#6560](https://github.com/MetaMask/core/pull/6560))

## [0.14.0]

### Added

- **BREAKING:** Add backup and sync capabilities ([#6344](https://github.com/MetaMask/core/pull/6344))
  - New `syncWithUserStorage()` and `syncWithUserStorageAtLeastOnce()` method for manual sync triggers, replacing `UserStorageController:syncInternalAccountsWithUserStorage` usage in clients.
  - `BackupAndSyncService` with full and atomic sync operations for account tree data persistence.
  - Bidirectional metadata synchronization for wallets and groups with user storage.
  - Automatic sync triggers on metadata changes (rename, pin/hide operations).
  - New `isBackupAndSyncInProgress` state property to track sync status.
  - Analytics event tracking and performance tracing for sync operations.
  - Rollback mechanism for failed sync operations with state snapshot/restore capabilities.
  - Support for entropy-based wallets with multichain account syncing.
  - Legacy account syncing compatibility for seamless migration.
  - Optional configuration through new `AccountTreeControllerConfig.backupAndSync` options.
  - Add `@metamask/superstruct` for data validation.
- **BREAKING:** Add `@metamask/multichain-account-service` peer dependency ([#6344](https://github.com/MetaMask/core/pull/6344))
- **BREAKING:** Add `@metamask/profile-sync-controller` peer dependency ([#6344](https://github.com/MetaMask/core/pull/6344)), ([#6558](https://github.com/MetaMask/core/pull/6558))
- Add two new controller state metadata properties: `includeInStateLogs` and `usedInUi` ([#6470](https://github.com/MetaMask/core/pull/6470))

### Changed

- Account group name uniqueness validation now scoped to wallet level instead of global ([#6550](https://github.com/MetaMask/core/pull/6550))
  - `isAccountGroupNameUnique` now checks for duplicates only within the same wallet, allowing different wallets to have groups with the same name.
  - Function now throws an error for non-existent group IDs instead of returning `true`.
  - Updated `setAccountGroupName` behavior to allow duplicate names across different wallets.

## [0.13.1]

### Fixed

- Fix account group naming inconsistency across app restarts where non-EVM account names would bubble up inappropriately ([#6479](https://github.com/MetaMask/core/pull/6479))

## [0.13.0]

### Added

- Add unique name validation for account groups to prevent duplicate group names ([#6492](https://github.com/MetaMask/core/pull/6492))
  - `setAccountGroupName` now validates that group names are unique across all groups.
  - Added `isAccountGroupNameUnique` utility function to check name uniqueness.
  - Names are trimmed of leading/trailing whitespace before comparison to prevent accidental duplicates.

### Changed

- **BREAKING:** Remove support for `AccountsController:accountRenamed` event handling ([#6438](https://github.com/MetaMask/core/pull/6438))
- Bump `@metamask/base-controller` from `^8.2.0` to `^8.3.0` ([#6465](https://github.com/MetaMask/core/pull/6465))

## [0.12.1]

### Fixed

- Publish `AccountTreeController:selectedAccountGroupChange` during `init` ([#6431](https://github.com/MetaMask/core/pull/6431))

## [0.12.0]

### Added

- Add `AccountTreeController:accountTreeChange` event ([#6400](https://github.com/MetaMask/core/pull/6400))
- Add `AccountTreeController:selectedAccountGroupChange` event ([#6400](https://github.com/MetaMask/core/pull/6400))

## [0.11.0]

### Added

- Add missing export for `AccountTreeControllerGetAccountsFromSelectedAccountGroupAction` ([#6404](https://github.com/MetaMask/core/pull/6404))
- Add `AccountTreeController:setAccount{WalletName,GroupName,GroupPinned,GroupHidden}` actions ([#6404](https://github.com/MetaMask/core/pull/6404))

### Changed

- Bump `@metamask/base-controller` from `^8.1.0` to `^8.2.0` ([#6355](https://github.com/MetaMask/core/pull/6355))

## [0.10.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^32.0.0` to `^33.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))
- **BREAKING:** Bump peer dependency `@metamask/keyring-controller` from `^22.0.0` to `^23.0.0` ([#6345](https://github.com/MetaMask/core/pull/6345))

## [0.9.0]

### Changed

- Bump `@metamask/base-controller` from `^8.0.1` to `^8.1.0` ([#6284](https://github.com/MetaMask/core/pull/6284))
- Bump accounts related packages ([#6309](https://github.com/MetaMask/core/pull/6309))
  - Bump `@metamask/keyring-api` from `^20.0.0` to `^20.1.0`

### Fixed

- Add fallback naming for account groups when rule-based naming fails ([#6246](https://github.com/MetaMask/core/pull/6246))
  - Implements "indexes per wallet" strategy (Wallet 1 → Account 1, Account 2; Wallet 2 → Account 1, Account 2)
  - Ensures new groups get proper sequential names within each wallet

## [0.8.0]

### Added

- **BREAKING:** Add support for `AccountsController:accountRenamed` event handling for state 1 and legacy account syncing compatibility ([#6251](https://github.com/MetaMask/core/pull/6251))
- Add `AccountTreeController:getAccountsFromSelectedAccountGroup` action ([#6266](https://github.com/MetaMask/core/pull/6266)), ([#6248](https://github.com/MetaMask/core/pull/6248)), ([#6265](https://github.com/MetaMask/core/pull/6265))
  - This action can be used to get all accounts from the currently selected account group.
  - This action also support `AccountSelector` support to filter out accounts based on some criterias.
- Add persistence support for user customizations ([#6221](https://github.com/MetaMask/core/pull/6221))
  - New `accountGroupsMetadata` (of new type `AccountTreeGroupPersistedMetadata`) and `accountWalletsMetadata` (of new type `AccountTreeWalletPersistedMetadata`) state properties to persist custom names, pinning, and hiding states.
  - Custom names and metadata survive controller initialization and tree rebuilds.
  - Support for `lastUpdatedAt` timestamps for Account Syncing V2 compatibility.
- Add setter methods for setting custom account group names, wallet names and their pinning state and visibility ([#6221](https://github.com/MetaMask/core/pull/6221))
- Add `{wallet,group}.type` tag ([#6214](https://github.com/MetaMask/core/pull/6214))
  - This `type` can be used as a tag to strongly-type (tagged-union) the `AccountGroupObject`.
  - The `type` from `wallet.metadata` has been moved to `wallet.type` instead and can be used to (tagged-union) the `AccountWalletObject`.
- Add `{wallet,group}.metadata` metadata object ([#6214](https://github.com/MetaMask/core/pull/6214)), ([#6258](https://github.com/MetaMask/core/pull/6258))
  - Given the `{wallet,group}.type` you will now have access to specific metadata information (e.g. `group.metadata.groupIndex` for multichain account groups or `wallet.metadata.entropy.id` for multichain account wallets)
- Automatically prune empty groups and wallets upon account removal ([#6234](https://github.com/MetaMask/core/pull/6234))
  - This ensures that there aren't any empty nodes in the `AccountTreeController` state.

### Changed

- **BREAKING:** Bump peer dependency `@metamask/account-api` from `^0.3.0` to `^0.9.0` ([#6214](https://github.com/MetaMask/core/pull/6214)), ([#6216](https://github.com/MetaMask/core/pull/6216)), ([#6222](https://github.com/MetaMask/core/pull/6222)), ([#6248](https://github.com/MetaMask/core/pull/6248))
- **BREAKING:** Remove use of in-memory wallets and groups (`AccountTree{Wallet,Object}`) ([#6265](https://github.com/MetaMask/core/pull/6265))
  - Those types are not ready to be used and adds no value for now.
- **BREAKING:** Move `wallet.metadata.type` tag to `wallet` node ([#6214](https://github.com/MetaMask/core/pull/6214))
  - This `type` can be used as a tag to strongly-type (tagged-union) the `AccountWalletObject`.
- Defaults to the EVM account from a group when using `setSelectedAccountGroup` ([#6208](https://github.com/MetaMask/core/pull/6208))
  - In case no EVM accounts are found in a group (which should not be possible), it will defaults to the first account of that group.
- Enhanced customization priority hierarchy in tree building ([#6221](https://github.com/MetaMask/core/pull/6221))
  - Custom user names now take priority over default rule-generated names.

## [0.7.0]

### Added

- Add BIP-44/multichain accounts support ([#6185](https://github.com/MetaMask/core/pull/6185))
  - Those are being attached to the `entropy` wallet category.

### Changed

- **BREAKING:** Bump peer dependency `@metamask/account-api` from `^0.2.0` to `^0.3.0` ([#6165](https://github.com/MetaMask/core/pull/6165))
- Add `selectedAccountGroup` state and bidirectional synchronization with `AccountsController` ([#6186](https://github.com/MetaMask/core/pull/6186))
  - New `getSelectedAccountGroup()` and `setSelectedAccountGroup()` methods.
  - Automatic synchronization when selected account changes in AccountsController.
  - New action types `AccountTreeControllerGetSelectedAccountGroupAction` and `AccountTreeControllerSetSelectedAccountGroupAction`.
- Now use one account group per account for `snap` and `keyring` wallet categories ([#6185](https://github.com/MetaMask/core/pull/6185))
  - We used to group all accounts under the `'default'` group, but we now compute the group ID using the address of each accounts.
- Compute account group name based on their underlying account. ([#6185](https://github.com/MetaMask/core/pull/6185))
  - This replaces the previous `'Default'` name for groups.

## [0.6.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` from `^31.0.0` to `^32.0.0` ([#6171](https://github.com/MetaMask/core/pull/6171))

## [0.5.0]

### Changed

- **BREAKING:** Add `@metamask/account-api` peer dependency ([#6115](https://github.com/MetaMask/core/pull/6115)), ([#6146](https://github.com/MetaMask/core/pull/6146))
- **BREAKING:** Types `AccountWallet` and `AccountGroup` have been respectively renamed to `AccountWalletObject` and `AccountGroupObject` ([#6115](https://github.com/MetaMask/core/pull/6115))
  - Those names are now used by the `@metamask/account-api` package to define higher-level interfaces.
- **BREAKING:** Bump peer dependency `@metamask/snaps-controllers` from `^12.0.0` to `^14.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/snaps-sdk` from `^7.1.0` to `^9.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Bump `@metamask/snaps-utils` from `^9.4.0` to `^11.0.0` ([#6035](https://github.com/MetaMask/core/pull/6035))
- Properly export `AccountWalletCategory` constant and conversion functions ([#6062](https://github.com/MetaMask/core/pull/6062))

### Removed

- **BREAKING:** No longer export `AccountWalletCategory`, `toAccountWalletId`, `toAccountGroupId` and `toDefaultAccountGroupId` ([#6115](https://github.com/MetaMask/core/pull/6115))
  - You should now import them from the `@metamask/account-api` package (peer dependency).

## [0.4.0]

### Changed

- Update wallet names ([#6024](https://github.com/MetaMask/core/pull/6024))

## [0.3.0]

### Added

- Export ID conversions functions and constants ([#6006](https://github.com/MetaMask/core/pull/6006))

## [0.2.0]

### Changed

- **BREAKING:** Bump peer dependency `@metamask/accounts-controller` to `^31.0.0` ([#5999](https://github.com/MetaMask/core/pull/5999))

## [0.1.1]

### Fixed

- Fix `AccountWallet.metadata` type ([#5947](https://github.com/MetaMask/core/pull/5947))
  - Was using `AccountGroupMetadata` instead of `AccountWalletMetadata`.
- Add `AccountTreeControllerStateChangeEvent` to `AccountTreeControllerEvents` ([#5958](https://github.com/MetaMask/core/pull/5958))

## [0.1.0]

### Added

- Initial release ([#5847](https://github.com/MetaMask/core/pull/5847))
  - Grouping accounts into 3 main categories: Entropy source, Snap ID, keyring types.

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@4.1.1...HEAD
[4.1.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@4.1.0...@metamask/account-tree-controller@4.1.1
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@4.0.0...@metamask/account-tree-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@3.0.0...@metamask/account-tree-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@2.0.0...@metamask/account-tree-controller@3.0.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.6.0...@metamask/account-tree-controller@2.0.0
[1.6.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.5.0...@metamask/account-tree-controller@1.6.0
[1.5.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.4.2...@metamask/account-tree-controller@1.5.0
[1.4.2]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.4.1...@metamask/account-tree-controller@1.4.2
[1.4.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.4.0...@metamask/account-tree-controller@1.4.1
[1.4.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.3.0...@metamask/account-tree-controller@1.4.0
[1.3.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.2.0...@metamask/account-tree-controller@1.3.0
[1.2.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.1.0...@metamask/account-tree-controller@1.2.0
[1.1.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@1.0.0...@metamask/account-tree-controller@1.1.0
[1.0.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.18.1...@metamask/account-tree-controller@1.0.0
[0.18.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.18.0...@metamask/account-tree-controller@0.18.1
[0.18.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.17.0...@metamask/account-tree-controller@0.18.0
[0.17.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.16.1...@metamask/account-tree-controller@0.17.0
[0.16.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.16.0...@metamask/account-tree-controller@0.16.1
[0.16.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.15.1...@metamask/account-tree-controller@0.16.0
[0.15.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.15.0...@metamask/account-tree-controller@0.15.1
[0.15.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.14.0...@metamask/account-tree-controller@0.15.0
[0.14.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.13.1...@metamask/account-tree-controller@0.14.0
[0.13.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.13.0...@metamask/account-tree-controller@0.13.1
[0.13.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.12.1...@metamask/account-tree-controller@0.13.0
[0.12.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.12.0...@metamask/account-tree-controller@0.12.1
[0.12.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.11.0...@metamask/account-tree-controller@0.12.0
[0.11.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.10.0...@metamask/account-tree-controller@0.11.0
[0.10.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.9.0...@metamask/account-tree-controller@0.10.0
[0.9.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.8.0...@metamask/account-tree-controller@0.9.0
[0.8.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.7.0...@metamask/account-tree-controller@0.8.0
[0.7.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.6.0...@metamask/account-tree-controller@0.7.0
[0.6.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.5.0...@metamask/account-tree-controller@0.6.0
[0.5.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.4.0...@metamask/account-tree-controller@0.5.0
[0.4.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.3.0...@metamask/account-tree-controller@0.4.0
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.2.0...@metamask/account-tree-controller@0.3.0
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.1.1...@metamask/account-tree-controller@0.2.0
[0.1.1]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.1.0...@metamask/account-tree-controller@0.1.1
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/account-tree-controller@0.1.0
