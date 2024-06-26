import { ControllerMessenger } from '@metamask/base-controller';
import type nock from 'nock';

import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
} from '../authentication/AuthenticationController';
import {
  mockEndpointGetUserStorage,
  mockEndpointUpsertUserStorage,
} from './__fixtures__/mockServices';
import {
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
  MOCK_STORAGE_KEY_SIGNATURE,
} from './__fixtures__/mockStorage';
import type {
  AllowedActions,
  NotificationServicesControllerDisableNotificationServices,
  NotificationServicesControllerSelectIsNotificationServicesEnabled,
} from './UserStorageController';
import UserStorageController from './UserStorageController';

const typedMockFn = <Func extends (...args: unknown[]) => unknown>() =>
  jest.fn<ReturnType<Func>, Parameters<Func>>();

describe('user-storage/user-storage-controller - constructor() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('creates UserStorage with default state', () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
  });
});

describe('user-storage/user-storage-controller - performGetStorage() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointGetUserStorage(),
    };
  };

  it('returns users notification storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    const result = await controller.performGetStorage('notificationSettings');
    mockAPI.done();
    expect(result).toBe(MOCK_STORAGE_DATA);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
      },
    });

    await expect(
      controller.performGetStorage('notificationSettings'),
    ).rejects.toThrow(expect.any(Error));
  });

  it.each([
    [
      'fails when no bearer token is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetBearerToken.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
    [
      'fails when no session identifier is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetSessionProfile.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
  ])(
    'rejects on auth failure - %s',
    async (
      _: string,
      arrangeFailureCase: (
        messengerMocks: ReturnType<typeof mockUserStorageMessenger>,
      ) => void,
    ) => {
      const { messengerMocks } = arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
      });

      await expect(
        controller.performGetStorage('notificationSettings'),
      ).rejects.toThrow(expect.any(Error));
    },
  );
});

describe('user-storage/user-storage-controller - performSetStorage() tests', () => {
  const arrangeMocks = (overrides?: { mockAPI?: nock.Scope }) => {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: overrides?.mockAPI ?? mockEndpointUpsertUserStorage(),
    };
  };

  it('saves users storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await controller.performSetStorage('notificationSettings', 'new data');
    expect(mockAPI.isDone()).toBe(true);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
      },
    });

    await expect(
      controller.performSetStorage('notificationSettings', 'new data'),
    ).rejects.toThrow(expect.any(Error));
  });

  it.each([
    [
      'fails when no bearer token is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetBearerToken.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
    [
      'fails when no session identifier is found (auth errors)',
      (messengerMocks: ReturnType<typeof mockUserStorageMessenger>) =>
        messengerMocks.mockAuthGetSessionProfile.mockRejectedValue(
          new Error('MOCK FAILURE'),
        ),
    ],
  ])(
    'rejects on auth failure - %s',
    async (
      _: string,
      arrangeFailureCase: (
        messengerMocks: ReturnType<typeof mockUserStorageMessenger>,
      ) => void,
    ) => {
      const { messengerMocks } = arrangeMocks();
      arrangeFailureCase(messengerMocks);
      const controller = new UserStorageController({
        messenger: messengerMocks.messenger,
        getMetaMetricsState: () => true,
      });

      await expect(
        controller.performSetStorage('notificationSettings', 'new data'),
      ).rejects.toThrow(expect.any(Error));
    },
  );

  it('rejects if api call fails', async () => {
    const { messengerMocks } = arrangeMocks({
      mockAPI: mockEndpointUpsertUserStorage({ status: 500 }),
    });
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });
    await expect(
      controller.performSetStorage('notificationSettings', 'new data'),
    ).rejects.toThrow(expect.any(Error));
  });
});

describe('user-storage/user-storage-controller - getStorageKey() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should return a storage key', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    const result = await controller.getStorageKey();
    expect(result).toBe(MOCK_STORAGE_KEY);
  });

  it('rejects if UserStorage is not enabled', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
      },
    });

    await expect(controller.getStorageKey()).rejects.toThrow(expect.any(Error));
  });
});

describe('user-storage/user-storage-controller - disableProfileSyncing() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should disable user storage / profile syncing when called', async () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    await controller.disableProfileSyncing();
    expect(controller.state.isProfileSyncingEnabled).toBe(false);
  });
});

describe('user-storage/user-storage-controller - enableProfileSyncing() tests', () => {
  const arrangeMocks = () => {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  };

  it('should enable user storage / profile syncing', async () => {
    const { messengerMocks } = arrangeMocks();
    messengerMocks.mockAuthIsSignedIn.mockReturnValue(false); // mock that auth is not enabled

    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
      state: {
        isProfileSyncingEnabled: false,
        isProfileSyncingUpdateLoading: false,
      },
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(false);
    await controller.enableProfileSyncing();
    expect(controller.state.isProfileSyncingEnabled).toBe(true);
    expect(messengerMocks.mockAuthIsSignedIn).toHaveBeenCalled();
    expect(messengerMocks.mockAuthPerformSignIn).toHaveBeenCalled();
  });
});

/**
 * Jest Mock Utility - create a mock user storage messenger
 *
 * @returns Mock User Storage Messenger
 */
function mockUserStorageMessenger() {
  const messenger = new ControllerMessenger<
    AllowedActions,
    never
  >().getRestricted({
    name: 'UserStorageController',
    allowedActions: [
      'SnapController:handleRequest',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
      'AuthenticationController:performSignOut',
      'NotificationServicesController:disableNotificationServices',
      'NotificationServicesController:selectIsNotificationServicesEnabled',
    ],
    allowedEvents: [],
  });

  const mockSnapGetPublicKey = jest.fn().mockResolvedValue('MOCK_PUBLIC_KEY');
  const mockSnapSignMessage = jest
    .fn()
    .mockResolvedValue(MOCK_STORAGE_KEY_SIGNATURE);

  const mockAuthGetBearerToken =
    typedMockFn<
      AuthenticationControllerGetBearerToken['handler']
    >().mockResolvedValue('MOCK_BEARER_TOKEN');

  const mockAuthGetSessionProfile = typedMockFn<
    AuthenticationControllerGetSessionProfile['handler']
  >().mockResolvedValue({
    identifierId: '',
    profileId: 'MOCK_PROFILE_ID',
  });

  const mockAuthPerformSignIn =
    typedMockFn<
      AuthenticationControllerPerformSignIn['handler']
    >().mockResolvedValue('New Access Token');

  const mockAuthIsSignedIn =
    typedMockFn<
      AuthenticationControllerIsSignedIn['handler']
    >().mockReturnValue(true);

  const mockAuthPerformSignOut =
    typedMockFn<
      AuthenticationControllerIsSignedIn['handler']
    >().mockReturnValue(true);

  const mockNotificationServicesIsEnabled =
    typedMockFn<
      NotificationServicesControllerSelectIsNotificationServicesEnabled['handler']
    >().mockReturnValue(true);

  const mockNotificationServicesDisableNotifications =
    typedMockFn<
      NotificationServicesControllerDisableNotificationServices['handler']
    >().mockResolvedValue();

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const [actionType, params] = args;
    if (actionType === 'SnapController:handleRequest') {
      if (params?.request.method === 'getPublicKey') {
        return mockSnapGetPublicKey();
      }

      if (params?.request.method === 'signMessage') {
        return mockSnapSignMessage();
      }

      throw new Error(
        `MOCK_FAIL - unsupported SnapController:handleRequest call: ${
          params?.request.method as string
        }`,
      );
    }

    if (actionType === 'AuthenticationController:getBearerToken') {
      return mockAuthGetBearerToken();
    }

    if (actionType === 'AuthenticationController:getSessionProfile') {
      return mockAuthGetSessionProfile();
    }

    if (actionType === 'AuthenticationController:performSignIn') {
      return mockAuthPerformSignIn();
    }

    if (actionType === 'AuthenticationController:isSignedIn') {
      return mockAuthIsSignedIn();
    }

    if (
      actionType ===
      'NotificationServicesController:selectIsNotificationServicesEnabled'
    ) {
      return mockNotificationServicesIsEnabled();
    }

    if (
      actionType ===
      'NotificationServicesController:disableNotificationServices'
    ) {
      return mockNotificationServicesDisableNotifications();
    }

    if (actionType === 'AuthenticationController:performSignOut') {
      return mockAuthPerformSignOut();
    }

    const exhaustedMessengerMocks = (action: never) => {
      throw new Error(
        `MOCK_FAIL - unsupported messenger call: ${action as string}`,
      );
    };

    return exhaustedMessengerMocks(actionType);
  });

  return {
    messenger,
    mockSnapGetPublicKey,
    mockSnapSignMessage,
    mockAuthGetBearerToken,
    mockAuthGetSessionProfile,
    mockAuthPerformSignIn,
    mockAuthIsSignedIn,
    mockNotificationServicesIsEnabled,
    mockNotificationServicesDisableNotifications,
    mockAuthPerformSignOut,
  };
}
