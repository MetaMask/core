# `@metamask/network-connection-banner-controller`

NetworkConnectionBannerController decides when and how to surface the network
connection banner based on RPC endpoint health. It encapsulates the rule and
the 5s/30s timer state machine. Both timeouts are configurable via the
`degradedBannerTimeout` and `unavailableBannerTimeout` constructor options
(defaults exported as `DEFAULT_DEGRADED_BANNER_TIMEOUT` and
`DEFAULT_UNAVAILABLE_BANNER_TIMEOUT`); the unavailable timeout is measured
from the same failure start and must be greater than the degraded one.

## Lifecycle

The controller stays dormant after construction so the 5s / 30s escalation
timers do not run before a user is actually looking at the wallet (e.g. while
the app is still on the lock screen). It manages its own lifecycle by
subscribing to `ClientController:stateChanged` and
`KeyringController:unlock` / `KeyringController:lock`: evaluation runs only
while the client UI is open on an unlocked wallet. When either condition
stops holding, pending timers are cancelled and the banner state resets to
`available`; upstream state changes are ignored until both hold again.

Clients need no lifecycle wiring beyond keeping `ClientController`'s
`isUiOpen` up to date (via `ClientController:setUiOpen`).

## Installation

`yarn add @metamask/network-connection-banner-controller`

or

`npm install @metamask/network-connection-banner-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
