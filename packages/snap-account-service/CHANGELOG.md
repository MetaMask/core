# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0]

### Added

- Add `SnapAccountService{GetLegacySnapKeyring,HandleKeyringSnapMessage}Action` ([#8842](https://github.com/MetaMask/core/pull/8842))

## [0.1.0]

### Added

- Add `SnapAccountService` ([#8414](https://github.com/MetaMask/core/pull/8414))
- Add `SnapPlatformWatcher` and `SnapAccountService.ensureReady` ([#8715](https://github.com/MetaMask/core/pull/8715)), ([#8725](https://github.com/MetaMask/core/pull/8725)), ([#8732](https://github.com/MetaMask/core/pull/8732))
  - Waits for the Snap platform to be ready and for a Snap keyring to appear in `KeyringController` state before allowing Snap account operations.
  - Callers must ensure `init()` has run and the Snap is currently installed, enabled, non-blocked, and declares `endowment:keyring`.
  - `SnapAccountService.ensureReady` now awaits the watcher, so it only resolves once both conditions hold (or rejects if the Snap keyring does not appear within the configured timeout).
  - `SnapAccountService.ensureReady` now throws `Unknown snap: "<id>"` when called with a Snap ID that isn't tracked as an account-management Snap.
  - `SnapAccountService.ensureReady` now automatically creates the Snap keyring (v2) for a given Snap ID if it was not available.
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
- Forward selected account group accounts ([#8763](https://github.com/MetaMask/core/pull/8763)), ([#8770](https://github.com/MetaMask/core/pull/8770))
  - This logic used to live on the clients.
  - The service messenger now requires the `KeyringController:unlock`, `AccountTreeController:selectedAccountGroupChange`, `AccountTreeController:accountGroup{Created,Updated,Removed}` events.
  - The service messenger now requires the `AccountTreeController:getSelectedAccountGroup` and `AccountTreeController:getAccountGroupObject` actions.
- Add `migrate` ([#8732](https://github.com/MetaMask/core/pull/8732))
  - The migration is guaranteed to be run when using `ensureReady`.
  - If the migration is not successful, it will get retried everytime we need to interact with any Snap keyring (v2) instances.
  - It is conccurent-free and can safely be called by multiple execution flows.
  - Once the migration has ran, the legacy Snap keyring will be emptied, thus, consumers are expected to use the new per-Snap keyring (v2) instances instead.

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- Bump `@metamask/account-tree-controller` from `^7.3.0` to `^7.4.0` ([#8783](https://github.com/MetaMask/core/pull/8783))

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/snap-account-service@0.2.0...HEAD
[0.2.0]: https://github.com/MetaMask/core/compare/@metamask/snap-account-service@0.1.0...@metamask/snap-account-service@0.2.0
[0.1.0]: https://github.com/MetaMask/core/releases/tag/@metamask/snap-account-service@0.1.0
