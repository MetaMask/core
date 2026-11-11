// Bench driver for getAssetIdsForMetadataFetch.
//
// This file is the DRIVER BODY. `.auto/bench/build.mjs` wraps it with a tiny
// module registry: `__req('bench:inputs').buildInputSet` is the input
// factory, `__req('app:original').getAssetIdsForMetadataFetch` is the
// immutable original implementation snapshot, and
// `__req('app:candidate').getAssetIdsForMetadataFetch` is transpiled from the
// LIVE production file on every build. The assembled bundle runs under the
// Hermes CLI with no `require` and no Node APIs.
//
// Contract:
//   - Runs the ORIGINAL and the CANDIDATE on every bench input (main, sweep
//     sizes, edge cases) and compares results exactly (sets compared as
//     sorted arrays). Any mismatch prints `SELF_CHECK=FAIL` plus a reason and
//     no metrics can be trusted.
//   - Prints `METRIC <name>=<number>` lines. `primary_ms` is the candidate's
//     median per-call time on the main input. `baseline_ms` is the original's
//     time on the same input in the same process, which doubles as a
//     machine-speed drift signal.
//   - Prints `SELF_CHECK=OK` only when parity holds for every input.

var buildInputSet = __req('bench:inputs').buildInputSet;
var originalImpl = __req('app:original').getAssetIdsForMetadataFetch;
var candidateImpl = __req('app:candidate').getAssetIdsForMetadataFetch;

const inputSet = buildInputSet();

const now =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now();

/** Stable serialization of a result for parity comparison. */
function serializeResult(result) {
  const needing = Array.from(result.assetIdsNeedingMetadata).sort();
  const heals = Array.from(result.balanceHealAssetIds).sort();
  return JSON.stringify({ needing, heals });
}

/** Run one implementation on one input. */
function runCase(impl, input) {
  return impl({
    state: input.state,
    request: input.request,
    response: input.response,
  });
}

// ---- Parity: every input, both implementations, exact comparison. ----
const parityFailures = [];
function checkParity(implA, implB, input, labelA, labelB) {
  let a;
  let b;
  try {
    a = runCase(implA, input);
  } catch (error) {
    parityFailures.push(`${input.name}: ${labelA} threw: ${error && error.message}`);
    return;
  }
  try {
    b = runCase(implB, input);
  } catch (error) {
    parityFailures.push(`${input.name}: ${labelB} threw: ${error && error.message}`);
    return;
  }
  const sa = serializeResult(a);
  const sb = serializeResult(b);
  if (sa !== sb) {
    parityFailures.push(`${input.name}: results differ\n  ${labelA}: ${sa.slice(0, 400)}\n  ${labelB}: ${sb.slice(0, 400)}`);
  }
}

const allInputs = [inputSet.main, ...inputSet.sweep, ...inputSet.edges];
for (const input of allInputs) {
  checkParity(originalImpl, candidateImpl, input, 'original', 'candidate');
}

if (parityFailures.length > 0) {
  print('SELF_CHECK=FAIL');
  print('reason: ' + parityFailures.length + ' parity failure(s)');
  for (const failure of parityFailures.slice(0, 5)) {
    print('  - ' + failure);
  }
} else {
  // ---- Timing: candidate and original on main + sweep sizes. ----
  // Warmup both implementations so JIT/GC state does not bias samples.
  for (let i = 0; i < 3; i++) {
    runCase(candidateImpl, inputSet.main);
    runCase(originalImpl, inputSet.main);
  }

  /**
   * Median per-call milliseconds over interleaved samples. Candidate and
   * original are timed in alternating order within each sample so neither
   * implementation is systematically colder than the other.
   *
   * @param implA - First implementation (candidate).
   * @param implB - Second implementation (original).
   * @param input - Timed input.
   * @returns Per-call milliseconds for both implementations (median of 3).
   */
  function measurePair(implA, implB, input) {
    runCase(implA, input);
    runCase(implB, input);
    const oneStart = now();
    runCase(implA, input);
    const oneCall = now() - oneStart;
    const iterations = Math.max(3, Math.min(500, Math.ceil(60 / Math.max(oneCall, 0.05))));
    const samplesA = [];
    const samplesB = [];
    for (let s = 0; s < 3; s++) {
      const pair = s % 2 === 0 ? [implA, implB] : [implB, implA];
      const sinks = s % 2 === 0 ? [samplesA, samplesB] : [samplesB, samplesA];
      for (let i = 0; i < 2; i++) {
        const start = now();
        for (let k = 0; k < iterations; k++) {
          runCase(pair[i], input);
        }
        sinks[i].push((now() - start) / iterations);
      }
    }
    samplesA.sort((x, y) => x - y);
    samplesB.sort((x, y) => x - y);
    return { a: samplesA[1], b: samplesB[1] };
  }

  const round = (value) => Math.round(value * 1000) / 1000;

  const mainPair = measurePair(candidateImpl, originalImpl, inputSet.main);
  const small = inputSet.sweep[0];
  const large = inputSet.sweep[1];
  const smallPair = measurePair(candidateImpl, originalImpl, small);
  const largePair = measurePair(candidateImpl, originalImpl, large);

  print(`METRIC primary_ms=${round(mainPair.a)}`);
  print(`METRIC baseline_ms=${round(mainPair.b)}`);
  print(`METRIC small_ms=${round(smallPair.a)}`);
  print(`METRIC small_baseline_ms=${round(smallPair.b)}`);
  print(`METRIC large_ms=${round(largePair.a)}`);
  print(`METRIC large_baseline_ms=${round(largePair.b)}`);
  print(`METRIC occurrences=${inputSet.stats.occurrences}`);
  print(`METRIC uniques=${inputSet.stats.uniques}`);
  print('SELF_CHECK=OK');
}
