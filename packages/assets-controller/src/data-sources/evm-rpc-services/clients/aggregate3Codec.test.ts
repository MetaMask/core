import { defaultAbiCoder, Interface } from '@ethersproject/abi';
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

const ACCOUNT: Address = '0x1234567890123456789012345678901234567890';
const USDC: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const MULTICALL: Address = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MAX_UINT256 = (2n ** 256n - 1n).toString();

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

describe('encodeAggregate3', () => {
  const erc20Interface = new Interface([
    'function balanceOf(address account) view returns (uint256)',
  ]);
  const multicallInterface = new Interface([
    'function getEthBalance(address addr) view returns (uint256)',
  ]);

  const encodeCases: { name: string; calls: Aggregate3Call[] }[] = [
    {
      name: 'an empty batch',
      calls: [],
    },
    {
      name: 'a USDC balanceOf and a native getEthBalance',
      calls: [
        {
          target: USDC,
          allowFailure: true,
          callData: erc20Interface.encodeFunctionData('balanceOf', [
            ACCOUNT,
          ]) as Hex,
        },
        {
          target: MULTICALL,
          allowFailure: true,
          callData: multicallInterface.encodeFunctionData('getEthBalance', [
            ACCOUNT,
          ]) as Hex,
        },
      ],
    },
    {
      name: 'empty, one-byte, 32-byte, and 33-byte call data',
      calls: [
        {
          target: ACCOUNT,
          allowFailure: true,
          callData: '0x',
        },
        {
          target: USDC,
          allowFailure: false,
          callData: '0xaa',
        },
        {
          target: USDT,
          allowFailure: true,
          callData: `0x${'11'.repeat(32)}`,
        },
        {
          target: MULTICALL,
          allowFailure: false,
          callData: `0x${'22'.repeat(33)}`,
        },
      ],
    },
    {
      // Ethers left-pads targets that are not 20 bytes. These three widths
      // are the ones that padding has to get right.
      name: 'targets of 1, 39, and 41 nibbles',
      calls: [
        {
          target: '0x1',
          allowFailure: true,
          callData: '0x',
        },
        {
          target: `0x${'1'.repeat(39)}`,
          allowFailure: false,
          callData: '0xaa',
        },
        {
          target: `0x${'2'.repeat(41)}`,
          allowFailure: true,
          callData: '0xbbbb',
        },
      ],
    },
    {
      name: 'an uppercase target and call data',
      calls: [
        {
          target: '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
          allowFailure: true,
          callData: '0x70A08231',
        },
      ],
    },
  ];

  it.each(encodeCases)(
    'encodes $name byte-identically to Ethers',
    ({ calls }) => {
      expect(encodeAggregate3(calls)).toBe(encodeAggregate3WithEthers(calls));
    },
  );

  // Ethers rejects these. The hand-rolled codec has to reject them too.
  const invalidEncodeCases: { name: string; calls: Aggregate3Call[] }[] = [
    {
      name: 'a non-hex target',
      calls: [
        {
          target: '0xnothex',
          allowFailure: true,
          callData: '0x',
        },
      ],
    },
    {
      name: 'call data without a hex prefix',
      calls: [
        {
          target: ACCOUNT,
          allowFailure: true,
          callData: '70a08231' as Hex,
        },
      ],
    },
    {
      name: 'odd-length call data',
      calls: [
        {
          target: ACCOUNT,
          allowFailure: true,
          callData: '0xabc',
        },
      ],
    },
    {
      name: 'non-hex call data',
      calls: [
        {
          target: ACCOUNT,
          allowFailure: true,
          callData: '0xzz',
        },
      ],
    },
  ];

  it.each(invalidEncodeCases)('rejects $name, as Ethers does', ({ calls }) => {
    expect(() => encodeAggregate3WithEthers(calls)).toThrow(Error);
    expect(() => encodeAggregate3(calls)).toThrow(Error);
  });
});

describe('decodeAggregate3Response', () => {
  const uint256 = (value: string): Hex =>
    defaultAbiCoder.encode(['uint256'], [value]) as Hex;

  const decodeCases: {
    name: string;
    results: readonly [boolean, Hex][];
  }[] = [
    {
      name: 'no results',
      results: [],
    },
    {
      name: 'one successful balance',
      results: [[true, uint256('1000000000')]],
    },
    {
      name: 'a failed call between two balances',
      results: [
        [true, uint256('100')],
        [false, '0x'],
        [true, uint256('300')],
      ],
    },
    {
      name: 'one byte of return data',
      results: [[true, '0xaa']],
    },
    {
      name: '33 bytes of return data',
      results: [[false, `0x${'ab'.repeat(33)}`]],
    },
  ];

  it.each(decodeCases)('decodes $name identically to Ethers', ({ results }) => {
    const response = encodeResults(results);
    expect(decodeAggregate3Response(response, results.length)).toStrictEqual(
      decodeAggregate3ResponseWithEthers(response, results.length),
    );
  });

  // Ethers rejects these. The hand-rolled codec has to reject them too.
  const invalidDecodeCases: {
    name: string;
    response: Hex;
    resultCount: number;
  }[] = [
    {
      name: 'a response without a hex prefix',
      response: '1234' as Hex,
      resultCount: 0,
    },
    {
      name: 'a non-hex word',
      response: `0x${'z'.repeat(64)}`,
      resultCount: 0,
    },
    {
      name: 'a truncated response',
      response: `0x${'00'.repeat(16)}`,
      resultCount: 1,
    },
    {
      name: 'a result count that does not match',
      response: encodeResults([[true, uint256('100')]]),
      resultCount: 2,
    },
  ];

  it.each(invalidDecodeCases)(
    'rejects $name, as Ethers does',
    ({ response, resultCount }) => {
      expect(() =>
        decodeAggregate3ResponseWithEthers(response, resultCount),
      ).toThrow(Error);
      expect(() => decodeAggregate3Response(response, resultCount)).toThrow(
        Error,
      );
    },
  );
});

describe('decodeUint256', () => {
  const uint256Cases = [
    { name: 'zero', data: `0x${'0'.repeat(64)}`, expected: '0' },
    { name: 'one', data: `0x${'0'.repeat(63)}1`, expected: '1' },
    {
      name: 'max uint256',
      data: `0x${'f'.repeat(64)}`,
      expected: MAX_UINT256,
    },
    { name: 'empty data', data: '0x', expected: '0' },
    { name: 'a short word', data: '0x1234', expected: '0' },
  ] as const;

  it.each(uint256Cases)(
    'decodes $name as $expected, matching Ethers',
    ({ data, expected }) => {
      const decoded = decodeUint256(data);
      expect(decoded).toBe(expected);
      expect(decoded).toBe(decodeUint256WithEthers(data));
    },
  );
});

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

describe('random comparison with Ethers', () => {
  it('encodes and decodes 100 random inputs identically to Ethers', () => {
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
});
