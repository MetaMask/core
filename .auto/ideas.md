# Ideas — Optimize MulticallClient aggregate3 encode/decode on Hermes

Primary metric: `encdec_full_ms` (encode 300-call batch + decode response +
decodeUint256 per result), Hermes `-O`, median of 3 invocations.

Engine for the numbers below: Hermes `hermes-v250829098.0.17`
(commit `3477757eb247`, HBC bytecode 98), the Hermes V1 build React Native
0.86.3 ships. macOS arm64 Release CLI, JIT off, debugger off. Parity
self-check passed on every run. Runs 1–10 in `.auto/log.jsonl` were an earlier
Static Hermes `static_h` checkout (bytecode 99); those ratios were within a
few percent of these.

## Done (this session)

| #   | Idea                                                                                                                                      | Verdict         | Result                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| 1   | Hand-rolled `encodeAggregate3`: fixed-layout string assembly, hardcoded selector (asserted vs interface at load), zero Ethers on hot path | KEEP (run 2)    | encode 25.4 → 0.675 ms (38×)                                                     |
| 2   | Hand-rolled `decodeAggregate3Response`: direct substring parsing following all offset words, no Result/BigNumber allocation               | KEEP (run 3)    | decode 18.1 → 0.30 ms (60×)                                                      |
| 3   | `decodeUint256` via native `BigInt(data.slice(0,66)).toString()`                                                                          | KEEP (run 7)    | uint256 5.5 → 0.2 ms (27×)                                                       |
| 4   | Rope-style `+=` encoder assembly vs array push+join                                                                                       | DISCARD (run 8) | tie on the earlier engine (1.125 vs 1.125); not remeasured                       |
| —   | Metric fix                                                                                                                                | run 5           | primary metric now encdec_full_ms (was encode+decode only, missed uint256 stage) |

Session: baseline `encdec_full_ms` = 49.0 → 1.175 (**42×**) on the React Native
0.86.3 engine. Loop converged after run 8 — micro-optimizations no longer
clear the 2% keep threshold.

## Key learnings

- The tuple `(address, bool, bytes)` is DYNAMIC (contains bytes), so the array
  head needs one offset word PER CALL — cumulative over padded callData sizes.
  Missing this was the only layout bug hit (caught by the bench parity
  self-check vs stock Ethers, not by eyeballing).
- Ethers v5 `AbiCoder` cost on Hermes is dominated by: Writer numeric
  conversions + hexlify per value (encode), Reader `Result` object
  construction + per-word hexlify/arrayify + BN wrapping (decode).
- `@metamask/utils` v12 `concatBytes` silently converts hex strings via
  `valueToBytes` — relevant when vendoring `encodeFunctionData`.
- TS7 (tsgo) removed `moduleResolution: node10` + `baseUrl`; paths patterns
  must be relative; nearest `package.json` `"type"` decides ESM/CJS
  (repo root is `"type": "module"` — needed a `"type": "commonjs"` marker in
  the tmp bench tree).
- Metric definition matters: the first discard (run 4) was an artifact of the
  primary metric not covering the uint256 stage; BigInt uint256 is 27× faster
  in reality.

## Backlog (untested — diminishing returns at ~1.1 ms total)

- Encode: replace `parts.push` ×5 with pre-sized array index writes, or
  `+=` string concat; measure (expected small).
- Decode: `parseInt` on sliced 64-char words → could scan last char for
  success word; small.
- Hex LUT for byte→hex (16-entry table) instead of padStart/toString(16)
  for length words; small.
- Hand-roll `encodeBalanceOf`/`encodeGetEthBalance` (per-account cache path,
  not per-batch hot path in production — same account per batch): LOW value.
- Typed-array (Uint8Array) assembly instead of hex strings: would avoid
  2× char duplication but breaks the "hex passthrough" of callData and
  needs bytesToHex at the end — expected NET LOSS on Hermes.
- Batch-level `buildAggregate3BalanceCalls`: skip per-call object allocation
  via two parallel arrays — touches call sites; measurable? probably not vs
  0.65 ms encode.

## Verdicts

### viem instead of Ethers / hand-rolled codec (run 9 — measured, not adopted)

Remeasured on Hermes V1 `hermes-v250829098.0.17` (`-O`, 300-call batch, median of 3, parity vs stock
ethers, SELF_CHECK=OK): a viem-based MulticallClient codec
(`encodeFunctionData`/`decodeFunctionResult`/module-level `parseAbi`,
pruned ABI closure = what a tree-shaken mobile bundle keeps, ~127 KB JS,
45 files):

- viem full pipeline: **13.344 ms** (encode 3.211 / decode 8.333 / uint256 1.8)
- stock Ethers baseline: 49.043 ms → viem is **~3.7x faster than Ethers**
- hand-rolled codec (current PR): **1.175 ms** → viem is **~11x SLOWER**

Verdict: viem is a legitimate Ethers replacement if maintainers reject
hand-rolled encoders (already in the monorepo via perps-controller, faithful
ABI semantics incl. address checksum validation), but it is NOT competitive
with the hand-rolled codec on the hot path. Keep the hand-rolled codec in
the PR; keep viem as a fallback option. Notes: needs a `node:crypto` stub
(noble hashes' old-Node adapter; the keccak/sha3 path itself is pure JS),
and it would be a NEW runtime dependency for assets-controller consumers.

See `.auto/log.jsonl` (dashboard-compatible). Keep = committed, discard =
reverted, all decided by `.auto/run-exp.sh` against the working tree.

## Run 10 — over-fit check (scaling sweep)

- **Conclusion: NOT over-fit.** Correctness is generic (bounds-checked offset-following decoder, byte-parity vs Ethers for arbitrary inputs, error paths preserved). Performance is linear and flat per call across n=30→3000 (~3.3–4.0 µs/call) and nearly independent of returnData size (0.325 ms at 500 B/call vs 0.300 ms at 32 B/call). viem scales linearly in both n and bytes (n=3000 → 129 ms; 500 B → 22 ms decode).
- One honest caveat: bench addresses were all-lowercase, so Ethers/viem baselines skipped EIP-55 checksum keccak validation; with mixed-case (real-world) addresses the library baselines get *slower*, i.e. the reported 42× is a conservative lower bound.
- On-device A/B in the real mobile app closes the loop (see PR body harness instructions).
