import type {
  AuthenticatedUserStorageServiceGetNotificationPreferencesAction,
  AuthenticatedUserStorageServicePutNotificationPreferencesAction,
  NotificationPreferences,
} from '@metamask/authenticated-user-storage';
import { deriveStateFromMetadata } from '@metamask/base-controller';
import * as ControllerUtils from '@metamask/controller-utils';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerState,
} from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { AuthenticationController } from '@metamask/profile-sync-controller';
import log from 'loglevel';
import type nock from 'nock';

import type {
  NotificationServicesPushControllerAddPushNotificationLinksAction,
  NotificationServicesPushControllerDisablePushNotificationsAction,
  NotificationServicesPushControllerDeletePushNotificationLinksAction,
  NotificationServicesPushControllerEnablePushNotificationsAction,
  NotificationServicesPushControllerSubscribeToPushNotificationsAction,
} from '../NotificationServicesPushController/index.js';
import {
  ADDRESS_1,
  ADDRESS_2,
  ADDRESS_3,
} from './__fixtures__/mockAddresses.js';
import {
  mockGetOnChainNotificationsConfig,
  mockUpdateOnChainNotifications,
  mockGetAPINotifications,
  mockFetchFeatureAnnouncementNotifications,
  mockMarkNotificationsAsRead,
  mockCreatePerpNotification,
} from './__fixtures__/mockServices.js';
import { waitFor } from './__fixtures__/test-utils.js';
import { TRIGGER_TYPES } from './constants/index.js';
import { createMockSnapNotification } from './mocks/index.js';
import {
  createMockFeatureAnnouncementAPIResult,
  createMockFeatureAnnouncementRaw,
} from './mocks/mock-feature-announcements.js';
import { createMockNotificationEthSent } from './mocks/mock-raw-notifications.js';
import {
  DEFAULT_AGENTIC_CLI_PREFERENCES,
  DEFAULT_PERPS_PREFERENCES,
  DEFAULT_PRICE_ALERT_PREFERENCES,
  DEFAULT_SOCIAL_AI_PREFERENCES,
  NotificationServicesController,
  ACCOUNTS_UPDATE_DEBOUNCE_TIME_MS,
  defaultState,
} from './NotificationServicesController.js';
import type {
  NotificationServicesControllerMessenger,
  NotificationServicesControllerState,
} from './NotificationServicesController.js';
import { processFeatureAnnouncement } from './processors/index.js';
import { processNotification } from './processors/process-notifications.js';
import { processSnapNotification } from './processors/process-snap-notifications.js';
import { notificationsConfigCache } from './services/notification-config-cache.js';
import type { INotification, OrderInput } from './types/index.js';

// Mock type used for testing purposes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockVar = any;

const featureAnnouncementsEnv = {
  spaceId: ':space_id',
  accessToken: ':access_token',
  platform: 'extension' as const,
};

// Testing util to clean up verbose logs when testing errors
const mockErrorLog = (): jest.SpyInstance =>
  jest.spyOn(log, 'error').mockImplementation(jest.fn());
const mockWarnLog = (): jest.SpyInstance =>
  jest.spyOn(log, 'warn').mockImplementation(jest.fn());

// Removing caches to avoid interference
const clearAPICache = (): void => {
  notificationsConfigCache.clear();
};

// An initialized preferences blob. `walletActivity.accounts` is always empty:
// wallet-activity addresses come from the keyring and their enabled state from
// the Trigger API, never from here.
const mockPreferences = (
  overrides?: Partial<NotificationPreferences>,
): NotificationPreferences => ({
  walletActivity: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
    accounts: [],
  },
  marketing: {
    inAppNotificationsEnabled: false,
    pushNotificationsEnabled: false,
  },
  perps: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
  },
  socialAI: {
    inAppNotificationsEnabled: true,
    pushNotificationsEnabled: true,
    mutedTraderProfileIds: [],
  },
  agenticCli: { ...DEFAULT_AGENTIC_CLI_PREFERENCES },
  priceAlerts: { ...DEFAULT_PRICE_ALERT_PREFERENCES },
  ...overrides,
});

const mockPreferencesWithMarketingInApp = (
  inAppNotificationsEnabled: boolean,
): NotificationPreferences =>
  mockPreferences({
    marketing: {
      inAppNotificationsEnabled,
      pushNotificationsEnabled: false,
    },
  });

describe('NotificationServicesController', () => {
  afterEach(() => {
    clearAPICache();
  });

  describe('constructor', () => {
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
          isNotificationServicesEnabled: true,
        },
      });
      expect(controller2.state.isNotificationServicesEnabled).toBe(true);
    });
  });

  describe('init', () => {
    const arrangeMocks = (): ReturnType<typeof mockNotificationMessenger> => {
      const messengerMocks = mockNotificationMessenger();
      jest
        .spyOn(ControllerUtils, 'toChecksumHexAddress')
        .mockImplementation((address) => address);

      return messengerMocks;
    };

    const actPublishKeyringStateChange = async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messenger: any,
      accounts: string[] = ['0x111', '0x222'],
    ): Promise<void> => {
      messenger.publish(
        'KeyringController:stateChange',
        {
          keyrings: [{ accounts }],
        } as KeyringControllerState,
        [],
      );
    };

    describe('KeyringController:stateChange (debounced)', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      const arrangeActAssertKeyringTest = async (
        controllerState?: Partial<NotificationServicesControllerState>,
      ): Promise<{
        act: (addresses: string[], assertion: () => void) => Promise<void>;
        actMultiple: (
          addressesEvents: string[][],
          assertion: () => void,
        ) => Promise<void>;
        mockEnable: jest.SpyInstance;
        mockDisable: jest.SpyInstance;
      }> => {
        const mocks = arrangeMocks();
        const { messenger, globalMessenger, mockKeyringControllerGetState } =
          mocks;
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
        await jest.advanceTimersByTimeAsync(ACCOUNTS_UPDATE_DEBOUNCE_TIME_MS);

        const mockEnable = jest
          .spyOn(controller, 'enableAccounts')
          .mockResolvedValue();
        const mockDisable = jest
          .spyOn(controller, 'disableAccounts')
          .mockResolvedValue();

        const mockKeyringState = (addresses: string[]): void => {
          mockKeyringControllerGetState.mockReturnValue({
            isUnlocked: true,
            keyrings: [
              {
                accounts: addresses,
                type: KeyringTypes.hd,
              },
            ],
          });
        };

        const cleanup = (): void => {
          mockEnable.mockClear();
          mockDisable.mockClear();
        };

        const act = async (
          addresses: string[],
          assertion: () => void,
        ): Promise<void> => {
          mockKeyringState(addresses);

          await actPublishKeyringStateChange(globalMessenger, addresses);
          await jest.advanceTimersByTimeAsync(ACCOUNTS_UPDATE_DEBOUNCE_TIME_MS);
          assertion();

          // Cleanup mocks for next act/assert
          cleanup();
        };

        const actMultiple = async (
          addressesEvents: string[][],
          assertion: () => void,
        ): Promise<void> => {
          for (const addresses of addressesEvents) {
            mockKeyringState(addresses);
            await actPublishKeyringStateChange(globalMessenger, addresses);
          }

          await jest.advanceTimersByTimeAsync(ACCOUNTS_UPDATE_DEBOUNCE_TIME_MS);
          assertion();

          // Cleanup mocks for next act/assert
          cleanup();
        };

        return { act, actMultiple, mockEnable, mockDisable };
      };

      it('event KeyringController:stateChange will not add or remove triggers when feature is disabled', async () => {
        const { act, mockEnable, mockDisable } =
          await arrangeActAssertKeyringTest({
            isNotificationServicesEnabled: false,
          });

        // listAccounts has a new address
        await act([ADDRESS_1, ADDRESS_2], () => {
          expect(mockEnable).not.toHaveBeenCalled();
          expect(mockDisable).not.toHaveBeenCalled();
        });
      });

      it('event KeyringController:stateChange will update notification triggers when keyring accounts change', async () => {
        const { act, mockEnable, mockDisable } =
          await arrangeActAssertKeyringTest({
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

      it('event KeyringController:stateChange will only update notifications once when the number of keyring accounts changes multiple times', async () => {
        const { actMultiple, mockEnable, mockDisable } =
          await arrangeActAssertKeyringTest();

        await actMultiple(
          [
            // Event 1
            [ADDRESS_1],

            // Event 2
            [ADDRESS_1, ADDRESS_2],

            // Event 3
            [ADDRESS_1, ADDRESS_2, ADDRESS_3],
          ],
          () => {
            expect(mockEnable).toHaveBeenCalledTimes(1);
            expect(mockEnable).toHaveBeenCalledWith([
              ADDRESS_1,
              ADDRESS_2,
              ADDRESS_3,
            ]);
            expect(mockDisable).not.toHaveBeenCalled();
          },
        );
      });
    });

    const arrangeActInitialisePushNotifications = (
      modifications?: (mocks: ReturnType<typeof arrangeMocks>) => void,
    ): ReturnType<typeof arrangeMocks> & {
      mockAPIGetNotificationConfig: jest.Mock;
    } => {
      // Arrange
      const mocks = arrangeMocks();
      const mockAPIGetNotificationConfig = mocks.mockGetNotificationPreferences;
      // Supplies the enabled wallet-activity addresses that push registers for.
      mockGetOnChainNotificationsConfig().persist();
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

    it('queues one re-fetch (not concurrent) when pushes arrive while a fetch is in-flight', async () => {
      const mocks = arrangeMocks();
      let resolveFetch!: (v: INotification[]) => void;
      const controller = new NotificationServicesController({
        messenger: mocks.messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
        state: { isNotificationServicesEnabled: true },
      });
      controller.init();

      const fetchSpy = jest
        .spyOn(controller, 'fetchAndUpdateMetamaskNotifications')
        .mockImplementationOnce(
          () =>
            new Promise<INotification[]>((resolve) => {
              resolveFetch = resolve;
            }),
        )
        .mockResolvedValue([]);

      // First push — starts the in-flight fetch
      mocks.globalMessenger.publish(
        'NotificationServicesPushController:onNewNotifications',
        [],
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Second and third pushes arrive while fetch is still in-flight — both coalesced into one pending refetch
      mocks.globalMessenger.publish(
        'NotificationServicesPushController:onNewNotifications',
        [],
      );
      mocks.globalMessenger.publish(
        'NotificationServicesPushController:onNewNotifications',
        [],
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Resolve the first fetch — should trigger exactly one queued re-fetch
      resolveFetch([]);
      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      });
    });
  });

  // See /utils for more in-depth testing
  describe('checkAccountsPresence', () => {
    it('returns Record with accounts that have notifications enabled', async () => {
      const mocks = mockNotificationMessenger();
      const mockTriggerQuery = mockGetOnChainNotificationsConfig({
        status: 200,
        body: [
          { address: ADDRESS_1.toLowerCase(), enabled: true },
          { address: ADDRESS_2.toLowerCase(), enabled: false },
        ],
      });

      const controller = new NotificationServicesController({
        messenger: mocks.messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });
      const result = await controller.checkAccountsPresence([
        ADDRESS_1,
        ADDRESS_2,
      ]);

      expect(mockTriggerQuery.isDone()).toBe(true);
      expect(result).toStrictEqual({
        [ADDRESS_1]: true,
        [ADDRESS_2]: false,
      });
    });

    it('reports accounts the Trigger API does not know about as disabled', async () => {
      const mocks = mockNotificationMessenger();
      mockGetOnChainNotificationsConfig({
        status: 200,
        body: [{ address: ADDRESS_1.toLowerCase(), enabled: true }],
      });

      const controller = new NotificationServicesController({
        messenger: mocks.messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });
      const result = await controller.checkAccountsPresence([
        ADDRESS_1,
        ADDRESS_3,
      ]);

      expect(result).toStrictEqual({
        [ADDRESS_1]: true,
        [ADDRESS_3]: false,
      });
    });

    it('throws rather than reporting every account as disabled when the Trigger API is unreadable', async () => {
      const mocks = mockNotificationMessenger();
      mockErrorLog();
      mockGetOnChainNotificationsConfig({
        status: 500,
        body: { error: 'mock api failure' },
      });

      const controller = new NotificationServicesController({
        messenger: mocks.messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      await expect(
        controller.checkAccountsPresence([ADDRESS_1, ADDRESS_2]),
      ).rejects.toThrow('Failed to read wallet-activity subscriptions');
      expect(controller.state.isCheckingAccountsPresence).toBe(false);
    });
  });

  describe('createOnChainTriggers', () => {
    const arrangeMocks = (overrides?: {
      configurePrefs?: (mock: jest.Mock) => void;
    }): ReturnType<typeof mockNotificationMessenger> & {
      mockGetConfig: jest.Mock;
      mockUpdateNotifications: jest.Mock;
    } => {
      const messengerMocks = mockNotificationMessenger();
      const mockGetConfig = messengerMocks.mockGetNotificationPreferences;
      const mockUpdateNotifications =
        messengerMocks.mockPutNotificationPreferences;
      overrides?.configurePrefs?.(mockGetConfig);
      return {
        ...messengerMocks,
        mockGetConfig,
        mockUpdateNotifications,
      };
    };

    describe('when AUS preferences are not initialized (preferences are null)', () => {
      it('writes a fresh preferences blob using hardcoded defaults, no wallet-activity addresses, and supplied marketing flags', async () => {
        const {
          messenger,
          mockEnablePushNotifications,
          mockGetConfig,
          mockUpdateNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1, ADDRESS_2],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
          ],
        });
        const mockTriggerQuery = mockGetOnChainNotificationsConfig({
          status: 200,
          body: [
            { address: ADDRESS_1.toLowerCase(), enabled: true },
            { address: ADDRESS_2.toLowerCase(), enabled: false },
          ],
        });

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers({
          hasMarketingConsent: true,
          productAnnouncementEnabled: false,
        });

        expect(mockGetConfig).toHaveBeenCalled();
        expect(mockTriggerQuery.isDone()).toBe(true);
        expect(mockUpdateNotifications).toHaveBeenCalledTimes(1);
        const [writtenPrefs, writtenPlatform] =
          mockUpdateNotifications.mock.calls[0];
        expect(writtenPlatform).toBe(featureAnnouncementsEnv.platform);
        expect(writtenPrefs).toStrictEqual({
          walletActivity: {
            inAppNotificationsEnabled: true,
            pushNotificationsEnabled: true,
            accounts: [],
          },
          marketing: {
            inAppNotificationsEnabled: false,
            pushNotificationsEnabled: true,
          },
          perps: { ...DEFAULT_PERPS_PREFERENCES },
          socialAI: { ...DEFAULT_SOCIAL_AI_PREFERENCES },
          agenticCli: { ...DEFAULT_AGENTIC_CLI_PREFERENCES },
          priceAlerts: { ...DEFAULT_PRICE_ALERT_PREFERENCES },
        });
        // Only the address the Trigger API reports as enabled.
        expect(mockEnablePushNotifications).toHaveBeenCalledWith([
          ADDRESS_1.toLowerCase(),
        ]);
      });

      it('skips push registration when registerPushNotifications is false', async () => {
        const {
          messenger,
          mockEnablePushNotifications,
          mockGetConfig,
          mockUpdateNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
          ],
        });
        const mockTriggerQuery = mockGetOnChainNotificationsConfig();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers({
          registerPushNotifications: false,
        });

        expect(mockGetConfig).toHaveBeenCalled();
        expect(mockTriggerQuery.isDone()).toBe(true);
        expect(mockUpdateNotifications).toHaveBeenCalled();
        expect(controller.state.isNotificationServicesEnabled).toBe(true);
        expect(mockEnablePushNotifications).not.toHaveBeenCalled();
      });

      it('subscribes all keyring accounts in the Trigger API when none are subscribed yet', async () => {
        const {
          messenger,
          mockEnablePushNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1, ADDRESS_2],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
          ],
        });
        const mockTriggerQuery = mockGetOnChainNotificationsConfig({
          status: 200,
          body: [
            { address: ADDRESS_1.toLowerCase(), enabled: false },
            { address: ADDRESS_2.toLowerCase(), enabled: false },
          ],
        });
        const mockTriggerUpdate = mockUpdateOnChainNotifications();
        let subscribeBody: unknown;
        mockTriggerUpdate.on('request', (_req, _interceptor, body) => {
          subscribeBody = JSON.parse(body as string);
        });

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        expect(mockTriggerQuery.isDone()).toBe(true);
        expect(mockTriggerUpdate.isDone()).toBe(true);
        expect(subscribeBody).toStrictEqual([
          { address: ADDRESS_1.toLowerCase(), enabled: true },
          { address: ADDRESS_2.toLowerCase(), enabled: true },
        ]);
        // The keyring reports checksummed addresses, but push registration
        // must get the same lower-case form the Trigger API echoes back.
        expect(mockEnablePushNotifications).toHaveBeenCalledWith([
          ADDRESS_1.toLowerCase(),
          ADDRESS_2.toLowerCase(),
        ]);
      });

      it('fails without subscribing anything when the Trigger API config cannot be read', async () => {
        const {
          messenger,
          mockEnablePushNotifications,
          mockDisablePushNotifications,
          mockUpdateNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1, ADDRESS_2],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
          ],
        });
        mockGetOnChainNotificationsConfig({
          status: 500,
          body: { error: 'mock api failure' },
        });
        const mockTriggerUpdate = mockUpdateOnChainNotifications();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await expect(controller.createOnChainTriggers()).rejects.toThrow(
          'Failed to create On Chain triggers',
        );

        expect(mockTriggerUpdate.isDone()).toBe(false);
        expect(mockEnablePushNotifications).not.toHaveBeenCalled();
        expect(mockDisablePushNotifications).not.toHaveBeenCalled();
        // No preferences blob, so a retry is still treated as a first-time
        // setup and can seed the subscriptions this run failed to create.
        expect(mockUpdateNotifications).not.toHaveBeenCalled();
      });

      it('leaves existing Trigger API subscriptions alone, so previously disabled accounts stay disabled', async () => {
        const {
          messenger,
          mockEnablePushNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1, ADDRESS_2],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
          ],
        });
        mockGetOnChainNotificationsConfig({
          status: 200,
          body: [
            { address: ADDRESS_1.toLowerCase(), enabled: true },
            { address: ADDRESS_2.toLowerCase(), enabled: false },
          ],
        });
        const mockTriggerUpdate = mockUpdateOnChainNotifications();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        expect(mockTriggerUpdate.isDone()).toBe(false);
        expect(mockEnablePushNotifications).toHaveBeenCalledWith([
          ADDRESS_1.toLowerCase(),
        ]);
      });

      it('defaults marketing notifications to disabled when no consent is supplied', async () => {
        const { messenger, mockUpdateNotifications } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });
        mockGetOnChainNotificationsConfig();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        const [writtenPrefs] = mockUpdateNotifications.mock.calls[0];
        expect(writtenPrefs.marketing).toStrictEqual({
          inAppNotificationsEnabled: false,
          pushNotificationsEnabled: false,
        });
      });

      it('enables marketing in-app notifications when product announcements are enabled', async () => {
        const { messenger, mockUpdateNotifications } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });
        mockGetOnChainNotificationsConfig();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers({
          productAnnouncementEnabled: true,
        });

        const [writtenPrefs] = mockUpdateNotifications.mock.calls[0];
        expect(writtenPrefs.marketing).toStrictEqual({
          inAppNotificationsEnabled: true,
          pushNotificationsEnabled: false,
        });
      });

      it('tracks accounts from all keyrings when creating triggers', async () => {
        const {
          messenger,
          mockGetConfig,
          mockUpdateNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
            {
              accounts: [ADDRESS_2],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-2', name: 'SRP 2' },
            },
          ],
        });
        const mockTriggerQuery = mockGetOnChainNotificationsConfig({
          status: 200,
          body: [
            { address: ADDRESS_1.toLowerCase(), enabled: true },
            { address: ADDRESS_2.toLowerCase(), enabled: true },
          ],
        });

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        expect(mockGetConfig).toHaveBeenCalled();
        expect(mockTriggerQuery.isDone()).toBe(true);
        expect(mockUpdateNotifications).toHaveBeenCalled();
        expect(controller.state.subscriptionAccountsSeen).toStrictEqual([
          ADDRESS_1,
          ADDRESS_2,
        ]);
      });

      it('deduplicates and filters non-Ethereum accounts when creating triggers', async () => {
        const {
          messenger,
          mockGetConfig,
          mockUpdateNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1, ADDRESS_1.toLowerCase(), 'NotAnAddress'],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
            {
              accounts: [
                ADDRESS_2,
                '7xKXtg2CW6y7J2wMmkf8VbM8dYb6u3H3V8bLxT64d4oR',
              ],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-2', name: 'SRP 2' },
            },
          ],
        });
        const mockTriggerQuery = mockGetOnChainNotificationsConfig({
          status: 200,
          body: [
            { address: ADDRESS_1.toLowerCase(), enabled: true },
            { address: ADDRESS_2.toLowerCase(), enabled: true },
          ],
        });

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        expect(mockGetConfig).toHaveBeenCalled();
        expect(mockTriggerQuery.isDone()).toBe(true);
        expect(mockUpdateNotifications).toHaveBeenCalled();
        expect(controller.state.subscriptionAccountsSeen).toStrictEqual([
          ADDRESS_1,
          ADDRESS_2,
        ]);
      });

      it('normalizes non-checksummed mixed-case addresses before filtering', async () => {
        const {
          messenger,
          mockGetConfig,
          mockUpdateNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
        });

        const nonChecksummedMixedCaseAddress =
          '0xd8Da6bf26964af9d7eeD9e03E53415D37aa96045';

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [nonChecksummedMixedCaseAddress],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
          ],
        });
        const mockTriggerQuery = mockGetOnChainNotificationsConfig({
          status: 200,
          body: [{ address: ADDRESS_1.toLowerCase(), enabled: true }],
        });

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        expect(mockGetConfig).toHaveBeenCalled();
        expect(mockTriggerQuery.isDone()).toBe(true);
        expect(mockUpdateNotifications).toHaveBeenCalled();
        expect(controller.state.subscriptionAccountsSeen).toStrictEqual([
          ADDRESS_1,
        ]);
      });
    });

    describe('when AUS preferences are fully initialized', () => {
      it('does not register notifications when notifications already exist and not resetting (however does update push registrations)', async () => {
        const {
          messenger,
          mockEnablePushNotifications,
          mockGetConfig,
          mockUpdateNotifications,
        } = arrangeMocks({
          configurePrefs: (mock) =>
            mock.mockResolvedValueOnce(mockPreferences()),
        });
        mockGetOnChainNotificationsConfig();
        const mockTriggerUpdate = mockUpdateOnChainNotifications();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        expect(mockGetConfig).toHaveBeenCalled();
        expect(mockUpdateNotifications).not.toHaveBeenCalled();
        expect(mockTriggerUpdate.isDone()).toBe(false);
        expect(mockEnablePushNotifications).toHaveBeenCalled();
      });

      it('does not re-subscribe accounts on the daily re-subscribe when the user disabled them all', async () => {
        const {
          messenger,
          mockDisablePushNotifications,
          mockEnablePushNotifications,
          mockKeyringControllerGetState,
        } = arrangeMocks({
          configurePrefs: (mock) =>
            mock.mockResolvedValueOnce(mockPreferences()),
        });

        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: [
            {
              accounts: [ADDRESS_1, ADDRESS_2],
              type: KeyringTypes.hd,
              metadata: { id: 'srp-1', name: 'SRP 1' },
            },
          ],
        });
        mockGetOnChainNotificationsConfig({
          status: 200,
          body: [
            { address: ADDRESS_1.toLowerCase(), enabled: false },
            { address: ADDRESS_2.toLowerCase(), enabled: false },
          ],
        });
        const mockTriggerUpdate = mockUpdateOnChainNotifications();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        expect(mockTriggerUpdate.isDone()).toBe(false);
        // No addresses to register, so the device is unregistered rather than
        // sent an empty list the push API would reject.
        await waitFor(() => {
          expect(mockDisablePushNotifications).toHaveBeenCalled();
        });
        expect(mockEnablePushNotifications).not.toHaveBeenCalled();
      });

      it('ignores the legacy wallet-activity push toggle when registering push notifications', async () => {
        const { messenger, mockEnablePushNotifications } = arrangeMocks({
          configurePrefs: (mock) =>
            mock.mockResolvedValueOnce(
              mockPreferences({
                walletActivity: {
                  inAppNotificationsEnabled: true,
                  pushNotificationsEnabled: false,
                  accounts: [],
                },
              }),
            ),
        });
        mockGetOnChainNotificationsConfig();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
        });

        await controller.createOnChainTriggers();

        await waitFor(() => {
          expect(mockEnablePushNotifications).toHaveBeenCalled();
        });
      });

      it('preserves user preferences when re-subscribing using enableMetamaskNotifications', async () => {
        const {
          messenger,
          mockEnablePushNotifications,
          mockGetConfig,
          mockUpdateNotifications,
        } = arrangeMocks({
          configurePrefs: (mock) =>
            mock.mockResolvedValueOnce(mockPreferences()),
        });
        mockGetOnChainNotificationsConfig();

        const controller = new NotificationServicesController({
          messenger,
          env: { featureAnnouncements: featureAnnouncementsEnv },
          state: {
            isNotificationServicesEnabled: true,
            isFeatureAnnouncementsEnabled: false,
          },
        });

        await controller.enableMetamaskNotifications();

        expect(controller.state.isFeatureAnnouncementsEnabled).toBe(false);
        expect(controller.state.isNotificationServicesEnabled).toBe(true);
        expect(mockGetConfig).toHaveBeenCalled();
        expect(mockUpdateNotifications).not.toHaveBeenCalled();
        expect(mockEnablePushNotifications).toHaveBeenCalled();
      });
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

  describe('disableAccounts', () => {
    const arrangeMocks = (): ReturnType<typeof mockNotificationMessenger> & {
      mockTriggerUpdate: nock.Scope;
      getRequestBody: () => unknown;
    } => {
      const messengerMocks = mockNotificationMessenger();
      const mockTriggerUpdate = mockUpdateOnChainNotifications();
      let requestBody: unknown;
      mockTriggerUpdate.on('request', (_req, _interceptor, body) => {
        requestBody = JSON.parse(body as string);
      });
      return {
        ...messengerMocks,
        mockTriggerUpdate,
        getRequestBody: () => requestBody,
      };
    };

    it('disables notifications for given accounts', async () => {
      const {
        messenger,
        mockTriggerUpdate,
        getRequestBody,
        mockDeletePushNotificationLinks,
        mockPutNotificationPreferences,
      } = arrangeMocks();
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      await controller.disableAccounts([ADDRESS_1]);

      expect(mockTriggerUpdate.isDone()).toBe(true);
      expect(getRequestBody()).toStrictEqual([
        { address: ADDRESS_1.toLowerCase(), enabled: false },
      ]);
      expect(mockDeletePushNotificationLinks).toHaveBeenCalledWith([ADDRESS_1]);
      // Subscriptions live in the Trigger API, so AUS is left untouched.
      expect(mockPutNotificationPreferences).not.toHaveBeenCalled();
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

  describe('enableAccounts', () => {
    const arrangeMocks = (): ReturnType<typeof mockNotificationMessenger> & {
      mockTriggerUpdate: nock.Scope;
      getRequestBody: () => unknown;
    } => {
      const messengerMocks = mockNotificationMessenger();
      const mockTriggerUpdate = mockUpdateOnChainNotifications();
      let requestBody: unknown;
      mockTriggerUpdate.on('request', (_req, _interceptor, body) => {
        requestBody = JSON.parse(body as string);
      });
      return {
        ...messengerMocks,
        mockTriggerUpdate,
        getRequestBody: () => requestBody,
      };
    };

    it('enables notifications for given accounts', async () => {
      const {
        messenger,
        mockAddPushNotificationLinks,
        mockTriggerUpdate,
        getRequestBody,
        mockPutNotificationPreferences,
      } = arrangeMocks();
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      await controller.enableAccounts([ADDRESS_1]);

      expect(mockTriggerUpdate.isDone()).toBe(true);
      expect(getRequestBody()).toStrictEqual([
        { address: ADDRESS_1.toLowerCase(), enabled: true },
      ]);
      expect(mockAddPushNotificationLinks).toHaveBeenCalledWith([ADDRESS_1]);
      // Subscriptions live in the Trigger API, so AUS is left untouched.
      expect(mockPutNotificationPreferences).not.toHaveBeenCalled();
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

  describe('fetchAndUpdateMetamaskNotifications', () => {
    const arrangeMocks = (): ReturnType<typeof mockNotificationMessenger> & {
      mockFeatureAnnouncementAPIResult: ReturnType<
        typeof createMockFeatureAnnouncementAPIResult
      >;
      mockFeatureAnnouncementsAPI: nock.Scope;
      mockOnChainNotificationsAPIResult: ReturnType<
        typeof createMockNotificationEthSent
      >[];
      mockOnChainNotificationsAPI: nock.Scope;
    } => {
      const messengerMocks = mockNotificationMessenger();
      messengerMocks.mockGetNotificationPreferences.mockResolvedValue(
        mockPreferencesWithMarketingInApp(true),
      );
      // Supplies the enabled wallet-activity addresses.
      mockGetOnChainNotificationsConfig();

      const mockFeatureAnnouncementAPIResult =
        createMockFeatureAnnouncementAPIResult();
      const mockFeatureAnnouncementsAPI =
        mockFetchFeatureAnnouncementNotifications({
          status: 200,
          body: mockFeatureAnnouncementAPIResult,
        });

      const mockOnChainNotificationsAPIResult = [
        createMockNotificationEthSent(),
      ];
      const mockOnChainNotificationsAPI = mockGetAPINotifications({
        status: 200,
        body: mockOnChainNotificationsAPIResult,
      });

      return {
        ...messengerMocks,
        mockFeatureAnnouncementAPIResult,
        mockFeatureAnnouncementsAPI,
        mockOnChainNotificationsAPIResult,
        mockOnChainNotificationsAPI,
      };
    };

    const arrangeController = (
      messenger: NotificationServicesControllerMessenger,
      overrideState?: Partial<NotificationServicesControllerState>,
    ): NotificationServicesController => {
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
        result.filter(
          (notification) =>
            notification.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT,
        ),
      ).toHaveLength(1);

      // Should have 1 Wallet Notification
      expect(
        result.filter(
          (notification) => notification.type === TRIGGER_TYPES.ETH_SENT,
        ),
      ).toHaveLength(1);

      // Should have 1 Snap Notification
      expect(
        result.filter(
          (notification) => notification.type === TRIGGER_TYPES.SNAP,
        ),
      ).toHaveLength(1);

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
      expect(
        result.filter(
          (notification) => notification.type === TRIGGER_TYPES.SNAP,
        ),
      ).toHaveLength(1);

      // APIs should not have been called
      expect(mocks.mockFeatureAnnouncementsAPI.isDone()).toBe(false);
      expect(mocks.mockOnChainNotificationsAPI.isDone()).toBe(false);
    });

    it('should fetch feature announcements if AUS marketing in-app notifications are enabled', async () => {
      const { messenger, ...mocks } = arrangeMocks();
      const controller = arrangeController(messenger);

      const result = await controller.fetchAndUpdateMetamaskNotifications();

      expect(
        result.filter(
          (notification) =>
            notification.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT,
        ),
      ).toHaveLength(1);
      expect(mocks.mockFeatureAnnouncementsAPI.isDone()).toBe(true);
    });

    it('should not fetch feature announcements if AUS marketing in-app notifications are disabled', async () => {
      const { messenger, ...mocks } = arrangeMocks();
      mocks.mockGetNotificationPreferences.mockResolvedValue(
        mockPreferencesWithMarketingInApp(false),
      );
      const controller = arrangeController(messenger);

      const result = await controller.fetchAndUpdateMetamaskNotifications();

      // Should not have any feature announcements
      expect(
        result.filter(
          (notification) =>
            notification.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT,
        ),
      ).toHaveLength(0);

      // Should not have called feature announcement API
      expect(mocks.mockFeatureAnnouncementsAPI.isDone()).toBe(false);
    });

    it('ignores the legacy wallet-activity in-app toggle when fetching wallet notifications', async () => {
      const { messenger, ...mocks } = arrangeMocks();
      mocks.mockGetNotificationPreferences.mockResolvedValue(
        mockPreferences({
          walletActivity: {
            inAppNotificationsEnabled: false,
            pushNotificationsEnabled: true,
            accounts: [],
          },
          marketing: {
            inAppNotificationsEnabled: true,
            pushNotificationsEnabled: false,
          },
        }),
      );
      const controller = arrangeController(messenger);

      const result = await controller.fetchAndUpdateMetamaskNotifications();

      expect(
        result.filter(
          (notification) => notification.type === TRIGGER_TYPES.ETH_SENT,
        ),
      ).toHaveLength(1);
      expect(mocks.mockOnChainNotificationsAPI.isDone()).toBe(true);

      // The wallet-activity toggle must not affect other notification types.
      expect(mocks.mockFeatureAnnouncementsAPI.isDone()).toBe(true);
    });

    it('should still fetch wallet notifications when the preferences blob is unavailable', async () => {
      const { messenger, ...mocks } = arrangeMocks();
      mocks.mockGetNotificationPreferences.mockRejectedValue(
        new Error('mock storage failure'),
      );
      mockErrorLog();
      const controller = arrangeController(messenger);

      // A storage outage must not silently empty the notification list.
      const result = await controller.fetchAndUpdateMetamaskNotifications();

      expect(
        result.filter(
          (notification) => notification.type === TRIGGER_TYPES.ETH_SENT,
        ),
      ).toHaveLength(1);
      expect(mocks.mockOnChainNotificationsAPI.isDone()).toBe(true);
    });

    it('should handle errors gracefully when fetching notifications', async () => {
      const { messenger, mockGetNotificationPreferences } =
        mockNotificationMessenger();
      mockGetNotificationPreferences.mockResolvedValue(
        mockPreferencesWithMarketingInApp(true),
      );
      mockGetOnChainNotificationsConfig();

      // Mock APIs to fail
      mockFetchFeatureAnnouncementNotifications({ status: 500 });
      mockGetAPINotifications({ status: 500 });

      const controller = arrangeController(messenger);

      const result = await controller.fetchAndUpdateMetamaskNotifications();

      // Should still return empty array and not throw
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getNotificationsByType', () => {
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

      await controller.updateMetamaskNotificationsList(
        processedSnapNotification,
      );
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
          notification_subtype: TRIGGER_TYPES.SNAP,
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

  describe('deleteNotificationsById', () => {
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

  describe('markMetamaskNotificationsAsRead', () => {
    const arrangeMocks = (options?: {
      onChainMarkAsReadFails: boolean;
    }): ReturnType<typeof mockNotificationMessenger> & {
      mockMarkAsReadAPI: nock.Scope;
    } => {
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

  describe('enableMetamaskNotifications', () => {
    const arrangeMocks = (overrides?: {
      configurePrefs?: (mock: jest.Mock) => void;
    }): ReturnType<typeof mockNotificationMessenger> & {
      mockGetConfig: jest.Mock;
      mockUpdateNotifications: jest.Mock;
    } => {
      const messengerMocks = mockNotificationMessenger();
      const mockGetConfig = messengerMocks.mockGetNotificationPreferences;
      const mockUpdateNotifications =
        messengerMocks.mockPutNotificationPreferences;
      overrides?.configurePrefs?.(mockGetConfig);

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

      return {
        ...messengerMocks,
        mockGetConfig,
        mockUpdateNotifications,
      };
    };

    it('should sign a user in if not already signed in', async () => {
      const mocks = arrangeMocks();
      mockGetOnChainNotificationsConfig();
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
        // No AUS preferences yet — fresh initialization.
        configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
      });
      mockGetOnChainNotificationsConfig();

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
      expect(mocks.mockGetConfig).toHaveBeenCalled();
      expect(mocks.mockUpdateNotifications).toHaveBeenCalled();
    });

    it('forwards registerPushNotifications false when enabling MetaMask notifications', async () => {
      const mocks = arrangeMocks({
        configurePrefs: (mock) => mock.mockResolvedValueOnce(null),
      });
      const mockTriggerQuery = mockGetOnChainNotificationsConfig();

      const controller = new NotificationServicesController({
        messenger: mocks.messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      await controller.enableMetamaskNotifications({
        registerPushNotifications: false,
      });

      expect(mocks.mockGetConfig).toHaveBeenCalled();
      expect(mockTriggerQuery.isDone()).toBe(true);
      expect(mocks.mockUpdateNotifications).toHaveBeenCalled();
      expect(controller.state.isNotificationServicesEnabled).toBe(true);
      expect(mocks.mockEnablePushNotifications).not.toHaveBeenCalled();
    });

    it('should not create new notification subscriptions when enabling an account that already has notifications', async () => {
      const mocks = arrangeMocks({
        // Mock fully-initialized existing notifications
        configurePrefs: (mock) => mock.mockResolvedValueOnce(mockPreferences()),
      });
      mockGetOnChainNotificationsConfig();

      const controller = new NotificationServicesController({
        messenger: mocks.messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      await controller.enableMetamaskNotifications();

      expect(mocks.mockGetConfig).toHaveBeenCalled();
      expect(mocks.mockUpdateNotifications).not.toHaveBeenCalled();
    });
  });

  describe('disableNotificationServices', () => {
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

  describe('updateMetamaskNotificationsList', () => {
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
      await controller.updateMetamaskNotificationsList(
        processedSnapNotification,
      );
      expect(controller.state.metamaskNotificationsList).toStrictEqual([
        {
          type: TRIGGER_TYPES.SNAP,
          notification_subtype: TRIGGER_TYPES.SNAP,
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

  describe('enablePushNotifications', () => {
    const arrangeMocks = (): ReturnType<typeof mockNotificationMessenger> & {
      mockGetConfig: jest.Mock;
    } => {
      const messengerMocks = mockNotificationMessenger();
      const mockGetConfig = messengerMocks.mockGetNotificationPreferences;
      mockGetConfig.mockResolvedValueOnce(mockPreferences());
      messengerMocks.mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: [
          {
            accounts: [ADDRESS_1, ADDRESS_2],
            type: KeyringTypes.hd,
            metadata: { id: 'srp-1', name: 'SRP 1' },
          },
        ],
      });
      return { ...messengerMocks, mockGetConfig };
    };

    it('calls push controller and enables notifications for accounts that have subscribed to notifications', async () => {
      const { messenger, mockGetConfig, mockEnablePushNotifications } =
        arrangeMocks();
      mockGetOnChainNotificationsConfig({
        status: 200,
        body: [
          { address: ADDRESS_1.toLowerCase(), enabled: true },
          { address: ADDRESS_2.toLowerCase(), enabled: false },
        ],
      });
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
        state: { isNotificationServicesEnabled: true },
      });

      // Act
      await controller.enablePushNotifications();

      // Assert
      expect(mockGetConfig).not.toHaveBeenCalled();
      expect(mockEnablePushNotifications).toHaveBeenCalledWith([
        ADDRESS_1.toLowerCase(),
      ]);
    });

    it('unregisters the device when no account has notifications enabled', async () => {
      const {
        messenger,
        mockEnablePushNotifications,
        mockDisablePushNotifications,
      } = arrangeMocks();
      mockGetOnChainNotificationsConfig({
        status: 200,
        body: [
          { address: ADDRESS_1.toLowerCase(), enabled: false },
          { address: ADDRESS_2.toLowerCase(), enabled: false },
        ],
      });
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
        state: { isNotificationServicesEnabled: true },
      });

      await controller.enablePushNotifications();

      // The push API rejects a registration with no addresses, which would
      // leave the device's existing links in place.
      expect(mockDisablePushNotifications).toHaveBeenCalled();
      expect(mockEnablePushNotifications).not.toHaveBeenCalled();
    });

    it('leaves existing push links alone when the Trigger API is unreadable', async () => {
      const {
        messenger,
        mockEnablePushNotifications,
        mockDisablePushNotifications,
      } = arrangeMocks();
      mockGetOnChainNotificationsConfig({
        status: 500,
        body: { error: 'mock api failure' },
      });
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
        state: { isNotificationServicesEnabled: true },
      });

      await controller.enablePushNotifications();

      // An unreadable list is not an empty one: unregistering here would
      // silently stop push for every account over a transient outage.
      expect(mockDisablePushNotifications).not.toHaveBeenCalled();
      expect(mockEnablePushNotifications).not.toHaveBeenCalled();
    });

    it('ignores the legacy wallet-activity push toggle and uses Trigger API subscriptions', async () => {
      const {
        messenger,
        mockGetConfig,
        mockEnablePushNotifications,
        mockDisablePushNotifications,
      } = arrangeMocks();
      mockGetConfig.mockReset();
      mockGetConfig.mockResolvedValue(
        mockPreferences({
          walletActivity: {
            inAppNotificationsEnabled: true,
            pushNotificationsEnabled: false,
            accounts: [],
          },
        }),
      );
      mockGetOnChainNotificationsConfig({
        status: 200,
        body: [{ address: ADDRESS_1.toLowerCase(), enabled: true }],
      });
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
        state: { isNotificationServicesEnabled: true },
      });

      await controller.enablePushNotifications();

      expect(mockGetConfig).not.toHaveBeenCalled();
      expect(mockDisablePushNotifications).not.toHaveBeenCalled();
      expect(mockEnablePushNotifications).toHaveBeenCalledWith([
        ADDRESS_1.toLowerCase(),
      ]);
    });

    it('handles errors gracefully when fetching the bearer token fails', async () => {
      const mocks = arrangeMocks();
      mocks.mockGetBearerToken.mockRejectedValue(new Error('mock api failure'));
      mockErrorLog();

      const controller = new NotificationServicesController({
        messenger: mocks.messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
        state: { isNotificationServicesEnabled: true },
      });

      // Should not throw error
      await controller.enablePushNotifications();
      expect(mocks.mockEnablePushNotifications).not.toHaveBeenCalled();
    });
  });

  describe('disablePushNotifications', () => {
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

  describe('sendPerpPlaceOrderNotification', () => {
    const arrangeMocks = (): ReturnType<typeof mockNotificationMessenger> & {
      mockCreatePerpAPI: nock.Scope;
    } => {
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

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const { messenger } = mockNotificationMessenger();
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        {
          "metamaskNotificationsList": [],
          "metamaskNotificationsReadList": [],
          "subscriptionAccountsSeen": [],
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const { messenger } = mockNotificationMessenger();
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "isFeatureAnnouncementsEnabled": false,
          "isMetamaskNotificationsFeatureSeen": false,
          "isNotificationServicesEnabled": false,
          "metamaskNotificationsList": [],
          "subscriptionAccountsSeen": [],
        }
      `);
    });

    it('persists expected state', () => {
      const { messenger } = mockNotificationMessenger();
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "isFeatureAnnouncementsEnabled": false,
          "isMetamaskNotificationsFeatureSeen": false,
          "isNotificationServicesEnabled": false,
          "metamaskNotificationsList": [],
          "metamaskNotificationsReadList": [],
          "subscriptionAccountsSeen": [],
        }
      `);
    });

    it('includes expected state in UI', () => {
      const { messenger } = mockNotificationMessenger();
      const controller = new NotificationServicesController({
        messenger,
        env: { featureAnnouncements: featureAnnouncementsEnv },
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "isCheckingAccountsPresence": false,
          "isFeatureAnnouncementsEnabled": false,
          "isFetchingMetamaskNotifications": false,
          "isMetamaskNotificationsFeatureSeen": false,
          "isNotificationServicesEnabled": false,
          "isUpdatingMetamaskNotifications": false,
          "isUpdatingMetamaskNotificationsAccount": [],
          "metamaskNotificationsList": [],
          "metamaskNotificationsReadList": [],
          "subscriptionAccountsSeen": [],
        }
      `);
    });
  });
});

// Type-Computation - we are extracting args and parameters from a generic type utility
// Thus this `AnyFunc` can be used to help constrain the generic parameters correctly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;
const typedMockAction = <Action extends { handler: AnyFunc }>(): jest.Mock<
  ReturnType<Action['handler']>,
  Parameters<Action['handler']>
> => jest.fn<ReturnType<Action['handler']>, Parameters<Action['handler']>>();

const controllerName = 'NotificationServicesController';

type AllNotificationServicesControllerActions =
  MessengerActions<NotificationServicesControllerMessenger>;

type AllNotificationServicesControllerEvents =
  MessengerEvents<NotificationServicesControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllNotificationServicesControllerActions,
  AllNotificationServicesControllerEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Jest Mock Utility - Mock Notification Messenger
 *
 * @returns mock notification messenger and other messenger mocks
 */
function mockNotificationMessenger(): {
  globalMessenger: RootMessenger;
  messenger: NotificationServicesControllerMessenger;
  mockGetBearerToken: jest.Mock;
  mockIsSignedIn: jest.Mock;
  mockAuthPerformSignIn: jest.Mock;
  mockAddPushNotificationLinks: jest.Mock;
  mockDisablePushNotifications: jest.Mock;
  mockDeletePushNotificationLinks: jest.Mock;
  mockEnablePushNotifications: jest.Mock;
  mockSubscribeToPushNotifications: jest.Mock;
  mockKeyringControllerGetState: jest.Mock;
  mockGetNotificationPreferences: jest.Mock;
  mockPutNotificationPreferences: jest.Mock;
} {
  const globalMessenger = getRootMessenger();

  const messenger = new Messenger<
    typeof controllerName,
    AllNotificationServicesControllerActions,
    AllNotificationServicesControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: globalMessenger,
  });

  globalMessenger.delegate({
    messenger,
    actions: [
      'KeyringController:getState',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
      'NotificationServicesPushController:addPushNotificationLinks',
      'NotificationServicesPushController:disablePushNotifications',
      'NotificationServicesPushController:deletePushNotificationLinks',
      'NotificationServicesPushController:enablePushNotifications',
      'NotificationServicesPushController:subscribeToPushNotifications',
      'AuthenticatedUserStorageService:getNotificationPreferences',
      'AuthenticatedUserStorageService:putNotificationPreferences',
    ],
    events: [
      'KeyringController:stateChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'NotificationServicesPushController:onNewNotifications',
      'NotificationServicesPushController:stateChange',
    ],
  });

  const mockGetBearerToken =
    typedMockAction<AuthenticationController.AuthenticationControllerGetBearerTokenAction>().mockResolvedValue(
      AuthenticationController.Mocks.MOCK_OATH_TOKEN_RESPONSE.access_token,
    );

  const mockIsSignedIn =
    typedMockAction<AuthenticationController.AuthenticationControllerIsSignedInAction>().mockReturnValue(
      true,
    );

  const mockAuthPerformSignIn =
    typedMockAction<AuthenticationController.AuthenticationControllerPerformSignInAction>().mockResolvedValue(
      ['New Access Token'],
    );

  const mockAddPushNotificationLinks =
    typedMockAction<NotificationServicesPushControllerAddPushNotificationLinksAction>().mockResolvedValue(
      true,
    );

  const mockDisablePushNotifications =
    typedMockAction<NotificationServicesPushControllerDisablePushNotificationsAction>();

  const mockDeletePushNotificationLinks =
    typedMockAction<NotificationServicesPushControllerDeletePushNotificationLinksAction>().mockResolvedValue(
      true,
    );

  const mockEnablePushNotifications =
    typedMockAction<NotificationServicesPushControllerEnablePushNotificationsAction>();

  const mockSubscribeToPushNotifications =
    typedMockAction<NotificationServicesPushControllerSubscribeToPushNotificationsAction>();

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

  const mockGetNotificationPreferences =
    typedMockAction<AuthenticatedUserStorageServiceGetNotificationPreferencesAction>().mockResolvedValue(
      mockPreferences(),
    );

  const mockPutNotificationPreferences =
    typedMockAction<AuthenticatedUserStorageServicePutNotificationPreferencesAction>().mockResolvedValue(
      undefined,
    );

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
      'NotificationServicesPushController:addPushNotificationLinks'
    ) {
      return mockAddPushNotificationLinks(params[0]);
    }

    if (
      actionType ===
      'NotificationServicesPushController:disablePushNotifications'
    ) {
      return mockDisablePushNotifications();
    }

    if (
      actionType ===
      'NotificationServicesPushController:deletePushNotificationLinks'
    ) {
      return mockDeletePushNotificationLinks(params[0]);
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

    if (
      actionType ===
      'AuthenticatedUserStorageService:getNotificationPreferences'
    ) {
      return mockGetNotificationPreferences();
    }

    if (
      actionType ===
      'AuthenticatedUserStorageService:putNotificationPreferences'
    ) {
      return mockPutNotificationPreferences(params[0], params[1]);
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
    mockAddPushNotificationLinks,
    mockDisablePushNotifications,
    mockDeletePushNotificationLinks,
    mockEnablePushNotifications,
    mockSubscribeToPushNotifications,
    mockKeyringControllerGetState,
    mockGetNotificationPreferences,
    mockPutNotificationPreferences,
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
): {
  notLoggedIn: () => jest.Mock;
  noBearerToken: () => jest.Mock;
  rejectedBearerToken: () => jest.Mock;
} {
  const testScenarios = {
    notLoggedIn: (): jest.Mock => mocks.mockIsSignedIn.mockReturnValue(false),

    // unlikely, but in case it returns null
    noBearerToken: (): jest.Mock =>
      mocks.mockGetBearerToken.mockResolvedValueOnce(null as unknown as string),

    rejectedBearerToken: (): jest.Mock =>
      mocks.mockGetBearerToken.mockRejectedValueOnce(
        new Error('MOCK - no bearer token'),
      ),
  };

  return testScenarios;
}
