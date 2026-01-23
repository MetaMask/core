import { BalanceFetcher } from './BalanceFetcher';
import type {
  BalanceFetcherConfig,
  BalancePollingInput,
} from './BalanceFetcher';
import type { MulticallClient } from '../clients';
import type {
  Address,
  BalanceOfResponse,
  ChainId,
  UserTokensState,
} from '../types';

// =============================================================================
// CONSTANTS
// =============================================================================

const TEST_ACCOUNT: Address =
  '0x1234567890123456789012345678901234567890' as Address;
const TEST_ACCOUNT_ID = 'test-account-uuid';
const TEST_TOKEN_1: Address =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;
const TEST_TOKEN_2: Address =
  '0xdAC17F958D2ee523a2206206994597C13D831ec7' as Address;
const ZERO_ADDRESS: Address =
  '0x0000000000000000000000000000000000000000' as Address;

const MAINNET_CHAIN_ID: ChainId = '0x1' as ChainId;
const POLYGON_CHAIN_ID: ChainId = '0x89' as ChainId;

// =============================================================================
// MOCK HELPERS
// =============================================================================

const createMockMulticallClient = (): jest.Mocked<MulticallClient> =>
  ({
    batchBalanceOf: jest.fn(),
  }) as unknown as jest.Mocked<MulticallClient>;

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
    allTokens: { [chainId]: importedMap },
    allDetectedTokens: { [chainId]: detectedMap },
    allIgnoredTokens: {},
  };
}

function createMockBalanceResponse(
  tokenAddress: Address,
  accountAddress: Address,
  success: boolean,
  balance?: string,
): BalanceOfResponse {
  return { tokenAddress, accountAddress, success, balance };
}

// =============================================================================
// WITH CONTROLLER PATTERN
// =============================================================================

type WithControllerOptions = {
  config?: BalanceFetcherConfig;
  userTokensState?: UserTokensState;
};

type WithControllerCallback<ReturnValue> = (params: {
  controller: BalanceFetcher;
  mockMulticallClient: jest.Mocked<MulticallClient>;
}) => Promise<ReturnValue> | ReturnValue;

async function withController<ReturnValue>(
  options: WithControllerOptions,
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue>;
async function withController<ReturnValue>(
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue>;
async function withController<ReturnValue>(
  ...args:
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
    | [WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [options, fn] = args.length === 2 ? args : [{}, args[0]];
  const { config, userTokensState } = options;

  const mockMulticallClient = createMockMulticallClient();
  const controller = new BalanceFetcher(mockMulticallClient, config);

  if (userTokensState) {
    controller.setUserTokensStateGetter(() => userTokensState);
  }

  try {
    return await fn({ controller, mockMulticallClient });
  } finally {
    controller.stopAllPolling();
  }
}

// =============================================================================
// TESTS
// =============================================================================

describe('BalanceFetcher', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates fetcher with default config', async () => {
      await withController(async ({ controller }) => {
        expect(controller).toBeDefined();
        expect(controller.getIntervalLength()).toBe(30000);
      });
    });

    it('creates fetcher with custom config', async () => {
      await withController(
        {
          config: {
            defaultBatchSize: 100,
            defaultTimeoutMs: 60000,
            includeNativeByDefault: false,
            pollingInterval: 45000,
          },
        },
        async ({ controller }) => {
          expect(controller).toBeDefined();
          expect(controller.getIntervalLength()).toBe(45000);
        },
      );
    });
  });

  describe('polling interval configuration', () => {
    it('sets polling interval via setIntervalLength', async () => {
      await withController(async ({ controller }) => {
        controller.setIntervalLength(60000);
        expect(controller.getIntervalLength()).toBe(60000);
      });
    });

    it('gets polling interval via getIntervalLength', async () => {
      await withController(
        { config: { pollingInterval: 45000 } },
        async ({ controller }) => {
          expect(controller.getIntervalLength()).toBe(45000);
        },
      );
    });
  });

  describe('setOnBalanceUpdate', () => {
    it('sets the balance update callback', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        const mockCallback = jest.fn();
        controller.setOnBalanceUpdate(mockCallback);
        controller.setUserTokensStateGetter(() => ({
          allTokens: {},
          allDetectedTokens: {},
          allIgnoredTokens: {},
        }));

        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            ZERO_ADDRESS,
            TEST_ACCOUNT,
            true,
            '1000000000000000000',
          ),
        ]);

        const input: BalancePollingInput = {
          chainId: MAINNET_CHAIN_ID,
          accountId: TEST_ACCOUNT_ID,
          accountAddress: TEST_ACCOUNT,
        };

        await controller._executePoll(input);

        expect(mockCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            chainId: MAINNET_CHAIN_ID,
            accountId: TEST_ACCOUNT_ID,
            balances: expect.any(Array),
          }),
        );
      });
    });

    it('does not call callback when balances are empty', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        const mockCallback = jest.fn();
        controller.setOnBalanceUpdate(mockCallback);
        controller.setUserTokensStateGetter(() => ({
          allTokens: {},
          allDetectedTokens: {},
          allIgnoredTokens: {},
        }));

        mockMulticallClient.batchBalanceOf.mockResolvedValue([]);

        const input: BalancePollingInput = {
          chainId: MAINNET_CHAIN_ID,
          accountId: TEST_ACCOUNT_ID,
          accountAddress: TEST_ACCOUNT,
        };

        await controller._executePoll(input);

        expect(mockCallback).not.toHaveBeenCalled();
      });
    });
  });

  describe('startPolling and stopPolling', () => {
    it('starts polling and returns a token', async () => {
      await withController(async ({ controller }) => {
        const input: BalancePollingInput = {
          chainId: MAINNET_CHAIN_ID,
          accountId: TEST_ACCOUNT_ID,
          accountAddress: TEST_ACCOUNT,
        };

        const token = controller.startPolling(input);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        controller.stopPollingByPollingToken(token);
      });
    });

    it('stops polling by token', async () => {
      await withController(async ({ controller }) => {
        const input: BalancePollingInput = {
          chainId: MAINNET_CHAIN_ID,
          accountId: TEST_ACCOUNT_ID,
          accountAddress: TEST_ACCOUNT,
        };

        const token = controller.startPolling(input);
        expect(() => controller.stopPollingByPollingToken(token)).not.toThrow();
      });
    });

    it('stops all polling', async () => {
      await withController(async ({ controller }) => {
        const input1: BalancePollingInput = {
          chainId: MAINNET_CHAIN_ID,
          accountId: TEST_ACCOUNT_ID,
          accountAddress: TEST_ACCOUNT,
        };
        const input2: BalancePollingInput = {
          chainId: POLYGON_CHAIN_ID,
          accountId: TEST_ACCOUNT_ID,
          accountAddress: TEST_ACCOUNT,
        };

        controller.startPolling(input1);
        controller.startPolling(input2);

        expect(() => controller.stopAllPolling()).not.toThrow();
      });
    });
  });

  describe('setUserTokensStateGetter', () => {
    it('sets the user tokens state getter', async () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      await withController(
        { userTokensState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToFetch(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT,
          );
          expect(tokens).toHaveLength(1);
          expect(tokens[0].address).toBe(TEST_TOKEN_1);
        },
      );
    });
  });

  describe('getTokensToFetch', () => {
    it('returns empty array when no state getter is set', async () => {
      await withController(async ({ controller }) => {
        const tokens = controller.getTokensToFetch(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT,
        );
        expect(tokens).toStrictEqual([]);
      });
    });

    it('returns imported tokens', async () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [
          { address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 },
          { address: TEST_TOKEN_2, symbol: 'USDT', decimals: 6 },
        ],
      );

      await withController(
        { userTokensState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToFetch(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT,
          );
          expect(tokens).toHaveLength(2);
        },
      );
    });

    it('combines and deduplicates imported and detected tokens', async () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      await withController(
        { userTokensState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToFetch(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT,
          );
          expect(tokens).toHaveLength(1);
        },
      );
    });

    it('returns empty array when chain has no tokens', async () => {
      const mockState = createMockUserTokensState(
        MAINNET_CHAIN_ID,
        TEST_ACCOUNT,
        [{ address: TEST_TOKEN_1, symbol: 'USDC', decimals: 6 }],
      );

      await withController(
        { userTokensState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToFetch(
            POLYGON_CHAIN_ID,
            TEST_ACCOUNT,
          );
          expect(tokens).toStrictEqual([]);
        },
      );
    });
  });

  describe('fetchBalancesForTokens', () => {
    it('fetches balances for specified token addresses', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
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

        const result = await controller.fetchBalancesForTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TEST_TOKEN_1],
        );

        expect(result.balances).toHaveLength(2);
        expect(result.failedAddresses).toHaveLength(0);
      });
    });

    it('creates correct CAIP-19 asset ID for native token', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            ZERO_ADDRESS,
            TEST_ACCOUNT,
            true,
            '1000000000000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [],
          { includeNative: true },
        );

        expect(result.balances[0].assetId).toBe('eip155:1/slip44:60');
      });
    });

    it('creates correct CAIP-19 asset ID for ERC-20 token', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForTokens(
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
    });

    it('handles failed balance fetches', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, false),
        ]);

        const result = await controller.fetchBalancesForTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TEST_TOKEN_1],
          { includeNative: false },
        );

        expect(result.balances).toHaveLength(0);
        expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_1]);
      });
    });

    it('returns empty result when no tokens to fetch', async () => {
      await withController(
        { config: { includeNativeByDefault: false } },
        async ({ controller, mockMulticallClient }) => {
          const result = await controller.fetchBalancesForTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
            [],
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
        },
      );
    });
  });

  describe('balance formatting', () => {
    it('formats balance with 6 decimals correctly', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1234567890',
          ),
        ]);

        const result = await controller.fetchBalancesForTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TEST_TOKEN_1],
          { includeNative: false },
          [{ address: TEST_TOKEN_1, decimals: 6, symbol: 'USDC' }],
        );

        expect(result.balances[0].formattedBalance).toBe('1234.56789');
      });
    });

    it('formats zero balance correctly', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '0'),
        ]);

        const result = await controller.fetchBalancesForTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TEST_TOKEN_1],
          { includeNative: false },
        );

        expect(result.balances[0].formattedBalance).toBe('0');
      });
    });

    it('handles undefined balance as zero', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            undefined,
          ),
        ]);

        const result = await controller.fetchBalancesForTokens(
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

    it('returns raw balance for invalid balance strings', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            'invalid-balance',
          ),
        ]);

        const result = await controller.fetchBalancesForTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TEST_TOKEN_1],
          { includeNative: false },
        );

        expect(result.balances[0].formattedBalance).toBe('invalid-balance');
      });
    });
  });

  describe('batching behavior', () => {
    it('uses custom batch size from options', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1000000000',
          ),
        ]);

        await controller.fetchBalancesForTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TEST_TOKEN_1, TEST_TOKEN_2],
          { includeNative: false, batchSize: 1 },
        );

        expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
      });
    });

    it('accumulates results across multiple batches', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
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

        const result = await controller.fetchBalancesForTokens(
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
  });
});
