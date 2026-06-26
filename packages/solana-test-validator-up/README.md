# `@metamask/solana-test-validator-up`

`solana-test-validator-up` installs a pinned Solana/Agave runtime for local
development and CI. It follows the same runtime-only shape as
`@metamask/foundryup`: this package installs external runtime artifacts into the
MetaMask cache and exposes binaries in `node_modules/.bin`; the consuming test
harness owns process startup, local-validator config, readiness checks, and
seeding.

This package does not use Docker and does not start or seed a Solana node.

## Usage

Install the package in the consuming repo:

```bash
yarn add @metamask/solana-test-validator-up
npm install @metamask/solana-test-validator-up
```

For Yarn v4 projects, it is usually simplest to add package scripts in the
consuming repo:

```json
{
  "scripts": {
    "solana-test-validator-up": "node_modules/.bin/solana-test-validator-up",
    "solana-test-validator": "node_modules/.bin/solana-test-validator",
    "solana": "node_modules/.bin/solana"
  }
}
```

Install solana-test-validator and the Solana CLI:

```bash
yarn solana-test-validator-up install
```

Run the installed validator wrapper:

```bash
node_modules/.bin/solana-test-validator --reset
```

For MetaMask Extension E2E tests, the Solana seeder should spawn
`node_modules/.bin/solana-test-validator`, pass its generated local-validator
ports and ledger directory, poll JSON-RPC directly, and perform all account
seeding itself.

## Installed Artifacts

`solana-test-validator-up` installs:

- a platform-specific Solana/Agave release archive
- a `node_modules/.bin/solana-test-validator` wrapper
- a `node_modules/.bin/solana` wrapper

## CLI

```bash
solana-test-validator-up [install] [options]
solana-test-validator-up cache clean [options]
```

Options:

- `--bin-directory <path>`: directory for generated wrappers. Defaults to
  `node_modules/.bin`.
- `--cache-directory <path>`: artifact cache directory. Defaults to
  `.metamask/cache`.
- `--release-url <url>` and `--release-checksum <hash>`: override the Solana
  release archive for the current platform.
- `--platform <platform>`: override platform selection, for example
  `linux-x64`.

## Default Release

The package currently pins Agave `v3.1.14` for `darwin-arm64`, `darwin-x64`,
and `linux-x64`.

## Cache

The cache defaults to `.metamask/cache` in the current repo. When `.yarnrc.yml`
is parsed as YAML, `enableGlobalCache: true` moves the cache to
`~/.cache/metamask`, matching the `@metamask/foundryup` behavior.

Clean only this package's cache namespace:

```bash
yarn solana-test-validator-up cache clean
```

## Package Config

The consuming repo can override the pinned artifact URLs and checksums in its
root `package.json`:

```json
{
  "solanaTestValidatorUp": {
    "release": {
      "version": "v3.1.14",
      "platforms": {
        "linux-x64": {
          "url": "https://github.com/anza-xyz/agave/releases/download/v3.1.14/solana-release-x86_64-unknown-linux-gnu.tar.bz2",
          "checksum": "06f97c065cc977cbec2f13ffc9bc9d3b92fef485431fcb370a269de69532ef51"
        }
      }
    }
  }
}
```

Supported package config keys are `solanaTestValidatorUp`,
`solanatestvalidatorup`, and `solana-test-validator-up`.
