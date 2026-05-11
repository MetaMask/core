# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Persist controller state to a `better-sqlite3` key-value store inside the daemon's data directory ([#8682](https://github.com/MetaMask/core/issues/8682))
  - The persistence layer (`KeyValueStore`, `loadState`, `subscribeToChanges`) moves here from `@metamask/wallet`.
  - The daemon writes to `<dataDir>/wallet.db`, hydrates the `Wallet` from the store on startup, subscribes to the `:stateChanged` events of controllers that declare persist-flagged state for write-through persistence, and closes the store during shutdown.
  - On subsequent runs the daemon reuses the persisted KeyringController vault instead of re-importing the supplied SRP. The wallet still starts locked; unlock is the caller's responsibility.

[Unreleased]: https://github.com/MetaMask/core/
