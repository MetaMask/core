import type { SupportedCurrency } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  ChainId,
  DataRequest,
  Context,
  Caip19AssetId,
  AssetsControllerStateInternal,
} from '../types.js';
import { normalizeAssetId } from '../utils/index.js';
import type { PriceDataSourceOptions } from './PriceDataSource.js';
import { PriceDataSource } from './PriceDataSource.js';

jest.useFakeTimers();

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_TOKEN_ASSET =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const MOCK_NATIVE_ASSET = 'eip155:1/slip44:60' as Caip19AssetId;

type MockApiClient = {
  prices: {
    fetchV3SpotPrices: jest.Mock;
  };
};

type SetupResult = {
  controller: PriceDataSource;
  apiClient: MockApiClient;
  getAssetsState: () => AssetsControllerStateInternal;
  assetsUpdateHandler: jest.Mock;
};

function createMockAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: 'mock-account-id',
    address: MOCK_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

function createDataRequest(
  overrides?: Partial<DataRequest> & { accounts?: InternalAccount[] },
): DataRequest {
  const chainIds = overrides?.chainIds ?? [CHAIN_MAINNET];
  const accounts = overrides?.accounts ?? [createMockAccount()];
  const { accounts: _a, ...rest } = overrides ?? {};
  return {
    chainIds,
    accountsWithSupportedChains: accounts.map((a) => ({
      account: a,
      supportedChains: chainIds,
    })),
    dataTypes: ['price'],
    ...rest,
  };
}

function createMiddlewareContext(overrides?: Partial<Context>): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest.fn().mockReturnValue({ assetsPrice: {} }),
    ...overrides,
  };
}

function createMockApiClient(
  priceResponse: Record<string, unknown> = {},
): MockApiClient {
  return {
    prices: {
      fetchV3SpotPrices: jest.fn().mockResolvedValue(priceResponse),
    },
  };
}

type MockPriceData = {
  price: number;
  pricePercentChange1d: number;
  marketCap: number;
  totalVolume: number;
};

function createMockPriceData(price: number = 100): MockPriceData {
  return {
    price,
    pricePercentChange1d: 2.5,
    marketCap: 1000000000,
    totalVolume: 50000000,
  };
}

function setupController(
  options: {
    priceResponse?: Record<string, unknown>;
    balanceState?: Record<string, Record<string, unknown>>;
    getSelectedCurrency?: () => SupportedCurrency;
    pollInterval?: number;
  } = {},
): SetupResult {
  const {
    priceResponse = {},
    balanceState = {},
    getSelectedCurrency = (): SupportedCurrency => 'usd',
    pollInterval,
  } = options;

  const apiClient = createMockApiClient(priceResponse);

  const controllerOptions: PriceDataSourceOptions = {
    queryApiClient:
      apiClient as unknown as PriceDataSourceOptions['queryApiClient'],
    getSelectedCurrency,
  };

  if (pollInterval) {
    controllerOptions.pollInterval = pollInterval;
  }

  const controller = new PriceDataSource(controllerOptions);

  const getAssetsState = (): AssetsControllerStateInternal =>
    ({ assetsBalance: balanceState }) as AssetsControllerStateInternal;
  const assetsUpdateHandler = jest.fn().mockResolvedValue(undefined);

  return {
    controller,
    apiClient,
    getAssetsState,
    assetsUpdateHandler,
  };
}

describe('PriceDataSource', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('initializes with correct name', () => {
    const { controller } = setupController();
    expect(controller.getName()).toBe('PriceDataSource');
    controller.destroy();
  });

  it('exposes assetsMiddleware on instance', () => {
    const { controller } = setupController();

    const middleware = controller.assetsMiddleware;
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');

    controller.destroy();
  });

  it('fetch returns empty response when no assets in balance state', async () => {
    const { controller, getAssetsState } = setupController({
      balanceState: {},
    });

    const response = await controller.fetch(
      createDataRequest(),
      getAssetsState,
    );

    expect(response).toStrictEqual({});

    controller.destroy();
  });

  it('fetch retrieves prices for assets in balance state', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    const response = await controller.fetch(
      createDataRequest(),
      getAssetsState,
    );

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      { currency: 'usd', includeMarketData: true },
    );
    expect(response.assetsPrice?.[MOCK_NATIVE_ASSET]).toStrictEqual({
      assetPriceType: 'fungible',
      price: 2500,
      usdPrice: 2500,
      pricePercentChange1d: 2.5,
      lastUpdated: expect.any(Number),
      marketCap: 1000000000,
      totalVolume: 50000000,
    });

    controller.destroy();
  });

  it('fetch skips malformed asset IDs in balance state and still fetches prices for valid assets', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          'not-a-valid-caip19': { amount: '999' },
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    const response = await controller.fetch(
      createDataRequest(),
      getAssetsState,
    );

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      { currency: 'usd', includeMarketData: true },
    );
    expect(response.assetsPrice?.[MOCK_NATIVE_ASSET]).toStrictEqual({
      assetPriceType: 'fungible',
      price: 2500,
      usdPrice: 2500,
      pricePercentChange1d: 2.5,
      lastUpdated: expect.any(Number),
      marketCap: 1000000000,
      totalVolume: 50000000,
    });

    controller.destroy();
  });

  it('fetch splits large asset lists into batches of 50', async () => {
    // Generate 120 distinct mock asset IDs to exceed the 50-item batch limit.
    const assetIds = Array.from(
      { length: 120 },
      (_, i) =>
        `eip155:1/erc20:0x${String(i).padStart(40, '0')}` as Caip19AssetId,
    );
    const priceResponse = Object.fromEntries(
      assetIds.map((id) => [id, createMockPriceData(100)]),
    );
    const balanceState = Object.fromEntries(
      assetIds.map((id) => [id, { amount: '1' }]),
    );

    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: { 'mock-account-id': balanceState },
      priceResponse,
    });

    const response = await controller.fetch(
      createDataRequest({ chainIds: [] }),
      getAssetsState,
    );

    // With 120 assets and a batch size of 50, the API should be called three times.
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(3);
    expect(apiClient.prices.fetchV3SpotPrices.mock.calls[0][0]).toHaveLength(
      50,
    );
    expect(apiClient.prices.fetchV3SpotPrices.mock.calls[1][0]).toHaveLength(
      50,
    );
    expect(apiClient.prices.fetchV3SpotPrices.mock.calls[2][0]).toHaveLength(
      20,
    );
    // All 120 prices should be merged into the response.
    expect(Object.keys(response.assetsPrice ?? {})).toHaveLength(120);

    controller.destroy();
  });

  it('fetch uses custom currency', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      getSelectedCurrency: () => 'eur',
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2300),
      },
    });

    await controller.fetch(createDataRequest(), getAssetsState);

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ currency: 'eur' }),
    );

    controller.destroy();
  });

  it('fetch filters by account ID', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
        'other-account-id': {
          [MOCK_TOKEN_ASSET]: { amount: '1000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.fetch(createDataRequest(), getAssetsState);

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      expect.anything(),
    );

    controller.destroy();
  });

  it('fetch filters by chain ID', async () => {
    const polygonAsset =
      'eip155:137/erc20:0x0000000000000000000000000000000000001010' as Caip19AssetId;
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
          [polygonAsset]: { amount: '5000000000000000000' },
        },
      },
      priceResponse: {
        [polygonAsset]: createMockPriceData(0.5),
      },
    });

    await controller.fetch(
      createDataRequest({ chainIds: [CHAIN_POLYGON] }),
      getAssetsState,
    );

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [polygonAsset],
      expect.anything(),
    );

    controller.destroy();
  });

  it('fetch filters out non-priceable assets', async () => {
    const tronBandwidthAsset =
      'tron:0x2b6653dc/slip44:bandwidth' as Caip19AssetId;
    const tronEnergyAsset = 'tron:0x2b6653dc/slip44:energy' as Caip19AssetId;
    const tronStakedAsset =
      'tron:0x2b6653dc/slip44:195-staked-for-bandwidth' as Caip19AssetId;

    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
          [tronBandwidthAsset]: { amount: '1000' },
          [tronEnergyAsset]: { amount: '5000' },
          [tronStakedAsset]: { amount: '10000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.fetch(createDataRequest({ chainIds: [] }), getAssetsState);

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      expect.anything(),
    );

    controller.destroy();
  });

  it('fetch skips assets with invalid market data', async () => {
    const { controller, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
          [MOCK_TOKEN_ASSET]: { amount: '1000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
        [MOCK_TOKEN_ASSET]: { invalidData: true },
      },
    });

    const response = await controller.fetch(
      createDataRequest({ chainIds: [] }),
      getAssetsState,
    );

    expect(response.assetsPrice?.[MOCK_NATIVE_ASSET]).toBeDefined();
    expect(response.assetsPrice?.[MOCK_TOKEN_ASSET]).toBeUndefined();

    controller.destroy();
  });

  it('fetch handles API errors gracefully', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
    });

    apiClient.prices.fetchV3SpotPrices.mockRejectedValueOnce(
      new Error('API Error'),
    );

    const response = await controller.fetch(
      createDataRequest(),
      getAssetsState,
    );

    expect(response).toStrictEqual({});

    controller.destroy();
  });

  it('fetch handles getState error gracefully', async () => {
    const { controller } = setupController();

    const getAssetsStateThatThrows = (): never => {
      throw new Error('State Error');
    };

    const response = await controller.fetch(
      createDataRequest(),
      getAssetsStateThatThrows,
    );

    expect(response).toStrictEqual({});

    controller.destroy();
  });

  it('subscribe performs initial fetch', async () => {
    const { controller, assetsUpdateHandler, getAssetsState } = setupController(
      {
        balanceState: {
          'mock-account-id': {
            [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
          },
        },
        priceResponse: {
          [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
        },
      },
    );

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
      getAssetsState,
    });

    expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);
    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsPrice: expect.objectContaining({
          [MOCK_NATIVE_ASSET]: expect.any(Object),
        }),
      }),
    );

    controller.destroy();
  });

  it('subscribe polls at specified interval', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      pollInterval: 5000,
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      getAssetsState,
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
    });

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('subscribe uses request updateInterval when provided', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      pollInterval: 60000,
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ updateInterval: 10000 }),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Advance one tick at a time, flushing microtasks between each so the
    // async pollFn completes and inflight promises settle before the next tick.
    for (let i = 2; i <= 7; i++) {
      jest.advanceTimersByTime(10000);
      await jest.advanceTimersByTimeAsync(0);
    }

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(7);

    controller.destroy();
  });

  it('subscribe update refreshes request and fetches missing prices', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Freshness TTL skips re-fetch for the same recently priced asset.
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_POLYGON] }),
      isUpdate: true,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('subscribe update fetches newly held assets that have no price yet', async () => {
    let balanceState: Record<string, Record<string, { amount: string }>> = {};
    const { controller, apiClient, assetsUpdateHandler } = setupController({
      balanceState: {},
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
        [MOCK_TOKEN_ASSET]: createMockPriceData(1),
      },
    });

    const getAssetsState = jest.fn(() => ({
      assetsBalance: balanceState,
      assetsPrice: {},
      assetsInfo: {},
      customAssets: {},
      assetPreferences: {},
      selectedCurrency: 'usd' as const,
    }));

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
      getAssetsState,
    });

    // Initial subscribe had no balances, so no price API call.
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(0);
    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    // Simulate natives/defaults being seeded after the first subscribe.
    balanceState = {
      'mock-account-id': {
        [MOCK_NATIVE_ASSET]: { amount: '0' },
        [MOCK_TOKEN_ASSET]: { amount: '0' },
      },
    };

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: true,
      onAssetsUpdate: assetsUpdateHandler,
      getAssetsState,
    });

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalled();
    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsPrice: expect.objectContaining({
          [MOCK_NATIVE_ASSET]: expect.any(Object),
        }),
        updateMode: 'merge',
      }),
    );

    controller.destroy();
  });

  it('subscribe update swallows onAssetsUpdate errors without throwing', async () => {
    let balanceState: Record<string, Record<string, { amount: string }>> = {};
    const { controller } = setupController({
      balanceState: {},
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    const getAssetsState = jest.fn(() => ({
      assetsBalance: balanceState,
      assetsPrice: {},
      assetsInfo: {},
      customAssets: {},
      assetPreferences: {},
      selectedCurrency: 'usd' as const,
    }));

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });

    balanceState = {
      'mock-account-id': {
        [MOCK_NATIVE_ASSET]: { amount: '0' },
      },
    };

    expect(
      await controller.subscribe({
        subscriptionId: 'sub-1',
        request: createDataRequest(),
        isUpdate: true,
        onAssetsUpdate: jest
          .fn()
          .mockRejectedValue(new Error('handler failed')),
        getAssetsState,
      }),
    ).toBeUndefined();

    controller.destroy();
  });

  it('subscribe does not report when no prices fetched', async () => {
    const { controller, assetsUpdateHandler, getAssetsState } = setupController(
      {
        balanceState: {},
        priceResponse: {},
      },
    );

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
      getAssetsState,
    });

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('unsubscribe stops polling', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      pollInterval: 5000,
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    await controller.unsubscribe('sub-1');

    jest.advanceTimersByTime(10000);
    await Promise.resolve();

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('middleware passes to next when no detected assets', async () => {
    const { controller } = setupController();

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {},
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);

    controller.destroy();
  });

  it('middleware passes to next when detected assets is empty', async () => {
    const { controller } = setupController();

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: { detectedAssets: {} },
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);

    controller.destroy();
  });

  it('middleware passes to next when assetsForPriceUpdate is empty and no detected assets', async () => {
    const { controller, apiClient } = setupController();

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ assetsForPriceUpdate: [] }),
      response: {},
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.prices.fetchV3SpotPrices).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);

    controller.destroy();
  });

  it('middleware fetches prices when assetsForPriceUpdate has values', async () => {
    const { controller, apiClient } = setupController({
      priceResponse: {
        [MOCK_TOKEN_ASSET]: createMockPriceData(1.0),
      },
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ assetsForPriceUpdate: [MOCK_TOKEN_ASSET] }),
      response: {},
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [MOCK_TOKEN_ASSET],
      { currency: 'usd', includeMarketData: true },
    );
    expect(context.response.assetsPrice?.[MOCK_TOKEN_ASSET]).toStrictEqual({
      assetPriceType: 'fungible',
      price: 1.0,
      usdPrice: 1.0,
      pricePercentChange1d: 2.5,
      lastUpdated: expect.any(Number),
      marketCap: 1000000000,
      totalVolume: 50000000,
    });
    expect(next).toHaveBeenCalledWith(context);

    controller.destroy();
  });

  it('middleware fetches prices for detected assets', async () => {
    const { controller, apiClient } = setupController({
      priceResponse: {
        [MOCK_TOKEN_ASSET]: createMockPriceData(1.0),
      },
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

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [normalizeAssetId(MOCK_TOKEN_ASSET)],
      { currency: 'usd', includeMarketData: true },
    );
    expect(context.response.assetsPrice?.[MOCK_TOKEN_ASSET]).toStrictEqual({
      assetPriceType: 'fungible',
      price: 1.0,
      usdPrice: 1.0,
      pricePercentChange1d: 2.5,
      lastUpdated: expect.any(Number),
      marketCap: 1000000000,
      totalVolume: 50000000,
    });
    expect(next).toHaveBeenCalledWith(context);

    controller.destroy();
  });

  it('middleware filters out non-priceable detected assets', async () => {
    const tronBandwidthAsset =
      'tron:0x2b6653dc/slip44:bandwidth' as Caip19AssetId;

    const { controller, apiClient } = setupController({
      priceResponse: {},
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        detectedAssets: {
          'mock-account-id': [tronBandwidthAsset],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(apiClient.prices.fetchV3SpotPrices).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);

    controller.destroy();
  });

  it('middleware handles API error gracefully', async () => {
    const { controller, apiClient } = setupController();

    apiClient.prices.fetchV3SpotPrices.mockRejectedValueOnce(
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

    controller.destroy();
  });

  it('middleware merges prices into existing response', async () => {
    const anotherAsset =
      'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f' as Caip19AssetId;

    const { controller } = setupController({
      priceResponse: {
        [MOCK_TOKEN_ASSET]: createMockPriceData(1.0),
      },
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: {
        assetsPrice: {
          [anotherAsset]: {
            assetPriceType: 'fungible',
            price: 1.0,
            usdPrice: 1.0,
            lastUpdated: Date.now(),
          },
        },
        detectedAssets: {
          'mock-account-id': [MOCK_TOKEN_ASSET],
        },
      },
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsPrice?.[anotherAsset]).toBeDefined();
    expect(context.response.assetsPrice?.[MOCK_TOKEN_ASSET]).toBeDefined();

    controller.destroy();
  });

  it('skips fetching prices for assets fetched within the freshness TTL', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    // First fetch — asset is stale, API is called
    await controller.fetch(createDataRequest(), getAssetsState);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Second fetch immediately after — asset is fresh, API is NOT called again
    await controller.fetch(createDataRequest(), getAssetsState);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('re-fetches prices after the freshness TTL expires', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      pollInterval: 10_000,
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.fetch(createDataRequest(), getAssetsState);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Advance past the TTL (pollInterval = 10s is used as freshness TTL)
    jest.advanceTimersByTime(11_000);

    await controller.fetch(createDataRequest(), getAssetsState);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('caps the freshness TTL below the poll interval so fetch latency does not skip every other poll', async () => {
    const pollInterval = 10_000;
    // `fetchedAt` is stamped when a fetch completes, i.e. slightly after the
    // tick that triggered it. Simulate that latency so the timestamp lands
    // inside the (tick - tick + pollInterval) window. With a TTL equal to the
    // poll interval the asset would still read as "fresh" on the next tick and
    // be skipped, making the subscription re-fetch only every other poll.
    const fetchLatencyMs = 500;

    jest.setSystemTime(fetchLatencyMs);

    const { controller, apiClient, getAssetsState } = setupController({
      pollInterval,
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    // Initial poll: completes at t = fetchLatencyMs, stamping that as the
    // fetched-at time. The cap (0.9 * pollInterval = 9000ms) is applied here.
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Next tick fires one full interval after the logical tick (t = 0), so
    // now - fetchedAt = pollInterval - fetchLatencyMs = 9500ms. That is below
    // the poll interval but above the capped TTL (9000ms), so the asset is
    // stale and must be re-fetched rather than skipped.
    jest.setSystemTime(pollInterval);
    await controller.fetch(createDataRequest(), getAssetsState);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('invalidatePriceCache allows re-fetching assets that were fresh', async () => {
    const { controller, apiClient } = setupController({
      priceResponse: {
        [MOCK_TOKEN_ASSET]: createMockPriceData(1.0),
      },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    // First call — populates freshness cache
    const context1 = createMiddlewareContext({
      request: createDataRequest({ assetsForPriceUpdate: [MOCK_TOKEN_ASSET] }),
      response: {},
    });
    await controller.assetsMiddleware(context1, next);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Second call — skipped (fresh)
    const context2 = createMiddlewareContext({
      request: createDataRequest({ assetsForPriceUpdate: [MOCK_TOKEN_ASSET] }),
      response: {},
    });
    await controller.assetsMiddleware(context2, next);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Invalidate cache, then fetch again — API is called
    controller.invalidatePriceCache();
    const context3 = createMiddlewareContext({
      request: createDataRequest({ assetsForPriceUpdate: [MOCK_TOKEN_ASSET] }),
      response: {},
    });
    await controller.assetsMiddleware(context3, next);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('coalesces parallel fetches for the same asset into a single API call', async () => {
    let resolveApi: ((value: Record<string, unknown>) => void) | undefined;
    const apiPromise = new Promise<Record<string, unknown>>((resolve) => {
      resolveApi = resolve;
    });

    const { controller, apiClient } = setupController({
      priceResponse: {
        [MOCK_TOKEN_ASSET]: createMockPriceData(1.0),
      },
    });

    // Make the API call hang until we resolve manually
    apiClient.prices.fetchV3SpotPrices.mockReturnValue(apiPromise);

    const next = jest.fn().mockResolvedValue(undefined);

    // Fire two parallel middleware calls for the same asset
    const context1 = createMiddlewareContext({
      request: createDataRequest({ assetsForPriceUpdate: [MOCK_TOKEN_ASSET] }),
      response: {},
    });
    const context2 = createMiddlewareContext({
      request: createDataRequest({ assetsForPriceUpdate: [MOCK_TOKEN_ASSET] }),
      response: {},
    });

    const promise1 = controller.assetsMiddleware(context1, next);
    const promise2 = controller.assetsMiddleware(context2, next);

    // Only ONE API call should have been made (second call joins inflight)
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Resolve the API
    expect(resolveApi).toBeDefined();
    if (resolveApi) {
      resolveApi({ [MOCK_TOKEN_ASSET]: createMockPriceData(1.0) });
    }
    await Promise.all([promise1, promise2]);

    // Still only one API call total
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    // Both contexts received the price
    expect(context1.response.assetsPrice?.[MOCK_TOKEN_ASSET]).toBeDefined();
    expect(context2.response.assetsPrice?.[MOCK_TOKEN_ASSET]).toBeDefined();

    controller.destroy();
  });

  it('freshness is per-asset — stale assets are fetched while fresh ones are skipped', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
        [MOCK_TOKEN_ASSET]: createMockPriceData(1.0),
      },
    });

    // Fetch only MOCK_NATIVE_ASSET via balance state
    await controller.fetch(createDataRequest(), getAssetsState);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledWith(
      [MOCK_NATIVE_ASSET],
      expect.anything(),
    );

    // Now middleware requests MOCK_TOKEN_ASSET (not yet fetched) and MOCK_NATIVE_ASSET (fresh)
    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({
        assetsForPriceUpdate: [MOCK_TOKEN_ASSET, MOCK_NATIVE_ASSET],
      }),
      response: {},
    });
    await controller.assetsMiddleware(context, next);

    // Only MOCK_TOKEN_ASSET should be sent to the API (MOCK_NATIVE_ASSET is fresh)
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenLastCalledWith(
      [MOCK_TOKEN_ASSET],
      expect.anything(),
    );

    controller.destroy();
  });

  it('destroy clears the freshness cache', async () => {
    const { controller, apiClient, getAssetsState } = setupController({
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
      },
    });

    await controller.fetch(createDataRequest(), getAssetsState);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(1);

    controller.destroy();

    // Re-create a new controller instance to verify state is gone
    // (destroy clears the priceFetchedAt map — for the same instance it won't poll after destroy)
    const controller2 = new PriceDataSource({
      queryApiClient:
        apiClient as unknown as PriceDataSourceOptions['queryApiClient'],
      getSelectedCurrency: (): SupportedCurrency => 'usd',
    });

    const getAssetsState2 = (): AssetsControllerStateInternal =>
      ({
        assetsBalance: {
          'mock-account-id': {
            [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
          },
        },
      }) as unknown as AssetsControllerStateInternal;

    await controller2.fetch(createDataRequest(), getAssetsState2);
    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);

    controller2.destroy();
  });

  it('destroy cleans up all subscriptions', async () => {
    const polygonAsset =
      'eip155:137/erc20:0x0000000000000000000000000000000000001010' as Caip19AssetId;

    const { controller, apiClient, getAssetsState } = setupController({
      pollInterval: 5000,
      balanceState: {
        'mock-account-id': {
          [MOCK_NATIVE_ASSET]: { amount: '1000000000000000000' },
          [polygonAsset]: { amount: '5000000000000000000' },
        },
      },
      priceResponse: {
        [MOCK_NATIVE_ASSET]: createMockPriceData(2500),
        [polygonAsset]: createMockPriceData(0.5),
      },
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });

    await controller.subscribe({
      subscriptionId: 'sub-2',
      request: createDataRequest({ chainIds: [CHAIN_POLYGON] }),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
      getAssetsState,
    });

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);

    controller.destroy();

    jest.advanceTimersByTime(10000);
    await Promise.resolve();

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);
  });

  it.each([
    { pattern: '/slip44:bandwidth', asset: 'tron:0x2b6653dc/slip44:bandwidth' },
    { pattern: '/slip44:energy', asset: 'tron:0x2b6653dc/slip44:energy' },
    {
      pattern: '/slip44:maximum-bandwidth',
      asset: 'tron:0x2b6653dc/slip44:maximum-bandwidth',
    },
    {
      pattern: '/slip44:maximum-energy',
      asset: 'tron:0x2b6653dc/slip44:maximum-energy',
    },
    {
      pattern: 'slip44:NUMBER-staked-for-',
      asset: 'tron:728126428/slip44:195-staked-for-bandwidth',
    },
    {
      pattern: 'slip44:NUMBER-ready-for-withdrawal',
      asset: 'tron:728126428/slip44:195-ready-for-withdrawal',
    },
    {
      pattern: 'slip44:NUMBER-in-lock-period',
      asset: 'tron:728126428/slip44:195-in-lock-period',
    },
    {
      pattern: 'slip44:NUMBER-staking-rewards',
      asset: 'tron:728126428/slip44:195-staking-rewards',
    },
  ])(
    'filters out non-priceable asset with pattern: $pattern',
    async ({ asset }) => {
      const { controller, apiClient } = setupController({
        balanceState: {
          'mock-account-id': {
            [asset]: { amount: '1000' },
          },
        },
      });

      await controller.fetch(createDataRequest({ chainIds: [] }));

      expect(apiClient.prices.fetchV3SpotPrices).not.toHaveBeenCalled();

      controller.destroy();
    },
  );
});
