import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  isValidHexAddress,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  KeyringControllerStateChangeEvent,
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
  KeyringControllerState,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import { assert } from '@metamask/utils';
import { debounce } from 'lodash';
import log from 'loglevel';

import type { NormalisedAPINotification } from '.';
import { TRIGGER_TYPES } from './constants/notification-schema';
import {
  processAndFilterNotifications,
  safeProcessNotification,
} from './processors/process-notifications';
import type { ENV } from './services/api-notifications';
import {
  getAPINotifications,
  getNotificationsApiConfigCached,
  markNotificationsAsRead,
  updateOnChainNotifications,
} from './services/api-notifications';
import { getFeatureAnnouncementNotifications } from './services/feature-announcements';
import { createPerpOrderNotification } from './services/perp-notifications';
import type {
  INotification,
  MarkAsReadNotificationsParam,
} from './types/notification/notification';
import type { OrderInput } from './types/perps';
import type {
  NotificationServicesPushControllerEnablePushNotificationsAction,
  NotificationServicesPushControllerDisablePushNotificationsAction,
  NotificationServicesPushControllerSubscribeToNotificationsAction,
  NotificationServicesPushControllerStateChangeEvent,
  NotificationServicesPushControllerOnNewNotificationEvent,
} from '../NotificationServicesPushController';

// Unique name for the controller
const controllerName = 'NotificationServicesController';

export const ACCOUNTS_UPDATE_DEBOUNCE_TIME_MS = 1000;

/**
 * State shape for NotificationServicesController
 */
export type NotificationServicesControllerState = {
  /**
   * We store and manage accounts that have been seen/visited through the
   * account subscription. This allows us to track and add notifications for new accounts and not previous accounts added.
   */
  subscriptionAccountsSeen: string[];

  /**
   * Flag that indicates if the metamask notifications feature has been seen
   */
  isMetamaskNotificationsFeatureSeen: boolean;

  /**
   * Flag that indicates if the metamask notifications are enabled
   */
  isNotificationServicesEnabled: boolean;

  /**
   * Flag that indicates if the feature announcements are enabled
   */
  isFeatureAnnouncementsEnabled: boolean;

  /**
   * List of metamask notifications
   */
  metamaskNotificationsList: INotification[];

  /**
   * List of read metamask notifications
   */
  metamaskNotificationsReadList: string[];
  /**
   * Flag that indicates that the creating notifications is in progress
   */
  isUpdatingMetamaskNotifications: boolean;
  /**
   * Flag that indicates that the fetching notifications is in progress
   * This is used to show a loading spinner in the UI
   * when fetching notifications
   */
  isFetchingMetamaskNotifications: boolean;
  /**
   * Flag that indicates that the updating notifications for a specific address is in progress
   */
  isUpdatingMetamaskNotificationsAccount: string[];
  /**
   * Flag that indicates that the checking accounts presence is in progress
   */
  isCheckingAccountsPresence: boolean;
};

const metadata: StateMetadata<NotificationServicesControllerState> = {
  subscriptionAccountsSeen: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },

  isMetamaskNotificationsFeatureSeen: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  isNotificationServicesEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  isFeatureAnnouncementsEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  metamaskNotificationsList: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  metamaskNotificationsReadList: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  isUpdatingMetamaskNotifications: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  isFetchingMetamaskNotifications: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  isUpdatingMetamaskNotificationsAccount: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  isCheckingAccountsPresence: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};
export const defaultState: NotificationServicesControllerState = {
  subscriptionAccountsSeen: [],
  isMetamaskNotificationsFeatureSeen: false,
  isNotificationServicesEnabled: false,
  isFeatureAnnouncementsEnabled: false,
  metamaskNotificationsList: [],
  metamaskNotificationsReadList: [],
  isUpdatingMetamaskNotifications: false,
  isFetchingMetamaskNotifications: false,
  isUpdatingMetamaskNotificationsAccount: [],
  isCheckingAccountsPresence: false,
};

const locallyPersistedNotificationTypes = new Set<TRIGGER_TYPES>([
  TRIGGER_TYPES.SNAP,
]);

export type NotificationServicesControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    NotificationServicesControllerState
  >;

export type NotificationServicesControllerUpdateMetamaskNotificationsList = {
  type: `${typeof controllerName}:updateMetamaskNotificationsList`;
  handler: NotificationServicesController['updateMetamaskNotificationsList'];
};

export type NotificationServicesControllerDisableNotificationServices = {
  type: `${typeof controllerName}:disableNotificationServices`;
  handler: NotificationServicesController['disableNotificationServices'];
};

export type NotificationServicesControllerGetNotificationsByType = {
  type: `${typeof controllerName}:getNotificationsByType`;
  handler: NotificationServicesController['getNotificationsByType'];
};

export type NotificationServicesControllerDeleteNotificationsById = {
  type: `${typeof controllerName}:deleteNotificationsById`;
  handler: NotificationServicesController['deleteNotificationsById'];
};

// Messenger Actions
export type Actions =
  | NotificationServicesControllerGetStateAction
  | NotificationServicesControllerUpdateMetamaskNotificationsList
  | NotificationServicesControllerDisableNotificationServices
  | NotificationServicesControllerGetNotificationsByType
  | NotificationServicesControllerDeleteNotificationsById;

// Allowed Actions
type AllowedActions =
  // Keyring Controller Requests
  | KeyringControllerGetStateAction
  // Auth Controller Requests
  | AuthenticationController.AuthenticationControllerGetBearerTokenAction
  | AuthenticationController.AuthenticationControllerIsSignedInAction
  | AuthenticationController.AuthenticationControllerPerformSignInAction
  // Push Notifications Controller Requests
  | NotificationServicesPushControllerEnablePushNotificationsAction
  | NotificationServicesPushControllerDisablePushNotificationsAction
  | NotificationServicesPushControllerSubscribeToNotificationsAction;

// Events
export type NotificationServicesControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    NotificationServicesControllerState
  >;

export type NotificationListUpdatedEvent = {
  type: `${typeof controllerName}:notificationsListUpdated`;
  payload: [INotification[]];
};

export type MarkNotificationsAsReadEvent = {
  type: `${typeof controllerName}:markNotificationsAsRead`;
  payload: [INotification[]];
};

// Events
export type Events =
  | NotificationServicesControllerStateChangeEvent
  | NotificationListUpdatedEvent
  | MarkNotificationsAsReadEvent;

// Allowed Events
type AllowedEvents =
  // Keyring Events
  | KeyringControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  // Push Notification Events
  | NotificationServicesPushControllerOnNewNotificationEvent
  | NotificationServicesPushControllerStateChangeEvent;

// Type for the messenger of NotificationServicesController
export type NotificationServicesControllerMessenger = Messenger<
  typeof controllerName,
  Actions | AllowedActions,
  Events | AllowedEvents
>;

type FeatureAnnouncementEnv = {
  spaceId: string;
  accessToken: string;
  platform: 'extension' | 'mobile';
  platformVersion?: string;
};

/**
 * Controller that enables wallet notifications and feature announcements
 */
export default class NotificationServicesController extends BaseController<
  typeof controllerName,
  NotificationServicesControllerState,
  NotificationServicesControllerMessenger
> {
  readonly #keyringController = {
    isUnlocked: false,

    setupLockedStateSubscriptions: (onUnlock: () => Promise<void>): void => {
      const { isUnlocked } = this.messenger.call('KeyringController:getState');
      this.#keyringController.isUnlocked = isUnlocked;

      this.messenger.subscribe('KeyringController:unlock', (): void => {
        this.#keyringController.isUnlocked = true;
        // messaging system cannot await promises
        // we don't need to wait for a result on this.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        onUnlock();
      });

      this.messenger.subscribe('KeyringController:lock', (): void => {
        this.#keyringController.isUnlocked = false;
      });
    },
  };

  readonly #auth = {
    getBearerToken: async (): Promise<string | null> => {
      return await this.messenger.call(
        'AuthenticationController:getBearerToken',
      );
    },
    isSignedIn: (): boolean => {
      return this.messenger.call('AuthenticationController:isSignedIn');
    },
    signIn: async (): Promise<string[]> => {
      return await this.messenger.call(
        'AuthenticationController:performSignIn',
      );
    },
  };

  readonly #pushNotifications = {
    // Flag to check is notifications have been setup when the browser/extension is initialized.
    // We want to re-initialize push notifications when the browser/extension is refreshed
    // To ensure we subscribe to the most up-to-date notifications
    isSetup: false,

    subscribeToPushNotifications: async (): Promise<void> => {
      await this.messenger.call(
        'NotificationServicesPushController:subscribeToPushNotifications',
      );
    },
    enablePushNotifications: async (addresses: string[]): Promise<void> => {
      try {
        await this.messenger.call(
          'NotificationServicesPushController:enablePushNotifications',
          addresses,
        );
      } catch {
        // Do nothing, failing silently.
      }
    },
    disablePushNotifications: async (): Promise<void> => {
      try {
        await this.messenger.call(
          'NotificationServicesPushController:disablePushNotifications',
        );
      } catch {
        // Do nothing, failing silently.
      }
    },
    subscribe: (): void => {
      this.messenger.subscribe(
        'NotificationServicesPushController:onNewNotifications',
        (notification): void => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.updateMetamaskNotificationsList(notification);
        },
      );
    },
    initializePushNotifications: async (): Promise<void> => {
      if (!this.state.isNotificationServicesEnabled) {
        return;
      }
      if (this.#pushNotifications.isSetup) {
        return;
      }

      // If wallet is unlocked, we can create a fresh push subscription
      // Otherwise we can subscribe to original subscription
      try {
        if (!this.#keyringController.isUnlocked) {
          throw new Error('Keyring is locked');
        }
        await this.enablePushNotifications();
        this.#pushNotifications.isSetup = true;
      } catch {
        await this.#pushNotifications
          .subscribeToPushNotifications()
          .catch(() => {
            // do nothing
          });
      }
    },
  };

  readonly #accounts = {
    // Flag to ensure we only setup once
    isNotificationAccountsSetup: false,

    getNotificationAccounts: (): string[] | null => {
      const { keyrings } = this.messenger.call('KeyringController:getState');
      const firstHDKeyring = keyrings.find(
        (keyring) => keyring.type === KeyringTypes.hd.toString(),
      );
      const keyringAccounts = firstHDKeyring?.accounts ?? null;
      return keyringAccounts;
    },

    /**
     * Used to get list of addresses from keyring (wallet addresses)
     *
     * @returns addresses removed, added, and latest list of addresses
     */
    listAccounts: (): {
      accountsAdded: string[];
      accountsRemoved: string[];
      accounts: string[];
    } => {
      // Get previous and current account sets
      const nonChecksumAccounts = this.#accounts.getNotificationAccounts();
      if (!nonChecksumAccounts) {
        return {
          accountsAdded: [],
          accountsRemoved: [],
          accounts: [],
        };
      }

      const accounts = nonChecksumAccounts
        .map((address) => toChecksumHexAddress(address))
        .filter((address) => isValidHexAddress(address));
      const currentAccountsSet = new Set(accounts);
      const prevAccountsSet = new Set(this.state.subscriptionAccountsSeen);

      // Invalid value you cannot have zero accounts
      // Only occurs when the Accounts controller is initializing.
      if (accounts.length === 0) {
        return {
          accountsAdded: [],
          accountsRemoved: [],
          accounts: [],
        };
      }

      // Calculate added and removed addresses
      const accountsAdded = accounts.filter(
        (account) => !prevAccountsSet.has(account),
      );
      const accountsRemoved = [...prevAccountsSet.values()].filter(
        (account) => !currentAccountsSet.has(account),
      );

      // Update accounts seen
      this.update((state) => {
        state.subscriptionAccountsSeen = [...currentAccountsSet];
      });

      return {
        accountsAdded,
        accountsRemoved,
        accounts,
      };
    },

    /**
     * Initializes the cache/previous list. This is handy so we have an accurate in-mem state of the previous list of accounts.
     */
    initialize: (): void => {
      if (
        this.#keyringController.isUnlocked &&
        !this.#accounts.isNotificationAccountsSetup
      ) {
        this.#accounts.listAccounts();
        this.#accounts.isNotificationAccountsSetup = true;
      }
    },

    /**
     * Subscription to any state change in the keyring controller (aka wallet accounts).
     * We can call the `listAccounts` defined above to find out about any accounts added, removed
     * And call effects to subscribe/unsubscribe to notifications.
     */
    subscribe: (): void => {
      const debouncedUpdateAccountNotifications = debounce(
        async (
          totalAccounts?: number,
          prevTotalAccounts?: number,
        ): Promise<void> => {
          const hasTotalAccountsChanged = totalAccounts !== prevTotalAccounts;
          if (
            !this.state.isNotificationServicesEnabled ||
            !hasTotalAccountsChanged
          ) {
            return;
          }

          const { accountsAdded, accountsRemoved } =
            this.#accounts.listAccounts();

          const promises: Promise<unknown>[] = [];
          if (accountsAdded.length > 0) {
            promises.push(this.enableAccounts(accountsAdded));
          }
          if (accountsRemoved.length > 0) {
            promises.push(this.disableAccounts(accountsRemoved));
          }
          await Promise.allSettled(promises);
        },
        ACCOUNTS_UPDATE_DEBOUNCE_TIME_MS,
      );

      this.messenger.subscribe(
        'KeyringController:stateChange',
        // Using void return for async callback - result is intentionally ignored
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        debouncedUpdateAccountNotifications,
        (state: KeyringControllerState): number => {
          return (
            state?.keyrings?.flatMap?.((keyring) => keyring.accounts)?.length ??
            0
          );
        },
      );
    },
  };

  readonly #locale: () => string;

  readonly #featureAnnouncementEnv: FeatureAnnouncementEnv;

  readonly #env: ENV;

  /**
   * Creates a NotificationServicesController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   * @param args.env - environment variables for a given controller.
   * @param args.env.featureAnnouncements - env variables for feature announcements.
   * @param args.env.locale - users locale for better dynamic server notifications
   * @param args.env.env - the environment to use for the controller
   */
  constructor({
    messenger,
    state,
    env,
  }: {
    messenger: NotificationServicesControllerMessenger;
    state?: Partial<NotificationServicesControllerState>;
    env: {
      featureAnnouncements: FeatureAnnouncementEnv;
      locale?: () => string;
      env?: ENV;
    };
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#featureAnnouncementEnv = env.featureAnnouncements;
    this.#locale = env.locale ?? ((): string => 'en');
    this.#env = env.env ?? 'prd';
    this.#registerMessageHandlers();
    this.#clearLoadingStates();
  }

  init(): void {
    this.#keyringController.setupLockedStateSubscriptions(
      async (): Promise<void> => {
        this.#accounts.initialize();
        await this.#pushNotifications.initializePushNotifications();
      },
    );

    this.#accounts.initialize();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#pushNotifications.initializePushNotifications();
    this.#accounts.subscribe();
    this.#pushNotifications.subscribe();
  }

  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      `${controllerName}:updateMetamaskNotificationsList`,
      this.updateMetamaskNotificationsList.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:disableNotificationServices`,
      this.disableNotificationServices.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:getNotificationsByType`,
      this.getNotificationsByType.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:deleteNotificationsById`,
      this.deleteNotificationsById.bind(this),
    );
  }

  #clearLoadingStates(): void {
    this.update((state) => {
      state.isUpdatingMetamaskNotifications = false;
      state.isCheckingAccountsPresence = false;
      state.isFetchingMetamaskNotifications = false;
      state.isUpdatingMetamaskNotificationsAccount = [];
    });
  }

  #assertAuthEnabled(): void {
    if (!this.#auth.isSignedIn()) {
      this.update((state) => {
        state.isNotificationServicesEnabled = false;
      });
      throw new Error('User is not signed in.');
    }
  }

  async #enableAuth(): Promise<void> {
    const isSignedIn = this.#auth.isSignedIn();
    if (!isSignedIn) {
      await this.#auth.signIn();
    }
  }

  async #getBearerToken(): Promise<{ bearerToken: string }> {
    this.#assertAuthEnabled();

    const bearerToken = await this.#auth.getBearerToken();

    if (!bearerToken) {
      throw new Error('Missing BearerToken');
    }

    return { bearerToken };
  }

  /**
   * Sets the state of notification creation process.
   *
   * This method updates the `isUpdatingMetamaskNotifications` state, which can be used to indicate
   * whether the notification creation process is currently active or not. This is useful
   * for UI elements that need to reflect the state of ongoing operations, such as loading
   * indicators or disabled buttons during processing.
   *
   * @param isUpdatingMetamaskNotifications - A boolean value representing the new state of the notification creation process.
   */
  #setIsUpdatingMetamaskNotifications(
    isUpdatingMetamaskNotifications: boolean,
  ): void {
    this.update((state) => {
      state.isUpdatingMetamaskNotifications = isUpdatingMetamaskNotifications;
    });
  }

  /**
   * Updates the state to indicate whether fetching of MetaMask notifications is in progress.
   *
   * This method is used to set the `isFetchingMetamaskNotifications` state, which can be utilized
   * to show or hide loading indicators in the UI when notifications are being fetched.
   *
   * @param isFetchingMetamaskNotifications - A boolean value representing the fetching state.
   */
  #setIsFetchingMetamaskNotifications(
    isFetchingMetamaskNotifications: boolean,
  ): void {
    this.update((state) => {
      state.isFetchingMetamaskNotifications = isFetchingMetamaskNotifications;
    });
  }

  /**
   * Updates the state to indicate that the checking of accounts presence is in progress.
   *
   * This method modifies the `isCheckingAccountsPresence` state, which can be used to manage UI elements
   * that depend on the status of account presence checks, such as displaying loading indicators or disabling
   * buttons while the check is ongoing.
   *
   * @param isCheckingAccountsPresence - A boolean value indicating whether the account presence check is currently active.
   */
  #setIsCheckingAccountsPresence(isCheckingAccountsPresence: boolean): void {
    this.update((state) => {
      state.isCheckingAccountsPresence = isCheckingAccountsPresence;
    });
  }

  /**
   * Updates the state to indicate that account updates are in progress.
   * Removes duplicate accounts before updating the state.
   *
   * @param accounts - The accounts being updated.
   */
  #updateUpdatingAccountsState(accounts: string[]): void {
    this.update((state) => {
      const uniqueAccounts = new Set([
        ...state.isUpdatingMetamaskNotificationsAccount,
        ...accounts,
      ]);
      state.isUpdatingMetamaskNotificationsAccount = Array.from(uniqueAccounts);
    });
  }

  /**
   * Clears the state indicating that account updates are complete.
   *
   * @param accounts - The accounts that have finished updating.
   */
  #clearUpdatingAccountsState(accounts: string[]): void {
    this.update((state) => {
      state.isUpdatingMetamaskNotificationsAccount =
        state.isUpdatingMetamaskNotificationsAccount.filter(
          (existingAccount) => !accounts.includes(existingAccount),
        );
    });
  }

  /**
   * Public method to expose enabling push notifications
   */
  public async enablePushNotifications(): Promise<void> {
    try {
      const { bearerToken } = await this.#getBearerToken();
      const { accounts } = this.#accounts.listAccounts();
      const addressesWithNotifications = await getNotificationsApiConfigCached(
        bearerToken,
        accounts,
        this.#env,
      );
      const addresses = addressesWithNotifications
        .filter((addressConfig) => Boolean(addressConfig.enabled))
        .map((addressConfig) => addressConfig.address);
      if (addresses.length > 0) {
        await this.#pushNotifications.enablePushNotifications(addresses);
      }
    } catch {
      // Do nothing, failing silently.
    }
  }

  /**
   * Public method to expose disabling push notifications
   */
  public async disablePushNotifications(): Promise<void> {
    await this.#pushNotifications.disablePushNotifications();
  }

  public async checkAccountsPresence(
    accounts: string[],
  ): Promise<Record<string, boolean>> {
    try {
      this.#setIsCheckingAccountsPresence(true);

      // Retrieve user storage
      const { bearerToken } = await this.#getBearerToken();
      const addressesWithNotifications = await getNotificationsApiConfigCached(
        bearerToken,
        accounts,
        this.#env,
      );

      const result: Record<string, boolean> = {};
      addressesWithNotifications.forEach((a) => {
        result[a.address] = a.enabled;
      });
      return result;
    } catch (error) {
      log.error('Failed to check accounts presence', error);
      throw error;
    } finally {
      this.#setIsCheckingAccountsPresence(false);
    }
  }

  /**
   * Sets the enabled state of feature announcements.
   *
   * **Action** - used in the notification settings to enable/disable feature announcements.
   *
   * @param featureAnnouncementsEnabled - A boolean value indicating the desired enabled state of the feature announcements.
   * @async
   * @throws {Error} If fails to update
   */
  public async setFeatureAnnouncementsEnabled(
    featureAnnouncementsEnabled: boolean,
  ): Promise<void> {
    try {
      this.update((state) => {
        state.isFeatureAnnouncementsEnabled = featureAnnouncementsEnabled;
      });
    } catch (error) {
      log.error('Unable to toggle feature announcements', error);
      throw new Error('Unable to toggle feature announcements');
    }
  }

  /**
   * This creates/re-creates on-chain triggers defined in User Storage.
   *
   * **Action** - Used during Sign In / Enabling of notifications.
   *
   * @param opts - optional options to mutate this functionality
   * @param opts.resetNotifications - this will not use the users stored preferences, and instead re-create notification triggers
   * It will help in case uses get into a corrupted state or wants to wipe their notifications.
   * @returns The updated or newly created user storage.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async createOnChainTriggers(opts?: {
    resetNotifications?: boolean;
  }): Promise<void> {
    try {
      this.#setIsUpdatingMetamaskNotifications(true);

      const { bearerToken } = await this.#getBearerToken();

      const { accounts } = this.#accounts.listAccounts();

      // 1. See if has enabled notifications before
      const addressesWithNotifications = await getNotificationsApiConfigCached(
        bearerToken,
        accounts,
        this.#env,
      );

      // Notifications API can return array with addresses set to false
      // So assert that at least one address is enabled
      let accountsWithNotifications = addressesWithNotifications
        .filter((addressConfig) => Boolean(addressConfig.enabled))
        .map((addressConfig) => addressConfig.address);

      // 2. Enable Notifications (if no accounts subscribed or we are resetting)
      if (accountsWithNotifications.length === 0 || opts?.resetNotifications) {
        await updateOnChainNotifications(
          bearerToken,
          accounts.map((address) => ({ address, enabled: true })),
          this.#env,
        );
        accountsWithNotifications = accounts;
      }

      // 3. Lazily enable push notifications (FCM may take some time, so keeps UI unblocked)
      this.#pushNotifications
        .enablePushNotifications(accountsWithNotifications)
        .catch(() => {
          // Do Nothing
        });

      // Update the state of the controller
      this.update((state) => {
        // User is re-subscribing (daily resub to get latest notifications)
        if (state.isNotificationServicesEnabled) {
          // Keep their existing preferences on re-subscribe
          // No state updates needed - preserving user's current settings
        } else {
          // User is turning on notifications from a disabled state
          state.isNotificationServicesEnabled = true;
          state.isFeatureAnnouncementsEnabled = true;
          state.isMetamaskNotificationsFeatureSeen = true;
        }
      });
    } catch (error) {
      log.error('Failed to create On Chain triggers', error);
      throw new Error('Failed to create On Chain triggers');
    } finally {
      this.#setIsUpdatingMetamaskNotifications(false);
    }
  }

  /**
   * Enables all MetaMask notifications for the user.
   * This is identical flow when initializing notifications for the first time.
   *
   * @throws {Error} If there is an error during the process of enabling notifications.
   */
  public async enableMetamaskNotifications(): Promise<void> {
    try {
      this.#setIsUpdatingMetamaskNotifications(true);
      await this.#enableAuth();
      await this.createOnChainTriggers();
    } catch (error) {
      log.error('Unable to enable notifications', error);
      throw new Error('Unable to enable notifications');
    } finally {
      this.#setIsUpdatingMetamaskNotifications(false);
    }
  }

  /**
   * Disables all MetaMask notifications for the user.
   * This method ensures that the user is authenticated, retrieves all linked accounts,
   * and disables on-chain triggers for each account. It also sets the global notification
   * settings for MetaMask, feature announcements to false.
   *
   * @throws {Error} If the user is not authenticated or if there is an error during the process.
   */
  public async disableNotificationServices(): Promise<void> {
    this.#setIsUpdatingMetamaskNotifications(true);

    // Attempt Disable Push Notifications
    try {
      await this.#pushNotifications.disablePushNotifications();
    } catch {
      // Do nothing
    }

    // Update State: remove non-permitted notifications & disable flags
    const snapNotifications = this.state.metamaskNotificationsList.filter(
      (notification) => notification.type === TRIGGER_TYPES.SNAP,
    );
    this.update((state) => {
      state.isNotificationServicesEnabled = false;
      state.isFeatureAnnouncementsEnabled = false;
      // reassigning the notifications list with just snaps
      // since the disable shouldn't affect snaps notifications
      state.metamaskNotificationsList = snapNotifications;
    });

    // Finish Updating State
    this.#setIsUpdatingMetamaskNotifications(false);
  }

  /**
   * Deletes on-chain triggers associated with a specific account/s.
   * This method performs several key operations:
   * 1. Validates Auth
   * 2. Deletes accounts
   * (note) We do not need to look through push notifications as we've deleted triggers
   *
   * **Action** - When a user disables notifications for a given account in settings.
   *
   * @param accounts - The account for which on-chain triggers are to be deleted.
   * @returns A promise that resolves to void or an object containing a success message.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async disableAccounts(accounts: string[]): Promise<void> {
    try {
      this.#updateUpdatingAccountsState(accounts);
      // Get and Validate BearerToken and User Storage Key
      const { bearerToken } = await this.#getBearerToken();

      // Delete these UUIDs (Mutates User Storage)
      await updateOnChainNotifications(
        bearerToken,
        accounts.map((address) => ({ address, enabled: false })),
        this.#env,
      );
    } catch {
      throw new Error('Failed to delete OnChain triggers');
    } finally {
      this.#clearUpdatingAccountsState(accounts);
    }
  }

  /**
   * Updates/Creates on-chain triggers for a specific account.
   *
   * This method performs several key operations:
   * 1. Validates Auth & Storage
   * 2. Finds and creates any missing triggers associated with the account
   * 3. Enables any related push notifications
   * 4. Updates Storage to reflect new state.
   *
   * **Action** - When a user enables notifications for an account
   *
   * @param accounts - List of accounts you want to update.
   * @returns A promise that resolves to the updated user storage.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async enableAccounts(accounts: string[]): Promise<void> {
    try {
      this.#updateUpdatingAccountsState(accounts);

      const { bearerToken } = await this.#getBearerToken();
      await updateOnChainNotifications(
        bearerToken,
        accounts.map((address) => ({ address, enabled: true })),
        this.#env,
      );
    } catch (error) {
      log.error('Failed to update OnChain triggers', error);
      throw new Error('Failed to update OnChain triggers');
    } finally {
      this.#clearUpdatingAccountsState(accounts);
    }
  }

  /**
   * Fetches the list of metamask notifications.
   * This includes OnChain notifications; Feature Announcements; and Snap Notifications.
   *
   * **Action** - When a user views the notification list page/dropdown
   *
   * @param previewToken - the preview token to use if needed
   * @returns A promise that resolves to the list of notifications.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async fetchAndUpdateMetamaskNotifications(
    previewToken?: string,
  ): Promise<INotification[]> {
    try {
      this.#setIsFetchingMetamaskNotifications(true);

      // This is used by Feature Announcement & On Chain
      // Not used by Snaps
      const isGlobalNotifsEnabled = this.state.isNotificationServicesEnabled;

      // Raw Feature Notifications
      const rawAnnouncements =
        isGlobalNotifsEnabled && this.state.isFeatureAnnouncementsEnabled
          ? await getFeatureAnnouncementNotifications(
              this.#featureAnnouncementEnv,
              previewToken,
            ).catch(() => [])
          : [];

      // Raw On Chain Notifications
      const rawOnChainNotifications: NormalisedAPINotification[] = [];
      if (isGlobalNotifsEnabled) {
        try {
          const { bearerToken } = await this.#getBearerToken();
          const { accounts } = this.#accounts.listAccounts();
          const addressesWithNotifications = (
            await getNotificationsApiConfigCached(
              bearerToken,
              accounts,
              this.#env,
            )
          )
            .filter((addressConfig) => Boolean(addressConfig.enabled))
            .map((addressConfig) => addressConfig.address);
          const notifications = await getAPINotifications(
            bearerToken,
            addressesWithNotifications,
            this.#locale(),
            this.#featureAnnouncementEnv.platform,
            this.#env,
          ).catch(() => []);
          rawOnChainNotifications.push(...notifications);
        } catch {
          // Do nothing
        }
      }

      // Snap Notifications (original)
      // We do not want to remove them
      const snapNotifications = this.state.metamaskNotificationsList.filter(
        (notification) => notification.type === TRIGGER_TYPES.SNAP,
      );

      const readIds = this.state.metamaskNotificationsReadList;

      // Combine Notifications
      const metamaskNotifications: INotification[] = [
        ...processAndFilterNotifications(rawAnnouncements, readIds),
        ...processAndFilterNotifications(rawOnChainNotifications, readIds),
        ...snapNotifications,
      ];

      // Sort Notifications
      metamaskNotifications.sort(
        (notificationA, notificationB) =>
          new Date(notificationB.createdAt).getTime() -
          new Date(notificationA.createdAt).getTime(),
      );

      // Update State
      this.update((state) => {
        state.metamaskNotificationsList = metamaskNotifications;
      });

      this.messenger.publish(
        `${controllerName}:notificationsListUpdated`,
        this.state.metamaskNotificationsList,
      );

      this.#setIsFetchingMetamaskNotifications(false);
      return metamaskNotifications;
    } catch (error) {
      this.#setIsFetchingMetamaskNotifications(false);
      log.error('Failed to fetch notifications', error);
      throw new Error('Failed to fetch notifications');
    }
  }

  /**
   * Gets the specified type of notifications from state.
   *
   * @param type - The trigger type.
   * @returns An array of notifications of the passed in type.
   * @throws Throws an error if an invalid trigger type is passed.
   */
  public getNotificationsByType(type: TRIGGER_TYPES): INotification[] {
    assert(
      Object.values(TRIGGER_TYPES).includes(type),
      'Invalid trigger type.',
    );
    return this.state.metamaskNotificationsList.filter(
      (notification) => notification.type === type,
    );
  }

  /**
   * Used to delete a notification by id.
   *
   * Note: This function should only be used for notifications that are stored
   * in this controller directly, currently only snaps notifications.
   *
   * @param id - The id of the notification to delete.
   */
  public async deleteNotificationById(id: string): Promise<void> {
    const fetchedNotification = this.state.metamaskNotificationsList.find(
      (notification) => notification.id === id,
    );

    assert(
      fetchedNotification,
      'The notification to be deleted does not exist.',
    );

    assert(
      locallyPersistedNotificationTypes.has(fetchedNotification.type),
      `The notification type of "${
        // notifications are guaranteed to have type properties which equate to strings
        fetchedNotification.type as string
      }" is not locally persisted, only the following types can use this function: ${[
        ...locallyPersistedNotificationTypes,
      ].join(', ')}.`,
    );

    const newList = this.state.metamaskNotificationsList.filter(
      (notification) => notification.id !== id,
    );

    this.update((state) => {
      state.metamaskNotificationsList = newList;
    });
  }

  /**
   * Used to batch delete notifications by id.
   *
   * Note: This function should only be used for notifications that are stored
   * in this controller directly, currently only snaps notifications.
   *
   * @param ids - The ids of the notifications to delete.
   */
  public async deleteNotificationsById(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteNotificationById(id);
    }

    this.messenger.publish(
      `${controllerName}:notificationsListUpdated`,
      this.state.metamaskNotificationsList,
    );
  }

  /**
   * Marks specified metamask notifications as read.
   *
   * @param notifications - An array of notifications to be marked as read. Each notification should include its type and read status.
   * @returns A promise that resolves when the operation is complete.
   */
  public async markMetamaskNotificationsAsRead(
    notifications: MarkAsReadNotificationsParam,
  ): Promise<void> {
    let onchainNotificationIds: string[] = [];
    let featureAnnouncementNotificationIds: string[] = [];
    let snapNotificationIds: string[] = [];

    try {
      const [
        onChainNotifications,
        featureAnnouncementNotifications,
        snapNotifications,
      ] = notifications.reduce<
        [
          MarkAsReadNotificationsParam,
          MarkAsReadNotificationsParam,
          MarkAsReadNotificationsParam,
        ]
      >(
        (allNotifications, notification) => {
          if (!notification.isRead) {
            switch (notification.type) {
              case TRIGGER_TYPES.FEATURES_ANNOUNCEMENT:
                allNotifications[1].push(notification);
                break;
              case TRIGGER_TYPES.SNAP:
                allNotifications[2].push(notification);
                break;
              default:
                allNotifications[0].push(notification);
            }
          }
          return allNotifications;
        },
        [[], [], []],
      );

      // Mark On-Chain Notifications as Read
      if (onChainNotifications.length > 0) {
        const bearerToken = await this.#auth.getBearerToken();

        if (bearerToken) {
          onchainNotificationIds = onChainNotifications.map(
            (notification) => notification.id,
          );
          await markNotificationsAsRead(
            bearerToken,
            onchainNotificationIds,
            this.#env,
          ).catch(() => {
            onchainNotificationIds = [];
            log.warn('Unable to mark onchain notifications as read');
          });
        }
      }

      // Mark Off-Chain notifications as Read
      if (featureAnnouncementNotifications.length > 0) {
        featureAnnouncementNotificationIds =
          featureAnnouncementNotifications.map(
            (notification) => notification.id,
          );
      }

      if (snapNotifications.length > 0) {
        snapNotificationIds = snapNotifications.map(
          (notification) => notification.id,
        );
      }
    } catch (error) {
      log.warn('Something failed when marking notifications as read', error);
    }

    // Update the state (state is also used on counter & badge)
    this.update((state) => {
      const currentReadList = state.metamaskNotificationsReadList;
      const newReadIds = [
        ...featureAnnouncementNotificationIds,
        ...snapNotificationIds,
      ];
      state.metamaskNotificationsReadList = [
        ...new Set([...currentReadList, ...newReadIds]),
      ];

      state.metamaskNotificationsList = state.metamaskNotificationsList.map(
        (notification: INotification) => {
          if (
            newReadIds.includes(notification.id) ||
            onchainNotificationIds.includes(notification.id)
          ) {
            if (notification.type === TRIGGER_TYPES.SNAP) {
              return {
                ...notification,
                isRead: true,
                readDate: new Date().toISOString(),
              };
            }
            return { ...notification, isRead: true };
          }
          return notification;
        },
      );
    });

    this.messenger.publish(
      `${controllerName}:markNotificationsAsRead`,
      this.state.metamaskNotificationsList,
    );
  }

  /**
   * Updates the list of MetaMask notifications by adding a new notification at the beginning of the list.
   * This method ensures that the most recent notification is displayed first in the UI.
   *
   * @param notification - The new notification object to be added to the list.
   * @returns A promise that resolves when the notification list has been successfully updated.
   */
  public async updateMetamaskNotificationsList(
    notification: INotification,
  ): Promise<void> {
    if (
      this.state.metamaskNotificationsList.some(
        (existingNotification) => existingNotification.id === notification.id,
      )
    ) {
      return;
    }

    const processedNotification = safeProcessNotification(notification);

    if (processedNotification) {
      this.update((state) => {
        const existingNotificationIds = new Set(
          state.metamaskNotificationsList.map(
            (existingNotification) => existingNotification.id,
          ),
        );
        // Add the new notification only if its ID is not already present in the list
        if (!existingNotificationIds.has(processedNotification.id)) {
          state.metamaskNotificationsList = [
            processedNotification,
            ...state.metamaskNotificationsList,
          ];
        }
      });

      this.messenger.publish(
        `${controllerName}:notificationsListUpdated`,
        this.state.metamaskNotificationsList,
      );
    }
  }

  /**
   * Creates an perp order notification subscription.
   * Requires notifications and auth to be enabled to start receiving this notifications
   *
   * @param input perp input
   */
  public async sendPerpPlaceOrderNotification(
    input: OrderInput,
  ): Promise<void> {
    try {
      const { bearerToken } = await this.#getBearerToken();
      await createPerpOrderNotification(bearerToken, input);
    } catch {
      // Do Nothing
    }
  }
}
