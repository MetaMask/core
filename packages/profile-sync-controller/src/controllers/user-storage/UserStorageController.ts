import type {
  AccountsControllerListAccountsAction,
  AccountsControllerUpdateAccountMetadataAction,
  AccountsControllerAccountRenamedEvent,
  AccountsControllerAccountAddedEvent,
  AccountsControllerUpdateAccountsAction,
} from '@metamask/accounts-controller';
import type {
  AddressBookControllerContactUpdatedEvent,
  AddressBookControllerContactDeletedEvent,
  AddressBookControllerActions,
  AddressBookControllerListAction,
  AddressBookControllerSetAction,
  AddressBookControllerDeleteAction,
} from '@metamask/address-book-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import {
  KeyringTypes,
  type KeyringControllerGetStateAction,
  type KeyringControllerLockEvent,
  type KeyringControllerUnlockEvent,
  type KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import {
  saveInternalAccountToUserStorage,
  syncInternalAccountsWithUserStorage,
} from './account-syncing/controller-integration';
import { setupAccountSyncingSubscriptions } from './account-syncing/setup-subscriptions';
import { BACKUPANDSYNC_FEATURES } from './constants';
import { syncContactsWithUserStorage } from './contact-syncing/controller-integration';
import { setupContactSyncingSubscriptions } from './contact-syncing/setup-subscriptions';
<<<<<<< Updated upstream
import {
  performMainNetworkSync,
  startNetworkSyncing,
} from './network-syncing/controller-integration';
import type {
  UserStorageGenericFeatureKey,
  UserStorageGenericPathWithFeatureAndKey,
  UserStorageGenericPathWithFeatureOnly,
} from '../../sdk';
=======
>>>>>>> Stashed changes
import { Env, UserStorage } from '../../sdk';
import type { NativeScrypt } from '../../shared/types/encryption';
import { EventQueue } from '../../shared/utils/event-queue';
import { createSnapSignMessageRequest } from '../authentication/auth-snap-requests';
import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
} from '../authentication/AuthenticationController';

const controllerName = 'UserStorageController';

// State
export type UserStorageControllerState = {
  /**
   * Condition used by UI and to determine if we can use some of the User Storage methods.
   */
  isBackupAndSyncEnabled: boolean;
  /**
   * Loading state for the backup and sync update
   */
  isBackupAndSyncUpdateLoading: boolean;
  /**
   * Condition used by UI to determine if account syncing is enabled.
   */
  isAccountSyncingEnabled: boolean;
  /**
   * Condition used by UI to determine if contact syncing is enabled.
   */
  isContactSyncingEnabled: boolean;
  /**
   * Condition used by UI to determine if contact syncing is in progress.
   */
  isContactSyncingInProgress: boolean;
  /**
   * Condition used to determine if account syncing has been dispatched at least once.
   * This is used for event listeners to determine if they should be triggered.
   * This is also used in E2E tests for verification purposes.
   */
  hasAccountSyncingSyncedAtLeastOnce: boolean;
  /**
   * Condition used by UI to determine if account syncing is ready to be dispatched.
   */
  isAccountSyncingReadyToBeDispatched: boolean;
  /**
   * Condition used by UI to determine if account syncing is in progress.
   */
  isAccountSyncingInProgress: boolean;
};

export const defaultState: UserStorageControllerState = {
  isBackupAndSyncEnabled: true,
  isBackupAndSyncUpdateLoading: false,
  isAccountSyncingEnabled: true,
  isContactSyncingEnabled: true,
  isContactSyncingInProgress: false,
  hasAccountSyncingSyncedAtLeastOnce: false,
  isAccountSyncingReadyToBeDispatched: false,
  isAccountSyncingInProgress: false,
};

const metadata: StateMetadata<UserStorageControllerState> = {
  isBackupAndSyncEnabled: {
    persist: true,
    anonymous: true,
  },
  isBackupAndSyncUpdateLoading: {
    persist: false,
    anonymous: false,
  },
  isAccountSyncingEnabled: {
    persist: true,
    anonymous: true,
  },
  isContactSyncingEnabled: {
    persist: true,
    anonymous: true,
  },
  isContactSyncingInProgress: {
    persist: false,
    anonymous: false,
  },
  hasAccountSyncingSyncedAtLeastOnce: {
    persist: true,
    anonymous: false,
  },
  isAccountSyncingReadyToBeDispatched: {
    persist: true,
    anonymous: false,
  },
  isAccountSyncingInProgress: {
    persist: false,
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
      sentryContext?: Record<string, unknown>,
    ) => void;
  };
  contactSyncing?: {
    /**
     * Callback that fires when contact sync updates a contact.
     * This is used for analytics.
     */
    onContactUpdated?: (profileId: string) => void;

    /**
     * Callback that fires when contact sync deletes a contact.
     * This is used for analytics.
     */
    onContactDeleted?: (profileId: string) => void;

    /**
     * Callback that fires when an erroneous situation happens during contact sync.
     * This is used for analytics.
     */
    onContactSyncErroneousSituation?: (
      profileId: string,
      situationMessage: string,
      sentryContext?: Record<string, unknown>,
    ) => void;
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
  | 'performBatchSetStorage'
  | 'performDeleteStorage'
  | 'performBatchDeleteStorage'
  | 'getStorageKey'
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
export type UserStorageControllerPerformBatchSetStorage =
  ActionsObj['performBatchSetStorage'];
export type UserStorageControllerPerformDeleteStorage =
  ActionsObj['performDeleteStorage'];
export type UserStorageControllerPerformBatchDeleteStorage =
  ActionsObj['performBatchDeleteStorage'];
export type UserStorageControllerGetStorageKey = ActionsObj['getStorageKey'];

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
  // Account Syncing
  | AccountsControllerListAccountsAction
  | AccountsControllerUpdateAccountMetadataAction
  | AccountsControllerUpdateAccountsAction
  | KeyringControllerWithKeyringAction
  // Contact Syncing
  | AddressBookControllerListAction
  | AddressBookControllerSetAction
  | AddressBookControllerDeleteAction
  | AddressBookControllerActions;

// Messenger events
export type UserStorageControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  UserStorageControllerState
>;

export type Events = UserStorageControllerStateChangeEvent;

export type AllowedEvents =
  | UserStorageControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  // Account Syncing Events
  | AccountsControllerAccountRenamedEvent
  | AccountsControllerAccountAddedEvent
  // Address Book Events
  | AddressBookControllerContactUpdatedEvent
  | AddressBookControllerContactDeletedEvent;

// Messenger
export type UserStorageControllerMessenger = RestrictedMessenger<
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
  readonly #userStorage: UserStorage;

  readonly #auth = {
    getProfileId: async (entropySourceId?: string) => {
      const sessionProfile = await this.messagingSystem.call(
        'AuthenticationController:getSessionProfile',
        entropySourceId,
      );
      return sessionProfile?.profileId;
    },
    isSignedIn: () => {
      return this.messagingSystem.call('AuthenticationController:isSignedIn');
    },
    signIn: async () => {
      return await this.messagingSystem.call(
        'AuthenticationController:performSignIn',
      );
    },
  };

  readonly #config?: ControllerConfig;

  #isUnlocked = false;

  #storageKeyCache: Record<`metamask:${string}`, string> = {};

  readonly #keyringController = {
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

  readonly #nativeScryptCrypto: NativeScrypt | undefined = undefined;

  eventQueue = new EventQueue();

  constructor({
    messenger,
    state,
    config,
    nativeScryptCrypto,
  }: {
    messenger: UserStorageControllerMessenger;
    state?: UserStorageControllerState;
    config?: ControllerConfig;
    nativeScryptCrypto?: NativeScrypt;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#config = config;

    this.#userStorage = new UserStorage(
      {
        env: Env.PRD,
        auth: {
          getAccessToken: (entropySourceId?: string) =>
            this.messagingSystem.call(
              'AuthenticationController:getBearerToken',
              entropySourceId,
            ),
          getUserProfile: async (entropySourceId?: string) => {
            return await this.messagingSystem.call(
              'AuthenticationController:getSessionProfile',
              entropySourceId,
            );
          },
          signMessage: (message: string, entropySourceId?: string) =>
            this.#snapSignMessage(
              message as `metamask:${string}`,
              entropySourceId,
            ),
        },
      },
      {
        storage: {
          getStorageKey: async (message) =>
            this.#storageKeyCache[message] ?? null,
          setStorageKey: async (message, key) => {
            this.#storageKeyCache[message] = key;
          },
        },
      },
    );

    this.#keyringController.setupLockedStateSubscriptions();
    this.#registerMessageHandlers();
    this.#nativeScryptCrypto = nativeScryptCrypto;

    // Account Syncing
    setupAccountSyncingSubscriptions({
      getUserStorageControllerInstance: () => this,
      getMessenger: () => this.messagingSystem,
    });

    // Contact Syncing
    setupContactSyncingSubscriptions({
      getUserStorageControllerInstance: () => this,
      getMessenger: () => this.messagingSystem,
    });
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
      'UserStorageController:performBatchSetStorage',
      this.performBatchSetStorage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:performDeleteStorage',
      this.performDeleteStorage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:performBatchDeleteStorage',
      this.performBatchDeleteStorage.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      'UserStorageController:getStorageKey',
      this.getStorageKey.bind(this),
    );
  }

  /**
   * Allows retrieval of stored data. Data stored is string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @param entropySourceId - The entropy source ID used to generate the encryption key.
   * @returns the decrypted string contents found from user storage (or null if not found)
   */
  public async performGetStorage(
    path: UserStorageGenericPathWithFeatureAndKey,
    entropySourceId?: string,
  ): Promise<string | null> {
    return await this.#userStorage.getItem(path, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      entropySourceId,
    });
  }

  /**
   * Allows retrieval of all stored data for a specific feature. Data stored is formatted as an array of strings.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @param entropySourceId - The entropy source ID used to generate the encryption key.
   * @returns the array of decrypted string contents found from user storage (or null if not found)
   */
  public async performGetStorageAllFeatureEntries(
    path: UserStorageGenericPathWithFeatureOnly,
    entropySourceId?: string,
  ): Promise<string[] | null> {
    return await this.#userStorage.getAllFeatureItems(path, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      entropySourceId,
    });
  }

  /**
   * Allows storage of user data. Data stored must be string formatted.
   * Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @param value - The string data you want to store.
   * @param entropySourceId - The entropy source ID used to generate the encryption key.
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  public async performSetStorage(
    path: UserStorageGenericPathWithFeatureAndKey,
    value: string,
    entropySourceId?: string,
  ): Promise<void> {
    return await this.#userStorage.setItem(path, value, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      entropySourceId,
    });
  }

  /**
   * Allows storage of multiple user data entries for one specific feature. Data stored must be string formatted.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @param values - data to store, in the form of an array of `[entryKey, entryValue]` pairs
   * @param entropySourceId - The entropy source ID used to generate the encryption key.
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  public async performBatchSetStorage(
    path: UserStorageGenericPathWithFeatureOnly,
    values: [UserStorageGenericFeatureKey, string][],
    entropySourceId?: string,
  ): Promise<void> {
    return await this.#userStorage.batchSetItems(path, values, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      entropySourceId,
    });
  }

  /**
   * Allows deletion of user data. Developers can extend the entry path and entry name through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}.${key}` that matches schema
   * @param entropySourceId - The entropy source ID used to generate the encryption key.
   * @returns nothing. NOTE that an error is thrown if fails to delete data.
   */
  public async performDeleteStorage(
    path: UserStorageGenericPathWithFeatureAndKey,
    entropySourceId?: string,
  ): Promise<void> {
    return await this.#userStorage.deleteItem(path, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      entropySourceId,
    });
  }

  /**
   * Allows deletion of all user data entries for a specific feature.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @param entropySourceId - The entropy source ID used to generate the encryption key.
   * @returns nothing. NOTE that an error is thrown if fails to delete data.
   */
  public async performDeleteStorageAllFeatureEntries(
    path: UserStorageGenericPathWithFeatureOnly,
    entropySourceId?: string,
  ): Promise<void> {
    return await this.#userStorage.deleteAllFeatureItems(path, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      entropySourceId,
    });
  }

  /**
   * Allows delete of multiple user data entries for one specific feature. Data deleted must be string formatted.
   * Developers can extend the entry path through the `schema.ts` file.
   *
   * @param path - string in the form of `${feature}` that matches schema
   * @param values - data to store, in the form of an array of entryKey[]
   * @param entropySourceId - The entropy source ID used to generate the encryption key.
   * @returns nothing. NOTE that an error is thrown if fails to store data.
   */
  public async performBatchDeleteStorage(
    path: UserStorageGenericPathWithFeatureOnly,
    values: UserStorageGenericFeatureKey[],
    entropySourceId?: string,
  ): Promise<void> {
    return await this.#userStorage.batchDeleteItems(path, values, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      entropySourceId,
    });
  }

  /**
   * Retrieves the storage key, for internal use only!
   *
   * @returns the storage key
   */
  public async getStorageKey(): Promise<string> {
    return await this.#userStorage.getStorageKey();
  }

  /**
   * Flushes the storage key cache.
   * CAUTION: This is only public for testing purposes.
   * It should not be used in production code.
   */
  public flushStorageKeyCache(): void {
    this.#storageKeyCache = {};
  }

  /**
   * Lists all the available HD keyring metadata IDs.
   * These IDs can be used in a multi-SRP context to segregate data specific to different SRPs.
   *
   * @returns A promise that resolves to an array of HD keyring metadata IDs.
   */
  async listEntropySources() {
    if (!this.#isUnlocked) {
      throw new Error(
        'listEntropySources - unable to list entropy sources, wallet is locked',
      );
    }

    const { keyrings } = this.messagingSystem.call(
      'KeyringController:getState',
    );
    return keyrings
      .filter((keyring) => keyring.type === KeyringTypes.hd.toString())
      .map((keyring) => keyring.metadata.id);
  }

  #_snapSignMessageCache: Record<`metamask:${string}`, string> = {};

  /**
   * Signs a specific message using an underlying auth snap.
   *
   * @param message - A specific tagged message to sign.
   * @param entropySourceId - The entropy source ID used to derive the key,
   * when multiple sources are available (Multi-SRP).
   * @returns A Signature created by the snap.
   */
  async #snapSignMessage(
    message: `metamask:${string}`,
    entropySourceId?: string,
  ): Promise<string> {
    // the message is SRP specific already, so there's no need to use the entropySourceId in the cache
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
      createSnapSignMessageRequest(message, entropySourceId),
    )) as string;

    this.#_snapSignMessageCache[message] = result;

    return result;
  }

  public async setIsBackupAndSyncFeatureEnabled(
    feature: keyof typeof BACKUPANDSYNC_FEATURES,
    enabled: boolean,
  ): Promise<void> {
    try {
      this.#setIsBackupAndSyncUpdateLoading(true);

      if (enabled) {
        // If any of the features are enabled, we need to ensure the user is signed in
        const isSignedIn = this.#auth.isSignedIn();
        if (!isSignedIn) {
          await this.#auth.signIn();
        }
      }

      this.update((state) => {
        if (feature === BACKUPANDSYNC_FEATURES.main) {
          state.isBackupAndSyncEnabled = enabled;
        }

        if (feature === BACKUPANDSYNC_FEATURES.accountSyncing) {
          state.isAccountSyncingEnabled = enabled;
        }

        if (feature === BACKUPANDSYNC_FEATURES.contactSyncing) {
          state.isContactSyncingEnabled = enabled;
        }
      });
    } catch (e) {
      // istanbul ignore next
      const errorMessage = e instanceof Error ? e.message : JSON.stringify(e);
      // istanbul ignore next
      throw new Error(
        `${controllerName} - failed to ${enabled ? 'enable' : 'disable'} ${feature} - ${errorMessage}`,
      );
    } finally {
      this.#setIsBackupAndSyncUpdateLoading(false);
    }
  }

  #setIsBackupAndSyncUpdateLoading(
    isBackupAndSyncUpdateLoading: boolean,
  ): void {
    this.update((state) => {
      state.isBackupAndSyncUpdateLoading = isBackupAndSyncUpdateLoading;
    });
  }

  async setHasAccountSyncingSyncedAtLeastOnce(
    hasAccountSyncingSyncedAtLeastOnce: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.hasAccountSyncingSyncedAtLeastOnce =
        hasAccountSyncingSyncedAtLeastOnce;
    });
  }

  async setIsAccountSyncingReadyToBeDispatched(
    isAccountSyncingReadyToBeDispatched: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.isAccountSyncingReadyToBeDispatched =
        isAccountSyncingReadyToBeDispatched;
    });
  }

  async setIsAccountSyncingInProgress(
    isAccountSyncingInProgress: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.isAccountSyncingInProgress = isAccountSyncingInProgress;
    });
  }

  /**
   * Sets the isContactSyncingInProgress flag to prevent infinite loops during contact synchronization
   *
   * @param isContactSyncingInProgress - Whether contact syncing is in progress
   */
  async setIsContactSyncingInProgress(
    isContactSyncingInProgress: boolean,
  ): Promise<void> {
    this.update((state) => {
      state.isContactSyncingInProgress = isContactSyncingInProgress;
    });
  }

  /**
   * Syncs the internal accounts list with the user storage accounts list.
   * This method is used to make sure that the internal accounts list is up-to-date with the user storage accounts list and vice-versa.
   * It will add new accounts to the internal accounts list, update/merge conflicting names and re-upload the results in some cases to the user storage.
   */
  async syncInternalAccountsWithUserStorage(): Promise<void> {
    const entropySourceIds = await this.listEntropySources();

    try {
      for (const entropySourceId of entropySourceIds) {
        const profileId = await this.#auth.getProfileId(entropySourceId);

        await syncInternalAccountsWithUserStorage(
          {
            maxNumberOfAccountsToAdd:
              this.#config?.accountSyncing?.maxNumberOfAccountsToAdd,
            onAccountAdded: () =>
              this.#config?.accountSyncing?.onAccountAdded?.(profileId),
            onAccountNameUpdated: () =>
              this.#config?.accountSyncing?.onAccountNameUpdated?.(profileId),
            onAccountSyncErroneousSituation: (
              situationMessage,
              sentryContext,
            ) =>
              this.#config?.accountSyncing?.onAccountSyncErroneousSituation?.(
                profileId,
                situationMessage,
                sentryContext,
              ),
          },
          {
            getMessenger: () => this.messagingSystem,
            getUserStorageControllerInstance: () => this,
          },
          entropySourceId,
        );
      }

      // We do this here and not in the finally statement because we want to make sure that
      // the accounts are saved / updated / deleted at least once before we set this flag
      await this.setHasAccountSyncingSyncedAtLeastOnce(true);
    } catch (e) {
      // Silently fail for now
      // istanbul ignore next
      console.error(e);
    }
  }

  /**
   * Saves an individual internal account to the user storage.
   *
   * @param internalAccount - The internal account to save
   */
  async saveInternalAccountToUserStorage(
    internalAccount: InternalAccount,
  ): Promise<void> {
    await saveInternalAccountToUserStorage(internalAccount, {
      getMessenger: () => this.messagingSystem,
      getUserStorageControllerInstance: () => this,
    });
  }

  /**
   * Syncs the address book list with the user storage address book list.
   * This method is used to make sure that the address book list is up-to-date with the user storage address book list and vice-versa.
   * It will add new contacts to the address book list, update/merge conflicting contacts and re-upload the results in some cases to the user storage.
   */
  async syncContactsWithUserStorage(): Promise<void> {
    const profileId = await this.#auth.getProfileId();

    const config = {
      onContactUpdated: () => {
        this.#config?.contactSyncing?.onContactUpdated?.(profileId);
      },
      onContactDeleted: () => {
        this.#config?.contactSyncing?.onContactDeleted?.(profileId);
      },
      onContactSyncErroneousSituation: (
        errorMessage: string,
        sentryContext?: Record<string, unknown>,
      ) => {
        this.#config?.contactSyncing?.onContactSyncErroneousSituation?.(
          profileId,
          errorMessage,
          sentryContext,
        );
      },
    };

    await syncContactsWithUserStorage(config, {
      getMessenger: () => this.messagingSystem,
      getUserStorageControllerInstance: () => this,
    });
  }
}
