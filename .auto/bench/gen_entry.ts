// ONE-TIME generator for .auto/bench/parity.js — the LOCKED parity corpus.
//
// Run under Node (via gen-bundle.js) against the ORIGINAL production
// implementation, before any experiment edits MulticallClient.ts:
//
//   node .auto/bench/build.mjs --gen-only
//   node .auto/bench/gen-bundle.js        (from the repo root)
//
// It replays every batch through the REAL `batchBalanceOf` path with a
// recording fake provider and stores the exact observed calldata sequence
// and results. These expectations are the bench self-check: any experiment
// that changes observable behaviour fails SELF_CHECK.
import { writeFileSync } from 'node:fs';
import { MulticallClient } from '../../packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.js';
import {
  DEFAULT_TIMING_SCALE,
  TIMING_SEED,
  ZERO_ADDRESS,
  buildAggregate3Response,
  createRng,
  generateRequests,
  generateResponseShapes,
  generateTimingBatches,
  type ResponseShape,
} from './bench-inputs.js';

const WORD_ZERO = '0'.repeat(64);

type SimpleRequest = { tokenAddress: string; accountAddress: string };

type ParityBatch = {
  label: string;
  options: { fallbackToSingleCalls: boolean };
  requests: SimpleRequest[];
  /** FIFO response strings for the fake provider (includes retries). */
  responses: string[];
  expectedCallData: string[];
  expectedResults: unknown[];
};

function hexBody40(rng: () => number): string {
  const HEX = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 40; i++) {
    out += HEX[(rng() * 16) | 0];
  }
  return out;
}

/** ERC-20-only requests over a stable pool (seed 97001). */
function erc20Requests(count: number): SimpleRequest[] {
  const rng = createRng(97001);
  const tokens: string[] = [];
  for (let i = 0; i < 80; i++) {
    tokens.push('0x' + hexBody40(rng));
  }
  const accounts: string[] = [];
  for (let i = 0; i < 30; i++) {
    accounts.push('0x' + hexBody40(rng));
  }
  return Array.from({ length: count }, () => ({
    tokenAddress: tokens[(rng() * 80) | 0],
    accountAddress: accounts[(rng() * 30) | 0],
  }));
}

type Provider = {
  call(transaction: { to: string; data: string }): Promise<string>;
  getBalance(address: string): Promise<{ toString(): string }>;
};

function makeRecordingProvider(responses: string[], callData: string[]): Provider {
  const queue = [...responses];
  return {
    call: async (tx: { to: string; data: string }) => {
      callData.push(tx.data);
      return queue.shift() as string;
    },
    getBalance: async () => ({ toString: () => '1000000000000000000' }),
  };
}

async function replay(
  batch: Pick<ParityBatch, 'responses' | 'requests' | 'options'>,
): Promise<{ callData: string[]; results: unknown[] }> {
  const callData: string[] = [];
  const client = new MulticallClient({
    getProvider: () => makeRecordingProvider(batch.responses, callData),
    getMulticall3AddressForChain: () => undefined,
  });
  const results = await client.batchBalanceOf(
    '0x1',
    batch.requests,
    batch.options,
  );
  return { callData, results };
}

function shapesWith(
  count: number,
  make: (i: number) => ResponseShape,
): ResponseShape[] {
  return Array.from({ length: count }, (_, i) => make(i));
}

function withAttempts(hex: string, n = 3): string[] {
  return Array.from({ length: n }, () => hex);
}

const parityBatches: ParityBatch[] = [];
function addBatch(
  label: string,
  requests: SimpleRequest[],
  responses: string[],
  options?: { fallbackToSingleCalls: boolean },
): void {
  parityBatches.push({
    label,
    requests,
    responses,
    options: options ?? { fallbackToSingleCalls: false },
    expectedCallData: [],
    expectedResults: [],
  });
}

// -----------------------------------------------------------------------------
// Batch definitions — production hot-path shapes plus decode edges.
// -----------------------------------------------------------------------------
{
  // 1. Normal mixed ERC-20/native batch, 300 calls (production batch size).
  const requests = generateRequests(createRng(11), 30, 80, 300);
  const shapes = generateResponseShapes(createRng(12), 300);
  addBatch('mixed-normal-300', requests, [buildAggregate3Response(shapes)]);

  // 2. Native-only batch (getEthBalance callData path).
  const native = generateRequests(createRng(13), 20, 10, 64).map((req) => ({
    tokenAddress: ZERO_ADDRESS,
    accountAddress: req.accountAddress,
  }));
  addBatch(
    'native-only-64',
    native,
    [buildAggregate3Response(generateResponseShapes(createRng(14), 64))],
  );

  // 3. Small batch.
  addBatch(
    'small-7',
    generateRequests(createRng(15), 5, 12, 7),
    [buildAggregate3Response(generateResponseShapes(createRng(16), 7))],
  );

  // 4. Empty requests.
  addBatch('empty-0', [], []);

  // 5. Zero balances.
  addBatch(
    'zero-balances-20',
    erc20Requests(20),
    [
      buildAggregate3Response(
        shapesWith(20, () => ({ success: true, balanceBody: WORD_ZERO })),
      ),
    ],
  );

  // 6. Max uint256 balances.
  addBatch(
    'max-balances-20',
    erc20Requests(20),
    [
      buildAggregate3Response(
        shapesWith(20, () => ({ success: true, balanceBody: 'f'.repeat(64) })),
      ),
    ],
  );

  // 7. Successful calls with empty return data ('0x' → failed at map level).
  addBatch(
    'empty-returndata-40',
    erc20Requests(40),
    [
      buildAggregate3Response(
        shapesWith(40, () => ({ success: true, rawBody: '' })),
      ),
    ],
  );

  // 8. Short return data (1 byte → length ≤ 2 → failed at map level).
  addBatch(
    'short-returndata-40',
    erc20Requests(40),
    [
      buildAggregate3Response(
        shapesWith(40, () => ({ success: true, rawBody: 'ab' })),
      ),
    ],
  );

  // 9. Odd-length return data (65 hex chars ≥ 66 with 0x → decodeUint256 path).
  addBatch(
    'odd-returndata-8',
    erc20Requests(8),
    [
      buildAggregate3Response(
        shapesWith(8, () => ({
          success: true,
          rawBody: '1a'.repeat(32) + 'f',
        })),
      ),
    ],
  );

  // 10. Oversized return data (64 bytes).
  addBatch(
    'oversized-returndata-40',
    erc20Requests(40),
    [
      buildAggregate3Response(
        shapesWith(40, () => ({ success: true, rawBody: 'cd'.repeat(64) })),
      ),
    ],
  );

  // 11. Mismatched result count → throw → retries → failed responses.
  addBatch(
    'mismatched-count-40',
    erc20Requests(40),
    withAttempts(
      buildAggregate3Response(generateResponseShapes(createRng(17), 35)),
    ),
  );

  // 12. Malformed hex in response → outer decode throws.
  addBatch(
    'malformed-hex-40',
    erc20Requests(40),
    withAttempts(
      buildAggregate3Response(
        shapesWith(40, () => ({ success: true, rawBody: 'g'.repeat(64) })),
      ),
    ),
  );

  // 13. Fallback to single calls (mixed success/edge single responses).
  const rng = createRng(18);
  const fallbackRequests: SimpleRequest[] = [];
  for (let i = 0; i < 25; i++) {
    fallbackRequests.push({
      tokenAddress: i % 6 === 0 ? ZERO_ADDRESS : '0x' + hexBody40(rng),
      accountAddress: '0x' + hexBody40(rng),
    });
  }
  // aggregate3 attempt fails (mismatch) 3×, then per-request singles.
  // NOTE: native requests use provider.getBalance (no queue entry); only
  // ERC-20 requests consume single-call responses, in request order.
  const singles: string[] = [];
  fallbackRequests.forEach((req, i) => {
    if (req.tokenAddress === ZERO_ADDRESS) {
      return; // fake getBalance handles natives
    }
    if (i % 5 === 1) {
      singles.push('0x'); // guard → '0'
    } else if (i % 5 === 2) {
      singles.push('0x12'); // short → '0'
    } else if (i % 5 === 3) {
      singles.push('0x' + '0a'.repeat(31) + 'b'); // odd → throws → failed
    } else {
      singles.push('0x' + ('0' + (i % 16).toString(16)).repeat(32)); // valid
    }
  });
  addBatch(
    'fallback-singles-25',
    fallbackRequests,
    [
      ...withAttempts(
        buildAggregate3Response(generateResponseShapes(createRng(19), 20)),
      ),
      ...singles,
    ],
    { fallbackToSingleCalls: true },
  );

  // 14. Same failing aggregate3, fallbackToSingleCalls: false → failed only.
  addBatch(
    'mismatch-failed-25',
    fallbackRequests,
    withAttempts(
      buildAggregate3Response(generateResponseShapes(createRng(19), 20)),
    ),
  );
}

// -----------------------------------------------------------------------------
// Replay everything against the ORIGINAL implementation.
// -----------------------------------------------------------------------------
async function main(): Promise<void> {
for (const batch of parityBatches) {
  const { callData, results } = await replay(batch);
  const again = await replay(batch);
  if (
    JSON.stringify(callData) !== JSON.stringify(again.callData) ||
    JSON.stringify(results) !== JSON.stringify(again.results)
  ) {
    throw new Error(`batch ${batch.label} is not deterministic`);
  }
  batch.expectedCallData = callData;
  batch.expectedResults = results;
  console.log(
    `ok ${batch.label}: ${callData.length} call(s), ${results.length} result(s)`,
  );
}

// Validate the default timing batches decode cleanly through ORIGINAL code.
{
  const timingBatches = generateTimingBatches(TIMING_SEED, DEFAULT_TIMING_SCALE);
  const client = new MulticallClient({
    getProvider: () => {
      let idx = 0;
      return {
        call: async () => timingBatches[idx++ % timingBatches.length].responseHex,
        getBalance: async () => ({ toString: () => '1' }),
      };
    },
    getMulticall3AddressForChain: () => undefined,
  });
  for (const b of timingBatches) {
    const results = await client.batchBalanceOf('0x1', b.requests);
    if (results.length !== b.requests.length) {
      throw new Error('timing batch result count mismatch');
    }
  }
  console.log(
    `timing validated: ${timingBatches.length} batches, ${DEFAULT_TIMING_SCALE} calls`,
  );
}

const PARITY = {
  chainId: '0x1',
  note: 'Generated by .auto/bench/gen_entry.ts against the ORIGINAL MulticallClient. Do not regenerate after experiments begin — this is the locked self-check corpus.',
  generatedFrom:
    'packages/assets-controller/src/data-sources/evm-rpc-services/clients/MulticallClient.ts',
  batches: parityBatches.map(
    ({
      label,
      options,
      requests,
      responses,
      expectedCallData,
      expectedResults,
    }) => ({
      label,
      options,
      requests,
      responses,
      expectedCallData,
      expectedResults,
    }),
  ),
};

writeFileSync(
  '.auto/bench/parity.js',
  'export const PARITY = ' + JSON.stringify(PARITY) + ';\n',
  'utf8',
);
console.log(`wrote .auto/bench/parity.js (${parityBatches.length} batches)`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
