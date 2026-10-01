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

## Rewards discounts and fee previews

The client-owned RewardsController exposes two independent fee candidates.
`getPerpsDiscountForAccount(account, baseFeeBips)` retains its existing
`Promise<number | null>` contract for account-scoped VIP and season discounts.
The optional `getPerpsTradingFeeGrant(scope)` receives the routed provider and
network and returns an absolute fee candidate for that exact scope:

```typescript
import type {
  PerpsFeeResolverScope,
  PerpsTradingFeeGrant,
} from '@metamask/perps-controller';

const scope: PerpsFeeResolverScope = {
  providerId: 'hyperliquid',
  isTestnet: false,
};
const grant: PerpsTradingFeeGrant = {
  ...scope,
  feeBips: 3,
  expiresAt: Date.now() + 60_000,
};
```

Core retrieves VIP/season and grant concurrently and isolates failures between
them whenever the resolver has an explicit scope. Scope omission fails closed
without calling the grant dependency. After all candidate work settles, Core
validates that `feeBips` is finite and non-negative, `expiresAt` is finite and
still in the future, and the candidate's `providerId` and `isTestnet` exactly
match the requested scope. The client owns authentication, payload validation,
and deciding which routes it supports. The corresponding Mobile integration is
intended to supply candidates only for Hyperliquid mainnet; Core remains
provider-agnostic so clients can add Lighter or other route-scoped grants
without a contract redesign.

Core compares both candidates with the default fee and cached subscription
waiver. Rewards preserves its existing tie with default. A grant wins only when
strictly cheaper than the current winner after Hyperliquid's tenths-of-a-basis-
point quantization, so rewards wins a quantized VIP/grant tie and default beats
a non-reducing grant. Subscription retains the same strictly-cheaper
quantized-tie policy. `PerpsController.calculateFees` exposes the result through
its optional `feeSource`, populated by the same operation that reprices the
preview. This is preview-only attribution; every submission resolves again
against its actual provider route and may have a different winner.

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
dependencies (`signTypedData`, `signPersonalMessage`, optional `isReady` and
`requiresSignatureConfirmation`); the signing address still comes from the
selected account, and a signer that is not ready fails with `KEYRING_LOCKED`.

HyperLiquid L1 actions (orders, cancels, leverage, ...) can be signed by a
client-owned agent key: return it from
`providerCredentials.hyperliquid.getAgentSigner(account)`, or bind it to an
account and network with `PerpsController:setAgentSigner`. User-signed actions
(builder fee, withdrawals) stay on the main account, and approving the agent
is the client's job. When the venue rejects an agent (revoked or expired), the
write fails with `KEYRING_LOCKED`, the agent is dropped and
`providerCredentials.hyperliquid.onAgentRejected` is called. Call
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
