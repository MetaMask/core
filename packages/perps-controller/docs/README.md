# Perps controller docs

These docs describe the shared Perps logic in `@metamask/perps-controller`. Each client keeps docs only for its own layer and links back here.

## In this package

| Doc                                                        | What it covers                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                       | Layers, providers, services, platform dependencies, state and caches, connection, errors |
| [formatting.md](./formatting.md)                           | Precision and display formatting rules                                                   |
| [tpsl.md](./tpsl.md)                                       | Order-linked and position-linked TP/SL                                                   |
| [client-contract.md](./client-contract.md)                 | Capability limits, order-book grouping, cross liquidation, error copy, batch status      |
| [contracts/events.md](./contracts/events.md)               | The fixed analytics event set and its property constants                                 |
| [contracts/traces.md](./contracts/traces.md)               | Sentry trace and measurement names                                                       |
| [contracts/feature-flags.md](./contracts/feature-flags.md) | Flags the controller reads                                                               |
| [venues/hyperliquid/](./venues/hyperliquid/README.md)      | How our provider uses HyperLiquid, plus links to HyperLiquid's own docs                  |
| [venues/lighter/](./venues/lighter/)                       | Lighter trading keys and capabilities                                                    |

## Client docs

| Client                    | Perps docs                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Mobile (reference client) | [metamask-mobile/docs/perps](https://github.com/MetaMask/metamask-mobile/blob/main/docs/perps/README.md)       |
| Extension                 | [metamask-extension/docs/perps](https://github.com/MetaMask/metamask-extension/blob/main/docs/perps/README.md) |
| Terminal                  | `va-mmcx-terminal/docs/perps/README.md` (private repository)                                                   |

## Keeping them true

A change to a pattern described here updates the doc in the same PR.
