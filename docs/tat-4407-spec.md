# TAT-4407 — [Mobile] Perps data layer: live balances, positions and markets for each exchange

> Spec written with the `to-spec` skill from `docs/perps-data-layer.md`, the merged core work in TAT-4392 (`@metamask/perps-controller` 25.0.0, core #11461), and reads of `metamask-mobile` (main `aa53e6321ab`), `va-mmcx-terminal` and `terminal-backend`.
>
> **Status of dependencies:** TAT-4392 is merged and released in perps-controller **25.0.0**. **TAT-4395 (core Lighter snapshot consumer) and TAT-4396 (core `marketKey` grouping) are not implemented yet.** Where this spec relies on them, the expected contract is written out under "Assumed core contracts", and the mobile work must be adjusted if the shipped contract differs.

## Problem Statement

A MetaMask Mobile user who trades on both Hyperliquid and Lighter cannot see their whole Perps account in one place.

- **Balance:** the homepage and Perps screens show one balance, which is the default venue's balance even in aggregated mode. Money on the other venue is invisible. The "1 day ago" comparison reads `perpsBalances`, which core never wrote before 25.0.0, so the change figure is empty or wrong.
- **Positions, orders and fills:** rows from both venues reach the device, but the app matches them by symbol or order id alone. A BTC position on Lighter can get its PnL from Hyperliquid's BTC price, an optimistic TP/SL edit can land on the wrong venue's position, and a fill from one venue can be merged with or hidden behind a fill from the other.
- **Markets:** the list either shows one venue's markets or two rows with the same symbol and the same list key. Nothing tells the user that BTC trades on both venues, and they cannot choose which venues the list shows.
- **Charts and order book:** opening a Lighter market shows Hyperliquid's candles, order book and open-interest cap, because mobile never tells the controller which venue to use.
- **Fast first load:** the Terminal global snapshot, which loads markets before the WebSocket connects, only runs when the active provider is `hyperliquid`. In aggregated mode markets load more slowly.

## Solution

From the user's point of view:

- The Perps home and the homepage balance breakdown show one **total** balance that adds up both venues, and per-venue balances wherever a venue matters (venue picker, deposit and withdraw, available-to-trade). If a venue's data could not be loaded, the total says it is incomplete instead of quietly showing a smaller number.
- Every position, open order, fill and activity item shows the venue it belongs to, uses that venue's prices, and actions on it (close, edit, TP/SL, cancel) go to that venue.
- The markets list shows **one row per market**. When a market exists on both venues, the backend has already joined them, and the row shows the **default provider's** price and data. A provider logo appears only when the market exists on one provider. Users can filter the list by provider. The filter is remembered across app restarts and always keeps at least one provider selected. It applies to the markets list only: positions and orders always show for every provider.
- Opening a market shows the chart, order book, prices and open-interest cap of the venue the user is trading on. That is the provider picked in "Trade on {provider}", otherwise the default provider, or the only venue that lists the market.
- Markets load from the Terminal snapshot for each venue that has one, whether one venue or both are active.

Under the hood, `PerpsStreamManager` and the Perps hooks become **venue-aware**: data is keyed by `(providerId, symbol)` instead of `symbol`, the account channel holds one entry per venue plus a combined total, venue-specific streams pass `providerId` to the controller, and market rows are grouped with the core `groupMarketsByMarketKey` helper.

## User Stories

### Balances

1. As a Perps user with funds on both venues, I want the Perps home to show my total balance across Hyperliquid and Lighter, so that I know my whole Perps position at a glance.
2. As a Perps user with funds on both venues, I want to see each venue's balance separately, so that I know where my money sits before I trade or withdraw.
3. As a Perps user, I want the homepage balance breakdown's Perps slice to equal the sum of my venue balances, so that my wallet total is right.
4. As a Perps user, I want the total balance to update live when either venue's balance changes, so that I never act on a stale figure.
5. As a Perps user, I want to be told when one venue's balance could not be loaded, so that I don't mistake a partial total for my full balance.
6. As a Perps user, I want a venue that is still loading to show as loading rather than $0, so that I am not alarmed by a false zero.
7. As a Perps user with an empty Lighter account, I want Lighter to show $0 as a confirmed value, so that I can tell "empty" apart from "unavailable".
8. As a Perps user, I want unrealized PnL shown as a total and per venue, so that I can see which venue is driving my gains or losses.
9. As a Perps user, I want the 1-day change to compare like with like, so that the change is not distorted by one venue missing from the baseline.
10. As a Perps user who switches accounts, I want the per-venue balances to clear and reload for the new account, so that I never see another account's balance.
11. As a Perps user who toggles testnet, I want the per-venue balances to reset, so that mainnet and testnet balances never mix.
12. As a Perps user paying for a transaction with my Perps balance, I want the spendable amount to come from the venue that will be debited, so that the payment does not fail for lack of funds on that venue.
13. As a Perps user on Hyperliquid only, I want my balance to look and behave exactly as it does today, so that the multi-venue change doesn't regress my experience.

### Positions, orders, fills and activity

14. As a Perps user with positions on both venues, I want to see every position with its venue label, so that I know where each one is held.
15. As a Perps user with a BTC position on both venues, I want two separate BTC positions, so that one never hides or overwrites the other.
16. As a Perps user, I want each position's live PnL to use that venue's mark price, so that the PnL I see matches the venue.
17. As a Perps user, I want a TP/SL edit to update only the position on the venue I edited, so that the optimistic update never shows on the wrong position.
18. As a Perps user, I want my open orders labelled by venue, so that I know where each order rests.
19. As a Perps user, I want an optimistic order edit to apply only to the order on its own venue, even if both venues use the same order id, so that the UI doesn't show a false change.
20. As a Perps user, I want fills from both venues in my history, with no fill dropped because another venue had one with the same order id, timestamp, size and price.
21. As a Perps user, I want funding payments in activity attributed to the right venue, so that funding on the same symbol from two venues doesn't collapse into one entry.
22. As a Perps user, I want the market details screen to show my position for the venue I opened, so that I don't see the other venue's position for the same asset.
23. As a Perps user, I want "close", "edit" and "cancel" actions to target the venue of the row I tapped, so that I never act on the wrong venue.

### Markets list

24. As a Perps user, I want one row per market in the markets list, so that the list isn't cluttered with duplicates.
25. As a Perps user, I want a market listed on both providers to show my default provider's price and data, so that the list matches the venue I trade on by default.
26. As a Perps user, I want a market listed on only one provider to show that provider's logo, so that I know it can only be traded there.
27. As a Perps user, I want to filter the list to Hyperliquid, Lighter or both, so that I only see markets I care about.
28. As a Perps user, I want my venue filter remembered after restarting the app, so that I don't have to set it again.
29. As a Perps user, I want the filter to always keep at least one venue selected, so that I can never end up with an empty list by mistake.
30. As a Perps user, I want the filter to ignore a venue that is no longer available (for example Lighter disabled by flag), so that a stale saved choice never hides every market.
31. As a Perps user, I want search, categories, favourites and sort to keep working on grouped rows, so that the list behaves as it does today.
32. As a Perps user, I want to keep seeing positions and orders from every provider when I filter the markets list, so that the filter never hides money I have at risk.
33. As a Perps user, I want watchlist and recently viewed markets to show correctly when an asset trades on both venues, without duplicate or missing entries.
34. As a Perps user, I want markets in the list to load quickly from the Terminal snapshot for each enabled venue, so that the list appears before live connections finish.

### Market details, chart, order book, OI

35. As a Perps user opening a Lighter market, I want the chart to show Lighter candles, so that the chart matches the venue I'm trading on.
36. As a Perps user opening a Lighter market, I want the order book to show Lighter's book, so that I see the liquidity I will trade against.
37. As a Perps user, I want the top-of-book and focused price on the market screen to come from the venue I opened, so that the quote I see is the quote I get.
38. As a Perps user, I want the open-interest cap warning to reflect the venue I'm trading on, so that I'm not blocked or warned because of the other venue.
39. As a Perps user, I want the chart and order book to stay on my chosen venue when the default venue changes in the background, so that the screen doesn't switch venues under me.
40. As a Perps user, I want a clear error when a venue's stream cannot be opened, rather than silently seeing the other venue's data.

### Engineers and QA

41. As a mobile engineer, I want stream channels keyed by provider and symbol, so that adding a third venue needs no change to channel logic.
42. As a mobile engineer, I want one place (the core helper) that decides which markets group together, so that mobile, extension and terminal group markets the same way.
43. As a QA engineer, I want a two-venue test preset (TAT-4387) to drive these screens, so that I can check both venues together.
44. As a mobile engineer, I want direct Hyperliquid mode to keep its current behaviour and tests, so that the change is safe to ship behind the Lighter flag.

## Implementation Decisions

### Package bump (AC1)

- Mobile moves `@metamask/perps-controller` from `^24.1.0` to the first release that contains TAT-4392 (25.0.0), TAT-4395 and TAT-4396, unless an earlier ticket (for example TAT-4405) has already bumped it.
- Breaking changes in 25.0.0 that mobile must absorb when bumping:
  - The aggregated `AccountState` top level is now the **combined** total. Per-venue values live in `providerStates`, and completeness lives in `aggregate`.
  - The aggregated account stream no longer follows the default venue and no longer emits `null` when the default changes.
  - `perpsBalances` entries are now written, one per available venue, and `accountValue1dAgo` is optional and **unset on live updates**.
  - The error-code additions in 25.0.0 (`ORDERS_FAILED`, `LIQUIDATION_PRICE_UNAVAILABLE`, post-only codes and others) need entries in mobile's exhaustive error map.

### Assumed core contracts (TAT-4395, TAT-4396 — not yet implemented)

These describe what this ticket expects. If the shipped core API differs, update this section and the matching mobile decisions.

- **TAT-4395, Lighter snapshot consumer.** Core's Terminal market service accepts `lighter` for the v4 global snapshot (`/v4/perpetuals?provider=lighter`, dex `main`), which terminal-backend already serves. Core maps the v4 identity fields `marketKey`, `priceScale`, `venueMarketId` and `venues` onto `PerpsMarketData`. In aggregated mode, `getMarketDataWithPrices` returns snapshot-sourced rows for each venue that has a valid snapshot, each tagged with `providerId`. Core's own `activeProvider === 'hyperliquid'` gate on the snapshot is removed or made per venue.
- **TAT-4396, `marketKey` grouping.** The backend decides which markets are the same: it joins them under one `marketKey` and lists their `venues`. Core is the source of truth for turning those joined markets into rows, and clients render what it returns. Core exports a pure `groupMarketsByMarketKey`. It takes the venue markets, the default provider and, optionally, the providers the user has selected. It returns one row per `marketKey`, and each row holds:
  - the shared key
  - the providers the market is listed on
  - the **display market**: the default provider's market when that provider lists it and is selected, otherwise the selected provider that lists it
  - the per-provider members, which the market detail and Pro "Compare providers" screens need

  Markets without a `marketKey` use the backend default key (`<provider>:<symbol>` for non-Hyperliquid venues), so they become a row of one. Mobile adds no grouping rule or display-venue rule of its own. If TAT-4396 does not take the default provider or the filter, those parameters are added there rather than reproduced in mobile.

### `PerpsStreamManager`: venue-aware channels

- **Channel key.** Channels that carry per-market data use a composite key of `providerId` and `symbol` instead of `symbol`. One shared helper builds and parses this key. In direct (single-venue) mode, `providerId` is the active venue, so behaviour and cache contents are the same as today.
- **Prices.** `toPriceUpdate` keeps `providerId`. The price cache and subscriber index are keyed by `(providerId, symbol)`, so updates for the same symbol from two venues no longer overwrite each other. Subscribers can ask for a symbol on a specific venue. A subscriber that gives no venue gets the active or default venue, which keeps existing callers working.
- **Top of book and focused price.** These take a `providerId` with the symbol and only accept updates from that venue, instead of the first update whose symbol matches.
- **Account channel: per venue plus total.**
  - The channel keeps the combined `AccountState` the controller emits, plus the `AccountAggregateMetadata` that the stream callback passes as its second argument.
  - It exposes a per-venue view built from `providerStates`: for each venue, its status (`available`, `unavailable` or `pending`) and its own `AccountState` when available.
  - In direct mode there is no `providerStates`, so the single state is shown as the active venue's entry, and the total equals it.
  - A `pending` or `unavailable` venue is never shown as zero.
  - The disk preload (`cachedAccountState`) keeps working for the combined state.
- **Positions and orders.** Optimistic updates (TP/SL on positions, edits on orders) match on `providerId` and on `symbol` or `orderId`. When a row has no `providerId` (direct mode, legacy cache), matching falls back to the current lenient rule: if either side is undefined, the venue is treated as matching. This follows the existing pattern in `useHasExistingPosition` and `usePerpsMarketData`.
- **Fills.** These are already venue-aware (each venue's snapshot replaces only its own fills). No change beyond the keying below.
- **Candles.** The candle channel key becomes `(providerId, symbol, interval)`. It passes `providerId` to `subscribeToCandles` and to historical candle fetches, so an explicit route stays pinned when the default venue changes. An unregistered route arrives as a `PROVIDER_NOT_FOUND` error through `onError` and is shown as an error, never as the other venue's data.
- **Order book.** `usePerpsLiveOrderBook` passes `providerId` to `subscribeToOrderBook`. The price-level "aggregated order book" connection is unrelated to multi-venue and stays as it is.
- **OI caps.** The channel passes `providerId` to `subscribeToOICaps` and keys caps by venue. "Is this market at its cap?" is answered for `(providerId, symbol)`.
- **Market data cache key.** This stays keyed by provider mode, network and HIP-3 version, plus the snapshot source. Rows inside are distinguished by `providerId`.

### Snapshot source per venue

- **Market snapshot.** `isGlobalSnapshotActive` no longer checks `activeProvider === 'hyperliquid'`. It is active whenever a Terminal global snapshot URL is configured and the active mode includes at least one venue that core can read from the snapshot (after TAT-4395, Hyperliquid and Lighter). The "complete global snapshot" check on cached rows is done **per venue**: one venue's rows can come from the snapshot while the other falls back to the provider path, and neither blocks the other.
- **User-data snapshot.** Core's `getUserDataSnapshot` is still Hyperliquid-only, and terminal-backend has no account snapshot endpoint. In aggregated mode, mobile seeds positions, orders and account per venue from `getCachedUserDataForActiveProvider` and the per-venue disk cache, then uses live streams. The atomic REST user snapshot keeps running only for the Hyperliquid venue. Mobile does not try to get a Lighter user snapshot in this ticket.
- **Disk persistence.** User data is persisted per venue in every mode, including Hyperliquid direct mode, using core's `buildUserDataPayload`, which already splits rows by `providerId`. Today's `activeProvider === 'hyperliquid'` early return is reviewed. If it exists for a reason other than venue gating, keep it for direct mode only and say why in a comment.

### Hooks and selectors

- **Live account.** `usePerpsLiveAccount` keeps returning the combined account. It also returns the aggregate metadata (`status: complete | partial` and the venue lists).
- **Per-venue balances (new).** A new hook returns, for each enabled venue, `{ providerId, status, totalBalance, unrealizedPnl, spendableBalance, withdrawableBalance }`, plus the combined total and whether it is complete. The live account stream feeds it, and `perpsBalances` is the persisted fallback before the stream connects.
- **Fixing existing `perpsBalances` readers.**
  - `usePerpsPortfolioBalance` and the homepage `usePerpsSlice` sum a 1-day baseline only when **every venue in the live total** has an `accountValue1dAgo`. Otherwise the baseline is unset and no change figure is shown. This prevents comparing a two-venue live total with a one-venue baseline, and it stops a missing baseline being counted as zero.
  - When `aggregate.status` is `partial`, the slice reports a degraded or partial state through its existing `status` and is not shown as the complete total.
  - Selectors and fixtures that model `accountValue1dAgo` as required are updated to treat it as optional.
- **Single-venue balance readers.** Readers that use the top-level `accountState` as one venue's money (pay with Perps balance, transaction-pay balance callback, default pay-with-token when there is no Perps balance) read the relevant venue from `providerStates`. Usually that is the routing default or the venue being debited. In direct mode they keep reading the top level. This must line up with TAT-4405 (default provider) and TAT-4406 (Lighter money movement). Whichever ticket lands first owns the change.
- **`providerId` in hooks and selectors.** Positions, orders, fills and activity keep `providerId` from the stream to the UI.
  - Positions: PnL enrichment looks up the price for `(providerId, symbol)`. The position-for-asset hook takes an optional `providerId` and includes it in its cache key.
  - Activity and transaction history: fill-merge keys, per-fill ids, aggregation buckets, transaction ids and funding ids all include `providerId`. Order maps in history are keyed by `(providerId, orderId)`.
  - Market fills: filtered by `(providerId, symbol)` when a venue is given.
  - List keys for markets, watchlist, top movers and related markets are unique per venue, or per `marketKey` when rows are grouped.

### Grouped market rows and venue filter

- **Grouping.** The markets hook stays the single source of market rows. It passes the venue rows, the routing default provider and the effective provider filter to core's `groupMarketsByMarketKey`, and renders the rows it returns. Mobile does not group markets or choose a display venue itself.
- **What a row shows.** Price, 24h change, volume, funding, open interest and the existing list sort all use the row's display market, which is the default provider's data when it lists the market. A provider logo shows only when the row lists one provider (the badge UI itself is TAT-4386).
- **Navigation.** Tapping a row opens market details for the display market's venue. The "Trade on {provider}" selector and the Pro "Compare providers" sheet pick the explicit route for the screen, and do not switch the controller's active provider. The chart, order book, OI cap and the order all use that route, following core's rule: explicit `providerId` when one is chosen, the default provider otherwise. Those screens belong to other tickets, but they read the per-provider members and routed streams that this layer provides.
- **Search, category, favourites.** These match a row on its display market and its members. Watchlist and recently viewed still store symbols in core state. A stored symbol resolves to the row whose members include that symbol, so each market appears once.
- **Venue filter state.**
  - A new `selectedProviderIds` field is added to the persisted Redux `settings.perpsMarketListPreferences`, next to `marketTypeFilter` and `showFavoritesOnly`.
  - A selector returns the **effective** filter: the saved ids intersected with the currently available venues. If that leaves nothing, the result is all available venues. So the effective filter always has at least one venue.
  - The reducer refuses an update that would leave the list empty.
  - The existing unused `PerpsExchangeFilterSheet` is wired to this state, and its save button is disabled when nothing is selected.
  - The filter is only shown when more than one venue is available (`isMultiProviderEnabled`).
  - A migration is not needed because the field is optional and defaults to all venues.
- **Filtering.** The effective filter is passed to core's grouping, which drops rows that no selected provider lists and chooses the display market from the selected providers. The filter applies to the markets list only. Positions, orders, fills and activity always show every provider.

### Out of this layer

The badge UI on market logos (TAT-4386) and the two-venue presets (TAT-4387) are consumers of this data layer. Their UI is not specified here.

## Testing Decisions

**What makes a good test here:** drive the data layer through its public subscribe API and hooks, with a mocked `Engine.context.PerpsController` that emits per-venue updates the way core 25.x does (`providerId`-stamped rows, account updates with `providerStates` and an aggregate-metadata second argument). Assert what subscribers and hooks receive, not internal maps or cache keys.

**Proposed test seams (highest first). Please confirm:**

1. **`PerpsStreamManager` public channel API (primary seam).** Almost every AC can be checked here: account per venue and total (AC2), positions on both venues with the right venue (AC2), candles, order book and OI routed with `providerId` (AC3), and per-venue snapshot gating. Extends the existing `PerpsStreamManager.test.tsx` setup, which already mocks controller subscriptions and has multi-venue tests (per-provider errors and fills parameterized over `hyperliquid` and `lighter`, aggregated disk persistence).
2. **Hooks via `renderHook`.** For the balance hooks (`usePerpsSlice`, `usePerpsPortfolioBalance`, the new per-venue balance hook) and the markets view model with grouping and venue filter (AC4). Follows `usePerpsSlice.test.ts`, `usePerpsPortfolioBalance.test.ts`, `usePerpsMarkets.test.ts` and `usePerpsMarketListView.test.ts`. The grouping test uses the real core `groupMarketsByMarketKey`, not a mock, so it fails if the core contract changes.
3. **Reducer and selector unit tests** for the venue-filter rule that keeps at least one venue (saved ids ∩ available, empty → all, refused empty update).

No new seams are proposed. `usePerpsLiveOrderBook` calls the controller directly rather than going through the stream manager, so AC3's order-book half is tested at the hook seam (`usePerpsLiveOrderBook.test.ts`).

**Acceptance criteria → tests**

| AC | Test |
| --- | --- |
| AC1 | `package.json` / `yarn.lock` resolve to a perps-controller release that includes TAT-4392, 4395 and 4396. The suite compiles against its types. |
| AC2 | Stream manager test. The controller emits positions for `hyperliquid` and `lighter` with the same symbol, and an account update with both venues in `providerStates`. Subscribers receive both positions with the correct `providerId`. The per-venue balance hook returns both venues, and the total equals their sum. Also: a `pending` or `unavailable` venue is not counted as zero, and the total is marked partial. |
| AC3 | Candle-channel and order-book hook tests. Subscribing to a Lighter market calls `subscribeToCandles`, `fetchHistoricalCandles`, `subscribeToOrderBook` and `subscribeToOICaps` with `providerId: 'lighter'`. Updates for the same symbol from Hyperliquid are not delivered. Changing the default venue does not rebind. |
| AC4 | Markets view-model test. Two venue rows that the backend joined under one `marketKey` produce one row, which shows the default provider's price and no single-provider logo. Changing the default provider changes the displayed data. Deselecting the default provider in the filter shows the other provider's data, and the "at least one provider" rule holds. Mixed AC: also checked by hand on device with the TAT-4387 preset. |

Each changed hook also gets a regression test for **direct Hyperliquid mode**, so that today's behaviour does not change.

## Out of Scope

- Core changes. TAT-4395 (Lighter snapshot consumer) and TAT-4396 (`marketKey` grouping) are separate core tickets. This ticket only consumes them.
- A Lighter **user-data** snapshot. Core has none, and terminal-backend has no account endpoint.
- Venue badge UI on market logos (TAT-4386) and the two-venue test presets (TAT-4387).
- Default provider and per-trade venue routing for order entry (TAT-4405), and Lighter deposit and withdrawal flows (TAT-4406), apart from the balance readers noted above.
- Extension and Terminal web changes. Terminal web trades one venue at a time and has no cross-venue market grouping today.
- Making watchlist and recently viewed venue-specific in core state (they stay symbol-based).
- Historical per-venue 1-day baselines. Core leaves `accountValue1dAgo` unset on live updates. Filling it in is a separate decision.

## Further Notes

- **Current mobile state (for orientation):**
  - Mobile is on `@metamask/perps-controller` `^24.1.0` with no patch.
  - The stream manager has one account channel, and its price, top-of-book and focused-price caches are keyed by symbol only.
  - Candles, order book and OI caps have no `providerId`.
  - The Terminal market snapshot and the user-data snapshot are both gated on `activeProvider === 'hyperliquid'`.
  - `PerpsExchangeFilterSheet` exists but is not used.
  - `usePerpsPortfolioBalance` has no production consumers, so fixing it is low risk. The homepage `usePerpsSlice` is the reader users actually see.
- **Market identity.** The backend owns market joining (engineering scope: "Backend market index… handles the market mapping logic for the client"). terminal-backend's market map gives a Hyperliquid market its bare symbol as its key and other venues `<provider>:<symbol>` by default. A curated `lighter.json` maps a Lighter pair to a Hyperliquid key only at price scale 1 (for example `1000PEPE → kPEPE`). Rows therefore follow backend data, not matching symbols: two venues can share a symbol and still be separate rows, and they can share a row under different symbols.
- **Decisions taken from the Lighter engineering scope** (`docs/engineering-scope.md`):
  - A joined market shows the default provider's data, and a provider logo appears only for a market that is on one provider.
  - The provider filter belongs to the markets list. Positions and orders show for every provider.
  - Provider choice at trade time is a selector on the order, not a switch of the active provider.
- **Decided by the core contract:** the provider chosen in the "Trade on {provider}" selector is the explicit route for that market screen. The order, the trade configuration, the candles, the order book and the OI cap all use it.
  - Core's market streams (`subscribeToCandles`, `subscribeToOrderBook`, `subscribeToOICaps`) take an optional `providerId`. An explicit route stays on that venue and is "required when both venues list the same symbol". Without one, the stream follows the default provider.
  - Core resolves trade configuration the same way: explicit route first, then `effectiveProvider` (`resolveTradeConfigProviderKey`).
  - So a screen with no selection omits the route and follows the default provider. Once the user picks a provider, every venue-specific read and the order use that `providerId`. The OI cap and the order book must match the venue the order goes to, because they decide whether the order is blocked and what slippage it gets.
- **Possible follow-up:** Pro market detail currently switches the controller's active provider when it opens another venue's market. With routed streams and per-trade selection, that switch should become unnecessary. Removing it belongs to TAT-4405 or the Pro market detail ticket.
- **Sizing:** the ticket is L. A natural PR split:
  1. Bump the package and absorb the breaking changes.
  2. Account per venue, balance hooks and reader fixes.
  3. `providerId` keying in channels and hooks.
  4. Venue-routed candles, order book and OI, plus per-venue snapshot gating.
  5. Grouped market rows and the venue filter.
