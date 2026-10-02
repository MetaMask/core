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

`getOrderCapabilities` reports these types only for active, known markets.
Capabilities and trigger preflight refresh public metadata and fail closed on
read errors instead of relying on a session's old active-market snapshot.
`MarketInfo.priceDecimals` exposes Lighter's fixed price grid for callers
deriving thresholds. Missing precision is unknown, not a zero-decimal grid.

## Explicit dispatch reconciliation

`reviewRecoveryVenue({ providerId })` reads fresh authoritative positions and orders
for one provider, wallet, network and venue account. A ready response carries that
scope and `reviewedAt`; transport, identity, authentication or metadata failures
reject instead of returning an empty account. The read can sign an authentication
token with a matching locally retained registered key. It never registers a key,
allocates a venue slot, signs a financial transaction, starts protection recovery,
or acknowledges or clears an obligation. Missing local read authority requires
reconnecting a matching key. Aggregated callers must name the owning provider;
unsupported providers return `status: 'unsupported'`.

A manual protection row may include an opaque `recoveryId`. After review, an
explicit `resolveRecoveryProtection({ providerId, recoveryId, symbol,
expectedPosition, takeProfitPrice, stopLossPrice })` selects that exact obligation
and requests new protection (omit both prices for removal). Preserve the ID
verbatim. Lighter reconciles pending original-slot attempts by their exact venue
identity before using a matching current registered key; the original private key
is not required when this evidence is authoritative. The successor only replaces
orders owned by the selected obligation. Its durable source relationship survives
response loss and restart; failed or ambiguous settlement leaves recovery visible.
The result distinguishes `settled`, `unresolved`, and `unsupported`. This is an
explicit financial operation and must never run as part of review or rendering.

`getRecoveredDispatches()` and `getPendingManualRecoveries()` list local recovery
state. Confirmed account absence and known Premium accounts retain their local rows without signer setup
or venue reconciliation; a wallet with no recorded obligations returns an empty
inventory. Premium trading remains unsupported. Transport failures, corrupt or
unavailable storage, wrong-wallet accounts and unknown account types still reject.
Verified accounts are indexed before venue mutation so nonce-only obligations
remain discoverable after restart even if the venue reports account absence.
Existing protection indices also preserve older account identities. Legacy
nonce-only obligations without an account or protection index become discoverable
when the venue account returns; they are never deleted or reset during absence.
Account capacity is bounded by `LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT`, exported through
`constants` and `constants/lighterConfig`.

Call `reconcileRecoveredDispatches()` only when the user requests a status check.
This non-financial operation reads venue evidence and updates local ledgers.
It does not initialize a signer, register a key, sign, submit, cancel, acknowledge
or retry an intent. Lighter checks owner-null dispatches across all trading slots;
TP/SL-owned entries and their journals remain pending for their separate recovery
flow. Existing quarantines do not prevent checking other unresolved entries.

Replace the displayed list with the returned list, including its opaque IDs.
Pending rows and all local-only absent or Premium rows have
`acknowledgeable: false`. Acknowledgment requires a supported current account.
A pending row disappearing can mean its exact transaction was proven absent,
not successful execution. Unknown outcomes remain unknown. Acknowledgment still requires explicit user review and
never grants permission to resubmit an ambiguous intent. Providers without this
capability return their local listing, or an empty list if they have no recovery
state. Aggregation rejects when any provider fails; consumers should retain their
last known rows alongside that error.

## Lighter fixed partial position protection

`updatePositionTPSL` accepts a positive `takeProfitSize` or `stopLossSize` for
one trigger, or both sizes for an equal-quantity OCO pair. Explicit quantities
normalize downward on the market size grid without increasing the request.
Values below one tick or above the exact current position are rejected. A pair
with unequal normalized quantities or only one supplied size is rejected before
mutation. Omitting both sizes retains the existing full-position snapshot
behavior. Explicit sizes never become the venue's dynamic zero-quantity
sentinel.

Partial replacement cancels only managed or explicitly selected protection, then
proves exact cancellations before creating the replacement. Independent orders
remain untouched. This leaves a protection gap if creation fails. The durable
operation records the original fixed quantities and client IDs before
cancellation; ambiguous creation is reconciled without replay.

A proven-unsent operation releases its journal and permits fresh intent. Listing
keeps unsent journals selectable until a fresh update retires them.
Current-key journals with attempted transactions may appear while their
operation is still running; wait for the issuing operation to finish before
choosing recovery.

After a dispatched cancellation or interrupted creation, recovery never attaches
the saved quantity automatically. Lighter does not expose an immutable position
lifecycle ID, so even an identical-looking position could have been closed and
reopened. Ordinary retries cannot change or dispatch the stored intent. Inspect
the exact recovery and call `resolveRecoveryProtection` with its recovery ID and
a fresh explicit intent for the current position. The capability metadata
reports this boundary, snapshot coverage, and equal-quantity OCO linkage.
Hyperliquid continues to report independent fixed partial triggers and dynamic
whole-position coverage through its existing implementation.

## Native Lighter attached orders

`placeOrder` accepts a market or limit parent with `takeProfitPrice`,
`stopLossPrice`, or both. Omit attached child sizes. `tpslLinkage` defaults to
`order`. The native OTO or OTOCO transaction contains the opening parent and
zero-size, opposite-side, reduce-only trigger-market children. An explicit
child quantity, position linkage, reduce-only parent, caller-supplied client
ID, or invalid price or size grid is refused before signer setup. IOC and
resting GTC limit parents are supported. The caller's slippage also bounds
child market execution prices.

`OrderResult.attachedOrderGroup` separates signed client IDs from observed
venue IDs and returns an opaque group handle. `getAttachedOrderGroups` lists
durable local identities across restarts and trading-key changes without signer
setup. Confirmed absent or known Premium accounts retain local groups through
the wallet-scoped recovery account index; listing never acknowledges or replays
them. `reviewAttachedOrderGroups` uses an existing registered local key for
read-only venue authentication, then matches exact signed IDs against bounded
active and bounded older inactive history for missing legs. A preparation-time
cutoff stops reads before the group could have existed. The page/row budget
returns `historyStatus: bounded` with unknown missing legs rather than failing
reviews of other groups. Older journals without a preparation time retain the
explicit budget. Missing orders or linkage stay unknown. A successful
submission reports acceptance, not activation, a fill, or protected quantity.
If a pending `placeAttached:` dispatch blocks writes, call
`reviewAttachedOrderGroups` to refresh exact venue evidence, then
`reconcileRecoveredDispatches` and acknowledge only a resolved outcome. A pending,
non-acknowledgeable dispatch cannot be cleared by acknowledgment alone.

Pass the exact `groupId` as `cancelOrder.orderId`, with its symbol and
provider, to cancel the owned parent and children. Cancellation rereads exact
IDs after each leg, preserves unrelated triggers and reports success only when
all legs are terminal. Missing identities retain the group for later explicit
review. The group handle never cancels a position or creates replacement
protection. Attached children are excluded from ordinary position TP/SL
replacement/removal.

Unsigned intent is persisted before signing and transaction identity before
dispatch. Ambiguous acceptance remains quarantined across restart and key
migration. There is no automatic financial replay or attachment to a later
position. Explicitly cancel a prepared group before submitting fresh intent;
uncertain dispatches also require the existing exact-transaction reconciliation
and acknowledgment flow. Exact failure observed by review remains durable until
nonce-ledger retirement succeeds, including retries after storage failure. When
the exact hash stays absent but the nonce advanced, explicit review can
transfer fresh complete exact-leg observations into an acknowledgeable
succeeded outcome. Saved IDs alone never authorize this transfer. The group
remains owned; acknowledgment permits later intentional writes and exact
cancellation without replay. Reconciliation persists exact failed, expired or
nonce-consumed non-acceptance before retiring the nonce evidence; explicit
group cancellation can then abandon that intent without a cancellation
signature or replay of the grouped order. Signer setup and authentication still
apply. Nonce advance before signed expiry remains ambiguous. Abandonment
rereads exact transaction and bounded order history, and refuses recorded or
freshly correlated legs. Missing history alone never proves non-acceptance. Up
to 64 groups are retained per account. Only canceled groups or `completed`
groups with all legs exactly correlated as terminal can be evicted. Review
reads one bounded snapshot per market and skips unchanged persistence. Terminal
groups normally return local identities without new order observations or
linkage; a retained dispatch ledger keeps them eligible for fresh review and
settlement.

Mobile and Extension must gate attached forwarding on `attachedTpsl` plus their
own rollout policy. This package change does not adopt the feature in either
client. `attachedTpsl.lifecycleVerification` remains `pending`. Native
activation, partial-parent-fill coverage, and automatic parent/child
cancellation guarantees require venue execution evidence. The current
capability only describes the implemented grouped submission, read review and
explicit exact-ID cancellation.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
