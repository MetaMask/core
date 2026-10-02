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

## Lighter standalone trigger orders

Lighter supports `stop_market`, `stop_limit`, `take_profit_market` and
`take_profit_limit` through `placeOrder`. Supply a positive `triggerPrice` on
the market's fixed price grid; limit execution also requires `price`. Market
execution applies the caller's slippage protection to the trigger level, and
USD sizing uses that level rather than the current market price. Protection
defaults to 5% when neither `maxSlippageBps` nor `slippage` is supplied. Both trigger
and execution prices must fit the venue's wire range.

Leave `timeInForce` unset: pending triggers use the signer's default 28-day expiry,
with IOC execution for trigger markets and GTT execution for trigger limits.
`reduceOnly` retains the requested quantity. Below-minimum trigger limits are
refused even when they would currently close the full position; a position can
grow before activation. Attached TP/SL and strategy fields are unsupported on
these standalone orders.

Position TP/SL replacement and removal recognize Core-created protection by
durable client/venue IDs, even after position growth, shrinkage, provider restart
or trading-key recovery into another slot. IDs are recorded before dispatch in
wallet/account/network/market-scoped storage and retained through uncertain
settlement. Resolved cancellations and exact terminal history prune them;
storage read errors or corrupt records fail closed before protection changes.
Ownership bookkeeping reads at most one recent history page. New records include
the exact client's signed absolute order expiry. When the active book no longer
contains an ID, it can be reclaimed after that expiry plus 30 seconds of clock
slack, even if terminal history is buried or unavailable. Transaction expiry
does not prove an order has expired. Active IDs and unexpired missing IDs remain
owned; legacy records with unknown order expiry need exact terminal history.
Bookkeeping never deep-scans history. Ownership is capped at 256 entries per
wallet/account/network/market. If verified cleanup cannot make room, new
protection creation refuses before dispatch rather than forgetting uncertain
orders. Known live orders can still be explicitly cancelled. Journal
settlement remains strict: an observed accepted submission cannot become
never-landed because of a later missing lookup, and expiry proofs are recomputed
on each reconciliation rather than persisted across restarts.

Legacy unrecorded reduce-only trigger-market orders on the closing side with
exactly the current position quantity retain their position-protection contract,
including standalone orders placed through `placeOrder`. Protection created
before this ownership upgrade, or after its local records are lost, has no
recorded ownership IDs. If that position has resized, the old trigger remains
legacy and may need explicit cancellation before new protection is established.
Classification reads the current position inside the write lock. Known IOC and GTT wire intents can be
replaced or removed; an unknown time-in-force refuses the change. Independent
partial triggers and trigger limits are preserved. Use explicit cancellation to
remove those orders. Quantity does not determine ownership of Core-created TP/SL.

Managed Lighter TP/SL removal does not require an integerizable position quantity
after preflight: exact recorded protection IDs can still be cancelled when an
authoritative positions array shows no position, zero size or a size below the
tick. Account-read failures or malformed position envelopes still refuse the
operation. Unrecorded legacy protection still requires a valid live quantity and
side for classification; replacement retains its size and side checks. A supplied
`expectedPosition` must still match for managed removal, including after signing.

`getOrderCapabilities` reports these types only for active, known perpetual markets.
Capabilities and trigger preflight refresh public metadata and fail closed on
read errors instead of relying on a session's old active-market snapshot.
`MarketInfo.priceDecimals` exposes Lighter's fixed price grid for callers
deriving thresholds. Missing precision is unknown, not a zero-decimal grid.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
