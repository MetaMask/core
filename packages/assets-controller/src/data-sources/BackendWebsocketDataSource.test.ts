/* eslint-disable jest/unbound-method */
import type {
  ServerNotificationMessage,
  WebSocketSubscription,
} from '@metamask/core-backend';
import { WebSocketState } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { BackendWebsocketDataSourceMessenger } from './BackendWebsocketDataSource';
import {
  BackendWebsocketDataSource,
  createBackendWebsocketDataSource,
} from './BackendWebsocketDataSource';
import type { ChainId, DataRequest } from '../types';

type AllActions = MessengerActions<BackendWebsocketDataSourceMessenger>;
type AllEvents = MessengerEvents<BackendWebsocketDataSourceMessenger>;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const CHAIN_BASE = 'eip155:8453' as ChainId;
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';

type SetupResult = {
  controller: BackendWebsocketDataSource;
  messenger: RootMessenger;
  wsSubscribeMock: jest.Mock;
  getConnectionInfoMock: jest.Mock;
  findSubscriptionsMock: jest.Mock;
  assetsUpdateHandler: jest.Mock;
  activeChainsUpdateHandler: jest.Mock;
  triggerConnectionStateChange: (state: WebSocketState) => void;
  triggerActiveChainsUpdate: (chains: ChainId[]) => void;
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

function createDataRequest(overrides?: Partial<DataRequest>): DataRequest {
  return {
    chainIds: [CHAIN_MAINNET],
    accounts: [createMockAccount()],
    dataTypes: ['balance'],
    ...overrides,
  };
}

function createMockWsSubscription(): WebSocketSubscription {
  return {
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    channels: [],
  } as unknown as WebSocketSubscription;
}

function createMockNotification(
  overrides: Partial<ServerNotificationMessage> & {
    data: Record<string, unknown>;
  },
): ServerNotificationMessage {
  return {
    event: 'notification',
    channel: 'test-channel',
    timestamp: Date.now(),
    ...overrides,
  };
}

function setupController(
  options: {
    initialActiveChains?: ChainId[];
    connectionState?: WebSocketState;
  } = {},
): SetupResult {
  const {
    initialActiveChains = [],
    connectionState = WebSocketState.CONNECTED,
  } = options;

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const controllerMessenger = new Messenger<
    'BackendWebsocketDataSource',
    MessengerActions<BackendWebsocketDataSourceMessenger>,
    MessengerEvents<BackendWebsocketDataSourceMessenger>,
    RootMessenger
  >({
    namespace: 'BackendWebsocketDataSource',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: controllerMessenger,
    actions: [
      'AssetsController:assetsUpdate',
      'AssetsController:activeChainsUpdate',
      'BackendWebSocketService:subscribe',
      'BackendWebSocketService:getConnectionInfo',
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
    ],
    events: [
      'BackendWebSocketService:connectionStateChanged',
      'AccountsApiDataSource:activeChainsUpdated',
    ],
  });

  const assetsUpdateHandler = jest.fn().mockResolvedValue(undefined);
  const activeChainsUpdateHandler = jest.fn();
  const wsSubscribeMock = jest
    .fn()
    .mockResolvedValue(createMockWsSubscription());
  const getConnectionInfoMock = jest.fn().mockReturnValue({
    state: connectionState,
    url: 'wss://test.example.com',
    reconnectAttempts: 0,
    timeout: 30000,
    reconnectDelay: 1000,
    maxReconnectDelay: 30000,
    requestTimeout: 30000,
  });
  const findSubscriptionsMock = jest.fn().mockReturnValue([]);

  rootMessenger.registerActionHandler(
    'AssetsController:assetsUpdate',
    assetsUpdateHandler,
  );
  rootMessenger.registerActionHandler(
    'AssetsController:activeChainsUpdate',
    activeChainsUpdateHandler,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:subscribe',
    wsSubscribeMock,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:getConnectionInfo',
    getConnectionInfoMock,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:findSubscriptionsByChannelPrefix',
    findSubscriptionsMock,
  );

  const controller = new BackendWebsocketDataSource({
    messenger: controllerMessenger,
    state: { activeChains: initialActiveChains },
  });

  const triggerConnectionStateChange = (state: WebSocketState): void => {
    rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
      state,
      url: 'wss://test.example.com',
      reconnectAttempts: 0,
      timeout: 30000,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      requestTimeout: 30000,
    });
  };

  const triggerActiveChainsUpdate = (chains: ChainId[]): void => {
    rootMessenger.publish('AccountsApiDataSource:activeChainsUpdated', chains);
  };

  return {
    controller,
    messenger: rootMessenger,
    wsSubscribeMock,
    getConnectionInfoMock,
    findSubscriptionsMock,
    assetsUpdateHandler,
    activeChainsUpdateHandler,
    triggerConnectionStateChange,
    triggerActiveChainsUpdate,
  };
}

describe('BackendWebsocketDataSource', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct name', () => {
    const { controller } = setupController();
    expect(controller.getName()).toBe('BackendWebsocketDataSource');
    controller.destroy();
  });

  it('registers action handlers', async () => {
    const { controller, messenger } = setupController();

    const chains = await messenger.call(
      'BackendWebsocketDataSource:getActiveChains',
    );
    expect(chains).toStrictEqual([]);

    controller.destroy();
  });

  it('updates active chains when AccountsApiDataSource publishes update', async () => {
    const { controller, triggerActiveChainsUpdate, activeChainsUpdateHandler } =
      setupController();

    triggerActiveChainsUpdate([CHAIN_MAINNET, CHAIN_POLYGON]);

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET, CHAIN_POLYGON]);
    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'BackendWebsocketDataSource',
      [CHAIN_MAINNET, CHAIN_POLYGON],
    );

    controller.destroy();
  });

  it('updateSupportedChains updates active chains', async () => {
    const { controller, activeChainsUpdateHandler } = setupController();

    controller.updateSupportedChains([CHAIN_MAINNET, CHAIN_BASE]);

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET, CHAIN_BASE]);
    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'BackendWebsocketDataSource',
      [CHAIN_MAINNET, CHAIN_BASE],
    );

    controller.destroy();
  });

  it('subscribe does nothing when no chains match active chains', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_POLYGON] }),
      isUpdate: false,
    });

    expect(wsSubscribeMock).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('subscribe creates WebSocket subscription when connected', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    expect(wsSubscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: [
          `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
        ],
        channelType: 'account-activity.v1',
        callback: expect.any(Function),
      }),
    );

    controller.destroy();
  });

  it('subscribe stores pending subscription when disconnected', async () => {
    const {
      controller,
      wsSubscribeMock,
      getConnectionInfoMock,
      triggerConnectionStateChange,
    } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.DISCONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    expect(wsSubscribeMock).not.toHaveBeenCalled();

    getConnectionInfoMock.mockReturnValue({
      state: WebSocketState.CONNECTED,
      url: 'wss://test.example.com',
      reconnectAttempts: 0,
      timeout: 30000,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      requestTimeout: 30000,
    });

    triggerConnectionStateChange(WebSocketState.CONNECTED);
    await new Promise(process.nextTick);

    expect(wsSubscribeMock).toHaveBeenCalled();

    controller.destroy();
  });

  it('subscribe creates channels for multiple namespaces', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [
        CHAIN_MAINNET,
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId,
      ],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        chainIds: [
          CHAIN_MAINNET,
          'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId,
        ],
      }),
      isUpdate: false,
    });

    expect(wsSubscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: expect.arrayContaining([
          `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
          `account-activity.v1.solana:0:${MOCK_ADDRESS.toLowerCase()}`,
        ]),
      }),
    );

    controller.destroy();
  });

  it('subscribe update only changes chains if addresses unchanged', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET, CHAIN_POLYGON],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET] }),
      isUpdate: false,
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
      isUpdate: true,
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('subscribe update re-subscribes when addresses change', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);

    const newAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        accounts: [createMockAccount({ address: newAddress })],
      }),
      isUpdate: true,
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('unsubscribe cleans up WebSocket subscription', async () => {
    const mockWsSubscription = createMockWsSubscription();
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    wsSubscribeMock.mockResolvedValueOnce(mockWsSubscription);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    await controller.unsubscribe('sub-1');

    expect(mockWsSubscription.unsubscribe).toHaveBeenCalled();

    controller.destroy();
  });

  it('handles WebSocket disconnect by moving subscriptions to pending', async () => {
    const {
      controller,
      wsSubscribeMock,
      getConnectionInfoMock,
      triggerConnectionStateChange,
    } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);

    getConnectionInfoMock.mockReturnValue({
      state: WebSocketState.DISCONNECTED,
      url: 'wss://test.example.com',
      reconnectAttempts: 0,
      timeout: 30000,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      requestTimeout: 30000,
    });

    triggerConnectionStateChange(WebSocketState.DISCONNECTED);

    getConnectionInfoMock.mockReturnValue({
      state: WebSocketState.CONNECTED,
      url: 'wss://test.example.com',
      reconnectAttempts: 0,
      timeout: 30000,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      requestTimeout: 30000,
    });

    triggerConnectionStateChange(WebSocketState.CONNECTED);
    await new Promise(process.nextTick);

    expect(wsSubscribeMock).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('processes balance update notification correctly', async () => {
    const { controller, wsSubscribeMock, assetsUpdateHandler } =
      setupController({
        initialActiveChains: [CHAIN_BASE],
        connectionState: WebSocketState.CONNECTED,
      });

    let notificationCallback: (
      notification: ServerNotificationMessage,
    ) => void = () => undefined;

    wsSubscribeMock.mockImplementation(({ callback }) => {
      notificationCallback = callback;
      return Promise.resolve(createMockWsSubscription());
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_BASE] }),
      isUpdate: false,
    });

    const notification = createMockNotification({
      channel: `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
      data: {
        address: MOCK_ADDRESS,
        tx: { chain: CHAIN_BASE },
        updates: [
          {
            asset: {
              type: 'eip155:8453/slip44:60',
              unit: 'ETH',
              decimals: 18,
            },
            postBalance: {
              amount: '0x8ac7230489e80000',
            },
          },
        ],
      },
    });

    notificationCallback(notification);
    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: expect.objectContaining({
          'mock-account-id': expect.objectContaining({
            'eip155:8453/slip44:60': { amount: '10000000000000000000' },
          }),
        }),
        assetsMetadata: expect.objectContaining({
          'eip155:8453/slip44:60': expect.objectContaining({
            type: 'native',
            symbol: 'ETH',
            decimals: 18,
          }),
        }),
      }),
      'BackendWebsocketDataSource',
    );

    controller.destroy();
  });

  it('processes ERC20 token balance update', async () => {
    const { controller, wsSubscribeMock, assetsUpdateHandler } =
      setupController({
        initialActiveChains: [CHAIN_MAINNET],
        connectionState: WebSocketState.CONNECTED,
      });

    let notificationCallback: (
      notification: ServerNotificationMessage,
    ) => void = () => undefined;

    wsSubscribeMock.mockImplementation(({ callback }) => {
      notificationCallback = callback;
      return Promise.resolve(createMockWsSubscription());
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    const notification = createMockNotification({
      channel: `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
      data: {
        address: MOCK_ADDRESS,
        tx: { chain: CHAIN_MAINNET },
        updates: [
          {
            asset: {
              type: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
              unit: 'USDC',
              decimals: 6,
            },
            postBalance: {
              amount: '1000000',
            },
          },
        ],
      },
    });

    notificationCallback(notification);
    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: expect.objectContaining({
          'mock-account-id': expect.objectContaining({
            'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
              amount: '1000000',
            },
          }),
        }),
        assetsMetadata: expect.objectContaining({
          'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':
            expect.objectContaining({
              type: 'erc20',
              symbol: 'USDC',
              decimals: 6,
            }),
        }),
      }),
      'BackendWebsocketDataSource',
    );

    controller.destroy();
  });

  it('ignores notification with missing data', async () => {
    const { controller, wsSubscribeMock, assetsUpdateHandler } =
      setupController({
        initialActiveChains: [CHAIN_MAINNET],
        connectionState: WebSocketState.CONNECTED,
      });

    let notificationCallback: (
      notification: ServerNotificationMessage,
    ) => void = () => undefined;

    wsSubscribeMock.mockImplementation(({ callback }) => {
      notificationCallback = callback;
      return Promise.resolve(createMockWsSubscription());
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    notificationCallback(
      createMockNotification({
        data: { address: null, tx: null, updates: null },
      }),
    );

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('ignores notification for unknown account', async () => {
    const { controller, wsSubscribeMock, assetsUpdateHandler } =
      setupController({
        initialActiveChains: [CHAIN_MAINNET],
        connectionState: WebSocketState.CONNECTED,
      });

    let notificationCallback: (
      notification: ServerNotificationMessage,
    ) => void = () => undefined;

    wsSubscribeMock.mockImplementation(({ callback }) => {
      notificationCallback = callback;
      return Promise.resolve(createMockWsSubscription());
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    notificationCallback(
      createMockNotification({
        data: {
          address: '0xunknown',
          tx: { chain: CHAIN_MAINNET },
          updates: [
            { asset: { type: 'test' }, postBalance: { amount: '100' } },
          ],
        },
      }),
    );

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('skips updates with missing asset or postBalance', async () => {
    const { controller, wsSubscribeMock, assetsUpdateHandler } =
      setupController({
        initialActiveChains: [CHAIN_MAINNET],
        connectionState: WebSocketState.CONNECTED,
      });

    let notificationCallback: (
      notification: ServerNotificationMessage,
    ) => void = () => undefined;

    wsSubscribeMock.mockImplementation(({ callback }) => {
      notificationCallback = callback;
      return Promise.resolve(createMockWsSubscription());
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    notificationCallback(
      createMockNotification({
        data: {
          address: MOCK_ADDRESS,
          tx: { chain: CHAIN_MAINNET },
          updates: [
            { asset: null, postBalance: { amount: '100' } },
            { asset: { type: 'test' }, postBalance: null },
          ],
        },
      }),
    );

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('destroy cleans up WebSocket subscriptions', async () => {
    const mockWsSubscription = createMockWsSubscription();
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    wsSubscribeMock.mockResolvedValueOnce(mockWsSubscription);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
    });

    controller.destroy();

    expect(mockWsSubscription.unsubscribe).toHaveBeenCalled();
  });

  it('createBackendWebsocketDataSource factory creates instance', () => {
    const rootMessenger = new Messenger<
      MockAnyNamespace,
      AllActions,
      AllEvents
    >({
      namespace: MOCK_ANY_NAMESPACE,
    });

    const controllerMessenger = new Messenger<
      'BackendWebsocketDataSource',
      MessengerActions<BackendWebsocketDataSourceMessenger>,
      MessengerEvents<BackendWebsocketDataSourceMessenger>,
      RootMessenger
    >({
      namespace: 'BackendWebsocketDataSource',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger: controllerMessenger,
      actions: [
        'AssetsController:assetsUpdate',
        'AssetsController:activeChainsUpdate',
        'BackendWebSocketService:subscribe',
        'BackendWebSocketService:getConnectionInfo',
        'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      ],
      events: [
        'BackendWebSocketService:connectionStateChanged',
        'AccountsApiDataSource:activeChainsUpdated',
      ],
    });

    rootMessenger.registerActionHandler(
      'AssetsController:assetsUpdate',
      jest.fn(),
    );
    rootMessenger.registerActionHandler(
      'AssetsController:activeChainsUpdate',
      jest.fn(),
    );
    rootMessenger.registerActionHandler(
      'BackendWebSocketService:subscribe',
      jest.fn(),
    );
    rootMessenger.registerActionHandler(
      'BackendWebSocketService:getConnectionInfo',
      jest.fn().mockReturnValue({
        state: WebSocketState.DISCONNECTED,
        url: 'wss://test.example.com',
        reconnectAttempts: 0,
        timeout: 30000,
        reconnectDelay: 1000,
        maxReconnectDelay: 30000,
        requestTimeout: 30000,
      }),
    );
    rootMessenger.registerActionHandler(
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      jest.fn(),
    );

    const instance = createBackendWebsocketDataSource({
      messenger: controllerMessenger,
    });

    expect(instance).toBeInstanceOf(BackendWebsocketDataSource);
    expect(instance.getName()).toBe('BackendWebsocketDataSource');

    instance.destroy();
  });
});
