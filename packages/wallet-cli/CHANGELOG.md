# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial release of `@metamask/wallet-cli`, an oclif-based `mm` CLI that runs `@metamask/wallet` as a Unix-socket daemon ([#8446](https://github.com/MetaMask/core/pull/8446)).
  - `mm daemon start` spawns the daemon with `--infura-project-id`, `--password`, `--srp` (or the matching env vars).
  - `mm daemon call <Action> [<jsonArrayParams>]` dispatches any messenger action over JSON-RPC.
  - `mm daemon stop`, `mm daemon status`, `mm daemon purge` manage daemon lifecycle and state.
  - `mm wallet unlock` submits the password to the running daemon for cases where it was started without one (or after the keyring was locked via `KeyringController:setLocked`). Accepts `--password <pw>`, falls back to `MM_WALLET_PASSWORD`, and prompts interactively when neither is supplied.
- Persist daemon state to a SQLite database at `<dataDir>/wallet.db`; subsequent `daemon start` runs reuse the persisted KeyringController vault instead of re-importing the SRP, and the daemon auto-unlocks the keyring with the supplied password so keyring-bound messenger actions (signing, `AccountsController:listAccounts`, etc.) work immediately after a restart. `--password` is optional on subsequent runs: omit it to start with a locked keyring and unlock later with `mm wallet unlock` ([#8446](https://github.com/MetaMask/core/pull/8446)).

[Unreleased]: https://github.com/MetaMask/core/
