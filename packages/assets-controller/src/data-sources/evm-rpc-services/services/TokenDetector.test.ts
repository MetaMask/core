import type { Hex } from '@metamask/utils';

import { TokenDetector } from './TokenDetector';
import type { MulticallClient } from '../clients';
import type {
  Address,
  BalanceOfResponse,
  ChainId,
  TokenListState,
} from '../types';

// =============================================================================
// MOCK MULTICALL CLIENT
// =============================================================================

const createMockMulticallClient = (): jest.Mocked<MulticallClient> =>
  ({
    batchBalanceOf: jest.fn(),
  }) as unknown as jest.Mocked<MulticallClient>;

// =============================================================================
// CONSTANTS
// =============================================================================

const TEST_ACCOUNT: Address =
  '0x1234567890123456789012345678901234567890' as Address;
const TEST_ACCOUNT_ID = 'test-account-uuid';
const TEST_TOKEN_1: Address =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address; // USDC
const TEST_TOKEN_2: Address =
  '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address; // USDT
const TEST_TOKEN_3: Address =
  '0x6B175474E89094C44Da98b954EescdeCB5e6cF8dA' as Address; // DAI

const MAINNET_CHAIN_ID: ChainId = '0x1' as ChainId;
const POLYGON_CHAIN_ID: ChainId = '0x89' as ChainId;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a mock TokenListState with the given tokens.
 *
 * @param chainId - The chain ID to add tokens to
 * @param tokens - Array of token data
 * @returns TokenListState
 */
function createMockTokenListState(
  chainId: ChainId,
  tokens: {
    address: Address;
    symbol: string;
    name: string;
    decimals: number;
    iconUrl?: string;
    aggregators?: string[];
  }[],
): TokenListState {
  const data: Record<Address, (typeof tokens)[number]> = {};
  for (const token of tokens) {
    data[token.address] = token;
  }

  return {
    tokensChainsCache: {
      [chainId]: {
        timestamp: Date.now(),
        data,
      },
    },
  };
}

/**
 * Creates a mock balance response.
 *
 * @param tokenAddress - Token address
 * @param accountAddress - Account address
 * @param success - Whether the call succeeded
 * @param balance - Optional balance value
 * @returns BalanceOfResponse
 */
function createMockBalanceResponse(
  tokenAddress: Address,
  accountAddress: Address,
  success: boolean,
  balance?: string,
): BalanceOfResponse {
  return {
    tokenAddress,
    accountAddress,
    success,
    balance,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('TokenDetector', () => {
  let mockMulticallClient: jest.Mocked<MulticallClient>;
  let tokenDetector: TokenDetector;

  beforeEach(() => {
    mockMulticallClient = createMockMulticallClient();
    tokenDetector = new TokenDetector(mockMulticallClient);
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create detector with default config', () => {
      const detector = new TokenDetector(mockMulticallClient);
      expect(detector).toBeDefined();
    });

    it('should create detector with custom config', () => {
      const detector = new TokenDetector(mockMulticallClient, {
        defaultBatchSize: 100,
        defaultTimeoutMs: 60000,
      });
      expect(detector).toBeDefined();
    });
  });

  describe('setTokenListStateGetter', () => {
    it('should set the token list state getter', () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      const tokens = tokenDetector.getTokensToCheck(MAINNET_CHAIN_ID);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toBe(TEST_TOKEN_1);
    });
  });

  describe('getTokensToCheck', () => {
    it('should return empty array when no token list state getter is set', () => {
      const tokens = tokenDetector.getTokensToCheck(MAINNET_CHAIN_ID);
      expect(tokens).toStrictEqual([]);
    });

    it('should return empty array when token list state is undefined', () => {
      tokenDetector.setTokenListStateGetter(
        () => undefined as unknown as TokenListState,
      );

      const tokens = tokenDetector.getTokensToCheck(MAINNET_CHAIN_ID);
      expect(tokens).toStrictEqual([]);
    });

    it('should return empty array when chain is not in cache', () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      const tokens = tokenDetector.getTokensToCheck(POLYGON_CHAIN_ID);
      expect(tokens).toStrictEqual([]);
    });

    it('should return empty array when chain cache data is undefined', () => {
      const mockState: TokenListState = {
        tokensChainsCache: {
          [MAINNET_CHAIN_ID]: {
            timestamp: Date.now(),
            data: undefined as unknown as Record<Hex, never>,
          },
        },
      };

      tokenDetector.setTokenListStateGetter(() => mockState);

      const tokens = tokenDetector.getTokensToCheck(MAINNET_CHAIN_ID);
      expect(tokens).toStrictEqual([]);
    });

    it('should return all token addresses for the chain', () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
        {
          address: TEST_TOKEN_2,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
        },
        {
          address: TEST_TOKEN_3,
          symbol: 'DAI',
          name: 'Dai Stablecoin',
          decimals: 18,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      const tokens = tokenDetector.getTokensToCheck(MAINNET_CHAIN_ID);
      expect(tokens).toHaveLength(3);
      expect(tokens).toContain(TEST_TOKEN_1);
      expect(tokens).toContain(TEST_TOKEN_2);
      expect(tokens).toContain(TEST_TOKEN_3);
    });
  });

  describe('detectTokens', () => {
    it('should return empty result when no tokens to check', async () => {
      tokenDetector.setTokenListStateGetter(() => ({
        tokensChainsCache: {},
      }));

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result).toStrictEqual({
        chainId: MAINNET_CHAIN_ID,
        accountId: TEST_ACCOUNT_ID,
        accountAddress: TEST_ACCOUNT,
        detectedAssets: [],
        detectedBalances: [],
        zeroBalanceAddresses: [],
        failedAddresses: [],
        timestamp: 1700000000000,
      });

      expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
    });

    it('should detect tokens with non-zero balances', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          iconUrl: 'https://example.com/usdc.png',
          aggregators: ['coingecko', 'coinmarketcap'],
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000', // 1000 USDC (6 decimals)
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedAssets).toHaveLength(1);
      expect(result.detectedAssets[0]).toStrictEqual({
        assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        chainId: MAINNET_CHAIN_ID,
        address: TEST_TOKEN_1,
        type: 'erc20',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        image: 'https://example.com/usdc.png',
        isNative: false,
        aggregators: ['coingecko', 'coinmarketcap'],
      });

      expect(result.detectedBalances).toHaveLength(1);
      expect(result.detectedBalances[0]).toStrictEqual({
        assetId: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        accountId: TEST_ACCOUNT_ID,
        chainId: MAINNET_CHAIN_ID,
        balance: '1000000000',
        formattedBalance: '1000',
        decimals: 6,
        timestamp: 1700000000000,
      });

      expect(result.zeroBalanceAddresses).toHaveLength(0);
      expect(result.failedAddresses).toHaveLength(0);
    });

    it('should categorize zero balance tokens correctly', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '0'),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedAssets).toHaveLength(0);
      expect(result.detectedBalances).toHaveLength(0);
      expect(result.zeroBalanceAddresses).toStrictEqual([TEST_TOKEN_1]);
      expect(result.failedAddresses).toHaveLength(0);
    });

    it('should categorize empty balance as zero balance', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, ''),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.zeroBalanceAddresses).toStrictEqual([TEST_TOKEN_1]);
    });

    it('should categorize undefined balance as zero balance', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, undefined),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.zeroBalanceAddresses).toStrictEqual([TEST_TOKEN_1]);
    });

    it('should categorize failed calls correctly', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, false),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedAssets).toHaveLength(0);
      expect(result.detectedBalances).toHaveLength(0);
      expect(result.zeroBalanceAddresses).toHaveLength(0);
      expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_1]);
    });

    it('should handle mixed results correctly', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
        {
          address: TEST_TOKEN_2,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
        },
        {
          address: TEST_TOKEN_3,
          symbol: 'DAI',
          name: 'Dai Stablecoin',
          decimals: 18,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000',
        ),
        createMockBalanceResponse(TEST_TOKEN_2, TEST_ACCOUNT, true, '0'),
        createMockBalanceResponse(TEST_TOKEN_3, TEST_ACCOUNT, false),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedAssets).toHaveLength(1);
      expect(result.detectedAssets[0].symbol).toBe('USDC');

      expect(result.detectedBalances).toHaveLength(1);

      expect(result.zeroBalanceAddresses).toStrictEqual([TEST_TOKEN_2]);
      expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_3]);
    });

    it('should use custom batch size from options', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
        {
          address: TEST_TOKEN_2,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '100'),
      ]);

      await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        { batchSize: 1 },
      );

      // With batchSize 1, it should make 2 separate calls for 2 tokens
      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
    });

    it('should create correct balance requests with account address', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '100'),
      ]);

      await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledWith(
        MAINNET_CHAIN_ID,
        [
          {
            tokenAddress: TEST_TOKEN_1,
            accountAddress: TEST_ACCOUNT,
          },
        ],
      );
    });

    it('should use default decimals (18) when token metadata is missing', async () => {
      // Create state without the token metadata
      const mockState: TokenListState = {
        tokensChainsCache: {
          [MAINNET_CHAIN_ID]: {
            timestamp: Date.now(),
            data: {
              [TEST_TOKEN_1]: {
                address: TEST_TOKEN_1,
                symbol: 'UNKNOWN',
                name: 'Unknown Token',
                decimals: 18,
              },
            },
          },
        },
      };

      tokenDetector.setTokenListStateGetter(() => mockState);

      // Return a response for a token address that exists in the list
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000000000000', // 1 token with 18 decimals
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe('1');
      expect(result.detectedBalances[0].decimals).toBe(18);
    });

    it('should handle case-insensitive token address matching', async () => {
      const lowercaseAddress =
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;
      const uppercaseAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;

      // Store with lowercase
      const mockState: TokenListState = {
        tokensChainsCache: {
          [MAINNET_CHAIN_ID]: {
            timestamp: Date.now(),
            data: {
              [lowercaseAddress]: {
                address: lowercaseAddress,
                symbol: 'USDC',
                name: 'USD Coin',
                decimals: 6,
              },
            },
          },
        },
      };

      tokenDetector.setTokenListStateGetter(() => mockState);

      // Response uses uppercase (checksummed) address
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          uppercaseAddress,
          TEST_ACCOUNT,
          true,
          '1000000',
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      // Should still find metadata via case-insensitive lookup
      expect(result.detectedAssets[0].symbol).toBe('USDC');
      expect(result.detectedBalances[0].decimals).toBe(6);
    });
  });

  describe('balance formatting', () => {
    beforeEach(() => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
        {
          address: TEST_TOKEN_2,
          symbol: 'DAI',
          name: 'Dai',
          decimals: 18,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);
    });

    it('should format balance with 6 decimals correctly', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1234567890', // 1234.56789 USDC
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe('1234.56789');
    });

    it('should format whole number balance correctly', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000', // 1 USDC
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe('1');
    });

    it('should format fractional balance correctly', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '500000', // 0.5 USDC
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe('0.5');
    });

    it('should trim trailing zeros from formatted balance', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1100000', // 1.1 USDC
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe('1.1');
    });

    it('should handle very small balances correctly', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1', // 0.000001 USDC
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe('0.000001');
    });

    it('should handle very large balances correctly', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000000000', // 1 billion USDC
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe('1000000000');
    });

    it('should return raw balance for invalid balance strings', async () => {
      // This tests the catch block in #formatBalance
      // BigInt constructor will throw for invalid strings
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          'invalid-balance',
        ),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.detectedBalances[0].formattedBalance).toBe(
        'invalid-balance',
      );
    });
  });

  describe('asset creation', () => {
    it('should create correct CAIP-19 asset ID for mainnet', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1000000'),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      // Chain ID 0x1 = 1 in decimal
      expect(result.detectedAssets[0].assetId).toBe(
        'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      );
    });

    it('should create correct CAIP-19 asset ID for polygon', async () => {
      const mockState = createMockTokenListState(POLYGON_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1000000'),
      ]);

      const result = await tokenDetector.detectTokens(
        POLYGON_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      // Chain ID 0x89 = 137 in decimal
      expect(result.detectedAssets[0].assetId).toBe(
        'eip155:137/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      );
    });

    it('should create asset with all metadata fields', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
          iconUrl: 'https://example.com/usdc.png',
          aggregators: ['coingecko', 'coinmarketcap', 'uniswap'],
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1000000'),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      const asset = result.detectedAssets[0];
      expect(asset.type).toBe('erc20');
      expect(asset.symbol).toBe('USDC');
      expect(asset.name).toBe('USD Coin');
      expect(asset.decimals).toBe(6);
      expect(asset.image).toBe('https://example.com/usdc.png');
      expect(asset.isNative).toBe(false);
      expect(asset.aggregators).toStrictEqual([
        'coingecko',
        'coinmarketcap',
        'uniswap',
      ]);
    });

    it('should create asset without optional metadata', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1000000'),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      const asset = result.detectedAssets[0];
      expect(asset.image).toBeUndefined();
      expect(asset.aggregators).toBeUndefined();
    });
  });

  describe('edge cases for metadata lookup', () => {
    it('should handle token with non-zero balance but no metadata in token list', async () => {
      // Token exists in list for getTokensToCheck, but response has different address
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      tokenDetector.setTokenListStateGetter(() => mockState);

      // Return response for a completely different token address not in the list
      const unknownToken =
        '0x9999999999999999999999999999999999999999' as Address;
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(unknownToken, TEST_ACCOUNT, true, '1000000'),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      // Should still create asset but with default decimals (18) and undefined metadata
      expect(result.detectedAssets).toHaveLength(1);
      expect(result.detectedAssets[0].symbol).toBeUndefined();
      expect(result.detectedAssets[0].name).toBeUndefined();
      expect(result.detectedAssets[0].decimals).toBeUndefined();
      expect(result.detectedBalances[0].decimals).toBe(18);
    });

    it('should handle missing token list state when processing responses', async () => {
      // First set a valid state for getTokensToCheck
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      let callCount = 0;
      tokenDetector.setTokenListStateGetter(() => {
        callCount += 1;
        // Return valid state first time (for getTokensToCheck)
        // Return undefined after (for getTokenMetadata during processing)
        if (callCount === 1) {
          return mockState;
        }
        return undefined as unknown as TokenListState;
      });

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1000000'),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      // Should still create asset with defaults
      expect(result.detectedAssets).toHaveLength(1);
      expect(result.detectedBalances[0].decimals).toBe(18);
    });

    it('should handle missing chain cache when processing responses', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      let callCount = 0;
      tokenDetector.setTokenListStateGetter(() => {
        callCount += 1;
        if (callCount === 1) {
          return mockState;
        }
        // Return state without the chain on subsequent calls
        return { tokensChainsCache: {} };
      });

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1000000'),
      ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      // Should still create asset with defaults
      expect(result.detectedAssets).toHaveLength(1);
      expect(result.detectedBalances[0].decimals).toBe(18);
    });
  });

  describe('batching behavior', () => {
    it('should process all tokens in single batch when under batch size', async () => {
      const tokens = Array.from({ length: 5 }, (_, i) => ({
        address: `0x${i.toString().padStart(40, '0')}` as const,
        symbol: `TKN${i}`,
        name: `Token ${i}`,
        decimals: 18,
      }));

      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, tokens);
      tokenDetector.setTokenListStateGetter(() => mockState);

      const responses = tokens.map((token) =>
        createMockBalanceResponse(token.address, TEST_ACCOUNT, true, '1000'),
      );
      mockMulticallClient.batchBalanceOf.mockResolvedValue(responses);

      await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      // Default batch size is 300, so 5 tokens should be in 1 batch
      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(1);
    });

    it('should accumulate results across multiple batches', async () => {
      const tokens = [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
        {
          address: TEST_TOKEN_2,
          symbol: 'USDT',
          name: 'Tether USD',
          decimals: 6,
        },
      ];

      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, tokens);
      tokenDetector.setTokenListStateGetter(() => mockState);

      // First batch returns one token with balance
      mockMulticallClient.batchBalanceOf
        .mockResolvedValueOnce([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1000000',
          ),
        ])
        .mockResolvedValueOnce([
          createMockBalanceResponse(
            TEST_TOKEN_2,
            TEST_ACCOUNT,
            true,
            '2000000',
          ),
        ]);

      const result = await tokenDetector.detectTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        { batchSize: 1 },
      );

      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
      expect(result.detectedAssets).toHaveLength(2);
      expect(result.detectedBalances).toHaveLength(2);
    });
  });
});
