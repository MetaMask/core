# Ideas backlog — assets-controller #updateState producer

## Outcome (2026-10-27 session)

All viable ideas landed or probed. Final: 110 → 32 ms (−70.9%, 3.4×), parity +
231 tests green, every keep ≥ 11× confidence. Scaling sweep PASS (2.6× at small
scale, 3.6× at large — wins improve with state size).

1. ✅ **E1 KEEP** fast-path amount normalization (110→56).
2. ✅ **E2 KEEP** balance-object reuse (56→49).
3. ❌ **E3 DISCARD** changed-flag vs per-account isEqual — flat after E2; signature
   change not worth it.
4. ✅ **E4 KEEP** #getAssetType memo keyed by native-map identity (43) — probed
   via module-level Map first (7-9ms) but production needs the version guard
   (QueryClient refetch invalidates).
5. ❌ **E5 PROBED FLAT** for-in + shape-count allocations — Hermes hidden-class
   fast paths already cheap; no experiment.
6. ✅ **E6 KEEP** jsonFlatEqual for metadata+prices deep compares (38) —
   cross-validated vs lodash on 20k randomized JSON cases.
7. ✅ **E7 KEEP** echo-amount skip (33) — biggest single win after E1; relies on
   the (provable) invariant that every assetsBalance writer normalizes; guard
   handles decimals-shrink; harness canonAmount trailing-zero bug fixed with it.
8. ✅ **E8 KEEP** type-fix Set by direct insertion (32).

## Not pursued (left on the table, with reasons)

- **Metadata churn spread skip** — churn fires ~2.4×/response in the bench;
  sub-ms. Not worth the diff.
- **V6 loop parity** — out of bench scope (V6 disabled in the profiled build);
  the V6 loop still uses normalizeAmountString + per-entry objects. A follow-up
  bench would need a V6 harness.
- **Post-producer changedPriceAssets filter** — also deep-compares every price
  per poll but sits outside the producer (not measured here); could take
  jsonFlatEqual too in a follow-up.
- **Module-level cross-call caches** (asset type without version guard, amount
  memo) — rejected: staleness risk (#isNativeAsset consults a runtime-updatable
  QueryClient map) and unbounded growth; E4's version guard is the safe form.
