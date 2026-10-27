Title:
  [perf-agent:assets-controller/AssetsController.ts] #updateState producer: 3.4× faster balance/metadata/price reconciliation

Labels: DO-NOT-MERGE, area-performance, assets-performance-agent

---

## Why

MetaMask Mobile Hermes profile **run 39731720623** (main @ `9b830f28`,
"Measure Warm Start: Login To Wallet Screen") shows the Asset View
**1.86× regression** tracked in mobile issue #37813 (owner:
assets-dev-team). The hottest assets-owned path is the
`AssetsController` **`#updateState` producer** — the V5 balance
reconciliation loop (`applyV5AccountBalanceUpdate`, ~258 ms self time in
the warm-start scenario): every poll it re-normalizes every tracked
balance through `new BigNumber(...).toFixed(...)` (imported
`normalizeAmountString`), rebuilds every balance object, re-parses every
asset id for type reconciliation, and deep-compares metadata/prices with
the fully general lodash `isEqual`.

## What changed (one file, `packages/assets-controller/src/AssetsController.ts`)

1. **`canonicalAmountFastPath`** (module-local): returns canonical
   plain-decimal amount strings unchanged (regex-validated, fraction ≤
   `floor(decimals)` or natural-precision mode) and falls back to the
   imported `normalizeAmountString` for anything else. Kills the
   `BigNumber`/`toFixed` round-trip for the overwhelming majority of
   warm-poll entries.
2. **Balance-object reuse**: when the recomputed `{amount, metadata?}` is
   content-identical to the previous entry and the previous object has
   exactly that shape (1 or 2 keys), the previous object reference is
   reused — eliminating per-asset object churn and making the per-account
   `isEqual` compare reference-short-circuit.
3. **`#getAssetType` memoization** (instance cache keyed by native-asset-map
   identity): the type-fix loop re-derives every tracked id's type on
   every poll via CAIP parsing + a scan over the native asset map. The
   cache is invalidated whenever the QueryClient's native asset map is
   replaced (it has stable identity per fetch), so results can never go
   stale.
4. **`jsonFlatEqual`** (module-local): JSON-specialized exact deep-equality
   (SameValueZero for primitives, strict key-set comparison, array/object
   type split) used by the metadata and price loops instead of lodash
   `isEqual`. Both operands there are API JSON payloads, so the general
   fallbacks (Dates, RegExps, typed arrays, symbol keys) can never be hit.
   Validated identical to lodash `isEqual` on 20,000 randomized JSON
   values (including `undefined`, `NaN`, `-0`, `null`, nested objects,
   arrays).
5. **Echo-amount skip**: when a response echoes the exact amount string
   already in state, normalization is skipped entirely — every writer of
   `assetsBalance` normalizes amounts (this loop) or writes the literal
   `'0'` (native/custom zero seeding), so a state amount is canonical by
   construction, and integers/within-precision fractions skip the
   canonical-form machinery; a `fracLen > floor(decimals)` guard handles
   decimals shrinking after a metadata update (falls back to the full
   normalizer, preserving the existing self-healing behavior).
6. **Type-fix Set built by direct insertion** instead of spread +
   `flatMap` (identical membership and insertion order, no intermediate
   arrays).

## Bench & verification

- Hermes (on-device engine, same build as the profile) micro-benchmark of
  the producer: realistic 4-account / ~122-asset state, 35 responses
  (30 realistic polls with exact no-op echo tracking + 5 edge responses:
  full-mode replace, new keys, metadata churn, odd amounts), timing
  excludes input cloning. Frozen original vs candidate compared per
  response (final state, changedBalances, changedMetadata) plus a
  13-case edge battery (empty/new-account/native-seed/odd-amounts/
  no-metadata/staking+custom replace-survival/full-mode/metadata-fallback/
  price identity).
- **`primary_ms` 110 → 32 (−70.9%, 3.4×)** at the profiled scale.
- **Scaling sweep** (wins hold and improve with state size):
  - 15 assets / 10 responses: 24 → 9 (2.6×)
  - 30 assets / 30 responses (default): 113 → 33 (3.4×)
  - 60 assets / 10 responses: 78 → 21.5 (3.6×)
  - 60 assets / 30 responses: 215 → 60 (3.6×)
- Every kept change measured ≥ 11× above run-to-run noise (MAD-based).
- All 231 assets-controller vitest tests pass; `tsc` clean; parity
  self-check green on every measurement.

## Safety notes for review

- No public API/export changes; all new helpers are module-private or
  instance-private.
- The `#getAssetType` cache cannot go stale (invalidated on native-map
  identity change); other callers of `#getAssetType` benefit too.
- The echo-amount skip relies on the (verifiable) invariant that state
  amounts are canonical: every `assetsBalance` writer normalizes, zero
  seeds write literal `'0'`, there are no state migrations rewriting
  balances, and pre-human-readable (#7752) persisted balances were raw-wei
  strings that human-readable responses cannot string-match. The
  self-healing path for changed amounts is untouched.
- V6 path (`applyV6AccountBalanceUpdate`) and the post-producer
  `changedPriceAssets` filter are intentionally untouched (out of the
  profiled/benched scope); both are candidates for the same treatment in
  a follow-up.

## Bench reproducibility

The autoresearch playground (bench sources, assembler, parity harness,
experiment log) lives in `.auto/` on this branch (commits
`6d4c95c31cd`..`c2a7348ebb1`); see `.auto/prompt.md` for the full
methodology and per-experiment record.
