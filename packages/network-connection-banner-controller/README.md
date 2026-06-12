# `@metamask/network-connection-banner-controller`

NetworkConnectionBannerController decides when and how to surface the network
connection banner based on RPC endpoint health. It encapsulates the shared
rule, the 5s/30s timer state machine, and the eTLD+1 grouping previously
duplicated across MetaMask clients.

## Initialization

After constructing the controller, call `init()` only after the
`NetworkController`, `NetworkEnablementController`, and
`ConnectivityController` have initialized. Until then, upstream state changes
are ignored and no banner timers run.

```typescript
networkConnectionBannerController.init();
```

`init()` is idempotent and immediately evaluates the latest upstream state.

## Installation

`yarn add @metamask/network-connection-banner-controller`

or

`npm install @metamask/network-connection-banner-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
