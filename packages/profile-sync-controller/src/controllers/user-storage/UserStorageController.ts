import type {
  AddressBookControllerContactUpdatedEvent,
  AddressBookControllerContactDeletedEvent,
  AddressBookControllerActions,
  AddressBookControllerListAction,
  AddressBookControllerSetAction,
  AddressBookControllerDeleteAction,
} from '@metamask/address-book-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type {
  TraceCallback,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';
import { KeyringTypes } from '@metamask/keyring-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';

import { BACKUPANDSYNC_FEATURES } from './constants';
import { syncContactsWithUserStorage } from './contact-syncing/controller-integration';
import { setupContactSyncingSubscriptions } from './contact-syncing/setup-subscriptions';
import type { UserStorageControllerMethodActions } from './UserStorageController-method-action-types';
import type {
  UserStorageGenericFeatureKey,
  UserStorageGenericPathWithFeatureAndKey,
  UserStorageGenericPathWithFeatureOnly,
} from '../../sdk';
import { Env, UserStorage } from '../../sdk';
import type { NativeScrypt } from '../../shared/types/encryption';
import { EventQueue } from '../../shared/utils/event-queue';
import { createSnapSignMessageRequest } from '../authentication/auth-snap-requests';
import type {
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerGetSessionProfileAction,
  AuthenticationControllerIsSignedInAction,
  AuthenticationControllerPerformSignInAction,
} from '../authentication/AuthenticationController-method-action-types';

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
};

export const defaultState: UserStorageControllerState = {
  isBackupAndSyncEnabled: true,
  isBackupAndSyncUpdateLoading: false,
  isAccountSyncingEnabled: true,
  isContactSyncingEnabled: true,
  isContactSyncingInProgress: false,
};

const metadata: StateMetadata<UserStorageControllerState> = {
  isBackupAndSyncEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  isBackupAndSyncUpdateLoading: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  isAccountSyncingEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  isContactSyncingEnabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  isContactSyncingInProgress: {
    includeInStateLogs: false,
    persist: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

type ControllerConfig = {
  env: Env;
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

const MESSENGER_EXPOSED_METHODS = [
  'performGetStorage',
  'performGetStorageAllFeatureEntries',
  'performSetStorage',
  'performBatchSetStorage',
  'performDeleteStorage',
  'performBatchDeleteStorage',
  'getStorageKey',
  'performDeleteStorageAllFeatureEntries',
  'listEntropySources',
  'setIsBackupAndSyncFeatureEnabled',
  'setIsContactSyncingInProgress',
  'syncContactsWithUserStorage',
] as const;

export type UserStorageControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  UserStorageControllerState
>;
export type Actions =
  | UserStorageControllerGetStateAction
  | UserStorageControllerMethodActions;

export type AllowedActions =
  // Keyring Requests
  | KeyringControllerGetStateAction
  // Snap Requests
  | HandleSnapRequest
  // Auth Requests
  | AuthenticationControllerGetBearerTokenAction
  | AuthenticationControllerGetSessionProfileAction
  | AuthenticationControllerPerformSignInAction
  | AuthenticationControllerIsSignedInAction
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
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  // Address Book Events
  | AddressBookControllerContactUpdatedEvent
  | AddressBookControllerContactDeletedEvent;

// Messenger
export type UserStorageControllerMessenger = Messenger<
  typeof controllerName,
  Actions | AllowedActions,
  Events | AllowedEvents
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
  readonly #userStorage: UserStorage;

  readonly #auth = {
    getProfileId: async (entropySourceId?: string) => {
      const sessionProfile = await this.messenger.call(
        'AuthenticationController:getSessionProfile',
        entropySourceId,
      );
      return sessionProfile?.profileId;
    },
    isSignedIn: () => {
      return this.messenger.call('AuthenticationController:isSignedIn');
    },
    signIn: async () => {
      return await this.messenger.call(
        'AuthenticationController:performSignIn',
      );
    },
  };

  readonly #config: ControllerConfig = {
    env: Env.PRD,
  };

  readonly #trace: TraceCallback;

  #isUnlocked = false;

  #storageKeyCache: Record<`metamask:${string}`, string> = {};

  readonly #keyringController = {
    setupLockedStateSubscriptions: () => {
      const { isUnlocked } = this.messenger.call('KeyringController:getState');
      this.#isUnlocked = isUnlocked;

      this.messenger.subscribe('KeyringController:unlock', () => {
        this.#isUnlocked = true;
      });

      this.messenger.subscribe('KeyringController:lock', () => {
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
    trace,
  }: {
    messenger: UserStorageControllerMessenger;
    state?: UserStorageControllerState;
    config?: Partial<ControllerConfig>;
    nativeScryptCrypto?: NativeScrypt;
    trace?: TraceCallback;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#config = {
      ...this.#config,
      ...config,
    };
    this.#trace =
      trace ??
      (async <ReturnType>(
        _request: TraceRequest,
        fn?: (context?: TraceContext) => ReturnType,
      ): Promise<ReturnType> => {
        if (!fn) {
          return undefined as ReturnType;
        }
        return await Promise.resolve(fn());
      });

    this.#userStorage = new UserStorage(
      {
        env: this.#config.env,
        auth: {
          getAccessToken: (entropySourceId?: string) =>
            this.messenger.call(
              'AuthenticationController:getBearerToken',
              entropySourceId,
            ),
          getUserProfile: async (entropySourceId?: string) => {
            return await this.messenger.call(
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

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.#keyringController.setupLockedStateSubscriptions();
    this.#nativeScryptCrypto = nativeScryptCrypto;

    // Contact Syncing
    setupContactSyncingSubscriptions({
      getUserStorageControllerInstance: () => this,
      getMessenger: () => this.messenger,
      trace: this.#trace,
    });
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
  async listEntropySources(): Promise<string[]> {
    if (!this.#isUnlocked) {
      throw new Error(
        'listEntropySources - unable to list entropy sources, wallet is locked',
      );
    }

    const { keyrings } = this.messenger.call('KeyringController:getState');
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

    const result = (await this.messenger.call(
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
      getMessenger: () => this.messenger,
      getUserStorageControllerInstance: () => this,
      trace: this.#trace,
    });
  }
}
