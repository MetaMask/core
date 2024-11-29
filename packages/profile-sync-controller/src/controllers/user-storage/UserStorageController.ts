import type {
  AccountsControllerListAccountsAction,
  AccountsControllerUpdateAccountMetadataAction,
  AccountsControllerAccountRenamedEvent,
  AccountsControllerAccountAddedEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { type InternalAccount, isEvmAccountType } from '@metamask/keyring-api';
import {
  type KeyringControllerGetStateAction,
  type KeyringControllerLockEvent,
  type KeyringControllerUnlockEvent,
  type KeyringControllerAddNewAccountAction,
  KeyringTypes,
} from '@metamask/keyring-controller';
import type {
  NetworkControllerAddNetworkAction,
  NetworkControllerGetStateAction,
  NetworkControllerNetworkRemovedEvent,
  NetworkControllerRemoveNetworkAction,
  NetworkControllerUpdateNetworkAction,
} from '@metamask/network-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import { createSHA256Hash } from '../../shared/encryption';
import type { UserStorageFeatureKeys } from '../../shared/storage-schema';
import {
  USER_STORAGE_FEATURE_NAMES,
  type UserStoragePathWithFeatureAndKey,
  type UserStoragePathWithFeatureOnly,
} from '../../shared/storage-schema';
import type { NativeScrypt } from '../../shared/types/encryption';
import { createSnapSignMessageRequest } from '../authentication/auth-snap-requests';
import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
  AuthenticationControllerPerformSignOut,
} from '../authentication/AuthenticationController';
import type { UserStorageAccount } from './accounts/user-storage';
import {
  isNameDefaultAccountName,
  mapInternalAccountToUserStorageAccount,
} from './accounts/user-storage';
import {
  performMainNetworkSync,
  startNetworkSyncing,
} from './network-syncing/controller-integration';
import {
  batchDeleteUserStorage,
  batchUpsertUserStorage,
  deleteUserStorage,
  deleteUserStorageAllFeatureEntries,
  getUserStorage,
  getUserStorageAllFeatureEntries,
  upsertUserStorage,
} from './services';

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
   * Condition used by E2E tests to determine if account syncing has been dispatched at least once.
   */
  hasAccountSyncingSyncedAtLeastOnce: boolean;
  /**
   * Condition used by UI to determine if account syncing is ready to be dispatched.
   */
  isAccountSyncingReadyToBeDispatched: boolean;
  /**
   * Condition used to ensure that we do not perform any network sync mutations until we have synced at least once
   */
  hasNetworkSyncingSyncedAtLeastOnce?: boolean;
};

export const defaultState: UserStorageControllerState = {
  isProfileSyncingEnabled: true,
  isProfileSyncingUpdateLoading: false,
  hasAccountSyncingSyncedAtLeastOnce: false,
  isAccountSyncingReadyToBeDispatched: false,
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
  hasAccountSyncingSyncedAtLeastOnce: {
    persist: true,
    anonymous: false,
  },
  isAccountSyncingReadyToBeDispatched: {
    persist: false,
    anonymous: false,
  },
  hasNetworkSyncingSyncedAtLeastOnce: {
    persist: true,
    anonymous: false,
  },
};

type ControllerConfig = {
  accountSyncing?: {
    maxNumberOfAccountsToAdd?: number;
    /**
     * Callback that fires when account sync adds an account.
     * This is used for analytics.
     */
    onAccountAdded?: (profileId: string) => void;

    /**
     * Callback that fires when account sync updates the name of an account.
     * This is used for analytics.
     */
    onAccountNameUpdated?: (profileId: string) => void;

    /**
     * Callback that fires when an erroneous situation happens during account sync.
     * This is used for analytics.
     */
    onAccountSyncErroneousSituation?: (
      profileId: string,
      situationMessage: string,
    ) => void;
  };

  networkSyncing?: {
    maxNumberOfNetworksToAdd?: number;
    /**
     * Callback that fires when network sync adds a network
     * This is used for analytics.
     * @param profileId - ID for a given User (shared cross devices once authenticated)
     * @param chainId - Chain ID for the network added (in hex)
     */
    onNetworkAdded?: (profileId: string, chainId: string) => void;
    /**
     * Callback that fires when network sync updates a network
     * This is used for analytics.
     * @param profileId - ID for a given User (shared cross devices once authenticated)
     * @param chainId - Chain ID for the network added (in hex)
     */
    onNetworkUpdated?: (profileId: string, chainId: string) => void;
    /**
     * Callback that fires when network sync deletes a network
     * This is used for analytics.
     * @param profileId - ID for a given User (shared cross devices once authenticated)
     * @param chainId - Chain ID for the network added (in hex)
     */
    onNetworkRemoved?: (profileId: string, chainId: string) => void;
  };
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
  | 'performGetStorageAllFeatureEntries'
  | 'performSetStorage'
  | 'getStorageKey'
  | 'enableProfileSyncing'
  | 'disableProfileSyncing'
  | 'syncInternalAccountsWithUserStorage'
  | 'saveInternalAccountToUserStorage'
>;
export type UserStorageControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  UserStorageControllerState
>;
export type Actions =
  | ActionsObj[keyof ActionsObj]
  | UserStorageControllerGetStateAction;
export type UserStorageControllerPerformGetStorage =
  ActionsObj['performGetStorage'];
export type UserStorageControllerPerformGetStorageAllFeatureEntries =
  ActionsObj['performGetStorageAllFeatureEntries'];
export type UserStorageControllerPerformSetStorage =
  ActionsObj['performSetStorage'];
export type UserStorageControllerGetStorageKey = ActionsObj['getStorageKey'];
export type UserStorageControllerEnableProfileSyncing =
  ActionsObj['enableProfileSyncing'];
export type UserStorageControllerDisableProfileSyncing =
  ActionsObj['disableProfileSyncing'];
export type UserStorageControllerSyncInternalAccountsWithUserStorage =
  ActionsObj['syncInternalAccountsWithUserStorage'];
export type UserStorageControllerSaveInternalAccountToUserStorage =
  ActionsObj['saveInternalAccountToUserStorage'];

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
  // Account Syncing
  | AccountsControllerListAccountsAction
  | AccountsControllerUpdateAccountMetadataAction
  | KeyringControllerAddNewAccountAction
  // Network Syncing
  | NetworkControllerGetStateAction
  | NetworkControllerAddNetworkAction
  | NetworkControllerRemoveNetworkAction
  | NetworkControllerUpdateNetworkAction;

// Messenger events
export type UserStorageControllerStateChangeEvent = ControllerStateChangeEvent<
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
export type Events =
  | UserStorageControllerStateChangeEvent
  | UserStorageControllerAccountSyncingInProgress
  | UserStorageControllerAccountSyncingComplete;

export type AllowedEvents =
  | UserStorageControllerStateChangeEvent
  | UserStorageControllerAccountSyncingInProgress
  | UserStorageControllerAccountSyncingComplete
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  // Account Syncing Events
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRenamedEvent
  // Network Syncing Events
  | NetworkControllerNetworkRemovedEvent;

// Messenger
export type UserStorageControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  Actions | AllowedActions,
  Events | AllowedEvents,
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
  // This is replaced with the actual value in the constructor
  // We will remove this once the feature will be released
  #env = {
    isAccountSyncingEnabled: false,
    isNetworkSyncingEnabled: false,
  };

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

  #accounts = {
    isAccountSyncingInProgress: false,
    maxNumberOfAccountsToAdd: 0,
    canSync: () => {
      try {
        this.#assertProfileSyncingEnabled();

        if (this.#accounts.isAccountSyncingInProgress) {
          return false;
        }

        if (!this.#env.isAccountSyncingEnabled) {
          return false;
        }

        if (!this.#auth.isAuthEnabled()) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    },
    setupAccountSyncingSubscriptions: () => {
      this.messagingSystem.subscribe(
        'AccountsController:accountAdded',
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (account) => {
          if (
            !this.#accounts.canSync() ||
            !this.state.hasAccountSyncingSyncedAtLeastOnce
          ) {
            return;
          }

          await this.saveInternalAccountToUserStorage(account);
        },
      );

      this.messagingSystem.subscribe(
        'AccountsController:accountRenamed',
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async (account) => {
          if (
            !this.#accounts.canSync() ||
            !this.state.hasAccountSyncingSyncedAtLeastOnce
          ) {
            return;
          }
          await this.saveInternalAccountToUserStorage(account);
        },
      );
    },
    doesInternalAccountHaveCorrectKeyringType: (account: InternalAccount) => {
      return account.metadata.keyring.type === KeyringTypes.hd;
    },
    getInternalAccountsList: async (): Promise<InternalAccount[]> => {
      // eslint-disable-next-line @typescript-eslint/await-thenable
      const internalAccountsList = await this.messagingSystem.call(
        'AccountsController:listAccounts',
      );

      return internalAccountsList?.filter(
        this.#accounts.doesInternalAccountHaveCorrectKeyringType,
      );
    },
    getUserStorageAccountsList: async (): Promise<
      UserStorageAccount[] | null
    > => {
      const rawAccountsListResponse =
        await this.performGetStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.accounts,
        );

      return (
        rawAccountsListResponse?.map((rawAccount) => JSON.parse(rawAccount)) ??
        null
      );
    },
    saveInternalAccountToUserStorage: async (
      internalAccount: InternalAccount,
    ) => {
      // Map the internal account to the user storage account schema
      const mappedAccount =
        mapInternalAccountToUserStorageAccount(internalAccount);

      await this.performSetStorage(
        // ESLint is confused here.
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${USER_STORAGE_FEATURE_NAMES.accounts}.${internalAccount.address}`,
        JSON.stringify(mappedAccount),
      );
    },
    saveInternalAccountsListToUserStorage: async () => {
      const internalAccountsList =
        await this.#accounts.getInternalAccountsList();

      if (!internalAccountsList) {
        return;
      }

      const internalAccountsListFormattedForUserStorage =
        internalAccountsList.map(mapInternalAccountToUserStorageAccount);

      await this.performBatchSetStorage(
        USER_STORAGE_FEATURE_NAMES.accounts,
        internalAccountsListFormattedForUserStorage.map((account) => [
          account.a,
          JSON.stringify(account),
        ]),
      );
    },
  };

  #config?: ControllerConfig;

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

  #nativeScryptCrypto: NativeScrypt | undefined = undefined;

  getMetaMetricsState: () => boolean;

  constructor({
    messenger,
    state,
    env,
    config,
    getMetaMetricsState,
    nativeScryptCrypto,
  }: {
    messenger: UserStorageControllerMessenger;
    state?: UserStorageControllerState;
    config?: ControllerConfig;
    env?: {
      isAccountSyncingEnabled?: boolean;
      isNetworkSyncingEnabled?: boolean;
    };
    getMetaMetricsState: () => boolean;
    nativeScryptCrypto?: NativeScrypt;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#env.isAccountSyncingEnabled = Boolean(env?.isAccountSyncingEnabled);
    this.#env.isNetworkSyncingEnabled = Boolean(env?.isNetworkSyncingEnabled);
    this.#config = config;

    this.#accounts.maxNumberOfAccountsToAdd =
      config?.accountSyncing?.maxNumberOfAccountsToAdd ?? 100;

    this.getMetaMetricsState = getMetaMetricsState;
    this.#keyringController.setupLockedStateSubscriptions();
    this.#registerMessageHandlers();
    this.#nativeScryptCrypto = nativeScryptCrypto;
    this.#accounts.setupAccountSyncingSubscriptions();

    // Network Syncing
    if (this.#env.isNetworkSyncingEnabled) {
      startNetworkSyncing({
        messenger,
        getStorageConfig: () => this.#getStorageOptions(),
        isMutationSyncBlocked: () =>
          !this.state.hasNetworkSyncingSyncedAtLeastOnce,
      });
    }
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
      'UserStorageController:performGetStorageAllFeatureEntries',
      this.performGetStorageAllFeatureEntries.bind(this),
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
      'UserStorageController:syncInternalAccountsWithUserStorage',
      this.syncInternalAccountsWithUserStorage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:saveInternalAccountToUserStorage',
      this.saveInternalAccountToUserStorage.bind(this),
    );
  }

  async #getStorageOptions() {
    if (!this.state.isProfileSyncingEnabled) {
      return null;
    }

    const { storageKey, bearerToken } =
      await this.#getStorageKeyAndBearerToken();
    return {
      storageKey,
      bearerToken,
      nativeScryptCrypto: this.#nativeScryptCrypto,
    };
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
    path: UserStoragePathWithFeatureAndKey,
  ): Promise<string | null> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    const result = await getUserStorage({
      path,
      bearerToken,
      storageKey,
      nativeScryptCrypto: this.#nativeScryptCrypto,
    });

    return result;
  }

  /**
   * Allows retrieval of all stored data for a specific feature. Data stored is formatted as an array of strings.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @returns the array of decrypted string contents found from user storage (or null if not found)
   */
  public async performGetStorageAllFeatureEntries(
    path: UserStoragePathWithFeatureOnly,
  ): Promise<string[] | null> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    const result = await getUserStorageAllFeatureEntries({
      path,
      bearerToken,
      storageKey,
      nativeScryptCrypto: this.#nativeScryptCrypto,
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
    path: UserStoragePathWithFeatureAndKey,
    value: string,
  ): Promise<void> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    await upsertUserStorage(value, {
      path,
      bearerToken,
      storageKey,
      nativeScryptCrypto: this.#nativeScryptCrypto,
    });
  }

  /**
   * Allows storage of multiple user data entries for one specific feature. Data stored must be string formatted.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @param values - data to store, in the form of an array of `[entryKey, entryValue]` pairs
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  public async performBatchSetStorage<
    FeatureName extends UserStoragePathWithFeatureOnly,
  >(
    path: FeatureName,
    values: [UserStorageFeatureKeys<FeatureName>, string][],
  ): Promise<void> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    await batchUpsertUserStorage(values, {
      path,
      bearerToken,
      storageKey,
      nativeScryptCrypto: this.#nativeScryptCrypto,
    });
  }

  /**
   * Allows deletion of user data. Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @returns nothing. NOTE that an error is thrown if fails to delete data.
   */
  public async performDeleteStorage(
    path: UserStoragePathWithFeatureAndKey,
  ): Promise<void> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    await deleteUserStorage({
      path,
      bearerToken,
      storageKey,
    });
  }

  /**
   * Allows deletion of all user data entries for a specific feature.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @returns nothing. NOTE that an error is thrown if fails to delete data.
   */
  public async performDeleteStorageAllFeatureEntries(
    path: UserStoragePathWithFeatureOnly,
  ): Promise<void> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    await deleteUserStorageAllFeatureEntries({
      path,
      bearerToken,
      storageKey,
    });
  }

  /**
   * Allows delete of multiple user data entries for one specific feature. Data deleted must be string formatted.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @param values - data to store, in the form of an array of entryKey[]
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  public async performBatchDeleteStorage<
    FeatureName extends UserStoragePathWithFeatureOnly,
  >(
    path: FeatureName,
    values: UserStorageFeatureKeys<FeatureName>[],
  ): Promise<void> {
    this.#assertProfileSyncingEnabled();

    const { bearerToken, storageKey } =
      await this.#getStorageKeyAndBearerToken();

    await batchDeleteUserStorage(values, {
      path,
      bearerToken,
      storageKey,
      nativeScryptCrypto: this.#nativeScryptCrypto,
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

  private async setHasAccountSyncingSyncedAtLeastOnce(
    hasAccountSyncingSyncedAtLeastOnce: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.hasAccountSyncingSyncedAtLeastOnce =
        hasAccountSyncingSyncedAtLeastOnce;
    });
  }

  public async setIsAccountSyncingReadyToBeDispatched(
    isAccountSyncingReadyToBeDispatched: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.isAccountSyncingReadyToBeDispatched =
        isAccountSyncingReadyToBeDispatched;
    });
  }

  /**
   * Syncs the internal accounts list with the user storage accounts list.
   * This method is used to make sure that the internal accounts list is up-to-date with the user storage accounts list and vice-versa.
   * It will add new accounts to the internal accounts list, update/merge conflicting names and re-upload the results in some cases to the user storage.
   */
  async syncInternalAccountsWithUserStorage(): Promise<void> {
    if (!this.#accounts.canSync()) {
      return;
    }

    try {
      this.#accounts.isAccountSyncingInProgress = true;

      const profileId = await this.#auth.getProfileId();

      const userStorageAccountsList =
        await this.#accounts.getUserStorageAccountsList();

      if (!userStorageAccountsList || !userStorageAccountsList.length) {
        await this.#accounts.saveInternalAccountsListToUserStorage();
        await this.setHasAccountSyncingSyncedAtLeastOnce(true);
        return;
      }

      // Prepare an array of internal accounts to be saved to the user storage
      const internalAccountsToBeSavedToUserStorage: InternalAccount[] = [];

      // Compare internal accounts list with user storage accounts list
      // First step: compare lengths
      const internalAccountsList =
        await this.#accounts.getInternalAccountsList();

      if (!internalAccountsList || !internalAccountsList.length) {
        throw new Error(`Failed to get internal accounts list`);
      }

      const hasMoreUserStorageAccountsThanInternalAccounts =
        userStorageAccountsList.length > internalAccountsList.length;

      // We don't want to remove existing accounts for a user
      // so we only add new accounts if the user has more accounts in user storage than internal accounts
      if (hasMoreUserStorageAccountsThanInternalAccounts) {
        const numberOfAccountsToAdd =
          Math.min(
            userStorageAccountsList.length,
            this.#accounts.maxNumberOfAccountsToAdd,
          ) - internalAccountsList.length;

        // Create new accounts to match the user storage accounts list
        for (let i = 0; i < numberOfAccountsToAdd; i++) {
          await this.messagingSystem.call('KeyringController:addNewAccount');
          this.#config?.accountSyncing?.onAccountAdded?.(profileId);
        }
      }

      // Second step: compare account names
      // Get the internal accounts list again since new accounts might have been added in the previous step
      const refreshedInternalAccountsList =
        await this.#accounts.getInternalAccountsList();

      const newlyAddedAccounts = refreshedInternalAccountsList.filter(
        (account) =>
          !internalAccountsList.find((a) => a.address === account.address),
      );

      for (const internalAccount of refreshedInternalAccountsList) {
        const userStorageAccount = userStorageAccountsList.find(
          (account) => account.a === internalAccount.address,
        );

        // If the account is not present in user storage
        if (!userStorageAccount) {
          // If the account was just added in the previous step, skip saving it, it's likely to be a bogus account
          if (newlyAddedAccounts.includes(internalAccount)) {
            this.#config?.accountSyncing?.onAccountSyncErroneousSituation?.(
              profileId,
              'An account was added to the internal accounts list but was not present in the user storage accounts list',
            );
            continue;
          }
          // Otherwise, it means that this internal account was present before the sync, and needs to be saved to the user storage
          internalAccountsToBeSavedToUserStorage.push(internalAccount);
          continue;
        }

        // From this point on, we know that the account is present in
        // both the internal accounts list and the user storage accounts list

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

            this.#config?.accountSyncing?.onAccountNameUpdated?.(profileId);
          }
          continue;
        }

        // Internal account has custom name but user storage account has default name
        if (isUserStorageAccountNameDefault) {
          internalAccountsToBeSavedToUserStorage.push(internalAccount);
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
              internalAccountsToBeSavedToUserStorage.push(internalAccount);
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

          const areInternalAndUserStorageAccountNamesEqual =
            internalAccount.metadata.name === userStorageAccount.n;

          if (!areInternalAndUserStorageAccountNamesEqual) {
            this.#config?.accountSyncing?.onAccountNameUpdated?.(profileId);
          }

          continue;
        } else if (internalAccount.metadata.nameLastUpdatedAt !== undefined) {
          internalAccountsToBeSavedToUserStorage.push(internalAccount);
          continue;
        }
      }

      // Save the internal accounts list to the user storage
      if (internalAccountsToBeSavedToUserStorage.length) {
        await this.performBatchSetStorage(
          USER_STORAGE_FEATURE_NAMES.accounts,
          internalAccountsToBeSavedToUserStorage.map((account) => [
            account.address,
            JSON.stringify(mapInternalAccountToUserStorageAccount(account)),
          ]),
        );
      }

      // In case we have corrupted user storage with accounts that don't exist in the internal accounts list
      // Delete those accounts from the user storage
      const userStorageAccountsToBeDeleted = userStorageAccountsList.filter(
        (account) =>
          !refreshedInternalAccountsList.find((a) => a.address === account.a),
      );

      if (userStorageAccountsToBeDeleted.length) {
        await this.performBatchDeleteStorage(
          USER_STORAGE_FEATURE_NAMES.accounts,
          userStorageAccountsToBeDeleted.map((account) => account.a),
        );
        this.#config?.accountSyncing?.onAccountSyncErroneousSituation?.(
          profileId,
          'An account was present in the user storage accounts list but was not found in the internal accounts list after the sync',
        );
      }

      // We do this here and not in the finally statement because we want to make sure that
      // the accounts are saved / updated / deleted at least once before we set this flag
      await this.setHasAccountSyncingSyncedAtLeastOnce(true);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `${controllerName} - failed to sync user storage accounts list - ${errorMessage}`,
      );
    } finally {
      this.#accounts.isAccountSyncingInProgress = false;
    }
  }

  /**
   * Saves an individual internal account to the user storage.
   * @param internalAccount - The internal account to save
   */
  async saveInternalAccountToUserStorage(
    internalAccount: InternalAccount,
  ): Promise<void> {
    if (
      !this.#accounts.canSync() ||
      !isEvmAccountType(internalAccount.type) ||
      !this.#accounts.doesInternalAccountHaveCorrectKeyringType(internalAccount)
    ) {
      return;
    }

    try {
      await this.#accounts.saveInternalAccountToUserStorage(internalAccount);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      throw new Error(
        `${controllerName} - failed to save account to user storage - ${errorMessage}`,
      );
    }
  }

  async syncNetworks() {
    if (!this.#env.isNetworkSyncingEnabled) {
      return;
    }

    const profileId = await this.#auth.getProfileId();

    await performMainNetworkSync({
      messenger: this.messagingSystem,
      getStorageConfig: () => this.#getStorageOptions(),
      maxNetworksToAdd: this.#config?.networkSyncing?.maxNumberOfNetworksToAdd,
      onNetworkAdded: (cId) =>
        this.#config?.networkSyncing?.onNetworkAdded?.(profileId, cId),
      onNetworkUpdated: (cId) =>
        this.#config?.networkSyncing?.onNetworkUpdated?.(profileId, cId),
      onNetworkRemoved: (cId) =>
        this.#config?.networkSyncing?.onNetworkRemoved?.(profileId, cId),
    });

    this.update((s) => {
      s.hasNetworkSyncingSyncedAtLeastOnce = true;
    });
  }
}
