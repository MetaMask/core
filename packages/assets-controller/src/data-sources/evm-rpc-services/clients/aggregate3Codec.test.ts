import { defaultAbiCoder } from '@ethersproject/abi';
import type { Hex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import type { Address } from '../types/index.js';
import type { Aggregate3Call } from './aggregate3Codec.js';
import {
  decodeAggregate3Response,
  decodeUint256,
  encodeAggregate3,
} from './aggregate3Codec.js';
import {
  decodeAggregate3ResponseWithEthers,
  decodeUint256WithEthers,
  encodeAggregate3WithEthers,
} from './MulticallClient.js';

describe('aggregate3 codec', () => {
  const ACCOUNT: Address = '0x1234567890123456789012345678901234567890';
  const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const MULTICALL: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';

  /**
   * Encode `(bool, bytes)[]` the way an `eth_call` response arrives.
   *
   * @param results - Success flags and raw return data.
   * @returns ABI-encoded aggregate3 return data.
   */
  function encodeResults(results: readonly [boolean, Hex][]): Hex {
    return defaultAbiCoder.encode(
      ['(bool success, bytes returnData)[]'],
      [results],
    ) as Hex;
  }

  /**
   * Random integer from 0 up to, but not including, `max`.
   *
   * @param max - Exclusive upper bound.
   * @returns The random integer.
   */
  function randomInt(max: number): number {
    return Math.floor(Math.random() * max);
  }

  /**
   * `byteCount` random bytes as `0x`-prefixed hex.
   *
   * @param byteCount - How many bytes to return.
   * @returns Lowercase hex.
   */
  function randomBytesHex(byteCount: number): Hex {
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    return `0x${Buffer.from(bytes).toString('hex')}`;
  }

  /**
   * Keep the `0x` prefix and randomly upper-case the remaining digits.
   *
   * @param value - A `0x`-prefixed hex string.
   * @returns The same hex with mixed case.
   */
  function randomHexCase(value: Hex): Hex {
    let mixed = '0x';
    for (const digit of value.slice(2)) {
      mixed += Math.random() < 0.5 ? digit : digit.toUpperCase();
    }
    return mixed as Hex;
  }

  /**
   * 1–32 byte address. Half the time, drop one nibble so the length is odd.
   *
   * @returns A target both encoders accept. Ethers rejects an empty address.
   */
  function randomTarget(): Address {
    const target = randomBytesHex(randomInt(32) + 1);
    if (Math.random() < 0.5) {
      return target.slice(0, -1) as Address;
    }
    return target;
  }

  /**
   * Random aggregate3 calls that both encoders accept.
   *
   * @returns Up to four calls. Call data is 0–64 bytes.
   */
  function randomAggregate3Calls(): Aggregate3Call[] {
    const calls: Aggregate3Call[] = [];
    const callCount = randomInt(5);
    for (let index = 0; index < callCount; index++) {
      calls.push({
        target: randomHexCase(randomTarget()),
        allowFailure: Math.random() < 0.5,
        callData: randomHexCase(randomBytesHex(randomInt(65))),
      });
    }
    return calls;
  }

  /**
   * Random `(success, returnData)` rows for an aggregate3 response.
   *
   * @returns Up to four rows. Return data is 0–64 bytes.
   */
  function randomAggregate3Results(): [boolean, Hex][] {
    const results: [boolean, Hex][] = [];
    const resultCount = randomInt(5);
    for (let index = 0; index < resultCount; index++) {
      results.push([
        Math.random() < 0.5,
        randomHexCase(randomBytesHex(randomInt(65))),
      ]);
    }
    return results;
  }

  /**
   * Random uint256 return data: empty, shorter than one word, or one word.
   *
   * @returns Hex both uint256 decoders accept.
   */
  function randomUint256Data(): Hex {
    const kind = randomInt(3);
    if (kind === 0) {
      return '0x';
    }
    if (kind === 1) {
      return randomHexCase(randomBytesHex(randomInt(32)));
    }
    return randomHexCase(randomBytesHex(32));
  }

  it('matches Ethers on 100 random inputs', () => {
    for (let iteration = 0; iteration < 100; iteration++) {
      const calls = randomAggregate3Calls();
      expect(encodeAggregate3(calls)).toBe(encodeAggregate3WithEthers(calls));

      const results = randomAggregate3Results();
      const response = randomHexCase(encodeResults(results));
      expect(decodeAggregate3Response(response, results.length)).toStrictEqual(
        decodeAggregate3ResponseWithEthers(response, results.length),
      );

      const word = randomUint256Data();
      expect(decodeUint256(word)).toBe(decodeUint256WithEthers(word));
    }
  });

  it('encodes 300 calls byte-identically to Ethers', () => {
    const callDataByWidth: Hex[] = [
      '0x',
      '0xaa',
      `0x${'11'.repeat(32)}`,
      `0x${'22'.repeat(33)}`,
      `0x${'33'.repeat(36)}`,
    ];
    const targets = [ACCOUNT, USDC, USDT, MULTICALL];
    const calls: Aggregate3Call[] = [];
    for (let index = 0; index < 300; index++) {
      calls.push({
        target: targets[index % targets.length],
        allowFailure: index % 2 === 0,
        callData: callDataByWidth[index % callDataByWidth.length],
      });
    }

    expect(encodeAggregate3(calls)).toBe(encodeAggregate3WithEthers(calls));
  });

  it('decodes 300 results identically to Ethers', () => {
    const returnDataByWidth: Hex[] = [
      '0x',
      '0xaa',
      `0x${'ab'.repeat(32)}`,
      `0x${'cd'.repeat(33)}`,
    ];
    const results: [boolean, Hex][] = [];
    for (let index = 0; index < 300; index++) {
      results.push([
        index % 2 === 0,
        returnDataByWidth[index % returnDataByWidth.length],
      ]);
    }
    const response = encodeResults(results);

    expect(decodeAggregate3Response(response, results.length)).toStrictEqual(
      decodeAggregate3ResponseWithEthers(response, results.length),
    );
  });
});
