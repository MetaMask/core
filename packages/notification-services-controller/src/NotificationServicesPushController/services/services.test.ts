import log from 'loglevel';

import {
  activatePushNotifications,
  deactivatePushNotifications,
  updateLinksAPI,
  updateTriggerPushNotifications,
} from './services';
import { mockEndpointUpdatePushNotificationLinks } from '../__fixtures__/mockServices';
import type { PushNotificationEnv } from '../types/firebase';

// Testing util to clean up verbose logs when testing errors
const mockErrorLog = () =>
  jest.spyOn(log, 'error').mockImplementation(jest.fn());

const MOCK_REG_TOKEN = 'REG_TOKEN';
const MOCK_NEW_REG_TOKEN = 'NEW_REG_TOKEN';
const MOCK_TRIGGERS = ['1', '2', '3'];
const MOCK_JWT = 'MOCK_JWT';

describe('NotificationServicesPushController Services', () => {
  describe('updateLinksAPI', () => {
    const act = async () =>
      await updateLinksAPI(MOCK_JWT, MOCK_TRIGGERS, [
        { token: MOCK_NEW_REG_TOKEN, platform: 'extension' },
      ]);

    it('should return true if links are successfully updated', async () => {
      const mockAPI = mockEndpointUpdatePushNotificationLinks();
      const result = await act();
      expect(mockAPI.isDone()).toBe(true);
      expect(result).toBe(true);
    });

    it('should return false if the links API update fails', async () => {
      const mockAPI = mockEndpointUpdatePushNotificationLinks({ status: 500 });
      const result = await act();
      expect(mockAPI.isDone()).toBe(true);
      expect(result).toBe(false);
    });

    it('should return false if an error is thrown', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('MOCK FAIL FETCH'));
      const result = await act();
      expect(result).toBe(false);
    });
  });

  describe('activatePushNotifications', () => {
    const arrangeMocks = (override?: { mockPut?: { status: number } }) => {
      const params = {
        bearerToken: MOCK_JWT,
        triggers: MOCK_TRIGGERS,
        createRegToken: jest.fn().mockResolvedValue(MOCK_NEW_REG_TOKEN),
        platform: 'extension' as const,
        env: {} as PushNotificationEnv,
      };

      const mobileParams = {
        ...params,
        platform: 'mobile' as const,
      };

      return {
        params,
        mobileParams,
        apis: {
          mockPut: mockEndpointUpdatePushNotificationLinks(override?.mockPut),
        },
      };
    };

    it('should successfully call APIs and add new registration token', async () => {
      const { params, apis } = arrangeMocks();
      const result = await activatePushNotifications(params);

      expect(params.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(true);

      expect(result).toBe(MOCK_NEW_REG_TOKEN);
    });

    it('should return null if unable to create new registration token', async () => {
      const { params, apis } = arrangeMocks();
      params.createRegToken.mockRejectedValue(new Error('MOCK ERROR'));

      const result = await activatePushNotifications(params);

      expect(params.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(false);

      expect(result).toBeNull();
    });
  });

  describe('deactivatePushNotifications', () => {
    const arrangeMocks = () => {
      const params = {
        regToken: MOCK_REG_TOKEN,
        bearerToken: MOCK_JWT,
        triggers: MOCK_TRIGGERS,
        deleteRegToken: jest.fn().mockResolvedValue(true),
        env: {} as PushNotificationEnv,
      };

      return {
        params,
      };
    };

    it('should successfully delete the registration token', async () => {
      const { params } = arrangeMocks();
      const result = await deactivatePushNotifications(params);

      expect(params.deleteRegToken).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return early when there is no registration token to delete', async () => {
      const { params } = arrangeMocks();
      mockErrorLog();
      const result = await deactivatePushNotifications({
        ...params,
        regToken: '',
      });

      expect(params.deleteRegToken).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when unable to delete the existing reg token', async () => {
      const { params } = arrangeMocks();
      params.deleteRegToken.mockResolvedValue(false);
      const result = await deactivatePushNotifications(params);

      expect(params.deleteRegToken).toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('updateTriggerPushNotifications', () => {
    const arrangeMocks = (override?: { mockPut?: { status: number } }) => {
      const params = {
        regToken: MOCK_REG_TOKEN,
        bearerToken: MOCK_JWT,
        triggers: MOCK_TRIGGERS,
        deleteRegToken: jest.fn().mockResolvedValue(true),
        createRegToken: jest.fn().mockResolvedValue(MOCK_NEW_REG_TOKEN),
        platform: 'extension' as const,
        env: {} as PushNotificationEnv,
      };

      return {
        params,
        apis: {
          mockPut: mockEndpointUpdatePushNotificationLinks(override?.mockPut),
        },
      };
    };

    it('should update trigger links and replace existing reg token', async () => {
      const { params, apis } = arrangeMocks();
      mockErrorLog();
      const result = await updateTriggerPushNotifications(params);

      expect(params.deleteRegToken).toHaveBeenCalled();
      expect(params.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(true);

      expect(result.fcmToken).toBeDefined();
    });

    it('should throw error if fails to create reg token', async () => {
      const { params } = arrangeMocks();
      params.createRegToken.mockResolvedValue(null);

      await expect(
        async () => await updateTriggerPushNotifications(params),
      ).rejects.toThrow(expect.any(Error));
    });

    it('should throw error if fails to update links', async () => {
      const { params } = arrangeMocks({ mockPut: { status: 500 } });
      await expect(
        async () => await updateTriggerPushNotifications(params),
      ).rejects.toThrow(expect.any(Error));
    });
  });
});
