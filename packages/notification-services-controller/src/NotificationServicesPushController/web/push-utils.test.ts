import * as FirebaseAppModule from 'firebase/app';
import * as FirebaseMessagingModule from 'firebase/messaging';
import * as FirebaseMessagingSWModule from 'firebase/messaging/sw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import { buildPushPlatformNotificationsControllerMessenger } from '../__fixtures__/mockMessenger.js';
import type { PushAnalyticsPayload } from '../types/index.js';
import type * as PushUtilsModule from './push-utils.js';

vi.mock('firebase/app');
vi.mock('firebase/messaging');
vi.mock('firebase/messaging/sw');

const mockEnv = {
  apiKey: 'test-apiKey',
  authDomain: 'test-authDomain',
  storageBucket: 'test-storageBucket',
  projectId: 'test-projectId',
  messagingSenderId: 'test-messagingSenderId',
  appId: 'test-appId',
  measurementId: 'test-measurementId',
  vapidKey: 'test-vapidKey',
};

const mockFcmData = {
  notification_id: 'test-notification-id',
  notification_type: 'wallet_activity',
  notification_subtype: 'eth_received',
  profile_id: 'test-profile-id',
  chain_id: '1',
  deeplink: 'https://example.com/deeplink',
};

const expectedAnalyticsPayload: PushAnalyticsPayload = {
  notification_id: 'test-notification-id',
  notification_type: 'wallet_activity',
  notification_subtype: 'eth_received',
  chain_id: 1,
  deeplink: 'https://example.com/deeplink',
};

const firebaseApp: FirebaseAppModule.FirebaseApp = {
  name: '',
  automaticDataCollectionEnabled: false,
  options: mockEnv,
};

/**
 * Imports a fresh copy of `push-utils.js`, so its module level
 * `supportedCache` starts out empty in every test.
 *
 * @returns The freshly imported module.
 */
async function importPushUtils(): Promise<typeof PushUtilsModule> {
  vi.resetModules();
  return await import('./push-utils.js');
}

function arrangeFirebaseAppMocks(): {
  mockGetApp: MockInstance;
  mockInitializeApp: MockInstance;
} {
  const mockGetApp = vi
    .spyOn(FirebaseAppModule, 'getApp')
    .mockReturnValue(firebaseApp);

  const mockInitializeApp = vi
    .spyOn(FirebaseAppModule, 'initializeApp')
    .mockReturnValue(firebaseApp);

  return { mockGetApp, mockInitializeApp };
}

function arrangeFirebaseMessagingSWMocks(): {
  mockIsSupported: MockInstance;
  mockGetMessaging: MockInstance;
  mockOnBackgroundMessage: MockInstance;
  mockOnBackgroundMessageUnsub: Mock;
} {
  const mockIsSupported = vi
    .spyOn(FirebaseMessagingSWModule, 'isSupported')
    .mockResolvedValue(true);

  const mockGetMessaging = vi
    .spyOn(FirebaseMessagingSWModule, 'getMessaging')
    .mockReturnValue({ app: firebaseApp });

  const mockOnBackgroundMessageUnsub = vi.fn();
  const mockOnBackgroundMessage = vi
    .spyOn(FirebaseMessagingSWModule, 'onBackgroundMessage')
    .mockReturnValue(mockOnBackgroundMessageUnsub);

  return {
    mockIsSupported,
    mockGetMessaging,
    mockOnBackgroundMessage,
    mockOnBackgroundMessageUnsub,
  };
}

function arrangeFirebaseMessagingMocks(): {
  mockGetToken: MockInstance;
  mockDeleteToken: MockInstance;
} {
  const mockGetToken = vi
    .spyOn(FirebaseMessagingModule, 'getToken')
    .mockResolvedValue('test-token');

  const mockDeleteToken = vi
    .spyOn(FirebaseMessagingModule, 'deleteToken')
    .mockResolvedValue(true);

  return { mockGetToken, mockDeleteToken };
}

describe('createRegToken() tests', () => {
  let createRegToken: typeof PushUtilsModule.createRegToken;

  beforeEach(async () => {
    ({ createRegToken } = await importPushUtils());
  });

  const TEST_TOKEN = 'test-token';

  function arrange(): ReturnType<typeof arrangeFirebaseAppMocks> &
    ReturnType<typeof arrangeFirebaseMessagingSWMocks> &
    ReturnType<typeof arrangeFirebaseMessagingMocks> {
    const firebaseMocks = {
      ...arrangeFirebaseAppMocks(),
      ...arrangeFirebaseMessagingSWMocks(),
      ...arrangeFirebaseMessagingMocks(),
    };

    firebaseMocks.mockGetToken.mockResolvedValue(TEST_TOKEN);

    return {
      ...firebaseMocks,
    };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return a registration token when Firebase is supported', async () => {
    const { mockGetApp, mockGetToken } = arrange();

    const token = await createRegToken(mockEnv);

    expect(mockGetApp).toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalled();
    expect(token).toBe(TEST_TOKEN);
  });

  it('should return null when Firebase is not supported', async () => {
    const { mockIsSupported } = arrange();
    mockIsSupported.mockResolvedValueOnce(false);

    const token = await createRegToken(mockEnv);

    expect(token).toBeNull();
  });

  it('should return null if an error occurs', async () => {
    const { mockGetToken } = arrange();
    mockGetToken.mockRejectedValueOnce(new Error('Error getting token'));

    const token = await createRegToken(mockEnv);

    expect(token).toBeNull();
  });

  it('should initialize firebase if has not been created yet', async () => {
    const { mockGetApp, mockInitializeApp, mockGetToken } = arrange();
    mockGetApp.mockImplementation(() => {
      throw new Error('mock Firebase GetApp failure');
    });

    const token = await createRegToken(mockEnv);

    expect(mockGetApp).toHaveBeenCalled();
    expect(mockInitializeApp).toHaveBeenCalled();
    expect(mockGetToken).toHaveBeenCalled();
    expect(token).toBe(TEST_TOKEN);
  });
});

describe('deleteRegToken() tests', () => {
  let deleteRegToken: typeof PushUtilsModule.deleteRegToken;

  beforeEach(async () => {
    ({ deleteRegToken } = await importPushUtils());
  });

  function arrange(): ReturnType<typeof arrangeFirebaseAppMocks> &
    ReturnType<typeof arrangeFirebaseMessagingSWMocks> &
    ReturnType<typeof arrangeFirebaseMessagingMocks> {
    return {
      ...arrangeFirebaseAppMocks(),
      ...arrangeFirebaseMessagingSWMocks(),
      ...arrangeFirebaseMessagingMocks(),
    };
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when the token is successfully deleted', async () => {
    const { mockGetApp, mockDeleteToken } = arrange();

    const result = await deleteRegToken(mockEnv);

    expect(mockGetApp).toHaveBeenCalled();
    expect(mockDeleteToken).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('should return true when Firebase is not supported', async () => {
    const { mockIsSupported, mockDeleteToken } = arrange();
    mockIsSupported.mockResolvedValueOnce(false);

    const result = await deleteRegToken(mockEnv);

    expect(result).toBe(true);
    expect(mockDeleteToken).not.toHaveBeenCalled();
  });

  it('should return false if an error occurs', async () => {
    const { mockDeleteToken } = arrange();
    mockDeleteToken.mockRejectedValueOnce(new Error('Error deleting token'));

    const result = await deleteRegToken(mockEnv);

    expect(result).toBe(false);
  });
});

describe('createSubscribeToPushNotifications() tests', () => {
  let createSubscribeToPushNotifications: typeof PushUtilsModule.createSubscribeToPushNotifications;

  beforeEach(async () => {
    ({ createSubscribeToPushNotifications } = await importPushUtils());
  });

  function arrangeMessengerMocks(): {
    messenger: ReturnType<
      typeof buildPushPlatformNotificationsControllerMessenger
    >;
    onNewNotificationsListener: Mock;
    pushNotificationClickedListener: Mock;
  } {
    const messenger = buildPushPlatformNotificationsControllerMessenger();

    const onNewNotificationsListener = vi.fn();
    messenger.subscribe(
      'NotificationServicesPushController:onNewNotifications',
      onNewNotificationsListener,
    );

    const pushNotificationClickedListener = vi.fn();
    messenger.subscribe(
      'NotificationServicesPushController:pushNotificationClicked',
      pushNotificationClickedListener,
    );

    return {
      messenger,
      onNewNotificationsListener,
      pushNotificationClickedListener,
    };
  }

  function arrangeClickListenerMocks(): {
    mockAddEventListener: MockInstance;
    mockRemoveEventListener: MockInstance;
  } {
    // Testing service worker functionality requires using the 'self' global
    // eslint-disable-next-line no-restricted-globals
    const mockAddEventListener = vi.spyOn(self, 'addEventListener');
    // eslint-disable-next-line no-restricted-globals
    const mockRemoveEventListener = vi.spyOn(self, 'removeEventListener');

    return {
      mockAddEventListener,
      mockRemoveEventListener,
    };
  }

  function arrange(): ReturnType<typeof arrangeFirebaseAppMocks> &
    ReturnType<typeof arrangeFirebaseMessagingSWMocks> &
    ReturnType<typeof arrangeMessengerMocks> &
    ReturnType<typeof arrangeClickListenerMocks> & {
      mockOnReceivedHandler: Mock;
      mockOnClickHandler: Mock;
    } {
    const firebaseMocks = {
      ...arrangeFirebaseAppMocks(),
      ...arrangeFirebaseMessagingSWMocks(),
    };

    return {
      ...firebaseMocks,
      ...arrangeMessengerMocks(),
      ...arrangeClickListenerMocks(),
      mockOnReceivedHandler: vi.fn(),
      mockOnClickHandler: vi.fn(),
    };
  }

  async function actCreateSubscription(
    mocks: ReturnType<typeof arrange>,
  ): Promise<() => void> {
    const unsubscribe = await createSubscribeToPushNotifications({
      messenger: mocks.messenger,
      onReceivedHandler: mocks.mockOnReceivedHandler,
      onClickHandler: mocks.mockOnClickHandler,
    })(mockEnv);

    return unsubscribe;
  }

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize subscriptions', async () => {
    const mocks = arrange();

    await actCreateSubscription(mocks);

    // Assert - Firebase Calls
    expect(mocks.mockGetApp).toHaveBeenCalled();
    expect(mocks.mockGetMessaging).toHaveBeenCalled();
    expect(mocks.mockOnBackgroundMessage).toHaveBeenCalled();

    // Assert - Click Listener Created
    expect(mocks.mockAddEventListener).toHaveBeenCalled();
  });

  it('should destroy subscriptions', async () => {
    const mocks = arrange();

    const unsubscribe = await actCreateSubscription(mocks);

    // Assert - subscriptions not destroyed
    expect(mocks.mockOnBackgroundMessageUnsub).not.toHaveBeenCalled();
    expect(mocks.mockRemoveEventListener).not.toHaveBeenCalled();

    // Act - Unsubscribe
    unsubscribe();

    // Assert - subscriptions destroyed
    expect(mocks.mockOnBackgroundMessageUnsub).toHaveBeenCalled();
    expect(mocks.mockRemoveEventListener).toHaveBeenCalled();
  });

  async function arrangeActNotificationReceived(
    testData: unknown,
  ): Promise<ReturnType<typeof arrange>> {
    const mocks = arrange();
    await actCreateSubscription(mocks);

    const firebaseCallback = mocks.mockOnBackgroundMessage.mock
      .lastCall?.[1] as FirebaseMessagingModule.NextFn<FirebaseMessagingSWModule.MessagePayload>;
    const payload = {
      data: testData,
    } as unknown as FirebaseMessagingSWModule.MessagePayload;

    firebaseCallback(payload);

    return mocks;
  }

  it('should invoke handler with the parsed analytics payload when notifications are received', async () => {
    const mocks = await arrangeActNotificationReceived(mockFcmData);

    // Assert New Notification Event & Handler Calls carry the analytics payload
    expect(mocks.onNewNotificationsListener).toHaveBeenCalledWith(
      expectedAnalyticsPayload,
    );
    expect(mocks.mockOnReceivedHandler).toHaveBeenCalledWith(
      expectedAnalyticsPayload,
    );

    // Assert Click Notification Event & Handler Calls
    expect(mocks.pushNotificationClickedListener).not.toHaveBeenCalled();
    expect(mocks.mockOnClickHandler).not.toHaveBeenCalled();
  });

  const invalidNotificationDataPayloadsTests = [
    { data: undefined },
    { data: null },
    { data: 'not an object' },
    // Missing the required `notification_type` field.
    { data: { notification_id: 'test-id' } },
    // Missing the required `notification_id` field.
    { data: { notification_type: 'wallet_activity' } },
  ];

  it.each(invalidNotificationDataPayloadsTests)(
    'should fail to invoke handler if provided invalid push notification data payload - data $data',
    async ({ data }) => {
      const mocks = await arrangeActNotificationReceived(data);
      expect(mocks.mockOnReceivedHandler).not.toHaveBeenCalled();
    },
  );

  it('should invoke handler when notifications are clicked', async () => {
    const mocks = arrange();
    // We do not want to mock this, as we will dispatch the notification click event
    mocks.mockAddEventListener.mockRestore();

    await actCreateSubscription(mocks);

    const mockNotificationEvent = new Event(
      'notificationclick',
    ) as NotificationEvent;
    Object.assign(mockNotificationEvent, {
      notification: { data: expectedAnalyticsPayload },
    });

    // Act - Testing service worker notification click event
    // eslint-disable-next-line no-restricted-globals
    self.dispatchEvent(mockNotificationEvent);

    // Assert Click Notification Event & Handler Calls carry the analytics payload
    expect(mocks.pushNotificationClickedListener).toHaveBeenCalledWith(
      expectedAnalyticsPayload,
    );
    expect(mocks.mockOnClickHandler).toHaveBeenCalledWith(
      expect.any(Event),
      expectedAnalyticsPayload,
    );

    // Assert New Notification Event & Handler Calls
    expect(mocks.onNewNotificationsListener).not.toHaveBeenCalled();
    expect(mocks.mockOnReceivedHandler).not.toHaveBeenCalled();
  });
});
