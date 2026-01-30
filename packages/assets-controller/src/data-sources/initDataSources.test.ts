import type { ApiPlatformClient } from '@metamask/core-backend';
import { Messenger } from '@metamask/messenger';

import { AccountsApiDataSource } from './AccountsApiDataSource';
import { BackendWebsocketDataSource } from './BackendWebsocketDataSource';
import { initMessengers, initDataSources } from './initDataSources';
import type { DataSourceMessengers } from './initDataSources';
import { PriceDataSource } from './PriceDataSource';
import { RpcDataSource } from './RpcDataSource';
import { SnapDataSource } from './SnapDataSource';
import { TokenDataSource } from './TokenDataSource';
import { DetectionMiddleware } from '../middlewares';

// Mock all data sources
jest.mock('./RpcDataSource');
jest.mock('./BackendWebsocketDataSource');
jest.mock('./AccountsApiDataSource');
jest.mock('./SnapDataSource');
jest.mock('./TokenDataSource');
jest.mock('./PriceDataSource');
jest.mock('../middlewares');

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

function createMockQueryApiClient(): ApiPlatformClient {
  return {
    fetch: jest.fn(),
  } as unknown as ApiPlatformClient;
}

function createMockRootMessenger(): Messenger<string, never, never> {
  const messenger = new Messenger({
    namespace: 'root',
  });

  // Mock delegate method
  jest.spyOn(messenger, 'delegate').mockImplementation(jest.fn());

  return messenger;
}

describe('initDataSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initMessengers', () => {
    it('creates messengers for all data sources', () => {
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

    it('creates RpcDataSource messenger with correct namespace', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers.rpcMessenger).toBeDefined();
    });

    it('creates BackendWebsocketDataSource messenger with correct namespace', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers.backendWebsocketMessenger).toBeDefined();
    });

    it('creates AccountsApiDataSource messenger with correct namespace', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers.accountsApiMessenger).toBeDefined();
    });

    it('creates SnapDataSource messenger with correct namespace', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers.snapMessenger).toBeDefined();
    });

    it('creates TokenDataSource messenger with correct namespace', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers.tokenMessenger).toBeDefined();
    });

    it('creates PriceDataSource messenger with correct namespace', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers.priceMessenger).toBeDefined();
    });

    it('creates DetectionMiddleware messenger with correct namespace', () => {
      const rootMessenger = createMockRootMessenger();

      const messengers = initMessengers({ messenger: rootMessenger });

      expect(messengers.detectionMessenger).toBeDefined();
    });

    it('delegates actions and events for RpcDataSource', () => {
      const rootMessenger = createMockRootMessenger();

      initMessengers({ messenger: rootMessenger });

      expect(rootMessenger.delegate).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            'NetworkController:getState',
            'NetworkController:getNetworkClientById',
            'AssetsController:activeChainsUpdate',
            'AssetsController:assetsUpdate',
          ]),
          events: expect.arrayContaining(['NetworkController:stateChange']),
        }),
      );
    });

    it('delegates actions and events for BackendWebsocketDataSource', () => {
      const rootMessenger = createMockRootMessenger();

      initMessengers({ messenger: rootMessenger });

      expect(rootMessenger.delegate).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            'BackendWebSocketService:subscribe',
            'BackendWebSocketService:unsubscribe',
            'BackendWebSocketService:getState',
            'BackendWebSocketService:getConnectionInfo',
            'BackendWebSocketService:findSubscriptionsByChannelPrefix',
            'AssetsController:activeChainsUpdate',
            'AssetsController:assetsUpdate',
          ]),
          events: expect.arrayContaining([
            'BackendWebSocketService:stateChange',
            'BackendWebSocketService:connectionStateChanged',
            'AccountsApiDataSource:activeChainsUpdated',
          ]),
        }),
      );
    });

    it('delegates actions for AccountsApiDataSource', () => {
      const rootMessenger = createMockRootMessenger();

      initMessengers({ messenger: rootMessenger });

      expect(rootMessenger.delegate).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            'AssetsController:activeChainsUpdate',
            'AssetsController:assetsUpdate',
          ]),
        }),
      );
    });

    it('delegates actions and events for SnapDataSource', () => {
      const rootMessenger = createMockRootMessenger();

      initMessengers({ messenger: rootMessenger });

      expect(rootMessenger.delegate).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            'AssetsController:activeChainsUpdate',
            'AssetsController:assetsUpdate',
          ]),
          events: expect.arrayContaining([
            'AccountsController:accountBalancesUpdated',
          ]),
        }),
      );
    });

    it('delegates actions for PriceDataSource', () => {
      const rootMessenger = createMockRootMessenger();

      initMessengers({ messenger: rootMessenger });

      expect(rootMessenger.delegate).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            'AssetsController:getState',
            'AssetsController:assetsUpdate',
          ]),
        }),
      );
    });
  });

  describe('initDataSources', () => {
    function createMockMessengers(): DataSourceMessengers {
      const rootMessenger = createMockRootMessenger();
      return initMessengers({ messenger: rootMessenger });
    }

    it('creates all data source instances', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      const dataSources = initDataSources({
        messengers,
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

    it('creates RpcDataSource with correct messenger', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      initDataSources({
        messengers,
        queryApiClient,
      });

      expect(MockRpcDataSource).toHaveBeenCalledWith({
        messenger: messengers.rpcMessenger,
      });
    });

    it('creates BackendWebsocketDataSource with correct messenger', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      initDataSources({
        messengers,
        queryApiClient,
      });

      expect(MockBackendWebsocketDataSource).toHaveBeenCalledWith({
        messenger: messengers.backendWebsocketMessenger,
      });
    });

    it('creates AccountsApiDataSource with correct options', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      initDataSources({
        messengers,
        queryApiClient,
      });

      expect(MockAccountsApiDataSource).toHaveBeenCalledWith({
        messenger: messengers.accountsApiMessenger,
        queryApiClient,
      });
    });

    it('creates SnapDataSource with correct options', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      initDataSources({
        messengers,
        queryApiClient,
      });

      expect(MockSnapDataSource).toHaveBeenCalledWith({
        messenger: messengers.snapMessenger,
      });
    });

    it('creates TokenDataSource with correct options', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      initDataSources({
        messengers,
        queryApiClient,
      });

      expect(MockTokenDataSource).toHaveBeenCalledWith({
        messenger: messengers.tokenMessenger,
        queryApiClient,
      });
    });

    it('creates PriceDataSource with correct options', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      initDataSources({
        messengers,
        queryApiClient,
      });

      expect(MockPriceDataSource).toHaveBeenCalledWith({
        messenger: messengers.priceMessenger,
        queryApiClient,
      });
    });

    it('creates DetectionMiddleware with correct messenger', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      initDataSources({
        messengers,
        queryApiClient,
      });

      expect(MockDetectionMiddleware).toHaveBeenCalledWith({
        messenger: messengers.detectionMessenger,
      });
    });

    it('returns instances of correct types', () => {
      const messengers = createMockMessengers();
      const queryApiClient = createMockQueryApiClient();

      const dataSources = initDataSources({
        messengers,
        queryApiClient,
      });

      expect(dataSources.rpcDataSource).toBeInstanceOf(MockRpcDataSource);
      expect(dataSources.backendWebsocketDataSource).toBeInstanceOf(
        MockBackendWebsocketDataSource,
      );
      expect(dataSources.accountsApiDataSource).toBeInstanceOf(
        MockAccountsApiDataSource,
      );
      expect(dataSources.snapDataSource).toBeInstanceOf(MockSnapDataSource);
      expect(dataSources.tokenDataSource).toBeInstanceOf(MockTokenDataSource);
      expect(dataSources.priceDataSource).toBeInstanceOf(MockPriceDataSource);
      expect(dataSources.detectionMiddleware).toBeInstanceOf(
        MockDetectionMiddleware,
      );
    });
  });
});
