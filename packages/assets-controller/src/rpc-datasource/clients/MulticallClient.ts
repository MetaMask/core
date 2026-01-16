import type { Hex } from '@metamask/utils';

import type {
  Address,
  BalanceOfRequest,
  BalanceOfResponse,
  ChainId,
  GetProviderFunction,
  MulticallRequest,
  MulticallResponse,
  Provider,
} from '../types';
import { reduceInBatchesSerially } from '../utils';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Zero address constant for native token.
 */
const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

/**
 * Multicall3 contract addresses by chain ID.
 * Most chains use the same deterministic deployment address.
 * Source: https://github.com/mds1/multicall/blob/main/deployments.json
 */
export const MULTICALL3_ADDRESS_BY_CHAIN: Record<ChainId, Address> = {
  '0x1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x4': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x5': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x3': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xaa36a7': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa4b1': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x89': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x38': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xa86a': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xfa': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x64': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x2105': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0xe708': '0xcA11bde05977b3631167028862bE2a173976CA11',
  '0x144': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
  '0x118': '0xF9cda624FBC7e059355ce98a31693d299FACd963',
} as Record<Hex, Hex>;

// =============================================================================
// ABI DEFINITIONS
// =============================================================================

const BALANCE_OF_SELECTOR = '0x70a08231';
const AGGREGATE3_SELECTOR = '0x82ad56cb';

// =============================================================================
// ENCODING/DECODING UTILITIES
// =============================================================================

function padAddress(address: Address): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

function encodeBalanceOf(accountAddress: Address): Hex {
  return `${BALANCE_OF_SELECTOR}${padAddress(accountAddress)}` as Hex;
}

function encodeAggregate3(calls: MulticallRequest[]): `0x${string}` {
  const arrayLength = calls.length;
  let encoded = '';

  encoded += '0000000000000000000000000000000000000000000000000000000000000020';
  encoded += arrayLength.toString(16).padStart(64, '0');

  const tupleOffsets: number[] = [];
  let currentOffset = arrayLength * 32;

  for (const call of calls) {
    tupleOffsets.push(currentOffset);
    const callDataLen = (call.callData.length - 2) / 2;
    const paddedLen = Math.ceil(callDataLen / 32) * 32;
    currentOffset += 32 + 32 + 32 + 32 + paddedLen;
  }

  for (const offset of tupleOffsets) {
    encoded += offset.toString(16).padStart(64, '0');
  }

  for (const call of calls) {
    encoded += padAddress(call.target);

    if (call.allowFailure) {
      encoded +=
        '0000000000000000000000000000000000000000000000000000000000000001';
    } else {
      encoded +=
        '0000000000000000000000000000000000000000000000000000000000000000';
    }

    encoded +=
      '0000000000000000000000000000000000000000000000000000000000000060';

    const callDataLen = (call.callData.length - 2) / 2;
    encoded += callDataLen.toString(16).padStart(64, '0');

    const callDataHex = call.callData.slice(2);
    const paddedLen = Math.ceil(callDataLen / 32) * 32;
    encoded += callDataHex.padEnd(paddedLen * 2, '0');
  }

  return `0x${encoded}`;
}

function decodeAggregate3Response(
  data: string,
  numCalls: number,
): MulticallResponse[] {
  const results: MulticallResponse[] = [];
  const hexData = data.startsWith('0x') ? data.slice(2) : data;

  const arrayOffset = parseInt(hexData.slice(0, 64), 16);
  const arrayLengthPos = arrayOffset * 2;
  const arrayLength = parseInt(
    hexData.slice(arrayLengthPos, arrayLengthPos + 64),
    16,
  );

  if (arrayLength !== numCalls) {
    throw new Error(
      `Expected ${numCalls} results but got ${arrayLength} in aggregate3 response`,
    );
  }

  const offsetsStart = arrayLengthPos + 64;
  const elementOffsets: number[] = [];
  for (let i = 0; i < arrayLength; i++) {
    const offset = parseInt(
      hexData.slice(offsetsStart + i * 64, offsetsStart + (i + 1) * 64),
      16,
    );
    elementOffsets.push(offset);
  }

  const arrayDataStart = arrayLengthPos;
  for (let i = 0; i < arrayLength; i++) {
    const tupleStart = arrayDataStart + elementOffsets[i] * 2;

    const successValue = parseInt(
      hexData.slice(tupleStart, tupleStart + 64),
      16,
    );
    const success = successValue !== 0;

    const returnDataOffset = parseInt(
      hexData.slice(tupleStart + 64, tupleStart + 128),
      16,
    );

    const returnDataLengthPos = tupleStart + returnDataOffset * 2;
    const returnDataLength = parseInt(
      hexData.slice(returnDataLengthPos, returnDataLengthPos + 64),
      16,
    );

    const returnDataStart = returnDataLengthPos + 64;
    const returnData =
      returnDataLength > 0
        ? `0x${hexData.slice(returnDataStart, returnDataStart + returnDataLength * 2)}`
        : '0x';

    results.push({ success, returnData: returnData as Hex });
  }

  return results;
}

function decodeUint256(data: Hex): string {
  const hexData = data.startsWith('0x') ? data.slice(2) : data;
  if (hexData.length === 0) {
    return '0';
  }
  const normalizedHex = hexData.length > 64 ? hexData.slice(0, 64) : hexData;
  return BigInt(`0x${normalizedHex}`).toString();
}

// =============================================================================
// TYPES
// =============================================================================

export type MulticallClientConfig = {
  maxCallsPerBatch?: number;
  timeoutMs?: number;
};

// =============================================================================
// MULTICALL CLIENT
// =============================================================================

export class MulticallClient {
  readonly #getProvider: GetProviderFunction;

  readonly #config: Required<MulticallClientConfig>;

  constructor(
    getProvider: GetProviderFunction,
    config?: MulticallClientConfig,
  ) {
    this.#getProvider = getProvider;
    this.#config = {
      maxCallsPerBatch: config?.maxCallsPerBatch ?? 300,
      timeoutMs: config?.timeoutMs ?? 30000,
    };
  }

  isSupported(chainId: ChainId): boolean {
    return chainId in MULTICALL3_ADDRESS_BY_CHAIN;
  }

  getContractAddress(chainId: ChainId): Address | undefined {
    return MULTICALL3_ADDRESS_BY_CHAIN[chainId];
  }

  async aggregate3(
    chainId: ChainId,
    calls: MulticallRequest[],
  ): Promise<MulticallResponse[]> {
    if (calls.length === 0) {
      return [];
    }

    const multicallAddress = this.getContractAddress(chainId);
    if (!multicallAddress) {
      throw new Error(`Multicall3 not supported on chain ${chainId}`);
    }

    const provider = this.#getProvider(chainId);
    const allResults: MulticallResponse[] = [];

    for (let i = 0; i < calls.length; i += this.#config.maxCallsPerBatch) {
      const batch = calls.slice(i, i + this.#config.maxCallsPerBatch);
      const callData = encodeAggregate3(batch);

      const result = await provider.call({
        to: multicallAddress,
        data: `${AGGREGATE3_SELECTOR}${callData.slice(2)}` as Hex,
      });

      const decoded = decodeAggregate3Response(result, batch.length);
      allResults.push(...decoded);
    }

    return allResults;
  }

  async batchBalanceOf(
    chainId: ChainId,
    requests: BalanceOfRequest[],
  ): Promise<BalanceOfResponse[]> {
    if (requests.length === 0) {
      return [];
    }

    const provider = this.#getProvider(chainId);
    const batchSize = this.#config.maxCallsPerBatch;

    const responses = await reduceInBatchesSerially<
      BalanceOfRequest,
      BalanceOfResponse[]
    >({
      values: requests,
      batchSize,
      initialResult: [],
      eachBatch: async (workingResult, batch) => {
        const batchResults = await Promise.allSettled(
          batch.map((req) => this.#fetchSingleBalance(provider, req)),
        );

        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            workingResult.push(result.value);
          }
        }

        return workingResult;
      },
    });

    return responses;
  }

  async batchNativeBalance(
    chainId: ChainId,
    accounts: Address[],
  ): Promise<Record<Address, string>> {
    if (accounts.length === 0) {
      return {};
    }

    const requests: BalanceOfRequest[] = accounts.map((accountAddress) => ({
      tokenAddress: ZERO_ADDRESS,
      accountAddress,
    }));

    const responses = await this.batchBalanceOf(chainId, requests);

    const result: Record<Address, string> = {};
    for (const response of responses) {
      if (response.success && response.balance !== undefined) {
        result[response.accountAddress] = response.balance;
      }
    }

    return result;
  }

  async #fetchSingleBalance(
    provider: Provider,
    req: BalanceOfRequest,
  ): Promise<BalanceOfResponse> {
    try {
      if (req.tokenAddress === ZERO_ADDRESS) {
        const balance = await provider.getBalance(req.accountAddress);
        return {
          tokenAddress: req.tokenAddress,
          accountAddress: req.accountAddress,
          success: true,
          balance: balance.toString(),
        };
      }

      const callData = encodeBalanceOf(req.accountAddress);
      const result = await provider.call({
        to: req.tokenAddress,
        data: callData,
      });

      const balance = decodeUint256(result as Hex);
      return {
        tokenAddress: req.tokenAddress,
        accountAddress: req.accountAddress,
        success: true,
        balance,
      };
    } catch {
      return {
        tokenAddress: req.tokenAddress,
        accountAddress: req.accountAddress,
        success: false,
        balance: undefined,
      };
    }
  }
}
