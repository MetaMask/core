# `@metamask/java-tron-up`

`java-tron-up` installs a pinned native java-tron runtime for local development
and CI. It follows the same runtime-only shape as `@metamask/foundryup`: this
package installs external runtime artifacts into the MetaMask cache and exposes
binaries in `node_modules/.bin`; the consuming test harness owns process
startup, private-network config, readiness checks, and seeding.

This package does not use Docker and does not start or seed a TRON node.

## Usage

Install the package in the consuming repo:

```bash
yarn add @metamask/java-tron-up
npm install @metamask/java-tron-up
```

For Yarn v4 projects, it is usually simplest to add package scripts in the
consuming repo:

```json
{
  "scripts": {
    "java-tron-up": "node_modules/.bin/java-tron-up",
    "java-tron": "node_modules/.bin/java-tron"
  }
}
```

Install java-tron and its managed Java runtime:

```bash
yarn java-tron-up install
```

Run the installed node wrapper:

```bash
node_modules/.bin/java-tron -c /absolute/path/to/fullnode.conf --witness
```

For MetaMask Extension E2E tests, the Tron seeder should spawn
`node_modules/.bin/java-tron`, pass its generated private-network config, poll
java-tron's HTTP APIs directly, and perform all account/token/staking seeding
itself.

## Installed Artifacts

`java-tron-up` installs:

- a platform-specific `FullNode.jar`
- a managed Java runtime matching java-tron's architecture requirements
- a `node_modules/.bin/java-tron` wrapper that runs:

```bash
java -jar FullNode.jar "$@"
```

## CLI

```bash
java-tron-up [install] [options]
java-tron-up cache clean [options]
```

Options:

- `--bin-directory <path>`: directory for generated wrappers. Defaults to
  `node_modules/.bin`.
- `--cache-directory <path>`: artifact cache directory. Defaults to
  `.metamask/cache`.
- `--full-node-url <url>` and `--full-node-checksum <hash>`: override the
  FullNode jar for the current platform.
- `--java-runtime-url <url>` and `--java-runtime-checksum <hash>`: override the
  Java runtime archive for the current platform.
- `--platform <platform>`: override platform selection, for example
  `linux-x64`.

## Default Release

The package currently pins java-tron `GreatVoyage-v4.8.1` for `darwin-arm64`,
`darwin-x64`, `linux-arm64`, and `linux-x64`.

java-tron `4.8.1` requires JDK 8 for x86_64 and JDK 17 for arm64, so this
package installs Azul Zulu Java 8 on x64 platforms and Azul Zulu Java 17 on
arm64 platforms.

## Cache

The cache defaults to `.metamask/cache` in the current repo. The installer reads
`.yarnrc.yml` as YAML and, when `enableGlobalCache` is true, moves the cache to
`~/.cache/metamask`, matching the `@metamask/foundryup` behavior.

Clean only this package's cache namespace:

```bash
yarn java-tron-up cache clean
```

## Package Config

The consuming repo can override the pinned artifact URLs and checksums in its
root `package.json`:

```json
{
  "javaTronUp": {
    "fullNode": {
      "version": "GreatVoyage-v4.8.1",
      "platforms": {
        "linux-x64": {
          "url": "https://github.com/tronprotocol/java-tron/releases/download/GreatVoyage-v4.8.1/FullNode.jar",
          "checksum": "0e67b2fe75d7077750e73c4fa20725c6e9824657275d96be256ae5da681f9945"
        }
      }
    }
  }
}
```

Supported package config keys are `javaTronUp`, `javatronup`, and
`java-tron-up`.
