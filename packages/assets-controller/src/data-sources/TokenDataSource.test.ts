import type { V3AssetResponse } from '@metamask/core-backend';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import type {
  BulkTokenScanResponse,
  PhishingControllerBulkScanTokensAction,
} from '@metamask/phishing-controller';
import { TokenScanResultType } from '@metamask/phishing-controller';

import type { AssetsControllerMessenger } from '../AssetsController';
import type { Context, DataRequest, Caip19AssetId, ChainId } from '../types';
import type { TokenDataSourceOptions } from './TokenDataSource';
import { TokenDataSource } from './TokenDataSource';

type AllActions = PhishingControllerBulkScanTokensAction;
type AllEvents = never;

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_TOKEN_ASSET =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const MOCK_NATIVE_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;
const MOCK_SPL_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/spl:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Caip19AssetId;

type MockApiClient = {
  tokens: {
    fetchTokenV2SupportedNetworks: jest.Mock;
    fetchV3Assets: jest.Mock;
  };
};

type SetupResult = {
  controller: TokenDataSource;
  messenger: AssetsControllerMessenger;
  apiClient: MockApiClient;
};

function createTestMessenger(
  bulkScanTokens: PhishingControllerBulkScanTokensAction['handler'] = async (): Promise<BulkTokenScanResponse> => ({}),
): AssetsControllerMessenger {
  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'PhishingController:bulkScanTokens',
    bulkScanTokens,
  );
  return rootMessenger as unknown as AssetsControllerMessenger;
}

function createMockApiClient(
  supportedNetworks: string[] = ['eip155:1'],
  assetsResponse: V3AssetResponse[] = [],
): MockApiClient {
  return {
    tokens: {
      fetchTokenV2SupportedNetworks: jest.fn().mockResolvedValue({
        fullSupport: supportedNetworks,
        partialSupport: [],
      }),
      fetchV3Assets: jest.fn().mockResolvedValue(assetsResponse),
    },
  };
}

function createMockAssetResponse(
  assetId: string,
  overrides?: Partial<V3AssetResponse>,
): V3AssetResponse {
  return {
    assetId,
    name: 'Test Token',
    symbol: 'TEST',
    decimals: 18,
    iconUrl: 'https://example.com/icon.png',
    coingeckoId: 'test-token',
    occurrences: 5,
    aggregators: ['metamask'],
    labels: ['defi'],
    erc20Permit: true,
    fees: { avgFee: 0, maxFee: 0, minFee: 0 },
    honeypotStatus: { honeypotIs: false },
    storage: { balance: 1, approval: 2 },
    isContractVerified: true,
    ...overrides,
  };
}

const mockAccount = {
  id: 'mock-account-id',
  address: MOCK_ADDRESS,
};
function createDataRequest(
  overrides?: Partial<DataRequest> & {
    accounts?: { id: string; address: string }[];
  },
): DataRequest {
  const chainIds = overrides?.chainIds ?? [CHAIN_MAINNET];
  const accounts = overrides?.accounts ?? [mockAccount];
  const { accounts: _a, ...rest } = overrides ?? {};
  return {
    chainIds,
    accountsWithSupportedChains: accounts.map((a) => ({
      account: a,
      supportedChains: chainIds,
    })),
    dataTypes: ['metadata'],
    ...rest,
  } as DataRequest;
}

function createMiddlewareContext(overrides?: Partial<Context>): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest.fn().mockReturnValue({
      assetsInfo: {},
    }),
    ...overrides,
  };
}

function setupController(options: {
  messenger: AssetsControllerMessenger;
  supportedNetworks?: string[];
  assetsResponse?: V3AssetResponse[];
  nativeAssetIds?: string[];
}): SetupResult {
  const {
    messenger,
    supportedNetworks = ['eip155:1'],
    assetsResponse = [],
    nativeAssetIds = [],
  } = options;

  const apiClient = createMockApiClient(supportedNetworks, assetsResponse);

  const controller = new TokenDataSource(messenger, {
    queryApiClient:
      apiClient as unknown as TokenDataSourceOptions['queryApiClient'],
    getNativeAssetIds: (): string[] => nativeAssetIds,
  });

  return {
    controller,
    messenger,
    apiClient,
  };
}

describe('TokenDataSource', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct name', () => {
    const { controller } = setupController({
      messenger: createTestMessenger(),
    });
    expect(controller.name).toBe('TokenDataSource');
  });

  it('exposes assetsMiddleware on instance', () => {
    const { controller } = setupController({
      messenger: createTestMessenger(),
    });

    const middleware = controller.assetsMiddleware;
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('middleware passes to next when no detected assets', async () => {
    const { controller } = setupController({
      messenger: createTestMessenger(),
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {},
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware passes to next when detected assets is empty', async () => {
    const { controller } = setupController({
      messenger: createTestMessenger(),
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: { detectedAssets: {} },
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware fetches metadata for detected assets', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [createMockAssetResponse(MOCK_TOKEN_ASSET)],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_TOKEN_ASSET],
      {
        includeIconUrl: true,
        includeLabels: true,
        includeMarketData: true,
        includeMetadata: true,
        includeRwaData: true,
        includeAggregators: true,
        includeOccurrences: true,
      },
    );
    expect(context.response.assetsInfo?.[MOCK_TOKEN_ASSET]).toStrictEqual({
      type: 'erc20',
      name: 'Test Token',
      symbol: 'TEST',
      decimals: 18,
      image: 'https://example.com/icon.png',
      coingeckoId: 'test-token',
      occurrences: 5,
      aggregators: ['metamask'],
      labels: ['defi'],
      erc20Permit: true,
      fees: { avgFee: 0, maxFee: 0, minFee: 0 },
      honeypotStatus: { honeypotIs: false },
      storage: { balance: 1, approval: 2 },
      isContractVerified: true,
      description: undefined,
    });
    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware skips assets with existing metadata containing image in response', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
        assetsInfo: {
          [MOCK_TOKEN_ASSET]: {
            type: 'erc20',
            name: 'Existing',
            symbol: 'EXT',
            decimals: 18,
            image: 'https://existing.com/icon.png',
          },
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware skips assets with existing metadata containing image in state', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
      getAssetsState: jest.fn().mockReturnValue({
        assetsInfo: {
          [MOCK_TOKEN_ASSET]: {
            type: 'erc20',
            name: 'State Token',
            symbol: 'STT',
            decimals: 18,
            image: 'https://state.com/icon.png',
          },
        },
      }),
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware fetches metadata for assets without image in existing metadata', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [createMockAssetResponse(MOCK_TOKEN_ASSET)],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
        assetsInfo: {
          [MOCK_TOKEN_ASSET]: {
            type: 'erc20',
            name: 'Existing',
            symbol: 'EXT',
            decimals: 18,
          },
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_TOKEN_ASSET],
      {
        includeIconUrl: true,
        includeLabels: true,
        includeMarketData: true,
        includeMetadata: true,
        includeRwaData: true,
        includeAggregators: true,
        includeOccurrences: true,
      },
    );
  });

  it('middleware filters assets by supported networks', async () => {
    const unsupportedAsset =
      'eip155:137/erc20:0x0000000000000000000000000000000000001010' as Caip19AssetId;

    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [createMockAssetResponse(MOCK_TOKEN_ASSET)],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET, unsupportedAsset],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_TOKEN_ASSET],
      {
        includeIconUrl: true,
        includeLabels: true,
        includeMarketData: true,
        includeMetadata: true,
        includeRwaData: true,
        includeAggregators: true,
        includeOccurrences: true,
      },
    );
  });

  it('middleware passes to next when no assets from supported networks', async () => {
    const unsupportedAsset =
      'eip155:137/erc20:0x0000000000000000000000000000000000001010' as Caip19AssetId;

    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [unsupportedAsset],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware handles getSupportedNetworks error gracefully', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
    });

    apiClient.tokens.fetchTokenV2SupportedNetworks.mockRejectedValueOnce(
      new Error('Network Error'),
    );

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware handles fetchV3Assets error gracefully', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
    });

    apiClient.tokens.fetchV3Assets.mockRejectedValueOnce(
      new Error('API Error'),
    );

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware transforms native asset type correctly', async () => {
    const { controller } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [
        createMockAssetResponse(MOCK_NATIVE_ASSET, {
          name: 'Ethereum',
          symbol: 'ETH',
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_NATIVE_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsInfo?.[MOCK_NATIVE_ASSET]?.type).toBe(
      'native',
    );
  });

  it('middleware transforms SPL token type correctly', async () => {
    const { controller } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      assetsResponse: [
        createMockAssetResponse(MOCK_SPL_ASSET, {
          name: 'USD Coin',
          symbol: 'USDC',
          decimals: 6,
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_SPL_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsInfo?.[MOCK_SPL_ASSET]?.type).toBe('spl');
  });

  it('middleware merges metadata into existing response', async () => {
    const anotherAsset =
      'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f' as Caip19AssetId;

    const { controller } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [createMockAssetResponse(MOCK_TOKEN_ASSET)],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        assetsInfo: {
          [anotherAsset]: {
            type: 'erc20',
            name: 'DAI',
            symbol: 'DAI',
            decimals: 18,
            image: 'https://dai.com/icon.png',
          },
        },
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsInfo?.[anotherAsset]).toBeDefined();
    expect(context.response.assetsInfo?.[MOCK_TOKEN_ASSET]).toBeDefined();
  });

  it('middleware handles multiple detected assets from multiple accounts', async () => {
    const secondAsset =
      'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f' as Caip19AssetId;

    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [
        createMockAssetResponse(MOCK_TOKEN_ASSET),
        createMockAssetResponse(secondAsset, {
          name: 'DAI',
          symbol: 'DAI',
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'account-1': [MOCK_TOKEN_ASSET],
          'account-2': [secondAsset],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      expect.arrayContaining([MOCK_TOKEN_ASSET, secondAsset]),
      {
        includeIconUrl: true,
        includeLabels: true,
        includeMarketData: true,
        includeMetadata: true,
        includeRwaData: true,
        includeAggregators: true,
        includeOccurrences: true,
      },
    );
    expect(context.response.assetsInfo?.[MOCK_TOKEN_ASSET]).toBeDefined();
    expect(context.response.assetsInfo?.[secondAsset]).toBeDefined();
  });

  it('middleware deduplicates assets across accounts', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [createMockAssetResponse(MOCK_TOKEN_ASSET)],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'account-1': [MOCK_TOKEN_ASSET],
          'account-2': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_TOKEN_ASSET],
      {
        includeIconUrl: true,
        includeLabels: true,
        includeMarketData: true,
        includeMetadata: true,
        includeRwaData: true,
        includeAggregators: true,
        includeOccurrences: true,
      },
    );
  });

  it('middleware splits large asset lists into batches of 50', async () => {
    // Generate 120 distinct ERC-20 asset IDs to exceed the 50-item batch limit.
    const assetIds = Array.from(
      { length: 120 },
      (_, i) =>
        `eip155:1/erc20:0x${String(i).padStart(40, '0')}` as Caip19AssetId,
    );
    const assetsResponse = assetIds.map((id) => createMockAssetResponse(id));

    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse,
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': assetIds,
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    // With 120 assets and a batch size of 50, the API should be called three times.
    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledTimes(3);
    expect(apiClient.tokens.fetchV3Assets.mock.calls[0][0]).toHaveLength(50);
    expect(apiClient.tokens.fetchV3Assets.mock.calls[1][0]).toHaveLength(50);
    expect(apiClient.tokens.fetchV3Assets.mock.calls[2][0]).toHaveLength(20);
  });

  it('middleware includes partial support networks', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
    });

    apiClient.tokens.fetchTokenV2SupportedNetworks.mockResolvedValueOnce({
      fullSupport: [],
      partialSupport: ['eip155:1'],
    });
    apiClient.tokens.fetchV3Assets.mockResolvedValueOnce([
      createMockAssetResponse(MOCK_TOKEN_ASSET),
    ]);

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_TOKEN_ASSET],
      {
        includeIconUrl: true,
        includeLabels: true,
        includeMarketData: true,
        includeMetadata: true,
        includeRwaData: true,
        includeAggregators: true,
        includeOccurrences: true,
      },
    );
  });

  it('middleware filters out invalid CAIP asset IDs', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [createMockAssetResponse(MOCK_TOKEN_ASSET)],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [
            MOCK_TOKEN_ASSET,
            'invalid-asset-id' as Caip19AssetId,
          ],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_TOKEN_ASSET],
      {
        includeIconUrl: true,
        includeLabels: true,
        includeMarketData: true,
        includeMetadata: true,
        includeRwaData: true,
        includeAggregators: true,
        includeOccurrences: true,
      },
    );
  });

  it('middleware filters out erc20 assets with insufficient occurrences', async () => {
    const spamAsset =
      'eip155:1/erc20:0x1111111111111111111111111111111111111111' as Caip19AssetId;

    const { controller } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [
        createMockAssetResponse(MOCK_TOKEN_ASSET, { occurrences: 5 }),
        createMockAssetResponse(spamAsset, { occurrences: 1 }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET, spamAsset],
        },
        assetsBalance: {
          'mock-account-id': {
            [MOCK_TOKEN_ASSET]: { amount: '100' },
            [spamAsset]: { amount: '50' },
          },
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsInfo?.[MOCK_TOKEN_ASSET]).toBeDefined();
    expect(context.response.assetsInfo?.[spamAsset]).toBeUndefined();

    const accountBalances = context.response.assetsBalance?.[
      'mock-account-id'
    ] as Record<string, unknown> | undefined;
    expect(accountBalances?.[MOCK_TOKEN_ASSET]).toBeDefined();
    expect(accountBalances?.[spamAsset]).toBeUndefined();

    expect(context.response.detectedAssets?.['mock-account-id']).toContain(
      MOCK_TOKEN_ASSET,
    );
    expect(context.response.detectedAssets?.['mock-account-id']).not.toContain(
      spamAsset,
    );
  });

  it('middleware filters out erc20 assets with missing occurrences', async () => {
    const noOccurrenceAsset =
      'eip155:1/erc20:0x2222222222222222222222222222222222222222' as Caip19AssetId;

    const { controller } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      assetsResponse: [
        createMockAssetResponse(noOccurrenceAsset, { occurrences: undefined }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [noOccurrenceAsset],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    // EVM tokens without occurrence data (treated as 0) are filtered out.
    expect(context.response.assetsInfo?.[noOccurrenceAsset]).toBeUndefined();
  });

  it('middleware filters out non-evm token assets flagged malicious by Blockaid', async () => {
    const maliciousSolanaToken =
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Caip19AssetId;
    const benignSolanaToken =
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:So11111111111111111111111111111111111111112' as Caip19AssetId;

    const { controller } = setupController({
      messenger: createTestMessenger(async ({ tokens }) => {
        const out: BulkTokenScanResponse = {};
        for (const addr of tokens) {
          out[addr] =
            addr === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
              ? {
                  result_type: TokenScanResultType.Malicious,
                  chain: 'solana',
                  address: addr,
                }
              : {
                  result_type: TokenScanResultType.Benign,
                  chain: 'solana',
                  address: addr,
                };
        }
        return out;
      }),
      supportedNetworks: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      assetsResponse: [
        createMockAssetResponse(maliciousSolanaToken),
        createMockAssetResponse(benignSolanaToken),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [maliciousSolanaToken, benignSolanaToken],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsInfo?.[benignSolanaToken]).toBeDefined();
    expect(context.response.assetsInfo?.[maliciousSolanaToken]).toBeUndefined();
  });

  it('middleware keeps native assets regardless of occurrences', async () => {
    const { controller } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      nativeAssetIds: [MOCK_NATIVE_ASSET],
      assetsResponse: [
        createMockAssetResponse(MOCK_NATIVE_ASSET, {
          name: 'Ethereum',
          symbol: 'ETH',
          occurrences: 0,
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {},
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsInfo?.[MOCK_NATIVE_ASSET]).toBeDefined();
    expect(context.response.assetsInfo?.[MOCK_NATIVE_ASSET]?.type).toBe(
      'native',
    );
  });

  it('middleware always includes native asset IDs in the fetch', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      nativeAssetIds: [MOCK_NATIVE_ASSET],
      assetsResponse: [
        createMockAssetResponse(MOCK_TOKEN_ASSET),
        createMockAssetResponse(MOCK_NATIVE_ASSET, {
          name: 'Ethereum',
          symbol: 'ETH',
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      expect.arrayContaining([MOCK_TOKEN_ASSET, MOCK_NATIVE_ASSET]),
      expect.objectContaining({ includeIconUrl: true }),
    );
    expect(context.response.assetsInfo?.[MOCK_NATIVE_ASSET]).toBeDefined();
    expect(context.response.assetsInfo?.[MOCK_NATIVE_ASSET]?.type).toBe(
      'native',
    );
  });

  it('middleware fetches native asset IDs even when detectedAssets is undefined', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      nativeAssetIds: [MOCK_NATIVE_ASSET],
      assetsResponse: [
        createMockAssetResponse(MOCK_NATIVE_ASSET, {
          name: 'Ethereum',
          symbol: 'ETH',
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    // detectedAssets is intentionally omitted (undefined) to mirror the real-world
    // case where DetectionMiddleware finds zero balances and zero custom assets
    const context = createMiddlewareContext({
      response: {},
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      expect.objectContaining({ includeIconUrl: true }),
    );
    expect(context.response.assetsInfo?.[MOCK_NATIVE_ASSET]).toBeDefined();
  });

  it('middleware fetches native asset IDs when detectedAssets is an empty object', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      nativeAssetIds: [MOCK_NATIVE_ASSET],
      assetsResponse: [
        createMockAssetResponse(MOCK_NATIVE_ASSET, {
          name: 'Ethereum',
          symbol: 'ETH',
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      expect.objectContaining({ includeIconUrl: true }),
    );
    expect(context.response.assetsInfo?.[MOCK_NATIVE_ASSET]).toBeDefined();
  });

  it('middleware deduplicates native asset IDs with detected assets', async () => {
    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1'],
      nativeAssetIds: [MOCK_NATIVE_ASSET],
      assetsResponse: [
        createMockAssetResponse(MOCK_NATIVE_ASSET, {
          name: 'Ethereum',
          symbol: 'ETH',
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_NATIVE_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      expect.objectContaining({ includeIconUrl: true }),
    );
  });

  it('middleware includes multiple native asset IDs across chains', async () => {
    const polygonNativeAsset = 'eip155:137/slip44:966' as Caip19AssetId;

    const { controller, apiClient } = setupController({
      messenger: createTestMessenger(),
      supportedNetworks: ['eip155:1', 'eip155:137'],
      nativeAssetIds: [MOCK_NATIVE_ASSET, polygonNativeAsset],
      assetsResponse: [
        createMockAssetResponse(MOCK_NATIVE_ASSET, {
          name: 'Ethereum',
          symbol: 'ETH',
        }),
        createMockAssetResponse(polygonNativeAsset, {
          name: 'Polygon',
          symbol: 'POL',
        }),
      ],
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.tokens.fetchV3Assets).toHaveBeenCalledWith(
      expect.arrayContaining([
        MOCK_TOKEN_ASSET,
        MOCK_NATIVE_ASSET,
        polygonNativeAsset,
      ]),
      expect.objectContaining({ includeIconUrl: true }),
    );
  });
});
