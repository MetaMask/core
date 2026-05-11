# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `SnapAccountService` ([#8414](https://github.com/MetaMask/core/pull/8414))
- Add `SnapPlatformWatcher` and `SnapAccountService.ensureReady` ([#8715](https://github.com/MetaMask/core/pull/8715)), ([#8725](https://github.com/MetaMask/core/pull/8725))
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

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))

[Unreleased]: https://github.com/MetaMask/core/
