import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { toChecksumHexAddress } from '@metamask/controller-utils';
import type {
  KeyringControllerGetAccountsAction,
  KeyringControllerStateChangeEvent,
} from '@metamask/keyring-controller';
import type {
  AuthenticationController,
  UserStorageController,
} from '@metamask/profile-sync-controller';
import log from 'loglevel';

import { USER_STORAGE_VERSION_KEY } from './constants/constants';
import { TRIGGER_TYPES } from './constants/notification-schema';
import { safeProcessNotification } from './processors/process-notifications';
import * as FeatureNotifications from './services/feature-announcements';
import * as OnChainNotifications from './services/onchain-notifications';
import type {
  INotification,
  MarkAsReadNotificationsParam,
  NotificationUnion,
} from './types/notification/notification';
import type { OnChainRawNotification } from './types/on-chain-notification/on-chain-notification';
import type { UserStorage } from './types/user-storage/user-storage';
import * as Utils from './utils/utils';

// TODO: Fix Circular Type Dependencies
// This indicates that control flow of messages is everywhere, lets orchestrate these better
export type NotificationServicesPushControllerEnablePushNotifications = {
  type: `NotificationServicesPushController:enablePushNotifications`;
  handler: (UUIDs: string[]) => Promise<void>;
};

export type NotificationServicesPushControllerDisablePushNotifications = {
  type: `NotificationServicesPushController:disablePushNotifications`;
  handler: (UUIDs: string[]) => Promise<void>;
};

export type NotificationServicesPushControllerUpdateTriggerPushNotifications = {
  type: `NotificationServicesPushController:updateTriggerPushNotifications`;
  handler: (UUIDs: string[]) => Promise<void>;
};

export type NotificationServicesPushControllerOnNewNotification = {
  type: `NotificationServicesPushController:onNewNotifications`;
  payload: [INotification];
};

// Unique name for the controller
const controllerName = 'NotificationServicesController';

/**
 * State shape for NotificationServicesController
 */
export type NotificationServicesControllerState = {
  /**
   * We store and manage accounts that have been seen/visted through the
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
    persist: true,
    anonymous: true,
  },

  isMetamaskNotificationsFeatureSeen: {
    persist: true,
    anonymous: false,
  },
  isNotificationServicesEnabled: {
    persist: true,
    anonymous: false,
  },
  isFeatureAnnouncementsEnabled: {
    persist: true,
    anonymous: false,
  },
  metamaskNotificationsList: {
    persist: true,
    anonymous: true,
  },
  metamaskNotificationsReadList: {
    persist: true,
    anonymous: true,
  },
  isUpdatingMetamaskNotifications: {
    persist: false,
    anonymous: false,
  },
  isFetchingMetamaskNotifications: {
    persist: false,
    anonymous: false,
  },
  isUpdatingMetamaskNotificationsAccount: {
    persist: false,
    anonymous: false,
  },
  isCheckingAccountsPresence: {
    persist: false,
    anonymous: false,
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

export type NotificationServicesControllerUpdateMetamaskNotificationsList = {
  type: `${typeof controllerName}:updateMetamaskNotificationsList`;
  handler: NotificationServicesController['updateMetamaskNotificationsList'];
};

export type NotificationServicesControllerDisableNotificationServices = {
  type: `${typeof controllerName}:disableNotificationServices`;
  handler: NotificationServicesController['disableNotificationServices'];
};

export type NotificationServicesControllerSelectIsNotificationServicesEnabled =
  {
    type: `${typeof controllerName}:selectIsNotificationServicesEnabled`;
    handler: NotificationServicesController['selectIsNotificationServicesEnabled'];
  };

// Messenger Actions
export type Actions =
  | NotificationServicesControllerUpdateMetamaskNotificationsList
  | NotificationServicesControllerDisableNotificationServices
  | NotificationServicesControllerSelectIsNotificationServicesEnabled
  | ControllerGetStateAction<'state', NotificationServicesControllerState>;

// Allowed Actions
export type AllowedActions =
  // Keyring Controller Requests
  | KeyringControllerGetAccountsAction
  // Auth Controller Requests
  | AuthenticationController.AuthenticationControllerGetBearerToken
  | AuthenticationController.AuthenticationControllerIsSignedIn
  // User Storage Controller Requests
  | UserStorageController.UserStorageControllerEnableProfileSyncing
  | UserStorageController.UserStorageControllerGetStorageKey
  | UserStorageController.UserStorageControllerPerformGetStorage
  | UserStorageController.UserStorageControllerPerformSetStorage
  // Push Notifications Controller Requests
  | NotificationServicesPushControllerEnablePushNotifications
  | NotificationServicesPushControllerDisablePushNotifications
  | NotificationServicesPushControllerUpdateTriggerPushNotifications;

// Events
export type NotificationServicesControllerMessengerEvents =
  ControllerStateChangeEvent<
    typeof controllerName,
    NotificationServicesControllerState
  >;

// Allowed Events
export type AllowedEvents =
  | KeyringControllerStateChangeEvent
  | NotificationServicesPushControllerOnNewNotification;

// Type for the messenger of NotificationServicesController
export type NotificationServicesControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    Actions | AllowedActions,
    AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

type FeatureAnnouncementEnv = {
  spaceId: string;
  accessToken: string;
  platform: 'extension' | 'mobile';
};

/**
 * Controller that enables wallet notifications and feature announcements
 */
export default class NotificationServicesController extends BaseController<
  typeof controllerName,
  NotificationServicesControllerState,
  NotificationServicesControllerMessenger
> {
  // Temporary boolean as push notifications are not yet enabled on mobile
  #isPushIntegrated = true;

  #auth = {
    getBearerToken: async () => {
      return await this.messagingSystem.call(
        'AuthenticationController:getBearerToken',
      );
    },
    isSignedIn: () => {
      return this.messagingSystem.call('AuthenticationController:isSignedIn');
    },
  };

  #storage = {
    enableProfileSyncing: async () => {
      return await this.messagingSystem.call(
        'UserStorageController:enableProfileSyncing',
      );
    },
    getStorageKey: () => {
      return this.messagingSystem.call('UserStorageController:getStorageKey');
    },
    getNotificationStorage: async () => {
      return await this.messagingSystem.call(
        'UserStorageController:performGetStorage',
        'notificationSettings',
      );
    },
    setNotificationStorage: async (state: string) => {
      return await this.messagingSystem.call(
        'UserStorageController:performSetStorage',
        'notificationSettings',
        state,
      );
    },
  };

  #pushNotifications = {
    enablePushNotifications: async (UUIDs: string[]) => {
      if (!this.#isPushIntegrated) {
        return;
      }
      await this.messagingSystem.call(
        'NotificationServicesPushController:enablePushNotifications',
        UUIDs,
      );
    },
    disablePushNotifications: async (UUIDs: string[]) => {
      if (!this.#isPushIntegrated) {
        return;
      }
      await this.messagingSystem.call(
        'NotificationServicesPushController:disablePushNotifications',
        UUIDs,
      );
    },
    updatePushNotifications: async (UUIDs: string[]) => {
      if (!this.#isPushIntegrated) {
        return;
      }
      await this.messagingSystem.call(
        'NotificationServicesPushController:updateTriggerPushNotifications',
        UUIDs,
      );
    },
    subscribe: () => {
      if (!this.#isPushIntegrated) {
        return;
      }
      this.messagingSystem.subscribe(
        'NotificationServicesPushController:onNewNotifications',
        (notification) => {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.updateMetamaskNotificationsList(notification);
        },
      );
    },
    initializePushNotifications: async () => {
      if (!this.#isPushIntegrated) {
        return;
      }
      if (!this.state.isNotificationServicesEnabled) {
        return;
      }

      const storage = await this.#getUserStorage();
      if (!storage) {
        return;
      }

      const uuids = Utils.getAllUUIDs(storage);
      await this.#pushNotifications.enablePushNotifications(uuids);
    },
  };

  #accounts = {
    /**
     * Used to get list of addresses from keyring (wallet addresses)
     *
     * @returns addresses removed, added, and latest list of addresses
     */
    listAccounts: async () => {
      // Get previous and current account sets
      const nonChecksumAccounts = await this.messagingSystem.call(
        'KeyringController:getAccounts',
      );
      const accounts = nonChecksumAccounts.map((a) => toChecksumHexAddress(a));
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
      const accountsAdded = accounts.filter((a) => !prevAccountsSet.has(a));
      const accountsRemoved = [...prevAccountsSet.values()].filter(
        (a) => !currentAccountsSet.has(a),
      );

      // Update accounts seen
      this.update((state) => {
        state.subscriptionAccountsSeen = [...prevAccountsSet, ...accountsAdded];
      });

      return {
        accountsAdded,
        accountsRemoved,
        accounts,
      };
    },

    /**
     * Initializes the cache/previous list. This is handy so we have an accurate in-mem state of the previous list of accounts.
     *
     * @returns result from list accounts
     */
    initialize: () => {
      return this.#accounts.listAccounts();
    },

    /**
     * Subscription to any state change in the keyring controller (aka wallet accounts).
     * We can call the `listAccounts` defined above to find out about any accounts added, removed
     * And call effects to subscribe/unsubscribe to notifications.
     */
    subscribe: () => {
      this.messagingSystem.subscribe(
        'KeyringController:stateChange',
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
          if (!this.state.isNotificationServicesEnabled) {
            return;
          }

          const { accountsAdded, accountsRemoved } =
            await this.#accounts.listAccounts();

          const promises: Promise<unknown>[] = [];
          if (accountsAdded.length > 0) {
            promises.push(this.updateOnChainTriggersByAccount(accountsAdded));
          }
          if (accountsRemoved.length > 0) {
            promises.push(this.deleteOnChainTriggersByAccount(accountsRemoved));
          }
          await Promise.all(promises);
        },
      );
    },
  };

  #featureAnnouncementEnv: FeatureAnnouncementEnv;

  /**
   * Creates a NotificationServicesController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   * @param args.env - environment variables for a given controller.
   * @param args.env.featureAnnouncements - env variables for feature announcements.
   * @param args.env.isPushIntegrated - toggle push notifications on/off if client has integrated them.
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
      isPushIntegrated?: boolean;
    };
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#isPushIntegrated = env.isPushIntegrated ?? true;

    this.#featureAnnouncementEnv = env.featureAnnouncements;
    this.#registerMessageHandlers();
    this.#clearLoadingStates();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#accounts.initialize();
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#pushNotifications.initializePushNotifications();
    this.#accounts.subscribe();
    this.#pushNotifications.subscribe();
  }

  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:updateMetamaskNotificationsList`,
      this.updateMetamaskNotificationsList.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:disableNotificationServices`,
      this.disableNotificationServices.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:selectIsNotificationServicesEnabled`,
      this.selectIsNotificationServicesEnabled.bind(this),
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

  #assertAuthEnabled() {
    if (!this.#auth.isSignedIn()) {
      this.update((state) => {
        state.isNotificationServicesEnabled = false;
      });
      throw new Error('User is not signed in.');
    }
  }

  async #getValidStorageKeyAndBearerToken() {
    this.#assertAuthEnabled();

    const bearerToken = await this.#auth.getBearerToken();
    const storageKey = await this.#storage.getStorageKey();

    if (!bearerToken || !storageKey) {
      throw new Error('Missing BearerToken or storage key');
    }

    return { bearerToken, storageKey };
  }

  #performEnableProfileSyncing = async () => {
    try {
      await this.#storage.enableProfileSyncing();
    } catch (e) {
      log.error('Failed to enable profile syncing', e);
      throw new Error('Failed to enable profile syncing');
    }
  };

  #assertUserStorage(
    storage: UserStorage | null,
  ): asserts storage is UserStorage {
    if (!storage) {
      throw new Error('User Storage does not exist');
    }
  }

  /**
   * Retrieves and parses the user storage from the storage key.
   *
   * This method attempts to retrieve the user storage using the specified storage key,
   * then parses the JSON string to an object. If the storage is not found or cannot be parsed,
   * it throws an error.
   *
   * @returns The parsed user storage object or null
   */
  async #getUserStorage(): Promise<UserStorage | null> {
    const userStorageString: string | null =
      await this.#storage.getNotificationStorage();

    if (!userStorageString) {
      return null;
    }

    try {
      const userStorage: UserStorage = JSON.parse(userStorageString);
      return userStorage;
    } catch (error) {
      log.error('Unable to parse User Storage');
      return null;
    }
  }

  /**
   * Retrieves the current enabled state of MetaMask notifications.
   *
   * This method directly returns the boolean value of `isMetamaskNotificationsEnabled`
   * from the controller's state, indicating whether MetaMask notifications are currently enabled.
   *
   * @returns The enabled state of MetaMask notifications.
   */
  public selectIsNotificationServicesEnabled(): boolean {
    return this.state.isNotificationServicesEnabled;
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
  ) {
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
  ) {
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
  #setIsCheckingAccountsPresence(isCheckingAccountsPresence: boolean) {
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
  #updateUpdatingAccountsState(accounts: string[]) {
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
  #clearUpdatingAccountsState(accounts: string[]) {
    this.update((state) => {
      state.isUpdatingMetamaskNotificationsAccount =
        state.isUpdatingMetamaskNotificationsAccount.filter(
          (existingAccount) => !accounts.includes(existingAccount),
        );
    });
  }

  public async checkAccountsPresence(
    accounts: string[],
  ): Promise<Record<string, boolean>> {
    try {
      this.#setIsCheckingAccountsPresence(true);

      // Retrieve user storage
      const userStorage = await this.#getUserStorage();
      this.#assertUserStorage(userStorage);

      const presence = Utils.checkAccountsPresence(userStorage, accounts);
      return presence;
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
  ) {
    try {
      this.update((s) => {
        s.isFeatureAnnouncementsEnabled = featureAnnouncementsEnabled;
      });
    } catch (e) {
      log.error('Unable to toggle feature announcements', e);
      throw new Error('Unable to toggle feature announcements');
    }
  }

  /**
   * This creates/re-creates on-chain triggers defined in User Storage.
   *
   * **Action** - Used during Sign In / Enabling of notifications.
   *
   * @returns The updated or newly created user storage.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async createOnChainTriggers(): Promise<UserStorage> {
    try {
      this.#setIsUpdatingMetamaskNotifications(true);

      await this.#performEnableProfileSyncing();

      const { bearerToken, storageKey } =
        await this.#getValidStorageKeyAndBearerToken();

      const { accounts } = await this.#accounts.listAccounts();

      let userStorage = await this.#getUserStorage();

      // If userStorage does not exist, create a new one
      // All the triggers created are set as: "disabled"
      if (userStorage?.[USER_STORAGE_VERSION_KEY] === undefined) {
        userStorage = Utils.initializeUserStorage(
          accounts.map((account) => ({ address: account })),
          false,
        );

        // Write the userStorage
        await this.#storage.setNotificationStorage(JSON.stringify(userStorage));
      }

      // Create the triggers
      const triggers = Utils.traverseUserStorageTriggers(userStorage);
      await OnChainNotifications.createOnChainTriggers(
        userStorage,
        storageKey,
        bearerToken,
        triggers,
      );

      // Create push notifications triggers
      const allUUIDS = Utils.getAllUUIDs(userStorage);
      await this.#pushNotifications.enablePushNotifications(allUUIDS);

      // Write the new userStorage (triggers are now "enabled")
      await this.#storage.setNotificationStorage(JSON.stringify(userStorage));

      // Update the state of the controller
      this.update((state) => {
        state.isNotificationServicesEnabled = true;
        state.isFeatureAnnouncementsEnabled = true;
        state.isMetamaskNotificationsFeatureSeen = true;
      });

      return userStorage;
    } catch (err) {
      log.error('Failed to create On Chain triggers', err);
      throw new Error('Failed to create On Chain triggers');
    } finally {
      this.#setIsUpdatingMetamaskNotifications(false);
    }
  }

  /**
   * Enables all MetaMask notifications for the user.
   * This is identical flow when initializing notifications for the first time.
   * 1. Enable Profile Syncing
   * 2. Get or Create Notification User Storage
   * 3. Upsert Triggers
   * 4. Update Push notifications
   *
   * @throws {Error} If there is an error during the process of enabling notifications.
   */
  public async enableMetamaskNotifications() {
    try {
      this.#setIsUpdatingMetamaskNotifications(true);
      await this.createOnChainTriggers();
    } catch (e) {
      log.error('Unable to enable notifications', e);
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
  public async disableNotificationServices() {
    try {
      this.#setIsUpdatingMetamaskNotifications(true);

      // Disable Push Notifications
      const userStorage = await this.#getUserStorage();
      this.#assertUserStorage(userStorage);
      const UUIDs = Utils.getAllUUIDs(userStorage);
      await this.#pushNotifications.disablePushNotifications(UUIDs);

      // Clear Notification States (toggles and list)
      this.update((state) => {
        state.isNotificationServicesEnabled = false;
        state.isFeatureAnnouncementsEnabled = false;
        state.metamaskNotificationsList = [];
      });
    } catch (e) {
      log.error('Unable to disable notifications', e);
      throw new Error('Unable to disable notifications');
    } finally {
      this.#setIsUpdatingMetamaskNotifications(false);
    }
  }

  /**
   * Deletes on-chain triggers associated with a specific account.
   * This method performs several key operations:
   * 1. Validates Auth & Storage
   * 2. Finds and deletes all triggers associated with the account
   * 3. Disables any related push notifications
   * 4. Updates Storage to reflect new state.
   *
   * **Action** - When a user disables notifications for a given account in settings.
   *
   * @param accounts - The account for which on-chain triggers are to be deleted.
   * @returns A promise that resolves to void or an object containing a success message.
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async deleteOnChainTriggersByAccount(
    accounts: string[],
  ): Promise<UserStorage> {
    try {
      this.#updateUpdatingAccountsState(accounts);
      // Get and Validate BearerToken and User Storage Key
      const { bearerToken, storageKey } =
        await this.#getValidStorageKeyAndBearerToken();

      // Get & Validate User Storage
      const userStorage = await this.#getUserStorage();
      this.#assertUserStorage(userStorage);

      // Get the UUIDs to delete
      const UUIDs = accounts
        .map((a) => Utils.getUUIDsForAccount(userStorage, a.toLowerCase()))
        .flat();

      if (UUIDs.length === 0) {
        return userStorage;
      }

      // Delete these UUIDs (Mutates User Storage)
      await OnChainNotifications.deleteOnChainTriggers(
        userStorage,
        storageKey,
        bearerToken,
        UUIDs,
      );

      // Delete these UUIDs from the push notifications
      await this.#pushNotifications.disablePushNotifications(UUIDs);

      // Update User Storage
      await this.#storage.setNotificationStorage(JSON.stringify(userStorage));
      return userStorage;
    } catch (err) {
      log.error('Failed to delete OnChain triggers', err);
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
  public async updateOnChainTriggersByAccount(
    accounts: string[],
  ): Promise<UserStorage> {
    try {
      this.#updateUpdatingAccountsState(accounts);
      // Get and Validate BearerToken and User Storage Key
      const { bearerToken, storageKey } =
        await this.#getValidStorageKeyAndBearerToken();

      // Get & Validate User Storage
      const userStorage = await this.#getUserStorage();
      this.#assertUserStorage(userStorage);

      // Add any missing triggers
      accounts.forEach((a) => Utils.upsertAddressTriggers(a, userStorage));

      const newTriggers = Utils.traverseUserStorageTriggers(userStorage, {
        mapTrigger: (t) => {
          if (!t.enabled) {
            return t;
          }
          return undefined;
        },
      });

      // Create any missing triggers.
      if (newTriggers.length > 0) {
        // Write te updated userStorage (where triggers are disabled)
        await this.#storage.setNotificationStorage(JSON.stringify(userStorage));

        // Create the triggers
        const triggers = Utils.traverseUserStorageTriggers(userStorage, {
          mapTrigger: (t) => {
            if (
              accounts.some((a) => a.toLowerCase() === t.address.toLowerCase())
            ) {
              return t;
            }
            return undefined;
          },
        });
        await OnChainNotifications.createOnChainTriggers(
          userStorage,
          storageKey,
          bearerToken,
          triggers,
        );
      }

      // Update Push Notifications Triggers
      const UUIDs = Utils.getAllUUIDs(userStorage);
      await this.#pushNotifications.updatePushNotifications(UUIDs);

      // Update the userStorage (where triggers are enabled)
      await this.#storage.setNotificationStorage(JSON.stringify(userStorage));
      return userStorage;
    } catch (err) {
      log.error('Failed to update OnChain triggers', err);
      throw new Error('Failed to update OnChain triggers');
    } finally {
      this.#clearUpdatingAccountsState(accounts);
    }
  }

  /**
   * Fetches the list of metamask notifications.
   * This includes OnChain notifications and Feature Announcements.
   *
   * **Action** - When a user views the notification list page/dropdown
   *
   * @throws {Error} Throws an error if unauthenticated or from other operations.
   */
  public async fetchAndUpdateMetamaskNotifications(): Promise<INotification[]> {
    try {
      this.#setIsFetchingMetamaskNotifications(true);

      // Raw Feature Notifications
      const rawFeatureAnnouncementNotifications = this.state
        .isFeatureAnnouncementsEnabled
        ? await FeatureNotifications.getFeatureAnnouncementNotifications(
            this.#featureAnnouncementEnv,
          ).catch(() => [])
        : [];

      // Raw On Chain Notifications
      const rawOnChainNotifications: OnChainRawNotification[] = [];
      const userStorage = await this.#storage
        .getNotificationStorage()
        .then((s) => s && (JSON.parse(s) as UserStorage))
        .catch(() => null);
      const bearerToken = await this.#auth.getBearerToken().catch(() => null);
      if (userStorage && bearerToken) {
        const notifications =
          await OnChainNotifications.getOnChainNotifications(
            userStorage,
            bearerToken,
          ).catch(() => []);

        rawOnChainNotifications.push(...notifications);
      }

      const readIds = this.state.metamaskNotificationsReadList;

      // Combined Notifications
      const isNotUndefined = <Item>(t?: Item): t is Item => Boolean(t);
      const processAndFilter = (ns: NotificationUnion[]) =>
        ns
          .map((n) => safeProcessNotification(n, readIds))
          .filter(isNotUndefined);

      const featureAnnouncementNotifications = processAndFilter(
        rawFeatureAnnouncementNotifications,
      );
      const onChainNotifications = processAndFilter(rawOnChainNotifications);

      const metamaskNotifications: INotification[] = [
        ...featureAnnouncementNotifications,
        ...onChainNotifications,
      ];
      metamaskNotifications.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      // Update State
      this.update((state) => {
        state.metamaskNotificationsList = metamaskNotifications;
      });

      this.#setIsFetchingMetamaskNotifications(false);
      return metamaskNotifications;
    } catch (err) {
      this.#setIsFetchingMetamaskNotifications(false);
      log.error('Failed to fetch notifications', err);
      throw new Error('Failed to fetch notifications');
    }
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

    try {
      // Filter unread on/off chain notifications
      const onChainNotifications = notifications.filter(
        (notification) =>
          notification.type !== TRIGGER_TYPES.FEATURES_ANNOUNCEMENT &&
          !notification.isRead,
      );

      const featureAnnouncementNotifications = notifications.filter(
        (notification) =>
          notification.type === TRIGGER_TYPES.FEATURES_ANNOUNCEMENT &&
          !notification.isRead,
      );

      // Mark On-Chain Notifications as Read
      if (onChainNotifications.length > 0) {
        const bearerToken = await this.#auth.getBearerToken();

        if (bearerToken) {
          onchainNotificationIds = onChainNotifications.map(
            (notification) => notification.id,
          );
          await OnChainNotifications.markNotificationsAsRead(
            bearerToken,
            onchainNotificationIds,
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
    } catch (err) {
      log.warn('Something failed when marking notifications as read', err);
    }

    // Update the state (state is also used on counter & badge)
    this.update((state) => {
      const currentReadList = state.metamaskNotificationsReadList;
      const newReadIds = [...featureAnnouncementNotificationIds];
      state.metamaskNotificationsReadList = [
        ...new Set([...currentReadList, ...newReadIds]),
      ];

      state.metamaskNotificationsList = state.metamaskNotificationsList.map(
        (notification: INotification) => {
          if (
            newReadIds.includes(notification.id) ||
            onchainNotificationIds.includes(notification.id)
          ) {
            return { ...notification, isRead: true };
          }
          return notification;
        },
      );
    });
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
      this.state.metamaskNotificationsList.some((n) => n.id === notification.id)
    ) {
      return;
    }

    const processedNotification = safeProcessNotification(notification);

    if (processedNotification) {
      this.update((state) => {
        const existingNotificationIds = new Set(
          state.metamaskNotificationsList.map((n) => n.id),
        );
        // Add the new notification only if its ID is not already present in the list
        if (!existingNotificationIds.has(notification.id)) {
          state.metamaskNotificationsList = [
            notification,
            ...state.metamaskNotificationsList,
          ];
        }
      });
    }
  }
}
