# Autoresearch: assets-controller `#updateState` producer (V5 balance hot path)

## Objective

Optimize the `#updateState` producer in `packages/assets-controller/src/AssetsController.ts`
(MetaMask/core) — the code passed to `this.update((state) => {...})` — focusing on the
**V5 balance path** (`applyV5AccountBalanceUpdate`), the metadata merge, and the price
merge loops.

**Why this code (profile evidence):** Hermes profile run **39731720623**
(2026-10-22, mobile main @ 9b830f28, baseline runs 39697733250/39649374566) flags
`applyV5AccountBalanceUpdate` (dist:2203) with **258.4 ms self time** in
"Measure Warm Start: Login To Wallet Screen" — the assets-dev-team-owned hot path
behind the Asset View 1.86× regression (issue #37813, owner assets-dev-team; cal 0.95 →
device-speed check passes, median 0.953). Per-asset cost drivers in the loop:

- `normalizeAmountString` → `new BigNumberJS(amount)` + `toFixed()` for **every**
  amount on every poll, even when the string is already a canonical plain decimal
  (bignumber.js 9.1.2 construction + format is the bulk of the per-entry cost).
- A fresh `{ amount, metadata? }` object per asset even when content is identical
  (object-spread churn, defeats reference equality downstream).
- `isEqual(previousBalances, effectiveAccountBalances)` per account (lodash-es deep
  compare over ~all balance entries).
- Metadata loop: `{...existing, ...incoming, ...}` churn path + `isEqual` per key;
  prices loop: `isEqual` per key.

The bench (`.auto/bench/workload.js`) extracts this exact producer (verbatim,
this-method substitution only) and drives it with a deterministic warm-start sequence:
30 realistic Accounts-API-v5 poll responses + 5 edge responses across 4 accounts /
~130 assets each (merge no-ops, ~10% changed, new keys, odd amount strings, chain-slice
`replaceCoveredChainBalances`, one `updateMode: 'full'`, metadata merges, price updates).
`primary_ms` ≈ 110 ms at baseline; parity (`SELF_CHECK`) vs the frozen ORIGINAL
implementation is enforced on every run, including a 13-case edge battery
(empty maps, new account zero-native, odd amounts incl. non-string, metadata
preserve-churn, type self-heal, staking/custom survival under chain replace,
full mode, balance-metadata fallback, prices identical-vs-changed).

## Metrics

- **Primary**: `primary_ms` (ms, lower is better) — CANDIDATE producer total over the
  sequence (median of 3 in-process reps; measure.sh medians 3 process runs).
- **Secondary**: `orig_ms` — frozen ORIGINAL on the same inputs, same process.
  `orig_ms` must stay flat across experiments (it is the reference; if it moves, the
  bench environment drifted — investigate before trusting the delta).

## How to Run

- `./.auto/measure.sh` — benchmark + parity; emits `METRIC primary_ms=...`,
  `METRIC orig_ms=...`, `DET ...` detail lines. ~5 s.
- `./.auto/checks.sh` — runs `checks_command` from harness.json: targeted vitest
  (231 tests) over `AssetsController.test.ts`,
  `AssetsController.stale-balance-scenarios.integration.test.ts`,
  `AssetsController.spam-cleanup.test.ts`,
  `AssetsController.ws-price-updates.integration.test.ts`. ~12 s.

## Files in Scope

- **`packages/assets-controller/src/AssetsController.ts`** — the only production file
  that may change. Public API must not change (no exported signature changes).
  `effectiveAccountBalancesV5` is module-private: its signature may change if that
  is the cleanest way to carry a change-flag (verify nothing else references it).
- **`.auto/bench/04-candidate.js`** — the bench CANDIDATE mirror of the producer.
- **`.auto/bench/assemble.py`** — regenerates `workload.js` from 03/04/05 sections.
  Re-run after every 04 edit: `python3 .auto/bench/assemble.py` (use
  `/opt/homebrew/bin/python3`; system python3 is 3.9 and crashes on this script's
  syntax usage).

## Off Limits

- `.auto/bench/03-helpers-original.js` (frozen ORIGINAL + shared bench helpers),
  `05-harness.js`, the vendored bignumber/lodash sections, `measure.sh`, `checks.sh`,
  `median.mjs`, `harness.json` — except the documented scaling-sweep exception below.
- Any production file other than `AssetsController.ts` (single-file constraint for
  the eventual PR). `src/utils/normalizeAmountString.ts` must stay untouched — if you
  want a fast path, write a **local helper inside AssetsController.ts** that wraps
  or replaces its use there.
- No new dependencies. No test-file edits.

## Constraints

- **Mirror-edit contract:** every experiment edits BOTH
  (a) `packages/assets-controller/src/AssetsController.ts` and
  (b) `.auto/bench/04-candidate.js`, making the *same* semantic change. The workload
  parity gate then proves behaviour equivalence of the candidate vs ORIGINAL; the
  vitest suite proves production correctness. If an edit only makes sense on one
  side (pure production-only typing), keep the behavioural mirror exact.
- Re-run `assemble.py` after editing 04 (workload.js is generated).
- `SELF_CHECK=OK` required (automatic via measure.sh).
- `./.auto/checks.sh` must pass before `keep`.
- Keep ≥2× noise-beating confidence before accepting a win as real; confirm on a
  scaling sweep before finalizing (see below).
- Baseline `primary_ms` ≈ 110 ms; `orig_ms` ≈ 110 ms at start.

## Optimization Ideas (ladder — cheapest/highest leverage first)

1. **Fast-path amount normalization** (kills the BigNumber cost on the common case):
   in `AssetsController.ts`, add a module-local helper, e.g.
   `canonicalAmount(amount, decimals)` → returns `amount` unchanged iff it is already
   the exact string `normalizeAmountString` would return; otherwise falls back to
   the imported `normalizeAmountString`. Safe condition (verify against the frozen
   ORIGINAL `normalizeAmountString_ORIG` semantics — it must be *provably* identical):
   `typeof amount === 'string'` AND matches
   `/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/` (no leading zeros except "0", no
   trailing zeros, no sign, no exponent) AND
   `decimals === undefined || !Number.isFinite(decimals) || decimals < 0`
   → `toFixed()` returns the string unchanged for these; OR
   `fracLen(amount) <= Math.floor(decimals)` → `toFixed(d, ROUND_DOWN)` pads then the
   trailing-zero trim returns the original. PARITY TRAPS to respect (slow-path them):
   "00", "0.50", "1.0", ".5", "-1.5", "1e-18" (exponent), "1.500", non-strings,
   empty string, `decimals` non-integer (use `Math.floor` exactly like the original),
   `decimals` smaller than fracLen (truncation). Cover all of these in 04 mirror and
   rely on the battery (odd amounts) + parity gate.
2. **Balance-object reuse** (kills object churn + makes later compares shallow): in
   the V5 loop, when the newly computed `{ amount, metadata? }` is content-identical
   to `previousBalance` (same `amount` string, same metadata reference, and the
   previous object has exactly the keys the original would produce — 1 key without
   metadata, 2 keys with), assign `effectiveAccountBalances[assetId] = previousBalance`
   instead of a fresh object. This also makes the per-account `isEqual` cheap
   (lodash `baseIsEqual` short-circuits reference-equal values).
3. **Replace per-account `isEqual(previousBalances, effectiveAccountBalances)` with a
   changed flag** tracked while building `effectiveAccountBalances` (key added, key
   dropped in replace mode — `effectiveAccountBalancesV5` already walks previous
   entries in replace mode and can report drops — amount/metadata difference, native
   seed). Module-private function, signature change is allowed.
4. **Metadata loop churn**: avoid the `{...existing, ...incoming, ...}` spread when
   the merged result is content-identical to `existing`; quick-check
   `previousState.assetsInfo[key] === existing` before deep `isEqual`.
5. **Prices loop**: quick reference check before `isEqual` (cheap; measure first).

Discard anything that does not beat noise with ≥2× confidence. `orig_ms` must not move.

## Scaling sweep (before finalizing a keep-winner)

Temporarily edit `.auto/bench/05-harness.js` scale knobs — `const nErc20 = 30` and
`const R = 30` (e.g. 15/10, 30/10, 60/10, 30/30, 60/30; also responses with more
no-op weight by raising the 0.85 threshold if useful) — re-run `assemble.py` +
`measure.sh` for each, then **restore the knobs exactly** (30/30) and re-run. The
win must hold direction (and roughly ratio) across scales. This is the only
sanctioned edit of 05-harness.js, and only for the sweep, restored afterwards.

## What's Been Tried

*(autoresearch: keep this updated per experiment)*

- Baseline (no code change): `primary_ms` ≈ 110, `orig_ms` ≈ 110.
  reps stable ±4 ms across process runs (2026-10-27).
- **E1 KEEP (110→56)**: `canonicalAmountFastPath` module-local helper — returns
  canonical plain-decimal amounts unchanged (regex + fracLen ≤ floor(decimals) or
  natural precision), else falls back to the imported `normalizeAmountString`.
  Kills `new BigNumber`+`toFixed` for warm-poll entries.
- **E2 KEEP (56→49, conf 8.7×)**: reuse `previousBalance` reference when content-
  identical (amount equal + exact key-shape 1/2 guard). Kills per-asset object
  churn; makes the per-account `isEqual` mostly reference-short-circuit.
- **E3 DISCARD (49→50, no gain)**: account-level changed-flag replacing the
  per-account `isEqual` (incl. `droppedPreviousKey` reporting from
  `effectiveAccountBalancesV5`). After E2 the compare is already cheap; the
  signature change wasn't worth it. Bench mirror had to be reverted by hand
  (discard reverts production only — 04-candidate.js lives under `.auto/`).
- **E4 KEEP (43ms, conf 11.2×)**: memoize `#getAssetType` in an instance cache
  keyed by native-asset-map identity (QueryClient refetch ⇒ new map object ⇒
  cache invalidated; no staleness). The type-fix loop re-parses every tracked id
  every poll. Bench mirror: `ctx.__typeMemo` (bench native set is static).
- **E5 PROBED FLAT (no experiment)**: for-in iteration + allocation-free shape
  count in the balance loop — no measurable gain at 32-43ms (Hermes hidden-class
  fast paths already handle Object.entries/keys). Discarded without production edit.
- **E6 KEEP (38ms, conf 11.2×)**: `jsonFlatEqual` — JSON-specialized exact deep-
  equal (SameValueZero, strict key-set, array/object type split) replacing lodash
  `isEqual` in the metadata and price loops. Cross-validated identical to lodash
  on 20k randomized JSON cases (incl. undefined/NaN/-0/null/nested).
- **E7 KEEP (33ms, conf 11.1×)**: echo-amount skip — when the response echoes the
  exact amount string already in state, skip normalize + decimals lookup entirely
  (state amounts are canonical by construction: every `assetsBalance` writer
  normalizes or writes literal '0'; no migrations; guard handles decimals-shrink
  via fracLen vs floor(decimals); integers skip the decimals lookup).
  Harness fix shipped with it: `canonAmount` now strips ALL trailing zeros
  (`while` not `if`) — its single-strip bug seeded non-production-representative
  trailing-zero amounts.
- **E8 KEEP (32ms, conf 11.0×)**: type-fix `Set` built by direct insertion
  instead of spread + `flatMap` (same membership + insertion order; kills
  intermediate arrays).
- **Phase probes** (measure-only): applyV5 dominates (~37ms/rep at E4 state);
  typefix ~10ms; metadata+prices compares ~6-8ms. noNorm probe showed normalize
  ≈ 14ms even WITH the fast path; noDec probe ≈ 6ms.
- **Scaling sweep (after E8, PASS)**: 15/10 ⇒ 9 vs 24 (2.6×); 30/30 ⇒ 33 vs 113
  (3.4×); 60/10 ⇒ 21.5 vs 77.5 (3.6×); 60/30 ⇒ 60 vs 214.5 (3.6×). Wins hold
  and improve with state size (original cost is dominated by per-entry BigNumber
  normalize, which the candidate eliminates).
- **Final**: 110 → 32 ms (−70.9%, 3.4×) at the profiled scale; parity + 231
  tests + type check green throughout; every keep ≥ 11× confidence.

## Resume Instructions

- Read `.auto/log.jsonl` first; then `git status` — the working tree should be clean
  (kept experiments are committed; discards auto-reverted). `.auto/` files are never
  reverted by the tooling.
- Never edit the frozen sections; after any 04 edit re-run the assembler.
- If `orig_ms` drifts from ~110 by more than ~10 ms, re-baseline before trusting
  deltas (measure 3 fresh baselines).
- Stop conditions: 25 experiments max, 3 hours max, or no remaining ideas that beat
  noise. On a verified win: prepare the draft PR (DO-NOT-MERGE + area-performance +
  assets-performance-agent labels, title `[perf-agent:assets-controller/AssetsController.ts]`,
  body cites profile run 39731720623 + this bench) — do NOT push it, do NOT open issues.
  On no win: stop, leave the branch clean, no PR.
