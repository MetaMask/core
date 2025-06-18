import type { AuthenticationController } from '@metamask/profile-sync-controller';
import log from 'loglevel';

import { buildPushPlatformNotificationsControllerMessenger } from './__fixtures__/mockMessenger';
import NotificationServicesPushController from './NotificationServicesPushController';
import type {
  ControllerConfig,
  NotificationServicesPushControllerMessenger,
} from './NotificationServicesPushController';
import * as services from './services/services';
import type { PushNotificationEnv } from './types';

const MOCK_JWT = 'mockJwt';
const MOCK_FCM_TOKEN = 'mockFcmToken';
const MOCK_ADDRESSES = ['0x123', '0x456', '0x789'];

// Testing util to clean up verbose logs when testing errors
const mockErrorLog = () =>
  jest.spyOn(log, 'error').mockImplementation(jest.fn());

describe('NotificationServicesPushController', () => {
  const arrangeServicesMocks = (token?: string) => {
    const activatePushNotificationsMock = jest
      .spyOn(services, 'activatePushNotifications')
      .mockResolvedValue(token ?? MOCK_FCM_TOKEN);

    const deactivatePushNotificationsMock = jest
      .spyOn(services, 'deactivatePushNotifications')
      .mockResolvedValue(true);

    return {
      activatePushNotificationsMock,
      deactivatePushNotificationsMock,
    };
  };

  describe('subscribeToPushNotifications', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should unsubscribe to old listeners and subscribe to new listeners if called multiple times', async () => {
      const mockUnsubscribe = jest.fn();
      const mockSubscribe = jest.fn().mockReturnValue(mockUnsubscribe);
      const { controller } = arrangeMockMessenger({
        pushService: {
          createRegToken: jest.fn(),
          deleteRegToken: jest.fn(),
          subscribeToPushNotifications: mockSubscribe,
        },
      });

      await controller.subscribeToPushNotifications();
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      await controller.subscribeToPushNotifications();
      expect(mockSubscribe).toHaveBeenCalledTimes(2);
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('enablePushNotifications', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should update the state with the fcmToken', async () => {
      arrangeServicesMocks();
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger);

      const promise = controller.enablePushNotifications(MOCK_ADDRESSES);
      expect(controller.state.isUpdatingFCMToken).toBe(true);

      await promise;
      expect(controller.state.fcmToken).toBe(MOCK_FCM_TOKEN);
      expect(controller.state.isPushEnabled).toBe(true);
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });

    it('should call activatePushNotifications with correct parameters including oldToken', async () => {
      const mocks = arrangeServicesMocks();
      const { controller, messenger } = arrangeMockMessenger({
        state: {
          fcmToken: 'existing-token',
          isPushEnabled: true,
          isUpdatingFCMToken: false,
        },
      });
      mockAuthBearerTokenCall(messenger);

      await controller.enablePushNotifications(MOCK_ADDRESSES);

      expect(mocks.activatePushNotificationsMock).toHaveBeenCalledWith({
        bearerToken: MOCK_JWT,
        addresses: MOCK_ADDRESSES,
        env: expect.any(Object),
        createRegToken: expect.any(Function),
        regToken: {
          platform: 'extension',
          locale: 'en',
          oldToken: 'existing-token',
        },
      });
    });

    it('should not activate push notifications triggers if there is no auth bearer token', async () => {
      const mocks = arrangeServicesMocks();
      const { controller, messenger } = arrangeMockMessenger();
      const mockBearerTokenCall = mockAuthBearerTokenCall(messenger);
      mockBearerTokenCall.mockRejectedValue(new Error('TEST ERROR'));

      await controller.enablePushNotifications(MOCK_ADDRESSES);
      expect(mocks.activatePushNotificationsMock).not.toHaveBeenCalled();
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });

    it('should not update reg token if push service fails', async () => {
      const mocks = arrangeServicesMocks();
      const { controller, messenger, initialState } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger);
      mocks.activatePushNotificationsMock.mockRejectedValue(
        new Error('TEST ERROR'),
      );

      await controller.enablePushNotifications(MOCK_ADDRESSES);
      expect(controller.state.fcmToken).toBe(initialState.fcmToken);
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });
  });

  describe('disablePushNotifications', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should update the state removing the fcmToken', async () => {
      arrangeServicesMocks();
      const { controller } = arrangeMockMessenger();
      const promise = controller.disablePushNotifications();
      expect(controller.state.isUpdatingFCMToken).toBe(true);

      await promise;
      expect(controller.state.fcmToken).toBe('');
      expect(controller.state.isPushEnabled).toBe(false);
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });

    it('should bail early if push is not enabled', async () => {
      const mocks = arrangeServicesMocks();
      const { controller, messenger } = arrangeMockMessenger({
        isPushFeatureEnabled: false,
      });
      mockAuthBearerTokenCall(messenger);

      await controller.disablePushNotifications();
      expect(mocks.deactivatePushNotificationsMock).not.toHaveBeenCalled();
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });

    it('should fail if fails to delete FCM token', async () => {
      const mocks = arrangeServicesMocks();
      mocks.deactivatePushNotificationsMock.mockRejectedValue(
        new Error('TEST ERROR'),
      );
      mockErrorLog();
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger).mockResolvedValue(
        null as unknown as string,
      );
      await expect(controller.disablePushNotifications()).rejects.toThrow(
        expect.any(Error),
      );
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });
  });

  describe('updateTriggerPushNotifications', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should call activatePushNotifications with the correct parameters and update state', async () => {
      const mocks = arrangeServicesMocks();
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger);

      const promise = controller.updateTriggerPushNotifications(MOCK_ADDRESSES);
      // Assert - loading
      expect(controller.state.isUpdatingFCMToken).toBe(true);

      await promise;

      // Assert - update called with correct params
      expect(mocks.activatePushNotificationsMock).toHaveBeenCalledWith({
        bearerToken: MOCK_JWT,
        addresses: MOCK_ADDRESSES,
        env: expect.any(Object),
        createRegToken: expect.any(Function),
        regToken: {
          platform: 'extension',
          locale: 'en',
          oldToken: '',
        },
      });

      // Assert - state
      expect(controller.state.isPushEnabled).toBe(true);
      expect(controller.state.fcmToken).toBe(MOCK_FCM_TOKEN);
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });

    it('should bail early if push is not enabled', async () => {
      const mocks = arrangeServicesMocks();
      const { controller, messenger } = arrangeMockMessenger({
        isPushFeatureEnabled: false,
      });
      mockAuthBearerTokenCall(messenger);

      await controller.updateTriggerPushNotifications(MOCK_ADDRESSES);
      expect(mocks.activatePushNotificationsMock).not.toHaveBeenCalled();
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });

    it('should throw error if fails to update trigger push notifications', async () => {
      mockErrorLog();
      const mocks = arrangeServicesMocks();
      const { controller, messenger, initialState } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger);

      // Arrange - service throws
      mocks.activatePushNotificationsMock.mockRejectedValue(
        new Error('TEST FAILURE'),
      );

      // Act / Assert Rejection
      await expect(() =>
        controller.updateTriggerPushNotifications(MOCK_ADDRESSES),
      ).rejects.toThrow(expect.any(Error));

      // Assert state did not change
      expect(controller.state).toStrictEqual(initialState);
      expect(controller.state.isUpdatingFCMToken).toBe(false);
    });

    it('should pass existing fcmToken as oldToken when updating triggers', async () => {
      const mocks = arrangeServicesMocks();
      const { controller, messenger } = arrangeMockMessenger({
        state: {
          fcmToken: 'existing-fcm-token',
          isPushEnabled: true,
          isUpdatingFCMToken: false,
        },
      });
      mockAuthBearerTokenCall(messenger);

      await controller.updateTriggerPushNotifications(MOCK_ADDRESSES);

      expect(mocks.activatePushNotificationsMock).toHaveBeenCalledWith({
        bearerToken: MOCK_JWT,
        addresses: MOCK_ADDRESSES,
        env: expect.any(Object),
        createRegToken: expect.any(Function),
        regToken: {
          platform: 'extension',
          locale: 'en',
          oldToken: 'existing-fcm-token',
        },
      });
    });
  });
});

/**
 * Jest Mock Utility - mock messenger
 *
 * @param controllerConfig - provide a partial override controller config for testing
 * @returns a mock messenger and other helpful mocks
 */
function arrangeMockMessenger(
  controllerConfig?: Partial<
    ControllerConfig & {
      state?: Partial<NotificationServicesPushController['state']>;
    }
  >,
) {
  const { state: stateOverride, ...configOverride } = controllerConfig || {};

  const config: ControllerConfig = {
    isPushFeatureEnabled: true,
    pushService: {
      createRegToken: jest.fn(),
      deleteRegToken: jest.fn(),
      subscribeToPushNotifications: jest.fn(),
    },
    platform: 'extension',
    ...configOverride,
  };

  const defaultState = {
    fcmToken: '',
    isPushEnabled: true,
    isUpdatingFCMToken: false,
  };
  const state = { ...defaultState, ...stateOverride };

  const messenger = buildPushPlatformNotificationsControllerMessenger();
  const controller = new NotificationServicesPushController({
    messenger,
    state,
    env: {} as PushNotificationEnv,
    config,
  });

  return {
    controller,
    initialState: controller.state,
    messenger,
  };
}

/**
 * Jest Mock Utility - mock auth get bearer token
 *
 * @param messenger - mock messenger
 * @returns mock getBearerAuth function
 */
function mockAuthBearerTokenCall(
  messenger: NotificationServicesPushControllerMessenger,
) {
  type Fn =
    AuthenticationController.AuthenticationControllerGetBearerToken['handler'];
  const mockAuthGetBearerToken = jest
    .fn<ReturnType<Fn>, Parameters<Fn>>()
    .mockResolvedValue(MOCK_JWT);

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const [actionType] = args;
    if (actionType === 'AuthenticationController:getBearerToken') {
      return mockAuthGetBearerToken();
    }

    throw new Error('MOCK - unsupported messenger call mock');
  });

  return mockAuthGetBearerToken;
}
