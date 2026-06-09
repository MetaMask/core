# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add SQLite-backed persistence for wallet controller state ([#9067](https://github.com/MetaMask/core/pull/9067))
  - A `KeyValueStore` backed by `better-sqlite3` for synchronous reads and writes.
  - `loadState` to rehydrate controller state from the store and `subscribeToChanges` to write persist-flagged controller state through to disk on every `stateChanged` event.
- Initial package scaffold for `@metamask/wallet-cli`, an [oclif](https://oclif.io)-based `mm` CLI for `@metamask/wallet` ([#9065](https://github.com/MetaMask/core/pull/9065)).

[Unreleased]: https://github.com/MetaMask/core/
