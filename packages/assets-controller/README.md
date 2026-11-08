# `@metamask/assets-controller`

Tracks assets balances/prices and handles token detection across all digital assets.

## Installation

`yarn add @metamask/assets-controller`

or

`npm install @metamask/assets-controller`

## `AccountsApiBalancesService`

`AccountsApiBalancesService` is a data service (built on `@metamask/base-data-service`) that fetches multi account balances from the Accounts API v5 and v6 endpoints.

It is deliberately kept out of any client `DATA_SERVICES` list and has no persistence. Its `:cacheUpdated` events carry the full balances response, so forwarding them to a UI would serialize every response across the process boundary. Consume it through the messenger from the background only.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
