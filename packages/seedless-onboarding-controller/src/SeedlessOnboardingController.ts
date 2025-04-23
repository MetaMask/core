import { keccak256AndHexify } from '@metamask/auth-network-utils';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { encrypt, decrypt } from '@metamask/browser-passworder';
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
import { Mutex } from 'async-mutex';

import {
  controllerName,
  SeedlessOnboardingControllerError,
  Web3AuthNetwork,
} from './constants';
import { RecoveryError } from './errors';
import { projectLogger, createModuleLogger } from './logger';
import { SeedPhraseMetadata } from './SeedPhraseMetadata';
import type {
  VaultEncryptor,
  MutuallyExclusiveCallback,
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerState,
  VaultData,
  AuthenticatedUserDetails,
  SocialBackupsMetadata,
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
      persist: false,
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
  };

export class SeedlessOnboardingController extends BaseController<
  typeof controllerName,
  SeedlessOnboardingControllerState,
  SeedlessOnboardingControllerMessenger
> {
  readonly #vaultEncryptor: VaultEncryptor;

  readonly #vaultOperationMutex = new Mutex();

  readonly toprfClient: ToprfSecureBackup;

  /**
   * Creates a new SeedlessOnboardingController instance.
   *
   * @param options - The options for the SeedlessOnboardingController.
   * @param options.messenger - A restricted messenger.
   * @param options.state - Initial state to set on this controller.
   * @param options.encryptor - An optional encryptor to use for encrypting and decrypting seedless onboarding vault.
   * @param options.network - The network to be used for the Seedless Onboarding flow.
   */
  constructor({
    messenger,
    state,
    encryptor = { encrypt, decrypt }, // default to `encrypt` and `decrypt` from `@metamask/browser-passworder`
    network = Web3AuthNetwork.Mainnet,
  }: SeedlessOnboardingControllerOptions) {
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
    });
  }

  /**
   * Authenticate OAuth user using the seedless onboarding flow
   * and determine if the user is already registered or not.
   *
   * @param params - The parameters for authenticate OAuth user.
   * @param params.idTokens - The ID token(s) issued by OAuth verification service. Currently this array only contains a single idToken which is verified by all the nodes, in future we are considering to issue a unique idToken for each node.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.userId - user email or id from Social login
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * You can pass this to use aggregate multiple OAuth connections. Useful when you want user to have same account while using different OAuth connections.
   * @returns A promise that resolves to the authentication result.
   */
  async authenticate(params: {
    idTokens: string[];
    authConnectionId: string;
    userId: string;
    groupedAuthConnectionId?: string;
  }) {
    try {
      const { idTokens, authConnectionId, groupedAuthConnectionId, userId } =
        params;
      const hashedIdTokenHexes = idTokens.map((idToken) => {
        return remove0x(keccak256AndHexify(stringToBytes(idToken)));
      });
      const authenticationResult = await this.toprfClient.authenticate({
        verifier: groupedAuthConnectionId || authConnectionId,
        verifierId: userId,
        idTokens: hashedIdTokenHexes,
        singleIdVerifierParams: {
          subVerifier: authConnectionId,
          subVerifierIdTokens: idTokens,
        },
      });
      // update the state with the authenticated user info
      this.update((state) => {
        state.nodeAuthTokens = authenticationResult.nodeAuthTokens;
        state.authConnectionId = authConnectionId;
        state.groupedAuthConnectionId = groupedAuthConnectionId;
        state.userId = userId;
      });
      return authenticationResult;
    } catch (error) {
      log('Error authenticating user', error);
      throw new Error(SeedlessOnboardingControllerError.AuthenticationError);
    }
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

    // locally evaluate the encryption key from the password
    const { encKey, authKeyPair, oprfKey } = this.toprfClient.createLocalKey({
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
      }

      return SeedPhraseMetadata.parseSeedPhraseFromMetadataStore(secretData);
    } catch (error) {
      log('Error fetching seed phrase metadata', error);
      throw new Error(
        SeedlessOnboardingControllerError.FailedToFetchSeedPhraseMetadata,
      );
    }
  }

  /**
   * Update the password of the seedless onboarding flow.
   *
   * Changing password will also update the encryption key, metadata store and the vault with new encrypted values.
   *
   * @param newPassword - The new password to update.
   * @param oldPassword - The old password to verify.
   */
  async changePassword(newPassword: string, oldPassword: string) {
    // verify the old password of the encrypted vault
    await this.#unlockVaultWithPassword(oldPassword);

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
    } catch (error) {
      log('Error changing password', error);
      throw new Error(SeedlessOnboardingControllerError.FailedToChangePassword);
    }
  }

  /**
   * Update the backup metadata state for the given seed phrase.
   *
   * @param keyringId - The keyring id of the backup seed phrase.
   * @param seedPhrase - The seed phrase to update the backup metadata for.
   */
  updateBackupMetadataState(keyringId: string, seedPhrase: Uint8Array) {
    const newBackupMetadata = {
      id: keyringId,
      hash: keccak256AndHexify(seedPhrase),
    };

    this.#updateSocialBackupsMetadata(newBackupMetadata);
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
   * Persist the encryption key for the seedless onboarding flow.
   *
   * @param oprfKey - The OPRF key to be splited and persisted.
   * @param authPubKey - The authentication public key.
   * @returns A promise that resolves to the success of the operation.
   */
  async #persistOprfKey(oprfKey: bigint, authPubKey: SEC1EncodedPublicKey) {
    this.#assertIsAuthenticatedUser(this.state);
    const verifier =
      this.state.groupedAuthConnectionId || this.state.authConnectionId;

    try {
      await this.toprfClient.persistLocalKey({
        nodeAuthTokens: this.state.nodeAuthTokens,
        verifier,
        verifierId: this.state.userId,
        oprfKey,
        authPubKey,
      });
    } catch (error) {
      log('Error persisting local encryption key', error);
      throw new Error(SeedlessOnboardingControllerError.FailedToPersistOprfKey);
    }
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
    const verifier =
      this.state.groupedAuthConnectionId || this.state.authConnectionId;

    try {
      const recoverEncKeyResult = await this.toprfClient.recoverEncKey({
        nodeAuthTokens: this.state.nodeAuthTokens,
        password,
        verifier,
        verifierId: this.state.userId,
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
    const verifier =
      this.state.groupedAuthConnectionId || this.state.authConnectionId;

    const {
      encKey,
      authKeyPair,
      keyShareIndex: newKeyShareIndex,
    } = await this.#recoverEncKey(oldPassword);

    return await this.toprfClient.changeEncKey({
      nodeAuthTokens: this.state.nodeAuthTokens,
      verifier,
      verifierId: this.state.userId,
      oldEncKey: encKey,
      oldAuthKeyPair: authKeyPair,
      newKeyShareIndex,
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

      const seedPhraseMetadata = new SeedPhraseMetadata(seedPhrase);
      const secretData = seedPhraseMetadata.toBytes();
      await this.#withPersistedSeedPhraseBackupsState(async () => {
        await this.toprfClient.addSecretDataItem({
          encKey,
          secretData,
          authKeyPair,
        });
        return {
          id: keyringId,
          seedPhrase,
        };
      });
    } catch (error) {
      log('Error encrypting and storing seed phrase backup', error);
      throw new Error(
        SeedlessOnboardingControllerError.FailedToEncryptAndStoreSeedPhraseBackup,
      );
    }
  }

  /**
   * Unlocks the encrypted vault using the provided password and returns the decrypted vault data.
   * This method ensures thread-safety by using a mutex lock when accessing the vault.
   *
   * @param password - The password to decrypt the vault.
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
  async #unlockVaultWithPassword(password: string): Promise<{
    nodeAuthTokens: NodeAuthTokens;
    toprfEncryptionKey: Uint8Array;
    toprfAuthKeyPair: KeyPair;
  }> {
    return this.#withVaultLock(async () => {
      assertIsValidPassword(password);

      const encryptedVault = this.state.vault;
      if (!encryptedVault) {
        throw new Error(SeedlessOnboardingControllerError.VaultError);
      }
      // Note that vault decryption using the password is a very costly operation as it involves deriving the encryption key
      // from the password using an intentionally slow key derivation function.
      // We should make sure that we only call it very intentionally.
      const decryptedVaultData = await this.#vaultEncryptor.decrypt(
        password,
        encryptedVault,
      );

      const { nodeAuthTokens, toprfEncryptionKey, toprfAuthKeyPair } =
        this.#parseVaultData(decryptedVaultData);

      // update the state with the restored nodeAuthTokens
      this.update((state) => {
        state.nodeAuthTokens = nodeAuthTokens;
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
      id: string;
      seedPhrase: Uint8Array;
    }>,
  ): Promise<{
    id: string;
    seedPhrase: Uint8Array;
  }> {
    try {
      const backUps = await createSeedPhraseBackupCallback();
      const newBackupMetadata = {
        id: backUps.id,
        hash: keccak256AndHexify(backUps.seedPhrase),
      };

      this.#updateSocialBackupsMetadata(newBackupMetadata);

      return backUps;
    } catch (error) {
      log('Error persisting seed phrase backups', error);
      throw error;
    }
  }

  #updateSocialBackupsMetadata(newSocialBackupMetadata: SocialBackupsMetadata) {
    // filter out the backed up metadata that already exists in the state
    // to prevent duplicates
    const existingBackupsMetadata = this.state.socialBackupsMetadata.find(
      (backup) => backup.id === newSocialBackupMetadata.id,
    );

    if (!existingBackupsMetadata) {
      this.update((state) => {
        state.socialBackupsMetadata = [
          ...state.socialBackupsMetadata,
          newSocialBackupMetadata,
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

      const updatedState: Partial<SeedlessOnboardingControllerState> = {};

      // Note that vault encryption using the password is a very costly operation as it involves deriving the encryption key
      // from the password using an intentionally slow key derivation function.
      // We should make sure that we only call it very intentionally.
      updatedState.vault = await this.#vaultEncryptor.encrypt(
        password,
        serializedVaultData,
      );

      this.update((state) => {
        state.vault = updatedState.vault;
      });
    });
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
      throw new Error(SeedlessOnboardingControllerError.InvalidVaultData);
    }

    let parsedVaultData: unknown;
    try {
      parsedVaultData = JSON.parse(data);
    } catch {
      throw new Error(SeedlessOnboardingControllerError.InvalidVaultData);
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
      throw new Error(SeedlessOnboardingControllerError.MissingAuthUserInfo);
    }

    if (
      !('nodeAuthTokens' in value) ||
      typeof value.nodeAuthTokens !== 'object' ||
      !Array.isArray(value.nodeAuthTokens) ||
      value.nodeAuthTokens.length < 3 // At least 3 auth tokens are required for Threshold OPRF service
    ) {
      throw new Error(SeedlessOnboardingControllerError.InsufficientAuthToken);
    }
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
      throw new Error(SeedlessOnboardingControllerError.VaultDataError);
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
    throw new Error(SeedlessOnboardingControllerError.WrongPasswordType);
  }

  if (!password || !password.length) {
    throw new Error(SeedlessOnboardingControllerError.InvalidEmptyPassword);
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
