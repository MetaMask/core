# Autoresearch: getAssetIdsForMetadataFetch hot path

## Objective

Speed up `getAssetIdsForMetadataFetch` in
`packages/assets-controller/src/utils/getAssetIdsForMetadataFetch.ts` on the
Hermes engine (MetaMask Mobile's JS engine, `hermes -O`). This function was
identified in scheduled mobile profile run 42969742279 (head e5fb650ebc24,
created 2026-11-11) with 118.0 ms self time plus 22.6 ms in its helper
`hasMetadataUsedByClients` in per-scenario sums. It computes the set of asset
IDs needing a metadata fetch (and the heal subset that skips spam filtering)
from controller state, request scope, and the current pipeline response.

Realistic workload (see `.auto/bench/inputs.js`): 4 accounts × ~170 assets in
state balances (60 popular assets shared by every account, checksummed
mixed-case CAIP-19 IDs), ~600 metadata entries in mixed completeness, hidden
preferences, 2 staking-contract IDs, a few malformed IDs, request scope of 2
accounts + 3 of 5 chains, and a response overlapping state. One call ≈ 1000
predicate evaluations.

## Metrics

- **Primary**: `primary_ms` (ms, lower is better) — median per-call time of the
  candidate implementation on the main input, median of 3 Hermes process runs,
  each an internal median of 3 timed samples.
- **Secondary**: `baseline_ms` (immutable original in the same process —
  machine-drift signal), `small_ms` / `small_baseline_ms`,
  `large_ms` / `large_baseline_ms` (scaling sweep with identical input
  structure; the win must hold across sizes), `occurrences` / `uniques`
  (workload shape diagnostics).

## How to Run

- `./.auto/measure.sh` — assembles `.auto/bench/bundle.js` from the LIVE
  production source on every invocation (in-process TypeScript transpile +
  verbatim vendored dependencies; esbuild deadlocks in this sandbox, so the
  builder uses no subprocesses), runs it under Hermes 3×, enforces
  `SELF_CHECK=OK` and a numeric `primary_ms` in every run, and prints median
  `METRIC` lines. The bundle contains both the immutable original
  (`.auto/bench/original/`, SHA-pinned) and the live candidate, and the driver
  refuses to report metrics unless their outputs match exactly on every input,
  including empty inputs, odd/invalid IDs, hidden/staking preferences, and
  metadata completeness edges.
- `./.auto/checks.sh` — runs the real package test file
  (`yarn workspace @metamask/assets-controller run test run
  src/utils/getAssetIdsForMetadataFetch.test.ts`). Do not weaken it.

## Files in Scope

- `packages/assets-controller/src/utils/getAssetIdsForMetadataFetch.ts` — the
  ONLY production file that may change.
- Everything under `.auto/` (bench harness only).

## Off Limits

- Any other production file, including
  `packages/assets-controller/src/data-sources/evm-rpc-services/utils/staking-contracts.ts`,
  `packages/utils`, and `packages/controller-utils` (dependencies; bundled
  read-only from the monorepo's own source).
- `packages/assets-controller/src/utils/getAssetIdsForMetadataFetch.test.ts` —
  do not edit tests to force a pass.
- Exported behaviour: the two returned Sets must be value-identical to the
  original on every input shape. Dependency semantics (parseCaipAssetType,
  isStakingContractAssetId) must be called, not re-implemented.

## Constraints

- `.auto/checks.sh` must pass before a keep.
- No new runtime dependencies; no Node-only APIs (this runs on Hermes).
- One production file only. Revert anything else.
- Keep only a change that beats the session best by more than noise
  (confidence ≥ 2× after ≥ 3 runs), passes checks, and stays flat per call
  across the small/large scaling sweep.
- Stop after 25 experiments or 3 hours.

## Optimization leads (from reading the current implementation)

Per state-balance asset occurrence the current code does: 2×
`assetId.toLowerCase()`, a `parseCaipAssetType` regex exec (+ object
allocations, try/catch on invalid IDs) for the chain filter, and — only after
that — the cheap hidden-set lookup and metadata completeness checks; assets
that survive get `isCaipAssetType` regex test + a second
`parseCaipAssetType` exec + `isCaipChainId` test inside
`isStakingContractAssetId`. The same asset ID is re-evaluated for every
account that holds it and again in the response loop. Candidate directions:

1. Per-call memoization keyed by asset ID (needsMetadata verdict, lowercased
   ID, chain-membership verdict) so duplicated assets across accounts and
   between state and response loops are evaluated once.
2. Cheap-first predicate ordering: hidden-set and metadata lookups before any
   regex/parse work (pure predicates, order swap is semantics-preserving).
3. Allocation trims: `Object.keys` instead of `Object.entries` in the state
   loop, hoisted `response.assetsInfo` lookup, lazy `knownMetadataIds` build.
4. `hasMetadataUsedByClients` is called twice per occurrence (response then
   state metadata); with memoization its call count collapses to once per
   unique asset. Its internal check order is already cheap-first.

Do NOT re-implement parseCaipAssetType/isStakingContractAssetId inline —
parity and production semantics must come from the real dependencies.

## What's Been Tried

(run 0) Baseline: untouched source. See `.auto/log.jsonl`.

## Provenance of log entries (added 09:58 UTC, second worker)

- **Runs 1–8 were manually authored** by the first worker via
  `.auto/log-entry.mjs` from real `./.auto/measure.sh` outputs — the
  pi-autoresearch extension tools were NOT invoked for them. Their metric
  values are genuine bench outputs, but their `confidence` fields (including
  the 39.24 figure on run 8) are hand calculations, not extension-derived.
- **Runs 9–25 are recorded by the actual pi-autoresearch extension**
  (`run_experiment` / `log_experiment`), mostly as clean repeat controls of
  the committed candidate for a genuine, extension-computed noise floor and
  confidence figure that supersedes the manual one. No manual log generation
  from run 9 onward; `.auto/log-entry.mjs` is retained only as provenance
  for runs 1–8.
- The original baseline (`.auto/bench/original/`, SHA-pinned) is immutable
  and `baseline_ms` continues to be measured in-process every run.
- `packages/assets-controller/CHANGELOG.md` was restored to `origin/main`
  (single production file policy for this research branch).

## Parent diagnostic (09:34)
The DIRECT native esbuild binary hangs on a trivial standalone `print(42)` bundle too (Python subprocess 10sec timeout), although --version works. This is NOT your import graph. Stop bisecting imports. Try alternative TypeScript transpileModule + manual dependency concatenation, or mark blocked/no win. Do not spend whole session on esbuild. Need commit specialized harness BEFORE measuring, then bounded loop or honest blocked outcome, push branch even no win.

## Parent review checkpoint
Production prefix guard looks sound. IMPORTANT log.jsonl currently manually authored (log-entry.mjs), confidence null initially; user explicitly requires /autoresearch with init_experiment/run_experiment/log_experiment. Please actually invoke these installed extension tools if available before finalizing; do not present manually computed logs as extension results. If extension tools unavailable, document the deviation and calculate reproducible confidence from repeated control data (>=2x), not varied candidate experiments. Need run full 25 experiments or 3h bound, checks, scaling and push.
