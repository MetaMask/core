import log from 'loglevel';

import {
  activatePushNotifications,
  deactivatePushNotifications,
  updateLinksAPI,
} from './services';
import { mockEndpointUpdatePushNotificationLinks } from '../__fixtures__/mockServices';
import type { PushNotificationEnv } from '../types/firebase';

// Testing util to clean up verbose logs when testing errors
const mockErrorLog = () =>
  jest.spyOn(log, 'error').mockImplementation(jest.fn());

const MOCK_REG_TOKEN = 'REG_TOKEN';
const MOCK_NEW_REG_TOKEN = 'NEW_REG_TOKEN';
const MOCK_ADDRESSES = ['0x123', '0x456', '0x789'];
const MOCK_JWT = 'MOCK_JWT';

describe('NotificationServicesPushController Services', () => {
  describe('updateLinksAPI', () => {
    const act = async () =>
      await updateLinksAPI({
        bearerToken: MOCK_JWT,
        addresses: MOCK_ADDRESSES,
        regToken: {
          token: MOCK_NEW_REG_TOKEN,
          platform: 'extension',
          locale: 'en',
        },
      });

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
        addresses: MOCK_ADDRESSES,
        createRegToken: jest.fn().mockResolvedValue(MOCK_NEW_REG_TOKEN),
        regToken: {
          platform: 'extension' as const,
          locale: 'en',
        },
        env: {} as PushNotificationEnv,
      };

      const mobileParams = {
        ...params,
        regToken: {
          ...params.regToken,
          platform: 'mobile' as const,
        },
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

    it('should handle oldToken parameter when provided', async () => {
      const { params, apis } = arrangeMocks();
      const paramsWithOldToken = {
        ...params,
        regToken: {
          ...params.regToken,
          oldToken: 'OLD_TOKEN',
        },
      };

      const result = await activatePushNotifications(paramsWithOldToken);

      expect(params.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(true);
      expect(result).toBe(MOCK_NEW_REG_TOKEN);
    });
  });

  describe('deactivatePushNotifications', () => {
    const arrangeMocks = () => {
      const params = {
        regToken: MOCK_REG_TOKEN,
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
});
