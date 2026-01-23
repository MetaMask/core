import type { Hex } from '@metamask/utils';

import { TokenDetector } from './TokenDetector';
import type {
  TokenDetectorConfig,
  DetectionPollingInput,
} from './TokenDetector';
import type { MulticallClient } from '../clients';
import type {
  Address,
  BalanceOfResponse,
  ChainId,
  TokenListState,
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
const TEST_TOKEN_3: Address =
  '0x6B175474E89094C44Da98b954EescdeCB5e6cF8dA' as Address;

const MAINNET_CHAIN_ID: ChainId = '0x1' as ChainId;
const POLYGON_CHAIN_ID: ChainId = '0x89' as ChainId;

// =============================================================================
// MOCK HELPERS
// =============================================================================

const createMockMulticallClient = (): jest.Mocked<MulticallClient> =>
  ({
    batchBalanceOf: jest.fn(),
  }) as unknown as jest.Mocked<MulticallClient>;

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
  config?: TokenDetectorConfig;
  tokenListState?: TokenListState;
};

type WithControllerCallback<ReturnValue> = (params: {
  controller: TokenDetector;
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
  const { config, tokenListState } = options;

  const mockMulticallClient = createMockMulticallClient();
  const controller = new TokenDetector(mockMulticallClient, config);

  if (tokenListState) {
    controller.setTokenListStateGetter(() => tokenListState);
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

describe('TokenDetector', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates detector with default config', async () => {
      await withController(async ({ controller }) => {
        expect(controller).toBeDefined();
        expect(controller.getIntervalLength()).toBe(180000);
      });
    });

    it('creates detector with custom config', async () => {
      await withController(
        {
          config: {
            defaultBatchSize: 100,
            defaultTimeoutMs: 60000,
            pollingInterval: 300000,
          },
        },
        async ({ controller }) => {
          expect(controller).toBeDefined();
          expect(controller.getIntervalLength()).toBe(300000);
        },
      );
    });
  });

  describe('polling interval configuration', () => {
    it('sets polling interval via setIntervalLength', async () => {
      await withController(async ({ controller }) => {
        controller.setIntervalLength(240000);
        expect(controller.getIntervalLength()).toBe(240000);
      });
    });

    it('gets polling interval via getIntervalLength', async () => {
      await withController(
        { config: { pollingInterval: 300000 } },
        async ({ controller }) => {
          expect(controller.getIntervalLength()).toBe(300000);
        },
      );
    });
  });

  describe('setOnDetectionUpdate', () => {
    it('sets the detection update callback', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          const mockCallback = jest.fn();
          controller.setOnDetectionUpdate(mockCallback);

          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              TEST_TOKEN_1,
              TEST_ACCOUNT,
              true,
              '1000000000',
            ),
          ]);

          const input: DetectionPollingInput = {
            chainId: MAINNET_CHAIN_ID,
            accountId: TEST_ACCOUNT_ID,
            accountAddress: TEST_ACCOUNT,
          };

          await controller._executePoll(input);

          expect(mockCallback).toHaveBeenCalledWith(
            expect.objectContaining({
              chainId: MAINNET_CHAIN_ID,
              accountId: TEST_ACCOUNT_ID,
              detectedAssets: expect.any(Array),
              detectedBalances: expect.any(Array),
            }),
          );
        },
      );
    });

    it('does not call callback when no tokens detected', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          const mockCallback = jest.fn();
          controller.setOnDetectionUpdate(mockCallback);

          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '0'),
          ]);

          const input: DetectionPollingInput = {
            chainId: MAINNET_CHAIN_ID,
            accountId: TEST_ACCOUNT_ID,
            accountAddress: TEST_ACCOUNT,
          };

          await controller._executePoll(input);

          expect(mockCallback).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('startPolling and stopPolling', () => {
    it('starts polling and returns a token', async () => {
      await withController(async ({ controller }) => {
        const input: DetectionPollingInput = {
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
        const input: DetectionPollingInput = {
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
        const input1: DetectionPollingInput = {
          chainId: MAINNET_CHAIN_ID,
          accountId: TEST_ACCOUNT_ID,
          accountAddress: TEST_ACCOUNT,
        };
        const input2: DetectionPollingInput = {
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

  describe('setTokenListStateGetter', () => {
    it('sets the token list state getter', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToCheck(MAINNET_CHAIN_ID);
          expect(tokens).toHaveLength(1);
          expect(tokens[0]).toBe(TEST_TOKEN_1);
        },
      );
    });
  });

  describe('getTokensToCheck', () => {
    it('returns empty array when no token list state getter is set', async () => {
      await withController(async ({ controller }) => {
        const tokens = controller.getTokensToCheck(MAINNET_CHAIN_ID);
        expect(tokens).toStrictEqual([]);
      });
    });

    it('returns empty array when chain is not in cache', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToCheck(POLYGON_CHAIN_ID);
          expect(tokens).toStrictEqual([]);
        },
      );
    });

    it('returns empty array when chain cache data is undefined', async () => {
      const mockState: TokenListState = {
        tokensChainsCache: {
          [MAINNET_CHAIN_ID]: {
            timestamp: Date.now(),
            data: undefined as unknown as Record<Hex, never>,
          },
        },
      };

      await withController(
        { tokenListState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToCheck(MAINNET_CHAIN_ID);
          expect(tokens).toStrictEqual([]);
        },
      );
    });

    it('returns all token addresses for the chain', async () => {
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

      await withController(
        { tokenListState: mockState },
        async ({ controller }) => {
          const tokens = controller.getTokensToCheck(MAINNET_CHAIN_ID);
          expect(tokens).toHaveLength(3);
          expect(tokens).toContain(TEST_TOKEN_1);
          expect(tokens).toContain(TEST_TOKEN_2);
          expect(tokens).toContain(TEST_TOKEN_3);
        },
      );
    });
  });

  describe('detectTokens', () => {
    it('returns empty result when no tokens to check', async () => {
      await withController(
        { tokenListState: { tokensChainsCache: {} } },
        async ({ controller, mockMulticallClient }) => {
          const result = await controller.detectTokens(
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
        },
      );
    });

    it('detects tokens with non-zero balances', async () => {
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

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              TEST_TOKEN_1,
              TEST_ACCOUNT,
              true,
              '1000000000',
            ),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets).toHaveLength(1);
          expect(result.detectedAssets[0]).toStrictEqual({
            assetId:
              'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
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
          expect(result.zeroBalanceAddresses).toHaveLength(0);
          expect(result.failedAddresses).toHaveLength(0);
        },
      );
    });

    it('categorizes zero balance tokens correctly', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '0'),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets).toHaveLength(0);
          expect(result.detectedBalances).toHaveLength(0);
          expect(result.zeroBalanceAddresses).toStrictEqual([TEST_TOKEN_1]);
          expect(result.failedAddresses).toHaveLength(0);
        },
      );
    });

    it('categorizes failed calls correctly', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, false),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets).toHaveLength(0);
          expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_1]);
        },
      );
    });

    it('handles mixed results correctly', async () => {
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

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
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

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets).toHaveLength(1);
          expect(result.zeroBalanceAddresses).toStrictEqual([TEST_TOKEN_2]);
          expect(result.failedAddresses).toStrictEqual([TEST_TOKEN_3]);
        },
      );
    });
  });

  describe('asset creation', () => {
    it('creates correct CAIP-19 asset ID for mainnet', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              TEST_TOKEN_1,
              TEST_ACCOUNT,
              true,
              '1000000',
            ),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets[0].assetId).toBe(
            'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          );
        },
      );
    });

    it('creates correct CAIP-19 asset ID for polygon', async () => {
      const mockState = createMockTokenListState(POLYGON_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              TEST_TOKEN_1,
              TEST_ACCOUNT,
              true,
              '1000000',
            ),
          ]);

          const result = await controller.detectTokens(
            POLYGON_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets[0].assetId).toBe(
            'eip155:137/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          );
        },
      );
    });
  });

  describe('balance formatting', () => {
    it('formats balance with 6 decimals correctly', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              TEST_TOKEN_1,
              TEST_ACCOUNT,
              true,
              '1234567890',
            ),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedBalances[0].formattedBalance).toBe(
            '1234.56789',
          );
        },
      );
    });

    it('returns raw balance for invalid balance strings', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              TEST_TOKEN_1,
              TEST_ACCOUNT,
              true,
              'invalid-balance',
            ),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedBalances[0].formattedBalance).toBe(
            'invalid-balance',
          );
        },
      );
    });
  });

  describe('batching behavior', () => {
    it('uses custom batch size from options', async () => {
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

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '100'),
          ]);

          await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
            { batchSize: 1 },
          );

          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
        },
      );
    });

    it('accumulates results across multiple batches', async () => {
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

      await withController(
        { tokenListState: mockState },
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

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
            { batchSize: 1 },
          );

          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(2);
          expect(result.detectedAssets).toHaveLength(2);
          expect(result.detectedBalances).toHaveLength(2);
        },
      );
    });
  });

  describe('edge cases', () => {
    it('handles case-insensitive token address matching', async () => {
      const lowercaseAddress =
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Address;
      const uppercaseAddress =
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address;

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

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              uppercaseAddress,
              TEST_ACCOUNT,
              true,
              '1000000',
            ),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets[0].symbol).toBe('USDC');
          expect(result.detectedBalances[0].decimals).toBe(6);
        },
      );
    });

    it('uses default decimals (18) when token metadata is missing', async () => {
      const unknownToken =
        '0x9999999999999999999999999999999999999999' as Address;
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListState: mockState },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(
              unknownToken,
              TEST_ACCOUNT,
              true,
              '1000000',
            ),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets).toHaveLength(1);
          expect(result.detectedBalances[0].decimals).toBe(18);
        },
      );
    });

    it('handles getTokenMetadata when token list state becomes undefined during detection', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      let callCount = 0;
      await withController(async ({ controller, mockMulticallClient }) => {
        // First call returns state, subsequent calls return undefined
        controller.setTokenListStateGetter(() => {
          callCount += 1;
          if (callCount === 1) {
            return mockState;
          }
          return undefined as unknown as TokenListState;
        });

        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1000000',
          ),
        ]);

        const result = await controller.detectTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
        );

        // Token detected but with default decimals since metadata unavailable
        expect(result.detectedAssets).toHaveLength(1);
        expect(result.detectedBalances[0].decimals).toBe(18);
      });
    });

    it('handles getTokenMetadata when chain not in cache during detection', async () => {
      const mockState = createMockTokenListState(MAINNET_CHAIN_ID, [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      let callCount = 0;
      await withController(async ({ controller, mockMulticallClient }) => {
        // First call returns state with chain, subsequent calls return state without chain
        controller.setTokenListStateGetter(() => {
          callCount += 1;
          if (callCount === 1) {
            return mockState;
          }
          return { tokensChainsCache: {} };
        });

        mockMulticallClient.batchBalanceOf.mockResolvedValue([
          createMockBalanceResponse(
            TEST_TOKEN_1,
            TEST_ACCOUNT,
            true,
            '1000000',
          ),
        ]);

        const result = await controller.detectTokens(
          MAINNET_CHAIN_ID,
          TEST_ACCOUNT_ID,
          TEST_ACCOUNT,
        );

        // Token detected but with default decimals since chain not in cache
        expect(result.detectedAssets).toHaveLength(1);
        expect(result.detectedBalances[0].decimals).toBe(18);
      });
    });
  });
});
