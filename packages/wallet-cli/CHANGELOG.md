# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Wire the `transactionController` slot in the daemon wallet's instance options, so the daemon runs the `TransactionController` with an explicit CLI-appropriate configuration (swaps processing disabled, no client hooks) rather than relying on the controller's implicit defaults ([#9509](https://github.com/MetaMask/core/pull/9509))
- Add the `mm wallet unlock` command, which dispatches `KeyringController:submitPassword` over the daemon socket, allowing the keyring to be unlocked after a daemon start with no password or after a `mm daemon call KeyringController:setLocked` ([#8821](https://github.com/MetaMask/core/pull/8821))
- Add the `mm daemon list` command, which prints the messenger actions the running daemon can dispatch via `daemon call`, enumerated from the live messenger so the list cannot drift from what `call` accepts ([#9339](https://github.com/MetaMask/core/pull/9339))
- Add the `mm daemon` command suite (`start`, `stop`, `status`, `purge`, and `call`) for running the wallet daemon and dispatching messenger actions over its socket ([#9255](https://github.com/MetaMask/core/pull/9255))
- Add a wallet factory and daemon entry point that construct a `@metamask/wallet` `Wallet` backed by the SQLite key-value store, hydrate it from persisted state, run controller initialization (aborting startup if any step fails), import the secret recovery phrase on first run, and expose a `dispose` teardown handle ([#9226](https://github.com/MetaMask/core/pull/9226))
- Add a daemon transport layer: a JSON-RPC client and server over a Unix socket, plus daemon spawn/stop lifecycle helpers ([#9108](https://github.com/MetaMask/core/pull/9108))
- Add SQLite-backed persistence for wallet controller state ([#9067](https://github.com/MetaMask/core/pull/9067))
- Initial package scaffold for `@metamask/wallet-cli`, an [oclif](https://oclif.io)-based `mm` CLI for `@metamask/wallet` ([#9065](https://github.com/MetaMask/core/pull/9065)).

### Changed

- **BREAKING:** Bump minimum Node.js version to 22 ([#9168](https://github.com/MetaMask/core/pull/9168))
- `--password` / `MM_WALLET_PASSWORD` is now optional on `mm daemon start`; on subsequent runs, omitting it starts the daemon with a locked keyring, and the persisted vault is auto-unlocked when a password is supplied ([#8821](https://github.com/MetaMask/core/pull/8821))
- The daemon RPC server now validates `params` against each handler's superstruct before dispatch, returning a `-32602 invalidParams` error on mismatch instead of passing raw params to the handler ([#8846](https://github.com/MetaMask/core/pull/8846))
- Report daemon socket connection errors consistently across `mm daemon call` and `mm daemon list` ([#9339](https://github.com/MetaMask/core/pull/9339))
- Bump `@metamask/wallet` from `^3.0.0` to `^7.0.1` ([#9218](https://github.com/MetaMask/core/pull/9218), [#9263](https://github.com/MetaMask/core/pull/9263), [#9349](https://github.com/MetaMask/core/pull/9349), [#9396](https://github.com/MetaMask/core/pull/9396), [#9470](https://github.com/MetaMask/core/pull/9470))
- Wrap daemon password and SRP in opaque `Password` and `Srp` types that redact on logging; validated and unwrapped only at trust boundaries ([#8863](https://github.com/MetaMask/core/pull/8863))

[Unreleased]: https://github.com/MetaMask/core/
