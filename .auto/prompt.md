# Autoresearch: Optimize Multicall3 encodeAggregate3 / decodeAggregate3 on Hermes

## Objective

`encodeAggregate3` and `decodeAggregate3Response` in
`packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.ts`
are extremely slow on Hermes (MetaMask mobile / RN): on Android a single 300-call
batch takes ~4s to encode and ~4s to decode. Optimize them for Hermes while
keeping **byte-identical output** and all tests green.

The benchmark extracts the REAL source (ABI constants, interface singletons,
encode/decode utilities) from `MulticallClient.ts` on every build, compiles it
with the vendored Ethers closure into a single self-contained JS bundle, and
runs it under `hermes/build/bin/hermes` (the local Static-Hermes-style CLI
binary, no `require`, single file only).

## Metrics

- **Primary**: `encdec_ms` (ms, lower is better) — per-op cost of one
  `encodeAggregate3(calls)` + one `decodeAggregate3Response(resp, 300)` cycle on
  a realistic 300-call batch (app default `maxCallsPerBatch`). Adaptive timing
  loop (≥120ms per measurement), median of 5 in-process reps, median of 3
  Hermes process invocations.
- **Secondary**: `encode_ms`, `decode_ms`, `decode_uint256_ms` (300 items),
  `calldata_hex_len`, `resp_hex_len`.

## How to Run

`./.auto/measure.sh` — builds the bundle (prepare → tsc → bundle) and runs it
under Hermes; outputs `METRIC name=value` lines. Exit non-zero on crash or
parity self-check failure (`SELF_CHECK=FAIL`).

Experiment runner (mimics run_experiment + log_experiment + keep/discard):

```
.auto/run-exp.sh "<idea description>" [asi key=value ...]
```

- improved → runs `.auto/checks.sh` (jest MulticallClient tests) → commit `keep`
- not improved / crash / checks_failed → reverts `MulticallClient.ts`
- appends a dashboard-compatible entry to `.auto/log.jsonl`

Hermes binary: `/Users/prithpalsooriya/.kandev/quick-chat/c1b1839c-62b5-4776-9d7e-5eb1ae664862/hermes/build/bin/hermes`
(override with `HERMES_BIN`).

## Files in Scope

- `packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.ts`
  — the ONLY production file that may be modified (encode/decode utilities
  section; interface singletons; ABI constants).
- Everything under `.auto/` — benchmark harness, logs, ideas.

## Off Limits

- Any other production file in the monorepo. Do NOT add new package source
  files (keeps the discard path safe: `git checkout -- MulticallClient.ts`).
- The jest test file may NOT be modified to make tests pass.
- Do not change exported behavior: `encodeAggregate3` output must stay
  byte-identical to stock Ethers; `decodeAggregate3Response` /
  `decodeUint256` results identical (self-check + jest golden tests enforce).

## Constraints

- `.auto/checks.sh` must pass for keeps: jest suite for MulticallClient
  (includes the "identical calldata to regular Ethers" golden test).
- The in-bundle parity self-check must pass every run (encode vs stock
  `Interface#encodeFunctionData`, decode vs stock `decodeFunctionResult`,
  edge cases: empty calls, `'0x'` callData, odd/long returnData, count
  mismatch throws).
- No new runtime dependencies in `MulticallClient.ts` (stdlib/ethers only —
  prefer zero-dependency hand-rolled code for the hot paths).
- No Node-only APIs (this runs on Hermes).

## Harness notes

- `.auto/bench/prepare.mjs`: extracts from `MulticallClient.ts` between the
  markers — slice A: `const MULTICALL3_ABI = [` up to the `// ===` above
  `// CONSTANTS`; slice B: the `// ===` above
  `// ENCODING/DECODING UTILITIES (using @ethersproject/abi)` up to the `// ===`
  above `// MULTICall CLIENT`. **Keep those section headers intact** when
  editing the source, or fix prepare.mjs.
- Ethers closure is compiled from `node_modules/@ethersproject/*/src.ts` (the
  npm packages ship TS sources). `@metamask/controller-utils`
  `encodeFunctionData` (FastAbiCoder) is vendored verbatim at
  `.auto/bench/templates/controller-abi.ts` with inlined @metamask/utils byte
  helpers.
- Baseline path: `encodeAggregate3` → `encodeFunctionData` (FastAbiCoder +
  ethers `Writer`) and `decodeAggregate3Response` → ethers
  `Interface#decodeFunctionResult` (generic `Reader`, per-word `hexlify`,
  `arrayify`, object churn).

## What's Been Tried

(run 0) Baseline: untouched source. See `.auto/log.jsonl` for numbers.

## Ideas backlog

See `.auto/ideas.md`.
