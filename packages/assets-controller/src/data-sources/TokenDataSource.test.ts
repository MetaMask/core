import type { V3AssetResponse } from '@metamask/core-backend';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import type { TokenDataSourceOptions } from './TokenDataSource';
import { TokenDataSource } from './TokenDataSource';
import type { Context, DataRequest, Caip19AssetId, ChainId } from '../types';

type AllActions = never;
type AllEvents = never;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

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
  messenger: RootMessenger;
  apiClient: MockApiClient;
};

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

function setupController(
  options: {
    supportedNetworks?: string[];
    assetsResponse?: V3AssetResponse[];
  } = {},
): SetupResult {
  const { supportedNetworks = ['eip155:1'], assetsResponse = [] } = options;

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const apiClient = createMockApiClient(supportedNetworks, assetsResponse);

  const controller = new TokenDataSource({
    queryApiClient:
      apiClient as unknown as TokenDataSourceOptions['queryApiClient'],
  });

  return {
    controller,
    messenger: rootMessenger,
    apiClient,
  };
}

describe('TokenDataSource', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct name', () => {
    const { controller } = setupController();
    expect(controller.name).toBe('TokenDataSource');
  });

  it('exposes assetsMiddleware on instance', () => {
    const { controller } = setupController();

    const middleware = controller.assetsMiddleware;
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  it('middleware passes to next when no detected assets', async () => {
    const { controller } = setupController();

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {},
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware passes to next when detected assets is empty', async () => {
    const { controller } = setupController();

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: { detectedAssets: {} },
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware fetches metadata for detected assets', async () => {
    const { controller, apiClient } = setupController({
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
      },
    );
  });

  it('middleware filters assets by supported networks', async () => {
    const unsupportedAsset =
      'eip155:137/erc20:0x0000000000000000000000000000000000001010' as Caip19AssetId;

    const { controller, apiClient } = setupController({
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
      },
    );
  });

  it('middleware passes to next when no assets from supported networks', async () => {
    const unsupportedAsset =
      'eip155:137/erc20:0x0000000000000000000000000000000000001010' as Caip19AssetId;

    const { controller, apiClient } = setupController({
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
    const { controller, apiClient } = setupController();

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
      },
    );
    expect(context.response.assetsInfo?.[MOCK_TOKEN_ASSET]).toBeDefined();
    expect(context.response.assetsInfo?.[secondAsset]).toBeDefined();
  });

  it('middleware deduplicates assets across accounts', async () => {
    const { controller, apiClient } = setupController({
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
      },
    );
  });

  it('middleware includes partial support networks', async () => {
    const { controller, apiClient } = setupController();

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
      },
    );
  });

  it('middleware filters out invalid CAIP asset IDs', async () => {
    const { controller, apiClient } = setupController({
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
      },
    );
  });
});
