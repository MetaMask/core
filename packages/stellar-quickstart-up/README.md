# `@metamask/stellar-quickstart-up`

`stellar-quickstart-up` installs a pinned `stellar/quickstart` Docker image for local
development and CI. It follows the same runtime-only shape as
`@metamask/foundryup`: this package pulls the external runtime image into the
MetaMask cache and exposes a `stellar-quickstart` binary in `node_modules/.bin`;
the consuming test harness owns container lifecycle, readiness checks, and
seeding.

This package requires Docker to be installed and available on `PATH`. It does not
start or seed a Stellar node itself.

## Usage

Install the package in the consuming repo:

```bash
yarn add @metamask/stellar-quickstart-up
npm install @metamask/stellar-quickstart-up
```

For Yarn v4 projects, it is usually simplest to add package scripts in the
consuming repo:

```json
{
  "scripts": {
    "stellar-quickstart-up": "node_modules/.bin/stellar-quickstart-up",
    "stellar-quickstart": "node_modules/.bin/stellar-quickstart"
  }
}
```

Pull the pinned Stellar Quickstart image and install the wrapper:

```bash
yarn stellar-quickstart-up install
```

Run the installed Stellar Quickstart wrapper:

```bash
node_modules/.bin/stellar-quickstart --local
```

For MetaMask Extension E2E tests, the Stellar seeder should spawn
`node_modules/.bin/stellar-quickstart`, pass the desired network mode such as
`--local`, poll Horizon/RPC readiness, and perform wallet/funding seeding itself.

## Installed Artifacts

`stellar-quickstart-up` installs:

- a pinned `stellar/quickstart` Docker image reference in the MetaMask cache
- a `node_modules/.bin/stellar-quickstart` wrapper that forwards to `docker run`

## CLI

```bash
stellar-quickstart-up [install] [options]
stellar-quickstart-up cache clean [options]
```

Options:

- `--bin-directory <path>`: directory for generated wrappers. Defaults to
  `node_modules/.bin`.
- `--cache-directory <path>`: artifact cache directory. Defaults to
  `.metamask/cache`.
- `--docker-binary <path>`: Docker CLI binary. Defaults to `docker`.
- `--image-reference <reference>` and `--image-digest <digest>`: override the
  pinned Stellar Quickstart image.
- `--help`: show help text.

## Default Image

The package currently pins `stellar/quickstart:latest` with digest
`sha256:8ddf3ed87a5c07eab5202b0fd95f06fb5db3f48cacd7e69fdc0e22925f181168`.

The installed wrapper defaults to `docker run --rm -i -p 8000:8000`.

## Cache

The cache defaults to `.metamask/cache` in the current repo. `enableGlobalCache`
is read by parsing `.yarnrc.yml` as YAML; when it is `true`, the cache moves to
`~/.cache/metamask`, matching the `@metamask/foundryup` behavior.

Clean only this package's cache namespace:

```bash
yarn stellar-quickstart-up cache clean
```

## Package Config

The consuming repo can override the pinned image reference and digest in its root
`package.json`:

```json
{
  "stellarQuickstartUp": {
    "image": {
      "version": "latest",
      "reference": "stellar/quickstart:latest",
      "digest": "sha256:8ddf3ed87a5c07eab5202b0fd95f06fb5db3f48cacd7e69fdc0e22925f181168"
    },
    "runArgs": ["run", "--rm", "-i", "-p", "8000:8000"]
  }
}
```

Supported package config keys are `stellarQuickstartUp`, `stellarquickstartup`,
and `stellar-quickstart-up`.
