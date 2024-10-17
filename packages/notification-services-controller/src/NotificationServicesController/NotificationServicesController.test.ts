import { ControllerMessenger } from '@metamask/base-controller';
import * as ControllerUtils from '@metamask/controller-utils';
import type {
  KeyringControllerGetAccountsAction,
  KeyringControllerState,
} from '@metamask/keyring-controller';
import type { UserStorageController } from '@metamask/profile-sync-controller';
import { AuthenticationController } from '@metamask/profile-sync-controller';

import { createMockSnapNotification } from './__fixtures__';
import {
  createMockFeatureAnnouncementAPIResult,
  createMockFeatureAnnouncementRaw,
} from './__fixtures__/mock-feature-announcements';
import {
  MOCK_USER_STORAGE_ACCOUNT,
  createMockFullUserStorage,
  createMockUserStorageWithTriggers,
} from './__fixtures__/mock-notification-user-storage';
import { createMockNotificationEthSent } from './__fixtures__/mock-raw-notifications';
import {
  mockFetchFeatureAnnouncementNotifications,
  mockBatchCreateTriggers,
  mockBatchDeleteTriggers,
  mockListNotifications,
  mockMarkNotificationsAsRead,
} from './__fixtures__/mockServices';
import { waitFor } from './__fixtures__/test-utils';
import { TRIGGER_TYPES } from './constants';
import NotificationServicesController, {
  defaultState,
} from './NotificationServicesController';
import type {
  AllowedActions,
  AllowedEvents,
  NotificationServicesPushControllerEnablePushNotifications,
  NotificationServicesPushControllerDisablePushNotifications,
  NotificationServicesPushControllerUpdateTriggerPushNotifications,
} from './NotificationServicesController';
import { processNotification } from './processors/process-notifications';
import { processSnapNotification } from './processors/process-snap-notifications';
import * as OnChainNotifications from './services/onchain-notifications';
import type { INotification } from './types';
import type { UserStorage } from './types/user-storage/user-storage';
import * as Utils from './utils/utils';

// Mock type used for testing purposes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockVar = any;

const featureAnnouncementsEnv = {
  spaceId: ':space_id',
  accessToken: ':access_token',
  platform: 'extension' as const,
};

describe('metamask-notifications - constructor()', () => {
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
  ) => {
    messenger.publish(
      'KeyringController:stateChange',
      {} as KeyringControllerState,
      [],
    );
  };

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

  it('keyring Change Event but feature not enabled will not add or remove triggers', async () => {
    const { messenger, globalMessenger, mockListAccounts } = arrangeMocks();

    // initialize controller with 1 address
    mockListAccounts.mockResolvedValueOnce(['addr1']);
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const mockUpdate = jest
      .spyOn(controller, 'updateOnChainTriggersByAccount')
      .mockResolvedValue({} as UserStorage);
    const mockDelete = jest
      .spyOn(controller, 'deleteOnChainTriggersByAccount')
      .mockResolvedValue({} as UserStorage);

    // listAccounts has a new address
    mockListAccounts.mockResolvedValueOnce(['addr1', 'addr2']);
    await actPublishKeyringStateChange(globalMessenger);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('keyring Change Event with new triggers will update triggers correctly', async () => {
    const { messenger, globalMessenger, mockListAccounts } = arrangeMocks();

    // initialize controller with 1 address
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        isNotificationServicesEnabled: true,
        subscriptionAccountsSeen: ['addr1'],
      },
    });

    const mockUpdate = jest
      .spyOn(controller, 'updateOnChainTriggersByAccount')
      .mockResolvedValue({} as UserStorage);
    const mockDelete = jest
      .spyOn(controller, 'deleteOnChainTriggersByAccount')
      .mockResolvedValue({} as UserStorage);

    const act = async (addresses: string[], assertion: () => void) => {
      mockListAccounts.mockResolvedValueOnce(addresses);
      await actPublishKeyringStateChange(globalMessenger);
      await waitFor(() => {
        assertion();
      });

      // Clear mocks for next act/assert
      mockUpdate.mockClear();
      mockDelete.mockClear();
    };

    // Act - if list accounts has been seen, then will not update
    await act(['addr1'], () => {
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    // Act - if a new address in list, then will update
    await act(['addr1', 'addr2'], () => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    // Act - if the list doesn't have an address, then we need to delete
    await act(['addr2'], () => {
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
    });

    // If the address is added back to the list, because it is seen we won't update
    await act(['addr1', 'addr2'], () => {
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });

  it('initializes push notifications', async () => {
    const { messenger, mockEnablePushNotifications } = arrangeMocks();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    await waitFor(() => {
      expect(mockEnablePushNotifications).toHaveBeenCalled();
    });
  });

  it('fails to initialize push notifications', async () => {
    const { messenger, mockPerformGetStorage, mockEnablePushNotifications } =
      arrangeMocks();

    // test when user storage is empty
    mockPerformGetStorage.mockResolvedValue(null);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    await waitFor(() => {
      expect(mockPerformGetStorage).toHaveBeenCalled();
    });

    expect(mockEnablePushNotifications).not.toHaveBeenCalled();
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
      mockDisablePushNotifications,
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
    expect(mockDisablePushNotifications).toHaveBeenCalled();
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
    const MOCK_ACCOUNT = 'MOCK_ACCOUNT2';
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

  it('processes and shows feature announcements, wallet and snap notifications', async () => {
    const {
      messenger,
      mockFeatureAnnouncementAPIResult,
      mockListNotificationsAPIResult,
    } = arrangeMocks();

    const snapNotification = createMockSnapNotification();
    const processedSnapNotification = processSnapNotification(snapNotification);

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: {
        ...defaultState,
        isFeatureAnnouncementsEnabled: true,
        metamaskNotificationsList: [processedSnapNotification],
      },
    });

    const result = await controller.fetchAndUpdateMetamaskNotifications();

    // Should have 1 feature announcement and 1 wallet notification
    expect(result).toHaveLength(3);
    expect(
      result.find(
        (n) => n.id === mockFeatureAnnouncementAPIResult.items?.[0].fields.id,
      ),
    ).toBeDefined();
    expect(
      result.find((n) => n.id === mockListNotificationsAPIResult[0].id),
    ).toBeDefined();
    expect(result.find((n) => n.type === TRIGGER_TYPES.SNAP)).toBeDefined();

    // State is also updated
    expect(controller.state.metamaskNotificationsList).toHaveLength(3);
  });

  it('only fetches and processes feature announcements if not authenticated', async () => {
    const { messenger, mockGetBearerToken, mockFeatureAnnouncementAPIResult } =
      arrangeMocks();
    mockGetBearerToken.mockRejectedValue(
      new Error('MOCK - failed to get access token'),
    );

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { ...defaultState, isFeatureAnnouncementsEnabled: true },
    });

    // Should only have feature announcement
    const result = await controller.fetchAndUpdateMetamaskNotifications();
    expect(result).toHaveLength(1);
    expect(
      result.find(
        (n) => n.id === mockFeatureAnnouncementAPIResult.items?.[0].fields.id,
      ),
    ).toBeDefined();

    // State is also updated
    expect(controller.state.metamaskNotificationsList).toHaveLength(1);
  });
});

describe('metamask-notifications - getNotificationsByType', () => {
  it('can fetch notifications by their type', async () => {
    const { messenger } = mockNotificationMessenger();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const snapNotification = createMockSnapNotification();
    const featureAnnouncement = createMockFeatureAnnouncementRaw();

    await controller.updateMetamaskNotificationsList(
      snapNotification as INotification,
    );
    await controller.updateMetamaskNotificationsList(
      featureAnnouncement as INotification,
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

    return { ...messengerMocks, mockCreateOnChainTriggers };
  };

  it('create new notifications when switched on and no new notifications', async () => {
    const mocks = arrangeMocks();
    mocks.mockListAccounts.mockResolvedValue(['0xAddr1']);
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
    mocks.mockListAccounts.mockResolvedValue(['0xAddr1']);
    const userStorage = createMockFullUserStorage({ address: '0xAddr1' });
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
      state: { isNotificationServicesEnabled: true },
    });

    const promise = controller.disableNotificationServices();

    // Act - intermediate state
    expect(controller.state.isUpdatingMetamaskNotifications).toBe(true);

    await promise;

    // Act - final state
    expect(controller.state.isUpdatingMetamaskNotifications).toBe(false);
    expect(controller.state.isNotificationServicesEnabled).toBe(false);

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
    const snapNotification = createMockSnapNotification();
    await controller.updateMetamaskNotificationsList(
      snapNotification as INotification,
    );
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

// Type-Computation - we are extracting args and parameters from a generic type utility
// Thus this `AnyFunc` can be used to help constrain the generic parameters correctly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;
const typedMockAction = <Action extends { handler: AnyFunc }>() =>
  jest.fn<ReturnType<Action['handler']>, Parameters<Action['handler']>>();

/**
 * Jest Mock Utility - Mock Notification Messenger
 * @returns mock notification messenger and other messenger mocks
 */
function mockNotificationMessenger() {
  const globalMessenger = new ControllerMessenger<
    AllowedActions,
    AllowedEvents
  >();

  const messenger = globalMessenger.getRestricted({
    name: 'NotificationServicesController',
    allowedActions: [
      'KeyringController:getAccounts',
      'KeyringController:getState',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:isSignedIn',
      'NotificationServicesPushController:disablePushNotifications',
      'NotificationServicesPushController:enablePushNotifications',
      'NotificationServicesPushController:updateTriggerPushNotifications',
      'UserStorageController:getStorageKey',
      'UserStorageController:performGetStorage',
      'UserStorageController:performSetStorage',
      'UserStorageController:enableProfileSyncing',
    ],
    allowedEvents: [
      'KeyringController:stateChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NotificationServicesPushController:onNewNotifications',
    ],
  });

  const mockListAccounts =
    typedMockAction<KeyringControllerGetAccountsAction>().mockResolvedValue([]);

  const mockGetBearerToken =
    typedMockAction<AuthenticationController.AuthenticationControllerGetBearerToken>().mockResolvedValue(
      AuthenticationController.Mocks.MOCK_ACCESS_TOKEN,
    );

  const mockIsSignedIn =
    typedMockAction<AuthenticationController.AuthenticationControllerIsSignedIn>().mockReturnValue(
      true,
    );

  const mockDisablePushNotifications =
    typedMockAction<NotificationServicesPushControllerDisablePushNotifications>();

  const mockEnablePushNotifications =
    typedMockAction<NotificationServicesPushControllerEnablePushNotifications>();

  const mockUpdateTriggerPushNotifications =
    typedMockAction<NotificationServicesPushControllerUpdateTriggerPushNotifications>();

  const mockGetStorageKey =
    typedMockAction<UserStorageController.UserStorageControllerGetStorageKey>().mockResolvedValue(
      'MOCK_STORAGE_KEY',
    );

  const mockEnableProfileSyncing =
    typedMockAction<UserStorageController.UserStorageControllerEnableProfileSyncing>();

  const mockPerformGetStorage =
    typedMockAction<UserStorageController.UserStorageControllerPerformGetStorage>().mockResolvedValue(
      JSON.stringify(createMockFullUserStorage()),
    );

  const mockPerformSetStorage =
    typedMockAction<UserStorageController.UserStorageControllerPerformSetStorage>();

  jest.spyOn(messenger, 'call').mockImplementation((...args) => {
    const [actionType] = args;

    // This mock implementation does not have a nice discriminate union where types/parameters can be correctly inferred
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [, ...params]: any[] = args;

    if (actionType === 'KeyringController:getAccounts') {
      return mockListAccounts();
    }

    if (actionType === 'KeyringController:getState') {
      return { isUnlocked: true } as MockVar;
    }

    if (actionType === 'AuthenticationController:getBearerToken') {
      return mockGetBearerToken();
    }

    if (actionType === 'AuthenticationController:isSignedIn') {
      return mockIsSignedIn();
    }

    if (
      actionType ===
      'NotificationServicesPushController:disablePushNotifications'
    ) {
      return mockDisablePushNotifications(params[0]);
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

    if (actionType === 'UserStorageController:getStorageKey') {
      return mockGetStorageKey();
    }

    if (actionType === 'UserStorageController:enableProfileSyncing') {
      return mockEnableProfileSyncing();
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
    mockListAccounts,
    mockGetBearerToken,
    mockIsSignedIn,
    mockDisablePushNotifications,
    mockEnablePushNotifications,
    mockUpdateTriggerPushNotifications,
    mockGetStorageKey,
    mockPerformGetStorage,
    mockPerformSetStorage,
  };
}

/**
 * Jest Mock Utility - Mock Auth Failure Assertions
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
