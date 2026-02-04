import type { Hex } from '@metamask/utils';

import {
  decodeAggregate3Response,
  encodeAggregate3,
  MulticallClient,
} from './MulticallClient';
import type { Address, BalanceOfRequest, ChainId, Provider } from '../types';

// =============================================================================
// MOCK PROVIDER
// =============================================================================

const createMockProvider = (): jest.Mocked<Provider> => ({
  call: jest.fn(),
  getBalance: jest.fn(),
});

// =============================================================================
// CONSTANTS
// =============================================================================

const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;
const TEST_ACCOUNT: Address =
  '0x1234567890123456789012345678901234567890' as Address;
const TEST_TOKEN_1: Address =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address; // USDC
const TEST_TOKEN_2: Address =
  '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address; // USDT

// Chain with Multicall3 support
const MAINNET_CHAIN_ID: ChainId = '0x1' as ChainId;
// Chain without Multicall3 support (made up)
const UNSUPPORTED_CHAIN_ID: ChainId = '0xfffff' as ChainId;

// =============================================================================
// MANUAL ABI ENCODING HELPERS FOR TESTS
// =============================================================================

function leftPad32(hexNo0x: string): string {
  return hexNo0x.padStart(64, '0');
}

function rightPad32Bytes(hexNo0x: string): string {
  const byteLen = Math.ceil(hexNo0x.length / 2);
  const paddedByteLen = Math.ceil(byteLen / 32) * 32;
  const paddedHexLen = paddedByteLen * 2;
  return hexNo0x.padEnd(paddedHexLen, '0');
}

function encodeUint256(value: bigint): string {
  return leftPad32(value.toString(16));
}

function encodeBool(value: boolean): string {
  return leftPad32(value ? '1' : '0');
}

/**
 * Build a mock aggregate3 response using manual ABI encoding.
 * Encodes (bool success, bytes returnData)[]
 *
 * @param results - Array of result objects with success flag and optional balance
 * @returns The encoded aggregate3 response as hex
 */
function buildMockAggregate3Response(
  results: { success: boolean; balance?: string }[],
): `0x${string}` {
  // First, encode each result's returnData (balance as uint256, or empty bytes)
  const encodedResults = results.map((result) => {
    let returnDataHex = '';
    if (result.balance !== undefined) {
      // uint256 is 32 bytes
      returnDataHex = encodeUint256(BigInt(result.balance));
    }
    return {
      success: result.success,
      returnDataHex,
    };
  });

  // ABI encoding for (bool, bytes)[]:
  // - Offset to array data (0x20 = 32)
  // - Array length
  // - Offsets to each tuple (relative to start of offsets area)
  // - Each tuple: bool, offset to bytes, bytes (length + data)

  const parts: string[] = [];

  // Word 0: offset to array (always 0x20 for single return value)
  parts.push(encodeUint256(32n));

  // At offset 32: array length
  parts.push(encodeUint256(BigInt(results.length)));

  // Calculate tuple offsets and build tuple data
  // Offsets area starts after length word
  // Each tuple offset is relative to the start of the offsets area

  // First, calculate the size of the offsets area
  const offsetsAreaSize = results.length * 32;

  // Build tuple data and collect offsets
  const tupleOffsets: bigint[] = [];
  const tupleDataParts: string[] = [];

  let currentOffset = offsetsAreaSize; // Start after all offsets

  for (const { success, returnDataHex } of encodedResults) {
    tupleOffsets.push(BigInt(currentOffset));

    // Tuple: bool (32 bytes) + offset to bytes (32 bytes) + bytes data
    const boolEncoded = encodeBool(success);

    // Offset to bytes within tuple is always 64 (after bool and offset words)
    const bytesOffsetInTuple = encodeUint256(64n);

    // Bytes encoding: length (32 bytes) + padded data
    const bytesLength = returnDataHex.length / 2;
    const bytesLengthEncoded = encodeUint256(BigInt(bytesLength));
    const bytesPadded = rightPad32Bytes(returnDataHex);

    const tupleData = `${boolEncoded}${bytesOffsetInTuple}${bytesLengthEncoded}${bytesPadded}`;
    tupleDataParts.push(tupleData);

    // Calculate size of this tuple: bool(32) + offset(32) + length(32) + padded data
    const tupleSize = 32 + 32 + 32 + bytesPadded.length / 2;
    currentOffset += tupleSize;
  }

  // Add tuple offsets
  for (const offset of tupleOffsets) {
    parts.push(encodeUint256(offset));
  }

  // Add tuple data
  for (const tupleData of tupleDataParts) {
    parts.push(tupleData);
  }

  return `0x${parts.join('')}`;
}

// =============================================================================
// TESTS
// =============================================================================

describe('MulticallClient', () => {
  let mockProvider: jest.Mocked<Provider>;
  let getProviderMock: jest.Mock;
  let client: MulticallClient;

  beforeEach(() => {
    mockProvider = createMockProvider();
    getProviderMock = jest.fn().mockReturnValue(mockProvider);
    client = new MulticallClient(getProviderMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const newClient = new MulticallClient(getProviderMock);
      expect(newClient).toBeDefined();
    });

    it('should create client with custom config', () => {
      const newClient = new MulticallClient(getProviderMock, {
        maxCallsPerBatch: 100,
        timeoutMs: 60000,
      });
      expect(newClient).toBeDefined();
    });

    it('should use default maxCallsPerBatch when 0 is passed', async () => {
      // This tests that passing maxCallsPerBatch: 0 doesn't cause an infinite loop
      // by verifying the client falls back to default (300) instead of using 0
      const zeroConfigClient = new MulticallClient(getProviderMock, {
        maxCallsPerBatch: 0,
      });

      const requests: BalanceOfRequest[] = [
        { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
      ];

      const mockResponse = buildMockAggregate3Response([
        { success: true, balance: '1000' },
      ]);
      mockProvider.call.mockResolvedValue(mockResponse);

      // If maxCallsPerBatch was 0, this would hang in an infinite loop
      const result = await zeroConfigClient.batchBalanceOf(
        MAINNET_CHAIN_ID,
        requests,
      );

      expect(result).toHaveLength(1);
      expect(result[0].balance).toBe('1000');
    });

    it('should use default timeoutMs when 0 is passed', () => {
      const zeroTimeoutClient = new MulticallClient(getProviderMock, {
        timeoutMs: 0,
      });
      expect(zeroTimeoutClient).toBeDefined();
    });

    it('should use default maxCallsPerBatch when negative value is passed', async () => {
      const negativeConfigClient = new MulticallClient(getProviderMock, {
        maxCallsPerBatch: -5,
      });

      const requests: BalanceOfRequest[] = [
        { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
      ];

      const mockResponse = buildMockAggregate3Response([
        { success: true, balance: '1000' },
      ]);
      mockProvider.call.mockResolvedValue(mockResponse);

      // If maxCallsPerBatch was negative, divideIntoBatches would throw
      const result = await negativeConfigClient.batchBalanceOf(
        MAINNET_CHAIN_ID,
        requests,
      );

      expect(result).toHaveLength(1);
      expect(result[0].balance).toBe('1000');
    });
  });

  describe('batchBalanceOf', () => {
    describe('with empty requests', () => {
      it('should return empty array', async () => {
        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, []);
        expect(result).toStrictEqual([]);
        expect(getProviderMock).not.toHaveBeenCalled();
      });
    });

    describe('with Multicall3 supported chain', () => {
      it('should fetch single ERC-20 balance', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        const mockResponse = buildMockAggregate3Response([
          { success: true, balance: '1000000000' }, // 1000 USDC (6 decimals)
        ]);

        mockProvider.call.mockResolvedValue(mockResponse);

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          tokenAddress: TEST_TOKEN_1,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '1000000000',
        });
      });

      it('should fetch multiple ERC-20 balances in single batch', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_2, accountAddress: TEST_ACCOUNT },
        ];

        const mockResponse = buildMockAggregate3Response([
          { success: true, balance: '1000000000' },
          { success: true, balance: '2000000000' },
        ]);

        mockProvider.call.mockResolvedValue(mockResponse);

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(2);
        expect(result[0].balance).toBe('1000000000');
        expect(result[1].balance).toBe('2000000000');
      });

      it('should fetch native token balance using getEthBalance', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: ZERO_ADDRESS, accountAddress: TEST_ACCOUNT },
        ];

        const mockResponse = buildMockAggregate3Response([
          { success: true, balance: '1000000000000000000' }, // 1 ETH
        ]);

        mockProvider.call.mockResolvedValue(mockResponse);

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          tokenAddress: ZERO_ADDRESS,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '1000000000000000000',
        });
      });

      it('should handle mixed native and ERC-20 tokens', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: ZERO_ADDRESS, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        const mockResponse = buildMockAggregate3Response([
          { success: true, balance: '1000000000000000000' },
          { success: true, balance: '500000000' },
        ]);

        mockProvider.call.mockResolvedValue(mockResponse);

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(2);
        expect(result[0].tokenAddress).toBe(ZERO_ADDRESS);
        expect(result[0].balance).toBe('1000000000000000000');
        expect(result[1].tokenAddress).toBe(TEST_TOKEN_1);
        expect(result[1].balance).toBe('500000000');
      });

      it('should handle failed individual calls in aggregate3', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_2, accountAddress: TEST_ACCOUNT },
        ];

        const mockResponse = buildMockAggregate3Response([
          { success: true, balance: '1000000000' },
          { success: false }, // Failed call
        ]);

        mockProvider.call.mockResolvedValue(mockResponse);

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(2);
        expect(result[0].success).toBe(true);
        expect(result[1].success).toBe(false);
      });

      it('should fall back to individual calls when aggregate3 response has mismatched result count', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_2, accountAddress: TEST_ACCOUNT },
        ];

        // Build a malformed response with only 1 result when we expect 2
        const malformedResponse = buildMockAggregate3Response([
          { success: true, balance: '1000000000' },
        ]);

        // First call returns malformed response (wrong count)
        mockProvider.call
          .mockResolvedValueOnce(malformedResponse)
          // Fallback individual calls succeed
          .mockResolvedValueOnce(
            '0x0000000000000000000000000000000000000000000000000000000000000064' as Hex,
          )
          .mockResolvedValueOnce(
            '0x00000000000000000000000000000000000000000000000000000000000000c8' as Hex,
          );

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(2);
        // Results come from fallback individual calls
        expect(result[0].success).toBe(true);
        expect(result[0].balance).toBe('100');
        expect(result[1].success).toBe(true);
        expect(result[1].balance).toBe('200');
      });

      it('should fall back to individual calls when aggregate3 fails', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        // First call (aggregate3) fails
        mockProvider.call
          .mockRejectedValueOnce(new Error('RPC error'))
          // Fallback individual call succeeds
          .mockResolvedValueOnce(
            '0x0000000000000000000000000000000000000000000000000000000000000064' as Hex, // 100
          );

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(1);
        expect(result[0].success).toBe(true);
        expect(result[0].balance).toBe('100');
      });

      it('should maintain 1:1 correspondence when aggregate3 fallback has mixed results', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_2, accountAddress: TEST_ACCOUNT },
          {
            tokenAddress:
              '0x0000000000000000000000000000000000000003' as Address,
            accountAddress: TEST_ACCOUNT,
          },
        ];

        // First call (aggregate3) fails
        mockProvider.call
          .mockRejectedValueOnce(new Error('aggregate3 RPC error'))
          // Fallback individual calls: first succeeds, second fails, third succeeds
          .mockResolvedValueOnce(
            '0x0000000000000000000000000000000000000000000000000000000000000064' as Hex,
          )
          .mockRejectedValueOnce(new Error('individual call failed'))
          .mockResolvedValueOnce(
            '0x00000000000000000000000000000000000000000000000000000000000000c8' as Hex,
          );

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        // Should have exactly 3 results (1:1 with input)
        expect(result).toHaveLength(3);
        expect(result[0]).toStrictEqual({
          tokenAddress: TEST_TOKEN_1,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '100',
        });
        expect(result[1]).toStrictEqual({
          tokenAddress: TEST_TOKEN_2,
          accountAddress: TEST_ACCOUNT,
          success: false,
        });
        expect(result[2]).toStrictEqual({
          tokenAddress: '0x0000000000000000000000000000000000000003' as Address,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '200',
        });
      });

      it('should handle zero balance', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        const mockResponse = buildMockAggregate3Response([
          { success: true, balance: '0' },
        ]);

        mockProvider.call.mockResolvedValue(mockResponse);

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(1);
        expect(result[0].balance).toBe('0');
      });

      it('should handle very large balances', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        // Max uint256
        const largeBalance =
          '115792089237316195423570985008687907853269984665640564039457584007913129639935';

        const mockResponse = buildMockAggregate3Response([
          { success: true, balance: largeBalance },
        ]);

        mockProvider.call.mockResolvedValue(mockResponse);

        const result = await client.batchBalanceOf(MAINNET_CHAIN_ID, requests);

        expect(result).toHaveLength(1);
        expect(result[0].balance).toBe(largeBalance);
      });
    });

    describe('without Multicall3 support (fallback)', () => {
      it('should fetch ERC-20 balance using individual call', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        mockProvider.call.mockResolvedValue(
          '0x0000000000000000000000000000000000000000000000000000000000000064' as Hex, // 100
        );

        const result = await client.batchBalanceOf(
          UNSUPPORTED_CHAIN_ID,
          requests,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          tokenAddress: TEST_TOKEN_1,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '100',
        });
      });

      it('should fetch native balance using getBalance', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: ZERO_ADDRESS, accountAddress: TEST_ACCOUNT },
        ];

        mockProvider.getBalance.mockResolvedValue(
          BigInt('1000000000000000000'),
        );

        const result = await client.batchBalanceOf(
          UNSUPPORTED_CHAIN_ID,
          requests,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          tokenAddress: ZERO_ADDRESS,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '1000000000000000000',
        });
        expect(mockProvider.getBalance).toHaveBeenCalledWith(TEST_ACCOUNT);
      });

      it('should handle empty return data (0x) from provider', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        // Provider returns empty data "0x" - some contracts may do this
        mockProvider.call.mockResolvedValue('0x' as Hex);

        const result = await client.batchBalanceOf(
          UNSUPPORTED_CHAIN_ID,
          requests,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          tokenAddress: TEST_TOKEN_1,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '0',
        });
      });

      it('should handle oversized return data from provider', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        // Provider returns data longer than 32 bytes (64 hex chars)
        // This tests the defensive code that truncates to first 32 bytes
        const oversizedData =
          '0x00000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000000' as Hex;

        mockProvider.call.mockResolvedValue(oversizedData);

        const result = await client.batchBalanceOf(
          UNSUPPORTED_CHAIN_ID,
          requests,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          tokenAddress: TEST_TOKEN_1,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '100', // First 32 bytes = 0x64 = 100
        });
      });

      it('should handle failed individual call', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
        ];

        mockProvider.call.mockRejectedValue(new Error('Call failed'));

        const result = await client.batchBalanceOf(
          UNSUPPORTED_CHAIN_ID,
          requests,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          tokenAddress: TEST_TOKEN_1,
          accountAddress: TEST_ACCOUNT,
          success: false,
        });
      });

      it('should handle multiple requests in parallel batches', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_2, accountAddress: TEST_ACCOUNT },
          { tokenAddress: ZERO_ADDRESS, accountAddress: TEST_ACCOUNT },
        ];

        mockProvider.call
          .mockResolvedValueOnce(
            '0x0000000000000000000000000000000000000000000000000000000000000064' as Hex,
          )
          .mockResolvedValueOnce(
            '0x00000000000000000000000000000000000000000000000000000000000000c8' as Hex,
          );
        mockProvider.getBalance.mockResolvedValue(
          BigInt('1000000000000000000'),
        );

        const result = await client.batchBalanceOf(
          UNSUPPORTED_CHAIN_ID,
          requests,
        );

        expect(result).toHaveLength(3);
        expect(result[0].balance).toBe('100');
        expect(result[1].balance).toBe('200');
        expect(result[2].balance).toBe('1000000000000000000');
      });

      it('should maintain 1:1 correspondence when some individual calls fail', async () => {
        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_2, accountAddress: TEST_ACCOUNT },
          {
            tokenAddress:
              '0x0000000000000000000000000000000000000003' as Address,
            accountAddress: TEST_ACCOUNT,
          },
        ];

        // First call succeeds, second fails, third succeeds
        mockProvider.call
          .mockResolvedValueOnce(
            '0x0000000000000000000000000000000000000000000000000000000000000064' as Hex,
          )
          .mockRejectedValueOnce(new Error('RPC error for second token'))
          .mockResolvedValueOnce(
            '0x00000000000000000000000000000000000000000000000000000000000000c8' as Hex,
          );

        const result = await client.batchBalanceOf(
          UNSUPPORTED_CHAIN_ID,
          requests,
        );

        // Should have exactly 3 results (1:1 with input)
        expect(result).toHaveLength(3);
        expect(result[0]).toStrictEqual({
          tokenAddress: TEST_TOKEN_1,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '100',
        });
        expect(result[1]).toStrictEqual({
          tokenAddress: TEST_TOKEN_2,
          accountAddress: TEST_ACCOUNT,
          success: false,
        });
        expect(result[2]).toStrictEqual({
          tokenAddress: '0x0000000000000000000000000000000000000003' as Address,
          accountAddress: TEST_ACCOUNT,
          success: true,
          balance: '200',
        });
      });
    });

    describe('batching behavior', () => {
      it('should respect maxCallsPerBatch config', async () => {
        const smallBatchClient = new MulticallClient(getProviderMock, {
          maxCallsPerBatch: 2,
        });

        const requests: BalanceOfRequest[] = [
          { tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT },
          { tokenAddress: TEST_TOKEN_2, accountAddress: TEST_ACCOUNT },
          {
            tokenAddress:
              '0x0000000000000000000000000000000000000001' as Address,
            accountAddress: TEST_ACCOUNT,
          },
        ];

        // First batch (2 calls)
        const mockResponse1 = buildMockAggregate3Response([
          { success: true, balance: '100' },
          { success: true, balance: '200' },
        ]);

        // Second batch (1 call)
        const mockResponse2 = buildMockAggregate3Response([
          { success: true, balance: '300' },
        ]);

        mockProvider.call
          .mockResolvedValueOnce(mockResponse1)
          .mockResolvedValueOnce(mockResponse2);

        const result = await smallBatchClient.batchBalanceOf(
          MAINNET_CHAIN_ID,
          requests,
        );

        expect(result).toHaveLength(3);
        expect(mockProvider.call).toHaveBeenCalledTimes(2);
      });
    });
  });
});

describe('encodeAggregate3', () => {
  it('should encode a valid aggregate3 call', () => {
    const calls = [
      {
        target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
        allowFailure: true,
        callData:
          '0x70a082310000000000000000000000001234567890123456789012345678901234567890' as Hex,
      },
    ];

    const result = encodeAggregate3(calls);

    expect(result).toMatch(/^0x82ad56cb/u); // starts with aggregate3 selector
    expect(typeof result).toBe('string');
  });

  it('should encode multiple calls', () => {
    const calls = [
      {
        target: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
        allowFailure: true,
        callData: '0x70a08231' as Hex,
      },
      {
        target: '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address,
        allowFailure: false,
        callData: '0x70a08231' as Hex,
      },
    ];

    const result = encodeAggregate3(calls);

    expect(result).toMatch(/^0x82ad56cb/u);
    expect(typeof result).toBe('string');
  });

  it('should encode with correct ABI structure including tuple offsets', () => {
    // Test with 2 calls to verify offset calculation
    const calls = [
      {
        target: '0x1111111111111111111111111111111111111111' as Address,
        allowFailure: true,
        callData: '0xabcd' as Hex, // 2 bytes of data
      },
      {
        target: '0x2222222222222222222222222222222222222222' as Address,
        allowFailure: false,
        callData: '0x1234' as Hex, // 2 bytes of data
      },
    ];

    const result = encodeAggregate3(calls);
    const hexNo0x = result.slice(2); // Remove 0x prefix

    // Helper to read a 32-byte word at a given byte offset
    const readWordAtByte = (byteOffset: number): string => {
      const start = byteOffset * 2;
      return hexNo0x.slice(start, start + 64);
    };

    // Word at byte 0: selector (4 bytes) - skip for structure validation
    // After selector (byte 4): offset to array (should be 0x20 = 32)
    const arrayOffset = BigInt(`0x${readWordAtByte(4)}`);
    expect(arrayOffset).toBe(32n);

    // At byte 4 + 32 = 36: array length (should be 2)
    const arrayLength = BigInt(`0x${readWordAtByte(36)}`);
    expect(arrayLength).toBe(2n);

    // At byte 36 + 32 = 68: first tuple offset (relative to offsets area start)
    // Offsets area is 2 * 32 = 64 bytes, so first tuple is at offset 64
    const tuple0Offset = BigInt(`0x${readWordAtByte(68)}`);
    expect(tuple0Offset).toBe(64n); // 2 offsets * 32 bytes each

    // At byte 68 + 32 = 100: second tuple offset
    // First tuple size: target(32) + allowFailure(32) + bytesOffset(32) + bytesLen(32) + bytesPadded(32) = 160
    const tuple1Offset = BigInt(`0x${readWordAtByte(100)}`);
    expect(tuple1Offset).toBe(64n + 160n); // 224

    // Verify first tuple at correct position
    // Tuple 0 starts at: offsetsAreaStart + tuple0Offset = 68 + 64 = 132
    const tuple0Start = 132;

    // First word of tuple 0: target address (padded to 32 bytes)
    const tuple0Target = readWordAtByte(tuple0Start);
    expect(tuple0Target.toLowerCase()).toBe(
      '0000000000000000000000001111111111111111111111111111111111111111',
    );

    // Second word: allowFailure (should be 1 for true)
    const tuple0AllowFailure = BigInt(`0x${readWordAtByte(tuple0Start + 32)}`);
    expect(tuple0AllowFailure).toBe(1n);

    // Third word: offset to bytes (always 0x60 = 96)
    const tuple0BytesOffset = BigInt(`0x${readWordAtByte(tuple0Start + 64)}`);
    expect(tuple0BytesOffset).toBe(96n);
  });
});

describe('decodeAggregate3Response', () => {
  it('should decode response with viem-encoded data', () => {
    const mockResponse = buildMockAggregate3Response([
      { success: true, balance: '1000000000' },
    ]);

    const result = decodeAggregate3Response(mockResponse, 1);

    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(true);
    // returnData should be the ABI-encoded uint256
    expect(result[0].returnData).toMatch(/^0x/u);
  });

  it('should decode multiple results', () => {
    const mockResponse = buildMockAggregate3Response([
      { success: true, balance: '100' },
      { success: false },
      { success: true, balance: '300' },
    ]);

    const result = decodeAggregate3Response(mockResponse, 3);

    expect(result).toHaveLength(3);
    expect(result[0].success).toBe(true);
    expect(result[1].success).toBe(false);
    expect(result[2].success).toBe(true);
  });

  it('should throw when result count does not match', () => {
    const mockResponse = buildMockAggregate3Response([
      { success: true, balance: '100' },
    ]);

    expect(() => decodeAggregate3Response(mockResponse, 2)).toThrow(
      'Expected 2 results, got 1',
    );
  });
});
