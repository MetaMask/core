# Autoresearch: assets-controller aggregated-balance selector engine

## Objective

Speed up the aggregated-balance selector engine in
`packages/assets-controller/src/selectors/balance.ts`
(`getAggregatedBalanceForAccountIds` / `getAggregatedBalanceForAccount` /
`calculateBalanceForAllWallets` / `calculateBalanceChangeForAccountGroup` and
their shared helpers `aggregateBalances` / `mergeBalancesIntoMap` /
`toBigNumberOrZero` / `isChainEnabledByMap` / `getAssetInfo` / tree lookups).

Hot path from Hermes profile run 39731720623 (commit 9b830f28, 2026-10-22):
`mergeBalancesIntoMap` ~54.8ms self in the `Aggregated_Balance_Loading_Time`
scenario — the per-asset work loop (BigNumber.js parse of amount strings,
accumulate across accounts, chain filtering, price totals in a single pass).

Realistic input (bench): 20 accounts / 2 wallets / 3 groups, 57 assets per
account across eip155 (1/137/10/42161/custom), solana, bip122; 14 state ticks
(prices change, balances move/zero, an asset appears; `enabledNetworkMap`
alternates between a mixed-key map — hex storage keys, CAIP-2 keys, reference
keys, disabled namespaces, `eip155:custom` toHex-throw fallback — and
`undefined` = all enabled). Per tick the four selector entry points run
(~2,300 asset rows per sequence). Amount mix: 64% 23-digit integer base
units, ~12% fractional, ~8% zero shapes, ~8% odd (`''`, `00.5`, `1e-18`,
negative, 44-digit, `NaN`), plus a non-string amount.

Engine: Hermes CLI (`-O`, MetaMask Mobile hermes-engine 0.14.1 / HBC 96),
median of 3 process runs, each internally the median of 3 timed reps.
`HERMES_BIN=/tmp/hermes-bin/hermes ./.auto/measure.sh`.

## Metrics

- **Primary**: `primary_ms` (ms, lower is better) — full timed sequence.
- **Secondary** (DET lines): per-entry-point timings (`forAccount`,
  `forAccountIds`, `allWallets`, `changeGroup`), `orig_ms`, reps spread.

## How to Run

`HERMES_BIN=/tmp/hermes-bin/hermes ./.auto/measure.sh` runs
`.auto/bench/workload.js` under Hermes and prints `METRIC` lines. Exit
non-zero on crash or `SELF_CHECK=FAIL`. `.auto/checks.sh` runs the
production vitest suite for `balance.ts`.

## Files in Scope

- `packages/assets-controller/src/selectors/balance.ts` — the only
  production file that may change.
- Everything under `.auto/`.

## Off Limits

- Any other production file.
- Tests, except adding coverage. Do not edit tests to force a pass.
- Exported behaviour. The workload self-check must stay value-identical to
  the ORIGINAL section on every tick of the timed sequence **and** the whole
  edge battery (empty and odd lengths, odd amounts, chain filtering, price
  edges, account-tree resolution).

## Constraints

- `.auto/checks.sh` must pass before a keep.
- No new runtime dependencies on the hot path (BigNumber.js stays the
  accumulator; new parses must be pure JS in-file).
- No Node-only APIs. This runs on Hermes (supports `?.`, `??`, named capture
  groups, destructuring, Map/Spread/arrow functions).
- Stop after 25 experiments or 3 hours.

## What's Been Tried

(run 0) Baseline: untouched source, CANDIDATE identical to ORIGINAL.
See `.auto/log.jsonl`.

Candidate directions (from reading `mergeBalancesIntoMap`):

1. Integer fast path: most amounts are plain digit strings; `Number()`/`BigInt`
   guard before `new BigNumberJS(str)` may skip the BigNumber parse for
   accumulation when values fit in a Number (sum of ~20 accounts) — but sums
   must stay BigNumber-exact: consider fast-path only the *entry* parse, or
   only single-account rows.
2. Chain-enablement cache per chainId within one aggregation (isChainEnabledByMap
   re-derives namespace/reference/toHex per asset; getAssetInfo already caches,
   but the enabled-map lookup still loops hex/CAIP-2/reference logic per asset).
3. Avoid re-wrapping `new BigNumberJS(0)` per zero/NaN row; reuse a zero constant.
4. Cheaper `amount.toFixed()` for integer-only accumulations.
5. Pre-size the merged map / avoid Map.get-then-set double lookups.

## Ideas

Append ideas here instead of chasing them immediately. Delete a line once it
has been tried.
