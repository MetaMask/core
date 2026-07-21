import { jest } from '@jest/globals';
import log from 'loglevel';

import {
  mockEndpointDeletePushNotificationLinks,
  mockEndpointUpdatePushNotificationLinks,
} from '../__fixtures__/mockServices.js';
import type { PushNotificationEnv } from '../types/firebase.js';
import {
  activatePushNotifications,
  deactivatePushNotifications,
  deleteLinksAPI,
  updateLinksAPI,
} from './services.js';
import type { RegToken } from './services.js';

// Testing util to clean up verbose logs when testing errors
const mockErrorLog = (): jest.SpyInstance =>
  jest.spyOn(log, 'error').mockImplementation(jest.fn());

const MOCK_REG_TOKEN = 'REG_TOKEN';
const MOCK_NEW_REG_TOKEN = 'NEW_REG_TOKEN';
const MOCK_ADDRESSES = ['0x123', '0x456', '0x789'];
const MOCK_JWT = 'MOCK_JWT';

type CreateRegTokenMock = jest.Mock<
  Promise<string | null>,
  [PushNotificationEnv]
>;

type ArrangeMocksParams<Platform extends RegToken['platform']> = {
  bearerToken: string;
  addresses: string[];
  createRegToken: CreateRegTokenMock;
  regToken: {
    platform: Platform;
    locale: string;
  };
  env: PushNotificationEnv;
};

type ArrangeMocksResult = {
  params: ArrangeMocksParams<'extension'>;
  mobileParams: ArrangeMocksParams<'mobile'>;
  apis: {
    mockPut: ReturnType<typeof mockEndpointUpdatePushNotificationLinks>;
  };
};

describe('NotificationServicesPushController Services', () => {
  describe('updateLinksAPI', () => {
    const act = async (
      regTokenOverrides?: Partial<RegToken>,
    ): Promise<boolean> =>
      await updateLinksAPI({
        bearerToken: MOCK_JWT,
        addresses: MOCK_ADDRESSES,
        regToken: {
          token: MOCK_NEW_REG_TOKEN,
          platform: 'extension',
          locale: 'en',
          ...regTokenOverrides,
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

    it('should include mobile metadata when provided', async () => {
      const mockAPI = mockEndpointUpdatePushNotificationLinks(undefined, {
        addresses: MOCK_ADDRESSES,
        registration_token: {
          token: MOCK_NEW_REG_TOKEN,
          platform: 'mobile',
          locale: 'en',
          os: 'ios',
          appVersion: '7.42.0',
        },
      });

      const result = await act({
        platform: 'mobile',
        os: 'ios',
        appVersion: '7.42.0',
      });

      expect(mockAPI.isDone()).toBe(true);
      expect(result).toBe(true);
    });
  });

  describe('activatePushNotifications', () => {
    const arrangeMocks = (override?: {
      mockPut?: { status: number };
      requestBody?: Parameters<
        typeof mockEndpointUpdatePushNotificationLinks
      >[1];
    }): ArrangeMocksResult => {
      const createRegToken: CreateRegTokenMock = jest
        .fn<Promise<string | null>, [PushNotificationEnv]>()
        .mockResolvedValue(MOCK_NEW_REG_TOKEN);
      const params = {
        bearerToken: MOCK_JWT,
        addresses: MOCK_ADDRESSES,
        createRegToken,
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
          mockPut: mockEndpointUpdatePushNotificationLinks(
            override?.mockPut,
            override?.requestBody,
          ),
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

    it('should pass mobile metadata when provided', async () => {
      const { mobileParams, apis } = arrangeMocks({
        requestBody: {
          addresses: MOCK_ADDRESSES,
          registration_token: {
            token: MOCK_NEW_REG_TOKEN,
            platform: 'mobile',
            locale: 'en',
            os: 'android',
            appVersion: '7.42.0',
          },
        },
      });
      const paramsWithMetadata = {
        ...mobileParams,
        regToken: {
          ...mobileParams.regToken,
          os: 'android' as const,
          appVersion: '7.42.0',
        },
      };

      const result = await activatePushNotifications(paramsWithMetadata);

      expect(mobileParams.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(true);
      expect(result).toBe(MOCK_NEW_REG_TOKEN);
    });
  });

  describe('deleteLinksAPI', () => {
    const act = async (): Promise<boolean> =>
      await deleteLinksAPI({
        bearerToken: MOCK_JWT,
        addresses: MOCK_ADDRESSES,
        platform: 'extension',
        token: MOCK_REG_TOKEN,
      });

    it('should return true if links are successfully deleted', async () => {
      const mockAPI = mockEndpointDeletePushNotificationLinks(undefined, {
        addresses: MOCK_ADDRESSES,
        registration_token: {
          platform: 'extension',
          token: MOCK_REG_TOKEN,
        },
      });
      const result = await act();
      expect(mockAPI.isDone()).toBe(true);
      expect(result).toBe(true);
    });

    it('should return false if the links API delete fails', async () => {
      const mockAPI = mockEndpointDeletePushNotificationLinks(
        { status: 500 },
        {
          addresses: MOCK_ADDRESSES,
          registration_token: {
            platform: 'extension',
            token: MOCK_REG_TOKEN,
          },
        },
      );
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

  describe('deactivatePushNotifications', () => {
    // Internal testing utility - return type is inferred
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
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
