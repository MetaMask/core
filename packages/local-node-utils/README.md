# `@metamask/local-node-utils`

Shared utilities for MetaMask local node runtime installers such as
`java-tron-up`, `bitcoin-regtest-up`, and `solana-test-validator-up`.

## Installation

`yarn add @metamask/local-node-utils`

or

`npm install @metamask/local-node-utils`

## API

The package exports shared helpers for:

- Resolving MetaMask cache directories from Yarn configuration
- Parsing artifact platform configuration and cache keys
- Downloading release archives with checksum verification
- Extracting archives and installing executable wrappers in `node_modules/.bin`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
