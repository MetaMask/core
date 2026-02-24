import type { SupportedCurrency } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { PriceDataSourceOptions } from './PriceDataSource';
import { PriceDataSource } from './PriceDataSource';
import type {
  ChainId,
  DataRequest,
  Context,
  Caip19AssetId,
  AssetsControllerStateInternal,
} from '../types';

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
    getAssetsState: jest.fn(),
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
      price: 2500,
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
      price: 2500,
      pricePercentChange1d: 2.5,
      lastUpdated: expect.any(Number),
      marketCap: 1000000000,
      totalVolume: 50000000,
    });

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

    jest.advanceTimersByTime(10000);
    await Promise.resolve();

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(50000);
    await Promise.resolve();

    expect(apiClient.prices.fetchV3SpotPrices).toHaveBeenCalledTimes(7);

    controller.destroy();
  });

  it('subscribe update only updates request without re-subscribing', async () => {
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
      price: 1.0,
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
      [MOCK_TOKEN_ASSET],
      { currency: 'usd', includeMarketData: true },
    );
    expect(context.response.assetsPrice?.[MOCK_TOKEN_ASSET]).toStrictEqual({
      price: 1.0,
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
          [anotherAsset]: { price: 1.0, lastUpdated: Date.now() },
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
      pattern: '-staked-for-',
      asset: 'tron:0x2b6653dc/slip44:195-staked-for-bandwidth',
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
