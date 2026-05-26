# `@metamask/wallet`

Provides a shared framework for building MetaMask wallets

## Installation

`yarn add @metamask/wallet`

or

`npm install @metamask/wallet`

## Usage

### Persistence contract

`@metamask/wallet` has no persistence backend of its own. Clients own persistence entirely:

**Hydration (boot):** Pass an initial `state` object keyed by controller name to the `Wallet` constructor.

```ts
const wallet = new Wallet({
  state: {
    AccountsController: { ... },
    NetworkController: { ... },
  },
  // ...other options
});
```

The shape matches each controller's own state type. Unknown keys are ignored; missing keys fall back to each controller's default state.

**Writes (runtime):** Subscribe to each controller's `:stateChanged` event on `wallet.messenger` and persist the relevant fields as reported by `wallet.controllerMetadata`.

```ts
for (const [name, metadata] of Object.entries(wallet.controllerMetadata)) {
  wallet.messenger.subscribe(`${name}:stateChanged`, (state, patches) => {
    // Write persist-flagged fields to your storage backend.
    // metadata[field].persist === true (or a StateDeriver) means the field should be persisted.
  });
}
```

The `patches` argument contains Immer patches identifying exactly which top-level fields changed, so writes can be scoped rather than full-state replacements.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
