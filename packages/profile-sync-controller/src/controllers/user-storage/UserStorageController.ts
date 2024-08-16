import type {
  AccountsControllerListAccountsAction,
  AccountsControllerSetAccountNameAction,
  AccountsControllerUpdateAccountMetadataAction,
} from '@metamask/accounts-controller';
import type {
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-api';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
  KeyringControllerAddNewAccountAction,
} from '@metamask/keyring-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import { createSnapSignMessageRequest } from '../authentication/auth-snap-requests';
import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
  AuthenticationControllerPerformSignOut,
} from '../authentication/AuthenticationController';
import {
  extractUserStorageAccountsListFromResponse,
  formatUserStorageAccountsListPayload,
  isNameDefaultAccountName,
  mapInternalAccountsListToUserStorageAccountsList,
  type UserStorageAccountsList,
} from './accounts/user-storage';
import { createSHA256Hash } from './encryption';
import type { UserStoragePath } from './schema';
import { getUserStorage, upsertUserStorage } from './services';

// TODO: fix external dependencies
export declare type NotificationServicesControllerDisableNotificationServices =
  {
    type: `NotificationServicesController:disableNotificationServices`;
    handler: () => Promise<void>;
  };

export declare type NotificationServicesControllerSelectIsNotificationServicesEnabled =
  {
    type: `NotificationServicesController:selectIsNotificationServicesEnabled`;
    handler: () => boolean;
  };

const controllerName = 'UserStorageController';

// State
export type UserStorageControllerState = {
  /**
   * Condition used by UI and to determine if we can use some of the User Storage methods.
   */
  isProfileSyncingEnabled: boolean | null;
  /**
   * Loading state for the profile syncing update
   */
  isProfileSyncingUpdateLoading: boolean;
  /**
   * Loading state for the account syncing update
   */
  isUserStorageAccountSyncingInProgress: boolean;
};

export const defaultState: UserStorageControllerState = {
  isProfileSyncingEnabled: true,
  isProfileSyncingUpdateLoading: false,
  isUserStorageAccountSyncingInProgress: false,
};

const metadata: StateMetadata<UserStorageControllerState> = {
  isProfileSyncingEnabled: {
    persist: true,
    anonymous: true,
  },
  isProfileSyncingUpdateLoading: {
    persist: false,
    anonymous: false,
  },
  isUserStorageAccountSyncingInProgress: {
    persist: false,
    anonymous: false,
  },
};

// Messenger Actions
type CreateActionsObj<Controller extends keyof UserStorageController> = {
  [K in Controller]: {
    type: `${typeof controllerName}:${K}`;
    handler: UserStorageController[K];
  };
};
type ActionsObj = CreateActionsObj<
  | 'performGetStorage'
  | 'performSetStorage'
  | 'getStorageKey'
  | 'enableProfileSyncing'
  | 'disableProfileSyncing'
  | 'syncInternalAccountsListWithUserStorage'
>;
export type Actions = ActionsObj[keyof ActionsObj];
export type UserStorageControllerPerformGetStorage =
  ActionsObj['performGetStorage'];
export type UserStorageControllerPerformSetStorage =
  ActionsObj['performSetStorage'];
export type UserStorageControllerGetStorageKey = ActionsObj['getStorageKey'];
export type UserStorageControllerEnableProfileSyncing =
  ActionsObj['enableProfileSyncing'];
export type UserStorageControllerDisableProfileSyncing =
  ActionsObj['disableProfileSyncing'];
export type UserStorageControllerSyncInternalAccountsListWithUserStorage =
  ActionsObj['syncInternalAccountsListWithUserStorage'];

// Allowed Actions
export type AllowedActions =
  // Keyring Requests
  | KeyringControllerGetStateAction
  // Snap Requests
  | HandleSnapRequest
  // Auth Requests
  | AuthenticationControllerGetBearerToken
  | AuthenticationControllerGetSessionProfile
  | AuthenticationControllerPerformSignIn
  | AuthenticationControllerIsSignedIn
  | AuthenticationControllerPerformSignOut
  // Metamask Notifications
  | NotificationServicesControllerDisableNotificationServices
  | NotificationServicesControllerSelectIsNotificationServicesEnabled
  // Account syncing
  | AccountsControllerListAccountsAction
  | AccountsControllerSetAccountNameAction
  | AccountsControllerUpdateAccountMetadataAction
  | KeyringControllerAddNewAccountAction;

// Messenger events
export type UserStorageControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  UserStorageControllerState
>;
export type UserStorageControllerAccountSyncingInProgress = {
  type: `${typeof controllerName}:accountSyncingInProgress`;
  payload: [boolean];
};
export type UserStorageControllerAccountSyncingComplete = {
  type: `${typeof controllerName}:accountSyncingComplete`;
  payload: [boolean];
};

export type AllowedEvents =
  | UserStorageControllerChangeEvent
  | UserStorageControllerAccountSyncingInProgress
  | UserStorageControllerAccountSyncingComplete
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

// Messenger
export type UserStorageControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  Actions | AllowedActions,
  AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Reusable controller that allows any team to store synchronized data for a given user.
 * These can be settings shared cross MetaMask clients, or data we want to persist when uninstalling/reinstalling.
 *
 * NOTE:
 * - data stored on UserStorage is FULLY encrypted, with the only keys stored/managed on the client.
 * - No one can access this data unless they are have the SRP and are able to run the signing snap.
 */
export default class UserStorageController extends BaseController<
  typeof controllerName,
  UserStorageControllerState,
  UserStorageControllerMessenger
> {
  #auth = {
    getBearerToken: async () => {
      return await this.messagingSystem.call(
        'AuthenticationController:getBearerToken',
      );
    },
    getProfileId: async () => {
      const sessionProfile = await this.messagingSystem.call(
        'AuthenticationController:getSessionProfile',
      );
      return sessionProfile?.profileId;
    },
    isAuthEnabled: () => {
      return this.messagingSystem.call('AuthenticationController:isSignedIn');
    },
    signIn: async () => {
      return await this.messagingSystem.call(
        'AuthenticationController:performSignIn',
      );
    },
    signOut: async () => {
      return this.messagingSystem.call(
        'AuthenticationController:performSignOut',
      );
    },
  };

  #notificationServices = {
    disableNotificationServices: async () => {
      return await this.messagingSystem.call(
        'NotificationServicesController:disableNotificationServices',
      );
    },
    selectIsNotificationServicesEnabled: async () => {
      return this.messagingSystem.call(
        'NotificationServicesController:selectIsNotificationServicesEnabled',
      );
    },
  };

  #accounts = {
    setIsUserStorageAccountSyncingInProgress: async (
      isUserStorageAccountSyncingInProgress: boolean,
    ) => {
      // Publish event
      const eventToPublish = isUserStorageAccountSyncingInProgress
        ? 'UserStorageController:accountSyncingInProgress'
        : 'UserStorageController:accountSyncingComplete';

      this.messagingSystem.publish(
        eventToPublish,
        isUserStorageAccountSyncingInProgress,
      );

      // Update state
      this.update((state) => {
        state.isUserStorageAccountSyncingInProgress =
          isUserStorageAccountSyncingInProgress;
      });
    },
    getInternalAccountsList: async (): Promise<InternalAccount[]> => {
      return this.messagingSystem.call('AccountsController:listAccounts');
    },
    getUserStorageAccountsList: async () => {
      const rawAccountsListResponse = await this.performGetStorage(
        'accounts.list',
      );

      return extractUserStorageAccountsListFromResponse(
        rawAccountsListResponse,
      );
    },
    setUserStorageAccountsList: async (
      accountsList: UserStorageAccountsList,
    ) => {
      const payload = formatUserStorageAccountsListPayload(accountsList);

      return await this.performSetStorage(
        'accounts.list',
        JSON.stringify(payload),
      );
    },
    saveInternalAccountsListToUserStorage: async () => {
      const internalAccountsList =
        await this.#accounts.getInternalAccountsList();

      if (!internalAccountsList) {
        return;
      }

      // Map the internal accounts to the user storage accounts list schema
      const mappedAccountsList =
        mapInternalAccountsListToUserStorageAccountsList(internalAccountsList);

      await this.#accounts.setUserStorageAccountsList(mappedAccountsList);
    },
  };

  #isUnlocked = false;

  #keyringController = {
    setupLockedStateSubscriptions: () => {
      const { isUnlocked } = this.messagingSystem.call(
        'KeyringController:getState',
      );
      this.#isUnlocked = isUnlocked;

      this.messagingSystem.subscribe('KeyringController:unlock', () => {
        this.#isUnlocked = true;
      });

      this.messagingSystem.subscribe('KeyringController:lock', () => {
        this.#isUnlocked = false;
      });
    },
  };

  getMetaMetricsState: () => boolean;

  constructor(params: {
    messenger: UserStorageControllerMessenger;
    state?: UserStorageControllerState;
    getMetaMetricsState: () => boolean;
  }) {
    super({
      messenger: params.messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...params.state },
    });

    this.getMetaMetricsState = params.getMetaMetricsState;
    this.#keyringController.setupLockedStateSubscriptions();
    this.#registerMessageHandlers();
  }

  /**
   * Constructor helper for registering this controller's messaging system
   * actions.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      'UserStorageController:performGetStorage',
      this.performGetStorage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:performSetStorage',
      this.performSetStorage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:getStorageKey',
      this.getStorageKey.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:enableProfileSyncing',
      this.enableProfileSyncing.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:disableProfileSyncing',
      this.disableProfileSyncing.bind(this),
    );
    this.messagingSystem.registerActionHandler(
      'UserStorageController:syncInternalAccountsListWithUserStorage',
      this.syncInternalAccountsListWithUserStorage.bind(this),
    );
  }

  public async enableProfileSyncing(): Promise<void> {
    try {
      this.#setIsProfileSyncingUpdateLoading(true);

      const authEnabled = this.#auth.isAuthEnabled();
      if (!authEnabled) {
        await this.#auth.signIn();
      }

      this.update((state) => {
        state.isProfileSyncingEnabled = true;
      });

      this.#setIsProfileSyncingUpdateLoading(false);
    } catch (e) {
      this.#setIsProfileSyncingUpdateLoading(false);
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `${controllerName} - failed to enable profile syncing - ${errorMessage}`,
      );
    }
  }

  public async setIsProfileSyncingEnabled(
    isProfileSyncingEnabled: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.isProfileSyncingEnabled = isProfileSyncingEnabled;
    });
  }

  public async disableProfileSyncing(): Promise<void> {
    const isAlreadyDisabled = !this.state.isProfileSyncingEnabled;
    if (isAlreadyDisabled) {
      return;
    }

    try {
      this.#setIsProfileSyncingUpdateLoading(true);

      const isNotificationServicesEnabled =
        await this.#notificationServices.selectIsNotificationServicesEnabled();

      if (isNotificationServicesEnabled) {
        await this.#notificationServices.disableNotificationServices();
      }

      const isMetaMetricsParticipation = this.getMetaMetricsState();

      if (!isMetaMetricsParticipation) {
        await this.#auth.signOut();
      }

      this.#setIsProfileSyncingUpdateLoading(false);

      this.update((state) => {
        state.isProfileSyncingEnabled = false;
      });
    } catch (e) {
      this.#setIsProfileSyncingUpdateLoading(false);
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `${controllerName} - failed to disable profile syncing - ${errorMessage}`,
      );
    }
  }

  /**
   * Allows retrieval of stored data. Data stored is string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @returns the decrypted string contents found from user storage (or null if not found)
   */
  public async performGetStorage(
    path: UserStoragePath,
  ): Promise<string | null> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    const result = await getUserStorage({
      path,
      bearerToken,
      storageKey,
    });

    return result;
  }

  /**
   * Allows storage of user data. Data stored must be string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @param value - The string data you want to store.
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  public async performSetStorage(
    path: UserStoragePath,
    value: string,
  ): Promise<void> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    await upsertUserStorage(value, {
      path,
      bearerToken,
      storageKey,
    });
  }

  /**
   * Retrieves the storage key, for internal use only!
   *
   * @returns the storage key
   */
  public async getStorageKey(): Promise<string> {
    this.#assertProfileSyncingEnabled();
    const storageKey = await this.#createStorageKey();
    return storageKey;
  }

  #assertProfileSyncingEnabled(): void {
    if (!this.state.isProfileSyncingEnabled) {
      throw new Error(
        `${controllerName}: Unable to call method, user is not authenticated`,
      );
    }
  }

  /**
   * Utility to get the bearer token and storage key
   */
  async #getStorageKeyAndBearerToken(): Promise<{
    bearerToken: string;
    storageKey: string;
  }> {
    const bearerToken = await this.#auth.getBearerToken();
    if (!bearerToken) {
      throw new Error('UserStorageController - unable to get bearer token');
    }
    const storageKey = await this.#createStorageKey();

    return { bearerToken, storageKey };
  }

  /**
   * Rather than storing the storage key, we can compute the storage key when needed.
   *
   * @returns the storage key
   */
  async #createStorageKey(): Promise<string> {
    const id: string = await this.#auth.getProfileId();
    if (!id) {
      throw new Error('UserStorageController - unable to create storage key');
    }

    const storageKeySignature = await this.#snapSignMessage(`metamask:${id}`);
    const storageKey = createSHA256Hash(storageKeySignature);
    return storageKey;
  }

  #_snapSignMessageCache: Record<`metamask:${string}`, string> = {};

  /**
   * Signs a specific message using an underlying auth snap.
   *
   * @param message - A specific tagged message to sign.
   * @returns A Signature created by the snap.
   */
  async #snapSignMessage(message: `metamask:${string}`): Promise<string> {
    if (this.#_snapSignMessageCache[message]) {
      return this.#_snapSignMessageCache[message];
    }

    if (!this.#isUnlocked) {
      throw new Error(
        '#snapSignMessage - unable to call snap, wallet is locked',
      );
    }

    const result = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapSignMessageRequest(message),
    )) as string;

    this.#_snapSignMessageCache[message] = result;

    return result;
  }

  #setIsProfileSyncingUpdateLoading(
    isProfileSyncingUpdateLoading: boolean,
  ): void {
    this.update((state) => {
      state.isProfileSyncingUpdateLoading = isProfileSyncingUpdateLoading;
    });
  }

  /**
   * Syncs the internal accounts list with the user storage accounts list.
   * This method is used to make sure that the internal accounts list is up-to-date with the user storage accounts list and vice-versa.
   * It will add new accounts to the internal accounts list, update/merge conflicting names and re-upload the result to the user storage.
   */
  async syncInternalAccountsListWithUserStorage(): Promise<void> {
    try {
      this.#assertProfileSyncingEnabled();

      await this.#accounts.setIsUserStorageAccountSyncingInProgress(true);

      const userStorageAccountsList =
        await this.#accounts.getUserStorageAccountsList();

      if (!userStorageAccountsList) {
        await this.#accounts.saveInternalAccountsListToUserStorage();
        await this.#accounts.setIsUserStorageAccountSyncingInProgress(false);
        return;
      }

      // Compare internal accounts list with user storage accounts list
      // First step: compare lengths
      let internalAccountsList = await this.#accounts.getInternalAccountsList();

      if (!internalAccountsList || !internalAccountsList.length) {
        throw new Error(`Failed to get internal accounts list`);
      }

      const hasMoreInternalAccountsThanUserStorageAccounts =
        internalAccountsList.length > userStorageAccountsList.length;

      // We don't want to remove existing accounts for a user
      // so we only add new accounts if the user has more accounts than the internal accounts list
      if (!hasMoreInternalAccountsThanUserStorageAccounts) {
        const numberOfAccountsToAdd =
          userStorageAccountsList.length - internalAccountsList.length;

        // Create new accounts to match the user storage accounts list
        const addNewAccountsPromises = Array.from({
          length: numberOfAccountsToAdd,
        }).map(async () => {
          await this.messagingSystem.call('KeyringController:addNewAccount');
        });

        await Promise.all(addNewAccountsPromises);
      }

      // Second step: compare account names
      // Get the internal accounts list again since new accounts might have been added in the previous step
      internalAccountsList = await this.#accounts.getInternalAccountsList();

      for await (const internalAccount of internalAccountsList) {
        const userStorageAccount = userStorageAccountsList.find(
          (account) => account.a === internalAccount.address,
        );

        if (!userStorageAccount) {
          continue;
        }

        // One or both accounts have default names
        const isInternalAccountNameDefault = isNameDefaultAccountName(
          internalAccount.metadata.name,
        );
        const isUserStorageAccountNameDefault = isNameDefaultAccountName(
          userStorageAccount.n,
        );

        // Internal account has default name
        if (isInternalAccountNameDefault) {
          if (!isUserStorageAccountNameDefault) {
            this.messagingSystem.call(
              'AccountsController:updateAccountMetadata',
              internalAccount.id,
              {
                name: userStorageAccount.n,
              },
            );
          }
          continue;
        }

        // Internal account has custom name but user storage account has default name
        if (isUserStorageAccountNameDefault) {
          continue;
        }

        // Both accounts have custom names

        // User storage account has a nameLastUpdatedAt timestamp
        // Note: not storing the undefined checks in constants to act as a type guard
        if (userStorageAccount.nlu !== undefined) {
          if (internalAccount.metadata.nameLastUpdatedAt !== undefined) {
            const isInternalAccountNameNewer =
              internalAccount.metadata.nameLastUpdatedAt >
              userStorageAccount.nlu;

            if (isInternalAccountNameNewer) {
              continue;
            }
          }

          this.messagingSystem.call(
            'AccountsController:updateAccountMetadata',
            internalAccount.id,
            {
              name: userStorageAccount.n,
              nameLastUpdatedAt: userStorageAccount.nlu,
            },
          );

          continue;
        }
      }

      await this.#accounts.saveInternalAccountsListToUserStorage();
      await this.#accounts.setIsUserStorageAccountSyncingInProgress(false);
    } catch (e) {
      await this.#accounts.setIsUserStorageAccountSyncingInProgress(false);

      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `${controllerName} - failed to sync user storage accounts list - ${errorMessage}`,
      );
    }
  }
}
