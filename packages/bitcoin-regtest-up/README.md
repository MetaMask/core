# `@metamask/bitcoin-regtest-up`

`bitcoin-regtest-up` installs a pinned Bitcoin Core runtime for local
development and CI. It follows the same runtime-only shape as
`@metamask/foundryup`: this package installs external runtime artifacts into the
MetaMask cache and exposes binaries in `node_modules/.bin`; the consuming test
harness owns process startup, regtest config, readiness checks, and seeding.

This package does not use Docker and does not start or seed a Bitcoin node.

## Usage

Install the package in the consuming repo:

```bash
yarn add @metamask/bitcoin-regtest-up
npm install @metamask/bitcoin-regtest-up
```

For Yarn v4 projects, it is usually simplest to add package scripts in the
consuming repo:

```json
{
  "scripts": {
    "bitcoin-regtest-up": "node_modules/.bin/bitcoin-regtest-up",
    "bitcoind": "node_modules/.bin/bitcoind",
    "bitcoin-cli": "node_modules/.bin/bitcoin-cli"
  }
}
```

Install bitcoind and bitcoin-cli:

```bash
yarn bitcoin-regtest-up install
```

Run the installed Bitcoin Core wrappers:

```bash
node_modules/.bin/bitcoind -regtest
node_modules/.bin/bitcoin-cli -regtest getblockchaininfo
```

For MetaMask Extension E2E tests, the Bitcoin seeder should spawn
`node_modules/.bin/bitcoind`, pass its generated regtest datadir and ports, use
`node_modules/.bin/bitcoin-cli` for node setup, poll JSON-RPC directly, and
perform all wallet/funding seeding itself.

## Installed Artifacts

`bitcoin-regtest-up` installs:

- a platform-specific Bitcoin Core release archive
- a `node_modules/.bin/bitcoind` wrapper
- a `node_modules/.bin/bitcoin-cli` wrapper

## CLI

```bash
bitcoin-regtest-up [install] [options]
bitcoin-regtest-up cache clean [options]
```

Options:

- `--bin-directory <path>`: directory for generated wrappers. Defaults to
  `node_modules/.bin`.
- `--cache-directory <path>`: artifact cache directory. Defaults to
  `.metamask/cache`.
- `--bitcoin-core-url <url>` and `--bitcoin-core-checksum <hash>`: override the
  Bitcoin Core archive for the current platform.
- `--platform <platform>`: override platform selection, for example
  `linux-x64`.

## Default Release

The package currently pins Bitcoin Core `30.2` for `darwin-arm64`,
`darwin-x64`, `linux-arm64`, and `linux-x64`.

## Cache

The cache defaults to `.metamask/cache` in the current repo. `enableGlobalCache`
is read by parsing `.yarnrc.yml` as YAML; when it is `true`, the cache moves to
`~/.cache/metamask`, matching the `@metamask/foundryup` behavior.

Clean only this package's cache namespace:

```bash
yarn bitcoin-regtest-up cache clean
```

## Package Config

The consuming repo can override the pinned artifact URLs and checksums in its
root `package.json`:

```json
{
  "bitcoinRegtestUp": {
    "bitcoinCore": {
      "version": "30.2",
      "platforms": {
        "linux-x64": {
          "url": "https://bitcoincore.org/bin/bitcoin-core-30.2/bitcoin-30.2-x86_64-linux-gnu.tar.gz",
          "checksum": "6aa7bb4feb699c4c6262dd23e4004191f6df7f373b5d5978b5bcdd4bb72f75d8"
        }
      }
    }
  }
}
```

Supported package config keys are `bitcoinRegtestUp`, `bitcoinregtestup`, and
`bitcoin-regtest-up`.
