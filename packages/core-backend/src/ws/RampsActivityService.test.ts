import type { KeyringControllerUnlockEvent } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { flushPromises } from '../../../../tests/helpers.js';
import {
  RampsActivityService,
  RAMPS_ACTIVITY_SERVICE_ALLOWED_ACTIONS,
  RAMPS_ACTIVITY_SERVICE_ALLOWED_EVENTS,
} from './RampsActivityService.js';
import type { RampsActivityServiceMessenger } from './RampsActivityService.js';
import type { ServerNotificationMessage } from './BackendWebSocketService.js';
import { WebSocketState } from './BackendWebSocketService.js';

type AllActions = MessengerActions<RampsActivityServiceMessenger>;
type AllEvents = MessengerEvents<RampsActivityServiceMessenger>;
type RootMessenger = Messenger<
  MockAnyNamespace,
  AllActions,
  AllEvents | KeyringControllerUnlockEvent
>;

const CONNECTION_INFO = {
  state: WebSocketState.CONNECTED,
  url: 'ws://test',
  reconnectAttempts: 0,
  timeout: 10_000,
  reconnectDelay: 500,
  maxReconnectDelay: 5_000,
  requestTimeout: 30_000,
};

const PROFILE = {
  identifierId: 'identifier-id',
  profileId: 'profile-id',
  canonicalProfileId: 'canonical-profile-id',
  metaMetricsId: 'metrics-id',
};

const VALID_EVENT = {
  eventId: 'event-id',
  type: 'transaction.updated',
  category: 'transaction',
  occurredAt: '2026-09-17T12:00:00.000Z',
  entity: {
    id: 'transaction-id',
    kind: 'deposit',
    status: 'completed',
    transactionStatus: 'confirmed',
    transactionHash: '0x123',
  },
  needsFetch: true,
} as const;

const completeAsyncOperations = async (): Promise<void> => {
  await flushPromises();
  await flushPromises();
  await flushPromises();
};

type ServiceSetup = {
  service: RampsActivityService;
  messenger: RampsActivityServiceMessenger;
  rootMessenger: RootMessenger;
  mocks: {
    getSessionProfile: jest.Mock;
    connect: jest.Mock;
    subscribe: jest.Mock;
    getConnectionInfo: jest.Mock;
    channelHasSubscription: jest.Mock;
    findSubscriptionsByChannelPrefix: jest.Mock;
  };
};

const setupService = (profile = PROFILE): ServiceSetup => {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: RampsActivityServiceMessenger = new Messenger({
    namespace: 'RampsActivityService',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [...RAMPS_ACTIVITY_SERVICE_ALLOWED_ACTIONS],
    events: [...RAMPS_ACTIVITY_SERVICE_ALLOWED_EVENTS],
  });

  const getSessionProfile = jest.fn().mockResolvedValue(profile);
  const connect = jest.fn().mockResolvedValue(undefined);
  const subscribe = jest.fn().mockResolvedValue(undefined);
  const getConnectionInfo = jest.fn().mockReturnValue(CONNECTION_INFO);
  const channelHasSubscription = jest.fn().mockReturnValue(false);
  const findSubscriptionsByChannelPrefix = jest.fn().mockReturnValue([]);

  rootMessenger.registerActionHandler(
    'AuthenticationController:getSessionProfile',
    getSessionProfile,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:connect',
    connect,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:subscribe',
    subscribe,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:getConnectionInfo',
    getConnectionInfo,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:channelHasSubscription',
    channelHasSubscription,
  );
  rootMessenger.registerActionHandler(
    'BackendWebSocketService:findSubscriptionsByChannelPrefix',
    findSubscriptionsByChannelPrefix,
  );

  const service = new RampsActivityService({ messenger });

  return {
    service,
    messenger,
    rootMessenger,
    mocks: {
      getSessionProfile,
      connect,
      subscribe,
      getConnectionInfo,
      channelHasSubscription,
      findSubscriptionsByChannelPrefix,
    },
  };
};

const getSubscriptionCallback = (
  subscribe: jest.Mock,
): ((notification: ServerNotificationMessage) => void) =>
  subscribe.mock.calls.at(-1)[0].callback;

describe('RampsActivityService', () => {
  it('derives the channel from the session profile', async () => {
    const { service, mocks } = setupService();

    await service.init();

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.getSessionProfile).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenCalledWith({
      channels: ['ramps-activity.v1.canonical-profile-id'],
      channelType: 'ramps-activity.v1',
      callback: expect.any(Function),
    });
  });

  it('does not subscribe when no profile can be resolved', async () => {
    const { service, mocks } = setupService();
    mocks.getSessionProfile.mockRejectedValue(new Error('No profile'));

    await service.init();

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('publishes validated events without unsupported fields', async () => {
    const { service, messenger, mocks } = setupService();
    const listener = jest.fn();
    messenger.subscribe('RampsActivityService:eventReceived', listener);
    await service.init();

    getSubscriptionCallback(mocks.subscribe)({
      event: 'notification',
      channel: 'ramps-activity.v1.canonical-profile-id',
      data: { ...VALID_EVENT, ignored: 'field' },
      timestamp: Date.now(),
    } as ServerNotificationMessage);

    expect(listener).toHaveBeenCalledWith(VALID_EVENT);
  });

  it.each([
    { ...VALID_EVENT, eventId: 1 },
    { ...VALID_EVENT, category: 'invalid' },
    { ...VALID_EVENT, entity: [] },
    { ...VALID_EVENT, entity: { status: 'missing-id' } },
    { ...VALID_EVENT, entity: { id: 'id', kind: 1 } },
    { ...VALID_EVENT, entity: { id: 'id', status: 1 } },
    { ...VALID_EVENT, entity: { id: 'id', transactionStatus: 1 } },
    { ...VALID_EVENT, entity: { id: 'id', transactionHash: 1 } },
    { ...VALID_EVENT, needsFetch: 'yes' },
    { ...VALID_EVENT, payload: {} },
    { ...VALID_EVENT, customerId: 'customer-id' },
    { ...VALID_EVENT, userId: 'user-id' },
  ])('ignores malformed event data %#', async (data) => {
    const { service, messenger, mocks } = setupService();
    const listener = jest.fn();
    messenger.subscribe('RampsActivityService:eventReceived', listener);
    await service.init();

    getSubscriptionCallback(mocks.subscribe)({
      event: 'notification',
      channel: 'ramps-activity.v1.canonical-profile-id',
      data,
      timestamp: Date.now(),
    } as unknown as ServerNotificationMessage);

    expect(listener).not.toHaveBeenCalled();
  });

  it('accepts a null entity', async () => {
    const { service, messenger, mocks } = setupService();
    const listener = jest.fn();
    messenger.subscribe('RampsActivityService:eventReceived', listener);
    await service.init();

    getSubscriptionCallback(mocks.subscribe)({
      event: 'notification',
      channel: 'ramps-activity.v1.canonical-profile-id',
      data: { ...VALID_EVENT, entity: null },
      timestamp: Date.now(),
    } as ServerNotificationMessage);

    expect(listener).toHaveBeenCalledWith({ ...VALID_EVENT, entity: null });
  });

  it('accepts an entity with only its required id', async () => {
    const { service, messenger, mocks } = setupService();
    const listener = jest.fn();
    messenger.subscribe('RampsActivityService:eventReceived', listener);
    await service.init();
    const event = { ...VALID_EVENT, entity: { id: 'entity-id' } };

    getSubscriptionCallback(mocks.subscribe)({
      event: 'notification',
      channel: 'ramps-activity.v1.canonical-profile-id',
      data: event,
      timestamp: Date.now(),
    } as ServerNotificationMessage);

    expect(listener).toHaveBeenCalledWith(event);
  });

  it('resubscribes after reconnect', async () => {
    const { service, rootMessenger, mocks } = setupService();
    await service.init();
    mocks.subscribe.mockClear();

    rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
      ...CONNECTION_INFO,
      reconnectAttempts: 1,
    });
    await completeAsyncOperations();

    expect(mocks.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['ramps-activity.v1.canonical-profile-id'],
      }),
    );
  });

  it('unsubscribes the old profile before subscribing to a changed profile', async () => {
    const { service, rootMessenger, mocks } = setupService();
    const unsubscribe = jest.fn().mockResolvedValue(undefined);
    await service.init();
    mocks.findSubscriptionsByChannelPrefix.mockReturnValue([{ unsubscribe }]);
    mocks.getSessionProfile.mockResolvedValue({
      ...PROFILE,
      canonicalProfileId: 'new-canonical-profile-id',
    });

    rootMessenger.publish('AuthenticationController:profileSignIn', {
      profileId: 'new-canonical-profile-id',
      profileAliases: [],
      profileIdChanged: true,
    });
    await completeAsyncOperations();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channels: ['ramps-activity.v1.new-canonical-profile-id'],
      }),
    );
  });

  it('resubscribes after wallet unlock', async () => {
    const { rootMessenger, mocks } = setupService();

    rootMessenger.publish('KeyringController:unlock');
    await completeAsyncOperations();

    expect(mocks.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['ramps-activity.v1.canonical-profile-id'],
      }),
    );
  });

  it('cleans up active subscriptions on destroy', async () => {
    const { service, mocks } = setupService();
    const unsubscribe = jest.fn().mockResolvedValue(undefined);
    mocks.findSubscriptionsByChannelPrefix.mockReturnValue([{ unsubscribe }]);

    await service.destroy();

    expect(mocks.findSubscriptionsByChannelPrefix).toHaveBeenCalledWith(
      'ramps-activity.v1',
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('publishes connection status changes', async () => {
    const { messenger, rootMessenger } = setupService();
    const listener = jest.fn();
    messenger.subscribe('RampsActivityService:statusChanged', listener);

    rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
      ...CONNECTION_INFO,
      state: WebSocketState.DISCONNECTED,
    });
    await completeAsyncOperations();

    expect(listener).toHaveBeenCalledWith({
      status: WebSocketState.DISCONNECTED,
    });
  });

  it('cleans up subscriptions after sign out', async () => {
    const { rootMessenger, mocks } = setupService();
    const unsubscribe = jest.fn().mockResolvedValue(undefined);
    mocks.findSubscriptionsByChannelPrefix.mockReturnValue([{ unsubscribe }]);

    rootMessenger.publish(
      'AuthenticationController:stateChange',
      { isSignedIn: false },
      [],
    );
    await completeAsyncOperations();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('falls back to the per-SRP profile id when canonical is empty', async () => {
    const { service, mocks } = setupService({
      ...PROFILE,
      canonicalProfileId: '',
    });

    await service.init();

    expect(mocks.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['ramps-activity.v1.profile-id'],
      }),
    );
  });

  it('subscribes when the wallet signs in', async () => {
    const { rootMessenger, mocks } = setupService();

    rootMessenger.publish(
      'AuthenticationController:stateChange',
      { isSignedIn: true },
      [],
    );
    await completeAsyncOperations();

    expect(mocks.subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not resubscribe when sign-in state is unchanged', async () => {
    const { rootMessenger, mocks } = setupService();
    rootMessenger.publish(
      'AuthenticationController:stateChange',
      { isSignedIn: true },
      [],
    );
    await completeAsyncOperations();
    mocks.subscribe.mockClear();

    rootMessenger.publish(
      'AuthenticationController:stateChange',
      { isSignedIn: true, sessionData: { token: 'rotated' } },
      [],
    );
    await completeAsyncOperations();

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('skips subscribe when the channel is already registered', async () => {
    const { service, mocks } = setupService();
    mocks.channelHasSubscription.mockReturnValue(true);

    await service.init();

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('skips subscribe while the WebSocket is disconnected', async () => {
    const { service, mocks } = setupService();
    mocks.getConnectionInfo.mockReturnValue({
      ...CONNECTION_INFO,
      state: WebSocketState.DISCONNECTED,
    });

    await service.init();

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('skips subscribe when neither profile id is available', async () => {
    const { service, mocks } = setupService({
      ...PROFILE,
      canonicalProfileId: '',
      profileId: '',
    });

    await service.init();

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('does not subscribe when destroyed while resolving the profile', async () => {
    const { service, mocks } = setupService();
    let resolveProfile: ((profile: typeof PROFILE) => void) | undefined;
    mocks.getSessionProfile.mockReturnValue(
      new Promise<typeof PROFILE>((resolve) => {
        resolveProfile = resolve;
      }),
    );

    const initPromise = service.init();
    await completeAsyncOperations();
    await service.destroy();
    resolveProfile?.(PROFILE);
    await initPromise;

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('does not subscribe when destroyed while replacing a subscription', async () => {
    const { service, mocks } = setupService();
    let resolveFirstUnsubscribe: (() => void) | undefined;
    const unsubscribe = jest
      .fn()
      .mockImplementationOnce(
        async () =>
          await new Promise<void>((resolve) => {
            resolveFirstUnsubscribe = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    mocks.findSubscriptionsByChannelPrefix.mockReturnValue([{ unsubscribe }]);

    const initPromise = service.init();
    await completeAsyncOperations();
    const destroyPromise = service.destroy();
    resolveFirstUnsubscribe?.();
    await Promise.all([initPromise, destroyPromise]);

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('does not subscribe when destroyed after checking the channel', async () => {
    const { service, mocks } = setupService();
    mocks.channelHasSubscription.mockImplementation(() => {
      void service.destroy();
      return false;
    });

    await service.init();

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('does not replace a subscription after destroy', async () => {
    const { service, rootMessenger, mocks } = setupService();
    await service.destroy();

    rootMessenger.publish('AuthenticationController:profileSignIn', {
      profileId: 'new-profile-id',
      profileAliases: [],
      profileIdChanged: true,
    });
    await completeAsyncOperations();

    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('does not subscribe after destroy on reconnect', async () => {
    const { service, rootMessenger, mocks } = setupService();
    await service.destroy();
    mocks.subscribe.mockClear();

    rootMessenger.publish('BackendWebSocketService:connectionStateChanged', {
      ...CONNECTION_INFO,
    });
    await completeAsyncOperations();

    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it('does not throw from init when connect fails', async () => {
    const { service, mocks } = setupService();
    mocks.connect.mockRejectedValue(new Error('connect failed'));

    expect(await service.init()).toBeUndefined();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });
});
