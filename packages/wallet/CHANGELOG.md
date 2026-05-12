# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Export `importSecretRecoveryPhrase` from the package root so external callers (such as `@metamask/wallet-cli`) can bootstrap a `Wallet` from a BIP-39 mnemonic without reaching into the `keyring-controller` directly ([#8446](https://github.com/MetaMask/core/pull/8446)).

### Removed

- **BREAKING:** Drop the `better-sqlite3`-backed persistence layer and `./persistence` subpath export ([#8446](https://github.com/MetaMask/core/pull/8446), [#8682](https://github.com/MetaMask/core/issues/8682))
  - The `KeyValueStore`, `loadState`, and `subscribeToChanges` exports previously available via `@metamask/wallet/persistence` have been removed.
  - The `better-sqlite3` and `@types/better-sqlite3` dependencies are no longer pulled in by this package.
  - Consumers should keep their own persistence layer and inject controller state through the existing `state` option on `Wallet`. A Node-only SQLite implementation now lives in `@metamask/wallet-cli`.

[Unreleased]: https://github.com/MetaMask/core/
