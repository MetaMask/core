import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRenamedEvent,
  AccountsControllerListAccountsAction,
  AccountsControllerUpdateAccountMetadataAction,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { encrypt as ERC1024Encrypt } from '@metamask/eth-sig-util';
import {
  type KeyringControllerGetStateAction,
  type KeyringControllerLockEvent,
  type KeyringControllerUnlockEvent,
  type KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkControllerAddNetworkAction,
  NetworkControllerGetStateAction,
  NetworkControllerNetworkRemovedEvent,
  NetworkControllerRemoveNetworkAction,
  NetworkControllerUpdateNetworkAction,
} from '@metamask/network-controller';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import { hexToBytes } from '@noble/hashes/utils';

import {
  saveInternalAccountToUserStorage,
  syncInternalAccountsWithUserStorage,
} from './account-syncing/controller-integration';
import { setupAccountSyncingSubscriptions } from './account-syncing/setup-subscriptions';
import { BACKUPANDSYNC_FEATURES } from './constants';
import {
  performMainNetworkSync,
  startNetworkSyncing,
} from './network-syncing/controller-integration';
import { Env, UserStorage } from '../../sdk';
import { byteArrayToBase64 } from '../../shared/encryption/utils';
import type { UserStorageFeatureKeys } from '../../shared/storage-schema';
import {
  type UserStoragePathWithFeatureAndKey,
  type UserStoragePathWithFeatureOnly,
} from '../../shared/storage-schema';
import type { NativeScrypt } from '../../shared/types/encryption';
import type {
  AuthenticationControllerGetBearerToken,
  AuthenticationControllerGetSessionProfile,
  AuthenticationControllerIsSignedIn,
  AuthenticationControllerPerformSignIn,
} from '../authentication';
import {
  createSnapDecryptMessageRequest,
  createSnapEncryptionPublicKeyRequest,
  createSnapSignMessageRequest,
} from '../authentication/auth-snap-requests';

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
  /**
   * Condition used by UI to determine if account syncing is enabled.
   */
  isAccountSyncingEnabled: boolean;
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
  /**
   * Condition used to ensure that we do not perform any network sync mutations until we have synced at least once
   */
  hasNetworkSyncingSyncedAtLeastOnce?: boolean;
};

export const defaultState: UserStorageControllerState = {
  isProfileSyncingEnabled: true,
  isProfileSyncingUpdateLoading: false,
  isAccountSyncingEnabled: true,
  hasAccountSyncingSyncedAtLeastOnce: false,
  isAccountSyncingReadyToBeDispatched: false,
  isAccountSyncingInProgress: false,
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
  isAccountSyncingEnabled: {
    persist: true,
    anonymous: true,
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
      sentryContext?: Record<string, unknown>,
    ) => void;
  };

  networkSyncing?: {
    maxNumberOfNetworksToAdd?: number;
    /**
     * Callback that fires when network sync adds a network
     * This is used for analytics.
     *
     * @param profileId - ID for a given User (shared cross devices once authenticated)
     * @param chainId - Chain ID for the network added (in hex)
     */
    onNetworkAdded?: (profileId: string, chainId: string) => void;
    /**
     * Callback that fires when network sync updates a network
     * This is used for analytics.
     *
     * @param profileId - ID for a given User (shared cross devices once authenticated)
     * @param chainId - Chain ID for the network added (in hex)
     */
    onNetworkUpdated?: (profileId: string, chainId: string) => void;
    /**
     * Callback that fires when network sync deletes a network
     * This is used for analytics.
     *
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
  | KeyringControllerWithKeyringAction
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

export type Events = UserStorageControllerStateChangeEvent;

export type AllowedEvents =
  | UserStorageControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  // Account Syncing Events
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRenamedEvent
  // Network Syncing Events
  | NetworkControllerNetworkRemovedEvent;

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
  // This is replaced with the actual value in the constructor
  // We will remove this once the feature will be released
  readonly #env = {
    isNetworkSyncingEnabled: false,
  };

  readonly #userStorage: UserStorage;

  readonly #auth = {
    getProfileId: async () => {
      const sessionProfile = await this.messagingSystem.call(
        'AuthenticationController:getSessionProfile',
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

  constructor({
    messenger,
    state,
    env,
    config,
    nativeScryptCrypto,
  }: {
    messenger: UserStorageControllerMessenger;
    state?: UserStorageControllerState;
    config?: ControllerConfig;
    env?: {
      isNetworkSyncingEnabled?: boolean;
    };
    nativeScryptCrypto?: NativeScrypt;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    this.#env.isNetworkSyncingEnabled = Boolean(env?.isNetworkSyncingEnabled);
    this.#config = config;

    this.#userStorage = new UserStorage(
      {
        env: Env.PRD,
        auth: {
          getAccessToken: () =>
            this.messagingSystem.call(
              'AuthenticationController:getBearerToken',
            ),
          getUserProfile: async () => {
            return await this.messagingSystem.call(
              'AuthenticationController:getSessionProfile',
            );
          },
          signMessage: (message) =>
            this.#snapSignMessage(message as `metamask:${string}`),
        },
        encryption: {
          getEncryptionPublicKey: async () => {
            return await this.#snapGetEncryptionPublicKey();
          },
          decryptMessage: async (ciphertext: string) => {
            return await this.#snapDecryptMessage(ciphertext);
          },
          encryptMessage: async (message: string, publicKeyHex: string) => {
            const erc1024Payload = ERC1024Encrypt({
              // eth-sig-util expects the public key to be in base64 format
              publicKey: byteArrayToBase64(hexToBytes(publicKeyHex)),
              data: message,
              version: 'x25519-xsalsa20-poly1305',
            });
            return JSON.stringify(erc1024Payload);
          },
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

    // Network Syncing
    if (this.#env.isNetworkSyncingEnabled) {
      startNetworkSyncing({
        messenger,
        getUserStorageControllerInstance: () => this,
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
   * @returns the decrypted string contents found from user storage (or null if not found)
   */
  public async performGetStorage(
    path: UserStoragePathWithFeatureAndKey,
  ): Promise<string | null> {
    return await this.#userStorage.getItem(path, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      validateAgainstSchema: true,
    });
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
    return await this.#userStorage.getAllFeatureItems(path, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      validateAgainstSchema: true,
    });
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
    return await this.#userStorage.setItem(path, value, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      validateAgainstSchema: true,
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
    return await this.#userStorage.batchSetItems(path, values, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      validateAgainstSchema: true,
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
    return await this.#userStorage.deleteItem(path, {
      nativeScryptCrypto: this.#nativeScryptCrypto,
      validateAgainstSchema: true,
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
    return await this.#userStorage.deleteAllFeatureItems(path);
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
    return await this.#userStorage.batchDeleteItems(path, values);
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

  #_snapEncryptionKeyCache: string | null = null;

  /**
   * Get an encryption public key from the snap
   *
   * @returns The encryption public key used by the snap
   */
  async #snapGetEncryptionPublicKey(): Promise<string> {
    if (this.#_snapEncryptionKeyCache) {
      return this.#_snapEncryptionKeyCache;
    }

    if (!this.#isUnlocked) {
      throw new Error(
        '#snapGetEncryptionPublicKey - unable to call snap, wallet is locked',
      );
    }

    const result = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapEncryptionPublicKeyRequest(),
    )) as string;

    this.#_snapEncryptionKeyCache = result;

    return result;
  }

  #_snapDecryptMessageCache: Record<string, string> = {};

  /**
   * Calls the snap to attempt to decrypt the message.
   *
   * @param ciphertext - the encrypted text to decrypt.
   * @returns The decrypted message, if decryption was possible.
   */
  async #snapDecryptMessage(ciphertext: string): Promise<string> {
    if (this.#_snapDecryptMessageCache[ciphertext]) {
      return this.#_snapDecryptMessageCache[ciphertext];
    }

    if (!this.#isUnlocked) {
      throw new Error(
        '#snapDecryptMessage - unable to call snap, wallet is locked',
      );
    }

    const result = (await this.messagingSystem.call(
      'SnapController:handleRequest',
      createSnapDecryptMessageRequest(ciphertext),
    )) as string;

    if (result) {
      this.#_snapDecryptMessageCache[ciphertext] = result;
    }

    return result;
  }

  public async setIsBackupAndSyncFeatureEnabled(
    feature: keyof typeof BACKUPANDSYNC_FEATURES,
    enabled: boolean,
  ): Promise<void> {
    try {
      this.#setIsProfileSyncingUpdateLoading(true);

      if (enabled) {
        // If any of the features are enabled, we need to ensure the user is signed in
        const isSignedIn = this.#auth.isSignedIn();
        if (!isSignedIn) {
          await this.#auth.signIn();
        }
      }

      this.update((state) => {
        if (feature === BACKUPANDSYNC_FEATURES.main) {
          state.isProfileSyncingEnabled = enabled;
        }

        if (feature === BACKUPANDSYNC_FEATURES.accountSyncing) {
          state.isAccountSyncingEnabled = enabled;
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
      this.#setIsProfileSyncingUpdateLoading(false);
    }
  }

  #setIsProfileSyncingUpdateLoading(
    isProfileSyncingUpdateLoading: boolean,
  ): void {
    this.update((state) => {
      state.isProfileSyncingUpdateLoading = isProfileSyncingUpdateLoading;
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
   * Syncs the internal accounts list with the user storage accounts list.
   * This method is used to make sure that the internal accounts list is up-to-date with the user storage accounts list and vice-versa.
   * It will add new accounts to the internal accounts list, update/merge conflicting names and re-upload the results in some cases to the user storage.
   */
  async syncInternalAccountsWithUserStorage(): Promise<void> {
    const profileId = await this.#auth.getProfileId();

    await syncInternalAccountsWithUserStorage(
      {
        maxNumberOfAccountsToAdd:
          this.#config?.accountSyncing?.maxNumberOfAccountsToAdd,
        onAccountAdded: () =>
          this.#config?.accountSyncing?.onAccountAdded?.(profileId),
        onAccountNameUpdated: () =>
          this.#config?.accountSyncing?.onAccountNameUpdated?.(profileId),
        onAccountSyncErroneousSituation: (situationMessage, sentryContext) =>
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
    );
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

  async syncNetworks() {
    if (!this.#env.isNetworkSyncingEnabled) {
      return;
    }

    const profileId = await this.#auth.getProfileId();

    await performMainNetworkSync({
      messenger: this.messagingSystem,
      getUserStorageControllerInstance: () => this,
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
