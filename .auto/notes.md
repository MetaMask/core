# Session Notes — normalizeAmountString fast path (2026-11-25)

## Final state

- Production: `packages/assets-controller/src/utils/normalizeAmountString.ts`
  — string fast paths (canonical verbatim return, scanner, exponent
  expansion) inside an IIFE closure, guarded against non-default global
  BigNumber `RANGE` config.
- Result: 662ms → ~95-105ms (median ~97) = **~85% faster**; 0.67-0.70 µs/call
  (from ~4.6 µs/call). 8000 rounds × 18 hot inputs × 3 runs, Hermes.
- All 580 package unit tests pass; parity suite (explicit + ~600 fuzz +
  newline/negative-zero/huge-length/nondefault-RANGE config blocks)
  byte-matches the frozen reference on every run.

## Correctness guard (exp11-12) — why the metric went 89 → 97

The pre-guard best (89ms, exp7) returned WRONG values if any code in the
same JS realm calls `BigNumber.config({ RANGE: ... })` with a small range:
values beyond RANGE parse as ±Infinity or zero and the reference returns
`'0'`, while the fast path returned the literal digits. Verified:
`PARITY_FAIL ... config={"RANGE":5} input="1234567890" expected="0"
actual="1234567890"`.

Guard design (measured, cheapest correct one):

- `rangeBound` snapshotted at module load from `BigNumber.config().RANGE`
  (always a 2-array [lo, hi]; bound = min(|lo|,|hi|)).
- Refreshed every 64th call (closure counter) and on EVERY BigNumber
  fallback call — global RANGE changes detected within ≤ 64 calls.
- Magnitude gates: plain/canonical → `amount.length > rangeBound` defer
  (magnitude ≤ digit count); exponent → `max(intLen,fracLen) + 999 > bound`
  defer. Deferring is always behavior-correct (BigNumber defines truth).
- `BigNumber.config()` costs ~0.26µs per call — per-call refresh would cost
  ~40% of the fast path; per-64 sampling ≈ 1ms/144k calls.

Variants measured: module-`let` state 104ms, object property 96ms, closure
95ms, sentinel-encoded counter (negative = nondefault, constant-compare
gates) 97-98ms. All within contention noise (shared box load avg ~26);
closure chosen for cleanliness. The 89→97 delta ≈ guard cost (~5ms) — the
89 baseline was invalid under the completed parity suite.

## Scaling sweep (exp12 build)

- Rounds: 0.667 / 0.667 / 0.688 µs/call at 2k/8k/32k — flat.
- Input length 1→512 chars: per-char 417→21 ns — sublinear, no quadratic.
  (512-char non-canonical scanner path ~30µs/call — acceptable, rare.)
- Corpus cardinality 1→64: no per-call growth (small-size blocks are
  confounded by ~7ms fixed timing overhead per block).

## Dead ends (do not retry)

- Per-call `BigNumber.config()` read — too expensive (0.26µs × every call).
- Monkey-patching `BigNumber.config` to intercept RANGE changes — rejected
  as too invasive for a shared library dependency.
- Sentinel-encoded counter with constant-compare gates — no measurable win,
  more complex.
- `Math.max()` builtin calls in hot gates — replaced with inline ternaries
  (measurably slower as builtin calls in Hermes).
- Module-level `let` for hot state — slower than closure slots in Hermes.

## Parity quirks pinned by the harness (driver.js PARITY/CONFIG_PARITY)

- Terminal-newline inputs (`'1.5\n'`) MUST take the BigNumber fallback:
  JS `$` without `m` flag doesn't match before `\n`, but BigNumber trims
  `\n`/`\r`/`\t`/space — fast-pathing them would return `'0'` where the
  reference returns `'1.5'`.
- bignumber.js 9.1.2 has NO `ERRORS` config (silently ignored; errors
  always throw).
- Nondefault RANGE blocks: RANGE 5, [-3,50], 1e9 — the candidate must defer
  to BigNumber (which sees the same shared config instance).
- `PARITY_SKIP_CONFIG=1 node .auto/bench/build.mjs` skips config blocks —
  timing isolation only, never for keep decisions.

## Remaining budget

13/25 runs used. Machine contention (load ~26) makes <5ms deltas
unmeasurable; micro-tuning is exhausted. Ideas left are sub-noise.
