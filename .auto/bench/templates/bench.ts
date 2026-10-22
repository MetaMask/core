// Hermes benchmark runner — runs the REAL extracted MulticallClient
// encode/decode code under the Hermes CLI and emits `METRIC name=value` lines.
// Also performs parity self-checks against stock Ethers (byte-identical
// encode, identical decode) and fails the run on any mismatch.
declare function print(input: string): void;

import { Interface, defaultAbiCoder } from '@ethersproject/abi';

import {
  buildAggregate3BalanceCalls,
  decodeAggregate3Response,
  decodeUint256,
  encodeAggregate3,
  erc20Interface,
  multicall3Interface,
  ZERO_ADDRESS,
} from './multicall';

// Stock reference interface (default coder, checksum-validating address
// coder) — the parity oracle.
const refIface = new Interface([
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])',
]);

// ---------------------------------------------------------------------------
// Deterministic input generation (LCG) — same data every run.
// ---------------------------------------------------------------------------

let seed = 0x2f6e2b1;
function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed;
}
function hexOf(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += (rand() % 16).toString(16);
  }
  return s;
}

// Scalable knobs (injected by bundle.mjs from env) — used to verify the
// codec is size-general, not tuned to one batch shape.
const BATCH_N: number = (globalThis as any).BENCH_BATCH_N ?? 300;
const RET_BYTES: number = (globalThis as any).BENCH_RET_BYTES ?? 32;
const MULTICALL3_ADDRESS = '0xca11bde05977b3631167028862be2a173976ca11';
const TOKEN_POOL = [
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  '0xdac17f958d2ee523a2206206994597c13d831ec7',
  '0x6b175474e89094c44da98b954eedeac495271d0f',
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
  '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
];

// 300 requests, ~20% native (zero-address token), lowercase addresses
// (accepted by both the stock checksum-validating coder and FastAddressCoder).
const requests: {
  tokenAddress: `0x${string}`;
  accountAddress: `0x${string}`;
}[] = [];
for (let i = 0; i < BATCH_N; i++) {
  const native = rand() % 5 === 0;
  requests.push({
    tokenAddress: (native
      ? ZERO_ADDRESS
      : TOKEN_POOL[rand() % TOKEN_POOL.length]) as `0x${string}`,
    accountAddress: ('0x' + hexOf(40)) as `0x${string}`,
  });
}
const calls = buildAggregate3BalanceCalls(
  requests,
  MULTICALL3_ADDRESS as `0x${string}`,
);

// ---------------------------------------------------------------------------
// Synthetic aggregate3 responses (built once with the stock coder).
// ---------------------------------------------------------------------------

function buildResponse(tuples: [boolean, string][]): `0x${string}` {
  return defaultAbiCoder.encode(
    ['(bool success, bytes returnData)[]'],
    [tuples],
  ) as `0x${string}`;
}

// Main response: realistic balances (32-byte uint256 per success), ~5%
// failures with '0x'.
const mainTuples: [boolean, string][] = requests.map((_, i) => {
  const success = rand() % 20 !== 0;
  if (!success) {
    return [false, '0x'];
  }
  return [
    true,
    '0x' +
      BigInt(i * 999983 + 1)
        .toString(16)
        .padStart(RET_BYTES * 2, '0'),
  ];
});
const respMain = buildResponse(mainTuples);

// Edge responses.
const respEmpty = buildResponse([]);
const respEdge = buildResponse([
  [true, '0x' + 'ab'.repeat(32)], // exactly 32 bytes
  [true, '0xab'], // 1 byte (odd word)
  [true, '0x' + 'cd'.repeat(31)], // 31 bytes — padding edge
  [false, '0x'],
  [true, '0x' + 'ef'.repeat(100)], // long data
  [true, '0x'],
]);

// ---------------------------------------------------------------------------
// Parity self-checks
// ---------------------------------------------------------------------------

function check(name: string, ok: boolean, detail: string): void {
  if (!ok) {
    print(`SELF_CHECK=FAIL ${name}: ${detail}`);
    throw new Error(`self-check failed: ${name}`);
  }
}

function firstDiff(a: string, b: string): string {
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  if (A.length !== B.length) {
    return `len ${A.length} vs ${B.length}; `;
  }
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) {
      return `diff@${i}: ours ${A.slice(Math.max(0, i - 8), i + 8)} vs ref ${B.slice(Math.max(0, i - 8), i + 8)}; `;
    }
  }
  return 'no diff';
}

function refDecode(data: string): { success: boolean; returnData: string }[] {
  const decoded = refIface.decodeFunctionResult('aggregate3', data);
  const results = decoded[0] as { success: boolean; returnData: string }[];
  return results.map((r) => ({
    success: r.success,
    returnData: r.returnData,
  }));
}

function checkDecode(name: string, data: string, count: number): void {
  const ours = decodeAggregate3Response(data as `0x${string}`, count);
  const ref = refDecode(data);
  check(
    name,
    ours.length === ref.length,
    `length ${ours.length} vs ${ref.length}`,
  );
  for (let i = 0; i < ours.length; i++) {
    check(
      name,
      ours[i].success === ref[i].success &&
        ours[i].returnData.toLowerCase() === ref[i].returnData.toLowerCase(),
      `item ${i}: ours ${ours[i].success}/${ours[i].returnData.slice(0, 20)} ref ${ref[i].success}/${ref[i].returnData.slice(0, 20)}`,
    );
  }
}

function runSelfChecks(): void {
  // Encode parity vs stock Ethers (case-insensitive; production guarantees
  // identical bytes).
  const encoded = encodeAggregate3(calls);
  const expected = refIface.encodeFunctionData('aggregate3', [calls]);
  check(
    'encode_main',
    encoded.toLowerCase() === expected.toLowerCase(),
    `${firstDiff(encoded, expected)}${encoded.slice(0, 40)}... vs ${expected.slice(0, 40)}...`,
  );

  // Encode edge cases.
  const edges: {
    target: `0x${string}`;
    allowFailure: boolean;
    callData: `0x${string}`;
  }[][] = [
    [],
    [
      {
        target: '0x1111111111111111111111111111111111111111',
        allowFailure: true,
        callData: '0x',
      },
    ],
    [
      {
        target: '0x2222222222222222222222222222222222222222',
        allowFailure: false,
        callData: '0xab',
      },
      {
        target: '0x3333333333333333333333333333333333333333',
        allowFailure: true,
        callData: '0x' + 'ab'.repeat(33),
      },
    ],
  ];
  for (let i = 0; i < edges.length; i++) {
    const ours = encodeAggregate3(edges[i]);
    const ref = refIface.encodeFunctionData('aggregate3', [edges[i]]);
    check(
      'encode_edge_' + i,
      ours.toLowerCase() === ref.toLowerCase(),
      `${ours.slice(0, 40)}... vs ${ref.slice(0, 40)}...`,
    );
  }

  // Decode parity.
  checkDecode('decode_main', respMain, BATCH_N);
  checkDecode('decode_empty', respEmpty, 0);
  checkDecode('decode_edge', respEdge, 6);

  // Count-mismatch must throw.
  let threw = false;
  try {
    decodeAggregate3Response(respMain as `0x${string}`, BATCH_N - 1);
  } catch {
    threw = true;
  }
  check('decode_count_mismatch_throws', threw, 'expected throw');

  // decodeUint256 parity vs erc20Interface (stock).
  const words = [
    '0x' + BigInt(0).toString(16).padStart(64, '0'),
    '0x' + BigInt(123456789012345).toString(16).padStart(64, '0'),
    '0x' +
      BigInt(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      )
        .toString(16)
        .padStart(64, '0'),
    '0x' + hexOf(64),
  ];
  for (const word of words) {
    const ours = decodeUint256(word as `0x${string}`);
    const ref = erc20Interface
      .decodeFunctionResult('balanceOf', word)[0]
      .toString();
    check(
      'decode_uint256',
      ours === ref,
      `${ours} vs ${ref} (${word.slice(0, 20)}...)`,
    );
  }
  const zero = decodeUint256('0x');
  check('decode_uint256_empty', zero === '0', zero);
}

// ---------------------------------------------------------------------------
// Timing (adaptive loop, ms-resolution safe)
// ---------------------------------------------------------------------------

function timeOp(fn: () => void, minMs: number, maxIters: number): number {
  let iters = 0;
  const t0 = Date.now();
  do {
    fn();
    iters++;
  } while (Date.now() - t0 < minMs && iters < maxIters);
  return (Date.now() - t0) / iters;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runSelfChecks();

// Warmup (module init, lazy paths).
encodeAggregate3(calls);
decodeAggregate3Response(respMain as `0x${string}`, BATCH_N);

const REPS = 5;
const encMs: number[] = [];
const decMs: number[] = [];
const uintMs: number[] = [];

for (let r = 0; r < REPS; r++) {
  encMs.push(timeOp(() => encodeAggregate3(calls), 120, 40));
  decMs.push(
    timeOp(
      () => decodeAggregate3Response(respMain as `0x${string}`, BATCH_N),
      120,
      40,
    ),
  );
  const decoded = decodeAggregate3Response(respMain as `0x${string}`, BATCH_N);
  const datas = decoded
    .filter((x) => x.success && x.returnData.length > 2)
    .map((x) => x.returnData);
  uintMs.push(
    timeOp(
      () => {
        for (let i = 0; i < datas.length; i++) {
          decodeUint256(datas[i] as `0x${string}`);
        }
      },
      120,
      20,
    ),
  );
}

const calldata = encodeAggregate3(calls);

// encdec_full_ms is the primary metric: the full client path for one batch
// (encode aggregate3 -> decode response -> decodeUint256 per result).
print(
  'METRIC encdec_full_ms=' +
    round3(median(encMs) + median(decMs) + median(uintMs)),
);
print('METRIC encdec_ms=' + round3(median(encMs) + median(decMs)));
print('METRIC encode_ms=' + round3(median(encMs)));
print('METRIC decode_ms=' + round3(median(decMs)));
print('METRIC decode_uint256_ms=' + round3(median(uintMs)));
print('METRIC batch_n=' + BATCH_N);
print('METRIC calldata_hex_len=' + calldata.length);
print('METRIC resp_hex_len=' + respMain.length);
print('SELF_CHECK=OK');
