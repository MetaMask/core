import type { TokenMetadata } from '@metamask/core-backend';

import type { MulticallClient } from '../clients/index.js';
import type {
  Address,
  BalanceOfResponse,
  ChainId,
  TokenListEntry,
} from '../types/index.js';
import { TokenDetector } from './TokenDetector.js';
import type {
  TokenDetectorApiClient,
  TokenDetectorConfig,
  DetectionPollingInput,
} from './TokenDetector.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const TEST_ACCOUNT: Address = '0x1234567890123456789012345678901234567890';
const TEST_ACCOUNT_ID = 'test-account-uuid';
const TEST_TOKEN_1: Address = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TEST_TOKEN_2: Address = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const TEST_TOKEN_3: Address = '0x6B175474E89094C44Da98b954EescdeCB5e6cF8dA';

const MAINNET_CHAIN_ID: ChainId = '0x1';
const POLYGON_CHAIN_ID: ChainId = '0x89';
const LINEA_MAINNET_CHAIN_ID: ChainId = '0xe708';
const MEGAETH_MAINNET_CHAIN_ID: ChainId = '0x10e6';
const MONAD_CHAIN_ID: ChainId = '0x8f';
// 0xdef1 = 57073 decimal — intentionally absent from DEFAULT_SUPPORTED_NETWORKS
const UNSUPPORTED_CHAIN_ID: ChainId = '0xdef1';

/**
 * Default Token API `/v2/supportedNetworks` payload. Includes every chain the
 * tests reference so they reach the token-list endpoint unless they opt out.
 */
const DEFAULT_SUPPORTED_NETWORKS = {
  fullSupport: ['eip155:1', 'eip155:137', 'eip155:59144'],
  partialSupport: ['eip155:4326', 'eip155:143'],
};

/**
 * Default `/v1/suggestedOccurrenceFloors` payload (decimal chain ID → floor).
 * Linea and Monad are 1; mainnet and Polygon are 3; MegaETH is omitted so
 * tests can assert the fallback.
 */
const DEFAULT_SUGGESTED_OCCURRENCE_FLOORS: Record<string, number> = {
  '1': 3,
  '137': 3,
  '143': 1,
  '59144': 1,
};

/** Query options the detector sends to `/tokens/{chainId}` (minus the floor). */
const EXPECTED_TOKEN_LIST_QUERY = {
  includeNativeAssets: false,
  includeTokenFees: false,
  includeAssetType: false,
  includeERC20Permit: false,
  includeStorage: false,
  includeRwaData: true,
};

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

type TokenApi = TokenDetectorApiClient['token'];

type MockTokenApi = {
  fetchV2SupportedNetworks: jest.MockedFunction<
    TokenApi['fetchV2SupportedNetworks']
  >;
  fetchV1SuggestedOccurrenceFloors: jest.MockedFunction<
    TokenApi['fetchV1SuggestedOccurrenceFloors']
  >;
  fetchTokenList: jest.MockedFunction<TokenApi['fetchTokenList']>;
};

type MockApiClientOptions = {
  /** Raw `/tokens/{chainId}` items keyed by hex chain ID. */
  tokenListByChain?: Record<ChainId, TokenMetadata[]>;
  supportedNetworks?: { fullSupport: string[]; partialSupport: string[] };
  suggestedOccurrenceFloors?: Record<string, number>;
};

/**
 * Build a stub of the `ApiPlatformClient.token` surface the detector uses.
 * `fetchTokenList` receives a decimal chain ID (as the real client does) and
 * resolves the raw items registered for the matching hex chain ID.
 *
 * @param options - Payload overrides.
 * @param options.tokenListByChain - Raw token-list items keyed by hex chain ID.
 * @param options.supportedNetworks - `/v2/supportedNetworks` payload.
 * @param options.suggestedOccurrenceFloors - `/v1/suggestedOccurrenceFloors` payload.
 * @returns The typed client alongside its underlying mocks.
 */
function createMockApiClient({
  tokenListByChain = {},
  supportedNetworks = DEFAULT_SUPPORTED_NETWORKS,
  suggestedOccurrenceFloors = DEFAULT_SUGGESTED_OCCURRENCE_FLOORS,
}: MockApiClientOptions = {}): {
  apiClient: TokenDetectorApiClient;
  mockTokenApi: MockTokenApi;
} {
  const mockTokenApi: MockTokenApi = {
    fetchV2SupportedNetworks: jest
      .fn<ReturnType<TokenApi['fetchV2SupportedNetworks']>, []>()
      .mockResolvedValue(supportedNetworks),
    fetchV1SuggestedOccurrenceFloors: jest
      .fn<ReturnType<TokenApi['fetchV1SuggestedOccurrenceFloors']>, []>()
      .mockResolvedValue(suggestedOccurrenceFloors),
    fetchTokenList: jest.fn((decimalChainId: number) =>
      Promise.resolve(
        tokenListByChain[`0x${decimalChainId.toString(16)}`] ?? [],
      ),
    ),
  };
  return {
    apiClient: { token: mockTokenApi } as unknown as TokenDetectorApiClient,
    mockTokenApi,
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
  tokenListByChain?: Record<ChainId, TokenMetadata[]>;
  supportedNetworks?: { fullSupport: string[]; partialSupport: string[] };
  suggestedOccurrenceFloors?: Record<string, number>;
};

type WithControllerCallback<ReturnValue> = (params: {
  controller: TokenDetector;
  mockMulticallClient: jest.Mocked<MulticallClient>;
  mockTokenApi: MockTokenApi;
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
  const { config, ...apiClientOptions } = options;

  const mockMulticallClient = createMockMulticallClient();
  const { apiClient, mockTokenApi } = createMockApiClient(apiClientOptions);
  const controller = new TokenDetector(mockMulticallClient, apiClient, config);

  try {
    return await fn({ controller, mockMulticallClient, mockTokenApi });
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

    it('calls the Token API with the decimal chain ID and the TokenListController query shape', async () => {
      await withController(
        { tokenListByChain: {} },
        async ({ controller, mockTokenApi }) => {
          await controller.getTokensToCheck(POLYGON_CHAIN_ID);
          expect(mockTokenApi.fetchTokenList).toHaveBeenCalledWith(137, {
            occurrenceFloor: 3,
            ...EXPECTED_TOKEN_LIST_QUERY,
          });
        },
      );
    });

    it('does not pass a `first` cap so the API returns the full per-chain list', async () => {
      // Detection deliberately scans the entire occurrenceFloor list (no
      // top-N slice) — guard against a client-side cap creeping back in.
      await withController(async ({ controller, mockTokenApi }) => {
        await controller.getTokensToCheck(MAINNET_CHAIN_ID);
        const [, queryOptions] = mockTokenApi.fetchTokenList.mock.calls[0];
        expect(queryOptions).not.toHaveProperty('first');
      });
    });

    describe('occurrence floor', () => {
      it('uses the suggested occurrence floor from the Token API for Linea', async () => {
        await withController(async ({ controller, mockTokenApi }) => {
          await controller.getTokensToCheck(LINEA_MAINNET_CHAIN_ID);
          expect(mockTokenApi.fetchTokenList).toHaveBeenCalledWith(
            59144,
            expect.objectContaining({ occurrenceFloor: 1 }),
          );
        });
      });

      it('uses the per-chain suggested occurrence floor (Monad → 1)', async () => {
        await withController(async ({ controller, mockTokenApi }) => {
          await controller.getTokensToCheck(MONAD_CHAIN_ID);
          expect(mockTokenApi.fetchTokenList).toHaveBeenCalledWith(
            143,
            expect.objectContaining({ occurrenceFloor: 1 }),
          );
        });
      });

      it('falls back to occurrenceFloor=3 when the chain is missing from suggested floors', async () => {
        // MegaETH is supported but omitted from DEFAULT_SUGGESTED_OCCURRENCE_FLOORS.
        await withController(async ({ controller, mockTokenApi }) => {
          await controller.getTokensToCheck(MEGAETH_MAINNET_CHAIN_ID);
          expect(mockTokenApi.fetchTokenList).toHaveBeenCalledWith(
            4326,
            expect.objectContaining({ occurrenceFloor: 3 }),
          );
        });
      });

      it('falls back to occurrenceFloor=3 when the suggested floors fetch fails', async () => {
        await withController(async ({ controller, mockTokenApi }) => {
          mockTokenApi.fetchV1SuggestedOccurrenceFloors.mockRejectedValue(
            new Error('floors unavailable'),
          );

          await controller.getTokensToCheck(LINEA_MAINNET_CHAIN_ID);

          expect(mockTokenApi.fetchTokenList).toHaveBeenCalledWith(
            59144,
            expect.objectContaining({ occurrenceFloor: 3 }),
          );
        });
      });
    });

    describe('supported networks check', () => {
      it('returns an empty array for a chain not in the supported-networks list', async () => {
        await withController(
          {
            tokenListByChain: {
              [UNSUPPORTED_CHAIN_ID]: [
                {
                  address: TEST_TOKEN_1,
                  symbol: 'USDC',
                  name: 'USD Coin',
                  decimals: 6,
                },
              ],
            },
          },
          async ({ controller }) => {
            expect(
              await controller.getTokensToCheck(UNSUPPORTED_CHAIN_ID),
            ).toStrictEqual([]);
          },
        );
      });

      it('does not call the token-list or floors endpoints for unsupported chains', async () => {
        await withController(async ({ controller, mockTokenApi }) => {
          await controller.getTokensToCheck(UNSUPPORTED_CHAIN_ID);

          expect(mockTokenApi.fetchV2SupportedNetworks).toHaveBeenCalledTimes(
            1,
          );
          expect(
            mockTokenApi.fetchV1SuggestedOccurrenceFloors,
          ).not.toHaveBeenCalled();
          expect(mockTokenApi.fetchTokenList).not.toHaveBeenCalled();
        });
      });

      it('returns the token list for a chain in fullSupport', async () => {
        await withController(
          {
            tokenListByChain: {
              [MAINNET_CHAIN_ID]: [
                {
                  address: TEST_TOKEN_1,
                  symbol: 'USDC',
                  name: 'USD Coin',
                  decimals: 6,
                },
              ],
            },
          },
          async ({ controller }) => {
            expect(
              await controller.getTokensToCheck(MAINNET_CHAIN_ID),
            ).toStrictEqual([TEST_TOKEN_1]);
          },
        );
      });

      it('returns the token list for a chain in partialSupport', async () => {
        await withController(
          {
            tokenListByChain: {
              [MEGAETH_MAINNET_CHAIN_ID]: [
                {
                  address: TEST_TOKEN_1,
                  symbol: 'USDC',
                  name: 'USD Coin',
                  decimals: 6,
                },
              ],
            },
          },
          async ({ controller }) => {
            expect(
              await controller.getTokensToCheck(MEGAETH_MAINNET_CHAIN_ID),
            ).toStrictEqual([TEST_TOKEN_1]);
          },
        );
      });

      it('returns an empty array when the supported-networks request fails', async () => {
        await withController(
          {
            tokenListByChain: {
              [MAINNET_CHAIN_ID]: [
                {
                  address: TEST_TOKEN_1,
                  symbol: 'USDC',
                  name: 'USD Coin',
                  decimals: 6,
                },
              ],
            },
          },
          async ({ controller, mockTokenApi }) => {
            mockTokenApi.fetchV2SupportedNetworks.mockRejectedValue(
              new Error('Network error'),
            );

            expect(
              await controller.getTokensToCheck(MAINNET_CHAIN_ID),
            ).toStrictEqual([]);
            expect(mockTokenApi.fetchTokenList).not.toHaveBeenCalled();
          },
        );
      });
    });

    describe('token list mapping', () => {
      it('maps a Token API item to a TokenListEntry preserving aggregators, iconUrl and occurrences', async () => {
        await withController(
          {
            tokenListByChain: {
              [MAINNET_CHAIN_ID]: [
                {
                  address: TEST_TOKEN_1,
                  symbol: 'USDC',
                  name: 'USD Coin',
                  decimals: 6,
                  occurrences: 10,
                  aggregators: ['coinGecko', 'oneInch', 'sushiSwap'],
                  iconUrl: 'https://example.com/usdc.png',
                },
              ],
            },
          },
          async ({ controller, mockMulticallClient }) => {
            mockMulticallClient.batchBalanceOf.mockResolvedValue([
              createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1'),
            ]);

            const result = await controller.detectTokens(
              MAINNET_CHAIN_ID,
              TEST_ACCOUNT_ID,
              TEST_ACCOUNT,
            );

            expect(result.detectedAssets[0]).toMatchObject({
              symbol: 'USDC',
              name: 'USD Coin',
              decimals: 6,
              image: 'https://example.com/usdc.png',
              aggregators: ['coinGecko', 'oneInch', 'sushiSwap'],
            });
          },
        );
      });

      it('defaults symbol and name to empty strings and decimals to 18 when the API omits them', async () => {
        await withController(
          {
            tokenListByChain: {
              [MAINNET_CHAIN_ID]: [
                { address: TEST_TOKEN_1 } as unknown as TokenMetadata,
              ],
            },
          },
          async ({ controller, mockMulticallClient }) => {
            mockMulticallClient.batchBalanceOf.mockResolvedValue([
              createMockBalanceResponse(TEST_TOKEN_1, TEST_ACCOUNT, true, '1'),
            ]);

            const result = await controller.detectTokens(
              MAINNET_CHAIN_ID,
              TEST_ACCOUNT_ID,
              TEST_ACCOUNT,
            );

            expect(result.detectedAssets[0]).toMatchObject({
              symbol: '',
              name: '',
              decimals: 18,
            });
            expect(result.detectedBalances[0].decimals).toBe(18);
          },
        );
      });

      it('returns an empty array if the token-list response is not an array', async () => {
        await withController(async ({ controller, mockTokenApi }) => {
          mockTokenApi.fetchTokenList.mockResolvedValue({
            unexpected: 'shape',
          } as unknown as TokenMetadata[]);

          expect(
            await controller.getTokensToCheck(MAINNET_CHAIN_ID),
          ).toStrictEqual([]);
        });
      });
    });

    describe('Linea mainnet aggregator filter', () => {
      // Mirrors the filter applied in `fetchTokenListByChainId`
      // (assets-controllers/src/token-service.ts) so the RPC token detector
      // sees the same Linea token set as TokenListController.
      const lineaItem = (
        address: Address,
        aggregators?: string[],
      ): TokenMetadata => ({
        address,
        symbol: 'T',
        name: 'T',
        decimals: 18,
        ...(aggregators ? { aggregators } : {}),
      });

      it('keeps entries flagged by `lineaTeam` regardless of aggregator count', async () => {
        await withController(
          {
            tokenListByChain: {
              [LINEA_MAINNET_CHAIN_ID]: [
                lineaItem(TEST_TOKEN_1, ['lineaTeam']),
              ],
            },
          },
          async ({ controller }) => {
            expect(
              await controller.getTokensToCheck(LINEA_MAINNET_CHAIN_ID),
            ).toStrictEqual([TEST_TOKEN_1]);
          },
        );
      });

      it('keeps entries with at least 3 aggregators even without `lineaTeam`', async () => {
        await withController(
          {
            tokenListByChain: {
              [LINEA_MAINNET_CHAIN_ID]: [
                lineaItem(TEST_TOKEN_1, ['agg1', 'agg2', 'agg3']),
              ],
            },
          },
          async ({ controller }) => {
            expect(
              await controller.getTokensToCheck(LINEA_MAINNET_CHAIN_ID),
            ).toStrictEqual([TEST_TOKEN_1]);
          },
        );
      });

      it('drops entries with fewer than 3 aggregators and no `lineaTeam` flag, or no aggregators at all', async () => {
        await withController(
          {
            tokenListByChain: {
              [LINEA_MAINNET_CHAIN_ID]: [
                lineaItem(TEST_TOKEN_1, ['agg1', 'agg2']),
                lineaItem(TEST_TOKEN_2),
              ],
            },
          },
          async ({ controller }) => {
            expect(
              await controller.getTokensToCheck(LINEA_MAINNET_CHAIN_ID),
            ).toStrictEqual([]);
          },
        );
      });

      it('does not apply the Linea filter on other chains', async () => {
        await withController(
          {
            tokenListByChain: {
              [MAINNET_CHAIN_ID]: [lineaItem(TEST_TOKEN_1, ['agg1'])],
            },
          },
          async ({ controller }) => {
            expect(
              await controller.getTokensToCheck(MAINNET_CHAIN_ID),
            ).toStrictEqual([TEST_TOKEN_1]);
          },
        );
      });
    });

    describe('stale cache fallback', () => {
      it('serves the previously fetched list when the token-list request fails', async () => {
        await withController(
          {
            tokenListByChain: {
              [MAINNET_CHAIN_ID]: [
                {
                  address: TEST_TOKEN_1,
                  symbol: 'USDC',
                  name: 'USD Coin',
                  decimals: 6,
                },
              ],
            },
          },
          async ({ controller, mockTokenApi }) => {
            expect(
              await controller.getTokensToCheck(MAINNET_CHAIN_ID),
            ).toStrictEqual([TEST_TOKEN_1]);

            mockTokenApi.fetchTokenList.mockRejectedValue(
              new Error('HTTP 503'),
            );

            expect(
              await controller.getTokensToCheck(MAINNET_CHAIN_ID),
            ).toStrictEqual([TEST_TOKEN_1]);
          },
        );
      });

      it('returns an empty array when the token-list request fails and nothing is cached', async () => {
        await withController(async ({ controller, mockTokenApi }) => {
          mockTokenApi.fetchTokenList.mockRejectedValue(new Error('HTTP 503'));

          expect(
            await controller.getTokensToCheck(MAINNET_CHAIN_ID),
          ).toStrictEqual([]);
        });
      });
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
