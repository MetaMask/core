import type { ApiPlatformClient } from '@metamask/core-backend';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import { AccountsApiDataSource } from './AccountsApiDataSource';
import { BackendWebsocketDataSource } from './BackendWebsocketDataSource';
import { initDataSources, initMessengers } from './initDataSources';
import { PriceDataSource } from './PriceDataSource';
import { RpcDataSource } from './RpcDataSource';
import { SnapDataSource } from './SnapDataSource';
import type { SnapProvider } from './SnapDataSource';
import { TokenDataSource } from './TokenDataSource';
import { DetectionMiddleware } from '../middlewares';

// Mock all data source modules - Jest hoists these automatically
jest.mock('./RpcDataSource');
jest.mock('./BackendWebsocketDataSource');
jest.mock('./AccountsApiDataSource');
jest.mock('./SnapDataSource');
jest.mock('./TokenDataSource');
jest.mock('./PriceDataSource');
jest.mock('../middlewares');

// Cast mocked classes for type safety
const MockRpcDataSource = RpcDataSource as jest.MockedClass<
  typeof RpcDataSource
>;
const MockBackendWebsocketDataSource =
  BackendWebsocketDataSource as jest.MockedClass<
    typeof BackendWebsocketDataSource
  >;
const MockAccountsApiDataSource = AccountsApiDataSource as jest.MockedClass<
  typeof AccountsApiDataSource
>;
const MockSnapDataSource = SnapDataSource as jest.MockedClass<
  typeof SnapDataSource
>;
const MockTokenDataSource = TokenDataSource as jest.MockedClass<
  typeof TokenDataSource
>;
const MockPriceDataSource = PriceDataSource as jest.MockedClass<
  typeof PriceDataSource
>;
const MockDetectionMiddleware = DetectionMiddleware as jest.MockedClass<
  typeof DetectionMiddleware
>;

function createMockRootMessenger(): Messenger<
  MockAnyNamespace,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
> {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createMockSnapProvider(): SnapProvider {
  return {
    handleRequest: jest.fn(),
  } as unknown as SnapProvider;
}

function createMockApiPlatformClient(): ApiPlatformClient {
  return {
    query: jest.fn(),
  } as unknown as ApiPlatformClient;
}

describe('initDataSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initMessengers', () => {
    it('creates all required messengers', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers).toHaveProperty('rpcMessenger');
      expect(messengers).toHaveProperty('backendWebsocketMessenger');
      expect(messengers).toHaveProperty('accountsApiMessenger');
      expect(messengers).toHaveProperty('snapMessenger');
      expect(messengers).toHaveProperty('tokenMessenger');
      expect(messengers).toHaveProperty('priceMessenger');
      expect(messengers).toHaveProperty('detectionMessenger');
    });

    it('creates messengers with correct namespaces', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      // Verify messengers are Messenger instances by checking they have expected methods
      expect(typeof messengers.rpcMessenger.call).toBe('function');
      expect(typeof messengers.backendWebsocketMessenger.call).toBe('function');
      expect(typeof messengers.accountsApiMessenger.call).toBe('function');
      expect(typeof messengers.snapMessenger.call).toBe('function');
      expect(typeof messengers.tokenMessenger.call).toBe('function');
      expect(typeof messengers.priceMessenger.call).toBe('function');
      expect(typeof messengers.detectionMessenger.call).toBe('function');
    });

    it('returns messengers that can be used to create data sources', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      // Each messenger should be defined and usable
      expect(messengers.rpcMessenger).toBeDefined();
      expect(messengers.backendWebsocketMessenger).toBeDefined();
      expect(messengers.accountsApiMessenger).toBeDefined();
      expect(messengers.snapMessenger).toBeDefined();
      expect(messengers.tokenMessenger).toBeDefined();
      expect(messengers.priceMessenger).toBeDefined();
      expect(messengers.detectionMessenger).toBeDefined();
    });
  });

  describe('initDataSources', () => {
    it('creates all data source instances', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      const dataSources = initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(dataSources).toHaveProperty('rpcDataSource');
      expect(dataSources).toHaveProperty('backendWebsocketDataSource');
      expect(dataSources).toHaveProperty('accountsApiDataSource');
      expect(dataSources).toHaveProperty('snapDataSource');
      expect(dataSources).toHaveProperty('tokenDataSource');
      expect(dataSources).toHaveProperty('priceDataSource');
      expect(dataSources).toHaveProperty('detectionMiddleware');
    });

    it('initializes RpcDataSource with correct options', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(MockRpcDataSource).toHaveBeenCalledTimes(1);
      expect(MockRpcDataSource).toHaveBeenCalledWith({
        messenger: messengers.rpcMessenger,
      });
    });

    it('initializes RpcDataSource with custom config options', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      const rpcDataSourceConfig = {
        balanceInterval: 60000,
        detectionInterval: 300000,
        tokenDetectionEnabled: true,
        timeout: 15000,
      };

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
        rpcDataSourceConfig,
      });

      expect(MockRpcDataSource).toHaveBeenCalledTimes(1);
      expect(MockRpcDataSource).toHaveBeenCalledWith({
        messenger: messengers.rpcMessenger,
        balanceInterval: 60000,
        detectionInterval: 300000,
        tokenDetectionEnabled: true,
        timeout: 15000,
      });
    });

    it('initializes BackendWebsocketDataSource with correct options', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(MockBackendWebsocketDataSource).toHaveBeenCalledTimes(1);
      expect(MockBackendWebsocketDataSource).toHaveBeenCalledWith({
        messenger: messengers.backendWebsocketMessenger,
      });
    });

    it('initializes AccountsApiDataSource with messenger and queryApiClient', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(MockAccountsApiDataSource).toHaveBeenCalledTimes(1);
      expect(MockAccountsApiDataSource).toHaveBeenCalledWith({
        messenger: messengers.accountsApiMessenger,
        queryApiClient,
      });
    });

    it('initializes SnapDataSource with messenger and snapProvider', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(MockSnapDataSource).toHaveBeenCalledTimes(1);
      expect(MockSnapDataSource).toHaveBeenCalledWith({
        messenger: messengers.snapMessenger,
        snapProvider,
      });
    });

    it('initializes TokenDataSource with messenger and queryApiClient', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(MockTokenDataSource).toHaveBeenCalledTimes(1);
      expect(MockTokenDataSource).toHaveBeenCalledWith({
        messenger: messengers.tokenMessenger,
        queryApiClient,
      });
    });

    it('initializes PriceDataSource with messenger and queryApiClient', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(MockPriceDataSource).toHaveBeenCalledTimes(1);
      expect(MockPriceDataSource).toHaveBeenCalledWith({
        messenger: messengers.priceMessenger,
        queryApiClient,
      });
    });

    it('initializes DetectionMiddleware with correct options', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      expect(MockDetectionMiddleware).toHaveBeenCalledTimes(1);
      expect(MockDetectionMiddleware).toHaveBeenCalledWith({
        messenger: messengers.detectionMessenger,
      });
    });

    it('returns instances of the correct types', () => {
      const rootMessenger = createMockRootMessenger();
      const messengers = initMessengers({ messenger: rootMessenger });
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      const dataSources = initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      // Since we're using mocks, check that the instances are what the mocks return
      expect(dataSources.rpcDataSource).toBe(
        MockRpcDataSource.mock.instances[0],
      );
      expect(dataSources.backendWebsocketDataSource).toBe(
        MockBackendWebsocketDataSource.mock.instances[0],
      );
      expect(dataSources.accountsApiDataSource).toBe(
        MockAccountsApiDataSource.mock.instances[0],
      );
      expect(dataSources.snapDataSource).toBe(
        MockSnapDataSource.mock.instances[0],
      );
      expect(dataSources.tokenDataSource).toBe(
        MockTokenDataSource.mock.instances[0],
      );
      expect(dataSources.priceDataSource).toBe(
        MockPriceDataSource.mock.instances[0],
      );
      expect(dataSources.detectionMiddleware).toBe(
        MockDetectionMiddleware.mock.instances[0],
      );
    });
  });

  describe('integration', () => {
    it('initMessengers and initDataSources work together', () => {
      const rootMessenger = createMockRootMessenger();
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      // This is the typical usage pattern
      const messengers = initMessengers({ messenger: rootMessenger });
      const dataSources = initDataSources({
        messengers,
        snapProvider,
        queryApiClient,
      });

      // All data sources should be created
      expect(Object.keys(dataSources)).toHaveLength(7);

      // Each data source constructor should have been called once
      expect(MockRpcDataSource).toHaveBeenCalledTimes(1);
      expect(MockBackendWebsocketDataSource).toHaveBeenCalledTimes(1);
      expect(MockAccountsApiDataSource).toHaveBeenCalledTimes(1);
      expect(MockSnapDataSource).toHaveBeenCalledTimes(1);
      expect(MockTokenDataSource).toHaveBeenCalledTimes(1);
      expect(MockPriceDataSource).toHaveBeenCalledTimes(1);
      expect(MockDetectionMiddleware).toHaveBeenCalledTimes(1);
    });

    it('can initialize multiple times with different messengers', () => {
      const rootMessenger1 = createMockRootMessenger();
      const rootMessenger2 = createMockRootMessenger();
      const snapProvider = createMockSnapProvider();
      const queryApiClient = createMockApiPlatformClient();

      const messengers1 = initMessengers({ messenger: rootMessenger1 });
      const messengers2 = initMessengers({ messenger: rootMessenger2 });

      const dataSources1 = initDataSources({
        messengers: messengers1,
        snapProvider,
        queryApiClient,
      });

      const dataSources2 = initDataSources({
        messengers: messengers2,
        snapProvider,
        queryApiClient,
      });

      // Both sets of data sources should be created
      expect(dataSources1.rpcDataSource).toBeDefined();
      expect(dataSources2.rpcDataSource).toBeDefined();

      // Each constructor should have been called twice
      expect(MockRpcDataSource).toHaveBeenCalledTimes(2);
      expect(MockBackendWebsocketDataSource).toHaveBeenCalledTimes(2);
      expect(MockAccountsApiDataSource).toHaveBeenCalledTimes(2);
      expect(MockSnapDataSource).toHaveBeenCalledTimes(2);
      expect(MockTokenDataSource).toHaveBeenCalledTimes(2);
      expect(MockPriceDataSource).toHaveBeenCalledTimes(2);
      expect(MockDetectionMiddleware).toHaveBeenCalledTimes(2);
    });
  });
});
