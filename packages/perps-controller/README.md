# `@metamask/perps-controller`

Controller for perpetual trading functionality in MetaMask.

## Installation

`yarn add @metamask/perps-controller`

or

`npm install @metamask/perps-controller`

## Usage

`PerpsController` provides a provider-agnostic API for perpetual trading. It
normalizes market data, account state, trading, funding, transfers, risk
calculations, and live subscriptions across enabled providers.

Applications construct the controller with a messenger and their
platform-specific dependencies:

```typescript
import {
  PerpsController,
  type PerpsControllerOptions,
} from '@metamask/perps-controller';

export async function createPerpsController(
  options: PerpsControllerOptions,
): Promise<PerpsController> {
  const controller = new PerpsController(options);
  await controller.init();
  return controller;
}
```

The controller registers its public operations as `PerpsController:*`
messenger actions, and clients can call the same methods directly. Its main
capabilities are:

- Provider and network lifecycle management.
- Normalized market, account, position, order, and history reads.
- Trading, position, margin, deposit, and withdrawal operations with
  preflight validation and risk calculations.
- Callback-based live prices, positions, orders, fills, order books, and
  candles. Each subscription returns an unsubscribe function.

The package exports the controller's parameter, result, provider, and
messenger types for client integrations. Provider availability and aggregated
routing are controlled by client configuration and feature flags.

## Error codes

`PERPS_ERROR_CODES` / `PerpsErrorCode` are the structured codes returned to
the UI for translation. New codes are additive and ship as a minor. Clients
should keep a catch-all for unrecognized codes instead of an exhaustive map,
so a bump does not fail to compile when a code is added.

## Explicit HyperLiquid margin mode

Pass `marginMode: 'cross'` or `marginMode: 'isolated'` with an integer `leverage`
to `placeOrder`. Omitted mode retains the existing isolated-leverage behavior.
Explicit mode requests are validated before signing: Cross is unavailable on
isolated-only markets and HIP-3 markets, and an order cannot change the mode of
an asset with an open position, resting order, or active native TWAP schedule,
including schedules whose first slice has not filled. Orders in the same mode may
increase or reduce the existing position.

## Signing without a `KeyringController`

By default the controller signs through the `KeyringController:*` messenger
actions. A client without a keyring passes `accountSigner` in its platform
dependencies (`signTypedData`, `signPersonalMessage`, optional `isReady`,
`requiresSignatureConfirmation` and `getChainId`); the signing address still
comes from the selected account, and a signer that is not ready fails with
`KEYRING_LOCKED`. HyperLiquid user-signed actions are signed for the chain
`getChainId` returns, or for chain 1 without it.

HyperLiquid L1 actions (orders, cancels, leverage, ...) can be signed by a
client-owned agent key: return it from
`providerCredentials.hyperliquid.getAgentSigner(account)`, or bind it to an
account and network with `PerpsController:setAgentSigner`. User-signed actions
(builder fee, withdrawals) stay on the main account, and approving the agent
is the client's job. When the venue rejects an agent (revoked or expired), the
write fails with `KEYRING_LOCKED`, the agent is dropped and
`providerCredentials.hyperliquid.onAgentRejected` is called. A "Must deposit
before performing actions" answer to a request the agent signed counts as a
rejection only when `extraAgents` no longer lists the agent, which needs a
named agent. Call
`PerpsController:clearAgentSigners` when the agent key locks.

`PerpsController:prepareTradingWallet` runs the setup that needs signatures
(HyperLiquid account migration, builder fee and referral; Lighter key
registration) before the first order, so a hardware or external wallet signs
it in one guided session.

## Lighter trading keys

Lighter orders are not signed by the wallet. A Lighter account (owned by the
wallet's address) holds trading keys, called API keys, in numbered slots. The
client's signer bridge generates the key for the slot set in
`providerCredentials.lighter.apiKeyIndex` (default `7`) and keeps its private
half on the device. The wallet signs one `personal_sign` message to register it
in that slot, during `PerpsController:prepareTradingWallet` or before the first
order; after that, orders are signed with the key and need no wallet prompt.

A key only works where it was generated, so give each device or app instance
its own slot. When the slot already holds a key this signer did not create,
the provider stops with "Lighter API key slot N already contains a different
key" instead of replacing it, since that key may still be in use elsewhere. Use
a free slot instead: the Lighter API answers "api key not found" for
`GET /api/v1/apikeys?account_index=<account>&api_key_index=<slot>` when the
slot is free.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
