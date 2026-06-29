# `@metamask/stellar-quickstart-up`

`stellar-quickstart-up` installs a pinned [Stellar Quickstart](https://github.com/stellar/quickstart)
Docker image for local development and CI. It follows the same runtime-only shape as
`@metamask/foundryup`: this package pulls the image into the local Docker daemon,
stores image metadata in the MetaMask cache, and exposes a `stellar-quickstart`
wrapper in `node_modules/.bin`; the consuming test harness owns container
lifecycle, readiness checks, and seeding.

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
`--local`, poll Horizon or RPC readiness, and perform wallet/funding seeding
itself.

## Installed Artifacts

`stellar-quickstart-up` installs:

- a digest-pinned `stellar/quickstart` Docker image in the local Docker daemon
- cached image metadata under the MetaMask cache
- a `node_modules/.bin/stellar-quickstart` wrapper that runs:

```bash
docker run --rm -i -p 8000:8000 stellar/quickstart:latest "$@"
```

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
- `--docker-binary <path>`: Docker CLI binary. Defaults to `docker` on `PATH`.
- `--image-reference <reference>` and `--image-digest <digest>`: override the
  pinned Stellar Quickstart image.
- `--help`: show help text.

## Default Image

The package currently pins `stellar/quickstart:latest` with digest
`sha256:8ddf3ed87a5c07eab5202b0fd95f06fb5db3f48cacd7e69fdc0e22925f181168`.

The installer verifies the digest against the image `RepoDigests` reported by
`docker image inspect` after `docker pull`.

The installed wrapper defaults to `docker run --rm -i -p 8000:8000` and forwards
extra arguments to the container entrypoint, for example `--local`, `--testnet`,
or `--pubnet`.

With the default port mapping, the Quickstart services are available at:

- Horizon: `http://localhost:8000/`
- RPC: `http://localhost:8000/rpc`
- Friendbot: `http://localhost:8000/friendbot`

## Cache

The cache defaults to `.metamask/cache` in the current repo. `enableGlobalCache`
is read by parsing `.yarnrc.yml` as YAML; when it is `true`, the cache moves to
`~/.cache/metamask`, matching the `@metamask/foundryup` behavior.

Clean only this package's cache namespace:

```bash
yarn stellar-quickstart-up cache clean
```

## Package Config

The consuming repo can override the pinned image reference, digest, and wrapper
`docker run` arguments in its root `package.json`:

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
