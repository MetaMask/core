# USDH Sunset Assessment

Date: 2026-06-08

## Summary

USDH sunset is a cleanup item for Perps, not a critical product blocker, assuming we continue with the current product direction of not surfacing USDH collateral UI. I did not find a mobile or extension UI that explicitly lets users choose USDH collateral or initiate a USDC-to-USDH swap. The remaining risk is conditional: if USDH-collateralized HIP-3 markets were allowed through controller market discovery in the future, `HyperLiquidProvider` could transparently attempt a USDC-to-USDH swap before order placement.

Recommendation for backlog: medium-low priority cleanup. Do not treat this as a July 17 launch blocker unless USDH-collateral markets become exposed by feature flags/allowlists. The useful action is to remove stale USDH-specific controller/mobile paths and tests when convenient, or explicitly block USDH-collateral markets as defense-in-depth.

## External Timeline

- 2026-05-14: Native Markets announced the USDH transition and Coinbase's plan to become the official USDC treasury deployer for Hyperliquid AQAv2.
- 2026-06-05: Hyperion DeFi filed an 8-K stating Native Markets planned to cease USDH support, encouraged holders to convert USDH to USDC or cash, and terminated its Temporary Use Agreement effective 2026-06-18.
- 2026-07-17: Native Markets says the USDH dashboard will support USDH-to-USDC and USD fiat conversions until this date. `redeem.bridge.xyz` remains available after that with separate KYC, and the USDH/USDC spot order book is stated to persist indefinitely.
- HIP-3 and HIP-1 USDH markets are described as operational during the interim but winding down during the sunset period.

Sources:

- Hyperion DeFi 8-K, 2026-06-05: https://ir.hyperiondefi.com/sec-filings/all-sec-filings/content/0001104659-26-071001/tm2617045d1_8k.htm
- Native Markets USDH migration page: https://usdh.com/migration

## Repo Findings

### `@metamask/perps-controller`

Criticality: medium-low under current product plans; medium only if USDH-collateral HIP-3 markets become enabled in market discovery or feature flags.

Direct USDH references are present and operational, not just comments or tests:

- `src/constants/hyperLiquidConfig.ts:469` defines `USDH_CONFIG`, including `TokenName: 'USDH'` and a USDC-to-USDH swap slippage buffer.
- `src/providers/HyperLiquidProvider.ts:1900` checks whether a HIP-3 DEX collateral token is USDH.
- `src/providers/HyperLiquidProvider.ts:1928` reads spot USDH balances.
- `src/providers/HyperLiquidProvider.ts:2041` finds the USDH/USDC spot pair and places an IOC order to buy USDH with USDC.
- `src/providers/HyperLiquidProvider.ts:2206` ensures USDH collateral by transferring USDC to spot and swapping to USDH.
- `src/providers/HyperLiquidProvider.ts:3507` calls this path during HIP-3 pre-order handling when the DEX collateral is USDH.

Impact:

- If USDH markets or the USDH/USDC spot pair disappear, the controller can fail order placement for any still-listed USDH-collateralized HIP-3 market with `SPOT_PAIR_NOT_FOUND`, `SWAP_FAILED`, or liquidity-related errors.
- If markets are fully removed from metadata, this path becomes unreachable and turns into dead code/test debt.
- The risk is mainly order placement for exposed USDH-collateral markets, not funds movement into or out of Perps.
- I did not find client UI that directly presents the USDC-to-USDH swap. The swap path is hidden in controller order preparation, so it is only reachable if a user can place an order on a USDH-collateral HIP-3 market.
- Since there are no plans to surface USDH collateral UI, this should be tracked as stale capability cleanup plus a guardrail against accidentally exposing USDH-collateral markets.

Deposit/withdrawal exposure appears low:

- `src/services/DepositService.ts:68` takes the first provider deposit route and builds an ERC-20 transfer to the Hyperliquid bridge.
- `src/providers/HyperLiquidProvider.ts:2622` returns supported deposit routes from `getSupportedPaths`, and current constants are USDC-oriented.
- `src/providers/HyperLiquidProvider.ts:2648` makes withdrawal routes mirror deposit routes.
- `src/constants/perpsConfig.ts:65` uses USDC defaults for withdrawal minimum, fee amount, and fee token.
- `packages/transaction-pay-controller/src/strategy/server/perps.ts:5` normalizes perps deposits specifically around Arbitrum USDC and HyperCore USDC.

Tests intentionally exclude USDH from funded-state totals:

- `tests/src/utils/accountUtils.test.ts:242` verifies USDH-only spot balances are excluded.
- `tests/src/providers/HyperLiquidProvider.data.test.ts:541` verifies USDH-only spot balances are not counted in funded-state totals.

These tests should remain conceptually valid in a USDC-only world, but the test names can be reframed as "non-USDC stable/spot balances" if USDH-specific assertions are removed.

### `metamask-mobile`

Criticality: low.

Exact USDH code references found:

- `app/components/UI/Perps/utils/translatePerpsError.ts:183` maps `USDH.*USDC.*not found` into `SPOT_PAIR_NOT_FOUND`.
- `app/components/UI/Perps/utils/translatePerpsError.test.ts:723` tests `USDH to USDC pair not found`.
- `app/components/UI/Perps/utils/transactionTransforms.test.ts:969` uses `feeToken: 'USDH'`.
- Docs under `docs/perps/hyperliquid/` describe USDH collateral/account-mode behavior.

Assessment:

- The explicit `USDH.*USDC.*not found` regex should be removed once controller no longer attempts USDH swaps. Keeping generic `spot pair not found|trading pair not found` is safer because it still covers non-USDH missing-pair failures.
- The `feeToken: 'USDH'` transform test should be updated to USDC or converted into a generic non-USDC fee-token display test only if the app still intends to display arbitrary historical fee tokens.
- Mobile `usePerpsTopOfBook.ts` comments mention 0.045% taker and 0.015% maker as fee examples. The fee calculation path itself calls `PerpsController.calculateFees`; the comments/tests should be checked if AQAv2 fee changes are introduced.
- Mobile does support HIP-3 market plumbing generally (`getMarkets`, HIP-3 deeplinks, HIP-3 debug tooling), but I did not find a USDH-specific collateral or swap UI. User-facing priority depends on whether the controller/remote config can surface USDH-collateral market symbols into normal market lists.
- Given no plans to surface USDH collateral UI, mobile work is ordinary cleanup: remove/update stale USDH-specific tests and error patterns after controller cleanup.

### `metamask-extension`

Criticality: low.

Exact USDH references found only in docs:

- `docs/agent-tasks/perps-unified-account.md:163`

Perps fee handling already routes through the controller:

- `ui/hooks/perps/usePerpsOrderFees.ts:79` says extension calls `PerpsController.calculateFees`, which routes to `HyperLiquidProvider.calculateFees`.
- `ui/hooks/perps/stream/usePerpsTopOfBook.ts` only reads order book top-of-book data; it does not hardcode USDH.

Extension has hardcoded fallback fee tests around 0.00045, but no direct USDH production usage was found.

Extension also supports HIP-3 market lists generally and appears to trust controller-side HIP-3 gating, but I did not find a USDH-specific collateral or swap UI. No USDH-specific extension backlog item is needed beyond keeping controller-side gating correct.

## Recommended Actions

### Backlog Recommendation

1. Verify whether USDH-collateral markets are exposed by controller config and client feature flags.
   - Expected state: not exposed.
   - If they remain unexposed, no urgent product action is required.
   - If they are exposed unexpectedly, gate/filter them before users can place orders.

2. Remove or gate USDH-collateral order support in `HyperLiquidProvider`.
   - Preferred long-term behavior: do not auto-swap USDC to USDH.
   - If a market still reports USDH collateral, mark it unsupported or filter it from market discovery/trading before order placement.
   - Remove `#swapUsdcToUsdh`, `#getSpotUsdhBalance`, `#ensureUsdhCollateralForOrder`, and `USDH_CONFIG` only after confirming no remaining supported provider path needs them.

3. Update perps-controller tests.
   - Replace USDH-specific funded-state tests with generic "non-USDC spot balance is ignored" tests, or keep a single historical regression test if useful.
   - Add/adjust tests for USDH-collateral DEX filtering or unsupported-market behavior if market filtering is the chosen implementation.

4. Update mobile USDH cleanup.
   - Remove `USDH.*USDC.*not found` from `translatePerpsError.ts` after core no longer emits USDH-pair failures.
   - Update `transactionTransforms.test.ts` to use `USDC` unless arbitrary historical fee-token rendering remains intentionally supported.

5. Verify market discovery/config flags.
   - Confirm HIP-3 DEXes that were USDH-collateralized are not surfaced as tradable after their migration/wind-down.
   - Confirm no feature flag enables USDH-collateral markets after the sunset window.

### Should do with AQAv2 fee changes

1. Verify fee constants and fallback behavior.
   - `packages/perps-controller/src/constants/hyperLiquidConfig.ts:115` still uses base taker `0.00045` and maker `0.00015`.
   - Mobile and extension primarily call `calculateFees`; hardcoded values in comments/tests are lower risk but should be updated if AQAv2 changes base rates.

2. Prefer dynamic fee data where possible.
   - If Coinbase AQAv2 changes the base fee model, update the provider fallback constants and tests in core first. Client comments/tests should follow.

### No action needed unless product scope changes

1. Deposit and withdrawal collateral assumptions.
   - Current core and transaction-pay paths are USDC-specific and do not appear to assume USDH as supported collateral for deposit/withdrawal.
   - If product wants native USDH withdrawal redemption support during the sunset period, that is new scope and should be implemented as an explicit redemption/bridge flow, not hidden inside Perps deposit/withdrawal routes.

## Decision

This should go into the backlog as medium-low cleanup, not as a critical USDH sunset blocker. We have no current plan to surface USDH collateral UI, and I did not find mobile or extension UI that exposes USDH collateral or USDC-to-USDH swapping. The only escalation condition is accidental exposure of USDH-collateral HIP-3 markets through controller market discovery or feature flags.
