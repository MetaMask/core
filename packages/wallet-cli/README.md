# `@metamask/wallet-cli`

The CLI of @metamask/wallet

## Installation

`yarn add @metamask/wallet-cli`

or

`npm install @metamask/wallet-cli`

## Troubleshooting

### Rebuilding `better-sqlite3`

This package depends on `better-sqlite3`, which ships a native C addon. The monorepo runs Yarn with `enableScripts: false`, so the addon is **not** fetched automatically during `yarn install`. Instead, the package's `test:prepare` script (`scripts/install-binaries.sh`) downloads the matching prebuild on demand the first time you run tests.

If you switch Node versions or branches and the binding is missing, re-run:

```sh
yarn workspace @metamask/wallet-cli run test:prepare
```

Or invoke `prebuild-install` directly from the monorepo root (where `better-sqlite3` is hoisted):

```sh
cd node_modules/better-sqlite3 && node ../.bin/prebuild-install
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
