import type { CaipAssetType } from '@metamask/utils';

import type { MulticallClient } from '../clients';
import type {
  Address,
  AssetFetchEntry,
  AssetsBalanceState,
  BalanceOfResponse,
  ChainId,
} from '../types';
import { BalanceFetcher } from './BalanceFetcher';
import type {
  BalanceFetcherConfig,
  BalanceFetcherMessenger,
  BalancePollingInput,
} from './BalanceFetcher';

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

const NATIVE_ETH_ASSET_ID = 'eip155:1/slip44:60' as CaipAssetType;
const TOKEN_1_ASSET_ID =
  `eip155:1/erc20:${TEST_TOKEN_1.toLowerCase()}` as CaipAssetType;
const TOKEN_2_ASSET_ID =
  `eip155:1/erc20:${TEST_TOKEN_2.toLowerCase()}` as CaipAssetType;

const NATIVE_ETH_ENTRY: AssetFetchEntry = {
  assetId: NATIVE_ETH_ASSET_ID,
  address: ZERO_ADDRESS,
};
const TOKEN_1_ENTRY: AssetFetchEntry = {
  assetId: TOKEN_1_ASSET_ID,
  address: TEST_TOKEN_1.toLowerCase() as Address,
};
const TOKEN_1_ENTRY_WITH_DECIMALS: AssetFetchEntry = {
  ...TOKEN_1_ENTRY,
  decimals: 6,
};
const TOKEN_2_ENTRY: AssetFetchEntry = {
  assetId: TOKEN_2_ASSET_ID,
  address: TEST_TOKEN_2.toLowerCase() as Address,
};
const TOKEN_2_ENTRY_WITH_DECIMALS: AssetFetchEntry = {
  ...TOKEN_2_ENTRY,
  decimals: 6,
};

// =============================================================================
// MOCK HELPERS
// =============================================================================

const createMockMulticallClient = (): jest.Mocked<MulticallClient> =>
  ({
    batchBalanceOf: jest.fn(),
  }) as unknown as jest.Mocked<MulticallClient>;

function createMockAssetsBalanceState(
  accountId: string,
  balances: Record<string, { amount: string }> = {},
): AssetsBalanceState {
  return {
    assetsBalance: {
      [accountId]: balances,
    },
  };
}

function createMockMessenger(
  assetsBalanceState?: AssetsBalanceState,
): BalanceFetcherMessenger {
  return {
    call: (_action: 'AssetsController:getState'): AssetsBalanceState => {
      return assetsBalanceState ?? { assetsBalance: {} };
    },
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
  assetsBalanceState?: AssetsBalanceState;
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
  const { config, assetsBalanceState } = options;

  const mockMulticallClient = createMockMulticallClient();
  const mockMessenger = createMockMessenger(assetsBalanceState);
  const controller = new BalanceFetcher(
    mockMulticallClient,
    mockMessenger,
    config,
  );

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
      const mockState = createMockAssetsBalanceState(TEST_ACCOUNT_ID, {
        [NATIVE_ETH_ASSET_ID]: { amount: '0' },
      });

      await withController(
        { assetsBalanceState: mockState },
        async ({ controller, mockMulticallClient }) => {
          const mockCallback = jest.fn();
          controller.setOnBalanceUpdate(mockCallback);

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
        },
      );
    });

    it('does not call callback when balances are empty', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        const mockCallback = jest.fn();
        controller.setOnBalanceUpdate(mockCallback);

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

  describe('fetchBalancesForAssets', () => {
    it('fetches balances for specified asset entries', async () => {
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

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [NATIVE_ETH_ENTRY, TOKEN_1_ENTRY_WITH_DECIMALS],
        );

        expect(result.balances).toHaveLength(2);
        expect(result.failedAddresses).toHaveLength(0);
      });
    });

    it('preserves the native asset ID provided by the caller', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            ZERO_ADDRESS,
            TEST_ACCOUNT,
            true,
            '1000000000000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [NATIVE_ETH_ENTRY],
        );

        expect(result.balances[0].assetId).toBe(NATIVE_ETH_ASSET_ID);
      });
    });

    it('preserves a non-ETH native asset ID (e.g. Avalanche)', async () => {
      const avaxNativeAssetId = 'eip155:43114/slip44:9005' as CaipAssetType;

      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            ZERO_ADDRESS,
            TEST_ACCOUNT,
            true,
            '5000000000000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [{ assetId: avaxNativeAssetId, address: ZERO_ADDRESS }],
        );

        expect(result.balances[0].assetId).toBe(avaxNativeAssetId);
        expect(result.balances[0].formattedBalance).toBe('5');
      });
    });

    it('preserves the ERC-20 asset ID provided by the caller', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TOKEN_1_ENTRY_WITH_DECIMALS],
        );

        expect(result.balances[0].assetId).toBe(TOKEN_1_ASSET_ID);
      });
    });

    it('includes ERC-20 raw balance when decimals omitted (resolved downstream)', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TOKEN_1_ENTRY],
        );

        expect(result.balances).toHaveLength(1);
        expect(result.balances[0].decimals).toBeUndefined();
        expect(result.balances[0].balance).toBe('1000000000');
        expect(result.balances[0].formattedBalance).toBe('1000000000');
        expect(result.failedAddresses).toHaveLength(0);
      });
    });

    it('includes ERC-20 balance when entry has zero decimals', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '42'),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [{ ...TOKEN_1_ENTRY, decimals: 0 }],
        );

        expect(result.balances).toHaveLength(1);
        expect(result.balances[0].decimals).toBe(0);
        expect(result.balances[0].formattedBalance).toBe('42');
      });
    });

    it('handles failed balance fetches', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, false),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TOKEN_1_ENTRY],
        );

        expect(result.balances).toHaveLength(0);
        expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_1]);
      });
    });

    it('returns empty result when no entries provided', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [],
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

    it('derives hex chainId from asset entries', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            ZERO_ADDRESS,
            TEST_ACCOUNT,
            true,
            '1000000000000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [NATIVE_ETH_ENTRY],
        );

        expect(result.chainId).toBe(MAINNET_CHAIN_ID);
      });
    });

    it('deduplicates entries with same address', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            ZERO_ADDRESS,
            TEST_ACCOUNT,
            true,
            '1000000000000000000',
          ),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [NATIVE_ETH_ENTRY, NATIVE_ETH_ENTRY],
        );

        expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(1);
        const calls = mockMulticallClient.batchBalanceOf.mock.calls[0];
        expect(calls[1]).toHaveLength(1);
        expect(result.balances).toHaveLength(1);
      });
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

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [{ ...TOKEN_1_ENTRY, decimals: 6 }],
        );

        expect(result.balances[0].formattedBalance).toBe('1234.56789');
      });
    });

    it('formats zero balance correctly', async () => {
      await withController(async ({ controller, mockMulticallClient }) => {
        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '0'),
        ]);

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TOKEN_1_ENTRY_WITH_DECIMALS],
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

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TOKEN_1_ENTRY_WITH_DECIMALS],
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

        const result = await controller.fetchBalancesForAssets(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
          [TOKEN_1_ENTRY_WITH_DECIMALS],
        );

        expect(result.balances[0].formattedBalance).toBe('invalid-balance');
      });
    });
  });

  describe('batching behavior', () => {
    it('uses custom batch size from options', async () => {
      await withController(
        { config: { defaultBatchSize: 1 } },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              TEST_TOKEN_1,
              TEST_ACCOUNT,
              true,
              '1000000000',
            ),
          ]);

          await controller.fetchBalancesForAssets(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
            [TOKEN_1_ENTRY_WITH_DECIMALS, TOKEN_2_ENTRY_WITH_DECIMALS],
          );

          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('accumulates results across multiple batches', async () => {
      await withController(
        { config: { defaultBatchSize: 1 } },
        async ({ controller, mockMulticallClient }) => {
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

          const result = await controller.fetchBalancesForAssets(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
            [TOKEN_1_ENTRY_WITH_DECIMALS, TOKEN_2_ENTRY_WITH_DECIMALS],
          );

          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
          expect(result.balances).toHaveLength(2);
        },
      );
    });
  });
});
