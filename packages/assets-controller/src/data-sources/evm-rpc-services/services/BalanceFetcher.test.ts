import { BalanceFetcher } from './BalanceFetcher';
import type { MulticallClient } from '../clients';
import type {
  Address,
  BalanceOfResponse,
  ChainId,
  UserTokensState,
} from '../types';

const createMockMulticallClient = (): jest.Mocked<MulticallClient> =>
  ({
    batchBalanceOf: jest.fn(),
  }) as unknown as jest.Mocked<MulticallClient>;

const TEST_ACCOUNT: Address =
  '0x1234567890123456789012345678901234567890' as Address;
const TEST_ACCOUNT_ID = 'test-account-uuid';
const TEST_TOKEN_1: Address =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address; // USDC
const TEST_TOKEN_2: Address =
  '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address; // USDT
const TEST_TOKEN_3: Address =
  '0x6B175474E89094C44Da98b954EescdeCB5e6cF8dA' as Address; // DAI
const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

const MAINNET_CHAIN_ID: ChainId = '0x1' as ChainId;
const POLYGON_CHAIN_ID: ChainId = '0x89' as ChainId;

/**
 * Creates a mock UserTokensState with the given tokens.
 *
 * @param chainId - The chain ID
 * @param accountAddress - The account address
 * @param importedTokens - Array of imported tokens
 * @param detectedTokens - Array of detected tokens
 * @returns UserTokensState
 */
function createMockUserTokensState(
  chainId: ChainId,
  accountAddress: Address,
  importedTokens: {
    address: Address;
    symbol: string;
    decimals: number;
    name?: string;
  }[] = [],
  detectedTokens: {
    address: Address;
    symbol: string;
    decimals: number;
    name?: string;
  }[] = [],
): UserTokensState {
  const importedMap: Record<Address, (typeof importedTokens)[number][]> = {};
  if (importedTokens.length > 0) {
    importedMap[accountAddress] = importedTokens;
  }

  const detectedMap: Record<Address, (typeof detectedTokens)[number][]> = {};
  if (detectedTokens.length > 0) {
    detectedMap[accountAddress] = detectedTokens;
  }

  return {
    allTokens: {
      [chainId]: importedMap,
    },
    allDetectedTokens: {
      [chainId]: detectedMap,
    },
    allIgnoredTokens: {},
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

describe('BalanceFetcher', () => {
  let mockMulticallClient: jest.Mocked<MulticallClient>;
  let balanceFetcher: BalanceFetcher;

  beforeEach(() => {
    mockMulticallClient = createMockMulticallClient();
    balanceFetcher = new BalanceFetcher(mockMulticallClient);
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create fetcher with default config', () => {
      const fetcher = new BalanceFetcher(mockMulticallClient);
      expect(fetcher).toBeDefined();
    });

    it('should create fetcher with custom config', () => {
      const fetcher = new BalanceFetcher(mockMulticallClient, {
        defaultBatchSize: 100,
        defaultTimeoutMs: 60000,
        includeNativeByDefault: false,
      });
      expect(fetcher).toBeDefined();
    });
  });

  describe('setUserTokensStateGetter', () => {
    it('should set the user tokens state getter', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toHaveLength(1);
      expect(tokens[0].address).toBe(TEST_TOKEN_1);
    });
  });

  describe('getTokensToFetch', () => {
    it('should return empty array when no state getter is set', () => {
      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toStrictEqual([]);
    });

    it('should return empty array when state is undefined', () => {
      balanceFetcher.setUserTokensStateGetter(
        () => undefined as unknown as UserTokensState,
      );

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toStrictEqual([]);
    });

    it('should return imported tokens', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [
          { address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 },
          { address: TEST_TOKEN_2, symbol: 'USDT', decimals: 6 },
        ],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toHaveLength(2);
    });

    it('should return detected tokens', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [],
        [{ address: TEST_TOKEN_3, symbol: 'DAI', decimals: 18 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toHaveLength(1);
      expect(tokens[0].symbol).toBe('DAI');
    });

    it('should combine imported and detected tokens', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
        [{ address: TEST_TOKEN_2, symbol: 'USDT', decimals: 6 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toHaveLength(2);
    });

    it('should deduplicate tokens that appear in both imported and detected', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toHaveLength(1);
    });

    it('should return empty array when chain has no tokens', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        POLYGON_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toStrictEqual([]);
    });

    it('should return empty array when account has no tokens', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const differentAccount =
        '0x9999999999999999999999999999999999999999' as Address;
      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        differentAccount,
      );
      expect(tokens).toStrictEqual([]);
    });

    it('should preserve token info (decimals and symbol)', () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [
          { address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 },
          { address: TEST_TOKEN_2, symbol: 'USDT', decimals: 6 },
        ],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );

      const usdcToken = tokens.find((token) => token.symbol === 'USDC');
      expect(usdcToken).toBeDefined();
      expect(usdcToken?.decimals).toBe(6);
    });
  });

  describe('fetchBalances', () => {
    it('should fetch balances for user tokens including native', async () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          ZERO_ADDRESS,
          TEST_ACCOUNT,
          true,
          '1000000000000000000',
        ),
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000',
        ),
      ]);

      const result = await balanceFetcher.fetchBalances(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
      );

      expect(result.balances).toHaveLength(2);
      expect(result.failedAddresses).toHaveLength(0);
    });

    it('should not include native when disabled in options', async () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000',
        ),
      ]);

      await balanceFetcher.fetchBalances(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        { includeNative: false },
      );

      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledWith(
        MAINNET_CHAIN_ID,
        [{ tokenAddress: TEST_TOKEN_1, accountAddress: TEST_ACCOUNT }],
      );
    });

    it('should return empty result when no tokens to fetch', async () => {
      balanceFetcher.setUserTokensStateGetter(() => ({
        allTokens: {},
        allDetectedTokens: {},
        allIgnoredTokens: {},
      }));

      const fetcher = new BalanceFetcher(mockMulticallClient, {
        includeNativeByDefault: false,
      });
      fetcher.setUserTokensStateGetter(() => ({
        allTokens: {},
        allDetectedTokens: {},
        allIgnoredTokens: {},
      }));

      const result = await fetcher.fetchBalances(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        { includeNative: false },
      );

      expect(result).toStrictEqual({
        chainId: MAINNET_CHAIN_ID,
        accountId: TEST_ACCOUNT_ID,
        accountAddress: TEST_ACCOUNT,
        balances: [],
        failedAddresses: [],
        timestamp: 1700000000000,
      });

      expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
    });
  });

  describe('fetchBalancesForTokens', () => {
    it('should fetch balances for specified token addresses', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          ZERO_ADDRESS,
          TEST_ACCOUNT,
          true,
          '1000000000000000000',
        ),
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000',
        ),
        createMockBalanceResponse(
          TEST_TOKEN_2,
          TEST_ACCOUNT,
          true,
          '2000000000',
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1, TEST_TOKEN_2],
      );

      expect(result.balances).toHaveLength(3); // native + 2 tokens
      expect(result.failedAddresses).toHaveLength(0);
    });

    it('should use token info for formatting when provided', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000', // 1 USDC with 6 decimals
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
        [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
      );

      expect(result.balances[0].formattedBalance).toBe('1');
      expect(result.balances[0].decimals).toBe(6);
    });

    it('should use default 18 decimals when token info not provided', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000000000000', // 1 token with 18 decimals
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
      );

      expect(result.balances[0].formattedBalance).toBe('1');
      expect(result.balances[0].decimals).toBe(18);
    });

    it('should handle failed balance fetches', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, false),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
      );

      expect(result.balances).toHaveLength(0);
      expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_1]);
    });

    it('should handle mixed success and failure', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000',
        ),
        createMockBalanceResponse(TEST_TOKEN_2, TEST_ACCOUNT, false),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1, TEST_TOKEN_2],
        { includeNative: false },
      );

      expect(result.balances).toHaveLength(1);
      expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_2]);
    });

    it('should create correct CAIP-19 asset ID for native token', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          ZERO_ADDRESS,
          TEST_ACCOUNT,
          true,
          '1000000000000000000',
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [],
        { includeNative: true },
      );

      expect(result.balances[0].assetId).toBe('eip155:1/slip44:60');
    });

    it('should create correct CAIP-19 asset ID for ERC-20 token', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000',
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
      );

      expect(result.balances[0].assetId).toBe(
        'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      );
    });

    it('should create correct CAIP-19 asset ID for polygon chain', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          ZERO_ADDRESS,
          TEST_ACCOUNT,
          true,
          '1000000000000000000',
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        POLYGON_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [],
        { includeNative: true },
      );

      // 0x89 = 137 in decimal
      expect(result.balances[0].assetId).toBe('eip155:137/slip44:60');
    });

    it('should use custom batch size from options', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1000000000',
        ),
      ]);

      await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1, TEST_TOKEN_2],
        { includeNative: false, batchSize: 1 },
      );

      // With batchSize 1, it should make 2 separate calls for 2 tokens
      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
    });

    it('should handle zero balance', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '0'),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
      );

      expect(result.balances[0].balance).toBe('0');
      expect(result.balances[0].formattedBalance).toBe('0');
    });

    it('should handle undefined balance as zero', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, undefined),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
      );

      expect(result.balances[0].balance).toBe('0');
      expect(result.balances[0].formattedBalance).toBe('0');
    });
  });

  describe('balance formatting', () => {
    it('should format balance with 6 decimals correctly', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          '1234567890', // 1234.56789 USDC
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
        [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
      );

      expect(result.balances[0].formattedBalance).toBe('1234.56789');
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

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
        [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
      );

      expect(result.balances[0].formattedBalance).toBe('1');
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

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
        [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
      );

      expect(result.balances[0].formattedBalance).toBe('0.5');
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

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
        [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
      );

      expect(result.balances[0].formattedBalance).toBe('1.1');
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

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
        [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
      );

      expect(result.balances[0].formattedBalance).toBe('0.000001');
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

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
        [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
      );

      expect(result.balances[0].formattedBalance).toBe('1000000000');
    });

    it('should return raw balance for invalid balance strings', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          TEST_TOKEN_1,
          TEST_ACCOUNT,
          true,
          'invalid-balance',
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
      );

      expect(result.balances[0].formattedBalance).toBe('invalid-balance');
    });

    it('should format zero balance correctly', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '0'),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1],
        { includeNative: false },
      );

      // Zero balance should return early with '0'
      expect(result.balances[0].formattedBalance).toBe('0');
    });
  });

  describe('config options', () => {
    it('should respect includeNativeByDefault config', async () => {
      const fetcherWithoutNative = new BalanceFetcher(mockMulticallClient, {
        includeNativeByDefault: false,
      });

      fetcherWithoutNative.setUserTokensStateGetter(() => ({
        allTokens: {},
        allDetectedTokens: {},
        allIgnoredTokens: {},
      }));

      mockMulticallClient.batchBalanceOf.mockResolvedValue([]);

      await fetcherWithoutNative.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [],
      );

      // With no tokens and includeNativeByDefault: false, should return empty
      expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
    });

    it('should include native by default when not configured', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          ZERO_ADDRESS,
          TEST_ACCOUNT,
          true,
          '1000000000000000000',
        ),
      ]);

      await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [],
      );

      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledWith(
        MAINNET_CHAIN_ID,
        [{ tokenAddress: ZERO_ADDRESS, accountAddress: TEST_ACCOUNT }],
      );
    });
  });

  describe('batching behavior', () => {
    it('should process all tokens in single batch when under batch size', async () => {
      const tokenAddresses = Array.from(
        { length: 5 },
        (_, i) => `0x${i.toString().padStart(40, '0')}` as const,
      );

      const responses = tokenAddresses.map((address) =>
        createMockBalanceResponse(address, TEST_ACCOUNT, true, '1000'),
      );
      mockMulticallClient.batchBalanceOf.mockResolvedValue(responses);

      await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        tokenAddresses,
        { includeNative: false },
      );

      // Default batch size is 300, so 5 tokens should be in 1 batch
      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(1);
    });

    it('should accumulate results across multiple batches', async () => {
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

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [TEST_TOKEN_1, TEST_TOKEN_2],
        { includeNative: false, batchSize: 1 },
      );

      expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
      expect(result.balances).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty token list with native only', async () => {
      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          ZERO_ADDRESS,
          TEST_ACCOUNT,
          true,
          '5000000000000000000',
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [],
        { includeNative: true },
      );

      expect(result.balances).toHaveLength(1);
      expect(result.balances[0].assetId).toBe('eip155:1/slip44:60');
      expect(result.balances[0].formattedBalance).toBe('5');
    });

    it('should handle chain without token state', async () => {
      const mockState: UserTokensState = {
        allTokens: {},
        allDetectedTokens: {},
        allIgnoredTokens: {},
      };

      balanceFetcher.setUserTokensStateGetter(() => mockState);

      const tokens = balanceFetcher.getTokensToFetch(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
      );
      expect(tokens).toStrictEqual([]);
    });

    it('should handle case-insensitive token address matching for token info', async () => {
      const lowercaseAddress =
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;
      const uppercaseAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;

      mockMulticallClient.batchBalanceOf.mockResolvedValue([
        createMockBalanceResponse(
          uppercaseAddress,
          TEST_ACCOUNT,
          true,
          '1000000',
        ),
      ]);

      const result = await balanceFetcher.fetchBalancesForTokens(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT_ID,
        TEST_ACCOUNT,
        [uppercaseAddress],
        { includeNative: false },
        // TokenInfo uses lowercase
        [{ address: lowercaseAddress, decimals: 6, symbol: 'USDC' }],
      );

      // Should still match via case-insensitive lookup
      expect(result.balances[0].decimals).toBe(6);
    });
  });
});
