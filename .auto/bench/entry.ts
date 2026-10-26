// Hermes bench for the assets-controller MulticallClient aggregate3 hot path
// (batchBalanceOf → buildAggregate3BalanceCalls → encodeAggregate3 →
//  decodeAggregate3Response → decodeUint256).
//
// Built by .auto/bench/build.mjs into a single IIFE (bundle.js) from the REAL
// production source, with the LOCKED parity corpus (parity.js) inlined.
//
// Output contract (parsed by measure.sh / median.mjs):
//   PARITY=OK
//   METRIC primary_ms=<median round ms>     ← the metric
//   METRIC per_call_us=<µs per balance call>
//   DETAIL round_ms=...                     ← noise inspection
//   SELF_CHECK=OK                           ← only when parity holds
import { MulticallClient } from '../../packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.js';
import { TIMING_SEED, generateTimingBatches } from './bench-inputs.js';
import { PARITY } from './parity.js';

declare const __BENCH_SCALE__: number; // injected via esbuild --define

const ROUNDS = 7;
const WARMUP_PASSES = 2;

var SINK = 0; // consume results so nothing observable is dropped

// Hermes' print builtin (the hermes-engine CLI has no console).
declare function print(s: string): void;

function median(sorted: number[]): number {
  return sorted[(sorted.length - 1) >> 1];
}

type SimpleResult = {
  tokenAddress?: string;
  accountAddress?: string;
  success?: boolean;
  balance?: string;
};

type SimpleRequest = { tokenAddress: string; accountAddress: string };

function makeProvider(responses: string[], callData: string[]) {
  const queue = [...responses];
  return {
    call: async (tx: { to: string; data: string }) => {
      callData.push(tx.data);
      return queue.shift() as string;
    },
    getBalance: async () => ({ toString: () => '1000000000000000000' }),
  };
}

function resultMatches(got: SimpleResult | undefined, want: SimpleResult): boolean {
  if (got === undefined || got === null) {
    return false;
  }
  const sameBalancePresence =
    (got.balance === undefined) === (want.balance === undefined);
  return (
    sameBalancePresence &&
    got.tokenAddress === want.tokenAddress &&
    got.accountAddress === want.accountAddress &&
    got.success === want.success &&
    (want.balance === undefined || got.balance === want.balance)
  );
}

async function runParity(): Promise<boolean> {
  let ok = true;
  for (const batch of PARITY.batches) {
    const callData: string[] = [];
    const client = new MulticallClient({
      getProvider: () => makeProvider(batch.responses, callData),
      getMulticall3AddressForChain: () => undefined,
    });
    const results = (await client.batchBalanceOf(
      PARITY.chainId,
      batch.requests as SimpleRequest[],
      batch.options,
    )) as SimpleResult[];

    // Calldata sequence must match exactly (count, order, bytes).
    const expectedCalls = batch.expectedCallData;
    if (callData.length !== expectedCalls.length) {
      print(
        `PARITY_MISMATCH ${batch.label}: calldata count ${callData.length} != ${expectedCalls.length}`,
      );
      ok = false;
      continue;
    }
    for (let i = 0; i < callData.length; i++) {
      if (callData[i] !== expectedCalls[i]) {
        print(`PARITY_MISMATCH ${batch.label}: calldata[${i}] differs`);
        ok = false;
        break;
      }
    }

    // Results must match field-wise, including presence of `balance`.
    const expectedResults = batch.expectedResults as SimpleResult[];
    if (results.length !== expectedResults.length) {
      print(
        `PARITY_MISMATCH ${batch.label}: result count ${results.length} != ${expectedResults.length}`,
      );
      ok = false;
      continue;
    }
    for (let i = 0; i < results.length; i++) {
      if (!resultMatches(results[i], expectedResults[i])) {
        print(
          `PARITY_MISMATCH ${batch.label}: result[${i}] got ${JSON.stringify(results[i])} want ${JSON.stringify(expectedResults[i])}`,
        );
        ok = false;
        break;
      }
    }
  }
  return ok;
}

async function main(): Promise<void> {
  if (!(await runParity())) {
    print('SELF_CHECK=FAIL parity');
    return;
  }
  print(`PARITY=OK (${PARITY.batches.length} batches)`);

  // ------------------------------------------------------------------ timing
  const timingBatches = generateTimingBatches(TIMING_SEED, __BENCH_SCALE__);
  let currentResponse = '0x';
  const client = new MulticallClient({
    getProvider: () => {
      const resp = currentResponse;
      return {
        call: async () => resp,
        getBalance: async () => ({ toString: () => '1' }),
      };
    },
    getMulticall3AddressForChain: () => undefined,
  });

  const runAllBatches = async () => {
    for (const b of timingBatches) {
      currentResponse = b.responseHex;
      const results = (await client.batchBalanceOf(
        PARITY.chainId,
        b.requests as SimpleRequest[],
      )) as SimpleResult[];
      if (results.length !== b.requests.length) {
        throw new Error('timing result count mismatch');
      }
      if (results[0]) {
        SINK += (results[0].balance ?? '0').length;
      }
    }
  };

  for (let w = 0; w < WARMUP_PASSES; w++) {
    await runAllBatches();
  }

  const roundMs: number[] = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = Date.now();
    await runAllBatches();
    roundMs.push(Date.now() - t0);
  }

  const sorted = [...roundMs].sort((a, b) => a - b);
  const primary = median(sorted);
  const perCallUs = (primary * 1000) / (__BENCH_SCALE__ || 1);
  print('METRIC primary_ms=' + primary.toFixed(3));
  print('METRIC per_call_us=' + perCallUs.toFixed(3));
  print('DETAIL round_ms=' + roundMs.join(','));
  print(
    'DETAIL scale=' + __BENCH_SCALE__ + ' rounds=' + ROUNDS + ' sink=' + SINK,
  );
  print('SELF_CHECK=OK');
}

(async () => {
  await main();
})().catch((e: unknown) => {
  let msg = 'unknown';
  if (e instanceof Error) {
    msg = e.message;
  } else if (typeof e === 'string') {
    msg = e;
  }
  print('SELF_CHECK=FAIL crash: ' + msg);
});
