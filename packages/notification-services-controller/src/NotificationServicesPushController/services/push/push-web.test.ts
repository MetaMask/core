import * as FirebaseAppModule from 'firebase/app';
import * as FirebaseMessagingModule from 'firebase/messaging';
import * as FirebaseMessagingSWModule from 'firebase/messaging/sw';
import log from 'loglevel';

import { processNotification } from '../../../NotificationServicesController';
import { createMockNotificationEthSent } from '../../../NotificationServicesController/__fixtures__';
import * as PushWebModule from './push-web';
import {
  createRegToken,
  deleteRegToken,
  listenToPushNotificationsReceived,
  listenToPushNotificationsClicked,
} from './push-web';

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

  const getMessaging = jest
    .spyOn(FirebaseMessagingSWModule, 'getMessaging')
    .mockReturnValue({ app: firebaseApp });

  const mockOnBackgroundMessageUnsub = jest.fn();
  const mockOnBackgroundMessage = jest
    .spyOn(FirebaseMessagingSWModule, 'onBackgroundMessage')
    .mockReturnValue(mockOnBackgroundMessageUnsub);

  return {
    mockIsSupported,
    getMessaging,
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

describe('listenToPushNotificationsReceived() tests', () => {
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

  it('should return an unsubscribe function when Firebase is supported', async () => {
    const { mockGetApp, mockOnBackgroundMessage } = arrange();

    const handler = jest.fn();
    const unsubscribe = await listenToPushNotificationsReceived(
      mockEnv,
      handler,
    );

    expect(mockGetApp).toHaveBeenCalled();
    expect(mockOnBackgroundMessage).toHaveBeenCalled();
    expect(unsubscribe).not.toBeNull();
  });

  it('should return null when Firebase is not supported', async () => {
    const { mockIsSupported } = arrange();
    mockIsSupported.mockResolvedValueOnce(false);

    const handler = jest.fn();
    const unsubscribe = await listenToPushNotificationsReceived(
      mockEnv,
      handler,
    );

    expect(unsubscribe).toBeNull();
  });

  it('should be able to unsubscribe when invoked', async () => {
    const { mockOnBackgroundMessageUnsub } = arrange();

    const handler = jest.fn();
    const unsubscribe = await listenToPushNotificationsReceived(
      mockEnv,
      handler,
    );

    expect(unsubscribe).not.toBeNull();
    unsubscribe?.();
    expect(mockOnBackgroundMessageUnsub).toHaveBeenCalled();
  });

  describe('handler tests', () => {
    const arrangeTest = async () => {
      const { mockOnBackgroundMessage } = arrange();

      const handler = jest.fn();
      await listenToPushNotificationsReceived(mockEnv, handler);

      // Simulate receiving a background message
      const invokeBackgroundMessage = mockOnBackgroundMessage.mock
        .calls[0][1] as FirebaseMessagingModule.NextFn<FirebaseMessagingSWModule.MessagePayload>;

      return {
        handler,
        invokeBackgroundMessage,
      };
    };

    const arrangeActInvokeBackgroundMessage = async (testData: unknown) => {
      const { handler, invokeBackgroundMessage } = await arrangeTest();

      const payload = {
        data: {
          data: testData,
        },
      } as unknown as FirebaseMessagingSWModule.MessagePayload;

      invokeBackgroundMessage(payload);

      return { handler };
    };

    it('should call the handler with the processed notification', async () => {
      const { handler } = await arrangeActInvokeBackgroundMessage(
        JSON.stringify(createMockNotificationEthSent()),
      );
      expect(handler).toHaveBeenCalled();
    });

    it('should return early without calling handler if no data in background message', async () => {
      const { handler } = await arrangeActInvokeBackgroundMessage(
        JSON.stringify(undefined),
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('should error if unable to process and send a push notification', async () => {
      const { handler, invokeBackgroundMessage } = await arrangeTest();
      jest.spyOn(log, 'error').mockImplementation(jest.fn());

      const payload = {
        data: {
          data: JSON.stringify({ badNotification: 'bad' }),
        },
      } as unknown as FirebaseMessagingSWModule.MessagePayload;

      await expect(invokeBackgroundMessage(payload)).rejects.toThrow(
        expect.any(Error),
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });
});

describe('listenToPushNotificationsClicked() tests', () => {
  const arrange = () => {
    const mockHandler = jest.fn();
    return { mockHandler };
  };

  const arrangeTest = () => {
    const { mockHandler } = arrange();

    const unsubscribe = listenToPushNotificationsClicked(mockHandler);

    const notificationData = processNotification(
      createMockNotificationEthSent(),
    );

    const mockNotificationEvent = new Event(
      'notificationclick',
    ) as NotificationEvent;
    Object.assign(mockNotificationEvent, {
      notification: { data: notificationData },
    });

    return {
      mockHandler,
      unsubscribe,
      notificationData,
      mockNotificationEvent,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call the handler with the notification event and data when a notification is clicked', () => {
    const {
      mockHandler,
      unsubscribe,
      notificationData,
      mockNotificationEvent,
    } = arrangeTest();

    self.dispatchEvent(mockNotificationEvent);

    expect(mockHandler).toHaveBeenCalledWith(
      mockNotificationEvent,
      notificationData,
    );

    unsubscribe();
  });

  it('should remove the event listener when unsubscribe is called', () => {
    const { mockHandler, unsubscribe, mockNotificationEvent } = arrangeTest();

    unsubscribe();

    self.dispatchEvent(mockNotificationEvent);
    expect(mockHandler).not.toHaveBeenCalled();
  });
});
