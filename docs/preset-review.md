VERDICT: COMMENT
COMMIT: d35ecaee8fbfad2187314e3471cff5fe723237e4

Thanks for building these. Four named scenarios give every Lighter view test the same starting state, and keeping `SCENARIOS` as plain data checked with `satisfies` makes each scenario easy to read on its own. The migrated aggregated test still catches a wrong market pick: Hyperliquid's ETH is listed first, so picking it would send `providerId: 'hyperliquid'` to `placeOrder` and the assertion would fail.

Before I approve, I'd like four changes: correct the helper's JSDoc and make a missed setup step fail the test, remove the exported `any` type and the ticket keys from the preset file, size the Lighter position in `sameMarketOnBoth` to fit its 50 balance, and correct the docs sentence about which controller version the presets match. The five nits are optional.

⚠️ NOT_CHECKED: I read the code and didn't run the tests.

| Severity | file:line | Problem | Ask |
|---|---|---|---|
| ⚠️ Minor | tests/component-view/helpers/perpsViewTestHelpers.ts:21 | The JSDoc says Lighter needs both the env var and the remote flag, but with no remote flag the env var alone turns it on. Forgetting the helper renders a state the app can't reach, and the test still passes. | Correct the JSDoc and throw from `perpsTwoExchangeState()` when the env var isn't `'true'`. |
| ⚠️ Minor | tests/component-view/presets/perpsTwoExchangePresets.ts:20 | Exports an unused type that resolves to `any`, puts ticket keys in source, and will fail `yarn lint:tsc` in the PR that bumps to the core#11461 release. | Delete lines 17–21 and track the update in Jira, or keep the alias unexported and remove the ticket keys. |
| ⚠️ Minor | tests/component-view/presets/perpsTwoExchangePresets.ts:51 | The Lighter position carries 833.33 margin and 100 PnL on a Lighter account worth 50 with 0 PnL. | Size the position to fit inside 50 and carry its margin and PnL into the balances. |
| ⚠️ Minor | docs/testing/component-view-tests.md:501 | Says the presets use today's controller state. In 22.3.0, nothing writes `perpsBalances` and the aggregated account is Hyperliquid's alone. | Say the presets model core#11461's per-exchange balances and summed account. |
| 🔹 Nit | app/components/UI/Perps/Views/PerpsBalanceOrderView/PerpsBalanceOrderView.view.test.tsx:65 | The helper now applies to all 9 test cases in the file. That's the right state for this file, but the diff doesn't say so. | Add one line to the PR description. |
| 🔹 Nit | tests/component-view/presets/perpsTwoExchangePresets.ts:70 | The return annotation erases the market, position and account types, which forces the cast at `perpsTwoExchangePresets.test.ts:41`. | Use `satisfies` and remove the cast. |
| 🔹 Nit | app/components/UI/Perps/Views/PerpsBalanceOrderView/PerpsBalanceOrderView.view.test.tsx:249 | Line 250 has no effect. Line 249 removes the position that defines the scenario and doesn't say why. | Delete line 250. Explain line 249 or add a scenario without the position. |
| 🔹 Nit | tests/component-view/presets/perpsTwoExchangePresets.test.ts:7 | The `it.each` table restates `SCENARIOS`. | Keep the checks at lines 47–68 and add one for `lighterDown`. |
| 🔹 Nit | tests/component-view/presets/perpsTwoExchangePresets.ts:66 | `presets/` holds `initialState<Feature>()` builders. This file is a second perps entry that returns render options. | Optional: make it a `renderPerpsView` option, or call these "scenarios" in the docs. |

<details>
<summary>Details for agents</summary>

| Status | Item | Evidence or gap | Ask |
|---|---|---|---|
| ⚠️ NOT_CHECKED | Runtime behavior | I didn't run the view or unit tests. | Rely on CI for `d35ecaee8fb`. |
| ⚠️ Follow-up | Copies of the env save/restore code | `PerpsSelectProviderView.view.test.tsx:14-31`, `PerpsOrderLifecycleFlow.view.test.tsx:50-80`, `perps-withdraw-from-row.test.tsx:35-89` and `lighterScaleOrders.integration.test.tsx:391-424` each hand-write what `withLighterBuildEnabled()` does. All four files are outside this diff. | Move them to the helper in a later PR. |

➖ This PR changes no production code. These rule families don't apply: Perps anti-patterns, controller portability, math, formatting, magic numbers, protocol, Pro gating, events, Sentry, connection and WebSocket, trade flow, navigation, testIDs, Android back, modal layout, controller mocks, the signer, and Extension/Terminal parity.

</details>

---

## Line comments

Post each comment below on its line.

### 1. ⚠️ Minor: `tests/component-view/helpers/perpsViewTestHelpers.ts:21`

**Why this PR:** The JSDoc is new, and anyone calling `perpsTwoExchangeState()` will follow it.

**Problem:** Lighter is available when `isLighterProviderEnabled() && (remoteFlag ?? isLighterProviderEnabled())` is true (`usePerpsProvider.ts:69-80`, `selectors/featureFlags/index.ts:570-579`). That has two consequences:

- With no `perpsLighterProviderEnabled` flag in state, the env var alone turns Lighter on. `initialStatePerps` doesn't set that flag. That's why this helper changes conditions for every test in `PerpsBalanceOrderView.view.test.tsx`.
- With the flag on, the env var is still required. A test that calls `perpsTwoExchangeState()` but forgets `withLighterBuildEnabled()` renders `activeProvider: 'aggregated'` while `usePerpsProvider` reports `availableProviders: ['hyperliquid']`. The app can't produce that state, and the test won't tell you.

**Ask:**

1. Change the JSDoc to: "Lighter is available when this env var is `'true'` and the `perpsLighterProviderEnabled` remote flag is on or absent."
2. Throw from `perpsTwoExchangeState()` when `process.env.MM_PERPS_LIGHTER_PROVIDER_ENABLED !== 'true'`, with a message that names `withLighterBuildEnabled()`. This works when the preset is called inside a test, as your docs example does. Because the helper sets the env var in `beforeEach`, a call at describe level would throw even with the helper in place. Add one sentence to the docs saying so.

### 2. ⚠️ Minor: `tests/component-view/presets/perpsTwoExchangePresets.ts:20`

**Why this PR:** Lines 17–21 are new. They hold the only `@ts-expect-error` under `tests/component-view/`, and nothing imports `PerpsAccountProviderStates`.

**Problem:**

- `AccountState` in `@metamask/perps-controller@22.3.0` has no `providerStates`, so the alias resolves to `any`, and it's exported.
- `tests/**/*` is part of the `lint:tsc` project. When a controller release containing core#11461 lands, tsc will report "Unused '@ts-expect-error' directive" here, and that error lands in whichever PR bumps the dependency.
- The comments name `TAT-4392` and `core#11461`. The perps review rules keep ticket keys and PR numbers out of source. They belong in Jira and the PR description.

**Ask:** Pick one:

- **Preferred:** Delete lines 17–21 and the last sentence of the docs section. Then add "update the two-exchange presets for `providerStates`" as a follow-up linked to TAT-4392.
- Keep the reminder, remove `export`, take the ticket keys out of the comment, and note in the PR description that the bump PR will need to update these presets. Mobile's tsconfig doesn't set `noUnusedLocals`, so an unexported alias compiles.

### 3. ⚠️ Minor: `tests/component-view/presets/perpsTwoExchangePresets.ts:51`

**Why this PR:** The scenario is new, and it combines values that can't all be true together.

**Problem:** `createLongPositionForViews()` brings `size: '1'`, `marginUsed: '833.33'` and `unrealizedPnl: '100'`. The same scenario gives Lighter `totalBalance: '50'` and `unrealizedPnl: '0'` in `perpsBalances`. The account stream (`createFundedAccountForViews('150')`, line 108) reports `marginUsed: '0'` and `unrealizedPnl: '0'`. A 1 ETH position at 3x needs 833.33 of margin, which a balance of 50 can't hold. No test in this PR reads margin, PnL or available balance, so nothing fails today. The first Lighter test that does will pass or fail on numbers no real account could produce.

**Ask:** Size the position to fit inside 50 and carry its margin and PnL through. With ETH at 2500, the market fixture's price:

```ts
createLongPositionForViews({
  providerId: 'lighter',
  size: '0.05',
  entryPrice: '2400',
  positionValue: '125',
  marginUsed: '40',
  unrealizedPnl: '5',
  returnOnEquity: '0.125',
});
```

Then:

- Set `perpsBalances.lighter.unrealizedPnl` to `'5'`.
- Give the account stream `marginUsed: '40'` and `unrealizedPnl: '5'`.
- Set `spendableBalance` and `withdrawableBalance` to `'110'` (150 − 40).

If `perpsTwoExchangeState()` derives those account fields from `positions`, future scenarios stay consistent without hand-editing.

### 4. ⚠️ Minor: `docs/testing/component-view-tests.md:501`

**Why this PR:** The sentence is new, and the next person writing a Lighter view test will rely on it.

**Problem:** In `@metamask/perps-controller@22.3.0`, aggregated mode doesn't produce the state these presets describe:

- `PerpsController` builds `AggregatedPerpsProvider` with `defaultProvider: 'hyperliquid'` (`dist/PerpsController.js:1757-1759`). Its `subscribeToAccount` and `getAccountState` return only Hyperliquid's account (`dist/providers/AggregatedPerpsProvider.js:327-331` and `895-899`).
- Nothing writes `perpsBalances` beyond its default `{}`, in 22.3.0 or on core `main`.

Per-exchange `perpsBalances` entries and a summed account arrive with core#11461. That PR also deletes an exchange's `perpsBalances` entry when the exchange is unavailable. So `bothFunded` and `sameMarketOnBoth` (account 150, two `perpsBalances` entries) model #11461. `lighterDown` (account 100, no Lighter entry) matches what both versions produce for those two fields. Modelling #11461 is the right call, since the Lighter UI tickets will ship against it. The docs should say that.

**Ask:** Replace the sentence with: "The presets model per-exchange `perpsBalances` and a summed account as core#11461 produces them. They don't set `AccountState.providerStates` or `aggregate` yet." If you remove the `@ts-expect-error` reminder (comment 2), drop the `yarn lint:tsc` clause too.

### 5. 🔹 Nit: `app/components/UI/Perps/Views/PerpsBalanceOrderView/PerpsBalanceOrderView.view.test.tsx:65`

**Why this PR:** On main the env var was unset for every test in this file. It's now `'true'` for all 9 test cases (8 `it` blocks).

**Problem:** This doesn't change any behavior, and file-wide is the right scope. Every test here sets `activeProvider: 'lighter'` (line 44). On main, the other 7 `it` blocks ran with Lighter selected while `usePerpsProvider` reported `availableProviders: ['hyperliquid']`, a state the app can't produce. With the env var on, they run in a reachable state. The components these tests render (`PerpsBalanceOrderView`, `PerpsMarketDetailsView`, `PerpsProOrderFormPanel`) use `usePerpsProvider` only for order capabilities and `switchProvider`. None of them read `availableProviders`, so no assertion changes. The commit message calls this migration minimal, though, and a reader of the diff won't see that the whole file now runs under different conditions.

**Ask:** Add one line to the PR description: "`PerpsBalanceOrderView.view.test.tsx` now runs every test with the Lighter build flag on, matching its `activeProvider: 'lighter'` state."

### 6. 🔹 Nit: `tests/component-view/presets/perpsTwoExchangePresets.ts:70`

**Why this PR:** The annotation is new.

**Problem:** `PerpsStreamOverrides` types `account`, `positions`, `orders` and `marketData` as `unknown`. Annotating the return with it erases `AccountState`, `Position[]` and `PerpsMarketData[]`, and that's why `perpsTwoExchangePresets.test.ts:41` needs `(market as { providerId: string })`. Removing the annotation alone isn't enough. TypeScript would then infer `activeProvider` as `string`, which isn't assignable to `PerpsActiveProviderMode` inside `DeepPartial<RootState>`.

**Ask:** Remove the annotation, end the return with `satisfies { overrides: DeepPartial<RootState>; streamOverrides: PerpsStreamOverrides }`, and delete the cast on line 41.

### 7. 🔹 Nit: `app/components/UI/Perps/Views/PerpsBalanceOrderView/PerpsBalanceOrderView.view.test.tsx:249`

**Why this PR:** Lines 249 and 250 are new.

**Problem:**

- Line 250 (`prices: options.streamOverrides.prices`) has no effect. Line 247 already spreads `options.streamOverrides`, and the preset doesn't set `prices`.
- Line 249 (`positions: []`) removes the Lighter ETH position. Apart from that position, `sameMarketOnBoth` differs from `bothFunded` only in listing ETH on both exchanges. This test needs ETH on both exchanges with no position, and no scenario provides that.

**Ask:** Delete line 250. For line 249, either add a comment saying the order flow under test starts with no open position, or add a `sameMarketOnBothFlat` scenario and use it here.

### 8. 🔹 Nit: `tests/component-view/presets/perpsTwoExchangePresets.test.ts:7`

**Why this PR:** The file is new.

**Problem:** The `it.each` table restates `SCENARIOS` (provider lists and totals), so every scenario change means editing two files. The tests at lines 47–68 check what each scenario is for, and those are the ones a future reader needs.

**Ask (optional):** Replace the table with one test that checks the account total equals the sum of `balances`, keep lines 47–68, and add a `lighterDown` test: no `lighter` key in `perpsBalances` and no market with `providerId: 'lighter'`.

### 9. 🔹 Nit: `tests/component-view/presets/perpsTwoExchangePresets.ts:66`

**Why this PR:** The file is new, and it's the second perps file in `presets/`.

**Problem:** `tests/component-view/AGENTS.md` describes `presets/` as `initialState<Feature>()` builders, one file per feature area. `perpsTwoExchangeState()` returns render options for `renderPerpsView`, which is a different kind of helper. Perps variants already go through renderer options that feed `initialStatePerps`. See `crossMarginEnabled` and `socialEnabled` in `perpsViewRenderer.tsx:699-714`.

**Ask (optional):** Add an `exchanges?: PerpsTwoExchangeScenario` option to `RenderPerpsViewOptions` and merge the scenario inside `renderPerpsView`, so a test writes `renderPerpsHomeView({ exchanges: 'bothFunded' })`. If you'd rather keep the current shape, rename the docs heading to "Perps: two-exchange scenarios" so readers don't look for an `initialState…()` builder.
