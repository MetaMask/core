import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  KeyPair,
  RecoverEncryptionKeyResult,
  SEC1EncodedPublicKey,
} from '@metamask/toprf-secure-backup';
import {
  ToprfSecureBackup,
  TOPRFErrorCode,
  TOPRFError,
} from '@metamask/toprf-secure-backup';
import { base64ToBytes, bytesToBase64, bigIntToHex } from '@metamask/utils';
import { gcm } from '@noble/ciphers/aes';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils';
import { managedNonce } from '@noble/ciphers/webcrypto';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Mutex } from 'async-mutex';

import {
  assertIsPasswordOutdatedCacheValid,
  assertIsValidVaultData,
} from './assertions';
import type { AuthConnection } from './constants';
import {
  controllerName,
  PASSWORD_OUTDATED_CACHE_TTL_MS,
  SecretType,
  SeedlessOnboardingControllerErrorMessage,
  Web3AuthNetwork,
} from './constants';
import { PasswordSyncError, RecoveryError } from './errors';
import { projectLogger, createModuleLogger } from './logger';
import { SecretMetadata } from './SecretMetadata';
import type {
  MutuallyExclusiveCallback,
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerState,
  AuthenticatedUserDetails,
  SocialBackupsMetadata,
  SRPBackedUpUserDetails,
  VaultEncryptor,
  RefreshJWTToken,
  RevokeRefreshToken,
} from './types';
import { decodeJWTToken, decodeNodeAuthToken } from './utils';

const log = createModuleLogger(projectLogger, controllerName);

/**
 * Get the default state for the Seedless Onboarding Controller.
 *
 * @returns The default state for the Seedless Onboarding Controller.
 */
export function getDefaultSeedlessOnboardingControllerState(): SeedlessOnboardingControllerState {
  return {
    socialBackupsMetadata: [],
  };
}

/**
 * Seedless Onboarding Controller State Metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const seedlessOnboardingMetadata: StateMetadata<SeedlessOnboardingControllerState> =
  {
    vault: {
      persist: true,
      anonymous: false,
    },
    socialBackupsMetadata: {
      persist: true,
      anonymous: true,
    },
    nodeAuthTokens: {
      persist: true,
      anonymous: true,
    },
    authConnection: {
      persist: true,
      anonymous: true,
    },
    authConnectionId: {
      persist: true,
      anonymous: true,
    },
    groupedAuthConnectionId: {
      persist: true,
      anonymous: true,
    },
    userId: {
      persist: true,
      anonymous: true,
    },
    socialLoginEmail: {
      persist: true,
      anonymous: true,
    },
    vaultEncryptionKey: {
      persist: false,
      anonymous: true,
    },
    vaultEncryptionSalt: {
      persist: false,
      anonymous: true,
    },
    authPubKey: {
      persist: true,
      anonymous: true,
    },
    passwordOutdatedCache: {
      persist: true,
      anonymous: true,
    },
    refreshToken: {
      persist: true,
      anonymous: true,
    },
    revokeToken: {
      persist: false,
      anonymous: true,
    },
    // stays in vault
    accessToken: {
      persist: false,
      anonymous: true,
    },
    // stays outside of vault as this token is accessed by the metadata service
    // before the vault is created or unlocked.
    metadataAccessToken: {
      persist: true,
      anonymous: true,
    },
    encryptedSeedlessEncryptionKey: {
      persist: true,
      anonymous: true,
    },
    encryptedKeyringEncryptionKey: {
      persist: true,
      anonymous: true,
    },
  };

export class SeedlessOnboardingController<EncryptionKey> extends BaseController<
  typeof controllerName,
  SeedlessOnboardingControllerState,
  SeedlessOnboardingControllerMessenger
> {
  readonly #vaultEncryptor: VaultEncryptor<EncryptionKey>;

  readonly #controllerOperationMutex = new Mutex();

  readonly #vaultOperationMutex = new Mutex();

  readonly toprfClient: ToprfSecureBackup;

  readonly #refreshJWTToken: RefreshJWTToken;

  readonly #revokeRefreshToken: RevokeRefreshToken;

  /**
   * Controller lock state.
   *
   * The controller lock is synchronized with the keyring lock.
   */
  #isUnlocked = false;

  /**
   * The TTL of the password outdated cache in milliseconds.
   */
  readonly #passwordOutdatedCacheTTL: number;

  /**
   * Creates a new SeedlessOnboardingController instance.
   *
   * @param options - The options for the SeedlessOnboardingController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.encryptor - An optional encryptor to use for encrypting and decrypting seedless onboarding vault.
   * @param options.toprfKeyDeriver - An optional key derivation interface for the TOPRF client.
   * @param options.network - The network to be used for the Seedless Onboarding flow.
   * @param options.refreshJWTToken - A function to get a new jwt token using refresh token.
   * @param options.revokeRefreshToken - A function to revoke the refresh token.
   * @param options.passwordOutdatedCacheTTL - The TTL of the password outdated cache in milliseconds.,
   */
  constructor({
    messenger,
    state,
    encryptor,
    toprfKeyDeriver,
    network = Web3AuthNetwork.Mainnet,
    refreshJWTToken,
    revokeRefreshToken,
    passwordOutdatedCacheTTL = PASSWORD_OUTDATED_CACHE_TTL_MS,
  }: SeedlessOnboardingControllerOptions<EncryptionKey>) {
    super({
      name: controllerName,
      metadata: seedlessOnboardingMetadata,
      state: {
        ...getDefaultSeedlessOnboardingControllerState(),
        ...state,
      },
      messenger,
    });

    assertIsPasswordOutdatedCacheValid(passwordOutdatedCacheTTL);
    this.#passwordOutdatedCacheTTL = passwordOutdatedCacheTTL;

    this.#vaultEncryptor = encryptor;

    this.toprfClient = new ToprfSecureBackup({
      network,
      keyDeriver: toprfKeyDeriver,
      fetchMetadataAccessCreds: this.fetchMetadataAccessCreds.bind(this),
    });
    this.#refreshJWTToken = refreshJWTToken;
    this.#revokeRefreshToken = revokeRefreshToken;

    // setup subscriptions to the keyring lock event
    // when the keyring is locked (wallet is locked), the controller will be cleared of its credentials
    this.messagingSystem.subscribe('KeyringController:lock', () => {
      this.setLocked();
    });
    this.messagingSystem.subscribe('KeyringController:unlock', () => {
      this.#setUnlocked();
    });
  }

  async fetchMetadataAccessCreds(): Promise<{
    metadataAccessToken: string;
  }> {
    const { metadataAccessToken } = this.state;
    if (!metadataAccessToken) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidMetadataAccessToken,
      );
    }

    // Check if token is expired and refresh if needed
    const decodedToken = decodeJWTToken(metadataAccessToken);
    if (decodedToken.exp < Math.floor(Date.now() / 1000)) {
      // Token is expired, refresh it
      await this.refreshAuthTokens();

      // Get the new token after refresh
      const { metadataAccessToken: newMetadataAccessToken } = this.state;

      return {
        metadataAccessToken: newMetadataAccessToken as string,
      };
    }

    return { metadataAccessToken };
  }

  /**
   * Authenticate OAuth user using the seedless onboarding flow
   * and determine if the user is already registered or not.
   *
   * @param params - The parameters for authenticate OAuth user.
   * @param params.idTokens - The ID token(s) issued by OAuth verification service. Currently this array only contains a single idToken which is verified by all the nodes, in future we are considering to issue a unique idToken for each node.
   * @param params.authConnection - The social login provider.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.userId - user email or id from Social login
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * @param params.socialLoginEmail - The user email from Social login.
   * @param params.refreshToken - refresh token for refreshing expired nodeAuthTokens.
   * @param params.revokeToken - revoke token for revoking refresh token and get new refresh token and new revoke token.
   * @param params.accessToken - Access token for pairing with profile sync auth service and to access other services.
   * @param params.metadataAccessToken - Metadata access token for accessing the metadata service before the vault is created or unlocked.
   * @param params.skipLock - Optional flag to skip acquiring the controller lock. (to prevent deadlock in case the caller already acquired the lock)
   * @returns A promise that resolves to the authentication result.
   */
  async authenticate(params: {
    idTokens: string[];
    accessToken: string;
    metadataAccessToken: string;
    authConnection: AuthConnection;
    authConnectionId: string;
    userId: string;
    groupedAuthConnectionId?: string;
    socialLoginEmail?: string;
    refreshToken?: string;
    revokeToken?: string;
    skipLock?: boolean;
  }) {
    const doAuthenticateWithNodes = async () => {
      try {
        const {
          idTokens,
          authConnectionId,
          groupedAuthConnectionId,
          userId,
          authConnection,
          socialLoginEmail,
          refreshToken,
          revokeToken,
          accessToken,
          metadataAccessToken,
        } = params;

        const authenticationResult = await this.toprfClient.authenticate({
          authConnectionId,
          userId,
          idTokens,
          groupedAuthConnectionId,
        });
        // update the state with the authenticated user info
        this.update((state) => {
          state.nodeAuthTokens = authenticationResult.nodeAuthTokens;
          state.authConnectionId = authConnectionId;
          state.groupedAuthConnectionId = groupedAuthConnectionId;
          state.userId = userId;
          state.authConnection = authConnection;
          state.socialLoginEmail = socialLoginEmail;
          if (refreshToken) {
            state.refreshToken = refreshToken;
          }
          if (revokeToken) {
            // Temporarily store revoke token in state for later vault creation
            state.revokeToken = revokeToken;
          }
          if (accessToken) {
            state.accessToken = accessToken;
          }
          if (metadataAccessToken) {
            state.metadataAccessToken = metadataAccessToken;
          }
        });

        return authenticationResult;
      } catch (error) {
        log('Error authenticating user', error);
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.AuthenticationError,
        );
      }
    };
    return params.skipLock
      ? await doAuthenticateWithNodes()
      : await this.#withControllerLock(doAuthenticateWithNodes);
  }

  /**
   * Create a new TOPRF encryption key using given password and backups the provided seed phrase.
   *
   * @param password - The password used to create new wallet and seedphrase
   * @param seedPhrase - The initial seed phrase (Mnemonic) created together with the wallet.
   * @param keyringId - The keyring id of the backup seed phrase
   * @returns A promise that resolves to the encrypted seed phrase and the encryption key.
   */
  async createToprfKeyAndBackupSeedPhrase(
    password: string,
    seedPhrase: Uint8Array,
    keyringId: string,
  ): Promise<void> {
    return await this.#withControllerLock(async () => {
      // to make sure that fail fast,
      // assert that the user is authenticated before creating the TOPRF key and backing up the seed phrase
      this.#assertIsAuthenticatedUser(this.state);

      // locally evaluate the encryption key from the password
      const { encKey, pwEncKey, authKeyPair, oprfKey } =
        await this.toprfClient.createLocalKey({
          password,
        });
      const performKeyCreationAndBackup = async (): Promise<void> => {
        // encrypt and store the secret data
        await this.#encryptAndStoreSecretData({
          data: seedPhrase,
          type: SecretType.Mnemonic,
          encKey,
          authKeyPair,
          options: {
            keyringId,
          },
        });

        // store/persist the encryption key shares
        // We store the secret metadata in the metadata store first. If this operation fails,
        // we avoid persisting the encryption key shares to prevent a situation where a user appears
        // to have an account but with no associated data.
        await this.#persistOprfKey(oprfKey, authKeyPair.pk);
        // create a new vault with the resulting authentication data
        await this.#createNewVaultWithAuthData({
          password,
          rawToprfEncryptionKey: encKey,
          rawToprfPwEncryptionKey: pwEncKey,
          rawToprfAuthKeyPair: authKeyPair,
        });
      };

      await this.#executeWithTokenRefresh(
        performKeyCreationAndBackup,
        'createToprfKeyAndBackupSeedPhrase',
      );
    });
  }

  /**
   * encrypt and add a new secret data to the metadata store.
   *
   * @param data - The data to add.
   * @param type - The type of the secret data.
   * @param options - Optional options object, which includes optional data to be added to the metadata store.
   * @param options.keyringId - The keyring id of the backup keyring (SRP).
   * @returns A promise that resolves to the success of the operation.
   */
  async addNewSecretData(
    data: Uint8Array,
    type: SecretType,
    options?: {
      keyringId?: string;
    },
  ): Promise<void> {
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();

      await this.#assertPasswordInSync({
        skipCache: true,
        skipLock: true, // skip lock since we already have the lock
      });

      const performBackup = async (): Promise<void> => {
        // verify the password and unlock the vault
        const { toprfEncryptionKey, toprfAuthKeyPair } =
          await this.#unlockVaultAndGetVaultData();

        // encrypt and store the secret data
        await this.#encryptAndStoreSecretData({
          data,
          type,
          encKey: toprfEncryptionKey,
          authKeyPair: toprfAuthKeyPair,
          options,
        });
      };

      await this.#executeWithTokenRefresh(performBackup, 'addNewSecretData');
    });
  }

  /**
   * Fetches all encrypted secret data and metadata for user's account from the metadata store.
   *
   * Decrypts the secret data and returns the decrypted secret data using the recovered encryption key from the password.
   *
   * @param password - The optional password used to create new wallet. If not provided, `cached Encryption Key` will be used.
   * @returns A promise that resolves to the secret data.
   */
  async fetchAllSecretData(password?: string): Promise<SecretMetadata[]> {
    return await this.#withControllerLock(async () => {
      // assert that the user is authenticated before fetching the secret data
      this.#assertIsAuthenticatedUser(this.state);

      let encKey: Uint8Array;
      let pwEncKey: Uint8Array;
      let authKeyPair: KeyPair;

      if (password) {
        const recoverEncKeyResult = await this.#recoverEncKey(password);
        encKey = recoverEncKeyResult.encKey;
        pwEncKey = recoverEncKeyResult.pwEncKey;
        authKeyPair = recoverEncKeyResult.authKeyPair;
      } else {
        this.#assertIsUnlocked();
        // verify the password and unlock the vault
        const keysFromVault = await this.#unlockVaultAndGetVaultData();
        encKey = keysFromVault.toprfEncryptionKey;
        pwEncKey = keysFromVault.toprfPwEncryptionKey;
        authKeyPair = keysFromVault.toprfAuthKeyPair;
      }

      const performFetch = async (): Promise<SecretMetadata[]> => {
        const secrets = await this.#fetchAllSecretDataFromMetadataStore(
          encKey,
          authKeyPair,
        );

        if (password) {
          // if password is provided, we need to create a new vault with the auth data. (supposedly the user is trying to rehydrate the wallet)
          await this.#createNewVaultWithAuthData({
            password,
            rawToprfEncryptionKey: encKey,
            rawToprfPwEncryptionKey: pwEncKey,
            rawToprfAuthKeyPair: authKeyPair,
          });
        }

        return secrets;
      };

      return await this.#executeWithTokenRefresh(
        performFetch,
        'fetchAllSecretData',
      );
    });
  }

  /**
   * Update the password of the seedless onboarding flow.
   *
   * Changing password will also update the encryption key, metadata store and the vault with new encrypted values.
   *
   * @param newPassword - The new password to update.
   * @param oldPassword - The old password to verify.
   * @returns A promise that resolves to the success of the operation.
   */
  async changePassword(newPassword: string, oldPassword: string) {
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();
      // verify the old password of the encrypted vault
      await this.verifyVaultPassword(oldPassword, {
        skipLock: true, // skip lock since we already have the lock
      });

      const { latestKeyIndex } = await this.#assertPasswordInSync({
        skipCache: true,
        skipLock: true, // skip lock since we already have the lock
      });

      const attemptChangePassword = async (): Promise<void> => {
        // load keyring encryption key if it exists
        let keyringEncryptionKey: string | undefined;
        if (this.state.encryptedKeyringEncryptionKey) {
          keyringEncryptionKey = await this.loadKeyringEncryptionKey();
        }

        // update the encryption key with new password and update the Metadata Store
        const {
          encKey: newEncKey,
          pwEncKey: newPwEncKey,
          authKeyPair: newAuthKeyPair,
        } = await this.#changeEncryptionKey({
          oldPassword,
          newPassword,
          latestKeyIndex,
        });

        // update and encrypt the vault with new password
        await this.#createNewVaultWithAuthData({
          password: newPassword,
          rawToprfEncryptionKey: newEncKey,
          rawToprfPwEncryptionKey: newPwEncKey,
          rawToprfAuthKeyPair: newAuthKeyPair,
        });

        this.#resetPasswordOutdatedCache();

        // store the keyring encryption key if it exists
        if (keyringEncryptionKey) {
          await this.storeKeyringEncryptionKey(keyringEncryptionKey);
        }
      };

      try {
        await this.#executeWithTokenRefresh(
          attemptChangePassword,
          'changePassword',
        );
      } catch (error) {
        log('Error changing password', error);
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
        );
      }
    });
  }

  /**
   * Update the backup metadata state for the given secret data.
   *
   * @param secretData - The data to backup, can be a single backup or array of backups.
   * @param secretData.keyringId - The keyring id associated with the backup secret data.
   * @param secretData.data - The secret data to update the backup metadata state.
   */
  updateBackupMetadataState(
    secretData:
      | (Omit<SocialBackupsMetadata, 'hash'> & { data: Uint8Array })
      | (Omit<SocialBackupsMetadata, 'hash'> & { data: Uint8Array })[],
  ) {
    this.#assertIsUnlocked();

    this.#filterDupesAndUpdateSocialBackupsMetadata(secretData);
  }

  /**
   * Verify the password validity by decrypting the vault.
   *
   * @param password - The password to verify.
   * @param options - Optional options object.
   * @param options.skipLock - Whether to skip the lock acquisition. (to prevent deadlock in case the caller already acquired the lock)
   * @returns A promise that resolves to the success of the operation.
   * @throws {Error} If the password is invalid or the vault is not initialized.
   */
  async verifyVaultPassword(
    password: string,
    options?: {
      skipLock?: boolean;
    },
  ): Promise<void> {
    const doVerify = async () => {
      if (!this.state.vault) {
        throw new Error(SeedlessOnboardingControllerErrorMessage.VaultError);
      }
      await this.#vaultEncryptor.decrypt(password, this.state.vault);
    };
    return options?.skipLock
      ? await doVerify()
      : await this.#withControllerLock(doVerify);
  }

  /**
   * Get backup state of the given secret data, from the controller state.
   *
   * If the given secret data is not backed up and not found in the state, it will return `undefined`.
   *
   * @param data - The data to get the backup state of.
   * @param type - The type of the secret data.
   * @returns The backup state of the given secret data.
   */
  getSecretDataBackupState(
    data: Uint8Array,
    type: SecretType = SecretType.Mnemonic,
  ): SocialBackupsMetadata | undefined {
    const secretDataHash = keccak256AndHexify(data);
    return this.state.socialBackupsMetadata.find(
      (backup) => backup.hash === secretDataHash && backup.type === type,
    );
  }

  /**
   * Submit the password to the controller, verify the password validity and unlock the controller.
   *
   * This method will be used especially when user rehydrate/unlock the wallet.
   * The provided password will be verified against the encrypted vault, encryption key will be derived and saved in the controller state.
   *
   * This operation is useful when user performs some actions that requires the user password/encryption key. e.g. add new srp backup
   *
   * @param password - The password to submit.
   * @returns A promise that resolves to the success of the operation.
   */
  async submitPassword(password: string): Promise<void> {
    return await this.#withControllerLock(async () => {
      const {
        toprfEncryptionKey,
        toprfPwEncryptionKey,
        toprfAuthKeyPair,
        revokeToken,
      } = await this.#unlockVaultAndGetVaultData(password);
      this.#setUnlocked();

      if (revokeToken) {
        await this.#revokeRefreshTokenAndUpdateState(revokeToken);
        // re-creating vault to persist the new revoke token
        await this.#createNewVaultWithAuthData({
          password,
          rawToprfEncryptionKey: toprfEncryptionKey,
          rawToprfPwEncryptionKey: toprfPwEncryptionKey,
          rawToprfAuthKeyPair: toprfAuthKeyPair,
        });
      }
    });
  }

  /**
   * Set the controller to locked state, and deallocate the secrets (vault encryption key and salt).
   *
   * When the controller is locked, the user will not be able to perform any operations on the controller/vault.
   */
  setLocked() {
    this.update((state) => {
      delete state.vaultEncryptionKey;
      delete state.vaultEncryptionSalt;
      delete state.revokeToken;
      delete state.accessToken;
    });

    this.#isUnlocked = false;
  }

  /**
   * @description Unlock the controller with the latest global password.
   *
   * @param params - The parameters for unlocking the controller.
   * @param params.maxKeyChainLength - The maximum chain length of the pwd encryption keys.
   * @param params.globalPassword - The latest global password.
   * @returns A promise that resolves to the success of the operation.
   */
  async submitGlobalPassword({
    globalPassword,
    maxKeyChainLength = 5,
  }: {
    globalPassword: string;
    maxKeyChainLength?: number;
  }): Promise<void> {
    return await this.#withControllerLock(async () => {
      return await this.#executeWithTokenRefresh(async () => {
        const currentDeviceAuthPubKey = this.#recoverAuthPubKey();
        await this.#submitGlobalPassword({
          targetAuthPubKey: currentDeviceAuthPubKey,
          globalPassword,
          maxKeyChainLength,
        });
      }, 'submitGlobalPassword');
    });
  }

  /**
   * @description Submit the global password to the controller, verify the
   * password validity and unlock the controller.
   *
   * @param params - The parameters for submitting the global password.
   * @param params.maxKeyChainLength - The maximum chain length of the pwd encryption keys.
   * @param params.targetAuthPubKey - The target public key of the keyring
   * encryption key to recover.
   * @param params.globalPassword - The latest global password.
   * @returns A promise that resolves to the keyring encryption key
   * corresponding to the current authPubKey in state.
   */
  async #submitGlobalPassword({
    targetAuthPubKey,
    globalPassword,
    maxKeyChainLength,
  }: {
    targetAuthPubKey: SEC1EncodedPublicKey;
    globalPassword: string;
    maxKeyChainLength: number;
  }): Promise<void> {
    const {
      pwEncKey: latestPwEncKey,
      authKeyPair: latestAuthKeyPair,
      encKey: latestEncKey,
    } = await this.#recoverEncKey(globalPassword);

    try {
      // Recover vault encryption key.
      const { pwEncKey } = await this.toprfClient.recoverPwEncKey({
        targetAuthPubKey,
        curPwEncKey: latestPwEncKey,
        curAuthKeyPair: latestAuthKeyPair,
        maxPwChainLength: maxKeyChainLength,
      });
      const vaultKey = await this.#loadSeedlessEncryptionKey(pwEncKey);
      const keyringEncryptionKey =
        await this.#loadKeyringEncryptionKey(pwEncKey);

      // Unlock the controller
      const { revokeToken } = await this.#unlockVaultAndGetVaultData(
        undefined,
        vaultKey,
      );
      this.#setUnlocked();

      if (revokeToken) {
        // revoke and recyle refresh token after unlock to keep refresh token fresh, avoid malicious use of leaked refresh token
        await this.#revokeRefreshTokenAndUpdateState(revokeToken);
      }
      // re-creating vault to persist the new revoke token
      await this.#createNewVaultWithAuthData({
        password: globalPassword,
        rawToprfEncryptionKey: latestEncKey,
        rawToprfPwEncryptionKey: latestPwEncKey,
        rawToprfAuthKeyPair: latestAuthKeyPair,
      });
      await this.storeKeyringEncryptionKey(keyringEncryptionKey);
    } catch (error) {
      if (this.#isTokenExpiredError(error)) {
        throw error;
      }
      if (this.#isMaxKeyChainLengthError(error)) {
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.MaxKeyChainLengthExceeded,
        );
      }
      throw PasswordSyncError.getInstance(error);
    }
  }

  /**
   * @description Check if the current password is outdated compare to the global password.
   *
   * @param options - Optional options object.
   * @param options.globalAuthPubKey - The global auth public key to compare with the current auth public key.
   * If not provided, the global auth public key will be fetched from the backend.
   * @param options.skipCache - If true, bypass the cache and force a fresh check.
   * @param options.skipLock - Whether to skip the lock acquisition. (to prevent deadlock in case the caller already acquired the lock)
   * @returns A promise that resolves to true if the password is outdated, false otherwise.
   */
  async checkIsPasswordOutdated(options?: {
    skipCache?: boolean;
    skipLock?: boolean;
    globalAuthPubKey?: SEC1EncodedPublicKey;
  }): Promise<boolean> {
    const doCheckIsPasswordExpired = async () => {
      this.#assertIsAuthenticatedUser(this.state);

      // cache result to reduce load on infra
      // Check cache first unless skipCache is true
      if (!options?.skipCache) {
        const { passwordOutdatedCache } = this.state;
        const now = Date.now();
        const isCacheValid =
          passwordOutdatedCache &&
          now - passwordOutdatedCache.timestamp <
            this.#passwordOutdatedCacheTTL;

        if (isCacheValid) {
          return passwordOutdatedCache.isExpiredPwd;
        }
      }

      const {
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      } = this.state;

      const currentDeviceAuthPubKey = this.#recoverAuthPubKey();

      let globalAuthPubKey = options?.globalAuthPubKey;
      if (!globalAuthPubKey) {
        const { authPubKey } = await this.toprfClient
          .fetchAuthPubKey({
            nodeAuthTokens,
            authConnectionId,
            groupedAuthConnectionId,
            userId,
          })
          .catch((error) => {
            log('Error fetching auth pub key', error);
            throw new Error(
              SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
            );
          });
        globalAuthPubKey = authPubKey;
      }

      // use noble lib to deserialize and compare curve point
      const isExpiredPwd = !secp256k1.ProjectivePoint.fromHex(
        currentDeviceAuthPubKey,
      ).equals(secp256k1.ProjectivePoint.fromHex(globalAuthPubKey));
      // Cache the result in state
      this.update((state) => {
        state.passwordOutdatedCache = { isExpiredPwd, timestamp: Date.now() };
      });
      return isExpiredPwd;
    };

    return await this.#executeWithTokenRefresh(
      async () =>
        options?.skipLock
          ? await doCheckIsPasswordExpired()
          : await this.#withControllerLock(doCheckIsPasswordExpired),
      'checkIsPasswordOutdated',
    );
  }

  /**
   * Get the access token from the state or the vault.
   * If the access token is not in the state, it will be retrieved from the vault by decrypting it with the password.
   *
   * If both the access token and the vault are not available, an error will be thrown.
   *
   * @param password - The optional password to unlock the vault. If not provided, the access token will be retrieved from the vault.
   * @returns The access token.
   */
  async #getAccessToken(password: string): Promise<string> {
    const { accessToken, vault } = this.state;
    if (accessToken) {
      // if the access token is in the state, return it
      return accessToken;
    }

    // otherwise, check the vault availability and decrypt the access token from the vault
    if (!vault) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidAccessToken,
      );
    }

    const { accessToken: accessTokenFromVault } =
      await this.#unlockVaultAndGetVaultData(password);
    return accessTokenFromVault;
  }

  #setUnlocked(): void {
    this.#isUnlocked = true;
  }

  /**
   * Clears the current state of the SeedlessOnboardingController.
   */
  clearState() {
    const defaultState = getDefaultSeedlessOnboardingControllerState();
    this.update(() => {
      return defaultState;
    });
  }

  /**
   * Persist the encryption key for the seedless onboarding flow.
   *
   * @param oprfKey - The OPRF key to be splited and persisted.
   * @param authPubKey - The authentication public key.
   * @returns A promise that resolves to the success of the operation.
   */
  async #persistOprfKey(oprfKey: bigint, authPubKey: SEC1EncodedPublicKey) {
    this.#assertIsAuthenticatedUser(this.state);
    const { authConnectionId, groupedAuthConnectionId, userId } = this.state;

    try {
      await this.toprfClient.persistLocalKey({
        nodeAuthTokens: this.state.nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
        oprfKey,
        authPubKey,
      });
    } catch (error) {
      if (this.#isTokenExpiredError(error)) {
        throw error;
      }
      log('Error persisting local encryption key', error);
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.FailedToPersistOprfKey,
      );
    }
  }

  /**
   * Persist the authentication public key for the seedless onboarding flow.
   * convert to suitable format before persisting.
   *
   * @param params - The parameters for persisting the authentication public key.
   * @param params.authPubKey - The authentication public key to be persisted.
   */
  #persistAuthPubKey(params: { authPubKey: SEC1EncodedPublicKey }): void {
    this.update((state) => {
      state.authPubKey = bytesToBase64(params.authPubKey);
    });
  }

  /**
   * Store the keyring encryption key in state, encrypted under the current
   * encryption key.
   *
   * @param keyringEncryptionKey - The keyring encryption key.
   */
  async storeKeyringEncryptionKey(keyringEncryptionKey: string) {
    const { toprfPwEncryptionKey: encKey } =
      await this.#unlockVaultAndGetVaultData();
    await this.#storeKeyringEncryptionKey(encKey, keyringEncryptionKey);
  }

  /**
   * Load the keyring encryption key from state, decrypted under the current
   * encryption key.
   *
   * @returns The keyring encryption key.
   */
  async loadKeyringEncryptionKey() {
    const { toprfPwEncryptionKey: encKey } =
      await this.#unlockVaultAndGetVaultData();
    return await this.#loadKeyringEncryptionKey(encKey);
  }

  /**
   * Encrypt the keyring encryption key and store it in state.
   *
   * @param encKey - The encryption key.
   * @param keyringEncryptionKey - The keyring encryption key.
   */
  async #storeKeyringEncryptionKey(
    encKey: Uint8Array,
    keyringEncryptionKey: string,
  ) {
    const aes = managedNonce(gcm)(encKey);
    const encryptedKeyringEncryptionKey = aes.encrypt(
      utf8ToBytes(keyringEncryptionKey),
    );
    this.update((state) => {
      state.encryptedKeyringEncryptionKey = bytesToBase64(
        encryptedKeyringEncryptionKey,
      );
    });
  }

  /**
   * Decrypt the keyring encryption key from state.
   *
   * @param encKey - The encryption key.
   * @returns The keyring encryption key.
   */
  async #loadKeyringEncryptionKey(encKey: Uint8Array) {
    const { encryptedKeyringEncryptionKey: encryptedKey } = this.state;
    assertIsEncryptedKeyringEncryptionKeySet(encryptedKey);
    const encryptedPasswordBytes = base64ToBytes(encryptedKey);
    const aes = managedNonce(gcm)(encKey);
    const password = aes.decrypt(encryptedPasswordBytes);
    return bytesToUtf8(password);
  }

  /**
   * Decrypt the seedless encryption key from state.
   *
   * @param encKey - The encryption key.
   * @returns The seedless encryption key.
   */
  async #loadSeedlessEncryptionKey(encKey: Uint8Array) {
    const { encryptedSeedlessEncryptionKey: encryptedKey } = this.state;
    assertIsEncryptedSeedlessEncryptionKeySet(encryptedKey);
    const encryptedKeyBytes = base64ToBytes(encryptedKey);
    const aes = managedNonce(gcm)(encKey);
    const seedlessEncryptionKey = aes.decrypt(encryptedKeyBytes);
    return bytesToUtf8(seedlessEncryptionKey);
  }

  /**
   * Recover the authentication public key from the state.
   * convert to pubkey format before recovering.
   *
   * @returns The authentication public key.
   */
  #recoverAuthPubKey(): SEC1EncodedPublicKey {
    this.#assertIsSRPBackedUpUser(this.state);
    const { authPubKey } = this.state;

    return base64ToBytes(authPubKey);
  }

  /**
   * Recover the encryption key from password.
   *
   * @param password - The password used to derive/recover the encryption key.
   * @returns A promise that resolves to the encryption key and authentication key pair.
   * @throws RecoveryError - If failed to recover the encryption key.
   */
  async #recoverEncKey(
    password: string,
  ): Promise<Omit<RecoverEncryptionKeyResult, 'rateLimitResetResult'>> {
    this.#assertIsAuthenticatedUser(this.state);

    const { authConnectionId, groupedAuthConnectionId, userId } = this.state;

    try {
      const recoverEncKeyResult = await this.toprfClient.recoverEncKey({
        nodeAuthTokens: this.state.nodeAuthTokens,
        password,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      });
      return recoverEncKeyResult;
    } catch (error) {
      // throw token expired error for token refresh handler
      if (this.#isTokenExpiredError(error)) {
        throw error;
      }

      throw RecoveryError.getInstance(error);
    }
  }

  async #fetchAllSecretDataFromMetadataStore(
    encKey: Uint8Array,
    authKeyPair: KeyPair,
  ) {
    let secretData: Uint8Array[] = [];
    try {
      // fetch and decrypt the secret data from the metadata store
      secretData = await this.toprfClient.fetchAllSecretDataItems({
        decKey: encKey,
        authKeyPair,
      });
    } catch (error) {
      log('Error fetching secret data', error);
      if (this.#isTokenExpiredError(error)) {
        throw error;
      }
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
      );
    }

    // user must have at least one secret data
    if (secretData?.length > 0) {
      const secrets = SecretMetadata.parseSecretsFromMetadataStore(secretData);
      // validate the primary secret data is a mnemonic (SRP)
      const primarySecret = secrets[0];
      if (primarySecret.type !== SecretType.Mnemonic) {
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.InvalidPrimarySecretDataType,
        );
      }
      return secrets;
    }

    throw new Error(SeedlessOnboardingControllerErrorMessage.NoSecretDataFound);
  }

  /**
   * Update the encryption key with new password and update the Metadata Store with new encryption key.
   *
   * @param params - The function parameters.
   * @param params.oldPassword - The old password to verify.
   * @param params.newPassword - The new password to update.
   * @param params.latestKeyIndex - The key index of the latest key.
   * @returns A promise that resolves to new encryption key and authentication key pair.
   */
  async #changeEncryptionKey({
    oldPassword,
    newPassword,
    latestKeyIndex,
  }: {
    newPassword: string;
    oldPassword: string;
    latestKeyIndex?: number;
  }) {
    this.#assertIsAuthenticatedUser(this.state);
    const { authConnectionId, groupedAuthConnectionId, userId } = this.state;

    let encKey: Uint8Array;
    let pwEncKey: Uint8Array;
    let authKeyPair: KeyPair;
    let globalKeyIndex = latestKeyIndex;
    if (!globalKeyIndex) {
      ({
        encKey,
        pwEncKey,
        authKeyPair,
        keyShareIndex: globalKeyIndex,
      } = await this.#recoverEncKey(oldPassword));
    } else {
      ({
        toprfEncryptionKey: encKey,
        toprfPwEncryptionKey: pwEncKey,
        toprfAuthKeyPair: authKeyPair,
      } = await this.#unlockVaultAndGetVaultData(oldPassword));
    }
    const result = await this.toprfClient.changeEncKey({
      nodeAuthTokens: this.state.nodeAuthTokens,
      authConnectionId,
      groupedAuthConnectionId,
      userId,
      oldEncKey: encKey,
      oldPwEncKey: pwEncKey,
      oldAuthKeyPair: authKeyPair,
      newKeyShareIndex: globalKeyIndex,
      newPassword,
    });
    return result;
  }

  /**
   * Encrypt and store the secret data backup in the metadata store.
   *
   * @param params - The parameters for encrypting and storing the secret data backup.
   * @param params.data - The secret data to store.
   * @param params.type - The type of the secret data.
   * @param params.encKey - The encryption key to store.
   * @param params.authKeyPair - The authentication key pair to store.
   * @param params.options - Optional options object, which includes optional data to be added to the metadata store.
   * @param params.options.keyringId - The keyring id of the backup keyring (SRP).
   *
   * @returns A promise that resolves to the success of the operation.
   */
  async #encryptAndStoreSecretData(params: {
    data: Uint8Array;
    type: SecretType;
    encKey: Uint8Array;
    authKeyPair: KeyPair;
    options?: {
      keyringId?: string;
    };
  }): Promise<void> {
    const { options, data, encKey, authKeyPair, type } = params;

    // before encrypting and create backup, we will check the state if the secret data is already backed up
    const backupState = this.getSecretDataBackupState(data, type);
    if (backupState) {
      return;
    }

    const secretMetadata = new SecretMetadata(data, {
      type,
    });
    const secretData = secretMetadata.toBytes();

    const keyringId = options?.keyringId as string;
    if (type === SecretType.Mnemonic && !keyringId) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.MissingKeyringId,
      );
    }

    try {
      await this.#withPersistedSecretMetadataBackupsState(async () => {
        await this.toprfClient.addSecretDataItem({
          encKey,
          secretData,
          authKeyPair,
        });
        return {
          keyringId,
          data,
          type,
        };
      });
    } catch (error) {
      if (this.#isTokenExpiredError(error)) {
        throw error;
      }
      log('Error encrypting and storing secret data backup', error);
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.FailedToEncryptAndStoreSecretData,
      );
    }
  }

  /**
   * Unlocks the encrypted vault using the provided password and returns the decrypted vault data.
   * This method ensures thread-safety by using a mutex lock when accessing the vault.
   *
   * @param password - The optional password to unlock the vault.
   * @param encryptionKey - The optional encryption key to unlock the vault.
   * @returns A promise that resolves to an object containing:
   * - toprfEncryptionKey: The decrypted TOPRF encryption key
   * - toprfAuthKeyPair: The decrypted TOPRF authentication key pair
   * - revokeToken: The decrypted revoke token
   * - accessToken: The decrypted access token
   * @throws {Error} If:
   * - The password is invalid or empty
   * - The vault is not initialized
   * - The password is incorrect (from encryptor.decrypt)
   * - The decrypted vault data is malformed
   */
  async #unlockVaultAndGetVaultData(
    password?: string,
    encryptionKey?: string,
  ): Promise<{
    toprfEncryptionKey: Uint8Array;
    toprfPwEncryptionKey: Uint8Array;
    toprfAuthKeyPair: KeyPair;
    revokeToken?: string;
    accessToken: string;
  }> {
    return this.#withVaultLock(async () => {
      let { vaultEncryptionKey } = this.state;
      const { vault: encryptedVault, vaultEncryptionSalt } = this.state;

      if (!encryptedVault) {
        throw new Error(SeedlessOnboardingControllerErrorMessage.VaultError);
      }

      if (encryptionKey) {
        vaultEncryptionKey = encryptionKey;
      }

      let decryptedVaultData: unknown;
      const updatedState: Partial<SeedlessOnboardingControllerState> = {};

      if (password) {
        assertIsValidPassword(password);
        // Note that vault decryption using the password is a very costly operation as it involves deriving the encryption key
        // from the password using an intentionally slow key derivation function.
        // We should make sure that we only call it very intentionally.
        const result = await this.#vaultEncryptor.decryptWithDetail(
          password,
          encryptedVault,
        );
        decryptedVaultData = result.vault;
        updatedState.vaultEncryptionKey = result.exportedKeyString;
        updatedState.vaultEncryptionSalt = result.salt;
      } else {
        assertIsVaultEncryptionKeyDefined(vaultEncryptionKey);

        const parsedEncryptedVault = JSON.parse(encryptedVault);

        if (
          vaultEncryptionSalt &&
          vaultEncryptionSalt !== parsedEncryptedVault.salt
        ) {
          throw new Error(
            SeedlessOnboardingControllerErrorMessage.ExpiredCredentials,
          );
        }

        const key = await this.#vaultEncryptor.importKey(vaultEncryptionKey);
        decryptedVaultData = await this.#vaultEncryptor.decryptWithKey(
          key,
          parsedEncryptedVault,
        );
        updatedState.vaultEncryptionKey = vaultEncryptionKey;
        updatedState.vaultEncryptionSalt = vaultEncryptionSalt;
      }

      const {
        toprfEncryptionKey,
        toprfPwEncryptionKey,
        toprfAuthKeyPair,
        revokeToken,
        accessToken,
      } = this.#parseVaultData(decryptedVaultData);

      this.update((state) => {
        state.vaultEncryptionKey = updatedState.vaultEncryptionKey;
        state.vaultEncryptionSalt = updatedState.vaultEncryptionSalt;
        state.revokeToken = revokeToken;
        state.accessToken = accessToken;
      });

      return {
        toprfEncryptionKey,
        toprfPwEncryptionKey,
        toprfAuthKeyPair,
        revokeToken,
        accessToken,
      };
    });
  }

  /**
   * Executes a callback function that creates or restores secret data and persists their hashes in the controller state.
   *
   * This method:
   * 1. Executes the provided callback to create/restore secret data
   * 2. Generates keccak256 hashes of the secret data
   * 3. Merges new hashes with existing ones in the state, ensuring uniqueness
   * 4. Updates the controller state with the combined hashes
   *
   * This is a wrapper method that should be used around any operation that creates
   * or restores secret data to ensure their hashes are properly tracked.
   *
   * @param createSecretMetadataBackupCallback - function that returns either a single secret data
   * or an array of secret data as Uint8Array(s)
   * @returns The original secret data(s) returned by the callback
   * @throws Rethrows any errors from the callback with additional logging
   */
  async #withPersistedSecretMetadataBackupsState(
    createSecretMetadataBackupCallback: () => Promise<
      Omit<SocialBackupsMetadata, 'hash'> & { data: Uint8Array }
    >,
  ): Promise<Omit<SocialBackupsMetadata, 'hash'> & { data: Uint8Array }> {
    try {
      const newBackup = await createSecretMetadataBackupCallback();

      this.#filterDupesAndUpdateSocialBackupsMetadata(newBackup);

      return newBackup;
    } catch (error) {
      log('Error persisting secret data backups', error);
      throw error;
    }
  }

  /**
   * Updates the social backups metadata state by adding new unique secret data backups.
   * This method ensures no duplicate backups are stored by checking the hash of each secret data.
   *
   * @param secretData - The backup data to add to the state
   * @param secretData.data - The secret data to backup as a Uint8Array
   * @param secretData.keyringId - The optional keyring id of the backup keyring (SRP).
   * @param secretData.type - The type of the secret data.
   */
  #filterDupesAndUpdateSocialBackupsMetadata(
    secretData:
      | {
          data: Uint8Array;
          keyringId?: string;
          type: SecretType;
        }
      | {
          data: Uint8Array;
          keyringId?: string;
          type: SecretType;
        }[],
  ) {
    const currentBackupsMetadata = this.state.socialBackupsMetadata;

    const newBackupsMetadata = Array.isArray(secretData)
      ? secretData
      : [secretData];
    const filteredNewBackupsMetadata: SocialBackupsMetadata[] = [];

    // filter out the backed up metadata that already exists in the state
    // to prevent duplicates
    newBackupsMetadata.forEach((item) => {
      const { keyringId, data, type } = item;
      const backupHash = keccak256AndHexify(data);

      const backupStateAlreadyExisted = currentBackupsMetadata.some(
        (backup) => backup.hash === backupHash && backup.type === type,
      );

      if (!backupStateAlreadyExisted) {
        filteredNewBackupsMetadata.push({
          keyringId,
          hash: backupHash,
          type,
        });
      }
    });

    if (filteredNewBackupsMetadata.length > 0) {
      this.update((state) => {
        state.socialBackupsMetadata = [
          ...state.socialBackupsMetadata,
          ...filteredNewBackupsMetadata,
        ];
      });
    }
  }

  /**
   * Create a new vault with the given authentication data.
   *
   * Serialize the authentication and key data which will be stored in the vault.
   *
   * @param params - The parameters for creating a new vault.
   * @param params.password - The password to encrypt the vault.
   * @param params.rawToprfEncryptionKey - The encryption key to encrypt the vault.
   * @param params.rawToprfPwEncryptionKey - The encryption key to encrypt the password.
   * @param params.rawToprfAuthKeyPair - The authentication key pair to encrypt the vault.
   */
  async #createNewVaultWithAuthData({
    password,
    rawToprfEncryptionKey,
    rawToprfPwEncryptionKey,
    rawToprfAuthKeyPair,
  }: {
    password: string;
    rawToprfEncryptionKey: Uint8Array;
    rawToprfPwEncryptionKey: Uint8Array;
    rawToprfAuthKeyPair: KeyPair;
  }): Promise<void> {
    this.#assertIsAuthenticatedUser(this.state);

    const accessToken = await this.#getAccessToken(password);

    this.#setUnlocked();

    const { toprfEncryptionKey, toprfPwEncryptionKey, toprfAuthKeyPair } =
      this.#serializeKeyData(
        rawToprfEncryptionKey,
        rawToprfPwEncryptionKey,
        rawToprfAuthKeyPair,
      );

    const serializedVaultData = JSON.stringify({
      toprfEncryptionKey,
      toprfPwEncryptionKey,
      toprfAuthKeyPair,
      revokeToken: this.state.revokeToken,
      accessToken,
    });

    await this.#updateVault({
      password,
      serializedVaultData,
      pwEncKey: rawToprfPwEncryptionKey,
    });

    // update the authPubKey in the state
    this.#persistAuthPubKey({
      authPubKey: rawToprfAuthKeyPair.pk,
    });
  }

  /**
   * Encrypt and update the vault with the given authentication data.
   *
   * @param params - The parameters for updating the vault.
   * @param params.password - The password to encrypt the vault.
   * @param params.serializedVaultData - The serialized authentication data to update the vault with.
   * @param params.pwEncKey - The global password encryption key.
   * @returns A promise that resolves to the updated vault.
   */
  async #updateVault({
    password,
    serializedVaultData,
    pwEncKey,
  }: {
    password: string;
    serializedVaultData: string;
    pwEncKey: Uint8Array;
  }): Promise<void> {
    await this.#withVaultLock(async () => {
      assertIsValidPassword(password);

      // Note that vault encryption using the password is a very costly operation as it involves deriving the encryption key
      // from the password using an intentionally slow key derivation function.
      // We should make sure that we only call it very intentionally.
      const { vault, exportedKeyString } =
        await this.#vaultEncryptor.encryptWithDetail(
          password,
          serializedVaultData,
        );

      // Encrypt vault key.
      const aes = managedNonce(gcm)(pwEncKey);
      const encryptedKey = aes.encrypt(utf8ToBytes(exportedKeyString));

      this.update((state) => {
        state.vault = vault;
        state.vaultEncryptionKey = exportedKeyString;
        state.vaultEncryptionSalt = JSON.parse(vault).salt;
        state.encryptedSeedlessEncryptionKey = bytesToBase64(encryptedKey);
      });
    });
  }

  /**
   * Lock the controller mutex before executing the given function,
   * and release it after the function is resolved or after an
   * error is thrown.
   *
   * This wrapper ensures that each mutable operation that interacts with the
   * controller and that changes its state is executed in a mutually exclusive way,
   * preventing unsafe concurrent access that could lead to unpredictable behavior.
   *
   * @param callback - The function to execute while the controller mutex is locked.
   * @returns The result of the function.
   */
  async #withControllerLock<Result>(
    callback: MutuallyExclusiveCallback<Result>,
  ): Promise<Result> {
    return await withLock(this.#controllerOperationMutex, callback);
  }

  /**
   * Lock the vault mutex before executing the given function,
   * and release it after the function is resolved or after an
   * error is thrown.
   *
   * This ensures that each operation that interacts with the vault
   * is executed in a mutually exclusive way.
   *
   * @param callback - The function to execute while the vault mutex is locked.
   * @returns The result of the function.
   */
  async #withVaultLock<Result>(
    callback: MutuallyExclusiveCallback<Result>,
  ): Promise<Result> {
    return await withLock(this.#vaultOperationMutex, callback);
  }

  /**
   * Serialize the encryption key and authentication key pair.
   *
   * @param encKey - The encryption key to serialize.
   * @param pwEncKey - The password encryption key to serialize.
   * @param authKeyPair - The authentication key pair to serialize.
   * @returns The serialized encryption key and authentication key pair.
   */
  #serializeKeyData(
    encKey: Uint8Array,
    pwEncKey: Uint8Array,
    authKeyPair: KeyPair,
  ): {
    toprfEncryptionKey: string;
    toprfPwEncryptionKey: string;
    toprfAuthKeyPair: string;
  } {
    const b64EncodedEncKey = bytesToBase64(encKey);
    const b64EncodedPwEncKey = bytesToBase64(pwEncKey);
    const b64EncodedAuthKeyPair = JSON.stringify({
      sk: bigIntToHex(authKeyPair.sk), // Convert BigInt to hex string
      pk: bytesToBase64(authKeyPair.pk),
    });

    return {
      toprfEncryptionKey: b64EncodedEncKey,
      toprfPwEncryptionKey: b64EncodedPwEncKey,
      toprfAuthKeyPair: b64EncodedAuthKeyPair,
    };
  }

  /**
   * Parse and deserialize the authentication data from the vault.
   *
   * @param data - The decrypted vault data.
   * @returns The parsed authentication data.
   * @throws If the vault data is not valid.
   */
  #parseVaultData(data: unknown): {
    toprfEncryptionKey: Uint8Array;
    toprfPwEncryptionKey: Uint8Array;
    toprfAuthKeyPair: KeyPair;
    revokeToken?: string;
    accessToken: string;
  } {
    if (typeof data !== 'string') {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidVaultData,
      );
    }

    let parsedVaultData: unknown;
    try {
      parsedVaultData = JSON.parse(data);
    } catch {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidVaultData,
      );
    }

    assertIsValidVaultData(parsedVaultData);

    const rawToprfEncryptionKey = base64ToBytes(
      parsedVaultData.toprfEncryptionKey,
    );
    const rawToprfPwEncryptionKey = base64ToBytes(
      parsedVaultData.toprfPwEncryptionKey,
    );
    const parsedToprfAuthKeyPair = JSON.parse(parsedVaultData.toprfAuthKeyPair);
    const rawToprfAuthKeyPair = {
      sk: BigInt(parsedToprfAuthKeyPair.sk),
      pk: base64ToBytes(parsedToprfAuthKeyPair.pk),
    };

    return {
      toprfEncryptionKey: rawToprfEncryptionKey,
      toprfPwEncryptionKey: rawToprfPwEncryptionKey,
      toprfAuthKeyPair: rawToprfAuthKeyPair,
      revokeToken: parsedVaultData.revokeToken,
      accessToken: parsedVaultData.accessToken,
    };
  }

  #assertIsUnlocked(): void {
    if (!this.#isUnlocked) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.ControllerLocked,
      );
    }
  }

  /**
   * Assert that the provided value contains valid authenticated user information.
   *
   * This method checks that the value is an object containing:
   * - nodeAuthTokens: A non-empty array of authentication tokens
   * - authConnectionId: A string identifier for the OAuth connection
   * - groupedAuthConnectionId: A string identifier for grouped OAuth connections
   * - userId: A string identifier for the authenticated user
   *
   * @param value - The value to validate.
   * @throws {Error} If the value does not contain valid authenticated user information.
   */
  #assertIsAuthenticatedUser(
    value: unknown,
  ): asserts value is AuthenticatedUserDetails {
    if (
      !value ||
      typeof value !== 'object' ||
      !('authConnectionId' in value) ||
      typeof value.authConnectionId !== 'string' ||
      !('userId' in value) ||
      typeof value.userId !== 'string'
    ) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
      );
    }

    if (
      !('nodeAuthTokens' in value) ||
      typeof value.nodeAuthTokens !== 'object' ||
      !Array.isArray(value.nodeAuthTokens) ||
      value.nodeAuthTokens.length < 3 // At least 3 auth tokens are required for Threshold OPRF service
    ) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InsufficientAuthToken,
      );
    }

    if (!('refreshToken' in value) || typeof value.refreshToken !== 'string') {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidRefreshToken,
      );
    }
    if (
      !('metadataAccessToken' in value) ||
      typeof value.metadataAccessToken !== 'string'
    ) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidMetadataAccessToken,
      );
    }
  }

  #assertIsSRPBackedUpUser(
    value: unknown,
  ): asserts value is SRPBackedUpUserDetails {
    if (!this.state.authPubKey) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.SRPNotBackedUpError,
      );
    }
  }

  /**
   * Assert that the password is in sync with the global password.
   *
   * @param options - The options for asserting the password is in sync.
   * @param options.skipCache - Whether to skip the cache check.
   * @param options.skipLock - Whether to skip the lock acquisition. (to prevent deadlock in case the caller already acquired the lock)
   * @returns The global auth public key and the latest key index.
   * @throws If the password is outdated.
   */
  async #assertPasswordInSync(options?: {
    skipCache?: boolean;
    skipLock?: boolean;
  }): Promise<{
    authPubKey: SEC1EncodedPublicKey;
    latestKeyIndex: number;
  }> {
    const {
      nodeAuthTokens,
      authConnectionId,
      groupedAuthConnectionId,
      userId,
    } = this.state;
    if (!nodeAuthTokens || !authConnectionId || !userId) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
      );
    }

    const { authPubKey, keyIndex: latestKeyIndex } = await this.toprfClient
      .fetchAuthPubKey({
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      })
      .catch((error) => {
        log('Error fetching auth pub key', error);
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
        );
      });
    const isPasswordOutdated = await this.checkIsPasswordOutdated({
      ...options,
      globalAuthPubKey: authPubKey,
    });
    if (isPasswordOutdated) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
      );
    }
    return { authPubKey, latestKeyIndex };
  }

  #resetPasswordOutdatedCache(): void {
    this.update((state) => {
      delete state.passwordOutdatedCache;
    });
  }

  /**
   * Refresh expired nodeAuthTokens, accessToken, and metadataAccessToken using the stored refresh token.
   *
   * This method retrieves the refresh token from the vault and uses it to obtain
   * new nodeAuthTokens when the current ones have expired.
   *
   * @returns A promise that resolves to the new nodeAuthTokens.
   */
  async refreshAuthTokens(): Promise<void> {
    this.#assertIsAuthenticatedUser(this.state);
    const { refreshToken } = this.state;

    try {
      const res = await this.#refreshJWTToken({
        connection: this.state.authConnection,
        refreshToken,
      });
      const { idTokens, accessToken, metadataAccessToken } = res;
      // re-authenticate with the new id tokens to set new node auth tokens
      await this.authenticate({
        idTokens,
        accessToken,
        metadataAccessToken,
        authConnection: this.state.authConnection,
        authConnectionId: this.state.authConnectionId,
        groupedAuthConnectionId: this.state.groupedAuthConnectionId,
        userId: this.state.userId,
        skipLock: true,
      });
    } catch (error) {
      log('Error refreshing node auth tokens', error);
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.AuthenticationError,
      );
    }
  }

  /**
   * Revoke the refresh token and get new refresh token and new revoke token.
   * This method is to be called after user is authenticated.
   *
   * @param revokeToken - The revoke token to use for revoking the refresh token.
   */
  async #revokeRefreshTokenAndUpdateState(revokeToken: string) {
    this.#assertIsAuthenticatedUser(this.state);

    const { newRevokeToken, newRefreshToken } = await this.#revokeRefreshToken({
      connection: this.state.authConnection,
      revokeToken,
    });

    this.update((state) => {
      // set new revoke token in state temporarily for persisting in vault
      state.revokeToken = newRevokeToken;
      // set new refresh token to persist in state
      state.refreshToken = newRefreshToken;
    });
  }

  /**
   * Check if the provided error is a token expiration error.
   *
   * This method checks if the error is a TOPRF error with AuthTokenExpired code.
   *
   * @param error - The error to check.
   * @returns True if the error indicates token expiration, false otherwise.
   */
  #isTokenExpiredError(error: unknown): boolean {
    if (error instanceof TOPRFError) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      return error.code === TOPRFErrorCode.AuthTokenExpired;
    }

    return false;
  }

  /**
   * Check if the provided error is a max key chain length error.
   *
   * This method checks if the error is a TOPRF error with MaxKeyChainLength code.
   *
   * @param error - The error to check.
   * @returns True if the error indicates max key chain length has been exceeded, false otherwise.
   */
  #isMaxKeyChainLengthError(error: unknown): boolean {
    if (error instanceof TOPRFError) {
      return (
        error.code ===
        (TOPRFErrorCode.MaxKeyChainLengthExceeded as typeof error.code)
      );
    }

    return false;
  }

  /**
   * Executes an operation with automatic token refresh on expiration.
   *
   * This wrapper method automatically handles token expiration by refreshing tokens
   * and retrying the operation. It can be used by any method that might encounter
   * token expiration errors.
   *
   * @param operation - The operation to execute that might require valid tokens.
   * @param operationName - A descriptive name for the operation (used in error messages).
   * @returns A promise that resolves to the result of the operation.
   * @throws The original error if it's not token-related, or refresh error if token refresh fails.
   */
  async #executeWithTokenRefresh<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    try {
      // proactively check for expired tokens and refresh them if needed
      const isNodeAuthTokenExpired = this.checkNodeAuthTokenExpired();
      const isMetadataAccessTokenExpired =
        this.checkMetadataAccessTokenExpired();

      // access token is only accessible when the vault is unlocked
      // so skip the check if the vault is locked
      let isAccessTokenExpired = false;
      if (this.#isUnlocked) {
        isAccessTokenExpired = this.checkAccessTokenExpired();
      }

      if (
        isNodeAuthTokenExpired ||
        isMetadataAccessTokenExpired ||
        isAccessTokenExpired
      ) {
        log(
          `JWT token expired during ${operationName}, attempting to refresh tokens`,
          'node auth token exp check',
        );
        await this.refreshAuthTokens();
      }

      return await operation();
    } catch (error) {
      // Check if this is a token expiration error
      if (this.#isTokenExpiredError(error)) {
        log(
          `Token expired during ${operationName}, attempting to refresh tokens`,
          error,
        );
        try {
          // Refresh the tokens
          await this.refreshAuthTokens();
          // Retry the operation with fresh tokens
          return await operation();
        } catch (refreshError) {
          log(`Error refreshing tokens during ${operationName}`, refreshError);
          throw refreshError;
        }
      } else {
        // Re-throw non-token-related errors
        throw error;
      }
    }
  }

  /**
   * Check if the current node auth token is expired.
   *
   * @returns True if the current node auth token is expired, false otherwise.
   */
  public checkNodeAuthTokenExpired(): boolean {
    this.#assertIsAuthenticatedUser(this.state);

    const { nodeAuthTokens } = this.state;
    // all auth tokens should be expired at the same time so we can check the first one
    const firstAuthToken = nodeAuthTokens[0]?.authToken;
    // node auth token is base64 encoded json object
    const decodedToken = decodeNodeAuthToken(firstAuthToken);
    // check if the token is expired
    return decodedToken.exp < Date.now() / 1000;
  }

  /**
   * Check if the current metadata access token is expired.
   *
   * @returns True if the metadata access token is expired, false otherwise.
   */
  public checkMetadataAccessTokenExpired(): boolean {
    try {
      this.#assertIsAuthenticatedUser(this.state);
      const { metadataAccessToken } = this.state;
      // assertIsAuthenticatedUser will throw if metadataAccessToken is missing
      const decodedToken = decodeJWTToken(metadataAccessToken as string);
      return decodedToken.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true; // Consider unauthenticated user as having expired tokens
    }
  }

  /**
   * Check if the current access token is expired.
   * When the vault is locked, the access token is not accessible, so we return false.
   *
   * @returns True if the access token is expired, false otherwise.
   */
  public checkAccessTokenExpired(): boolean {
    try {
      this.#assertIsAuthenticatedUser(this.state);
      const { accessToken } = this.state;
      if (!accessToken) {
        return true; // Consider missing token as expired
      }
      const decodedToken = decodeJWTToken(accessToken);
      return decodedToken.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true; // Consider unauthenticated user as having expired tokens
    }
  }
}

/**
 * Assert that the provided password is a valid non-empty string.
 *
 * @param password - The password to check.
 * @throws If the password is not a valid string.
 */
function assertIsValidPassword(password: unknown): asserts password is string {
  if (typeof password !== 'string') {
    throw new Error(SeedlessOnboardingControllerErrorMessage.WrongPasswordType);
  }

  if (!password || !password.length) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.InvalidEmptyPassword,
    );
  }
}

/**
 * Lock the given mutex before executing the given function,
 * and release it after the function is resolved or after an
 * error is thrown.
 *
 * @param mutex - The mutex to lock.
 * @param callback - The function to execute while the mutex is locked.
 * @returns The result of the function.
 */
async function withLock<Result>(
  mutex: Mutex,
  callback: MutuallyExclusiveCallback<Result>,
): Promise<Result> {
  const releaseLock = await mutex.acquire();

  try {
    return await callback({ releaseLock });
  } finally {
    releaseLock();
  }
}

/**
 * Assert that the provided encrypted keyring encryption key is a valid non-empty string.
 *
 * @param encryptedKeyringEncryptionKey - The encrypted keyring encryption key to check.
 * @throws If the encrypted keyring encryption key is not a valid string.
 */
function assertIsEncryptedKeyringEncryptionKeySet(
  encryptedKeyringEncryptionKey: string | undefined,
): asserts encryptedKeyringEncryptionKey is string {
  if (!encryptedKeyringEncryptionKey) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.EncryptedKeyringEncryptionKeyNotSet,
    );
  }
}

/**
 * Assert that the provided encrypted seedless encryption key is a valid non-empty string.
 *
 * @param encryptedSeedlessEncryptionKey - The encrypted seedless encryption key to check.
 * @throws If the encrypted seedless encryption key is not a valid string.
 */
function assertIsEncryptedSeedlessEncryptionKeySet(
  encryptedSeedlessEncryptionKey: string | undefined,
): asserts encryptedSeedlessEncryptionKey is string {
  if (!encryptedSeedlessEncryptionKey) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.EncryptedSeedlessEncryptionKeyNotSet,
    );
  }
}

/**
 * Assert that the provided vault encryption key is a valid non-empty string.
 *
 * @param vaultEncryptionKey - The vault encryption key to check.
 * @throws If the vault encryption key is not a valid string.
 */
function assertIsVaultEncryptionKeyDefined(
  vaultEncryptionKey: string | undefined,
): asserts vaultEncryptionKey is string {
  if (!vaultEncryptionKey) {
    throw new Error(
      SeedlessOnboardingControllerErrorMessage.VaultEncryptionKeyUndefined,
    );
  }
}
