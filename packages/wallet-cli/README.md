# `@metamask/wallet-cli`

The CLI of @metamask/wallet

## Installation

`yarn add @metamask/wallet-cli`

or

`npm install @metamask/wallet-cli`

## Usage

The CLI drives a long-lived background daemon that holds a `@metamask/wallet` in memory and exposes its messenger over a per-user Unix socket. All commands live under the `mm daemon` and `mm wallet` topics; run `mm --help` (or `mm <topic> <command> --help`) for the full reference.

Start the daemon (flags may also be supplied as the `INFURA_PROJECT_ID`, `MM_WALLET_PASSWORD`, and `MM_WALLET_SRP` environment variables — preferred for secrets):

```sh
# First run — password required to import the secret recovery phrase:
mm daemon start --infura-project-id <key> --password <pw> --srp "<phrase>"

# Subsequent runs — password optional. Omit to start with a locked keyring
# and unlock later with `mm wallet unlock`:
mm daemon start --infura-project-id <key> --srp "<phrase>"
```

Unlock the keyring after a password-less start (or after `KeyringController:setLocked`):

```sh
mm wallet unlock --password <pw>   # or: MM_WALLET_PASSWORD=<pw> mm wallet unlock
mm wallet unlock                   # prompts interactively (input masked)
```

Send a transaction. `--value` is in ether; select the network with `--network-client-id` or `--chain-id`; the sender defaults to the selected account. The command previews the resolved plan and asks for confirmation before broadcasting, then prints the transaction hash:

```sh
mm wallet send --to 0xRecipient --value 0.01 --chain-id 0x1
mm wallet send --to 0xRecipient --value 0.01 --network-client-id mainnet --yes   # skip the prompt
mm wallet send --to 0xContract --data 0xabcdef --value 0 --chain-id 0x1 --dry-run # resolve + validate only
```

Because the daemon auto-approves (see the security note below), the confirmation prompt — or your explicit `--yes` — is the only boundary before funds move; use `--dry-run` first if unsure. Gas is estimated automatically unless overridden with `--gas` / `--max-fee-per-gas` / `--max-priority-fee-per-gas` / `--gas-price` (each a `0x`-prefixed hex quantity).

Discover what the running wallet can do — `list` prints every messenger action currently dispatchable via `call`. This surface grows as more controllers are wired, so treat it as evolving rather than a stability contract:

```sh
mm daemon list
```

Call any messenger action on the running wallet (positional JSON array for arguments, optional `--timeout`):

```sh
mm daemon call KeyringController:getState
mm daemon call NetworkController:getState --timeout 10000
```

For the exact parameters and return shape of a given action, see the TypeDoc/README of the controller that owns it (e.g. [`@metamask/keyring-controller`](https://github.com/MetaMask/core/tree/main/packages/keyring-controller#readme)).

Inspect or tear it down:

```sh
mm daemon status          # PID + uptime, or why the socket is unreachable
mm daemon stop            # graceful shutdown (falls back to SIGTERM/SIGKILL)
mm daemon purge           # stop, then delete all daemon state files (--force to skip the prompt)
```

State (socket, PID file, log, and the SQLite database) lives in the per-user oclif data directory; override it with `MM_DATA_DIR`.

> **Security model — the daemon auto-approves everything.** Because it is headless, the daemon accepts every approval request (transactions and signatures included) with no per-request prompt; otherwise an awaited request would hang forever with no UI to resolve it. The trust boundary is therefore the daemon's `0600`, same-user Unix socket — anything that can reach the socket can move funds. For `mm wallet send` the confirmation prompt (or `--yes`) is the only per-transaction gate; the daemon itself still applies no per-request policy.

## Troubleshooting

### Rebuilding `better-sqlite3`

This package depends on `better-sqlite3`, which ships a native C addon. The monorepo runs Yarn with `enableScripts: false`, so the addon is **not** fetched automatically during `yarn install`. Instead, the package's `test:prepare` script (`scripts/install-binaries.sh`) downloads the matching prebuild on demand the first time you run tests, falling back to compiling the addon from source (via `node-gyp`) when no prebuild is published for your Node ABI/platform.

If you switch Node versions or branches and the binding is missing, re-run:

```sh
yarn workspace @metamask/wallet-cli run test:prepare
```

Or invoke `prebuild-install` directly from the monorepo root (where `better-sqlite3` is hoisted):

```sh
cd node_modules/better-sqlite3 && node ../.bin/prebuild-install
```

## Testing

Unit tests run with `yarn workspace @metamask/wallet-cli test`.

The subprocess end-to-end suite (in `tests/`) spawns the built `mm` CLI and the native `better-sqlite3` addon as real processes, so it is kept out of the unit run and its coverage gate. Build the workspace dependencies first (`yarn build` from the repo root), then run it with `yarn workspace @metamask/wallet-cli test:e2e`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
