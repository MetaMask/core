import { Interface } from '@ethersproject/abi';
import {
  decodeFunctionResult as viemDecodeFunctionResult,
  encodeFunctionData as viemEncodeFunctionData,
  parseAbi as viemParseAbi,
} from 'viem';

import {
  decodeAggregate3Response as handrolledDecodeAggregate3Response,
  decodeUint256 as handrolledDecodeUint256,
  encodeAggregate3 as handrolledEncodeAggregate3,
} from './MulticallClient.js';
import type { Aggregate3Codec } from './MulticallClient.js';

/**
 * Available aggregate3 codec implementations:
 *
 * - `handrolled` — the optimized string codec in `MulticallClient.ts`
 *   (default; ~44x faster than the stock Ethers path on Hermes).
 * - `viem` — the same surface implemented with viem's
 *   `encodeFunctionData`/`decodeFunctionResult` (maintained-library option).
 * - `ethers` — the stock Ethers `Interface` implementation (the pre-optimization
 *   behavior), kept for A/B comparison.
 *
 * These exist so the three implementations can be compared on real devices
 * with real workloads; see the changelog and PR for measurements.
 */
export type Aggregate3CodecVariant = 'handrolled' | 'viem' | 'ethers';

const AGGREGATE3_HUMAN_READABLE_ABI = [
  'function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])',
] as const;

const BALANCE_OF_HUMAN_READABLE_ABI = [
  'function balanceOf(address account) view returns (uint256)',
] as const;

// viem: parse once at module level (the equivalent of `new Interface()`).
const aggregate3ViemAbi = viemParseAbi(AGGREGATE3_HUMAN_READABLE_ABI);
const balanceOfViemAbi = viemParseAbi(BALANCE_OF_HUMAN_READABLE_ABI);

// Ethers: stateless interfaces with the same fragments as MulticallClient's.
const aggregate3EthersInterface = new Interface(AGGREGATE3_HUMAN_READABLE_ABI);
const balanceOfEthersInterface = new Interface(BALANCE_OF_HUMAN_READABLE_ABI);

/** Hand-rolled codec from MulticallClient.ts (the default). */
const handrolledCodec: Aggregate3Codec = {
  encodeAggregate3: handrolledEncodeAggregate3,
  decodeAggregate3Response: handrolledDecodeAggregate3Response,
  decodeUint256: handrolledDecodeUint256,
};

/** viem codec. Preserves the count-mismatch contract of the default codec. */
const viemCodec: Aggregate3Codec = {
  encodeAggregate3: (calls) =>
    viemEncodeFunctionData({
      abi: aggregate3ViemAbi,
      functionName: 'aggregate3',
      args: [
        calls.map((call) => ({
          target: call.target,
          allowFailure: call.allowFailure,
          callData: call.callData,
        })),
      ],
    }),
  decodeAggregate3Response: (data, callCount) => {
    const results = viemDecodeFunctionResult({
      abi: aggregate3ViemAbi,
      functionName: 'aggregate3',
      data,
    }) as { success: boolean; returnData: `0x${string}` }[];

    if (results.length !== callCount) {
      throw new Error(`Expected ${callCount} results, got ${results.length}`);
    }

    return results;
  },
  decodeUint256: (data) => {
    if (data === '0x' || data.length < 66) {
      return '0';
    }
    return String(
      viemDecodeFunctionResult({
        abi: balanceOfViemAbi,
        functionName: 'balanceOf',
        data,
      }),
    );
  },
};

/** Stock Ethers codec (the pre-optimization behavior). */
const ethersCodec: Aggregate3Codec = {
  encodeAggregate3: (calls) =>
    aggregate3EthersInterface.encodeFunctionData('aggregate3', [
      calls.map((call) => ({
        target: call.target,
        allowFailure: call.allowFailure,
        callData: call.callData,
      })),
    ]) as `0x${string}`,
  decodeAggregate3Response: (data, callCount) => {
    const decoded = aggregate3EthersInterface.decodeFunctionResult(
      'aggregate3',
      data,
    );
    const results = decoded[0] as readonly {
      success: boolean;
      returnData: `0x${string}`;
    }[];

    if (results.length !== callCount) {
      throw new Error(`Expected ${callCount} results, got ${results.length}`);
    }

    return results.map((result) => ({
      success: result.success,
      returnData: result.returnData,
    }));
  },
  decodeUint256: (data) => {
    if (data === '0x' || data.length < 66) {
      return '0';
    }
    const balance = balanceOfEthersInterface.decodeFunctionResult(
      'balanceOf',
      data,
    )[0] as bigint;
    return balance.toString();
  },
};

const CODECS: Record<Aggregate3CodecVariant, Aggregate3Codec> = {
  handrolled: handrolledCodec,
  viem: viemCodec,
  ethers: ethersCodec,
};

/**
 * Get an aggregate3 codec implementation by variant.
 *
 * @param variant - The codec variant.
 * @returns The codec implementation.
 */
export function getAggregate3Codec(
  variant: Aggregate3CodecVariant,
): Aggregate3Codec {
  return CODECS[variant];
}

let activeVariant: Aggregate3CodecVariant = 'handrolled';

/**
 * Select the aggregate3 codec variant used by subsequently constructed
 * `MulticallClient` instances.
 *
 * Experimental: intended for on-device performance comparison of the codec
 * implementations; may be removed once the default is settled.
 *
 * @param variant - The codec variant to activate.
 */
export function setAggregate3CodecVariant(
  variant: Aggregate3CodecVariant,
): void {
  activeVariant = variant;
}

/**
 * Get the currently active aggregate3 codec.
 *
 * @returns The active codec implementation.
 */
export function getActiveAggregate3Codec(): Aggregate3Codec {
  return CODECS[activeVariant];
}

export type { Aggregate3Codec } from './MulticallClient.js';
