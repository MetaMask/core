import type { PushNotificationEnv } from '../types/firebase';
import * as services from './services';

type MockResponse = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  trigger_ids: string[];
  // eslint-disable-next-line @typescript-eslint/naming-convention
  registration_tokens: services.RegToken[];
};

const MOCK_REG_TOKEN = 'REG_TOKEN';
const MOCK_NEW_REG_TOKEN = 'NEW_REG_TOKEN';
const MOCK_TRIGGERS = ['1', '2', '3'];
const MOCK_RESPONSE: MockResponse = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  trigger_ids: ['1', '2', '3'],
  // eslint-disable-next-line @typescript-eslint/naming-convention
  registration_tokens: [
    { token: 'reg_token_1', platform: 'portfolio' },
    { token: 'reg_token_2', platform: 'extension' },
  ],
};
const MOCK_JWT = 'MOCK_JWT';

describe('NotificationServicesPushController Services', () => {
  describe('getPushNotificationLinks', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const utils = services;

    it('should return reg token links', async () => {
      jest
        .spyOn(services, 'getPushNotificationLinks')
        .mockResolvedValue(MOCK_RESPONSE);

      const res = await services.getPushNotificationLinks(MOCK_JWT);

      expect(res).toBeDefined();
      expect(res?.trigger_ids).toBeDefined();
      expect(res?.registration_tokens).toBeDefined();
    });

    it('should return null if api call fails', async () => {
      jest.spyOn(services, 'getPushNotificationLinks').mockResolvedValue(null);

      const res = await utils.getPushNotificationLinks(MOCK_JWT);
      expect(res).toBeNull();
    });
  });

  describe('updateLinksAPI', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return true if links are updated', async () => {
      jest.spyOn(services, 'updateLinksAPI').mockResolvedValue(true);

      const res = await services.updateLinksAPI(MOCK_JWT, MOCK_TRIGGERS, [
        { token: MOCK_NEW_REG_TOKEN, platform: 'extension' },
      ]);

      expect(res).toBe(true);
    });

    it('should return false if links are not updated', async () => {
      jest.spyOn(services, 'updateLinksAPI').mockResolvedValue(false);

      const res = await services.updateLinksAPI(MOCK_JWT, MOCK_TRIGGERS, [
        { token: MOCK_NEW_REG_TOKEN, platform: 'extension' },
      ]);

      expect(res).toBe(false);
    });
  });

  describe('activatePushNotifications()', () => {
    const activateParams = {
      bearerToken: MOCK_JWT,
      triggers: MOCK_TRIGGERS,
      createRegToken: jest.fn(),
      platform: 'extension' as const,
      env: {} as PushNotificationEnv,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should append registration token when enabling push', async () => {
      jest
        .spyOn(services, 'activatePushNotifications')
        .mockResolvedValue(MOCK_NEW_REG_TOKEN);
      const res = await services.activatePushNotifications(activateParams);

      expect(res).toBe(MOCK_NEW_REG_TOKEN);
    });

    it('should fail if unable to get existing notification links', async () => {
      jest
        .spyOn(services, 'getPushNotificationLinks')
        .mockResolvedValueOnce(null);
      const res = await services.activatePushNotifications(activateParams);
      expect(res).toBeNull();
    });

    it('should fail if unable to create new reg token', async () => {
      activateParams.createRegToken.mockResolvedValueOnce(null);
      const res = await services.activatePushNotifications(activateParams);
      expect(res).toBeNull();
    });

    it('should fail if unable to update links', async () => {
      jest.spyOn(services, 'updateLinksAPI').mockResolvedValueOnce(false);
      const res = await services.activatePushNotifications(activateParams);
      expect(res).toBeNull();
    });
  });

  describe('deactivatePushNotifications()', () => {
    const deactivateParams = {
      regToken: MOCK_REG_TOKEN,
      bearerToken: MOCK_JWT,
      triggers: MOCK_TRIGGERS,
      deleteRegToken: jest.fn(),
      env: {} as PushNotificationEnv,
    };

    it('should fail if unable to get existing notification links', async () => {
      jest
        .spyOn(services, 'getPushNotificationLinks')
        .mockResolvedValueOnce(null);

      const res = await services.deactivatePushNotifications(deactivateParams);

      expect(res).toBe(false);
    });

    it('should fail if unable to update links', async () => {
      jest
        .spyOn(services, 'getPushNotificationLinks')
        .mockResolvedValue(MOCK_RESPONSE);
      jest.spyOn(services, 'updateLinksAPI').mockResolvedValue(false);

      const res = await services.deactivatePushNotifications(deactivateParams);

      expect(res).toBe(false);
    });

    it('should fail if unable to delete reg token', async () => {
      jest
        .spyOn(services, 'getPushNotificationLinks')
        .mockResolvedValueOnce(MOCK_RESPONSE);
      deactivateParams.deleteRegToken.mockResolvedValue(false);

      const res = await services.deactivatePushNotifications(deactivateParams);

      expect(res).toBe(false);
    });
  });

  describe('updateTriggerPushNotifications()', () => {
    const updateParams = {
      regToken: MOCK_REG_TOKEN,
      bearerToken: MOCK_JWT,
      triggers: MOCK_TRIGGERS,
      deleteRegToken: jest.fn(),
      createRegToken: jest.fn(),
      platform: 'extension' as const,
      env: {} as PushNotificationEnv,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should update triggers for push notifications', async () => {
      jest.spyOn(services, 'updateTriggerPushNotifications').mockResolvedValue({
        isTriggersLinkedToPushNotifications: true,
        fcmToken: 'fcm-token',
      });

      const res = await services.updateTriggerPushNotifications(updateParams);

      expect(res).toStrictEqual({
        isTriggersLinkedToPushNotifications: true,
        fcmToken: 'fcm-token',
      });
    });

    it('should fail if unable to update triggers', async () => {
      jest.spyOn(services, 'updateTriggerPushNotifications').mockResolvedValue({
        isTriggersLinkedToPushNotifications: false,
        fcmToken: undefined,
      });

      const res = await services.updateTriggerPushNotifications(updateParams);

      expect(res).toStrictEqual({
        isTriggersLinkedToPushNotifications: false,
        fcmToken: undefined,
      });
    });
  });
});
