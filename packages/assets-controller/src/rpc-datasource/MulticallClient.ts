import type { Hex } from '@metamask/utils';

import type {
  IMulticallClient,
  MulticallRequest,
  MulticallResponse,
  BalanceOfRequest,
  BalanceOfResponse,
} from './interfaces';
import type { Address, ChainId } from './types';
import { reduceInBatchesSerially } from './utils';

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

/**
 * ERC20 balanceOf function selector: keccak256("balanceOf(address)")[0:4]
 */
const BALANCE_OF_SELECTOR = '0x70a08231';

/**
 * Multicall3 aggregate3 function selector
 */
const AGGREGATE3_SELECTOR = '0x82ad56cb';

// =============================================================================
// ENCODING/DECODING UTILITIES
// =============================================================================

/**
 * Pad an address to 32 bytes (left-padded with zeros).
 *
 * @param address - The address to pad.
 * @returns The padded address as hex string (without 0x prefix).
 */
function padAddress(address: Address): string {
  return address.slice(2).toLowerCase().padStart(64, '0');
}

/**
 * Encode a balanceOf(address) call.
 *
 * @param accountAddress - The account address to check balance for.
 * @returns The encoded call data.
 */
function encodeBalanceOf(accountAddress: Address): Hex {
  return `${BALANCE_OF_SELECTOR}${padAddress(accountAddress)}` as Hex;
}

// encodeGetEthBalance removed - using provider.getBalance directly

/**
 * Encode aggregate3 call data (without function selector).
 *
 * aggregate3 signature: aggregate3((address target, bool allowFailure, bytes callData)[])
 *
 * @param calls - Array of calls to encode.
 * @returns The encoded call data (without function selector).
 */
function encodeAggregate3(calls: MulticallRequest[]): `0x${string}` {
  // Simplified encoding using proper ABI format
  // We need to encode: tuple(address,bool,bytes)[]

  const arrayLength = calls.length;

  // Start building the encoded data
  let encoded = '';

  // 1. Offset to array data (always 0x20 = 32 for single dynamic param)
  encoded += '0000000000000000000000000000000000000000000000000000000000000020';

  // 2. Array length
  encoded += arrayLength.toString(16).padStart(64, '0');

  // 3. Calculate offsets for each tuple
  // Each offset points to the start of that tuple's encoding (relative to array data start)
  const tupleOffsets: number[] = [];
  let currentOffset = arrayLength * 32; // Offsets take arrayLength * 32 bytes

  for (const call of calls) {
    tupleOffsets.push(currentOffset);
    // Tuple encoding: target (32) + allowFailure (32) + offset to callData (32) + callData length (32) + padded callData
    const callDataLen = (call.callData.length - 2) / 2;
    const paddedLen = Math.ceil(callDataLen / 32) * 32;
    currentOffset += 32 + 32 + 32 + 32 + paddedLen;
  }

  // 4. Write tuple offsets
  for (const offset of tupleOffsets) {
    encoded += offset.toString(16).padStart(64, '0');
  }

  // 5. Write each tuple
  for (const call of calls) {
    // target (address padded to 32 bytes)
    encoded += padAddress(call.target);

    // allowFailure (bool)
    if (call.allowFailure) {
      encoded +=
        '0000000000000000000000000000000000000000000000000000000000000001';
    } else {
      encoded +=
        '0000000000000000000000000000000000000000000000000000000000000000';
    }

    // offset to callData within this tuple (always 0x60 = 96)
    encoded +=
      '0000000000000000000000000000000000000000000000000000000000000060';

    // callData length
    const callDataLen = (call.callData.length - 2) / 2;
    encoded += callDataLen.toString(16).padStart(64, '0');

    // callData (padded to 32 bytes)
    const callDataHex = call.callData.slice(2);
    const paddedLen = Math.ceil(callDataLen / 32) * 32;
    encoded += callDataHex.padEnd(paddedLen * 2, '0');
  }

  return `0x${encoded}`;
}

/**
 * Decode aggregate3 response.
 *
 * aggregate3 returns: (bool success, bytes returnData)[]
 *
 * @param data - The raw response data.
 * @param numCalls - The number of calls made.
 * @returns Array of decoded responses.
 */
function decodeAggregate3Response(
  data: string,
  numCalls: number,
): MulticallResponse[] {
  const results: MulticallResponse[] = [];

  // Remove 0x prefix
  const hexData = data.startsWith('0x') ? data.slice(2) : data;

  console.log(
    '[MulticallClient] Decoding response, hex length:',
    hexData.length,
  );

  // Response format:
  // - Offset to array (32 bytes) = 0x20
  // - Array length (32 bytes)
  // - Array of offsets to each tuple (length * 32 bytes)
  // - Each tuple: success (32 bytes) + offset to returnData (32 bytes) + returnData length (32 bytes) + returnData

  // Read array offset (should be 0x20 = 32)
  const arrayOffset = parseInt(hexData.slice(0, 64), 16);
  console.log('[MulticallClient] Array offset:', arrayOffset);

  // Read array length at the offset position
  const arrayLengthPos = arrayOffset * 2;
  const arrayLength = parseInt(
    hexData.slice(arrayLengthPos, arrayLengthPos + 64),
    16,
  );
  console.log(
    '[MulticallClient] Array length:',
    arrayLength,
    'expected:',
    numCalls,
  );

  if (arrayLength !== numCalls) {
    console.error('[MulticallClient] Mismatch in result count');
    throw new Error(
      `Expected ${numCalls} results but got ${arrayLength} in aggregate3 response`,
    );
  }

  // Read element offsets
  const offsetsStart = arrayLengthPos + 64;
  const elementOffsets: number[] = [];
  for (let i = 0; i < arrayLength; i++) {
    const offset = parseInt(
      hexData.slice(offsetsStart + i * 64, offsetsStart + (i + 1) * 64),
      16,
    );
    elementOffsets.push(offset);
  }

  // Parse each result tuple
  // Result struct: { bool success; bytes returnData; }
  const arrayDataStart = arrayLengthPos; // Offsets are relative to start of array data
  for (let i = 0; i < arrayLength; i++) {
    const tupleStart = arrayDataStart + elementOffsets[i] * 2;

    // Read success (bool as uint256)
    const successValue = parseInt(
      hexData.slice(tupleStart, tupleStart + 64),
      16,
    );
    const success = successValue !== 0;

    // Read returnData offset within tuple (relative to tuple start)
    const returnDataOffset = parseInt(
      hexData.slice(tupleStart + 64, tupleStart + 128),
      16,
    );

    // Read returnData at the offset
    const returnDataLengthPos = tupleStart + returnDataOffset * 2;
    const returnDataLength = parseInt(
      hexData.slice(returnDataLengthPos, returnDataLengthPos + 64),
      16,
    );

    // Read returnData bytes
    const returnDataStart = returnDataLengthPos + 64;
    const returnData =
      returnDataLength > 0
        ? `0x${hexData.slice(returnDataStart, returnDataStart + returnDataLength * 2)}`
        : '0x';

    // Log first few results for debugging
    if (i < 3) {
      console.log(`[MulticallClient] Result ${i}:`, {
        tupleStart,
        success,
        returnDataOffset,
        returnDataLengthPos,
        returnDataLength,
        returnDataStart,
        returnData: `${returnData.slice(0, 70)}...`,
      });
    }

    results.push({ success, returnData: returnData as Hex });
  }

  console.log('[MulticallClient] Decoded', results.length, 'results');
  if (results.length > 0) {
    console.log('[MulticallClient] First result:', results[0]);
  }

  return results;
}

/**
 * Decode a uint256 from hex string.
 *
 * @param data - The hex data to decode.
 * @returns The decoded value as string.
 */
function decodeUint256(data: Hex): string {
  const hexData = data.startsWith('0x') ? data.slice(2) : data;
  if (hexData.length === 0) {
    return '0';
  }

  // A proper uint256 should be exactly 64 hex chars (32 bytes)
  // If it's longer, something is wrong
  console.log('[decodeUint256] input:', data, 'hex length:', hexData.length);

  // For balanceOf, returnData should be exactly 32 bytes (64 hex chars)
  // Take only the first 64 chars if longer
  const normalizedHex = hexData.length > 64 ? hexData.slice(0, 64) : hexData;

  // Parse as BigInt to handle large numbers
  const result = BigInt(`0x${normalizedHex}`).toString();
  console.log('[decodeUint256] result:', result);
  return result;
}

// =============================================================================
// MULTICALL CLIENT
// =============================================================================

/**
 * MulticallClient configuration.
 */
export type MulticallClientConfig = {
  /** Maximum calls per batch (default: 300) */
  maxCallsPerBatch?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
};

/**
 * Provider interface (subset of ethers Web3Provider).
 */
export type Provider = {
  call(transaction: { to: string; data: string }): Promise<string>;
  getBalance(address: string): Promise<{ toString(): string }>;
};

/**
 * Function to get provider for a chain.
 */
export type GetProviderFunction = (chainId: ChainId) => Provider;

/**
 * MulticallClient - Multicall3 wrapper for batching contract calls.
 *
 * Provides efficient batching of ERC20 balanceOf calls and other
 * read operations using the Multicall3 aggregate3 function.
 */
export class MulticallClient implements IMulticallClient {
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

  /**
   * Check if Multicall3 is supported on this chain.
   *
   * @param chainId - Chain ID to check.
   * @returns True if Multicall3 is available.
   */
  isSupported(chainId: ChainId): boolean {
    return chainId in MULTICALL3_ADDRESS_BY_CHAIN;
  }

  /**
   * Get the Multicall3 contract address for a chain.
   *
   * @param chainId - Chain ID.
   * @returns Contract address or undefined if not supported.
   */
  getContractAddress(chainId: ChainId): Address | undefined {
    return MULTICALL3_ADDRESS_BY_CHAIN[chainId];
  }

  /**
   * Execute a batch of calls using aggregate3.
   *
   * @param chainId - Chain ID to execute on.
   * @param calls - Array of calls to execute.
   * @returns Array of results.
   */
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

    // Process in batches
    for (let i = 0; i < calls.length; i += this.#config.maxCallsPerBatch) {
      const batch = calls.slice(i, i + this.#config.maxCallsPerBatch);
      const callData = encodeAggregate3(batch);

      const result = await provider.call({
        to: multicallAddress,
        data: `${AGGREGATE3_SELECTOR}${callData.slice(2)}` as Hex,
      });

      console.log(
        '[MulticallClient] aggregate3 call result length:',
        result.length,
      );

      const decoded = decodeAggregate3Response(result, batch.length);
      allResults.push(...decoded);
    }

    return allResults;
  }

  /**
   * Batch fetch ERC20 balances for multiple token/account pairs.
   * For native token (zero address), uses getBalance.
   *
   * NOTE: Using individual calls instead of Multicall3 aggregate3
   * because the hand-rolled ABI encoding is broken.
   *
   * @param chainId - Chain ID.
   * @param requests - Array of balance requests.
   * @returns Array of balance responses.
   */
  async batchBalanceOf(
    chainId: ChainId,
    requests: BalanceOfRequest[],
  ): Promise<BalanceOfResponse[]> {
    if (requests.length === 0) {
      return [];
    }

    console.log(
      '[MulticallClient] batchBalanceOf called with',
      requests.length,
      'requests',
    );

    // Use individual calls (fallback) for now
    // TODO: Fix Multicall3 aggregate3 encoding/decoding
    const provider = this.#getProvider(chainId);
    const batchSize = this.#config.maxCallsPerBatch;

    // Process in batches serially, with parallel calls within each batch
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

    // Log summary
    const successCount = responses.filter((resp) => resp.success).length;
    const nonZeroCount = responses.filter(
      (resp) => resp.success && resp.balance && resp.balance !== '0',
    ).length;
    console.log(
      `[MulticallClient] batchBalanceOf complete: ${successCount}/${responses.length} success, ${nonZeroCount} non-zero`,
    );

    return responses;
  }

  /**
   * Batch fetch native token balances for multiple accounts.
   *
   * @param chainId - Chain ID.
   * @param accounts - Array of account addresses.
   * @returns Map of account address to balance.
   */
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

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Fetch balance for a single token/account pair.
   *
   * @param provider - Ethereum provider with getBalance and call methods.
   * @param req - Balance request.
   * @returns Balance response.
   */
  async #fetchSingleBalance(
    provider: Provider,
    req: BalanceOfRequest,
  ): Promise<BalanceOfResponse> {
    try {
      if (req.tokenAddress === ZERO_ADDRESS) {
        // Native balance
        const balance = await provider.getBalance(req.accountAddress);
        return {
          tokenAddress: req.tokenAddress,
          accountAddress: req.accountAddress,
          success: true,
          balance: balance.toString(),
        };
      }

      // ERC20 balance
      const callData = encodeBalanceOf(req.accountAddress);
      const result = await provider.call({
        to: req.tokenAddress,
        data: callData,
      });

      // Decode uint256 from result
      const balance = decodeUint256(result as Hex);
      return {
        tokenAddress: req.tokenAddress,
        accountAddress: req.accountAddress,
        success: true,
        balance,
      };
    } catch (error) {
      console.log(
        '[MulticallClient] Balance call failed for',
        req.tokenAddress,
        error,
      );
      return {
        tokenAddress: req.tokenAddress,
        accountAddress: req.accountAddress,
        success: false,
        balance: undefined,
      };
    }
  }
}
