# `@metamask/money-account-api-data-service`

Data service for fetching Money account positions, interest, cash-flow history, and vault rate history from the Money Account API.

## Installation

`yarn add @metamask/money-account-api-data-service`

or

`npm install @metamask/money-account-api-data-service`

## Usage

This package exports a `MoneyAccountApiDataService` class that exposes the following methods through the messenger pattern:

- **`fetchPositions`** — Fetch user vault positions from the Money Account API.
- **`fetchInterest`** — Fetch interest earned over a time window.
- **`fetchHistory`** — Fetch cursor-paginated cash-flow history.
- **`fetchRateHistory`** — Fetch vault exchange-rate time series.

See the [main `MoneyAccountApiDataService` source](./src/money-account-api-data-service.ts) for full API details.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
