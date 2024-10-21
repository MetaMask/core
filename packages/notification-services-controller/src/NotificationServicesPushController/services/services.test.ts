import {
  mockEndpointGetPushNotificationLinks,
  mockEndpointUpdatePushNotificationLinks,
} from '../__fixtures__/mockServices';
import type { PushNotificationEnv } from '../types/firebase';
import type { ListenToPushNotificationsParams } from './services';
import {
  activatePushNotifications,
  deactivatePushNotifications,
  getPushNotificationLinks,
  listenToPushNotifications,
  updateLinksAPI,
  updateTriggerPushNotifications,
} from './services';

const MOCK_REG_TOKEN = 'REG_TOKEN';
const MOCK_NEW_REG_TOKEN = 'NEW_REG_TOKEN';
const MOCK_TRIGGERS = ['1', '2', '3'];
const MOCK_JWT = 'MOCK_JWT';

describe('NotificationServicesPushController Services', () => {
  describe('getPushNotificationLinks', () => {
    it('should return reg token links', async () => {
      const mockAPI = mockEndpointGetPushNotificationLinks();
      const result = await getPushNotificationLinks(MOCK_JWT);
      expect(mockAPI.isDone()).toBe(true);
      expect(result?.registration_tokens).toBeDefined();
      expect(result?.trigger_ids).toBeDefined();
    });

    it('should return null if given a bad response', async () => {
      const mockAPI = mockEndpointGetPushNotificationLinks({ status: 500 });
      const result = await getPushNotificationLinks(MOCK_JWT);
      expect(mockAPI.isDone()).toBe(true);
      expect(result).toBeNull();
    });
  });

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
    const arrangeMocks = (override?: {
      mockGet?: { status: number };
      mockPut?: { status: number };
    }) => {
      const params = {
        bearerToken: MOCK_JWT,
        triggers: MOCK_TRIGGERS,
        createRegToken: jest.fn().mockResolvedValue(MOCK_NEW_REG_TOKEN),
        platform: 'extension' as const,
        env: {} as PushNotificationEnv,
      };

      return {
        params,
        apis: {
          mockGet: mockEndpointGetPushNotificationLinks(override?.mockGet),
          mockPut: mockEndpointUpdatePushNotificationLinks(override?.mockPut),
        },
      };
    };

    it('should successfully call APIs and add new registration token', async () => {
      const { params, apis } = arrangeMocks();
      const result = await activatePushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(params.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(true);

      expect(result).toBe(MOCK_NEW_REG_TOKEN);
    });

    it('should return null if unable to get links from API', async () => {
      const { params, apis } = arrangeMocks({ mockGet: { status: 500 } });
      const result = await activatePushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(params.createRegToken).not.toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(false);

      expect(result).toBeNull();
    });

    it('should return null if unable to create new registration token', async () => {
      const { params, apis } = arrangeMocks();
      params.createRegToken.mockRejectedValue(new Error('MOCK ERROR'));

      const result = await activatePushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(params.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(false);

      expect(result).toBeNull();
    });
  });

  describe('deactivatePushNotifications', () => {
    const arrangeMocks = (override?: {
      mockGet?: { status: number };
      mockPut?: { status: number };
    }) => {
      const params = {
        regToken: MOCK_REG_TOKEN,
        bearerToken: MOCK_JWT,
        triggers: MOCK_TRIGGERS,
        deleteRegToken: jest.fn().mockResolvedValue(true),
        env: {} as PushNotificationEnv,
      };

      return {
        params,
        apis: {
          mockGet: mockEndpointGetPushNotificationLinks(override?.mockGet),
          mockPut: mockEndpointUpdatePushNotificationLinks(override?.mockPut),
        },
      };
    };

    it('should successfully delete the registration token', async () => {
      const { params, apis } = arrangeMocks();
      const result = await deactivatePushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(apis.mockPut.isDone()).toBe(true);
      expect(params.deleteRegToken).toHaveBeenCalled();

      expect(result).toBe(true);
    });

    it('should return early when there is no registration token to delete', async () => {
      const { params, apis } = arrangeMocks();
      const result = await deactivatePushNotifications({
        ...params,
        regToken: '',
      });

      expect(apis.mockGet.isDone()).toBe(false);
      expect(apis.mockPut.isDone()).toBe(false);
      expect(params.deleteRegToken).not.toHaveBeenCalled();

      expect(result).toBe(true);
    });

    it('should return false when unable to get links api', async () => {
      const { params, apis } = arrangeMocks({ mockGet: { status: 500 } });
      const result = await deactivatePushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(apis.mockPut.isDone()).toBe(false);
      expect(params.deleteRegToken).not.toHaveBeenCalled();

      expect(result).toBe(false);
    });

    it('should return false when unable to update links api', async () => {
      const { params, apis } = arrangeMocks({ mockPut: { status: 500 } });
      const result = await deactivatePushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(apis.mockPut.isDone()).toBe(true);
      expect(params.deleteRegToken).not.toHaveBeenCalled();

      expect(result).toBe(false);
    });

    it('should return false when unable to delete the existing reg token', async () => {
      const { params, apis } = arrangeMocks();
      params.deleteRegToken.mockResolvedValue(false);
      const result = await deactivatePushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(apis.mockPut.isDone()).toBe(true);
      expect(params.deleteRegToken).toHaveBeenCalled();

      expect(result).toBe(false);
    });
  });

  describe('updateTriggerPushNotifications', () => {
    const arrangeMocks = (override?: {
      mockGet?: { status: number };
      mockPut?: { status: number };
    }) => {
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
          mockGet: mockEndpointGetPushNotificationLinks(override?.mockGet),
          mockPut: mockEndpointUpdatePushNotificationLinks(override?.mockPut),
        },
      };
    };

    it('should update trigger links and replace existing reg token', async () => {
      const { params, apis } = arrangeMocks();
      const result = await updateTriggerPushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(params.deleteRegToken).toHaveBeenCalled();
      expect(params.createRegToken).toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(true);

      expect(result.fcmToken).toBeDefined();
      expect(result.isTriggersLinkedToPushNotifications).toBe(true);
    });

    it('should return early if fails to get links api', async () => {
      const { params, apis } = arrangeMocks({ mockGet: { status: 500 } });
      const result = await updateTriggerPushNotifications(params);

      expect(apis.mockGet.isDone()).toBe(true);
      expect(params.deleteRegToken).not.toHaveBeenCalled();
      expect(params.createRegToken).not.toHaveBeenCalled();
      expect(apis.mockPut.isDone()).toBe(false);

      expect(result.fcmToken).toBeUndefined();
      expect(result.isTriggersLinkedToPushNotifications).toBe(false);
    });

    it('should throw error if fails to create reg token', async () => {
      const { params } = arrangeMocks();
      params.createRegToken.mockResolvedValue(null);

      await expect(
        async () => await updateTriggerPushNotifications(params),
      ).rejects.toThrow(expect.any(Error));
    });
  });

  describe('listenToPushNotifications', () => {
    const arrangeMocks = () => {
      const mockReceivedUnsub = jest.fn();
      const mockClickUnsub = jest.fn();

      const params: ListenToPushNotificationsParams = {
        listenToPushNotificationsCreator: jest
          .fn()
          .mockResolvedValue(mockReceivedUnsub),
        listenToPushReceived: jest.fn(),
        listenToPushClickedCreator: jest.fn().mockReturnValue(mockClickUnsub),
        listenToPushClicked: jest.fn(),
        env: {} as PushNotificationEnv,
      };

      return {
        params,
        mocks: {
          mockReceivedUnsub,
          mockClickUnsub,
        },
      };
    };

    it('should start listening to notifications and can unsubscribe', async () => {
      const { params, mocks } = arrangeMocks();

      const unsub = await listenToPushNotifications(params);
      expect(params.listenToPushNotificationsCreator).toHaveBeenCalled();
      expect(params.listenToPushClickedCreator).toHaveBeenCalled();

      unsub();
      expect(mocks.mockClickUnsub).toHaveBeenCalled();
      expect(mocks.mockReceivedUnsub).toHaveBeenCalled();
    });
  });
});
