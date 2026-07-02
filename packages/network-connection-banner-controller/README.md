# `@metamask/network-connection-banner-controller`

NetworkConnectionBannerController decides when and how to surface the network
connection banner based on RPC endpoint health. It encapsulates the shared
rule, the 5s/30s timer state machine, and the eTLD+1 grouping previously
duplicated across MetaMask clients.

## Lifecycle

The controller stays dormant after construction so the 5s / 30s escalation
timers do not run before a user is actually looking at the wallet (e.g. while
the app is still on the lock screen). The UI that renders the banner is
responsible for driving the lifecycle:

```typescript
// When the wallet UI that shows the banner becomes active
// (e.g. the home surface mounts after unlock):
networkConnectionBannerController.start();

// When it goes away:
networkConnectionBannerController.stop();
```

Both methods are idempotent. `start` runs the initial evaluation immediately
and enables reactions to upstream state changes. `stop` cancels any pending
timers and resets the banner state to `available`. Upstream state changes are
ignored while stopped.

## Installation

`yarn add @metamask/network-connection-banner-controller`

or

`npm install @metamask/network-connection-banner-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
