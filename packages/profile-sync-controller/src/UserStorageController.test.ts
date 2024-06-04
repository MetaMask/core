/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/require-jsdoc */
import { ControllerMessenger } from '@metamask/base-controller';
import type {
  NotificationsControllerSelectIsMetamaskNotificationsEnabledAction,
  NotificationsControllerDisableMetamaskNotificationsAction,
} from '@metamask/notifications-controller';
import type nock from 'nock';

import {
  mockEndpointGetUserStorage,
  mockEndpointUpsertUserStorage,
  MOCK_STORAGE_DATA,
  MOCK_STORAGE_KEY,
  MOCK_STORAGE_KEY_SIGNATURE,
} from '../tests/mocks';
import type {
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetSessionProfileAction,
  AuthenticationControllerIsSignedInAction,
  AuthenticationControllerPerformSignInAction,
} from './AuthenticationController';
import type { AllowedActions } from './UserStorageController';
import { UserStorageController } from './UserStorageController';

const typedMockFn = <Fn extends (...args: unknown[]) => unknown>() =>
  jest.fn<ReturnType<Fn>, Parameters<Fn>>();

describe('user-storage/UserStorageController - constructor() tests', () => {
  it('creates UserStorage with default state', () => {
    const { messengerMocks } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    expect(controller.state.isProfileSyncingEnabled).toBe(true);
  });

  function arrangeMocks() {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  }
});

describe('user-storage/UserStorageController - performGetStorage() tests', () => {
  it('returns users notification storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    const result = await controller.performGetStorage('notification_settings');
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
      controller.performGetStorage('notification_settings'),
    ).rejects.toThrow('UserStorage is not enabled');
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
  ])('rejects on auth failure - %s', async (_, arrangeFailureCase) => {
    const { messengerMocks } = arrangeMocks();
    arrangeFailureCase(messengerMocks);
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await expect(
      controller.performGetStorage('notification_settings'),
    ).rejects.toThrow('MOCK FAILURE');
  });

  function arrangeMocks() {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: mockEndpointGetUserStorage(),
    };
  }
});

describe('user-storage/UserStorageController - performSetStorage() tests', () => {
  it('saves users storage', async () => {
    const { messengerMocks, mockAPI } = arrangeMocks();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await controller.performSetStorage('notification_settings', 'new data');
    mockAPI.done();
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
      controller.performSetStorage('notification_settings', 'new data'),
    ).rejects.toThrow('UserStorage is not enabled');
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
  ])('rejects on auth failure - %s', async (_, arrangeFailureCase) => {
    const { messengerMocks } = arrangeMocks();
    arrangeFailureCase(messengerMocks);
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });

    await expect(
      controller.performSetStorage('notification_settings', 'new data'),
    ).rejects.toThrow('MOCK FAILURE');
  });

  it('rejects if api call fails', async () => {
    const { messengerMocks } = arrangeMocks({
      mockAPI: mockEndpointUpsertUserStorage({ status: 500 }),
    });
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
      getMetaMetricsState: () => true,
    });
    await expect(
      controller.performSetStorage('notification_settings', 'new data'),
    ).rejects.toThrow('MOCK FAILURE');
  });

  function arrangeMocks(overrides?: { mockAPI?: nock.Scope }) {
    return {
      messengerMocks: mockUserStorageMessenger(),
      mockAPI: overrides?.mockAPI ?? mockEndpointUpsertUserStorage(),
    };
  }
});

describe('user-storage/UserStorageController - performSetStorage()  tests', () => {
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

    await expect(controller.getStorageKey()).rejects.toThrow(
      'UserStorage is not enabled',
    );
  });

  function arrangeMocks() {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  }
});

describe('user-storage/UserStorageController - disableProfileSyncing() tests', () => {
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

  function arrangeMocks() {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  }
});

describe('user-storage/UserStorageController - enableProfileSyncing() tests', () => {
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

  function arrangeMocks() {
    return {
      messengerMocks: mockUserStorageMessenger(),
    };
  }
});

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
      'NotificationsController:disableMetamaskNotifications',
      'NotificationsController:selectIsMetamaskNotificationsEnabled',
    ],
    allowedEvents: [],
  });

  const mockSnapGetPublicKey = jest.fn().mockResolvedValue('MOCK_PUBLIC_KEY');
  const mockSnapSignMessage = jest
    .fn()
    .mockResolvedValue(MOCK_STORAGE_KEY_SIGNATURE);

  const mockAuthGetBearerToken =
    typedMockFn<
      AuthenticationControllerGetBearerTokenAction['handler']
    >().mockResolvedValue('MOCK_BEARER_TOKEN');

  const mockAuthGetSessionProfile = typedMockFn<
    AuthenticationControllerGetSessionProfileAction['handler']
  >().mockResolvedValue({
    identifierId: '',
    profileId: 'MOCK_PROFILE_ID',
  });

  const mockAuthPerformSignIn =
    typedMockFn<
      AuthenticationControllerPerformSignInAction['handler']
    >().mockResolvedValue('New Access Token');

  const mockAuthIsSignedIn =
    typedMockFn<
      AuthenticationControllerIsSignedInAction['handler']
    >().mockReturnValue(true);

  const mockAuthPerformSignOut =
    typedMockFn<
      AuthenticationControllerIsSignedInAction['handler']
    >().mockReturnValue(true);

  const mockMetamaskNotificationsIsMetamaskNotificationsEnabled =
    typedMockFn<
      NotificationsControllerSelectIsMetamaskNotificationsEnabledAction['handler']
    >().mockReturnValue(true);

  const mockMetamaskNotificationsDisableNotifications =
    typedMockFn<
      NotificationsControllerDisableMetamaskNotificationsAction['handler']
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
        `MOCK_FAIL - unsupported SnapController:handleRequest call: ${params?.request.method}`,
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
      'NotificationsController:selectIsMetamaskNotificationsEnabled'
    ) {
      return mockMetamaskNotificationsIsMetamaskNotificationsEnabled();
    }

    if (actionType === 'NotificationsController:disableMetamaskNotifications') {
      return mockMetamaskNotificationsDisableNotifications();
    }

    if (actionType === 'AuthenticationController:performSignOut') {
      return mockAuthPerformSignOut();
    }

    function exhaustedMessengerMocks(action: never) {
      throw new Error(`MOCK_FAIL - unsupported messenger call: ${action}`);
    }

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
    mockMetamaskNotificationsIsMetamaskNotificationsEnabled,
    mockMetamaskNotificationsDisableNotifications,
    mockAuthPerformSignOut,
  };
}