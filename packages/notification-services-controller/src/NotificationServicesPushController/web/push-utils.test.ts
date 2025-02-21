import * as FirebaseAppModule from 'firebase/app';
import * as FirebaseMessagingModule from 'firebase/messaging';
import * as FirebaseMessagingSWModule from 'firebase/messaging/sw';
import log from 'loglevel';

import {
  createRegToken,
  deleteRegToken,
  createSubscribeToPushNotifications,
} from './push-utils';
import * as PushWebModule from './push-utils';
import { processNotification } from '../../NotificationServicesController';
import { createMockNotificationEthSent } from '../../NotificationServicesController/__fixtures__/mock-raw-notifications';
import { buildPushPlatformNotificationsControllerMessenger } from '../__fixtures__/mockMessenger';

jest.mock('firebase/app');
jest.mock('firebase/messaging');
jest.mock('firebase/messaging/sw');

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

const firebaseApp: FirebaseAppModule.FirebaseApp = {
  name: '',
  automaticDataCollectionEnabled: false,
  options: mockEnv,
};

const arrangeFirebaseAppMocks = () => {
  const mockGetApp = jest
    .spyOn(FirebaseAppModule, 'getApp')
    .mockReturnValue(firebaseApp);

  const mockInitializeApp = jest
    .spyOn(FirebaseAppModule, 'initializeApp')
    .mockReturnValue(firebaseApp);

  return { mockGetApp, mockInitializeApp };
};

const arrangeFirebaseMessagingSWMocks = () => {
  const mockIsSupported = jest
    .spyOn(FirebaseMessagingSWModule, 'isSupported')
    .mockResolvedValue(true);

  const mockGetMessaging = jest
    .spyOn(FirebaseMessagingSWModule, 'getMessaging')
    .mockReturnValue({ app: firebaseApp });

  const mockOnBackgroundMessageUnsub = jest.fn();
  const mockOnBackgroundMessage = jest
    .spyOn(FirebaseMessagingSWModule, 'onBackgroundMessage')
    .mockReturnValue(mockOnBackgroundMessageUnsub);

  return {
    mockIsSupported,
    mockGetMessaging,
    mockOnBackgroundMessage,
    mockOnBackgroundMessageUnsub,
  };
};

const arrangeFirebaseMessagingMocks = () => {
  const mockGetToken = jest
    .spyOn(FirebaseMessagingModule, 'getToken')
    .mockResolvedValue('test-token');

  const mockDeleteToken = jest
    .spyOn(FirebaseMessagingModule, 'deleteToken')
    .mockResolvedValue(true);

  return { mockGetToken, mockDeleteToken };
};

describe('createRegToken() tests', () => {
  const TEST_TOKEN = 'test-token';

  const arrange = () => {
    const firebaseMocks = {
      ...arrangeFirebaseAppMocks(),
      ...arrangeFirebaseMessagingSWMocks(),
      ...arrangeFirebaseMessagingMocks(),
    };

    firebaseMocks.mockGetToken.mockResolvedValue(TEST_TOKEN);

    return {
      ...firebaseMocks,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();

    // TODO - replace with jest.replaceProperty once we upgrade jest.
    Object.defineProperty(PushWebModule, 'supportedCache', { value: null });
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
  const arrange = () => {
    return {
      ...arrangeFirebaseAppMocks(),
      ...arrangeFirebaseMessagingSWMocks(),
      ...arrangeFirebaseMessagingMocks(),
    };
  };

  afterEach(() => {
    jest.clearAllMocks();

    // TODO - replace with jest.replaceProperty once we upgrade jest.
    Object.defineProperty(PushWebModule, 'supportedCache', { value: null });
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
  const arrangeMessengerMocks = () => {
    const messenger = buildPushPlatformNotificationsControllerMessenger();

    const onNewNotificationsListener = jest.fn();
    messenger.subscribe(
      'NotificationServicesPushController:onNewNotifications',
      onNewNotificationsListener,
    );

    const pushNotificationClickedListener = jest.fn();
    messenger.subscribe(
      'NotificationServicesPushController:pushNotificationClicked',
      pushNotificationClickedListener,
    );

    return {
      messenger,
      onNewNotificationsListener,
      pushNotificationClickedListener,
    };
  };

  const arrangeClickListenerMocks = () => {
    const mockAddEventListener = jest.spyOn(self, 'addEventListener');
    const mockRemoveEventListener = jest.spyOn(self, 'removeEventListener');

    return {
      mockAddEventListener,
      mockRemoveEventListener,
    };
  };

  const arrange = () => {
    const firebaseMocks = {
      ...arrangeFirebaseAppMocks(),
      ...arrangeFirebaseMessagingSWMocks(),
    };

    return {
      ...firebaseMocks,
      ...arrangeMessengerMocks(),
      ...arrangeClickListenerMocks(),
      mockOnReceivedHandler: jest.fn(),
      mockOnClickHandler: jest.fn(),
    };
  };

  const actCreateSubscription = async (mocks: ReturnType<typeof arrange>) => {
    const unsubscribe = await createSubscribeToPushNotifications({
      messenger: mocks.messenger,
      onReceivedHandler: mocks.mockOnReceivedHandler,
      onClickHandler: mocks.mockOnClickHandler,
    })(mockEnv);

    return unsubscribe;
  };

  afterEach(() => {
    jest.clearAllMocks();

    // TODO - replace with jest.replaceProperty once we upgrade jest.
    Object.defineProperty(PushWebModule, 'supportedCache', { value: null });
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

  const arrangeActNotificationReceived = async (testData: unknown) => {
    const mocks = arrange();
    await actCreateSubscription(mocks);

    const firebaseCallback = mocks.mockOnBackgroundMessage.mock
      .lastCall[1] as FirebaseMessagingModule.NextFn<FirebaseMessagingSWModule.MessagePayload>;
    const payload = {
      data: {
        data: testData,
      },
    } as unknown as FirebaseMessagingSWModule.MessagePayload;

    firebaseCallback(payload);

    return mocks;
  };

  it('should invoke handler when notifications are received', async () => {
    const mocks = await arrangeActNotificationReceived(
      JSON.stringify(createMockNotificationEthSent()),
    );

    // Assert New Notification Event & Handler Calls
    expect(mocks.onNewNotificationsListener).toHaveBeenCalled();
    expect(mocks.mockOnReceivedHandler).toHaveBeenCalled();

    // Assert Click Notification Event & Handler Calls
    expect(mocks.pushNotificationClickedListener).not.toHaveBeenCalled();
    expect(mocks.mockOnClickHandler).not.toHaveBeenCalled();
  });

  it('should fail to invoke handler if notification received has no data', async () => {
    const mocks = await arrangeActNotificationReceived(undefined);
    expect(mocks.mockOnReceivedHandler).not.toHaveBeenCalled();
  });

  it('should throw error if unable to process a received push notification', async () => {
    jest.spyOn(log, 'error').mockImplementation(jest.fn());
    const mocks = arrange();
    await actCreateSubscription(mocks);

    const firebaseCallback = mocks.mockOnBackgroundMessage.mock
      .lastCall[1] as FirebaseMessagingModule.NextFn<FirebaseMessagingSWModule.MessagePayload>;
    const payload = {
      data: {
        data: JSON.stringify({ badNotification: 'bad' }),
      },
    } as unknown as FirebaseMessagingSWModule.MessagePayload;

    await expect(() => firebaseCallback(payload)).rejects.toThrow(
      expect.any(Error),
    );
  });

  it('should invoke handler when notifications are clicked', async () => {
    const mocks = arrange();
    // We do not want to mock this, as we will dispatch the notification click event
    mocks.mockAddEventListener.mockRestore();

    await actCreateSubscription(mocks);

    const notificationData = processNotification(
      createMockNotificationEthSent(),
    );
    const mockNotificationEvent = new Event(
      'notificationclick',
    ) as NotificationEvent;
    Object.assign(mockNotificationEvent, {
      notification: { data: notificationData },
    });

    // Act
    self.dispatchEvent(mockNotificationEvent);

    // Assert Click Notification Event & Handler Calls
    expect(mocks.pushNotificationClickedListener).toHaveBeenCalled();
    expect(mocks.mockOnClickHandler).toHaveBeenCalled();

    // Assert New Notification Event & Handler Calls
    expect(mocks.onNewNotificationsListener).not.toHaveBeenCalled();
    expect(mocks.mockOnReceivedHandler).not.toHaveBeenCalled();
  });
});
