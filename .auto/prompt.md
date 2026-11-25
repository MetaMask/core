# Autoresearch: normalizeAmountString fast path (assets-controller)

## Objective

`normalizeAmountString` (packages/assets-controller/src/utils/normalizeAmountString.ts)
is an assets-owned hot path in MetaMask Mobile (Hermes profile run 45557828237,
commit 79768f68a7a75956abaa1accac04094767f33215, ~36.7 ms self time summed
across per-scenario top functions). Every balance entering `assetsBalance`
state passes through it.

Current implementation constructs a `BigNumber` for every call. For plain
decimal strings (the overwhelmingly common case) and simple exponent forms,
the canonical plain-decimal result can be produced with pure string
manipulation. Goal: a conservative string fast path with a BigNumber fallback
for everything else, keeping byte-for-byte output parity.

## Metrics

- **Primary**: `primary_ms` (ms, lower is better) — total wall time for
  8000 rounds × 18 hot-path inputs (144 000 calls) in Hermes, median of 3 runs.
- **Secondary**: `per_call_us` — microseconds per call, same run.

## How to Run

- `./.auto/measure.sh` — rebuilds `.auto/bench/bundle.js` from the **current**
  production source (never an edited clone), runs the Hermes workload 3×,
  medians the metrics. Exits nonzero on any parity self-check failure.
- `BENCH_MODE=sweep ./.auto/measure.sh` — scaling sweep (1k/4k/16k rounds),
  per-call timings must stay flat for a keep.
- `./.auto/checks.sh` — runs the unweakened assets-controller package unit
  tests (`vitest run` in packages/assets-controller).
- `node .auto/loop.mjs` — CLI emulation of the pi-autoresearch tools
  (init/run/log) used to drive this session: `node .auto/loop.mjs run
  ./.auto/measure.sh`, then `node .auto/loop.mjs log <status> <metric>
  <desc> <metricsJSON> <asiJSON>` (keep commits; discard/crash/checks_failed
  revert production changes, preserving `.auto/`).
- `node .auto/bench/build.mjs` — just builds the bundle (env `BENCH_MODE`).

The bundle contains: vendored bignumber.js 9.1.2, the **frozen reference**
implementation (`.auto/bench/reference.impl.js`, the original code from
origin/main abcfadf696b — never edit/delete it), the **candidate** (live
production source, TS types stripped), and the driver. The driver self-checks
candidate vs reference on every invocation: an explicit parity suite (empty/
odd lengths, signs/negative zero, exponents, leading/trailing zeros,
whitespace, radix/hex, NaN/invalid, decimals undefined/negative/fractional/
nonfinite, 200-digit length limits) plus ~600 seeded fuzz cases. Any mismatch
prints `SELF_CHECK=FAIL` and fails the run.

## Files in Scope

- `packages/assets-controller/src/utils/normalizeAmountString.ts` — the ONE
  production file that may be modified.
- `.auto/**` — playground tooling (bench, logs, notes).

## Off Limits

- Everything else in the repo. No other production file. No test weakening.
- `yarn.lock`, package manifests — no new runtime dependencies.
- Live checkouts `~/Desktop/projects/core` and `~/Desktop/projects/metamask-mobile`
  (only the Hermes binary inside metamask-mobile may be executed).
- Node-only APIs in the hot path (the code must run in Hermes/React Native).

## Constraints

- Keep/discard rule: keep only a change that beats session best beyond noise
  (confidence ≥ 2× after ≥ 3 runs), passes `.auto/checks.sh`, and keeps
  per-call cost flat across the scaling sweep.
- Self-check parity is absolute: the candidate must byte-match the frozen
  reference on the full parity + fuzz suite, and pass the package unit tests
  (which include negative zero, exponent, truncation and invalid-input cases).
- Commit with `git -c commit.gpgsign=false commit` (no interactive signing).
- Max 25 experiments or 3 hours, whichever first. Don't stop after first win —
  keep exploring while budget remains. Discarded experiments get reverted
  (production file only; `.auto/` is preserved).

## Reference behavior notes (verified against frozen reference)

- Non-string or empty input → `'0'`.
- `NaN`/`Infinity`/anything BigNumber rejects → `'0'`.
- Whitespace-padded, hex/octal/binary, and other exotic forms go through
  BigNumber parsing — the fast path must fall back for them (behavior unknown
  a priori; parity suite pins it).
- Truncation uses round-toward-zero (`ROUND_DOWN`) at `Math.floor(decimals)`
  fractional digits; `decimals` undefined/nonfinite/negative → no truncation.
- Trailing zeros and a dangling dot are trimmed (`"1.500"` → `"1.5"`).
- Negative zero keeps its sign (`"-0.000"` → `"-0"`).
- Leading zeros are normalized (`"007"` → `"7"`).

## What's Been Tried

(Filled in as experiments accumulate.)
