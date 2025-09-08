import { Messenger } from '@metamask/base-controller';
import * as ControllerUtils from '@metamask/controller-utils';
import {
  KeyringTypes,
  type KeyringControllerGetStateAction,
  type KeyringControllerState,
} from '@metamask/keyring-controller';
import { AuthenticationController } from '@metamask/profile-sync-controller';
import log from 'loglevel';
import type nock from 'nock';

import { ADDRESS_1, ADDRESS_2 } from './__fixtures__/mockAddresses';
import {
  mockGetOnChainNotificationsConfig,
  mockUpdateOnChainNotifications,
  mockGetOnChainNotifications,
  mockFetchFeatureAnnouncementNotifications,
  mockMarkNotificationsAsRead,
  mockCreatePerpNotification,
} from './__fixtures__/mockServices';
import { waitFor } from './__fixtures__/test-utils';
import { TRIGGER_TYPES } from './constants';
import { createMockSnapNotification } from './mocks';
import {
  createMockFeatureAnnouncementAPIResult,
  createMockFeatureAnnouncementRaw,
} from './mocks/mock-feature-announcements';
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
import { notificationsConfigCache } from './services/notification-config-cache';
import type { INotification, OrderInput } from './types';
import type {
  NotificationServicesPushControllerDisablePushNotificationsAction,
  NotificationServicesPushControllerEnablePushNotificationsAction,
  NotificationServicesPushControllerSubscribeToNotificationsAction,
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

// Removing caches to avoid interference
const clearAPICache = () => {
  notificationsConfigCache.clear();
};

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
    mockKeyringControllerGetState.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          accounts: [],
          type: KeyringTypes.hd,
          metadata: {
            id: '123',
            name: '',
          },
        },
      ],
    });

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

    const mockEnable = jest
      .spyOn(controller, 'enableAccounts')
      .mockResolvedValue();
    const mockDisable = jest
      .spyOn(controller, 'disableAccounts')
      .mockResolvedValue();

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
      mockEnable.mockClear();
      mockDisable.mockClear();
    };

    return { act, mockEnable, mockDisable };
  };

  it('event KeyringController:stateChange will not add or remove triggers when feature is disabled', async () => {
    const { act, mockEnable, mockDisable } = await arrangeActAssertKeyringTest({
      isNotificationServicesEnabled: false,
    });

    // listAccounts has a new address
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockEnable).not.toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });
  });

  it('event KeyringController:stateChange will update notification triggers when keyring accounts change', async () => {
    const { act, mockEnable, mockDisable } = await arrangeActAssertKeyringTest({
      subscriptionAccountsSeen: [ADDRESS_1],
    });

    // Act - if list accounts has been seen, then will not update
    await act([ADDRESS_1], () => {
      expect(mockEnable).not.toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });

    // Act - if a new address in list, then will update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockEnable).toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });

    // Act - if the list doesn't have an address, then we need to delete
    await act([ADDRESS_2], () => {
      expect(mockEnable).not.toHaveBeenCalled();
      expect(mockDisable).toHaveBeenCalled();
    });

    // If the address is added back to the list, we will perform an update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockEnable).toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });
  });

  it('event KeyringController:stateChange will update only once when if the number of keyring accounts do not change', async () => {
    const { act, mockEnable, mockDisable } =
      await arrangeActAssertKeyringTest();

    // Act - First list of items, so will update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockEnable).toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });

    // Act - Since number of addresses in keyring has not changed, will not update
    await act([ADDRESS_1, ADDRESS_2], () => {
      expect(mockEnable).not.toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });
  });

  const arrangeActInitialisePushNotifications = (
    modifications?: (mocks: ReturnType<typeof arrangeMocks>) => void,
  ) => {
    // Arrange
    const mockAPIGetNotificationConfig = mockGetOnChainNotificationsConfig();
    const mocks = arrangeMocks();
    modifications?.(mocks);

    // Act
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    controller.init();

    return { ...mocks, mockAPIGetNotificationConfig };
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
      mockKeyringControllerGetState,
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
    mockKeyringControllerGetState.mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          accounts: ['0xde55a0F2591d7823486e211710f53dADdb173Cee'],
          type: KeyringTypes.hd,
        },
      ] as MockVar,
    });
    globalMessenger.publish('KeyringController:unlock');
    await waitFor(() => {
      expect(mockEnablePushNotifications).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockSubscribeToPushNotifications).not.toHaveBeenCalled();
    });
  });
});

// See /utils for more in-depth testing
describe('metamask-notifications - checkAccountsPresence()', () => {
  it('returns Record with accounts that have notifications enabled', async () => {
    const { messenger } = mockNotificationMessenger();
    const mockGetConfig = mockGetOnChainNotificationsConfig({
      status: 200,
      body: [
        { address: ADDRESS_1, enabled: true },
        { address: ADDRESS_2, enabled: false },
      ],
    });

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });
    const result = await controller.checkAccountsPresence([
      ADDRESS_1,
      ADDRESS_2,
    ]);

    expect(mockGetConfig.isDone()).toBe(true);
    expect(result).toStrictEqual({
      [ADDRESS_1]: true,
      [ADDRESS_2]: false,
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
  const arrangeMocks = (overrides?: { mockGetConfig: () => nock.Scope }) => {
    const messengerMocks = mockNotificationMessenger();
    const mockGetConfig =
      overrides?.mockGetConfig() ?? mockGetOnChainNotificationsConfig();
    const mockUpdateNotifications = mockUpdateOnChainNotifications();
    return {
      ...messengerMocks,
      mockGetConfig,
      mockUpdateNotifications,
    };
  };

  beforeEach(() => {
    clearAPICache();
  });

  it('create new triggers and push notifications if there are no existing notifications', async () => {
    const {
      messenger,
      mockEnablePushNotifications,
      mockGetConfig,
      mockUpdateNotifications,
    } = arrangeMocks({
      // Mock no existing notifications
      mockGetConfig: () =>
        mockGetOnChainNotificationsConfig({
          status: 200,
          body: [],
        }),
    });

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.createOnChainTriggers();

    expect(mockGetConfig.isDone()).toBe(true);
    expect(mockUpdateNotifications.isDone()).toBe(true);
    expect(mockEnablePushNotifications).toHaveBeenCalled();
  });

  it('does not register notifications when notifications already exist and not resetting (however does update push registrations)', async () => {
    const {
      messenger,
      mockEnablePushNotifications,
      mockGetConfig,
      mockUpdateNotifications,
    } = arrangeMocks({
      // Mock existing notifications
      mockGetConfig: () =>
        mockGetOnChainNotificationsConfig({
          status: 200,
          body: [{ address: ADDRESS_1, enabled: true }],
        }),
    });

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.createOnChainTriggers();

    expect(mockGetConfig.isDone()).toBe(true);
    expect(mockUpdateNotifications.isDone()).toBe(false); // we do not update notification subscriptions
    expect(mockEnablePushNotifications).toHaveBeenCalled(); // but we do lazily update push subscriptions
  });

  it('creates new triggers when resetNotifications is true even if notifications exist', async () => {
    const {
      messenger,
      mockEnablePushNotifications,
      mockGetConfig,
      mockUpdateNotifications,
    } = arrangeMocks({
      // Mock existing notifications
      mockGetConfig: () =>
        mockGetOnChainNotificationsConfig({
          status: 200,
          body: [{ address: ADDRESS_1, enabled: true }],
        }),
    });

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.createOnChainTriggers({ resetNotifications: true });

    expect(mockGetConfig.isDone()).toBe(true);
    expect(mockUpdateNotifications.isDone()).toBe(true);
    expect(mockEnablePushNotifications).toHaveBeenCalled();
  });

  it('throws if not given a valid auth & bearer token', async () => {
    const mocks = arrangeMocks();
    mockErrorLog();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const testScenarios = {
      ...arrangeFailureAuthAssertions(mocks),
    };

    for (const mockFailureAction of Object.values(testScenarios)) {
      mockFailureAction();
      await expect(controller.createOnChainTriggers()).rejects.toThrow(
        expect.any(Error),
      );
    }
  });
});

describe('metamask-notifications - disableAccounts()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    const mockUpdateNotifications = mockUpdateOnChainNotifications();
    return { ...messengerMocks, mockUpdateNotifications };
  };

  it('disables notifications for given accounts', async () => {
    const { messenger, mockUpdateNotifications } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.disableAccounts([ADDRESS_1]);

    expect(mockUpdateNotifications.isDone()).toBe(true);
  });

  it('throws errors when invalid auth', async () => {
    const mocks = arrangeMocks();
    mockErrorLog();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const testScenarios = {
      ...arrangeFailureAuthAssertions(mocks),
    };

    for (const mockFailureAction of Object.values(testScenarios)) {
      mockFailureAction();
      await expect(controller.disableAccounts([ADDRESS_1])).rejects.toThrow(
        expect.any(Error),
      );
    }
  });
});

describe('metamask-notifications - enableAccounts()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    const mockUpdateNotifications = mockUpdateOnChainNotifications();
    return { ...messengerMocks, mockUpdateNotifications };
  };

  it('enables notifications for given accounts', async () => {
    const { messenger, mockUpdateNotifications } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.enableAccounts([ADDRESS_1]);

    expect(mockUpdateNotifications.isDone()).toBe(true);
  });

  it('throws errors when invalid auth', async () => {
    const mocks = arrangeMocks();
    mockErrorLog();
    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    const testScenarios = {
      ...arrangeFailureAuthAssertions(mocks),
    };

    for (const mockFailureAction of Object.values(testScenarios)) {
      mockFailureAction();
      await expect(controller.enableAccounts([ADDRESS_1])).rejects.toThrow(
        expect.any(Error),
      );
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

    const mockNotificationConfigAPI = mockGetOnChainNotificationsConfig();

    const mockOnChainNotificationsAPIResult = [createMockNotificationEthSent()];
    const mockOnChainNotificationsAPI = mockGetOnChainNotifications({
      status: 200,
      body: mockOnChainNotificationsAPIResult,
    });

    return {
      ...messengerMocks,
      mockNotificationConfigAPI,
      mockFeatureAnnouncementAPIResult,
      mockFeatureAnnouncementsAPI,
      mockOnChainNotificationsAPIResult,
      mockOnChainNotificationsAPI,
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

  beforeEach(() => {
    clearAPICache();
  });

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
    expect(mocks.mockOnChainNotificationsAPI.isDone()).toBe(false);
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

  it('should handle errors gracefully when fetching notifications', async () => {
    const { messenger } = mockNotificationMessenger();

    // Mock APIs to fail
    mockFetchFeatureAnnouncementNotifications({ status: 500 });
    mockGetOnChainNotifications({ status: 500 });

    const controller = arrangeController(messenger);

    const result = await controller.fetchAndUpdateMetamaskNotifications();

    // Should still return empty array and not throw
    expect(Array.isArray(result)).toBe(true);
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

    // Should see 1 item in controller read state (feature announcement)
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
  const arrangeMocks = (overrides?: { mockGetConfig: () => nock.Scope }) => {
    const messengerMocks = mockNotificationMessenger();
    const mockGetConfig =
      overrides?.mockGetConfig() ?? mockGetOnChainNotificationsConfig();
    const mockUpdateNotifications = mockUpdateOnChainNotifications();

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

    return { ...messengerMocks, mockGetConfig, mockUpdateNotifications };
  };

  beforeEach(() => {
    clearAPICache();
  });

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

  it('create new notifications when switched on and no existing notifications', async () => {
    const mocks = arrangeMocks({
      // Mock no existing notifications
      mockGetConfig: () =>
        mockGetOnChainNotificationsConfig({ status: 200, body: [] }),
    });

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
    expect(mocks.mockGetConfig.isDone()).toBe(true);
    expect(mocks.mockUpdateNotifications.isDone()).toBe(true);
  });

  it('should not create new notification subscriptions when enabling an account that already has notifications', async () => {
    const mocks = arrangeMocks({
      // Mock existing notifications
      mockGetConfig: () =>
        mockGetOnChainNotificationsConfig({
          status: 200,
          body: [{ address: ADDRESS_1, enabled: true }],
        }),
    });

    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.enableMetamaskNotifications();

    expect(mocks.mockGetConfig.isDone()).toBe(true);
    expect(mocks.mockUpdateNotifications.isDone()).toBe(false);
  });
});

describe('metamask-notifications - disableNotificationServices()', () => {
  it('disable notifications and turn off push notifications', async () => {
    const { messenger, mockDisablePushNotifications } =
      mockNotificationMessenger();
    const controller = new NotificationServicesController({
      messenger,
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

    expect(mockDisablePushNotifications).toHaveBeenCalled();
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
    const mockGetConfig = mockGetOnChainNotificationsConfig({
      status: 200,
      body: [
        { address: ADDRESS_1, enabled: true },
        { address: ADDRESS_2, enabled: true },
      ],
    });
    return { ...messengerMocks, mockGetConfig };
  };

  it('calls push controller and enables notifications for accounts that have subscribed to notifications', async () => {
    const { messenger, mockGetConfig, mockEnablePushNotifications } =
      arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    // Act
    await controller.enablePushNotifications();

    // Assert
    expect(mockGetConfig.isDone()).toBe(true);
    expect(mockEnablePushNotifications).toHaveBeenCalledWith([
      ADDRESS_1,
      ADDRESS_2,
    ]);
  });

  it('handles errors gracefully when fetching notification config fails', async () => {
    const { messenger, mockEnablePushNotifications } =
      mockNotificationMessenger();

    // Mock API failure
    mockGetOnChainNotificationsConfig({ status: 500 });
    mockErrorLog();

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
      state: { isNotificationServicesEnabled: true },
    });

    // Should not throw error
    await controller.enablePushNotifications();
    expect(mockEnablePushNotifications).not.toHaveBeenCalled();
  });
});

describe('metamask-notifications - disablePushNotifications', () => {
  it('calls push controller to disable push notifications', async () => {
    const { messenger, mockDisablePushNotifications } =
      mockNotificationMessenger();
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

describe('metamask-notifications - sendPerpPlaceOrderNotification()', () => {
  const arrangeMocks = () => {
    const messengerMocks = mockNotificationMessenger();
    const mockCreatePerpAPI = mockCreatePerpNotification({
      status: 200,
      body: { success: true },
    });
    return { ...messengerMocks, mockCreatePerpAPI };
  };

  const mockOrderInput: OrderInput = {
    user_id: '0x111', // User Address
    coin: '0x222', // Asset address
  };

  it('should successfully send perp order notification when authenticated', async () => {
    const { messenger, mockCreatePerpAPI } = arrangeMocks();
    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.sendPerpPlaceOrderNotification(mockOrderInput);

    expect(mockCreatePerpAPI.isDone()).toBe(true);
  });

  it('should handle authentication errors gracefully', async () => {
    const mocks = arrangeMocks();
    mocks.mockIsSignedIn.mockReturnValue(false);

    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.sendPerpPlaceOrderNotification(mockOrderInput);

    expect(mocks.mockCreatePerpAPI.isDone()).toBe(false);
  });

  it('should handle bearer token retrieval errors gracefully', async () => {
    const mocks = arrangeMocks();
    mocks.mockGetBearerToken.mockRejectedValueOnce(
      new Error('Failed to get bearer token'),
    );

    const controller = new NotificationServicesController({
      messenger: mocks.messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.sendPerpPlaceOrderNotification(mockOrderInput);

    expect(mocks.mockCreatePerpAPI.isDone()).toBe(false);
  });

  it('should handle API call failures gracefully', async () => {
    const { messenger } = mockNotificationMessenger();
    // Mock API to fail
    const mockCreatePerpAPI = mockCreatePerpNotification({ status: 500 });
    const mockConsoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(jest.fn());

    const controller = new NotificationServicesController({
      messenger,
      env: { featureAnnouncements: featureAnnouncementsEnv },
    });

    await controller.sendPerpPlaceOrderNotification(mockOrderInput);
    expect(mockCreatePerpAPI.isDone()).toBe(true);
    expect(mockConsoleError).toHaveBeenCalled();
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
      'NotificationServicesPushController:subscribeToPushNotifications',
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
      ['New Access Token'],
    );

  const mockDisablePushNotifications =
    typedMockAction<NotificationServicesPushControllerDisablePushNotificationsAction>();

  const mockEnablePushNotifications =
    typedMockAction<NotificationServicesPushControllerEnablePushNotificationsAction>();

  const mockSubscribeToPushNotifications =
    typedMockAction<NotificationServicesPushControllerSubscribeToNotificationsAction>();

  const mockKeyringControllerGetState =
    typedMockAction<KeyringControllerGetStateAction>().mockReturnValue({
      isUnlocked: true,
      keyrings: [
        {
          accounts: ['0xde55a0F2591d7823486e211710f53dADdb173Cee'],
          type: KeyringTypes.hd,
        },
      ],
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
      'NotificationServicesPushController:subscribeToPushNotifications'
    ) {
      return mockSubscribeToPushNotifications();
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
    mockSubscribeToPushNotifications,
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
