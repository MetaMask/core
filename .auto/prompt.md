Autoresearch: assets-controller/MulticallClient

## Objective

Speed up the Multicall3 balance-batching hot path in
`packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.ts` —
the ONLY production file that may change.

From the MetaMask Mobile Hermes profile (scheduled perf run 39731720623,
commit 9b830f28), this path is the dominant assets-owned cost in the
regressed Asset View scenario (20.4s vs 11.0s baseline, 1.86×, tracked in
core issue #37813) and 8 other scenarios (4.2–7.1s each):

    batchBalanceOf
      -> reduceInBatchesSerially (eachBatch, 300 calls/batch)
      -> buildAggregate3BalanceCalls   (per-account callData cache, warm)
      -> encodeAggregate3              (ethers Interface.encodeFunctionData via
                                        controller-utils encodeFunctionData,
                                        FastAbiCoder)          ~5.6s incl on device
      -> decodeAggregate3Response      (ethers Interface.decodeFunctionResult)
                                        ~5.2s incl on device
      -> decodeUint256                 (ethers balanceOf decode) ~1.3s incl

The bench replays this EXACT path (real production code, fake FIFO RPC
provider that returns pre-built aggregate3 responses) under the MetaMask
Mobile hermes-engine CLI (LLVM 8.0.0svn) with `-O`, median of 3 process runs.

## Metrics

- **Primary**: `primary_ms` — wall time for 8 batches × 300 balance calls
  (2400 calls: ~15% native getEthBalance + 85% ERC-20 balanceOf), warm
  callData cache, median of 7 in-process rounds (lower is better).
- **Secondary**: `per_call_us` — µs per balance call (derived).
- `DETAIL round_ms=` lines show per-round spread for noise inspection.

Scaling sweep variants: `node .auto/bench/build.mjs --scale N` rebuilds the
timing workload at N calls (parity corpus is scale-independent). A keep must
hold flat per-call across e.g. 600 / 2400 / 4800.

## How to Run

- `./.auto/measure.sh` — rebuilds `.auto/bench/bundle.js` from the CURRENT
  source via `.auto/bench/build.mjs` (esbuild bundle → TypeScript ES5
  lowering, because this hermes-engine CLI rejects `class`/`async` syntax but
  runs ES5 fine), runs it 3× under Hermes, requires `SELF_CHECK=OK` in every
  run, and prints `METRIC primary_ms=...` (median). Bundle is generated,
  gitignored, and always reflects the working tree.
- `./.auto/checks.sh` — runs the production vitest suite for MulticallClient
  (38 tests, ~2s) from `.auto/harness.json`'s `checks_command`.

## Parity / Self-check (do not weaken)

`.auto/bench/parity.js` is a LOCKED corpus generated ONCE by
`.auto/bench/gen_entry.ts` against the ORIGINAL implementation (run before
any edit; never regenerate). Every measurement replays 14 batches through
the real `batchBalanceOf` and requires:

1. byte-identical provider call sequence (calldata hex + attempt count),
2. field-identical results (tokenAddress/accountAddress/success/balance,
   including `balance` presence and retry/fallback semantics for
   mismatched-count, malformed-hex, empty/short/oversized return data,
   odd-length singles, and fallbackToSingleCalls batches).

Any observable difference → `SELF_CHECK=FAIL`, measurement aborts.

## Files in Scope

- `packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.ts`
  — the only production file that may change.
- Everything under `.auto/` (bench/harness tuning is allowed; parity corpus
  is NOT).

## Off Limits

- Any other production file (including `packages/controller-utils/src/abi.ts`
  — even though `encodeAggregate3` delegates to its `encodeFunctionData`).
- Tests, except adding coverage. Do not edit tests to force a pass.
- Exported behaviour: `encodeAggregate3`/`decodeAggregate3Response` byte
  output, `batchBalanceOf` results, calldata, retry/fallback semantics.
- The locked parity corpus and its generator semantics.

## Constraints

- `.auto/checks.sh` must pass before a keep.
- No new runtime dependencies on the hot path (imports must stay within the
  existing dependency set: ethers `@ethersproject/abi`, `@metamask/utils`,
  `@metamask/controller-utils`).

## Ideas worth trying (profile-informed, ranked)

1. **encodeAggregate3/decodeAggregate3Response**: both go through ethers
   `Interface` machinery (parse, coders, logger). A direct, shape-specialised
   ABI encoder/decoder for the two fixed shapes (aggregate3 `(address,bool,bytes)[]`
   and its `(bool,bytes)[]` output) can skip interface parsing and dynamic
   dispatch. Byte-identical output is enforced by parity + the existing test
   "identical calldata to regular Ethers implementation".
2. **decodeUint256**: guarded `balanceOf` decode — a direct uint256
   big-int-to-decimal-string read of the 32-byte word (BigInt or repeated
   division) avoids ethers Reader machinery per call.
3. **buildAggregate3BalanceCalls**: map + cache lookups per call —
   micro-optimise the hot loop (avoid repeated lowercasing, preallocate).
4. **eachBatch result mapping**: reduce per-element object churn.
Do NOT change batching/retry/fallback semantics.
