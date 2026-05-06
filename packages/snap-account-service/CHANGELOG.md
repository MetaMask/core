# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `SnapAccountService` ([#8414](https://github.com/MetaMask/core/pull/8414))
- Add `SnapPlatformWatcher`, which waits for the Snap platform to be ready and for a Snap keyring to appear in `KeyringController` state before allowing Snap account operations ([#8715](https://github.com/MetaMask/core/pull/8715))
  - `SnapAccountService.ensureReady` now awaits the watcher, so it only resolves once both conditions hold (or rejects if the Snap keyring does not appear within the configured timeout).
- Add `config` option to `SnapAccountService` constructor with a `snapPlatformWatcher` field exposing `ensureOnboardingComplete` and `snapKeyringWaitTimeoutMs` ([#8715](https://github.com/MetaMask/core/pull/8715))
  - Export `SnapAccountServiceConfig` and `SnapPlatformWatcherConfig` types.
- Add `@metamask/keyring-controller` dependency ([#8715](https://github.com/MetaMask/core/pull/8715))
  - The service messenger now requires the `KeyringController:getState` action and `KeyringController:stateChange` event.

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- **BREAKING:** Remove the top-level `ensureOnboardingComplete` option from `SnapAccountServiceOptions` ([#8715](https://github.com/MetaMask/core/pull/8715))
  - Pass the callback via `config.snapPlatformWatcher.ensureOnboardingComplete` instead.

[Unreleased]: https://github.com/MetaMask/core/
