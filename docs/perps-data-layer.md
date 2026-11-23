[Mobile] Perps data layer: live balances, positions and markets for each exchange

Demo: Hooks return a live balance for each exchange plus a total, tag every position and order with its exchange, and return one row per market.

Size: L (technical surface, not time). Depends on TAT-4392, TAT-4395 and TAT-4396.

Context

The scope shows positions, orders and balances from both venues at once, and one market row per asset with the venues it trades on. PerpsStreamManager has one account channel, and it only uses the Terminal snapshot when activeProvider === 'hyperliquid' (app/components/UI/Perps/providers/PerpsStreamManager.tsx:2440-2446). Balance hooks read perpsBalances, which core never writes (hooks/usePerpsPortfolioBalance.ts:51, and the Homepage usePerpsSlice.ts:36).

Scope

An account channel per provider in PerpsStreamManager, plus a total.

Per-provider balance hooks fed from the perpsBalances that TAT-4392 fills, and fix the existing readers.

providerId on positions, orders, fills and activity in hooks and selectors.

Candles, order book and OI channels keyed by provider and symbol.

Snapshot source per provider, removing the activeProvider === 'hyperliquid' gate.

Grouped market rows from the core groupMarketsByMarketKey helper (TAT-4396), with a persisted provider filter that keeps at least one provider selected.

Acceptance criteria

AC1 [state] Mobile's @metamask/perps-controller is on a release that contains TAT-4392, TAT-4395 and TAT-4396 (bump it here if no earlier ticket has).

AC2 [state] With positions on both venues, both show with the right venue, and the total balance equals the sum (test).

AC3 [state] A Lighter market's chart and order book come from Lighter (test).

AC4 [mixed] A market on both venues renders as one row with both venues.

Links

Depends on: [TAT-4392](https://consensyssoftware.atlassian.net/browse/TAT-4392) (already merged core per-provider account data), [TAT-4395](https://consensyssoftware.atlassian.net/browse/TAT-4396) (core Lighter snapshot consumer), [TAT-4396](https://consensyssoftware.atlassian.net/browse/TAT-4396) (core marketKey grouping).

Related UI: TAT-4386 (provider badge on market logos), TAT-4387 (two-venue test presets).
