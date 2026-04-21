import type { MulticallClient } from '../clients';
import type { TokensApiClient } from '../clients/TokensApiClient';
import type {
  Address,
  BalanceOfResponse,
  ChainId,
  TokenListEntry,
} from '../types';
import { TokenDetector } from './TokenDetector';
import type {
  TokenDetectorConfig,
  DetectionPollingInput,
} from './TokenDetector';

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

function createMockTokenList(
  tokens: {
    address: Address;
    symbol: string;
    name: string;
    decimals: number;
    iconUrl?: string;
    aggregators?: string[];
  }[],
): TokenListEntry[] {
  return tokens.map((token) => ({ ...token }));
}

function createMockTokensApiClient(
  tokenListByChain: Record<ChainId, TokenListEntry[]> = {},
): jest.Mocked<TokensApiClient> {
  return {
    fetchTokenList: jest.fn((chainId: ChainId) =>
      Promise.resolve(tokenListByChain[chainId] ?? []),
    ),
  } as unknown as jest.Mocked<TokensApiClient>;
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
  tokenListByChain?: Record<ChainId, TokenListEntry[]>;
};

type WithControllerCallback<ReturnValue> = (params: {
  controller: TokenDetector;
  mockMulticallClient: jest.Mocked<MulticallClient>;
  mockTokensApiClient: jest.Mocked<TokensApiClient>;
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
  const { config, tokenListByChain = {} } = options;

  const mockMulticallClient = createMockMulticallClient();
  const mockTokensApiClient = createMockTokensApiClient(tokenListByChain);
  const controller = new TokenDetector(
    mockMulticallClient,
    mockTokensApiClient,
    config,
  );

  try {
    return await fn({ controller, mockMulticallClient, mockTokensApiClient });
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
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(1);
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

  describe('getTokensToCheck', () => {
    it('returns empty array when API returns empty list', async () => {
      await withController(async ({ controller }) => {
        const tokens = await controller.getTokensToCheck(MAINNET_CHAIN_ID);
        expect(tokens).toStrictEqual([]);
      });
    });

    it('returns empty array when chain has no tokens in API', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        { tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList } },
        async ({ controller }) => {
          const tokens = await controller.getTokensToCheck(POLYGON_CHAIN_ID);
          expect(tokens).toStrictEqual([]);
        },
      );
    });

    it('returns all token addresses for the chain', async () => {
      const tokenList = createMockTokenList([
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
        { tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList } },
        async ({ controller }) => {
          const tokens = await controller.getTokensToCheck(MAINNET_CHAIN_ID);
          expect(tokens).toHaveLength(3);
          expect(tokens).toContain(TEST_TOKEN_1);
          expect(tokens).toContain(TEST_TOKEN_2);
          expect(tokens).toContain(TEST_TOKEN_3);
        },
      );
    });

    it('calls the Tokens API with the correct chain ID', async () => {
      await withController(
        { tokenListByChain: {} },
        async ({ controller, mockTokensApiClient }) => {
          await controller.getTokensToCheck(POLYGON_CHAIN_ID);
          expect(mockTokensApiClient.fetchTokenList).toHaveBeenCalledWith(
            POLYGON_CHAIN_ID,
          );
        },
      );
    });
  });

  describe('detectTokens', () => {
    it('returns empty result when no tokens to check', async () => {
      await withController(
        { tokenListByChain: {} },
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
      const tokenList = createMockTokenList([
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
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

    it('includes detected asset but omits detectedBalances when token list entry has no decimals', async () => {
      const tokenList: TokenListEntry[] = [
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: undefined as unknown as number,
        },
      ];

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
          expect(result.detectedBalances).toHaveLength(0);
        },
      );
    });

    it('includes detectedBalances when token list entry has zero decimals', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'ZERO',
          name: 'Zero Decimals Token',
          decimals: 0,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
        async ({ controller, mockMulticallClient }) => {
          mockMulticallClient.batchBalanceOf.mockResolvedValue([
            createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '7'),
          ]);

          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets).toHaveLength(1);
          expect(result.detectedBalances).toHaveLength(1);
          expect(result.detectedBalances[0].decimals).toBe(0);
        },
      );
    });

    it('categorizes zero balance tokens correctly', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
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
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

  describe('tokenDetectionEnabled', () => {
    it('returns empty result and does not call batchBalanceOf when tokenDetectionEnabled is false in config', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => false },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

    it('runs detection when tokenDetectionEnabled is true in config', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

          expect(result.detectedAssets).toHaveLength(1);
          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('options.tokenDetectionEnabled overrides config when true', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => false },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
            { tokenDetectionEnabled: true },
          );

          expect(result.detectedAssets).toHaveLength(1);
          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('options.tokenDetectionEnabled overrides config when false', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
        async ({ controller, mockMulticallClient }) => {
          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
            { tokenDetectionEnabled: false },
          );

          expect(result.detectedAssets).toStrictEqual([]);
          expect(result.detectedBalances).toStrictEqual([]);
          expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
        },
      );
    });

    it('_executePoll does not call onDetectionUpdate when tokenDetectionEnabled is false in config', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => false },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

          expect(mockCallback).not.toHaveBeenCalled();
          expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
        },
      );
    });

    it('returns empty result and does not call batchBalanceOf when useExternalService is false in config', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: {
            tokenDetectionEnabled: () => true,
            useExternalService: () => false,
          },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
        async ({ controller, mockMulticallClient }) => {
          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
          );

          expect(result.detectedAssets).toStrictEqual([]);
          expect(result.detectedBalances).toStrictEqual([]);
          expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
        },
      );
    });

    it('runs detection when both tokenDetectionEnabled and useExternalService are true', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: {
            tokenDetectionEnabled: () => true,
            useExternalService: () => true,
          },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

          expect(result.detectedAssets).toHaveLength(1);
          expect(mockMulticallClient.batchBalanceOf).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('options.useExternalService overrides config when false', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: {
            tokenDetectionEnabled: () => true,
            useExternalService: () => true,
          },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
        async ({ controller, mockMulticallClient }) => {
          const result = await controller.detectTokens(
            MAINNET_CHAIN_ID,
            TEST_ACCOUNT_ID,
            TEST_ACCOUNT,
            { useExternalService: false },
          );

          expect(result.detectedAssets).toStrictEqual([]);
          expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
        },
      );
    });

    it('_executePoll does not call onDetectionUpdate when useExternalService is false in config', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: {
            tokenDetectionEnabled: () => true,
            useExternalService: () => false,
          },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

          expect(mockCallback).not.toHaveBeenCalled();
          expect(mockMulticallClient.batchBalanceOf).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('asset creation', () => {
    it('creates correct CAIP-19 asset ID for mainnet', async () => {
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [POLYGON_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
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
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
      const tokenList = createMockTokenList([
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
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

      const tokenList: TokenListEntry[] = [
        {
          address: lowercaseAddress,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ];

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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

    it('omits detectedBalances when token metadata is missing (no decimals fallback)', async () => {
      const unknownToken =
        '0x9999999999999999999999999999999999999999' as Address;
      const tokenList = createMockTokenList([
        {
          address: TEST_TOKEN_1,
          symbol: 'USDC',
          name: 'USD Coin',
          decimals: 6,
        },
      ]);

      await withController(
        {
          config: { tokenDetectionEnabled: () => true },
          tokenListByChain: { [MAINNET_CHAIN_ID]: tokenList },
        },
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
          expect(result.detectedBalances).toHaveLength(0);
        },
      );
    });
  });
});
