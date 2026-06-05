# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0]

### Added

- Add `SnapAccountService:account{AssetList,Balances,Transactions}Updated` events ([#8916](https://github.com/MetaMask/core/pull/8916))

### Changed

- Faster `:getLegacySnapKeyring` ([#8865](https://github.com/MetaMask/core/pull/8865))
  - We now check if the keyring exists with `:withKeyringUnsafe` and returns it right away.
  - If the keyring does not exist yet, we do create it with `:withController` (next calls will then be faster thanks to `:withKeyringUnsafe` pre-check).
- Bump `@metamask/account-tree-controller` from `^7.5.0` to `^7.5.1` ([#8999](https://github.com/MetaMask/core/pull/8999))

### Fixed

- Re-publish account-data update events from `:handleKeyringSnapMessage` without requiring the legacy Snap keyring.
- Prevent double-lock in `:handleKeyringSnapMessage` for some events/methods ([#8860](https://github.com/MetaMask/core/pull/8860))
  - The service messenger now requires the `KeyringController:withKeyringUnsafe` action.
  - We now check if the keyring is available before delegating those messages.
  - We still auto-create the keyring in some specific calls (e.g `notify:accountCreated`).

## Removed

- Removed `init` in favor of synchronous initialization when constructing the service ([#8877](https://github.com/MetaMask/core/pull/8877))

## [0.2.1]

### Changed

- Bump `@metamask/keyring-controller` from `^25.5.0` to `^26.0.0` ([#8912](https://github.com/MetaMask/core/pull/8912))
- Bump `@metamask/account-tree-controller` from `^7.4.0` to `^7.5.0` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [0.2.0]

### Added

- Add `SnapAccountService{GetLegacySnapKeyring,HandleKeyringSnapMessage}Action` ([#8842](https://github.com/MetaMask/core/pull/8842))

## [0.1.0]

### Added

- Add `SnapAccountService` ([#8414](https://github.com/MetaMask/core/pull/8414))
- Add `SnapPlatformWatcher` and `SnapAccountService.ensureReady` ([#8715](https://github.com/MetaMask/core/pull/8715), [#8725](https://github.com/MetaMask/core/pull/8725))
  - Waits for the Snap platform to be ready and for a Snap keyring to appear in `KeyringController` state before allowing Snap account operations.
  - Callers must ensure `init()` has run and the Snap is currently installed, enabled, non-blocked, and declares `endowment:keyring`.
  - `SnapAccountService.ensureReady` now awaits the watcher, so it only resolves once both conditions hold (or rejects if the Snap keyring does not appear within the configured timeout).
  - `SnapAccountService.ensureReady` now throws `Unknown snap: "<id>"` when called with a Snap ID that isn't tracked as an account-management Snap.
- Add `config` option to `SnapAccountService` constructor with a `snapPlatformWatcher` field exposing `ensureOnboardingComplete` and `snapKeyringWaitTimeoutMs` ([#8715](https://github.com/MetaMask/core/pull/8715))
  - Export `SnapAccountServiceConfig` and `SnapPlatformWatcherConfig` types.
- Add `@metamask/keyring-controller` dependency ([#8715](https://github.com/MetaMask/core/pull/8715))
  - The service messenger now requires the `KeyringController:getState` action and `KeyringController:stateChange` event.
- Add `getSnaps` action to `SnapAccountService`, returning the IDs of installed, enabled, non-blocked Snaps that declare the `endowment:keyring` permission ([#8725](https://github.com/MetaMask/core/pull/8725))
  - Export `SnapAccountServiceGetSnapsAction` type.
  - The service now seeds its internal set from `SnapController:getRunnableSnaps` during `init()` and keeps it in sync via `SnapController` lifecycle events (`snapInstalled`, `snapEnabled`, `snapDisabled`, `snapBlocked`, `snapUninstalled`).
  - The service messenger now requires the `SnapController:getRunnableSnaps` action and the five lifecycle events listed above.
- Add `getLegacySnapKeyring` ([#8757](https://github.com/MetaMask/core/pull/8757))
  - This is a concurrent-safe variant of the existing `getSnapKeyring` function that exist on clients.
  - The service messenger now requires the `KeyringController:withController` action.
- Add `handleKeyringSnapMessage` ([#8758](https://github.com/MetaMask/core/pull/8758))
  - This will be the new entry point for consumer that needs to forward keyring events to a account management Snap (instead of using the legacy Snap keyring instance directly).
- Forward selected account group accounts ([#8763](https://github.com/MetaMask/core/pull/8763), [#8770](https://github.com/MetaMask/core/pull/8770))
  - This logic used to live on the clients.
  - The service messenger now requires the `KeyringController:unlock`, `AccountTreeController:selectedAccountGroupChange`, `AccountTreeController:accountGroup{Created,Updated,Removed}` events.
  - The service messenger now requires the `AccountTreeController:getSelectedAccountGroup` and `AccountTreeController:getAccountGroupObject` actions.

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/account-tree-controller` from `^7.3.0` to `^7.4.0` ([#8783](https://github.com/MetaMask/core/pull/8783))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/snap-account-service@0.3.0...HEAD
[0.3.0]: https://github.com/MetaMask/core/compare/@metamask/snap-account-service@0.2.1...@metamask/snap-account-service@0.3.0
[0.2.1]: https://github.com/MetaMask/core/compare/@metamask/snap-account-service@0.2.0...@metamask/snap-account-service@0.2.1
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/snap-account-service@0.1.0...@metamask/snap-account-service@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/snap-account-service@0.1.0
