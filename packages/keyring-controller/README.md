# `@metamask/keyring-controller`

Stores identities seen in the wallet and manages interactions such as signing.

## Installation

`yarn add @metamask/keyring-controller`

or

`npm install @metamask/keyring-controller`

## Design

See [Vault transactions and atomic keyrings](./docs/vault-transactions.md) for
transaction scopes, rollback behavior, atomic commit windows, and the related PR stack.

## Lock timing diagnostics

Enable `DEBUG=metamask:keyring-controller*` to see lock timing
logs (using the same project/module logger setup as other controllers).

Each controller or vault mutex acquisition logs `Lock requested`, `Lock acquired`,
`Lock released`, and `Locked operation finished`, correlated by `id` and labeled
with the lock and operation names. Durations use a monotonic clock, in milliseconds:

- `waitMs`: time spent waiting to acquire the mutex.
- `holdMs`: time the mutex was actually held, including transaction setup,
  persistence, and any rollback.
- `totalMs`: time from requesting the mutex until the operation finishes.
- `success`: whether the operation completed without throwing.

For `withKeyring` and `withKeyringV2`, release/completion logs also include
`keyring: { type, id, kind }`, with kind `v1` or `v2`. The kind describes
the access path, while the type always identifies the underlying keyring, not
its V2 adapter. Metadata is added after selection inside the lock, so request
and acquisition logs do not include it. Wallet-wide operations omit these fields.

Atomic keyrings run their operations outside the controller mutex. Separate
start/finish logs report their full `durationMs`, while `atomicUpdate` lock logs
measure only their controller-side commit windows. The keyring's own internal
lock wait/hold times are not observable by this controller. Atomic operation
logs include the selected keyring metadata; `atomicUpdate` release/completion
logs use `keyring.kind: 'commit'`, since commits can originate internally without
a V1/V2 access path. Rejected updates from detached keyrings omit metadata
because the registered entry no longer exists. Unsafe read-only
operations do not acquire a mutex and do not produce lock timing logs.

Logs omit operation arguments, results, and errors to avoid exposing secrets.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
