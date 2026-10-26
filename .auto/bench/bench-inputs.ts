// Deterministic bench inputs for the MulticallClient aggregate3 hot path.
//
// Everything here is pure, seed-locked math, so Node (generator) and Hermes
// (bench) produce byte-identical inputs. The response hexes are hand-rolled
// ABI encodings of `(bool,bytes)[]` with `balanceOf`-shaped return data —
// they are validated against the ORIGINAL production decoder in gen_entry.ts.
//
// No require/import of production code here: this module is input data only.

/** mulberry32 — 32-bit seeded PRNG; identical in Node and Hermes. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEX_CHARS = '0123456789abcdef';

/** Fixed-length pseudo-random lowercase hex string (no 0x prefix). */
function hexBody(rng: () => number, chars: number): string {
  let out = '';
  for (let i = 0; i < chars; i++) {
    out += HEX_CHARS[(rng() * 16) | 0];
  }
  return out;
}

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Fixed seed shared by the generator and the bench (run 39731720623 date). */
export const TIMING_SEED = 20261022;

/** Default timing workload size (8 batches × 300 calls). */
export const DEFAULT_TIMING_SCALE = 2400;

// Ethereum mainnet Multicall3 (also in MULTICALL3_ADDRESS_BY_CHAIN['0x1']).
export const MULTICALL_ADDRESS =
  '0xcA11bde05977b3631167028862bE2a173976CA11';

/** Pseudo-random 40-hex-char address (mixed case like a checksummed one). */
function fakeAddress(rng: () => number): string {
  const body = hexBody(rng, 40);
  // Sprinkle uppercase letters so case handling is exercised.
  let out = body.slice(0, 2);
  for (let i = 2; i < 40; i++) {
    const c = body[i];
    out += rng() < 0.3 ? c.toUpperCase() : c;
  }
  return '0x' + out;
}

export type BalanceOfRequest = {
  tokenAddress: string;
  accountAddress: string;
};

/**
 * Deterministic balance requests.
 *
 * ~15% native (ZERO_ADDRESS token) requests, the rest ERC-20, over a small
 * pool of accounts (like an imported-SRP wallet with a funded account and a
 * popular token list).
 */
export function generateRequests(
  rng: () => number,
  accountCount: number,
  tokenCount: number,
  count: number,
): BalanceOfRequest[] {
  const accounts: string[] = [];
  for (let i = 0; i < accountCount; i++) {
    accounts.push(fakeAddress(rng));
  }
  const tokens: string[] = [];
  for (let i = 0; i < tokenCount; i++) {
    tokens.push(fakeAddress(rng));
  }
  const requests: BalanceOfRequest[] = [];
  for (let i = 0; i < count; i++) {
    const native = rng() < 0.15;
    requests.push({
      tokenAddress: native ? ZERO_ADDRESS : tokens[(rng() * tokenCount) | 0],
      accountAddress: accounts[(rng() * accountCount) | 0],
    });
  }
  return requests;
}

const WORD_ZERO = '0'.repeat(64);

/** 32-byte ABI word for a JS number (fits in uint32 here). */
function word(n: number): string {
  return n.toString(16).padStart(64, '0');
}

/** 32-byte ABI word for a uint256 given as a hex body (no 0x, any length). */
function wordHex(body: string): string {
  return body.length >= 64
    ? body.slice(-64)
    : body.padStart(64, '0');
}

function isWordZero(hex: string): boolean {
  for (let i = 0; i < 64; i++) {
    if (hex[i] !== '0') {
      return false;
    }
  }
  return true;
}

export type ResponseShape = {
  /** Hex string (with 0x) for one call's outcome. */
  success: boolean;
  /** `balanceOf`-shaped return data, as a 64-hex-char body (no 0x). */
  balanceBody?: string;
  /** Raw override for returnData body — must be valid hex (no 0x). */
  rawBody?: string;
};

/**
 * Hand-rolled ABI encoding of aggregate3's return value
 * `(bool success, bytes returnData)[]`.
 *
 * Layout (each line = one 32-byte word):
 *   w0:            array length n
 *   w1..wn:        offset of element i's tuple, relative to w1
 *   element i:     success word | bytes-offset (0x40, relative to tuple
 *                  start) | bytes length | padded bytes data
 *
 * Deterministic, cheap, and shape-valid; gen_entry.ts validates that the
 * ORIGINAL production decoder accepts it.
 */
export function buildAggregate3Response(shapes: ResponseShape[]): string {
  const n = shapes.length;
  // Function outputs are decoded as a tuple of components, so a dynamic
  // top-level array is wrapped: 0x20 | array encoding. (Verified byte-for-byte
  // against @ethersproject/abi defaultAbiCoder in .auto/bench/abi-check.mjs.)
  if (n === 0) {
    return '0x' + word(0x20) + word(0);
  }

  const bytesLen: number[] = [];
  const paddedBodies: string[] = [];
  const tupleWords: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = shapes[i];
    const body = s.rawBody ?? s.balanceBody ?? WORD_ZERO;
    // bytes payload padded to whole words (valid hex assumed).
    const padded =
      body.length % 64 === 0
        ? body
        : body.padEnd(64 * Math.ceil(body.length / 64), '0');
    bytesLen[i] = body.length / 2; // in bytes
    paddedBodies[i] = padded;
    tupleWords[i] = 3 + padded.length / 64; // success + offset + len + data
  }

  // Tuple i starts (as a word index) after w0..wn plus all earlier tuples.
  const tupleStart: number[] = [];
  let cursor = 1 + n;
  for (let i = 0; i < n; i++) {
    tupleStart[i] = cursor;
    cursor += tupleWords[i];
  }

  let out = word(0x20) + word(n);
  for (let i = 0; i < n; i++) {
    out += word((tupleStart[i] - 1) * 32); // relative to w1
  }
  for (let i = 0; i < n; i++) {
    const s = shapes[i];
    out += s.success ? word(1) : WORD_ZERO;
    out += word(0x40); // bytes data offset, relative to tuple start
    out += word(bytesLen[i]);
    out += paddedBodies[i];
  }
  return '0x' + out;
}

/**
 * Deterministic outcome shapes for a batch of requests: mostly successful
 * `balanceOf` results with a sprinkle of edge shapes.
 */
export function generateResponseShapes(
  rng: () => number,
  count: number,
): ResponseShape[] {
  const shapes: ResponseShape[] = [];
  for (let i = 0; i < count; i++) {
    const roll = rng();
    if (roll < 0.03) {
      // Failed call: empty return data, success=false.
      shapes.push({ success: false, rawBody: '' });
    } else if (roll < 0.06) {
      // Zero balance.
      shapes.push({ success: true, balanceBody: WORD_ZERO });
    } else if (roll < 0.08) {
      // Max-ish uint256 (all f's).
      shapes.push({ success: true, balanceBody: 'f'.repeat(64) });
    } else {
      // Ordinary balance: first hex digit 0-3 keeps it in uint256 range.
      const lead = '0123'[rng() * 4 | 0];
      shapes.push({
        success: true,
        balanceBody: lead + hexBody(rng, 63),
      });
    }
  }
  return shapes;
}

/**
 * The per-batch timing input: requests plus a pre-built response hex.
 * The FIFO fake provider returns `responseHex` for the batch.
 */
export type TimingBatch = {
  requests: BalanceOfRequest[];
  responseHex: string;
};

export function generateTimingBatches(
  seed: number,
  scale: number,
  batchSize = 300,
): TimingBatch[] {
  const rng = createRng(seed);
  const batches: TimingBatch[] = [];
  let remaining = scale;
  while (remaining > 0) {
    const n = Math.min(remaining, batchSize);
    const requests = generateRequests(rng, 50, 120, n);
    const shapes = generateResponseShapes(rng, n);
    batches.push({
      requests,
      responseHex: buildAggregate3Response(shapes),
    });
    remaining -= n;
  }
  return batches;
}
