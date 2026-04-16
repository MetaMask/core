# `@metamask/wallet`

Provides a shared framework for building MetaMask wallets

## Installation

`yarn add @metamask/wallet`

or

`npm install @metamask/wallet`

## Troubleshooting

### Rebuilding `better-sqlite3`

This package depends on `better-sqlite3`, which includes a native C addon. The prebuilt binary is downloaded automatically during `yarn install`. If you switch Node versions without reinstalling, rebuild it with:

```sh
yarn rebuild better-sqlite3
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
