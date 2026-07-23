# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add the `mm wallet send` command and a dedicated daemon `sendTransaction` RPC handler for sending a transaction through the daemon-hosted `TransactionController` ([#9513](https://github.com/MetaMask/core/issues/9513))
  - The command converts the ether `--value` to wei, resolves the network client (`--network-client-id` or `--chain-id`) and sender (defaulting to the selected account), previews the resolved plan, and broadcasts after confirmation, printing the resulting transaction hash. `--yes` skips the prompt; `--dry-run` resolves and validates without broadcasting.
  - The `sendTransaction` handler awaits the broadcast server-side and returns a serializable `{ transactionHash, transactionId, status }`, because `addTransaction`'s `result` promise cannot travel back over the generic `call` dispatch. Transactions are submitted as internal (auto-approved by the daemon).
- Auto-accept pending approval requests in the daemon so a transaction or signature flow resolves instead of hanging on the headless no-op `showApprovalRequest`; the subscription is torn down on `dispose` ([#9612](https://github.com/MetaMask/core/pull/9612))
  - **Security note:** the daemon approves every request without a per-request prompt; the trust boundary is its `0600`, same-user Unix socket.
- Wire the `transactionController` slot in the daemon wallet's instance options, so the daemon runs the `TransactionController` with an explicit CLI-appropriate configuration (swaps processing disabled, no client hooks) rather than relying on the controller's implicit defaults ([#9509](https://github.com/MetaMask/core/pull/9509))
- Wire the `gasFeeController` slot in the daemon wallet's instance options, passing `clientId: 'cli'` so the CLI identifies itself to the gas estimation API, now that `@metamask/wallet` requires this option ([#9527](https://github.com/MetaMask/core/pull/9527))
- Add the `mm wallet unlock` command, which dispatches `KeyringController:submitPassword` over the daemon socket, allowing the keyring to be unlocked after a daemon start with no password or after a `mm daemon call KeyringController:setLocked` ([#8821](https://github.com/MetaMask/core/pull/8821))
- Add the `mm daemon list` command, which prints the messenger actions the running daemon can dispatch via `daemon call`, enumerated from the live messenger so the list cannot drift from what `call` accepts ([#9339](https://github.com/MetaMask/core/pull/9339))
- Add the `mm daemon` command suite (`start`, `stop`, `status`, `purge`, and `call`) for running the wallet daemon and dispatching messenger actions over its socket ([#9255](https://github.com/MetaMask/core/pull/9255))
- Add a wallet factory and daemon entry point that construct a `@metamask/wallet` `Wallet` backed by the SQLite key-value store, hydrate it from persisted state, run controller initialization (aborting startup if any step fails), import the secret recovery phrase on first run, and expose a `dispose` teardown handle ([#9226](https://github.com/MetaMask/core/pull/9226))
- Add a daemon transport layer: a JSON-RPC client and server over a Unix socket, plus daemon spawn/stop lifecycle helpers ([#9108](https://github.com/MetaMask/core/pull/9108))
- Add SQLite-backed persistence for wallet controller state ([#9067](https://github.com/MetaMask/core/pull/9067))
- Initial package scaffold for `@metamask/wallet-cli`, an [oclif](https://oclif.io)-based `mm` CLI for `@metamask/wallet` ([#9065](https://github.com/MetaMask/core/pull/9065)).

### Changed

- The daemon client (`sendCommand`) now retries only on `ECONNREFUSED`, not `ECONNRESET`, since a reset can drop after the daemon has already acted on a request — re-sending could execute a non-idempotent action (e.g. a transaction broadcast) twice ([#9608](https://github.com/MetaMask/core/pull/9608))
- `--password` / `MM_WALLET_PASSWORD` is now optional on `mm daemon start`; on subsequent runs, omitting it starts the daemon with a locked keyring, and the persisted vault is auto-unlocked when a password is supplied ([#8821](https://github.com/MetaMask/core/pull/8821))
- The daemon RPC server now validates `params` against each handler's superstruct before dispatch, returning a `-32602 invalidParams` error on mismatch instead of passing raw params to the handler ([#8846](https://github.com/MetaMask/core/pull/8846))
- Report daemon socket connection errors consistently across `mm daemon call` and `mm daemon list` ([#9339](https://github.com/MetaMask/core/pull/9339))
- Bump `@metamask/wallet` from `^3.0.0` to `^8.1.0` ([#9218](https://github.com/MetaMask/core/pull/9218), [#9263](https://github.com/MetaMask/core/pull/9263), [#9349](https://github.com/MetaMask/core/pull/9349), [#9396](https://github.com/MetaMask/core/pull/9396), [#9470](https://github.com/MetaMask/core/pull/9470), [#9609](https://github.com/MetaMask/core/pull/9609), [#9629](https://github.com/MetaMask/core/pull/9629))
- Wrap daemon password and SRP in opaque `Password` and `Srp` types that redact on logging; validated and unwrapped only at trust boundaries ([#8863](https://github.com/MetaMask/core/pull/8863))

[Unreleased]: https://github.com/MetaMask/core/
