## Explanation

The existing multi-provider plumbing can route writes to named venues, but the default venue also needs to be a saved setting, distinct from the active provider mode. This PR adds that contract, provider-scoped trade settings, and flag-gated migration to aggregated mode.

### Core behavior and state contract

- Adds `setDefaultProvider` and messenger action `PerpsController:setDefaultProvider`, with `SetDefaultProviderResult` and `PerpsControllerSetDefaultProviderAction`. In aggregated mode, changing the default updates the live routing default and default-routed subscriptions without reinitializing the controller or reconnecting provider transports.
- Changes `tradeConfigurations` to `network → providerId → symbol`, isolating leverage, order-book grouping, margin mode and pending configuration by venue. Legacy persisted configurations migrate under the venue active when saved. The nine trade-configuration methods and four package selectors accept an optional trailing `providerId`. An explicit route wins; otherwise they use `effectiveProvider`, falling back to the selected direct provider or saved aggregated default when no live venue exists.
- With the version-gated `perpsMultiProviderModeEnabled` flag enabled, eligible legacy direct-provider state migrates to `aggregated`, preserving an explicit saved default or inferring the legacy venue. Migration runs at construction and during initialization to handle late flags. Explicit direct-provider selections are preserved. An explicitly disabled or version-ineligible flag restores direct mode while preserving the saved default; missing or pending flag validation does not trigger rollback.
- Fixes `updateMargin` dropping its explicit `providerId` before the provider call.

| State field                           | Persistence                                | Meaning                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultProvider`                     | Persisted                                  | Saved preferred default venue, separate from the provider mode; retained when that venue is temporarily unavailable.                                                   |
| `effectiveProvider`                   | Not persisted; `PerpsProviderType \| null` | Live venue for implicit reads, streams and trade settings, including temporary fallback. Null during initialization/provider or network switches and after disconnect. |
| `hasExplicitDefaultProviderSelection` | Persisted                                  | Records an explicit `setDefaultProvider` choice, including a choice equal to the initial fallback.                                                                     |
| `hasMigratedToMultiProvider`          | Persisted                                  | Records that aggregated mode established the default, so rollback/re-enable does not infer a new default from a temporary fallback. Not a user selection.              |
| `hasExplicitProviderSelection`        | Persisted                                  | Records an explicit direct-provider choice through `switchProvider`, preventing later initialization from treating it as unmigrated legacy state.                      |
| `activeProvider` (existing)           | Persisted                                  | Selects the mode: direct venue or `aggregated`; not the saved default or necessarily the live venue.                                                                   |

### Breaking package compatibility, independent of rollout

**This is a breaking change.** Adopting the package requires client changes even with `perpsMultiProviderModeEnabled` off:

- The provider-keyed `tradeConfigurations` shape affects direct state readers, typed defaults and fixtures. Core's persisted-state migration does not rewrite client source or mocks.
- `PROVIDER_ROUTE_REQUIRED` widens the exported `PerpsErrorCode` union, so exhaustive translation maps must handle the new code.
- Client-authored complete `PerpsControllerState` values must include the added state fields. Added trade-configuration types are `PerpsPendingTradeConfiguration`, `PerpsTradeConfiguration` and `PerpsProviderTradeConfigurations`.

Client surfaces:

- **Extension:** the two order-entry readers in `ui/pages/perps/perps-order-entry-page.tsx:478,1447` access `tradeConfigurations[env]?.[decodedSymbol]`. The typed `EMPTY_TRADE_CONFIGURATIONS` default in `ui/selectors/perps-controller.ts:49–50` uses the old shape. The exhaustive map in `ui/components/app/perps/utils/translate-perps-error.ts` (`satisfies Record<PerpsErrorCode, string>`) lacks the new code. Test surfaces: `ui/selectors/perps-controller.test.ts`, `ui/pages/perps/perps-order-entry-page.test.tsx`, `ui/components/app/perps/order-book/order-book.test.tsx`, `test/mocks/metamask-perps-controller.js`, and the controller slices in `test/e2e/fixtures/default-fixture.json` and `onboarding-fixture.json`.
- **Mobile:** the exhaustive `ERROR_CODE_TO_I18N_KEY` map in `app/components/UI/Perps/utils/translatePerpsError.ts` lacks the new code. `tradeConfigurations` appears only in tests, mocks and test data, not production readers: `app/core/Engine/controllers/perps-controller/index.test.ts`, `app/util/test/initial-background-state.json`, and under `app/components/UI/Perps/`: `__mocks__/serviceMocks.ts`, `hooks/usePerpsOrderForm.test.ts`, `Views/PerpsOrderView/PerpsOrderView.view.test.tsx`, `Views/PerpsProMarketView/PerpsProLighterScale.view.test.tsx`.

Flag-off direct trading doesn't need aggregated write routes, but clients still need the changes above to build against this release.

### Explicit write routing and release order

Every aggregated write must carry its concrete venue: `placeOrder`, `editOrder`, `cancelOrder`, `closePosition`, `updatePositionTPSL`, `replacePositionTPSLLeg`, and `updateMargin` through `params.providerId`; `flipPosition` through `params.position.providerId`. A saved default is not a substitute for a route on a multi-venue write.

`#getUnroutedAggregatedWriteRefusal` (`src/PerpsController.ts:3597–3616`):

1. Allows a supplied route (`providerId !== undefined`).
2. Checks the resolved provider, or the current active provider when available; if its `protocolId` is not `aggregated`, it returns no refusal.
3. Exempts an `AggregatedPerpsProvider` with at most one registered provider (`getProviderIds().length <= 1`). Otherwise an unrouted aggregated write returns `{ success: false, error: PROVIDER_ROUTE_REQUIRED }`.

Writes check before expensive work and again after provider resolution, including across cold-start migration. Before initialization, unknown membership is deferred to the resolved-provider check. Direct modes and one-venue aggregated fallback accept unrouted writes; a supplied route bypasses this guard but not other route validation.

Release and adoption order:

1. Ship in a **new major**. Merging Core doesn't force a client upgrade: Mobile and Extension request `^22.3.0` and resolve `22.3.0`.
2. Each client does its compatibility ticket **in the PR that upgrades it to that release**, even with the multi-provider flag off.
3. Enable multi-provider mode per client only after that client's compatibility and routing work ships. [TAT-4394](https://consensyssoftware.atlassian.net/browse/TAT-4394)'s minimum client versions must exclude builds missing either.

### Client plan

Detailed scope lives in the tickets.

| Client    | Plan                                                                                                                                                                                                                                                                                                                                      | Owner / client PR                | Package dependency                                            | Flag / minimum version                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Mobile    | Compatibility: [TAT-4602](https://consensyssoftware.atlassian.net/browse/TAT-4602). Write routing: [TAT-4405](https://consensyssoftware.atlassian.net/browse/TAT-4405). Version-gated adoption: [TAT-4394](https://consensyssoftware.atlassian.net/browse/TAT-4394), [TAT-4403](https://consensyssoftware.atlassian.net/browse/TAT-4403). | Unassigned; no client PR yet.    | On `22.3.0`; compatibility ships with the new-major upgrade.  | Minimum version unset; follows delivery of TAT-4602 and TAT-4405.                                         |
| Extension | Compatibility: [TAT-4603](https://consensyssoftware.atlassian.net/browse/TAT-4603), after [TAT-4534](https://consensyssoftware.atlassian.net/browse/TAT-4534).                                                                                                                                                                            | Unassigned; no client PR yet.    | On `22.3.0`; compatibility ships with the new-major upgrade.  | Not in Lighter V1: flag stays off, no minimum version. Enabling later requires its own routing adoption. |

### Terminal

Not yet audited. An owner needs to check package use, direct state readers, typed defaults, fixtures, exhaustive error maps and trading routes. If Terminal consumes this contract, it needs its own compatibility, routing and version-gated plan before rollout; otherwise record the evidence that it's unaffected.

### Validation

At head `d853a918a246247edfe249e8a29e815be2d08ed1`:

- `tests/src/PerpsController.default-provider.test.ts` has **69 test declarations (52 `it`, 17 `it.each`)**, which expand to **112 tests**; `yarn workspace @metamask/perps-controller run test run tests/src/PerpsController.default-provider.test.ts` passes with no type errors.
- `yarn changelog:validate` passes.
- Client builds against this head haven't been run; that happens in each client's upgrade PR.

Open: the Core release containing this PR, client owners and PRs, the minimum Mobile version, and Terminal applicability.

## References

- Core work: [TAT-4385](https://consensyssoftware.atlassian.net/browse/TAT-4385)
- Client tickets: see **Client plan**

## Checklist

- [x] I've updated the test suite for new or updated code as appropriate
- [x] I've updated documentation (JSDoc, Markdown, etc.) for new or updated code as appropriate
- [x] I've communicated my changes to consumers by [updating changelogs for packages I've changed](https://github.com/MetaMask/core/tree/main/docs/processes/updating-changelogs.md)
- [ ] I've introduced [breaking changes](https://github.com/MetaMask/core/tree/main/docs/processes/breaking-changes.md) in this PR and have prepared draft pull requests for clients and consumer packages to resolve them

**Breaking: yes.** The last box stays unchecked until draft client PRs exist; the tickets above are the plan until then.

<!-- CURSOR_SUMMARY -->
---

> [!NOTE]
> **High Risk**
> Breaking persisted state shape and new routing/error contracts affect all perps clients; changes touch provider lifecycle, trading writes, and account balance attribution in security-sensitive trading flows.
> 
> **Overview**
> Adds **`setDefaultProvider`** so aggregated mode can change the default venue without `switchProvider`'s full re-init: persisted **`defaultProvider`**, live **`effectiveProvider`**, migration flags, and in-place rerouting of default-routed streams (account, candles, order book, TWAP, etc.) via **`AggregatedPerpsProvider`**.
> 
> Introduces **`PROVIDER_ROUTE_REQUIRED`** for trading writes in aggregated mode when multiple venues are registered and no **`providerId`** is supplied; **`updateMargin`** now forwards its route. **Breaking:** **`tradeConfigurations`** is **`network → provider → symbol`**, with optional **`providerId`** on trade-config APIs/selectors and automatic legacy migration.
> 
> Covers multi-provider rollout: version-gated migration direct → **`aggregated`**, rollback when the flag is disabled, HyperLiquid in-memory fallback when the saved default is unavailable, subscription rebind on recovery, and guards so stale account responses and prototype-pollution keys cannot corrupt state.
> 
> <sup>Reviewed by [Cursor Bugbot](https://cursor.com/bugbot) for commit d853a918a246247edfe249e8a29e815be2d08ed1. Bugbot is set up for automated code reviews on this repo. Configure [here](https://www.cursor.com/dashboard/bugbot).</sup>
<!-- /CURSOR_SUMMARY -->
