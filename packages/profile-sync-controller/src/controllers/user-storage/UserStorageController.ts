import type {
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import { createSnapSignMessageRequest } from '../authentication/auth-snap-requests';
import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
  AuthenticationControllerPerformSignOut,
} from '../authentication/AuthenticationController';
import { createSHA256Hash } from './encryption';
import type { UserStorageEntryKeys } from './schema';
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
  isProfileSyncingEnabled: boolean;
  /**
   * Loading state for the profile syncing update
   */
  isProfileSyncingUpdateLoading: boolean;
};

const defaultState: UserStorageControllerState = {
  isProfileSyncingEnabled: true,
  isProfileSyncingUpdateLoading: false,
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

// Allowed Actions
export type AllowedActions =
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
  | NotificationServicesControllerSelectIsNotificationServicesEnabled;

// Messenger
export type UserStorageControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  Actions | AllowedActions,
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
        this.messagingSystem.call('AuthenticationController:performSignOut');
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
   * @param entryKey - entry key that matches schema
   * @returns the decrypted string contents found from user storage (or null if not found)
   */
  public async performGetStorage(
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
   * @param entryKey - entry key that matches schema
   * @param value - The string data you want to store.
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  public async performSetStorage(
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

  #setIsProfileSyncingUpdateLoading(
    isProfileSyncingUpdateLoading: boolean,
  ): void {
    this.update((state) => {
      state.isProfileSyncingUpdateLoading = isProfileSyncingUpdateLoading;
    });
  }
}
