# `@metamask/money-account-balance-service`

Data service for Money account balances. For presentation, prefer
`fetchBalanceWithFallback`, which selects between the Money Account API and
on-chain Multicall3 RPC according to the `moneyAccountBalanceSource` remote
feature flag.

Also provides lower-level RPC helpers (mUSD / vmUSD / exchange rate), plus
vault APY from Veda's REST API.

## Canonical balance facade

```ts
const result = await service.fetchBalanceWithFallback(accountAddress);
// {
//   musdBalance, vmusdValueInMusd, totalBalance,
//   source: 'api' | 'rpc',
//   usedFallback: boolean,
// }
```

### Feature flag: `moneyAccountBalanceSource`

| Value                                 | Behavior                        |
| ------------------------------------- | ------------------------------- |
| `rpc` (default when absent/malformed) | RPC primary, Money API fallback |
| `api`                                 | Money API primary, RPC fallback |
| `rpc-only`                            | RPC only (no fallback)          |
| `api-only`                            | Money API only (no fallback)    |

Callers must not select a source. Provenance (`source`, `usedFallback`) is
always returned so fallback is never silent. When both eligible sources fail,
the service throws `MoneyAccountBalanceFetchError` (with `causes`) and never
invents a zero balance.

Malformed or unavailable source balances
(`MoneyAccountBalanceValidationError` / `MoneyAccountBalanceUnavailableError`)
are reported via the messenger's `captureException` before fallback.

### Messenger wiring

The facade calls `MoneyAccountApiDataService:fetchPositions`. Client
composition must permit that action on the balance-service messenger (same
pattern as NetworkController / RemoteFeatureFlagController actions).

### POC resilience note

Balance RPC and third-party vault APY currently share one `BaseDataService`
retry / circuit-breaker policy. A Veda APY outage can affect RPC balance
availability (including facade fallback). Splitting those failure domains is
planned before production reliance on the facade. Source equivalence between
Money API and RPC totals is also not yet proven — keep the default `rpc`
policy until shadow comparison and rollout gates from the ADR are met.

## Installation

`yarn add @metamask/money-account-balance-service`

or

`npm install @metamask/money-account-balance-service`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core/blob/main/README.md).
