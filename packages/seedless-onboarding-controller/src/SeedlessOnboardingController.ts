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
  bytesToHex,
  remove0x,
  bigIntToHex,
} from '@metamask/utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';
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
  Encryptor,
  MutuallyExclusiveCallback,
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerState,
  VaultData,
} from './types';

const log = createModuleLogger(projectLogger, controllerName);

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
    backupHashes: {
      persist: true,
      anonymous: true,
    },
    nodeAuthTokens: {
      persist: false,
      anonymous: true,
    },
  };

export const defaultState: SeedlessOnboardingControllerState = {
  backupHashes: [],
};

export class SeedlessOnboardingController extends BaseController<
  typeof controllerName,
  SeedlessOnboardingControllerState,
  SeedlessOnboardingControllerMessenger
> {
  readonly #vaultEncryptor: Encryptor = {
    encrypt,
    decrypt,
  };

  readonly #vaultOperationMutex = new Mutex();

  readonly toprfClient: ToprfSecureBackup;

  constructor({
    messenger,
    state,
    encryptor,
    network = Web3AuthNetwork.Mainnet,
  }: SeedlessOnboardingControllerOptions) {
    super({
      name: controllerName,
      metadata: seedlessOnboardingMetadata,
      state: {
        ...defaultState,
        ...state,
      },
      messenger,
    });

    if (encryptor) {
      this.#vaultEncryptor = encryptor;
    }

    this.toprfClient = new ToprfSecureBackup({
      network,
    });
  }

  /**
   * @description Authenticate OAuth user using the seedless onboarding flow
   * and determine if the user is already registered or not.
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
      const verifier = groupedAuthConnectionId || authConnectionId;
      const verifierId = userId;
      const hashedIdTokenHexes = idTokens.map((idToken) => {
        return remove0x(bytesToHex(keccak256(stringToBytes(idToken))));
      });
      const authenticationResult = await this.toprfClient.authenticate({
        verifier,
        verifierId,
        idTokens: hashedIdTokenHexes,
        singleIdVerifierParams: {
          subVerifier: authConnectionId,
          subVerifierIdTokens: idTokens,
        },
      });
      this.update((state) => {
        state.nodeAuthTokens = authenticationResult.nodeAuthTokens;
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
   * @param params - The parameters for backup seed phrase.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * You can pass this to use aggregate connection.
   * @param params.userId - user email or id from Social login
   * @param params.password - The password used to create new wallet and seedphrase
   * @param params.seedPhrase - The seed phrase to backup
   * @returns A promise that resolves to the encrypted seed phrase and the encryption key.
   */
  async createToprfKeyAndBackupSeedPhrase({
    authConnectionId,
    groupedAuthConnectionId,
    userId,
    password,
    seedPhrase,
  }: {
    authConnectionId: string;
    groupedAuthConnectionId?: string;
    userId: string;
    password: string;
    seedPhrase: Uint8Array;
  }): Promise<void> {
    // locally evaluate the encryption key from the password
    const { encKey, authKeyPair, oprfKey } = this.toprfClient.createLocalKey({
      password,
    });

    // encrypt and store the seed phrase backup
    await this.#encryptAndStoreSeedPhraseBackup(
      seedPhrase,
      encKey,
      authKeyPair,
    );

    // store/persist the encryption key shares
    // We store the seed phrase metadata in the metadata store first. If this operation fails,
    // we avoid persisting the encryption key shares to prevent a situation where a user appears
    // to have an account but with no associated data.
    await this.#persistOprfKey({
      groupedAuthConnectionId,
      authConnectionId,
      userId,
      oprfKey,
      authPubKey: authKeyPair.pk,
    });
    // TODO: store srp hashes or some identifier for srp in array to see if a srp is part of backup
    // create a new vault with the resulting authentication data
    await this.#createNewVaultWithAuthData({
      password,
      rawToprfEncryptionKey: encKey,
      rawToprfAuthKeyPair: authKeyPair,
    });
  }

  /**
   * Add a new seed phrase backup to the metadata store.
   *
   * @param seedPhrase - The seed phrase to backup.
   * @param password - The password used to create new wallet and seedphrase
   * @returns A promise that resolves to the success of the operation.
   */
  async addNewSeedPhraseBackup(
    seedPhrase: Uint8Array,
    password: string, // TODO: to verify whether we need the password here, check how multi-srp is handled in the keyring first.
  ): Promise<void> {
    // verify the password and unlock the vault
    const { toprfEncryptionKey, toprfAuthKeyPair } =
      await this.#verifyPassword(password);

    // encrypt and store the seed phrase backup
    await this.#encryptAndStoreSeedPhraseBackup(
      seedPhrase,
      toprfEncryptionKey,
      toprfAuthKeyPair,
    );
  }

  /**
   * Add array of new seed phrase backups to the metadata store in batch.
   *
   * @param seedPhrases - The seed phrases to backup.
   * @param password - The password used to create new wallet and seedphrase
   * @returns A promise that resolves to the success of the operation.
   */
  async batchAddSeedPhraseBackups(seedPhrases: Uint8Array[], password: string) {
    const { toprfEncryptionKey, toprfAuthKeyPair } =
      await this.#verifyPassword(password);

    // prepare seed phrase metadata
    const seedPhraseMetadataArr =
      SeedPhraseMetadata.fromBatchSeedPhrases(seedPhrases);

    try {
      // encrypt and store the seed phrase backups
      await this.#withPersistedSeedPhraseBackupsState(async () => {
        await this.toprfClient.batchAddSecretDataItems({
          secretData: seedPhraseMetadataArr.map((metadata) =>
            metadata.toBytes(),
          ),
          encKey: toprfEncryptionKey,
          authKeyPair: toprfAuthKeyPair,
        });
        return seedPhrases;
      });
    } catch (error) {
      log('Error encrypting and storing seed phrase backups', error);
      throw new Error(
        SeedlessOnboardingControllerError.FailedToEncryptAndStoreSeedPhraseBackup,
      );
    }
  }

  /**
   * @description Fetches encrypted seed phrases and metadata for user's account from the metadata store.
   * @param params - The parameters for fetching seed phrase metadata.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * You can pass this to use aggregate connection.
   * @param params.userId - user email or id from Social login
   * @param params.password - The password used to create new wallet and seedphrase
   * @returns A promise that resolves to the seed phrase metadata.
   */
  async fetchAllSeedPhrases(params: {
    authConnectionId: string;
    groupedAuthConnectionId?: string;
    userId: string;
    password: string;
  }): Promise<Uint8Array[]> {
    const { authConnectionId, groupedAuthConnectionId, userId, password } =
      params;
    this.#assertIsValidNodeAuthTokens(this.state.nodeAuthTokens);

    const { encKey, authKeyPair } = await this.#recoverEncKey({
      authConnectionId,
      groupedAuthConnectionId,
      userId,
      password,
    });

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

      return this.#withPersistedSeedPhraseBackupsState<Uint8Array[]>(() =>
        Promise.resolve(
          SeedPhraseMetadata.parseSeedPhraseFromMetadataStore(secretData),
        ),
      );
    } catch (error) {
      log('Error fetching seed phrase metadata', error);
      throw new Error(
        SeedlessOnboardingControllerError.FailedToFetchSeedPhraseMetadata,
      );
    }
  }

  /**
   * @description Update the password of the seedless onboarding flow.
   *
   * Changing password will also update the encryption key and metadata store with new encrypted values.
   *
   * @param params - The parameters for updating the password.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * You can pass this to use aggregate connection.
   * @param params.userId - user email or id from Social login
   * @param params.newPassword - The new password to update.
   * @param params.oldPassword - The old password to verify.
   */
  async changePassword(params: {
    authConnectionId: string;
    groupedAuthConnectionId?: string;
    userId: string;
    newPassword: string;
    oldPassword: string;
  }) {
    // verify the old password of the encrypted vault
    await this.#verifyPassword(params.oldPassword);

    try {
      // update the encryption key with new password and update the Metadata Store
      const { encKey: newEncKey, authKeyPair: newAuthKeyPair } =
        await this.#changeEncryptionKey(params);

      // update and encrypt the vault with new password
      await this.#createNewVaultWithAuthData({
        password: params.newPassword,
        rawToprfEncryptionKey: newEncKey,
        rawToprfAuthKeyPair: newAuthKeyPair,
      });
    } catch (error) {
      log('Error changing password', error);
      throw new Error(SeedlessOnboardingControllerError.FailedToChangePassword);
    }
  }

  /**
   * @description Get the hash of the seed phrase backup for the given seed phrase, from the state.
   *
   * If the given seed phrase is not backed up and not found in the state, it will return `undefined`.
   *
   * @param seedPhrase - The seed phrase to get the hash of.
   * @returns A promise that resolves to the hash of the seed phrase backup.
   */
  getSeedPhraseBackupHash(seedPhrase: Uint8Array): string | undefined {
    return this.state.backupHashes.find((hash) => {
      return hash === bytesToBase64(keccak256(seedPhrase));
    });
  }

  /**
   * Persist the encryption key for the seedless onboarding flow.
   *
   * @param params - The parameters for persisting the encryption key.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * You can pass this to use aggregate connection.
   * @param params.userId - user email or id from Social login
   * @param params.oprfKey - The OPRF key to be splited and persisted.
   * @param params.authPubKey - The authentication public key.
   * @returns A promise that resolves to the success of the operation.
   */
  async #persistOprfKey(params: {
    authConnectionId: string;
    groupedAuthConnectionId?: string;
    userId: string;
    oprfKey: bigint;
    authPubKey: SEC1EncodedPublicKey;
  }) {
    const { nodeAuthTokens } = this.state;
    this.#assertIsValidNodeAuthTokens(nodeAuthTokens);

    try {
      await this.toprfClient.persistLocalKey({
        nodeAuthTokens,
        verifier: params.groupedAuthConnectionId || params.authConnectionId,
        verifierId: params.userId,
        oprfKey: params.oprfKey,
        authPubKey: params.authPubKey,
      });
    } catch (error) {
      log('Error persisting local encryption key', error);
      throw new Error(SeedlessOnboardingControllerError.FailedToPersistOprfKey);
    }
  }

  /**
   * @description Recover the encryption key from password.
   * @param params - The parameters for recovering the encryption key.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * You can pass this to use aggregate connection.
   * @param params.userId - user email or id from Social login
   * @param params.password - The password used to derive the encryption key.
   * @returns A promise that resolves to the encryption key and authentication key pair.
   * @throws RecoveryError - If failed to recover the encryption key.
   */
  async #recoverEncKey(params: {
    authConnectionId: string;
    groupedAuthConnectionId?: string;
    userId: string;
    password: string;
  }) {
    const { nodeAuthTokens } = this.state;
    this.#assertIsValidNodeAuthTokens(nodeAuthTokens);

    try {
      const recoverEncKeyResult = await this.toprfClient.recoverEncKey({
        nodeAuthTokens,
        password: params.password,
        verifier: params.groupedAuthConnectionId || params.authConnectionId,
        verifierId: params.userId,
      });
      return recoverEncKeyResult;
    } catch (error) {
      throw RecoveryError.getInstance(error);
    }
  }

  /**
   * Update the encryption key with new password and update the Metadata Store with new encryption key.
   *
   * @param params - The parameters for updating the encryption key.
   * @param params.authConnectionId - OAuth authConnectionId from dashboard
   * @param params.groupedAuthConnectionId - Optional grouped authConnectionId to be used for the authenticate request.
   * You can pass this to use aggregate connection.
   * @param params.userId - user email or id from Social login
   * @param params.newPassword - The new password to update.
   * @param params.oldPassword - The old password to verify.
   * @returns A promise that resolves to new encryption key and authentication key pair.
   */
  async #changeEncryptionKey(params: {
    authConnectionId: string;
    groupedAuthConnectionId?: string;
    userId: string;
    newPassword: string;
    oldPassword: string;
  }) {
    const {
      authConnectionId,
      groupedAuthConnectionId,
      userId,
      newPassword,
      oldPassword,
    } = params;

    const { nodeAuthTokens } = this.state;
    this.#assertIsValidNodeAuthTokens(nodeAuthTokens);

    const {
      encKey,
      authKeyPair,
      keyShareIndex: newKeyShareIndex,
    } = await this.#recoverEncKey({
      authConnectionId,
      groupedAuthConnectionId,
      userId,
      password: oldPassword,
    });

    return await this.toprfClient.changeEncKey({
      nodeAuthTokens,
      verifier: groupedAuthConnectionId || authConnectionId,
      verifierId: userId,
      oldEncKey: encKey,
      oldAuthKeyPair: authKeyPair,
      newKeyShareIndex,
      newPassword,
    });
  }

  /**
   * Encrypt and store the seed phrase backup in the metadata store.
   *
   * @param seedPhrase - The seed phrase to store.
   * @param encKey - The encryption key to store.
   * @param authKeyPair - The authentication key pair to store.
   *
   * @returns A promise that resolves to the success of the operation.
   */
  async #encryptAndStoreSeedPhraseBackup(
    seedPhrase: Uint8Array,
    encKey: Uint8Array,
    authKeyPair: KeyPair,
  ): Promise<void> {
    this.#assertIsValidNodeAuthTokens(this.state.nodeAuthTokens);

    try {
      const seedPhraseMetadata = new SeedPhraseMetadata(seedPhrase);
      const secretData = seedPhraseMetadata.toBytes();
      await this.#withPersistedSeedPhraseBackupsState(async () => {
        await this.toprfClient.addSecretDataItem({
          encKey,
          secretData,
          authKeyPair,
        });
        return seedPhrase;
      });
    } catch (error) {
      log('Error encrypting and storing seed phrase backup', error);
      throw new Error(
        SeedlessOnboardingControllerError.FailedToEncryptAndStoreSeedPhraseBackup,
      );
    }
  }

  /**
   * Verify the password of the encrypted vault.
   *
   * Upon successful verification, reterieved the nodeAuthTokens, and updates the state with the restored nodeAuthTokens.
   *
   * @param password - The password to verify.
   * @returns A promise that resolves to the decrypted vault data.
   * @throws If the password is incorrect, throw 'incorrect password' error from the #encryptor.decrypt
   */
  async #verifyPassword(password: string): Promise<{
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
   * Persist the seed phrase backups state with the hashed seed phrase backups returned from the callback.
   *
   * @param callback - The function to execute while the seed phrase backups state is persisted.
   * @returns A promise that resolves to the success of the operation.
   */
  async #withPersistedSeedPhraseBackupsState<
    Result extends Uint8Array | Uint8Array[],
  >(callback: () => Promise<Result>): Promise<Result> {
    try {
      const backedUpSeedPhrases = await callback();
      let backedUpHashB64Strings: string[] = [];

      if (Array.isArray(backedUpSeedPhrases)) {
        backedUpHashB64Strings = backedUpSeedPhrases.map((seedPhrase) =>
          bytesToBase64(keccak256(seedPhrase)),
        );
      } else {
        backedUpHashB64Strings = [
          bytesToBase64(keccak256(backedUpSeedPhrases)),
        ];
      }

      const existingBackedUpHashes = this.state.backupHashes;
      const uniqueHashesSet = new Set([
        ...existingBackedUpHashes,
        ...backedUpHashB64Strings,
      ]);

      this.update((state) => {
        state.backupHashes = Array.from(uniqueHashesSet);
      });

      return backedUpSeedPhrases;
    } catch (error) {
      log('Error persisting seed phrase backups', error);
      throw error;
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
    const { nodeAuthTokens } = this.state;
    this.#assertIsValidNodeAuthTokens(nodeAuthTokens);

    const { toprfEncryptionKey, toprfAuthKeyPair } = this.#serializeKeyData(
      rawToprfEncryptionKey,
      rawToprfAuthKeyPair,
    );

    const serializedVaultData = JSON.stringify({
      authTokens: nodeAuthTokens,
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
   * @description Serialize the encryption key and authentication key pair.
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
   * Check if the provided value is a valid node auth tokens.
   *
   * @param value - The value to check.
   * @throws If the value is not a valid node auth tokens.
   */
  #assertIsValidNodeAuthTokens(
    value: unknown,
  ): asserts value is NodeAuthTokens {
    if (!Array.isArray(value) || value.length === 0) {
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
