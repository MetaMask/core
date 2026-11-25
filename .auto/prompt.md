# normalizeAmountString: readable BigNumber formatting shortcut

## Current objective

Keep BigNumber responsible for parsing, numeric semantics, live global configuration and truncation. Avoid padding zeros only to strip them immediately: when metadata is unknown or the number already fits the requested precision, return `bn.toFixed()` directly. Otherwise preserve the original truncation and trim. The upper precision guard preserves BigNumber's rejection of values above 1e9; truncation of negative nonzero values must still produce `-0` where the original does.

Human maintainability is a hard gate. Do not restore the earlier custom parser, exponent logic or config caches. A narrower readable win is preferred over peak benchmark speed. Stop when readable options are exhausted; experiment/time budgets are ceilings, not quotas.

## Context and scope

Assets-owned production file: packages/assets-controller/src/utils/normalizeAmountString.ts. Target regression tests may be added without weakening existing tests. No new runtime dependencies or other production changes. Profile run 45557828237, mobile commit 79768f68a7a75956abaa1accac04094767f33215: ~36.7 ms self time summed across available scenario summaries, not an end-to-end latency estimate.

Use isolated worktrees only. Never edit/switch/commit/reset/stash the live core/ or metamask-mobile/ checkout. The mobile Hermes executable may be executed.

## Run

- `./.auto/checks.sh`: full assets-controller package suite.
- `./.auto/measure.sh`: 3 Hermes invocations, 144,000 calls each.
- `BENCH_MODE=compare ./.auto/measure.sh`: frozen original vs current production source, same-process ABBA, median of 3 invocations.
- `BENCH_MODE=workloads ./.auto/measure.sh`: already-precise, truncation-required and metadata-unknown distributions separately; exposes regressions hidden by mixed corpus.
- `BENCH_MODE=sweep ./.auto/measure.sh`: count/input-length/cardinality scaling.

Every invocation compares current production source with the immutable original reference, including configuration-change and DEBUG cases. Do not change the reference or bypass checks.

## Evidence and limitations

See results.json and notes.md for CURRENT findings. log.jsonl preserves historical experiments, including subsequently invalidated/rejected candidates. Historical keep labels are not recommendations. Earlier parser results are superseded, not representative of the current implementation. The workload is synthetic, not trace-replayed: input frequencies and app impact remain unverified. Require device confirmation before merge.
