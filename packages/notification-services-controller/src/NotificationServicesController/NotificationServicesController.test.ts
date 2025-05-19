import { Messenger } from '@metamask/base-controller';
import * as ControllerUtils from '@metamask/controller-utils';
import {
  KeyringTypes,
  type KeyringControllerGetStateAction,
  type KeyringControllerState,
} from '@metamask/keyring-controller';
import type { UserStorageController } from '@metamask/profile-sync-controller';
import { AuthenticationController } from '@metamask/profile-sync-controller';
import log from 'loglevel';

import { ADDRESS_1, ADDRESS_2 } from './__fixtures__/mockAddresses';
import {
  mockBatchCreateTriggers,
  mockBatchDeleteTriggers,
  mockFetchFeatureAnnouncementNotifications,
  mockListNotifications,
  mockMarkNotificationsAsRead,
} from './__fixtures__/mockServices';
import { waitFor } from './__fixtures__/test-utils';
import { TRIGGER_TYPES } from './constants';
import { createMockSnapNotification } from './mocks';
import {
  createMockFeatureAnnouncementAPIResult,
  createMockFeatureAnnouncementRaw,
} from './mocks/mock-feature-announcements';
import {
  MOCK_USER_STORAGE_ACCOUNT,
  createMockFullUserStorage,
  createMockUserStorageWithTriggers,
} from './mocks/mock-notification-user-storage';
import { createMockNotificationEthSent } from './mocks/mock-raw-notifications';
import NotificationServicesController, {
  defaultState,
} from './NotificationServicesController';
import type {
  AllowedActions,
  AllowedEvents,
  NotificationServicesControllerMessenger,
  NotificationServicesControllerState,
} from './NotificationServicesController';
import { processFeatureAnnouncement } from './processors';
import { processNotification } from './processors/process-notifications';
import { processSnapNotification } from './processors/process-snap-notifications';
import * as OnChainNotifications from './services/onchain-notifications';
import type { INotification } from './types';
import type { UserStorage } from './types/user-storage/user-storage';
import * as Utils from './utils/utils';
import type {
  NotificationServicesPushControllerDisablePushNotificationsAction,
  NotificationServicesPushControllerEnablePushNotificationsAction,
  NotificationServicesPushControllerSubscribeToNotificationsAction,
  NotificationServicesPushControllerUpdateTriggerPushNotificationsAction,
} from '../NotificationServicesPushController';

// Mock type used for testing purposes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockVar = any;

const featureAnnouncementsEnv = {
  spaceId: ':space_id',
  accessToken: ':access_token',
  platform: 'extension' as const,
};

// Testing util to clean up verbose logs when testing errors
const mockErrorLog = () =>
  jest.spyOn(log, 'error').mockImplementation(jest.fn());
const mockWarnLog = () => jest.spyOn(log, 'warn').mockImplementation(jest.fn());

describe('metamask-notifications - constructor()', () => {
  it('initializes state & override state', () => {
    const controller1 = new NotificationServicesController({
      messenger: mockNotificationMessenger().messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });
    expect(controller1.state).toStrictEqual(defaultState);

    const controller2 = new NotificationServicesController({
      messenger: mockNotificationMessenger().messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        ...defaultState,
        isFeatureAnnouncementsEnabled: true,
        isNotificationServicesEnabled: true,
      },
    });
    expect(controller2.state.isFeatureAnnouncementsEnabled).toBe(true);
    expect(controller2.state.isNotificationServicesEnabled).toBe(true);
  });
});

describe('metamask-notifications - init()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    jest
      .spyOn(ControllerUtils, 'toChecksumHexAddress')
      .mockImplementation((x) => x);

    return messengerMocks;
  };

  const actPublishKeyringStateChange = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messenger: any,
    accounts: string[] = ['0x111', '0x222'],
  ) => {
    messenger.publish(
      'KeyringController:stateChange',
      {
        keyrings: [{ accounts }],
      } as KeyringControllerState,
      [],
    );
  };

  const arrangeActAssertKeyringTest = async (
    controllerState?: Partial<NotificationServicesControllerState>,
  ) => {
    const mocks = arrangeMocks();
    const { messenger, globalMessenger, mockKeyringControllerGetState } = mocks;
    // initialize controller with 1 address
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        isNotificationServicesEnabled: true,
        subscriptionAccountsSeen: [],
        ...controllerState,
      },
    });
    controller.init();

    const mockUpdate = jest
      .spyOn(controller, 'updateOnChainTriggersByAccount')
      .mockResolvedValue({} as UserStorage);
    const mockDelete = jest
      .spyOn(controller, 'deleteOnChainTriggersByAccount')
      .mockResolvedValue({} as UserStorage);

    const act = async (addresses: string[], assertion: () => void) => {
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: [
          {
            accounts: addresses,
            type: KeyringTypes.hd,
            metadata: {
              id: '123',
              name: '',
            },
          },
        ],
      });

      await actPublishKeyringStateChange(globalMessenger, addresses);
      await waitFor(() => {
        assertion();
      });

      // Clear mocks for next act/assert
      mockUpdate.mockClear();
      mockDelete.mockClear();
    };

    return { act, mockUpdate, mockDelete };
  };

  it('event KeyringController:stateChange will not add or remove triggers when feature is disabled', async () => {
    const { act, mockUpdate, mockDelete } = await arrangeActAssertKeyringTest({
      isNotificationServicesEnabled: false,
    });

    // listAccounts has a new address
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  it('event KeyringController:stateChange will update notification triggers when keyring accounts change', async () => {
    const { act, mockUpdate, mockDelete } = await arrangeActAssertKeyringTest({
      subscriptionAccountsSeen: [ADDRESS_1],
    });

    // Act - if list accounts has been seen, then will not update
    await act([ADDRESS_1], () => {
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    // Act - if a new address in list, then will update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    // Act - if the list doesn't have an address, then we need to delete
    await act([ADDRESS_2], () => {
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
    });

    // If the address is added back to the list, we will perform an update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  it('event KeyringController:stateChange will update only once when if the number of keyring accounts do not change', async () => {
    const { act, mockUpdate, mockDelete } = await arrangeActAssertKeyringTest();

    // Act - First list of items, so will update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    // Act - Since number of addresses in keyring has not changed, will not update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  const arrangeActInitialisePushNotifications = (
    modifications?: (mocks: ReturnType<typeof arrangeMocks>) => void,
  ) => {
    // Arrange
    const mocks = arrangeMocks();
    modifications?.(mocks);

    // Act
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    controller.init();

    return mocks;
  };

  it('initialises push notifications', async () => {
    const { mockEnablePushNotifications } =
      arrangeActInitialisePushNotifications();

    await waitFor(() => {
      expect(mockEnablePushNotifications).toHaveBeenCalled();
    });
  });

  it('does not initialise push notifications if the wallet is locked', async () => {
    const { mockEnablePushNotifications, mockSubscribeToPushNotifications } =
      arrangeActInitialisePushNotifications((mocks) => {
        mocks.mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: false, // Wallet Locked
        } as MockVar);
      });

    await waitFor(() => {
      expect(mockEnablePushNotifications).not.toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockSubscribeToPushNotifications).toHaveBeenCalled();
    });
  });

  it('should re-initialise push notifications if wallet was locked, and then is unlocked', async () => {
    // Test Wallet Lock
    const {
      globalMessenger,
      mockEnablePushNotifications,
      mockSubscribeToPushNotifications,
    } = arrangeActInitialisePushNotifications((mocks) => {
      mocks.mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: false, // Wallet Locked
        keyrings: [],
      });
    });

    await waitFor(() => {
      expect(mockEnablePushNotifications).not.toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockSubscribeToPushNotifications).toHaveBeenCalled();
    });

    // Test Wallet Unlock
    jest.clearAllMocks();
    globalMessenger.publish('KeyringController:unlock');
    await waitFor(() => {
      expect(mockEnablePushNotifications).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockSubscribeToPushNotifications).not.toHaveBeenCalled();
    });
  });

  it('bails push notification initialisation if fails to get notification storage', async () => {
    const { mockPerformGetStorage, mockEnablePushNotifications } =
      arrangeActInitialisePushNotifications((mocks) => {
        // test when user storage is empty
        mocks.mockPerformGetStorage.mockResolvedValue(null);
      });

    await waitFor(() => {
      expect(mockPerformGetStorage).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockEnablePushNotifications).not.toHaveBeenCalled();
    });
  });

  const arrangeActInitialiseNotificationAccountTracking = (
    modifications?: (mocks: ReturnType<typeof arrangeMocks>) => void,
  ) => {
    // Arrange
    const mocks = arrangeMocks();
    modifications?.(mocks);

    // Act
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: {
        featureAnnouncements: featureAnnouncementsEnv,
        isPushIntegrated: false,
      },
      state: { isNotificationServicesEnabled: true },
    });

    controller.init();

    return mocks;
  };

  it('should initialse accounts to track notifications on', async () => {
    const { mockKeyringControllerGetState } =
      arrangeActInitialiseNotificationAccountTracking();
    await waitFor(() => {
      expect(mockKeyringControllerGetState).toHaveBeenCalledTimes(2);
    });
  });

  it('should not initialise accounts if wallet is locked', async () => {
    const { mockKeyringControllerGetState } =
      arrangeActInitialiseNotificationAccountTracking((mocks) => {
        mocks.mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: false,
        } as MockVar);
      });
    await waitFor(() => {
      expect(mockKeyringControllerGetState).toHaveBeenCalledTimes(1);
    });
  });

  it('should re-initialise if the wallet was locked, and then unlocked', async () => {
    // Test Wallet Locked
    const { globalMessenger, mockKeyringControllerGetState } =
      arrangeActInitialiseNotificationAccountTracking((mocks) => {
        mocks.mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: false,
          keyrings: [],
        });
      });
    expect(mockKeyringControllerGetState).toHaveBeenCalledTimes(1);

    // Test Wallet Unlock
    globalMessenger.publish('KeyringController:unlock');
    expect(mockKeyringControllerGetState).toHaveBeenCalledTimes(2);
  });
});

// See /utils for more in-depth testing
describe('metamask-notifications - checkAccountsPresence()', () => {
  it('returns Record with accounts that have notifications enabled', async () => {
    const { messenger, mockPerformGetStorage } = mockNotificationMessenger();
    mockPerformGetStorage.mockResolvedValue(
      JSON.stringify(createMockFullUserStorage()),
    );

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });
    const result = await controller.checkAccountsPresence([
      MOCK_USER_STORAGE_ACCOUNT,
      '0xfake',
    ]);
    expect(result).toStrictEqual({
      [MOCK_USER_STORAGE_ACCOUNT]: true,
      '0xfake': false,
    });
  });
});

describe('metamask-notifications - setFeatureAnnouncementsEnabled()', () => {
  it('flips state when the method is called', async () => {
    const { messenger, mockIsSignedIn } = mockNotificationMessenger();
    mockIsSignedIn.mockReturnValue(true);

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { ...defaultState, isFeatureAnnouncementsEnabled: false },
    });

    await controller.setFeatureAnnouncementsEnabled(true);

    expect(controller.state.isFeatureAnnouncementsEnabled).toBe(true);
  });
});

describe('metamask-notifications - createOnChainTriggers()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    const mockCreateOnChainTriggers = jest
      .spyOn(OnChainNotifications, 'createOnChainTriggers')
      .mockResolvedValue();
    const mockInitializeUserStorage = jest
      .spyOn(Utils, 'initializeUserStorage')
      .mockReturnValue(createMockUserStorageWithTriggers(['t1', 't2']));
    return {
      ...messengerMocks,
      mockCreateOnChainTriggers,
      mockInitializeUserStorage,
    };
  };

  it('create new triggers and push notifications if there is no User Storage (login for new user)', async () => {
    const {
      messenger,
      mockInitializeUserStorage,
      mockEnablePushNotifications,
      mockCreateOnChainTriggers,
      mockPerformGetStorage,
    } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });
    mockPerformGetStorage.mockResolvedValue(null); // Mock no storage found.

    const result = await controller.createOnChainTriggers();
    expect(result).toBeDefined();
    expect(mockInitializeUserStorage).toHaveBeenCalled(); // called since no user storage (this is an existing user)
    expect(mockCreateOnChainTriggers).toHaveBeenCalled();
    expect(mockEnablePushNotifications).toHaveBeenCalled();
  });

  it('throws if not given a valid auth & storage key', async () => {
    const mocks = arrangeMocks();
    mockErrorLog();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const testScenarios = {
      ...arrangeFailureAuthAssertions(mocks),
      ...arrangeFailureUserStorageKeyAssertions(mocks),
    };

    for (const mockFailureAction of Object.values(testScenarios)) {
      mockFailureAction();
      await expect(controller.createOnChainTriggers()).rejects.toThrow(
        expect.any(Error),
      );
    }
  });

  it('creates new triggers if a user has chosen to reset notifications', async () => {
    const {
      messenger,
      mockInitializeUserStorage,
      mockEnablePushNotifications,
      mockCreateOnChainTriggers,
      mockPerformGetStorage,
    } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const result = await controller.createOnChainTriggers({
      resetNotifications: true,
    });
    expect(result).toBeDefined();
    expect(mockPerformGetStorage).not.toHaveBeenCalled(); // not called as we are resetting notifications
    expect(mockInitializeUserStorage).toHaveBeenCalled(); // called since no user storage (this is an existing user)
    expect(mockCreateOnChainTriggers).toHaveBeenCalled();
    expect(mockEnablePushNotifications).toHaveBeenCalled();
  });
});

describe('metamask-notifications - deleteOnChainTriggersByAccount', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    const nockMockDeleteTriggersAPI = mockBatchDeleteTriggers();
    return { ...messengerMocks, nockMockDeleteTriggersAPI };
  };

  it('deletes and disables push notifications for a given account', async () => {
    const {
      messenger,
      nockMockDeleteTriggersAPI,
      mockUpdateTriggerPushNotifications,
    } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });
    const result = await controller.deleteOnChainTriggersByAccount([
      MOCK_USER_STORAGE_ACCOUNT,
    ]);
    expect(Utils.traverseUserStorageTriggers(result)).toHaveLength(0);
    expect(nockMockDeleteTriggersAPI.isDone()).toBe(true);
    expect(mockUpdateTriggerPushNotifications).toHaveBeenCalled();
  });

  it('does nothing if account does not exist in storage', async () => {
    const { messenger, mockDisablePushNotifications } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });
    const result = await controller.deleteOnChainTriggersByAccount([
      'UNKNOWN_ACCOUNT',
    ]);
    expect(Utils.traverseUserStorageTriggers(result)).not.toHaveLength(0);

    expect(mockDisablePushNotifications).not.toHaveBeenCalled();
  });

  it('throws errors when invalid auth and storage', async () => {
    const mocks = arrangeMocks();
    mockErrorLog();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const testScenarios = {
      ...arrangeFailureAuthAssertions(mocks),
      ...arrangeFailureUserStorageKeyAssertions(mocks),
      ...arrangeFailureUserStorageAssertions(mocks),
    };

    for (const mockFailureAction of Object.values(testScenarios)) {
      mockFailureAction();
      await expect(
        controller.deleteOnChainTriggersByAccount([MOCK_USER_STORAGE_ACCOUNT]),
      ).rejects.toThrow(expect.any(Error));
    }
  });
});

describe('metamask-notifications - updateOnChainTriggersByAccount()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    const mockBatchTriggersAPI = mockBatchCreateTriggers();
    return { ...messengerMocks, mockBatchTriggersAPI };
  };

  it('creates Triggers and Push Notification Links for a new account', async () => {
    const {
      messenger,
      mockUpdateTriggerPushNotifications,
      mockPerformSetStorage,
    } = arrangeMocks();
    const MOCK_ACCOUNT = ADDRESS_1;
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const result = await controller.updateOnChainTriggersByAccount([
      MOCK_ACCOUNT,
    ]);
    expect(
      Utils.traverseUserStorageTriggers(result, {
        address: MOCK_ACCOUNT.toLowerCase(),
      }).length > 0,
    ).toBe(true);

    expect(mockUpdateTriggerPushNotifications).toHaveBeenCalled();
    expect(mockPerformSetStorage).toHaveBeenCalled();
  });

  it('throws errors when invalid auth and storage', async () => {
    const mocks = arrangeMocks();
    mockErrorLog();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const testScenarios = {
      ...arrangeFailureAuthAssertions(mocks),
      ...arrangeFailureUserStorageKeyAssertions(mocks),
      ...arrangeFailureUserStorageAssertions(mocks),
    };

    for (const mockFailureAction of Object.values(testScenarios)) {
      mockFailureAction();
      await expect(
        controller.deleteOnChainTriggersByAccount([MOCK_USER_STORAGE_ACCOUNT]),
      ).rejects.toThrow(expect.any(Error));
    }
  });
});

describe('metamask-notifications - fetchAndUpdateMetamaskNotifications()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();

    const mockFeatureAnnouncementAPIResult =
      createMockFeatureAnnouncementAPIResult();
    const mockFeatureAnnouncementsAPI =
      mockFetchFeatureAnnouncementNotifications({
        status: 200,
        body: mockFeatureAnnouncementAPIResult,
      });

    const mockListNotificationsAPIResult = [createMockNotificationEthSent()];
    const mockListNotificationsAPI = mockListNotifications({
      status: 200,
      body: mockListNotificationsAPIResult,
    });
    return {
      ...messengerMocks,
      mockFeatureAnnouncementAPIResult,
      mockFeatureAnnouncementsAPI,
      mockListNotificationsAPIResult,
      mockListNotificationsAPI,
    };
  };

  const arrangeController = (
    messenger: NotificationServicesControllerMessenger,
    overrideState?: Partial<NotificationServicesControllerState>,
  ) => {
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        ...defaultState,
        isNotificationServicesEnabled: true,
        isFeatureAnnouncementsEnabled: true,
        ...overrideState,
      },
    });

    return controller;
  };

  it('processes and shows all notifications (announcements, wallet, and snap notifications)', async () => {
    const { messenger } = arrangeMocks();
    const controller = arrangeController(messenger, {
      metamaskNotificationsList: [
        processSnapNotification(createMockSnapNotification()),
      ],
    });

    const result = await controller.fetchAndUpdateMetamaskNotifications();

    // Should have 1 feature announcement
    expect(
      result.filter((n) => n.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT),
    ).toHaveLength(1);

    // Should have 1 Wallet Notification
    expect(
      result.filter((n) => n.type === TRIGGER_TYPES.ETH_SENT),
    ).toHaveLength(1);

    // Should have 1 Snap Notification
    expect(result.filter((n) => n.type === TRIGGER_TYPES.SNAP)).toHaveLength(1);

    // Total notification length = 3
    expect(result).toHaveLength(3);
  });

  it('does not fetch feature announcements or wallet notifications if notifications are disabled globally', async () => {
    const { messenger, ...mocks } = arrangeMocks();
    const controller = arrangeController(messenger, {
      isNotificationServicesEnabled: false,
      metamaskNotificationsList: [
        processSnapNotification(createMockSnapNotification()),
      ],
    });

    const result = await controller.fetchAndUpdateMetamaskNotifications();

    // Should only contain snap notification
    // As this is not controlled by the global notification switch
    expect(result).toHaveLength(1);
    expect(result.filter((n) => n.type === TRIGGER_TYPES.SNAP)).toHaveLength(1);

    // APIs should not have been called
    expect(mocks.mockFeatureAnnouncementsAPI.isDone()).toBe(false);
    expect(mocks.mockListNotificationsAPI.isDone()).toBe(false);
  });

  it('should not fetch feature announcements if disabled', async () => {
    const { messenger, ...mocks } = arrangeMocks();
    const controller = arrangeController(messenger, {
      isFeatureAnnouncementsEnabled: false,
    });

    const result = await controller.fetchAndUpdateMetamaskNotifications();

    // Should not have any feature announcements
    expect(
      result.filter((n) => n.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT),
    ).toHaveLength(0);

    // Should not have called feature announcement API
    expect(mocks.mockFeatureAnnouncementsAPI.isDone()).toBe(false);
  });
});

describe('metamask-notifications - getNotificationsByType', () => {
  it('can fetch notifications by their type', async () => {
    const { messenger } = mockNotificationMessenger();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const processedSnapNotification = processSnapNotification(
      createMockSnapNotification(),
    );
    const processedFeatureAnnouncement = processFeatureAnnouncement(
      createMockFeatureAnnouncementRaw(),
    );

    await controller.updateMetamaskNotificationsList(processedSnapNotification);
    await controller.updateMetamaskNotificationsList(
      processedFeatureAnnouncement,
    );

    expect(controller.state.metamaskNotificationsList).toHaveLength(2);

    const filteredNotifications = controller.getNotificationsByType(
      TRIGGER_TYPES.SNAP,
    );

    expect(filteredNotifications).toHaveLength(1);
    expect(filteredNotifications).toStrictEqual([
      {
        type: TRIGGER_TYPES.SNAP,
        id: expect.any(String),
        createdAt: expect.any(String),
        isRead: false,
        readDate: null,
        data: {
          message: 'fooBar',
          origin: '@metamask/example-snap',
          detailedView: {
            title: 'Detailed View',
            interfaceId: '1',
            footerLink: {
              text: 'Go Home',
              href: 'metamask://client/',
            },
          },
        },
      },
    ]);
  });
});

describe('metamask-notifications - deleteNotificationsById', () => {
  it('will delete a notification by its id', async () => {
    const { messenger } = mockNotificationMessenger();
    const processedSnapNotification = processSnapNotification(
      createMockSnapNotification(),
    );
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { metamaskNotificationsList: [processedSnapNotification] },
    });

    await controller.deleteNotificationsById([processedSnapNotification.id]);

    expect(controller.state.metamaskNotificationsList).toHaveLength(0);
  });

  it('will batch delete notifications', async () => {
    const { messenger } = mockNotificationMessenger();
    const processedSnapNotification1 = processSnapNotification(
      createMockSnapNotification(),
    );
    const processedSnapNotification2 = processSnapNotification(
      createMockSnapNotification(),
    );
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        metamaskNotificationsList: [
          processedSnapNotification1,
          processedSnapNotification2,
        ],
      },
    });

    await controller.deleteNotificationsById([
      processedSnapNotification1.id,
      processedSnapNotification2.id,
    ]);

    expect(controller.state.metamaskNotificationsList).toHaveLength(0);
  });

  it('will throw if a notification is not found', async () => {
    const { messenger } = mockNotificationMessenger();
    const processedSnapNotification = processSnapNotification(
      createMockSnapNotification(),
    );
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { metamaskNotificationsList: [processedSnapNotification] },
    });

    await expect(controller.deleteNotificationsById(['foo'])).rejects.toThrow(
      'The notification to be deleted does not exist.',
    );

    expect(controller.state.metamaskNotificationsList).toHaveLength(1);
  });

  it('will throw if the notification to be deleted is not locally persisted', async () => {
    const { messenger } = mockNotificationMessenger();
    const processedSnapNotification = processSnapNotification(
      createMockSnapNotification(),
    );
    const processedFeatureAnnouncement = processFeatureAnnouncement(
      createMockFeatureAnnouncementRaw(),
    );
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        metamaskNotificationsList: [
          processedFeatureAnnouncement,
          processedSnapNotification,
        ],
      },
    });

    await expect(
      controller.deleteNotificationsById([processedFeatureAnnouncement.id]),
    ).rejects.toThrow(
      'The notification type of "features_announcement" is not locally persisted, only the following types can use this function: snap.',
    );

    expect(controller.state.metamaskNotificationsList).toHaveLength(2);
  });
});

describe('metamask-notifications - markMetamaskNotificationsAsRead()', () => {
  const arrangeMocks = (options?: { onChainMarkAsReadFails: boolean }) => {
    const messengerMocks = mockNotificationMessenger();

    const mockMarkAsReadAPI = mockMarkNotificationsAsRead({
      status: options?.onChainMarkAsReadFails ? 500 : 200,
    });

    return {
      ...messengerMocks,
      mockMarkAsReadAPI,
    };
  };

  it('updates feature announcements as read', async () => {
    const { messenger } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.markMetamaskNotificationsAsRead([
      processNotification(createMockFeatureAnnouncementRaw()),
      processNotification(createMockNotificationEthSent()),
    ]);

    // Should see 2 items in controller read state
    expect(controller.state.metamaskNotificationsReadList).toHaveLength(1);
  });

  it('should at least mark feature announcements locally if external updates fail', async () => {
    const { messenger } = arrangeMocks({ onChainMarkAsReadFails: true });
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });
    mockErrorLog();
    mockWarnLog();

    await controller.markMetamaskNotificationsAsRead([
      processNotification(createMockFeatureAnnouncementRaw()),
      processNotification(createMockNotificationEthSent()),
    ]);

    // Should see 1 item in controller read state.
    // This is because on-chain failed.
    // We can debate & change implementation if it makes sense to mark as read locally if external APIs fail.
    expect(controller.state.metamaskNotificationsReadList).toHaveLength(1);
  });

  it('updates snap notifications as read', async () => {
    const { messenger } = arrangeMocks();
    const processedSnapNotification = processSnapNotification(
      createMockSnapNotification(),
    );
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        metamaskNotificationsList: [processedSnapNotification],
      },
    });

    await controller.markMetamaskNotificationsAsRead([
      {
        type: TRIGGER_TYPES.SNAP,
        id: processedSnapNotification.id,
        isRead: false,
      },
    ]);

    // Should see 1 item in controller read state
    expect(controller.state.metamaskNotificationsReadList).toHaveLength(1);

    // The notification should have a read date
    expect(
      // @ts-expect-error readDate property is guaranteed to exist
      // as we're dealing with a snap notification
      controller.state.metamaskNotificationsList[0].readDate,
    ).not.toBeNull();
  });
});

describe('metamask-notifications - enableMetamaskNotifications()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();

    const mockCreateOnChainTriggers = jest
      .spyOn(OnChainNotifications, 'createOnChainTriggers')
      .mockResolvedValue();

    messengerMocks.mockKeyringControllerGetState.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          accounts: [ADDRESS_1],
          type: KeyringTypes.hd,
          metadata: {
            id: '123',
            name: '',
          },
        },
      ],
    });

    return { ...messengerMocks, mockCreateOnChainTriggers };
  };

  it('should sign a user in if not already signed in', async () => {
    const mocks = arrangeMocks();
    mocks.mockIsSignedIn.mockReturnValue(false); // mock that auth is not enabled
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.enableMetamaskNotifications();

    expect(mocks.mockIsSignedIn).toHaveBeenCalled();
    expect(mocks.mockAuthPerformSignIn).toHaveBeenCalled();
    expect(mocks.mockIsSignedIn()).toBe(true);
  });

  it('create new notifications when switched on and no new notifications', async () => {
    const mocks = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const promise = controller.enableMetamaskNotifications();

    // Act - intermediate state
    expect(controller.state.isUpdatingMetamaskNotifications).toBe(true);

    await promise;

    // Act - final state
    expect(controller.state.isUpdatingMetamaskNotifications).toBe(false);
    expect(controller.state.isNotificationServicesEnabled).toBe(true);

    // Act - services called
    expect(mocks.mockCreateOnChainTriggers).toHaveBeenCalled();
  });

  it('not create new notifications when enabling an account already in storage', async () => {
    const mocks = arrangeMocks();
    const userStorage = createMockFullUserStorage({ address: ADDRESS_1 });
    mocks.mockPerformGetStorage.mockResolvedValue(JSON.stringify(userStorage));
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.enableMetamaskNotifications();

    const existingTriggers = Utils.getAllUUIDs(userStorage);
    const upsertedTriggers =
      mocks.mockCreateOnChainTriggers.mock.calls[0][3].map((t) => t.id);

    expect(existingTriggers).toStrictEqual(upsertedTriggers);
  });
});

describe('metamask-notifications - disableMetamaskNotifications()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();

    const mockDeleteOnChainTriggers = jest
      .spyOn(OnChainNotifications, 'deleteOnChainTriggers')
      .mockResolvedValue({} as UserStorage);

    return { ...messengerMocks, mockDeleteOnChainTriggers };
  };

  it('disable notifications and turn off push notifications', async () => {
    const mocks = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        isNotificationServicesEnabled: true,
        metamaskNotificationsList: [
          createMockFeatureAnnouncementRaw() as INotification,
          createMockSnapNotification() as INotification,
        ],
      },
    });

    const promise = controller.disableNotificationServices();

    // Act - intermediate state
    expect(controller.state.isUpdatingMetamaskNotifications).toBe(true);

    await promise;

    // Act - final state
    expect(controller.state.isUpdatingMetamaskNotifications).toBe(false);
    expect(controller.state.isNotificationServicesEnabled).toBe(false);
    expect(controller.state.isFeatureAnnouncementsEnabled).toBe(false);
    expect(controller.state.metamaskNotificationsList).toStrictEqual([
      createMockSnapNotification(),
    ]);

    expect(mocks.mockDisablePushNotifications).toHaveBeenCalled();

    // We do not delete triggers when disabling notifications
    // As other devices might be using those triggers to receive notifications
    expect(mocks.mockDeleteOnChainTriggers).not.toHaveBeenCalled();
  });
});

describe('metamask-notifications - updateMetamaskNotificationsList', () => {
  it('can add and process a new notification to the notifications list', async () => {
    const { messenger } = mockNotificationMessenger();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });
    const processedSnapNotification = processSnapNotification(
      createMockSnapNotification(),
    );
    await controller.updateMetamaskNotificationsList(processedSnapNotification);
    expect(controller.state.metamaskNotificationsList).toStrictEqual([
      {
        type: TRIGGER_TYPES.SNAP,
        id: expect.any(String),
        createdAt: expect.any(String),
        readDate: null,
        isRead: false,
        data: {
          message: 'fooBar',
          origin: '@metamask/example-snap',
          detailedView: {
            title: 'Detailed View',
            interfaceId: '1',
            footerLink: {
              text: 'Go Home',
              href: 'metamask://client/',
            },
          },
        },
      },
    ]);
  });
});

describe('metamask-notifications - enablePushNotifications', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    return messengerMocks;
  };

  it('calls push controller and enables notifications for accounts that have subscribed to notifications', async () => {
    const { messenger, mockPerformGetStorage, mockEnablePushNotifications } =
      arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    // Act
    await controller.enablePushNotifications();

    // Assert
    expect(mockPerformGetStorage).toHaveBeenCalled();
    expect(mockEnablePushNotifications).toHaveBeenCalled();
  });

  it('throws error if fails to get notification triggers', async () => {
    const { messenger, mockPerformGetStorage, mockEnablePushNotifications } =
      arrangeMocks();

    // Mock no storage
    mockPerformGetStorage.mockResolvedValue(null);

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    // Act
    await expect(() => controller.enablePushNotifications()).rejects.toThrow(
      expect.any(Error),
    );

    expect(mockEnablePushNotifications).not.toHaveBeenCalled();
  });
});

describe('metamask-notifications - disablePushNotifications', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    return messengerMocks;
  };

  it('calls push controller and enables notifications for accounts that have subscribed to notifications', async () => {
    const { messenger, mockDisablePushNotifications } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    // Act
    await controller.disablePushNotifications();

    // Assert
    expect(mockDisablePushNotifications).toHaveBeenCalled();
  });
});

// Type-Computation - we are extracting args and parameters from a generic type utility
// Thus this `AnyFunc` can be used to help constrain the generic parameters correctly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;
const typedMockAction = <Action extends { handler: AnyFunc }>() =>
  jest.fn<ReturnType<Action['handler']>, Parameters<Action['handler']>>();

/**
 * Jest Mock Utility - Mock Notification Messenger
 *
 * @returns mock notification messenger and other messenger mocks
 */
function mockNotificationMessenger() {
  const globalMessenger = new Messenger<AllowedActions, AllowedEvents>();

  const messenger = globalMessenger.getRestricted({
    name: 'NotificationServicesController',
    allowedActions: [
      'KeyringController:getState',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
      'NotificationServicesPushController:disablePushNotifications',
      'NotificationServicesPushController:enablePushNotifications',
      'NotificationServicesPushController:updateTriggerPushNotifications',
      'NotificationServicesPushController:subscribeToPushNotifications',
      'UserStorageController:getStorageKey',
      'UserStorageController:performGetStorage',
      'UserStorageController:performSetStorage',
    ],
    allowedEvents: [
      'KeyringController:stateChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NotificationServicesPushController:onNewNotifications',
      'NotificationServicesPushController:stateChange',
    ],
  });

  const mockGetBearerToken =
    typedMockAction<AuthenticationController.AuthenticationControllerGetBearerToken>().mockResolvedValue(
      AuthenticationController.Mocks.MOCK_OATH_TOKEN_RESPONSE.access_token,
    );

  const mockIsSignedIn =
    typedMockAction<AuthenticationController.AuthenticationControllerIsSignedIn>().mockReturnValue(
      true,
    );

  const mockAuthPerformSignIn =
    typedMockAction<AuthenticationController.AuthenticationControllerPerformSignIn>().mockResolvedValue(
      'New Access Token',
    );

  const mockDisablePushNotifications =
    typedMockAction<NotificationServicesPushControllerDisablePushNotificationsAction>();

  const mockEnablePushNotifications =
    typedMockAction<NotificationServicesPushControllerEnablePushNotificationsAction>();

  const mockUpdateTriggerPushNotifications =
    typedMockAction<NotificationServicesPushControllerUpdateTriggerPushNotificationsAction>();

  const mockSubscribeToPushNotifications =
    typedMockAction<NotificationServicesPushControllerSubscribeToNotificationsAction>();

  const mockGetStorageKey =
    typedMockAction<UserStorageController.UserStorageControllerGetStorageKey>().mockResolvedValue(
      'MOCK_STORAGE_KEY',
    );

  const mockPerformGetStorage =
    typedMockAction<UserStorageController.UserStorageControllerPerformGetStorage>().mockResolvedValue(
      JSON.stringify(createMockFullUserStorage()),
    );

  const mockPerformSetStorage =
    typedMockAction<UserStorageController.UserStorageControllerPerformSetStorage>();

  const mockKeyringControllerGetState =
    typedMockAction<KeyringControllerGetStateAction>().mockReturnValue({
      isUnlocked: true,
      keyrings: [{ accounts: ['0x111'], type: KeyringTypes.hd }],
    } as MockVar);

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const [actionType] = args;

    // This mock implementation does not have a nice discriminate union where types/parameters can be correctly inferred
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, ...params]: any[] = args;

    if (actionType === 'KeyringController:getState') {
      return mockKeyringControllerGetState();
    }

    if (actionType === 'AuthenticationController:getBearerToken') {
      return mockGetBearerToken();
    }

    if (actionType === 'AuthenticationController:isSignedIn') {
      return mockIsSignedIn();
    }

    if (actionType === 'AuthenticationController:performSignIn') {
      mockIsSignedIn.mockReturnValue(true);
      return mockAuthPerformSignIn();
    }

    if (
      actionType ===
      'NotificationServicesPushController:disablePushNotifications'
    ) {
      return mockDisablePushNotifications();
    }

    if (
      actionType ===
      'NotificationServicesPushController:enablePushNotifications'
    ) {
      return mockEnablePushNotifications(params[0]);
    }

    if (
      actionType ===
      'NotificationServicesPushController:updateTriggerPushNotifications'
    ) {
      return mockUpdateTriggerPushNotifications(params[0]);
    }

    if (
      actionType ===
      'NotificationServicesPushController:subscribeToPushNotifications'
    ) {
      return mockSubscribeToPushNotifications();
    }

    if (actionType === 'UserStorageController:getStorageKey') {
      return mockGetStorageKey();
    }

    if (actionType === 'UserStorageController:performGetStorage') {
      return mockPerformGetStorage(params[0]);
    }

    if (actionType === 'UserStorageController:performSetStorage') {
      return mockPerformSetStorage(params[0], params[1]);
    }

    throw new Error(
      `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
    );
  });

  return {
    globalMessenger,
    messenger,
    mockGetBearerToken,
    mockIsSignedIn,
    mockAuthPerformSignIn,
    mockDisablePushNotifications,
    mockEnablePushNotifications,
    mockUpdateTriggerPushNotifications,
    mockSubscribeToPushNotifications,
    mockGetStorageKey,
    mockPerformGetStorage,
    mockPerformSetStorage,
    mockKeyringControllerGetState,
  };
}

/**
 * Jest Mock Utility - Mock Auth Failure Assertions
 *
 * @param mocks - mock messenger
 * @returns mock test auth scenarios
 */
function arrangeFailureAuthAssertions(
  mocks: ReturnType<typeof mockNotificationMessenger>,
) {
  const testScenarios = {
    NotLoggedIn: () => mocks.mockIsSignedIn.mockReturnValue(false),

    // unlikely, but in case it returns null
    NoBearerToken: () =>
      mocks.mockGetBearerToken.mockResolvedValueOnce(null as unknown as string),

    RejectedBearerToken: () =>
      mocks.mockGetBearerToken.mockRejectedValueOnce(
        new Error('MOCK - no bearer token'),
      ),
  };

  return testScenarios;
}

/**
 * Jest Mock Utility - Mock User Storage Failure Assertions
 *
 * @param mocks - mock messenger
 * @returns mock test user storage key scenarios (e.g. no storage key, rejected storage key)
 */
function arrangeFailureUserStorageKeyAssertions(
  mocks: ReturnType<typeof mockNotificationMessenger>,
) {
  const testScenarios = {
    NoStorageKey: () =>
      mocks.mockGetStorageKey.mockResolvedValueOnce(null as unknown as string), // unlikely but in case it returns null
    RejectedStorageKey: () =>
      mocks.mockGetStorageKey.mockRejectedValueOnce(
        new Error('MOCK - no storage key'),
      ),
  };
  return testScenarios;
}

/**
 * Jest Mock Utility - Mock User Storage Failure Assertions
 *
 * @param mocks - mock messenger
 * @returns mock test user storage scenarios
 */
function arrangeFailureUserStorageAssertions(
  mocks: ReturnType<typeof mockNotificationMessenger>,
) {
  const testScenarios = {
    NoUserStorage: () =>
      mocks.mockPerformGetStorage.mockResolvedValueOnce(null),
    ThrowUserStorage: () =>
      mocks.mockPerformGetStorage.mockRejectedValueOnce(
        new Error('MOCK - Unable to call storage api'),
      ),
  };
  return testScenarios;
}
