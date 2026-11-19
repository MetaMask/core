import type { Hex } from '@metamask/utils';

import type { Address } from '../types/index.js';

// Hand-rolled Multicall3 `aggregate3` codecs.
//
// Balance refreshes pack many `balanceOf` and `getEthBalance` calls into one
// `aggregate3`. This module writes and reads that fixed ABI shape directly.
// `MulticallClient` still has the Ethers codecs (`encodeAggregate3WithEthers`,
// `decodeAggregate3ResponseWithEthers`, `decodeUint256WithEthers`) so tests
// can require the same bytes.
//
// Why this is split out, and what it costs, is recorded in
// `packages/assets-controller/docs/decisions/2026-10-26-hand-rolled-aggregate3-codecs.md`.

/**
 * One Multicall3 `aggregate3` call.
 *
 * `target` is the contract to call. `allowFailure` lets that call revert
 * without failing the batch. `callData` is the ABI-encoded call.
 */
export type Aggregate3Call = {
  target: Address;
  allowFailure: boolean;
  callData: Hex;
};

/**
 * One encoded `(address, bool, bytes)` tuple, before it is placed in the
 * array. `bodyParts` are 32-byte hex words with no `0x` prefix. `byteLength`
 * is the padded size of that body and is what the next call's offset adds.
 */
type EncodedAggregate3Call = {
  bodyParts: string[];
  byteLength: number;
};

/** `aggregate3((address,bool,bytes)[])` selector, without a `0x` prefix. */
const AGGREGATE3_SELECTOR = '82ad56cb';

/**
 * 32-byte words written as 64 hex characters, with no `0x` prefix.
 * The encoder concatenates them after the selector.
 *
 * - `WORD_ARRAY_OFFSET` is `0x20`: the calls array begins at the next word.
 * - `WORD_CALLDATA_OFFSET` is `0x60`: `callData` begins three words into a tuple.
 * - `WORD_ZERO` / `WORD_ONE` are the ABI bool values.
 */
const WORD_ARRAY_OFFSET = `0${'0'.repeat(61)}20`;
const WORD_CALLDATA_OFFSET = `0${'0'.repeat(61)}60`;
const WORD_ZERO = '0'.repeat(64);
const WORD_ONE = `0${'0'.repeat(62)}1`;
const LOWERCASE_HEX_RE = /^[0-9a-f]*$/u;

/**
 * Write a byte count as a 32-byte hex word.
 *
 * @param value - A byte length or an element count.
 * @returns 64 lowercase hex characters, with no `0x` prefix.
 */
function encodeWord(value: number): string {
  return value.toString(16).padStart(64, '0');
}

/**
 * Check a call and return the hex bodies the encoder pads.
 *
 * Addresses follow the Ethers coder: a `0x` prefix, hex digits, and at most
 * 32 bytes. Lengths other than 20 bytes are left-padded, which is what keeps
 * short and long targets byte-identical to Ethers. Call data must be
 * even-length hex.
 *
 * @param call - One aggregate3 call.
 * @returns Lowercase hex bodies with the `0x` prefix removed.
 * @throws When `target` or `callData` is not hex the Ethers coder would accept.
 */
function normalizeAggregate3Call(call: Aggregate3Call): {
  targetHex: string;
  dataHex: string;
} {
  const { target, callData } = call;
  if (!target.startsWith('0x')) {
    throw new Error(`invalid address value: ${target}`);
  }
  const targetHex = target.slice(2).toLowerCase();
  if (!LOWERCASE_HEX_RE.test(targetHex) || targetHex.length > 64) {
    throw new Error(`invalid address value: ${target}`);
  }

  if (!callData.startsWith('0x')) {
    throw new Error(`invalid bytes value: ${callData}`);
  }
  const dataHex = callData.slice(2).toLowerCase();
  if (dataHex.length % 2 !== 0 || !LOWERCASE_HEX_RE.test(dataHex)) {
    throw new Error(`invalid bytes value: ${callData}`);
  }
  return { targetHex, dataHex };
}

/**
 * Encode one `(address, bool, bytes)` tuple.
 *
 * The body is five pieces, concatenated:
 *
 * - `target`, left-padded to 32 bytes
 * - `allowFailure` as a 0 or 1 word
 * - the offset of `callData`, always `0x60` (three words into the tuple)
 * - the `callData` length in bytes
 * - `callData`, right-padded with zeros to a multiple of 32 bytes
 *
 * @param call - One aggregate3 call.
 * @returns The tuple body and its padded length in bytes.
 */
function encodeAggregate3Call(call: Aggregate3Call): EncodedAggregate3Call {
  const { targetHex, dataHex } = normalizeAggregate3Call(call);
  const paddedData = dataHex.padEnd(
    dataHex.length + ((64 - (dataHex.length % 64)) % 64),
    '0',
  );

  // Three static words (96 bytes) plus the 32-byte length prefix.
  return {
    bodyParts: [
      targetHex.padStart(64, '0'),
      call.allowFailure ? WORD_ONE : WORD_ZERO,
      WORD_CALLDATA_OFFSET,
      encodeWord(dataHex.length / 2),
      paddedData,
    ],
    byteLength: 128 + paddedData.length / 2,
  };
}

/**
 * Build the array head and the concatenated tuple bodies.
 *
 * Each head word is a byte offset measured from the first head word. The
 * first call therefore starts at `32 * calls.length`, the size of the head
 * itself, and every later call starts at the previous offset plus that
 * call's padded body length.
 *
 * @param calls - Aggregate3 call descriptors.
 * @returns Hex words for the head and the body, with no `0x` prefixes.
 */
function getAggregate3Parts(calls: readonly Aggregate3Call[]): {
  headParts: string[];
  bodyParts: string[];
} {
  const parts = calls.reduce(
    (accumulator, call) => {
      const encodedCall = encodeAggregate3Call(call);
      accumulator.headParts.push(encodeWord(accumulator.nextTupleOffset));
      accumulator.bodyParts.push(...encodedCall.bodyParts);
      accumulator.nextTupleOffset += encodedCall.byteLength;
      return accumulator;
    },
    {
      headParts: [] as string[],
      bodyParts: [] as string[],
      nextTupleOffset: calls.length * 32,
    },
  );
  return parts;
}

/**
 * Encode `aggregate3((address,bool,bytes)[])`.
 *
 * The bytes are the 4-byte selector `82ad56cb`, then one ABI argument:
 *
 * 1. A word holding the offset of the calls array, always `0x20`.
 * 2. A word holding the number of calls.
 * 3. One offset word per call. See `getAggregate3Parts`.
 * 4. The call bodies, in order. See `encodeAggregate3Call`.
 *
 * @param calls - Aggregate3 call descriptors.
 * @returns Call data that matches `encodeAggregate3WithEthers` for the same input.
 * @throws When a target or call data value is not hex the Ethers coder would accept.
 */
export function encodeAggregate3(calls: readonly Aggregate3Call[]): Hex {
  const { headParts, bodyParts } = getAggregate3Parts(calls);

  return [
    `0x${AGGREGATE3_SELECTOR}`,
    WORD_ARRAY_OFFSET,
    encodeWord(calls.length),
    ...headParts,
    ...bodyParts,
  ].join('') as Hex;
}

/**
 * Read one 32-byte word from an aggregate3 response body.
 *
 * Offsets and lengths in this response are byte counts. The uint256 payload
 * inside `returnData` is decoded separately by `decodeUint256`.
 *
 * @param body - Response hex with the `0x` prefix removed.
 * @param charIndex - Index of the first hex character of the word.
 * @returns The word as an integer.
 * @throws When the word is missing or is not hex.
 */
function readResponseWord(body: string, charIndex: number): number {
  if (charIndex < 0 || charIndex + 64 > body.length) {
    throw new Error('aggregate3 response data length out-of-bounds');
  }
  const value = parseInt(body.slice(charIndex, charIndex + 64), 16);
  if (!Number.isFinite(value)) {
    throw new Error('aggregate3 response contains a non-hex word');
  }
  return value;
}

/**
 * Locate the array head of an aggregate3 return value.
 *
 * `eth_call` return data has no function selector. Word 0 is the byte offset
 * of the result array. At that offset sits the length word, then one offset
 * word per result. `headStart` is the hex index of the first of those
 * offset words.
 *
 * @param body - Response hex with the `0x` prefix removed.
 * @param callCount - How many results the caller expects.
 * @returns The head position and the length stored in the response.
 * @throws When the stored length is not `callCount`.
 */
function getAggregate3ResponseHead(
  body: string,
  callCount: number,
): { headStart: number; resultCount: number } {
  const headStart = readResponseWord(body, 0) * 2 + 64;
  const resultCount = readResponseWord(body, headStart - 64);
  if (resultCount !== callCount) {
    throw new Error(`Expected ${callCount} results, got ${resultCount}`);
  }
  return { headStart, resultCount };
}

/**
 * Decode one `(bool success, bytes returnData)` result.
 *
 * The tuple starts at the head plus that result's offset. Its first word is
 * `success` (`0` or `1`). Its second word is the offset of `returnData`,
 * measured from the start of the tuple. The payload at that offset is a
 * length word followed by the raw bytes, which this returns without padding.
 *
 * @param body - Response hex with the `0x` prefix removed.
 * @param headStart - Hex index of the first result-offset word.
 * @param resultIndex - Index of the result to decode.
 * @returns The success flag and the unpadded return data.
 * @throws When the return data runs past the end of `body`.
 */
function decodeAggregate3Result(
  body: string,
  headStart: number,
  resultIndex: number,
): { success: boolean; returnData: Hex } {
  const tupleStart =
    headStart + readResponseWord(body, headStart + resultIndex * 64) * 2;
  const returnDataStart =
    tupleStart + readResponseWord(body, tupleStart + 64) * 2;
  const returnDataBytes = readResponseWord(body, returnDataStart);
  const dataStart = returnDataStart + 64;
  if (dataStart + returnDataBytes * 2 > body.length) {
    throw new Error('aggregate3 response data length out-of-bounds');
  }
  return {
    success: readResponseWord(body, tupleStart) !== 0,
    returnData: `0x${body
      .slice(dataStart, dataStart + returnDataBytes * 2)
      .toLowerCase()}`,
  };
}

/**
 * Decode an `aggregate3` return value.
 *
 * The outer shape is one dynamic array of `(bool success, bytes returnData)`
 * tuples. `callCount` is checked against the length word so a short response
 * cannot be paired with the wrong batch.
 *
 * @param data - The raw `eth_call` return data.
 * @param callCount - The expected result count.
 * @returns One decoded result per call, in call order.
 * @throws When `data` is not hex, a word is out of range, or the length word
 * does not equal `callCount`.
 */
export function decodeAggregate3Response(
  data: Hex,
  callCount: number,
): { success: boolean; returnData: Hex }[] {
  if (!data.startsWith('0x')) {
    throw new Error(`invalid response data value: ${data}`);
  }
  const body = data.slice(2);
  const { headStart, resultCount } = getAggregate3ResponseHead(body, callCount);
  return Array.from({ length: resultCount }, (_, resultIndex) =>
    decodeAggregate3Result(body, headStart, resultIndex),
  );
}

/**
 * Read a uint256 from the first ABI word of return data.
 *
 * `balanceOf` and `getEthBalance` each return a single 32-byte word. Empty
 * data and anything shorter than one word decode as `'0'`, matching
 * `decodeUint256WithEthers`.
 *
 * @param data - Hex return data.
 * @returns The integer as a decimal string.
 */
export function decodeUint256(data: Hex): string {
  if (data === '0x' || data.length < 66) {
    return '0';
  }
  return BigInt(data.slice(0, 66)).toString();
}
