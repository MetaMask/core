import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  KeyPair,
  NodeAuthTokens,
  SEC1EncodedPublicKey,
} from '@metamask/toprf-secure-backup';
import { ToprfSecureBackup } from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bytesToBase64,
  stringToBytes,
  remove0x,
  bigIntToHex,
} from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Mutex } from 'async-mutex';

import {
  type AuthConnection,
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
  VaultData,
  AuthenticatedUserDetails,
  SocialBackupsMetadata,
  SRPBackedUpUserDetails,
  VaultEncryptor,
} from './types';

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

  /**
   * Controller lock state.
   *
   * The controller lock is synchronized with the keyring lock.
   */
  #isUnlocked = false;

  /**
   * Creates a new SeedlessOnboardingController instance.
   *
   * @param options - The options for the SeedlessOnboardingController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.encryptor - An optional encryptor to use for encrypting and decrypting seedless onboarding vault.
   * @param options.toprfKeyDeriver - An optional key derivation interface for the TOPRF client.
   * @param options.network - The network to be used for the Seedless Onboarding flow.
   */
  constructor({
    messenger,
    state,
    encryptor,
    toprfKeyDeriver,
    network = Web3AuthNetwork.Mainnet,
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

    this.#vaultEncryptor = encryptor;
    this.toprfClient = new ToprfSecureBackup({
      network,
      keyDeriver: toprfKeyDeriver,
    });

    // setup subscriptions to the keyring lock event
    // when the keyring is locked (wallet is locked), the controller will be cleared of its credentials
    this.messagingSystem.subscribe('KeyringController:lock', () => {
      this.setLocked();
    });
    this.messagingSystem.subscribe('KeyringController:unlock', () => {
      this.#setUnlocked();
    });
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
   * You can pass this to use aggregate multiple OAuth connections. Useful when you want user to have same account while using different OAuth connections.
   * @returns A promise that resolves to the authentication result.
   */
  async authenticate(params: {
    idTokens: string[];
    authConnection: AuthConnection;
    authConnectionId: string;
    userId: string;
    groupedAuthConnectionId?: string;
    socialLoginEmail?: string;
  }) {
    return await this.#withControllerLock(async () => {
      try {
        const {
          idTokens,
          authConnectionId,
          groupedAuthConnectionId,
          userId,
          authConnection,
          socialLoginEmail,
        } = params;
        const hashedIdTokenHexes = idTokens.map((idToken) => {
          return remove0x(keccak256AndHexify(stringToBytes(idToken)));
        });
        const authenticationResult = await this.toprfClient.authenticate({
          authConnectionId: groupedAuthConnectionId || authConnectionId,
          userId,
          idTokens: hashedIdTokenHexes,
          groupedAuthConnectionParams: {
            authConnectionId,
            idTokens,
          },
        });
        // update the state with the authenticated user info
        this.update((state) => {
          state.nodeAuthTokens = authenticationResult.nodeAuthTokens;
          state.authConnectionId = authConnectionId;
          state.groupedAuthConnectionId = groupedAuthConnectionId;
          state.userId = userId;
          state.authConnection = authConnection;
          state.socialLoginEmail = socialLoginEmail;
        });
        return authenticationResult;
      } catch (error) {
        log('Error authenticating user', error);
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.AuthenticationError,
        );
      }
    });
  }

  /**
   * Create a new TOPRF encryption key using given password and backups the provided seed phrase.
   *
   * @param password - The password used to create new wallet and seedphrase
   * @param seedPhrase - The seed phrase to backup
   * @param keyringId - The keyring id of the backup seed phrase
   * @returns A promise that resolves to the encrypted seed phrase and the encryption key.
   */
  async createToprfKeyAndBackupSeedPhrase(
    password: string,
    seedPhrase: Uint8Array,
    keyringId: string,
  ): Promise<void> {
    // to make sure that fail fast,
    // assert that the user is authenticated before creating the TOPRF key and backing up the seed phrase
    this.#assertIsAuthenticatedUser(this.state);

    return await this.#withControllerLock(async () => {
      // locally evaluate the encryption key from the password
      const { encKey, authKeyPair, oprfKey } =
        await this.toprfClient.createLocalKey({
          password,
        });

      // encrypt and store the seed phrase backup
      await this.#encryptAndStoreSeedPhraseBackup({
        keyringId,
        seedPhrase,
        encKey,
        authKeyPair,
      });

      // store/persist the encryption key shares
      // We store the seed phrase metadata in the metadata store first. If this operation fails,
      // we avoid persisting the encryption key shares to prevent a situation where a user appears
      // to have an account but with no associated data.
      await this.#persistOprfKey(oprfKey, authKeyPair.pk);
      // create a new vault with the resulting authentication data
      await this.#createNewVaultWithAuthData({
        password,
        rawToprfEncryptionKey: encKey,
        rawToprfAuthKeyPair: authKeyPair,
      });
      this.#persistAuthPubKey({
        authPubKey: authKeyPair.pk,
      });
    });
  }

  /**
   * Add a new seed phrase backup to the metadata store.
   *
   * @param seedPhrase - The seed phrase to backup.
   * @param keyringId - The keyring id of the backup seed phrase.
   * @returns A promise that resolves to the success of the operation.
   */
  async addNewSeedPhraseBackup(
    seedPhrase: Uint8Array,
    keyringId: string,
  ): Promise<void> {
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();
      await this.#assertPasswordInSync({
        skipCache: true,
        skipLock: true, // skip lock since we already have the lock
      });
      // verify the password and unlock the vault
      const { toprfEncryptionKey, toprfAuthKeyPair } =
        await this.#unlockVaultAndGetBackupEncKey();

      // encrypt and store the seed phrase backup
      await this.#encryptAndStoreSeedPhraseBackup({
        keyringId,
        seedPhrase,
        encKey: toprfEncryptionKey,
        authKeyPair: toprfAuthKeyPair,
      });
    });
  }

  /**
   * Fetches all encrypted seed phrases and metadata for user's account from the metadata store.
   *
   * Decrypts the seed phrases and returns the decrypted seed phrases using the recovered encryption key from the password.
   *
   * @param password - The password used to create new wallet and seedphrase
   * @returns A promise that resolves to the seed phrase metadata.
   */
  async fetchAllSeedPhrases(password: string): Promise<Uint8Array[]> {
    // assert that the user is authenticated before fetching the seed phrases
    this.#assertIsAuthenticatedUser(this.state);

    return await this.#withControllerLock(async () => {
      const { encKey, authKeyPair } = await this.#recoverEncKey(password);

      try {
        const secretData = await this.toprfClient.fetchAllSecretDataItems({
          decKey: encKey,
          authKeyPair,
        });

        if (secretData?.length > 0) {
          await this.#createNewVaultWithAuthData({
            password,
            rawToprfEncryptionKey: encKey,
            rawToprfAuthKeyPair: authKeyPair,
          });

          this.#persistAuthPubKey({
            authPubKey: authKeyPair.pk,
          });
        }

        const secrets = SecretMetadata.parseSecretsFromMetadataStore(
          secretData,
          SecretType.Mnemonic,
        );
        return secrets.map((secret) => secret.data);
      } catch (error) {
        log('Error fetching seed phrase metadata', error);
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.FailedToFetchSeedPhraseMetadata,
        );
      }
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
      await this.#assertPasswordInSync({
        skipCache: true,
        skipLock: true, // skip lock since we already have the lock
      });

      try {
        // update the encryption key with new password and update the Metadata Store
        const { encKey: newEncKey, authKeyPair: newAuthKeyPair } =
          await this.#changeEncryptionKey(newPassword, oldPassword);

        // update and encrypt the vault with new password
        await this.#createNewVaultWithAuthData({
          password: newPassword,
          rawToprfEncryptionKey: newEncKey,
          rawToprfAuthKeyPair: newAuthKeyPair,
        });

        this.#persistAuthPubKey({
          authPubKey: newAuthKeyPair.pk,
        });
        this.#resetPasswordOutdatedCache();
      } catch (error) {
        log('Error changing password', error);
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
        );
      }
    });
  }

  /**
   * Update the backup metadata state for the given seed phrase.
   *
   * @param data - The data to backup, can be a single backup or array of backups.
   * @param data.keyringId - The keyring id associated with the backup seed phrase.
   * @param data.seedPhrase - The seed phrase to update the backup metadata state.
   */
  updateBackupMetadataState(
    data:
      | {
          keyringId: string;
          seedPhrase: Uint8Array;
        }
      | {
          keyringId: string;
          seedPhrase: Uint8Array;
        }[],
  ) {
    this.#assertIsUnlocked();

    this.#filterDupesAndUpdateSocialBackupsMetadata(data);
  }

  /**
   * Verify the password validity by decrypting the vault.
   *
   * @param password - The password to verify.
   * @param options - Optional options object.
   * @param options.skipLock - Whether to skip the lock acquisition.
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
   * Get the hash of the seed phrase backup for the given seed phrase, from the state.
   *
   * If the given seed phrase is not backed up and not found in the state, it will return `undefined`.
   *
   * @param seedPhrase - The seed phrase to get the hash of.
   * @returns A promise that resolves to the hash of the seed phrase backup.
   */
  getSeedPhraseBackupHash(
    seedPhrase: Uint8Array,
  ): SocialBackupsMetadata | undefined {
    const seedPhraseHash = keccak256AndHexify(seedPhrase);
    return this.state.socialBackupsMetadata.find(
      (backup) => backup.hash === seedPhraseHash,
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
      await this.#unlockVaultAndGetBackupEncKey(password);
      this.#setUnlocked();
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
    });

    this.#isUnlocked = false;
  }

  /**
   * Sync the latest global password to the controller.
   * reset vault with latest globalPassword,
   * persist the latest global password authPubKey
   *
   * @param params - The parameters for syncing the latest global password.
   * @param params.oldPassword - The old password to verify.
   * @param params.globalPassword - The latest global password.
   * @returns A promise that resolves to the success of the operation.
   */
  async syncLatestGlobalPassword({
    oldPassword,
    globalPassword,
  }: {
    oldPassword: string;
    globalPassword: string;
  }) {
    return await this.#withControllerLock(async () => {
      // verify correct old password
      await this.verifyVaultPassword(oldPassword, {
        skipLock: true, // skip lock since we already have the lock
      });
      // update vault with latest globalPassword
      const { encKey, authKeyPair } = await this.#recoverEncKey(globalPassword);
      // update and encrypt the vault with new password
      await this.#createNewVaultWithAuthData({
        password: globalPassword,
        rawToprfEncryptionKey: encKey,
        rawToprfAuthKeyPair: authKeyPair,
      });
      // persist the latest global password authPubKey
      this.#persistAuthPubKey({
        authPubKey: authKeyPair.pk,
      });
      this.#resetPasswordOutdatedCache();
    });
  }

  /**
   * @description Fetch the password corresponding to the current authPubKey in state (current device password which is already out of sync with the current global password).
   * then we use this recovered old password to unlock the vault and set the password to the new global password.
   *
   * @param params - The parameters for fetching the password.
   * @param params.globalPassword - The latest global password.
   * @returns A promise that resolves to the password corresponding to the current authPubKey in state.
   */
  async recoverCurrentDevicePassword({
    globalPassword,
  }: {
    globalPassword: string;
  }): Promise<{ password: string }> {
    return await this.#withControllerLock(async () => {
      const currentDeviceAuthPubKey = this.#recoverAuthPubKey();
      const { password: currentDevicePassword } = await this.#recoverPassword({
        targetPwPubKey: currentDeviceAuthPubKey,
        globalPassword,
      });
      return {
        password: currentDevicePassword,
      };
    });
  }

  /**
   * @description Fetch the password corresponding to the targetPwPubKey.
   *
   * @param params - The parameters for fetching the password.
   * @param params.targetPwPubKey - The target public key of the password to recover.
   * @param params.globalPassword - The latest global password.
   * @returns A promise that resolves to the password corresponding to the current authPubKey in state.
   */
  async #recoverPassword({
    targetPwPubKey,
    globalPassword,
  }: {
    targetPwPubKey: SEC1EncodedPublicKey;
    globalPassword: string;
  }): Promise<{ password: string }> {
    const { encKey: latestPwEncKey, authKeyPair: latestPwAuthKeyPair } =
      await this.#recoverEncKey(globalPassword);

    try {
      const res = await this.toprfClient.recoverPassword({
        targetPwPubKey,
        curEncKey: latestPwEncKey,
        curAuthKeyPair: latestPwAuthKeyPair,
      });
      return res;
    } catch (error) {
      throw PasswordSyncError.getInstance(error);
    }
  }

  /**
   * @description Check if the current password is outdated compare to the global password.
   *
   * @param options - Optional options object.
   * @param options.skipCache - If true, bypass the cache and force a fresh check.
   * @param options.skipLock - Whether to skip the lock acquisition.
   * @returns A promise that resolves to true if the password is outdated, false otherwise.
   */
  async checkIsPasswordOutdated(options?: {
    skipCache?: boolean;
    skipLock?: boolean;
  }): Promise<boolean> {
    // cache result to reduce load on infra
    // Check cache first unless skipCache is true
    if (!options?.skipCache) {
      const { passwordOutdatedCache } = this.state;
      const now = Date.now();
      const isCacheValid =
        passwordOutdatedCache &&
        now - passwordOutdatedCache.timestamp < PASSWORD_OUTDATED_CACHE_TTL_MS;

      if (isCacheValid) {
        return passwordOutdatedCache.isExpiredPwd;
      }
    }

    const doCheck = async () => {
      this.#assertIsAuthenticatedUser(this.state);
      const {
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      } = this.state;

      const currentDeviceAuthPubKey = this.#recoverAuthPubKey();

      const { authPubKey: globalAuthPubKey } =
        await this.toprfClient.fetchAuthPubKey({
          nodeAuthTokens,
          authConnectionId: groupedAuthConnectionId || authConnectionId,
          userId,
        });

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

    return options?.skipLock
      ? await doCheck()
      : await this.#withControllerLock(doCheck);
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
    const authConnectionId =
      this.state.groupedAuthConnectionId || this.state.authConnectionId;

    try {
      await this.toprfClient.persistLocalKey({
        nodeAuthTokens: this.state.nodeAuthTokens,
        authConnectionId,
        userId: this.state.userId,
        oprfKey,
        authPubKey,
      });
    } catch (error) {
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
  async #recoverEncKey(password: string) {
    this.#assertIsAuthenticatedUser(this.state);
    const authConnectionId =
      this.state.groupedAuthConnectionId || this.state.authConnectionId;

    try {
      const recoverEncKeyResult = await this.toprfClient.recoverEncKey({
        nodeAuthTokens: this.state.nodeAuthTokens,
        password,
        authConnectionId,
        userId: this.state.userId,
      });
      return recoverEncKeyResult;
    } catch (error) {
      throw RecoveryError.getInstance(error);
    }
  }

  /**
   * Update the encryption key with new password and update the Metadata Store with new encryption key.
   *
   * @param newPassword - The new password to update.
   * @param oldPassword - The old password to verify.
   * @returns A promise that resolves to new encryption key and authentication key pair.
   */
  async #changeEncryptionKey(newPassword: string, oldPassword: string) {
    this.#assertIsAuthenticatedUser(this.state);
    const authConnectionId =
      this.state.groupedAuthConnectionId || this.state.authConnectionId;

    const {
      encKey,
      authKeyPair,
      keyShareIndex: newKeyShareIndex,
    } = await this.#recoverEncKey(oldPassword);

    return await this.toprfClient.changeEncKey({
      nodeAuthTokens: this.state.nodeAuthTokens,
      authConnectionId,
      userId: this.state.userId,
      oldEncKey: encKey,
      oldAuthKeyPair: authKeyPair,
      newKeyShareIndex,
      oldPassword,
      newPassword,
    });
  }

  /**
   * Encrypt and store the seed phrase backup in the metadata store.
   *
   * @param params - The parameters for encrypting and storing the seed phrase backup.
   * @param params.keyringId - The keyring id of the backup seed phrase.
   * @param params.seedPhrase - The seed phrase to store.
   * @param params.encKey - The encryption key to store.
   * @param params.authKeyPair - The authentication key pair to store.
   *
   * @returns A promise that resolves to the success of the operation.
   */
  async #encryptAndStoreSeedPhraseBackup(params: {
    keyringId: string;
    seedPhrase: Uint8Array;
    encKey: Uint8Array;
    authKeyPair: KeyPair;
  }): Promise<void> {
    try {
      const { keyringId, seedPhrase, encKey, authKeyPair } = params;

      const seedPhraseMetadata = new SecretMetadata(seedPhrase);
      const secretData = seedPhraseMetadata.toBytes();
      await this.#withPersistedSeedPhraseBackupsState(async () => {
        await this.toprfClient.addSecretDataItem({
          encKey,
          secretData,
          authKeyPair,
        });
        return {
          keyringId,
          seedPhrase,
        };
      });
    } catch (error) {
      log('Error encrypting and storing seed phrase backup', error);
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.FailedToEncryptAndStoreSeedPhraseBackup,
      );
    }
  }

  /**
   * Unlocks the encrypted vault using the provided password and returns the decrypted vault data.
   * This method ensures thread-safety by using a mutex lock when accessing the vault.
   *
   * @param password - The optional password to unlock the vault.
   * @returns A promise that resolves to an object containing:
   * - nodeAuthTokens: Authentication tokens to communicate with the TOPRF service
   * - toprfEncryptionKey: The decrypted TOPRF encryption key
   * - toprfAuthKeyPair: The decrypted TOPRF authentication key pair
   * @throws {Error} If:
   * - The password is invalid or empty
   * - The vault is not initialized
   * - The password is incorrect (from encryptor.decrypt)
   * - The decrypted vault data is malformed
   */
  async #unlockVaultAndGetBackupEncKey(password?: string): Promise<{
    nodeAuthTokens: NodeAuthTokens;
    toprfEncryptionKey: Uint8Array;
    toprfAuthKeyPair: KeyPair;
  }> {
    return this.#withVaultLock(async () => {
      const {
        vault: encryptedVault,
        vaultEncryptionKey,
        vaultEncryptionSalt,
      } = this.state;

      if (!encryptedVault) {
        throw new Error(SeedlessOnboardingControllerErrorMessage.VaultError);
      }

      if (!vaultEncryptionKey && !password) {
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.MissingCredentials,
        );
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
        const parsedEncryptedVault = JSON.parse(encryptedVault);

        if (vaultEncryptionSalt !== parsedEncryptedVault.salt) {
          throw new Error(
            SeedlessOnboardingControllerErrorMessage.ExpiredCredentials,
          );
        }

        if (typeof vaultEncryptionKey !== 'string') {
          throw new TypeError(
            SeedlessOnboardingControllerErrorMessage.WrongPasswordType,
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

      const { nodeAuthTokens, toprfEncryptionKey, toprfAuthKeyPair } =
        this.#parseVaultData(decryptedVaultData);

      // update the state with the restored nodeAuthTokens
      this.update((state) => {
        state.nodeAuthTokens = nodeAuthTokens;
        state.vaultEncryptionKey = updatedState.vaultEncryptionKey;
        state.vaultEncryptionSalt = updatedState.vaultEncryptionSalt;
      });

      return { nodeAuthTokens, toprfEncryptionKey, toprfAuthKeyPair };
    });
  }

  /**
   * Executes a callback function that creates or restores seed phrases and persists their hashes in the controller state.
   *
   * This method:
   * 1. Executes the provided callback to create/restore seed phrases
   * 2. Generates keccak256 hashes of the seed phrases
   * 3. Merges new hashes with existing ones in the state, ensuring uniqueness
   * 4. Updates the controller state with the combined hashes
   *
   * This is a wrapper method that should be used around any operation that creates
   * or restores seed phrases to ensure their hashes are properly tracked.
   *
   * @param createSeedPhraseBackupCallback - function that returns either a single seed phrase
   * or an array of seed phrases as Uint8Array(s)
   * @returns The original seed phrase(s) returned by the callback
   * @throws Rethrows any errors from the callback with additional logging
   */
  async #withPersistedSeedPhraseBackupsState(
    createSeedPhraseBackupCallback: () => Promise<{
      keyringId: string;
      seedPhrase: Uint8Array;
    }>,
  ): Promise<{
    keyringId: string;
    seedPhrase: Uint8Array;
  }> {
    try {
      const newBackup = await createSeedPhraseBackupCallback();

      this.#filterDupesAndUpdateSocialBackupsMetadata(newBackup);

      return newBackup;
    } catch (error) {
      log('Error persisting seed phrase backups', error);
      throw error;
    }
  }

  /**
   * Updates the social backups metadata state by adding new unique seed phrase backups.
   * This method ensures no duplicate backups are stored by checking the hash of each seed phrase.
   *
   * @param data - The backup data to add to the state
   * @param data.id - The identifier for the backup
   * @param data.seedPhrase - The seed phrase to backup as a Uint8Array
   */
  #filterDupesAndUpdateSocialBackupsMetadata(
    data:
      | {
          keyringId: string;
          seedPhrase: Uint8Array;
        }
      | {
          keyringId: string;
          seedPhrase: Uint8Array;
        }[],
  ) {
    const currentBackupsMetadata = this.state.socialBackupsMetadata;

    const newBackupsMetadata = Array.isArray(data) ? data : [data];
    const filteredNewBackupsMetadata: SocialBackupsMetadata[] = [];

    // filter out the backed up metadata that already exists in the state
    // to prevent duplicates
    newBackupsMetadata.forEach((item) => {
      const { keyringId, seedPhrase } = item;
      const backupHash = keccak256AndHexify(seedPhrase);

      const backupStateAlreadyExisted = currentBackupsMetadata.some(
        (backup) => backup.hash === backupHash,
      );

      if (!backupStateAlreadyExisted) {
        filteredNewBackupsMetadata.push({
          id: keyringId,
          hash: backupHash,
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
   * @param params.rawToprfAuthKeyPair - The authentication key pair to encrypt the vault.
   */
  async #createNewVaultWithAuthData({
    password,
    rawToprfEncryptionKey,
    rawToprfAuthKeyPair,
  }: {
    password: string;
    rawToprfEncryptionKey: Uint8Array;
    rawToprfAuthKeyPair: KeyPair;
  }): Promise<void> {
    this.#assertIsAuthenticatedUser(this.state);
    this.#setUnlocked();

    const { toprfEncryptionKey, toprfAuthKeyPair } = this.#serializeKeyData(
      rawToprfEncryptionKey,
      rawToprfAuthKeyPair,
    );

    const serializedVaultData = JSON.stringify({
      authTokens: this.state.nodeAuthTokens,
      toprfEncryptionKey,
      toprfAuthKeyPair,
    });

    await this.#updateVault({
      password,
      serializedVaultData,
    });
  }

  /**
   * Encrypt and update the vault with the given authentication data.
   *
   * @param params - The parameters for updating the vault.
   * @param params.password - The password to encrypt the vault.
   * @param params.serializedVaultData - The serialized authentication data to update the vault with.
   * @returns A promise that resolves to the updated vault.
   */
  async #updateVault({
    password,
    serializedVaultData,
  }: {
    password: string;
    serializedVaultData: string;
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

      this.update((state) => {
        state.vault = vault;
        state.vaultEncryptionKey = exportedKeyString;
        state.vaultEncryptionSalt = JSON.parse(vault).salt;
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
   * @param authKeyPair - The authentication key pair to serialize.
   * @returns The serialized encryption key and authentication key pair.
   */
  #serializeKeyData(
    encKey: Uint8Array,
    authKeyPair: KeyPair,
  ): {
    toprfEncryptionKey: string;
    toprfAuthKeyPair: string;
  } {
    const b64EncodedEncKey = bytesToBase64(encKey);
    const b64EncodedAuthKeyPair = JSON.stringify({
      sk: bigIntToHex(authKeyPair.sk), // Convert BigInt to hex string
      pk: bytesToBase64(authKeyPair.pk),
    });

    return {
      toprfEncryptionKey: b64EncodedEncKey,
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
    nodeAuthTokens: NodeAuthTokens;
    toprfEncryptionKey: Uint8Array;
    toprfAuthKeyPair: KeyPair;
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

    this.#assertIsValidVaultData(parsedVaultData);

    const rawToprfEncryptionKey = base64ToBytes(
      parsedVaultData.toprfEncryptionKey,
    );
    const parsedToprfAuthKeyPair = JSON.parse(parsedVaultData.toprfAuthKeyPair);
    const rawToprfAuthKeyPair = {
      sk: BigInt(parsedToprfAuthKeyPair.sk),
      pk: base64ToBytes(parsedToprfAuthKeyPair.pk),
    };

    return {
      nodeAuthTokens: parsedVaultData.authTokens,
      toprfEncryptionKey: rawToprfEncryptionKey,
      toprfAuthKeyPair: rawToprfAuthKeyPair,
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
   * @param options.skipLock - Whether to skip the lock acquisition.
   * @throws If the password is outdated.
   */
  async #assertPasswordInSync(options?: {
    skipCache?: boolean;
    skipLock?: boolean;
  }): Promise<void> {
    const isPasswordOutdated = await this.checkIsPasswordOutdated(options);
    if (isPasswordOutdated) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
      );
    }
  }

  #resetPasswordOutdatedCache(): void {
    this.update((state) => {
      delete state.passwordOutdatedCache;
    });
  }

  /**
   * Check if the provided value is a valid vault data.
   *
   * @param value - The value to check.
   * @throws If the value is not a valid vault data.
   */
  #assertIsValidVaultData(value: unknown): asserts value is VaultData {
    // value is not valid vault data if any of the following conditions are true:
    if (
      !value || // value is not defined
      typeof value !== 'object' || // value is not an object
      !('authTokens' in value) || // authTokens is not defined
      typeof value.authTokens !== 'object' || // authTokens is not an object
      !('toprfEncryptionKey' in value) || // toprfEncryptionKey is not defined
      typeof value.toprfEncryptionKey !== 'string' || // toprfEncryptionKey is not a string
      !('toprfAuthKeyPair' in value) || // toprfAuthKeyPair is not defined
      typeof value.toprfAuthKeyPair !== 'string' // toprfAuthKeyPair is not a string
    ) {
      throw new Error(SeedlessOnboardingControllerErrorMessage.VaultDataError);
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
