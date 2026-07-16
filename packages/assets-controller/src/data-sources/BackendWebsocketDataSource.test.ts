import { jest } from '@jest/globals';
/* eslint-disable jest/unbound-method */
import type {
  ApiPlatformClient,
  ServerNotificationMessage,
  WebSocketSubscription,
} from '@metamask/core-backend';
import { WebSocketState } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import type { AssetsControllerMessenger } from '../AssetsController.js';
import type { Caip19AssetId, ChainId, DataRequest } from '../types.js';
import {
  BackendWebsocketDataSource,
  createBackendWebsocketDataSource,
} from './BackendWebsocketDataSource.js';
import type {
  BackendWebsocketDataSourceAllowedActions,
  BackendWebsocketDataSourceAllowedEvents,
} from './BackendWebsocketDataSource.js';

type AllActions = BackendWebsocketDataSourceAllowedActions;
type AllEvents = BackendWebsocketDataSourceAllowedEvents;
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
  addChannelCallbackMock: jest.Mock;
  removeChannelCallbackMock: jest.Mock;
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
    dataTypes: ['balance'],
    ...rest,
  };
}

function createMockWsSubscription(
  channels: string[] = [],
): WebSocketSubscription {
  return {
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    channels,
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
    AllActions,
    AllEvents,
    RootMessenger
  >({
    namespace: 'BackendWebsocketDataSource',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: controllerMessenger,
    actions: [
      'BackendWebSocketService:subscribe',
      'BackendWebSocketService:getConnectionInfo',
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      'BackendWebSocketService:addChannelCallback',
      'BackendWebSocketService:removeChannelCallback',
    ],
    events: ['BackendWebSocketService:connectionStateChanged'],
  });

  const assetsUpdateHandler = jest.fn().mockResolvedValue(undefined);
  const activeChainsUpdateHandler = jest.fn();
  const wsSubscribeMock = jest
    .fn()
    .mockResolvedValue(createMockWsSubscription());
  const addChannelCallbackMock = jest.fn();
  const removeChannelCallbackMock = jest.fn().mockReturnValue(true);
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
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:addChannelCallback',
    addChannelCallbackMock,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:removeChannelCallback',
    removeChannelCallbackMock,
  );

  const queryApiClient = {
    accounts: {
      fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
        fullSupport: initialActiveChains.map((chainId) => {
          const [, ref] = chainId.split(':');
          return parseInt(ref, 10);
        }),
      }),
    },
  };

  const getAssetTypeFn = (
    assetId: Caip19AssetId,
  ): 'native' | 'erc20' | 'spl' => {
    if (assetId.includes('/slip44:')) {
      return 'native';
    }
    if (assetId.startsWith('solana:') && assetId.includes('/token:')) {
      return 'spl';
    }
    return 'erc20';
  };

  const controller = new BackendWebsocketDataSource({
    messenger: controllerMessenger as unknown as AssetsControllerMessenger,
    queryApiClient: queryApiClient as unknown as ApiPlatformClient,
    onActiveChainsUpdated: (dataSourceName, chains, previousChains): void =>
      activeChainsUpdateHandler(dataSourceName, chains, previousChains),
    getAssetType: getAssetTypeFn,
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
    controller.setActiveChainsFromAccountsApi(chains);
    activeChainsUpdateHandler(
      'BackendWebsocketDataSource',
      chains,
      initialActiveChains,
    );
  };

  return {
    controller,
    messenger: rootMessenger,
    wsSubscribeMock,
    getConnectionInfoMock,
    findSubscriptionsMock,
    addChannelCallbackMock,
    removeChannelCallbackMock,
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

  it('exposes getActiveChains on instance', async () => {
    const { controller } = setupController();

    const chains = await controller.getActiveChains();
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
      [],
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
      [],
    );

    controller.destroy();
  });

  it('subscribe creates eip155 channel when no request chains match (eip155 account only)', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_POLYGON] }),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
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

  it('subscribe creates WebSocket subscription when connected', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
    });

    // EIP-155 account only -> eip155 channel with lowercase hex
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
      onAssetsUpdate: jest.fn(),
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

    // Stale pending subscriptions are cleared on reconnect rather than
    // being re-processed. The chain reclaim via updateActiveChains
    // triggers onActiveChainsUpdated, causing AssetsController to create
    // fresh subscriptions with current data.
    expect(wsSubscribeMock).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('subscribe creates channels for multiple namespaces with correct address format per namespace', async () => {
    const solanaAddress = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
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
        accountsWithSupportedChains: [
          {
            account: createMockAccount(),
            supportedChains: [CHAIN_MAINNET],
          },
          {
            account: createMockAccount({
              id: 'solana-account-id',
              address: solanaAddress,
              type: 'solana:data-account',
              scopes: ['solana:0'],
            }),
            supportedChains: [
              'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId,
            ],
          },
        ],
      }),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
    });

    // EIP-155: lowercase hex; Solana: base58 as-is
    expect(wsSubscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: expect.arrayContaining([
          `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
          `account-activity.v1.solana:0:${solanaAddress}`,
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
      onAssetsUpdate: jest.fn(),
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
      isUpdate: true,
      onAssetsUpdate: jest.fn(),
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
      onAssetsUpdate: jest.fn(),
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);

    const newAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        accountsWithSupportedChains: [
          {
            account: createMockAccount({ address: newAddress }),
            supportedChains: [CHAIN_MAINNET],
          },
        ],
        chainIds: [CHAIN_MAINNET],
      }),
      isUpdate: true,
      onAssetsUpdate: jest.fn(),
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('subscribe update treats checksummed and lowercase EVM addresses as unchanged', async () => {
    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        accountsWithSupportedChains: [
          {
            account: createMockAccount({
              address: `0x${MOCK_ADDRESS.slice(2).toUpperCase()}`,
            }),
            supportedChains: [CHAIN_MAINNET],
          },
        ],
        chainIds: [CHAIN_MAINNET],
      }),
      isUpdate: true,
      onAssetsUpdate: jest.fn(),
    });

    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('serializes concurrent subscribe calls so the last address wins', async () => {
    const addressA = MOCK_ADDRESS;
    const addressB = '0xabcdef1234567890abcdef1234567890abcdef12';
    let resolveFirstSubscribe: (() => void) | undefined;
    const firstSubscribeGate = new Promise<void>((resolve) => {
      resolveFirstSubscribe = resolve;
    });

    const { controller, wsSubscribeMock } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    wsSubscribeMock
      .mockImplementationOnce(async () => {
        await firstSubscribeGate;
        return createMockWsSubscription([
          `account-activity.v1.eip155:0:${addressA.toLowerCase()}`,
        ]);
      })
      .mockResolvedValue(
        createMockWsSubscription([
          `account-activity.v1.eip155:0:${addressB.toLowerCase()}`,
        ]),
      );

    const firstSubscribe = controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        accountsWithSupportedChains: [
          {
            account: createMockAccount({ address: addressA }),
            supportedChains: [CHAIN_MAINNET],
          },
        ],
      }),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
    });

    const secondSubscribe = controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        accountsWithSupportedChains: [
          {
            account: createMockAccount({ address: addressB }),
            supportedChains: [CHAIN_MAINNET],
          },
        ],
      }),
      isUpdate: true,
      onAssetsUpdate: jest.fn(),
    });

    await new Promise(process.nextTick);
    resolveFirstSubscribe?.();
    await Promise.all([firstSubscribe, secondSubscribe]);

    expect(wsSubscribeMock).toHaveBeenCalledTimes(2);
    expect(wsSubscribeMock.mock.calls[1][0].channels).toStrictEqual([
      `account-activity.v1.eip155:0:${addressB.toLowerCase()}`,
    ]);

    controller.destroy();
  });

  it('unsubscribe cleans up WebSocket subscription', async () => {
    const channel = `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`;
    const mockWsSubscription = createMockWsSubscription([channel]);
    const { controller, wsSubscribeMock, removeChannelCallbackMock } =
      setupController({
        initialActiveChains: [CHAIN_MAINNET],
        connectionState: WebSocketState.CONNECTED,
      });

    wsSubscribeMock.mockResolvedValueOnce(mockWsSubscription);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
    });

    await controller.unsubscribe('sub-1');

    expect(mockWsSubscription.unsubscribe).toHaveBeenCalled();
    expect(removeChannelCallbackMock).toHaveBeenCalledWith(channel);

    controller.destroy();
  });

  it('registers channel callbacks as fallback when subscriptionId does not match', async () => {
    const channel = `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`;
    const mockWsSubscription = createMockWsSubscription([channel]);
    const onAssetsUpdate = jest.fn().mockResolvedValue(undefined);
    const { controller, wsSubscribeMock, addChannelCallbackMock } =
      setupController({
        initialActiveChains: [CHAIN_MAINNET],
        connectionState: WebSocketState.CONNECTED,
      });

    wsSubscribeMock.mockResolvedValueOnce(mockWsSubscription);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate,
    });

    expect(addChannelCallbackMock).toHaveBeenCalledWith(
      expect.objectContaining({ channelName: channel }),
    );

    const channelCallback = addChannelCallbackMock.mock.calls.find(
      ([args]) => args.channelName === channel,
    )?.[0].callback;

    expect(channelCallback).toBeDefined();

    channelCallback(
      createMockNotification({
        channel: `account-activity.v1.eip155:42161:${MOCK_ADDRESS.toLowerCase()}`,
        subscriptionId: 'stale-server-sub-id',
        data: {
          address: MOCK_ADDRESS,
          tx: { chain: CHAIN_MAINNET },
          updates: [
            {
              asset: {
                type: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                decimals: 6,
              },
              postBalance: { amount: '1000000' },
            },
          ],
        },
      }),
    );

    await new Promise(process.nextTick);

    expect(onAssetsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: expect.objectContaining({
          'mock-account-id': expect.any(Object),
        }),
      }),
      expect.objectContaining({
        accountsWithSupportedChains: expect.any(Array),
      }),
    );

    controller.destroy();
  });

  it('still stores subscription state when channel callback registration fails', async () => {
    const channel = `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`;
    const onAssetsUpdate = jest.fn().mockResolvedValue(undefined);
    let notificationCallback: (
      notification: ServerNotificationMessage,
    ) => void = () => undefined;

    const rootMessenger = new Messenger<
      MockAnyNamespace,
      AllActions,
      AllEvents
    >({ namespace: MOCK_ANY_NAMESPACE });
    const controllerMessenger = new Messenger<
      'BackendWebsocketDataSource',
      AllActions,
      AllEvents,
      RootMessenger
    >({
      namespace: 'BackendWebsocketDataSource',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger: controllerMessenger,
      actions: [
        'BackendWebSocketService:subscribe',
        'BackendWebSocketService:getConnectionInfo',
        'BackendWebSocketService:addChannelCallback',
      ],
      events: ['BackendWebSocketService:connectionStateChanged'],
    });

    rootMessenger.registerActionHandler(
      'BackendWebSocketService:subscribe',
      ({ callback }) => {
        notificationCallback = callback;
        return Promise.resolve(createMockWsSubscription([channel]));
      },
    );
    rootMessenger.registerActionHandler(
      'BackendWebSocketService:getConnectionInfo',
      () => ({
        state: WebSocketState.CONNECTED,
        url: 'wss://test.example.com',
        reconnectAttempts: 0,
        timeout: 30000,
        reconnectDelay: 1000,
        maxReconnectDelay: 30000,
        requestTimeout: 30000,
      }),
    );
    rootMessenger.registerActionHandler(
      'BackendWebSocketService:addChannelCallback',
      () => {
        throw new Error(
          'A handler for BackendWebSocketService:addChannelCallback has not been delegated to AssetsController',
        );
      },
    );

    const controller = new BackendWebsocketDataSource({
      messenger: controllerMessenger as unknown as AssetsControllerMessenger,
      queryApiClient: {
        accounts: {
          fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
            fullSupport: [1],
          }),
        },
      } as unknown as ApiPlatformClient,
      onActiveChainsUpdated: jest.fn(),
      getAssetType: (): 'erc20' => 'erc20',
      state: { activeChains: [CHAIN_MAINNET] },
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate,
    });

    notificationCallback(
      createMockNotification({
        channel,
        data: {
          address: MOCK_ADDRESS,
          tx: { chain: CHAIN_MAINNET },
          updates: [
            {
              asset: {
                type: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                decimals: 6,
              },
              postBalance: { amount: '1000000' },
            },
          ],
        },
      }),
    );

    await new Promise(process.nextTick);

    expect(onAssetsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: expect.objectContaining({
          'mock-account-id': expect.any(Object),
        }),
      }),
      expect.objectContaining({ dataTypes: ['balance'] }),
    );

    controller.destroy();
  });

  it('handles WebSocket disconnect by releasing chains and reclaiming on reconnect', async () => {
    const {
      controller,
      wsSubscribeMock,
      getConnectionInfoMock,
      activeChainsUpdateHandler,
      triggerConnectionStateChange,
    } = setupController({
      initialActiveChains: [CHAIN_MAINNET],
      connectionState: WebSocketState.CONNECTED,
    });

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
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

    activeChainsUpdateHandler.mockClear();
    triggerConnectionStateChange(WebSocketState.CONNECTED);
    await new Promise(process.nextTick);

    // Stale pending subscriptions are NOT re-processed on reconnect.
    // Instead, chain reclaim fires onActiveChainsUpdated so
    // AssetsController creates fresh subscriptions with current data.
    expect(wsSubscribeMock).toHaveBeenCalledTimes(1);
    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'BackendWebsocketDataSource',
      [CHAIN_MAINNET],
      expect.any(Array),
    );

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
      onAssetsUpdate: assetsUpdateHandler,
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

    // Raw 10e18 wei (0x8ac7230489e80000) with 18 decimals → human-readable "10"
    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: expect.objectContaining({
          'mock-account-id': expect.objectContaining({
            'eip155:8453/slip44:60': { amount: '10' },
          }),
        }),
        assetsInfo: expect.objectContaining({
          'eip155:8453/slip44:60': expect.objectContaining({
            type: 'native',
            symbol: 'ETH',
            decimals: 18,
          }),
        }),
      }),
      expect.objectContaining({
        dataTypes: ['balance'],
        accountsWithSupportedChains: expect.any(Array),
      }),
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
      onAssetsUpdate: assetsUpdateHandler,
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

    // Raw 1000000 (1 USDC) with 6 decimals → human-readable "1"
    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: expect.objectContaining({
          'mock-account-id': expect.objectContaining({
            'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
              amount: '1',
            },
          }),
        }),
        assetsInfo: expect.objectContaining({
          'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48':
            expect.objectContaining({
              type: 'erc20',
              symbol: 'USDC',
              decimals: 6,
            }),
        }),
      }),
      expect.objectContaining({
        dataTypes: ['balance'],
        accountsWithSupportedChains: expect.any(Array),
      }),
    );

    controller.destroy();
  });

  it('converts raw WebSocket balance (hex) to human-readable using asset decimals', async () => {
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
      onAssetsUpdate: assetsUpdateHandler,
    });

    // 0x26f0e5 = 2552037 raw; USDC 6 decimals → 2.552037
    const notification = createMockNotification({
      channel: `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
      data: {
        address: MOCK_ADDRESS,
        tx: { chain: CHAIN_MAINNET },
        updates: [
          {
            asset: {
              type: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              unit: 'USDC',
              decimals: 6,
            },
            postBalance: {
              amount: '0x26f0e5',
            },
          },
        ],
      },
    });

    notificationCallback(notification);
    await new Promise(process.nextTick);

    // assetId key is as in notification (mixed case)
    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: expect.objectContaining({
          'mock-account-id': expect.objectContaining({
            'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': {
              amount: '2.552037',
            },
          }),
        }),
      }),
      expect.objectContaining({
        dataTypes: ['balance'],
        accountsWithSupportedChains: expect.any(Array),
      }),
    );

    controller.destroy();
  });

  it('emits plain decimal (not exponent form) for sub-1e-7 dust balances', async () => {
    // Regression for MMBUGS-772: BigNumber's default EXPONENTIAL_AT makes
    // `.toString()` emit "1e-18" for tiny values, which crashes downstream
    // BigInt() consumers. The source uses `.toFixed()` to stay in plain form.
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
      onAssetsUpdate: assetsUpdateHandler,
    });

    // 1 wei of an 18-decimal token = 1e-18 — squarely past BigNumber's
    // default exponential threshold.
    const notification = createMockNotification({
      channel: `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
      data: {
        address: MOCK_ADDRESS,
        tx: { chain: CHAIN_MAINNET },
        updates: [
          {
            asset: {
              type: 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
              unit: 'TEST',
              decimals: 18,
            },
            postBalance: {
              amount: '0x1',
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
            'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': {
              amount: '0.000000000000000001',
            },
          }),
        }),
      }),
      expect.objectContaining({
        dataTypes: ['balance'],
        accountsWithSupportedChains: expect.any(Array),
      }),
    );

    controller.destroy();
  });

  it('skips balance update when asset.decimals is missing', async () => {
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
      onAssetsUpdate: assetsUpdateHandler,
    });

    // No decimals on asset → update is skipped (we assume decimals are always present)
    const notification = createMockNotification({
      channel: `account-activity.v1.eip155:0:${MOCK_ADDRESS.toLowerCase()}`,
      data: {
        address: MOCK_ADDRESS,
        tx: { chain: CHAIN_MAINNET },
        updates: [
          {
            asset: {
              type: 'eip155:1/erc20:0x0000000000000000000000000000000000000001',
              unit: 'UNKNOWN',
              decimals: undefined,
            },
            postBalance: {
              amount: '1000000000000000000',
            },
          },
        ],
      },
    });

    notificationCallback(notification);
    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

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
      onAssetsUpdate: jest.fn(),
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
      onAssetsUpdate: jest.fn(),
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
      onAssetsUpdate: jest.fn(),
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
      onAssetsUpdate: jest.fn(),
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
      AllActions,
      AllEvents,
      RootMessenger
    >({
      namespace: 'BackendWebsocketDataSource',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger: controllerMessenger,
      actions: [
        'BackendWebSocketService:subscribe',
        'BackendWebSocketService:getConnectionInfo',
        'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      ],
      events: ['BackendWebSocketService:connectionStateChanged'],
    });

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

    const queryApiClient = {
      accounts: {
        fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
          fullSupport: [],
        }),
      },
    };

    const instance = createBackendWebsocketDataSource({
      messenger: controllerMessenger as unknown as AssetsControllerMessenger,
      queryApiClient: queryApiClient as unknown as ApiPlatformClient,
      onActiveChainsUpdated: jest.fn(),
    });

    expect(instance).toBeInstanceOf(BackendWebsocketDataSource);
    expect(instance.getName()).toBe('BackendWebsocketDataSource');

    instance.destroy();
  });
});
