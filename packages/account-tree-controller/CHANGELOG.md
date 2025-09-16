# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Use `:getSelectedMultichainAccount` instead of `:getSelectedAccount` to compute currently selected account group ([#6608](https://github.com/MetaMask/core/pull/6608))
  - Coming from the old account model, a non-EVM account could have been selected and the lastly selected EVM account might not be using the same group index.
- Bump `@metamask/utils` from `^11.4.2` to `^11.8.0` ([#6588](https://github.com/MetaMask/core/pull/6588))
- Bump `@metamask/base-controller` from `^8.3.0` to `^8.4.0` ([#6632](https://github.com/MetaMask/core/pull/6632))

### Removed

- Remove use of `:getSelectedAccount` action ([#6608](https://github.com/MetaMask/core/pull/6608))

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

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/account-tree-controller@0.15.1...HEAD
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
