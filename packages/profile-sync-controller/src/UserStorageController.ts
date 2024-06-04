import type {
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  NotificationsControllerDisableMetamaskNotificationsAction,
  NotificationsControllerSelectIsMetamaskNotificationsEnabledAction,
} from '@metamask/notifications-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import type {
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetSessionProfileAction,
  AuthenticationControllerIsSignedInAction,
  AuthenticationControllerPerformSignInAction,
  AuthenticationControllerPerformSignOutAction,
} from '.';
import { createSnapSignMessageRequest } from './AuthSnapRequests';
import { createSHA256Hash } from './encryption';
import type { UserStorageEntryKeys } from './schema';
import {
  getUserStorage,
  upsertUserStorage,
} from './services/user-storage-controller';

const controllerName = 'UserStorageController';

type SessionProfile = {
  identifierId: string;
  profileId: string;
};

export type UserStorageControllerState = {
  /**
   * Condition used by UI and to determine if we can use some of the User Storage methods.
   */
  isProfileSyncingEnabled: boolean;
  /**
   * Loading state for the profile syncing update
   */
  isProfileSyncingUpdateLoading: boolean;
};

/**
 * Returns the default state for the UserStorageController.
 *
 * @returns The default state object with the following properties:
 * - isProfileSyncingEnabled: a boolean indicating whether profile syncing is enabled (default: true)
 * - isProfileSyncingUpdateLoading: a boolean indicating whether the profile syncing update is in progress (default: false)
 */
function getDefaultUserControllerState(): UserStorageControllerState {
  return {
    isProfileSyncingEnabled: true,
    isProfileSyncingUpdateLoading: false,
  };
}

const metadata: StateMetadata<UserStorageControllerState> = {
  isProfileSyncingEnabled: {
    persist: true,
    anonymous: true,
  },
  isProfileSyncingUpdateLoading: {
    persist: false,
    anonymous: false,
  },
};

export type UserStorageControllerPerformGetStorageAction = {
  type: `${typeof controllerName}:performGetStorage`;
  handler: UserStorageController['performGetStorage'];
};
export type UserStorageControllerPerformSetStorageAction = {
  type: `${typeof controllerName}:performSetStorage`;
  handler: UserStorageController['performSetStorage'];
};
export type UserStorageControllerGetStorageKeyAction = {
  type: `${typeof controllerName}:getStorageKey`;
  handler: UserStorageController['getStorageKey'];
};
export type UserStorageControllerEnableProfileSyncingAction = {
  type: `${typeof controllerName}:enableProfileSyncing`;
  handler: UserStorageController['enableProfileSyncing'];
};
export type UserStorageControllerDisableProfileSyncingAction = {
  type: `${typeof controllerName}:disableProfileSyncing`;
  handler: UserStorageController['disableProfileSyncing'];
};
export type UserStorageControllerActions =
  | UserStorageControllerPerformGetStorageAction
  | UserStorageControllerPerformSetStorageAction
  | UserStorageControllerGetStorageKeyAction
  | UserStorageControllerEnableProfileSyncingAction
  | UserStorageControllerDisableProfileSyncingAction;

export type AllowedActions =
  // Snap Requests
  | HandleSnapRequest
  // Auth Requests
  | AuthenticationControllerGetBearerTokenAction
  | AuthenticationControllerGetSessionProfileAction
  | AuthenticationControllerPerformSignInAction
  | AuthenticationControllerIsSignedInAction
  | AuthenticationControllerPerformSignOutAction
  // Metamask Notifications
  | NotificationsControllerDisableMetamaskNotificationsAction
  | NotificationsControllerSelectIsMetamaskNotificationsEnabledAction;

export type UserStorageControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  UserStorageControllerActions | AllowedActions,
  never,
  AllowedActions['type'],
  never
>;

/**
 * Reusable controller that allows any team to store synchronized data for a given user.
 * These can be settings shared cross MetaMask clients, or data we want to persist when uninstalling/reinstalling.
 *
 * NOTE:
 * - data stored on UserStorage is FULLY encrypted, with the only keys stored/managed on the client.
 * - No one can access this data unless they are have the SRP and are able to run the signing snap.
 */
export class UserStorageController extends BaseController<
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
      const sessionProfile = (await this.messagingSystem.call(
        'AuthenticationController:getSessionProfile',
      )) as SessionProfile;
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
      return await this.messagingSystem.call(
        'AuthenticationController:performSignOut',
      );
    },
  };

  #metamaskNotifications = {
    disableMetamaskNotifications: async () => {
      return await this.messagingSystem.call(
        'NotificationsController:disableMetamaskNotifications',
      );
    },
    selectIsMetamaskNotificationsEnabled: async () => {
      return await this.messagingSystem.call(
        'NotificationsController:selectIsMetamaskNotificationsEnabled',
      );
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
      state: { ...getDefaultUserControllerState(), ...params.state },
    });

    this.getMetaMetricsState = params.getMetaMetricsState;
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
  }

  async enableProfileSyncing(): Promise<void> {
    try {
      await this.#setIsProfileSyncingUpdateLoading(true);

      const authEnabled = this.#auth.isAuthEnabled();
      if (!authEnabled) {
        await this.#auth.signIn();
      }

      this.update((state) => {
        state.isProfileSyncingEnabled = true;
      });

      await this.#setIsProfileSyncingUpdateLoading(false);
    } catch (e) {
      await this.#setIsProfileSyncingUpdateLoading(false);
      const errorMessage = e instanceof Error ? e.message : e;
      throw new Error(
        `${controllerName} - failed to enable profile syncing - ${errorMessage}`,
      );
    }
  }

  async setIsProfileSyncingEnabled(
    isProfileSyncingEnabled: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.isProfileSyncingEnabled = isProfileSyncingEnabled;
    });
  }

  async disableProfileSyncing(): Promise<void> {
    const isAlreadyDisabled = !this.state.isProfileSyncingEnabled;
    if (isAlreadyDisabled) {
      return;
    }

    try {
      await this.#setIsProfileSyncingUpdateLoading(true);

      const isMetamaskNotificationsEnabled =
        await this.#metamaskNotifications.selectIsMetamaskNotificationsEnabled();

      if (isMetamaskNotificationsEnabled) {
        await this.#metamaskNotifications.disableMetamaskNotifications();
      }

      const isMetaMetricsParticipation = this.getMetaMetricsState();

      if (!isMetaMetricsParticipation) {
        await this.messagingSystem.call(
          'AuthenticationController:performSignOut',
        );
      }

      await this.#setIsProfileSyncingUpdateLoading(false);

      this.update((state) => {
        state.isProfileSyncingEnabled = false;
      });
    } catch (e) {
      await this.#setIsProfileSyncingUpdateLoading(false);
      const errorMessage = e instanceof Error ? e.message : e;
      throw new Error(
        `${controllerName} - failed to disable profile syncing - ${errorMessage}`,
      );
    }
  }

  /**
   * Allows retrieval of stored data. Data stored is string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param entryKey - The entry you want to retrieve data from.
   * @returns the decrypted string contents found from user storage (or null if not found)
   */
  async performGetStorage(
    entryKey: UserStorageEntryKeys,
  ): Promise<string | null> {
    this.#assertProfileSyncingEnabled();
    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();
    const result = await getUserStorage({
      entryKey,
      bearerToken,
      storageKey,
    });

    return result;
  }

  /**
   * Allows storage of user data. Data stored must be string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param entryKey - The entry you want to store data in.
   * @param value - The string data you want to store.
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  async performSetStorage(
    entryKey: UserStorageEntryKeys,
    value: string,
  ): Promise<void> {
    this.#assertProfileSyncingEnabled();
    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    await upsertUserStorage(value, {
      entryKey,
      bearerToken,
      storageKey,
    });
  }

  /**
   * Retrieves the storage key, for internal use only!
   *
   * @returns the storage key
   */
  async getStorageKey(): Promise<string> {
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
    const id = await this.#auth.getProfileId();
    if (!id) {
      throw new Error('UserStorageController - unable to create storage key');
    }

    const storageKeySignature = await this.#snapSignMessage(`metamask:${id}`);
    const storageKey = createSHA256Hash(storageKeySignature);
    return storageKey;
  }

  /**
   * Signs a specific message using an underlying auth snap.
   *
   * @param message - A specific tagged message to sign.
   * @returns A Signature created by the snap.
   */
  #snapSignMessage(message: `metamask:${string}`): Promise<string> {
    return this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapSignMessageRequest(message),
    ) as Promise<string>;
  }

  async #setIsProfileSyncingUpdateLoading(
    isProfileSyncingUpdateLoading: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.isProfileSyncingUpdateLoading = isProfileSyncingUpdateLoading;
    });
  }
}
