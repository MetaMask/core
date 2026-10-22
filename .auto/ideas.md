# Ideas — Optimize MulticallClient aggregate3 encode/decode on Hermes

Primary metric: `encdec_full_ms` (encode 300-call batch + decode response +
decodeUint256 per result), Hermes `-O`, median of 3 invocations.

## Done (this session)

| #   | Idea                                                                                                                                      | Verdict         | Result                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| 1   | Hand-rolled `encodeAggregate3`: fixed-layout string assembly, hardcoded selector (asserted vs interface at load), zero Ethers on hot path | KEEP (run 2)    | encode 25.0 → 0.65 ms (38×)                                                      |
| 2   | Hand-rolled `decodeAggregate3Response`: direct substring parsing following all offset words, no Result/BigNumber allocation               | KEEP (run 3)    | decode 18.4 → 0.25 ms (74×)                                                      |
| 3   | `decodeUint256` via native `BigInt(data.slice(0,66)).toString()`                                                                          | KEEP (run 7)    | uint256 5.45 → 0.2 ms (27×)                                                      |
| 4   | Rope-style `+=` encoder assembly vs array push+join                                                                                       | DISCARD (run 8) | identical numbers (1.125 vs 1.125) — converged                                   |
| —   | Metric fix                                                                                                                                | run 5           | primary metric now encdec_full_ms (was encode+decode only, missed uint256 stage) |

Session: baseline `encdec_full_ms` = 49.7 → 1.125 (**44×**). Loop converged after
run 8 — micro-optimizations no longer clear the 2% keep threshold.

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

See `.auto/log.jsonl` (dashboard-compatible). Keep = committed, discard =
reverted, all decided by `.auto/run-exp.sh` against the working tree.
