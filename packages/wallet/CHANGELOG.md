# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `Wallet` class with a bundled controller ensemble (AccountsController, ApprovalController, ConnectivityController, KeyringController, NetworkController, RemoteFeatureFlagController, TransactionController) ([#XXXX](https://github.com/MetaMask/core/pull/XXXX))
  - Pass `state` keyed by controller name to the constructor to hydrate from a stored snapshot. Subscribe to `${ControllerName}:stateChanged` events on `wallet.messenger` to write changes back to your storage backend. See the README for details.
- Add optional `prevClientVersion` field to `WalletOptions` ([#XXXX](https://github.com/MetaMask/core/pull/XXXX))
  - Passed to `RemoteFeatureFlagController` to trigger cache invalidation when the client version changes.
- Add optional `fetch` field to `WalletOptions` ([#XXXX](https://github.com/MetaMask/core/pull/XXXX))
  - Overrides the `fetch` implementation used by `NetworkController`'s RPC service. Defaults to `globalThis.fetch`. Allows platform-specific fetch implementations (e.g. React Native) to be injected.

[Unreleased]: https://github.com/MetaMask/core/
