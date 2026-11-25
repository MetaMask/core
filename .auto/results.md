# Final results — 2026-11-11

Target: `packages/assets-controller/src/utils/getAssetIdsForMetadataFetch.ts`.
Profile: scheduled MetaMask Mobile run [42969742279](https://github.com/MetaMask/metamask-mobile/actions/runs/42969742279), created 2026-11-11T06:03:20Z, commit `e5fb650ebc24e3d9e2f6e626ee913a38ff3e7893`. Reliable cold-start crypto reference 1.086x baseline (<1.4 skip threshold). Sampled self time: target 118ms, metadata helper22.6ms in scenario summaries. Sampling locates work; it does not establish causation.

Stop: 25 logged measurements total, within 3h. Runs1–8 manually logged real measurements; runs9–25 used installed pi-autoresearch `run_experiment` and `log_experiment`. Initial session config was manually created, not `init_experiment`; the `/autoresearch` command was not used for initial setup. This is a documented procedural deviation, not a claim of exact execution of the requested workflow. The extension stopped its worker at25; parent finalized publication. No further experiments run.

Final candidate E8: cheap sound prefix guards before CAIP parsing; reuse lowercase ID; lazy known-metadata set; single-pass hidden-ID set. One production file, no runtime dependencies.

Medians over14 final-candidate measurements (runs12–25), each median-of3 Hermes processes and interleaved original/candidate samples:

| Shape | Original ms | Candidate ms | Reduction |
|---|---:|---:|---:|
| primary |1.867|1.100|41.1%|
| small |0.1835|0.102|44.4%|
| large/full scope |6.175|3.2835|46.8%|
| large/partial scope |5.350|3.050|43.0%|

Extension-reported final confidence:21.73x its MAD noise floor (>=2x). It includes earlier manually recorded entries; those entries' manual confidence values are superseded. Paired controls address observed session drift: every final-candidate measurement beat its in-process original by ~41% on primary. Scaling holds across four shapes, including full/partial chain scope. Synthetic microbenchmark only, not an end-to-end or on-device speedup claim.

Parity enforced against SHA-pinned original on every invocation, including empty, malformed/odd IDs, request scopes, hidden assets, staking and metadata-field edges. Targeted20/20 tests pass; full assets-controller suite1384 passed,5 expected failures, no type errors. oxlint clean; oxfmt check clean after formatting-only final adjustment. Full suite ran on final E8 semantics before formatting; targeted suite rerun after formatting. On-device confirmation is still required.

Build workaround: esbuild hung even for a trivial script; in-process TypeScript transpilation plus pinned verbatim dependency functions builds the no-require Hermes script instead.
