import { ControllerMessenger } from '@metamask/base-controller';
import type { AuthenticationController } from '@metamask/profile-sync-controller';

import NotificationServicesPushController from './NotificationServicesPushController';
import type {
  AllowedActions,
  AllowedEvents,
  NotificationServicesPushControllerMessenger,
} from './NotificationServicesPushController';
import * as services from './services/services';
import type { PushNotificationEnv } from './types';

const MOCK_JWT = 'mockJwt';
const MOCK_FCM_TOKEN = 'mockFcmToken';
const MOCK_TRIGGERS = ['uuid1', 'uuid2'];

describe('NotificationServicesPushController', () => {
  describe('enablePushNotifications', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should update the state with the fcmToken', async () => {
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger);
      jest
        .spyOn(services, 'activatePushNotifications')
        .mockResolvedValue(MOCK_FCM_TOKEN);

      const unsubscribeMock = jest.fn();
      jest
        .spyOn(services, 'listenToPushNotifications')
        .mockResolvedValue(unsubscribeMock);

      await controller.enablePushNotifications(MOCK_TRIGGERS);
      expect(controller.state.fcmToken).toBe(MOCK_FCM_TOKEN);

      expect(services.listenToPushNotifications).toHaveBeenCalled();
    });

    it('should fail if a jwt token is not provided', async () => {
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger).mockResolvedValue(
        null as unknown as string,
      );
      await expect(controller.enablePushNotifications([])).rejects.toThrow(
        expect.any(Error),
      );
    });
  });

  describe('disablePushNotifications', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should update the state removing the fcmToken', async () => {
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger);
      await controller.disablePushNotifications(MOCK_TRIGGERS);
      expect(controller.state.fcmToken).toBe('');
    });

    it('should fail if a jwt token is not provided', async () => {
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger).mockResolvedValue(
        null as unknown as string,
      );
      await expect(controller.disablePushNotifications([])).rejects.toThrow(
        expect.any(Error),
      );
    });
  });

  describe('updateTriggerPushNotifications', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should call updateTriggerPushNotifications with the correct parameters', async () => {
      const { controller, messenger } = arrangeMockMessenger();
      mockAuthBearerTokenCall(messenger);
      const spy = jest
        .spyOn(services, 'updateTriggerPushNotifications')
        .mockResolvedValue({
          isTriggersLinkedToPushNotifications: true,
        });

      await controller.updateTriggerPushNotifications(MOCK_TRIGGERS);

      expect(spy).toHaveBeenCalled();
      const args = spy.mock.calls[0][0];
      expect(args.bearerToken).toBe(MOCK_JWT);
      expect(args.triggers).toBe(MOCK_TRIGGERS);
      expect(args.regToken).toBe(controller.state.fcmToken);
    });
  });
});

// Test helper functions
const buildPushPlatformNotificationsControllerMessenger = () => {
  const globalMessenger = new ControllerMessenger<
    AllowedActions,
    AllowedEvents
  >();

  return globalMessenger.getRestricted<
    'NotificationServicesPushController',
    AllowedActions['type']
  >({
    name: 'NotificationServicesPushController',
    allowedActions: ['AuthenticationController:getBearerToken'],
    allowedEvents: [],
  });
};

/**
 * Jest Mock Utility - mock messenger
 *
 * @returns a mock messenger and other helpful mocks
 */
function arrangeMockMessenger() {
  const messenger = buildPushPlatformNotificationsControllerMessenger();
  const controller = new NotificationServicesPushController({
    messenger,
    state: { fcmToken: '' },
    env: {} as PushNotificationEnv,
    config: {
      isPushEnabled: true,
      onPushNotificationClicked: jest.fn(),
      onPushNotificationReceived: jest.fn(),
      platform: 'extension',
    },
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
