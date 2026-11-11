import { keccak256AndHexify } from '@metamask/auth-network-utils';
import { BaseController } from '@metamask/base-controller';
import type * as encryptionUtils from '@metamask/browser-passworder';
import { decrypt, encrypt, IV_LENGTH } from '@metamask/cryptography/aes-gcm';
import type {
  DefaultEncryptionResult,
  EncryptionResultConstraint,
  Encryptor,
} from '@metamask/keyring-controller';
import type {
  AuthenticateResult,
  ChangeEncryptionKeyResult,
  EnvelopeKeys,
  KeyPair,
  RecoverEncryptionKeyResult,
  SEC1EncodedPublicKey,
  FetchedSecretDataItem,
} from '@metamask/toprf-secure-backup';
import {
  ToprfSecureBackup,
  EncAccountDataType,
} from '@metamask/toprf-secure-backup';
import {
  base64ToBytes,
  bigIntToHex,
  bytesToBase64,
  bytesToHex,
  bytesToString,
  stringToBytes,
  concatBytes,
} from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Mutex } from 'async-mutex';

import type { AuthConnection } from './constants.js';
import {
  controllerName,
  PASSWORD_OUTDATED_CACHE_TTL_MS,
  SecretType,
  SeedlessOnboardingControllerErrorMessage,
  SeedlessOnboardingMigrationVersion,
  Web3AuthNetwork,
} from './constants.js';
import {
  deriveControlKeys,
  getPasswordNamespaceAuthKeyPair,
  nextControlSeq,
  openEnvelope,
  pubKeysEqual,
  sealEnvelope,
  selectControlRecord,
} from './envelope/envelope-keys.js';
import type {
  ControlRecord,
  Envelope,
  VaultKeySet,
} from './envelope/envelope-keys.js';
import { EnvelopeStore } from './envelope/EnvelopeStore.js';
import {
  decryptPendingMigration,
  encryptPendingMigration,
} from './envelope/pending-migration.js';
import type {
  PendingEnvelopeMigration,
  SealedEnvelope,
} from './envelope/pending-migration.js';
import {
  PasswordSyncError,
  RecoveryError,
  SeedlessOnboardingError,
} from './errors.js';
import { projectLogger, createModuleLogger } from './logger.js';
import {
  decodeAal2Token,
  getValidRecoverySession,
} from './mfa-recovery/recovery-session.js';
import type { RecoveryRequest } from './mfa-recovery/recovery-session.js';
import { SecretMetadata } from './SecretMetadata.js';
import type {
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
} from './SeedlessOnboardingController-types.js';
import {
  getInitialSeedlessOnboardingControllerStateWithDefaults,
  seedlessOnboardingMetadata,
} from './state.js';
import type {
  MutuallyExclusiveCallback,
  SeedlessOnboardingControllerState,
  AuthenticatedUserDetails,
  SocialBackupsMetadata,
  RefreshJWTToken,
  RevokeRefreshToken,
  RenewRefreshToken,
  VaultData,
  DeserializedVaultData,
  RecoverySession,
} from './types.js';
import {
  assertIsEncryptedKeyringEncryptionKeySet,
  assertIsEncryptedSeedlessEncryptionKeySet,
  assertIsPasswordOutdatedCacheValid,
  assertIsSeedlessOnboardingUserAuthenticated,
  assertIsValidPassword,
  compareAndGetLatestToken,
  decodeJWTToken,
  decodeNodeAuthToken,
  deserializeVaultData,
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  trackIncompleteMetadataBackupEvents,
  isAuthTokenError,
  isCouldNotDeriveEncryptionKeyError,
  isMaxKeyChainLengthError,
  isTokenNearExpiry,
  parseVaultData,
  parseAndValidateSecretMetadataBackup,
  serializeVaultData,
} from './utils/index.js';
import type { SecretBackupData } from './utils/index.js';

export type {
  SeedlessOnboardingControllerActions,
  SeedlessOnboardingControllerEvents,
  SeedlessOnboardingControllerGetStateAction,
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
  SeedlessOnboardingControllerStateChangeEvent,
} from './SeedlessOnboardingController-types.js';
export { getInitialSeedlessOnboardingControllerStateWithDefaults } from './state.js';

const log = createModuleLogger(projectLogger, controllerName);

/**
 * @param vaultData - The decrypted vault data.
 * @returns The vault's key set, as the envelope vault key set `K_v`.
 */
function toVaultKeySet(vaultData: DeserializedVaultData): VaultKeySet {
  return {
    authKeyPair: vaultData.toprfAuthKeyPair,
    encKey: vaultData.toprfEncryptionKey,
    localWrapKey: vaultData.toprfPwEncryptionKey,
  };
}

/**
 * Seal the vault key set for an envelope partition.
 *
 * @param keys - The envelope keys of the partition.
 * @param path - The path the keys were derived on.
 * @param vaultKeySet - The vault key set.
 * @returns The envelope and its partition keys.
 */
async function sealFor(
  keys: EnvelopeKeys,
  path: Envelope['path'],
  vaultKeySet: VaultKeySet,
): Promise<SealedEnvelope> {
  return {
    keys,
    envelope: await sealEnvelope(keys.wrapKey, path, vaultKeySet),
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'fetchMetadataAccessCreds',
  'preloadToprfNodeDetails',
  'authenticate',
  'createToprfKeyAndBackupSeedPhrase',
  'addNewSecretData',
  'fetchAllSecretData',
  'changePassword',
  'updateBackupMetadataState',
  'verifyVaultPassword',
  'getSecretDataBackupState',
  'submitPassword',
  'identifyIncompleteMetadataBackup',
  'setLocked',
  'syncLatestGlobalPassword',
  'submitGlobalPassword',
  'checkIsPasswordOutdated',
  'getIsUserAuthenticated',
  'clearState',
  'storeKeyringEncryptionKey',
  'loadKeyringEncryptionKey',
  'refreshAuthTokens',
  'revokePendingRefreshTokens',
  'rotateRefreshToken',
  'getAccessToken',
  'checkNodeAuthTokenExpired',
  'checkMetadataAccessTokenExpired',
  'checkAccessTokenExpired',
  'runMigrations',
  'authenticateForRecovery',
  'migrateToEnvelope',
  'recoverWithRecoverySecret',
  'setLocalPassword',
  'resetPasswordWithVaultKeys',
] as const;

export class SeedlessOnboardingController<
  EncryptionKey = encryptionUtils.EncryptionKey,
  SupportedKeyDerivationOptions = encryptionUtils.KeyDerivationOptions,
  EncryptionResult extends
    EncryptionResultConstraint<SupportedKeyDerivationOptions> =
    DefaultEncryptionResult<SupportedKeyDerivationOptions>,
> extends BaseController<
  typeof controllerName,
  SeedlessOnboardingControllerState,
  SeedlessOnboardingControllerMessenger
> {
  readonly #vaultEncryptor: Encryptor<
    EncryptionKey,
    SupportedKeyDerivationOptions,
    EncryptionResult
  >;

  readonly #controllerOperationMutex = new Mutex();

  readonly #vaultOperationMutex = new Mutex();

  /**
   * In-flight promise for `refreshAuthTokens`.  Any concurrent caller that
   * arrives while a refresh is already in-progress will share this promise
   * rather than issuing a second HTTP request with the same refresh token.
   */
  #pendingRefreshPromise: Promise<void> | undefined;

  readonly toprfClient: ToprfSecureBackup;

  readonly #envelopeStore: EnvelopeStore;

  readonly #refreshJWTToken: RefreshJWTToken;

  readonly #revokeRefreshToken: RevokeRefreshToken;

  readonly #renewRefreshToken: RenewRefreshToken;

  /**
   * The TTL of the password outdated cache in milliseconds.
   */
  readonly #passwordOutdatedCacheTTL: number;

  /**
   * Controller lock state.
   *
   * The controller lock is synchronized with the keyring lock.
   */
  #isUnlocked = false;

  /**
   * Cached decrypted vault data.
   *
   * This is used to cache the decrypted vault data to avoid decrypting the vault data multiple times.
   */
  #cachedDecryptedVaultData: DeserializedVaultData | undefined;

  /**
   * The vault key set recovered by `recoverWithRecoverySecret`, held in
   * memory until `setLocalPassword` creates the local vault with it.
   */
  #recoveredVaultKeySet: VaultKeySet | undefined;

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
   * @param options.renewRefreshToken - A function to renew the refresh token and get new revoke token.
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
    renewRefreshToken,
    passwordOutdatedCacheTTL = PASSWORD_OUTDATED_CACHE_TTL_MS,
  }: SeedlessOnboardingControllerOptions<
    EncryptionKey,
    SupportedKeyDerivationOptions,
    EncryptionResult
  >) {
    super({
      name: controllerName,
      metadata: seedlessOnboardingMetadata,
      state: getInitialSeedlessOnboardingControllerStateWithDefaults(state),
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
    this.#envelopeStore = new EnvelopeStore({
      getToprfClient: (): ToprfSecureBackup => this.toprfClient,
    });
    this.#refreshJWTToken = refreshJWTToken;
    this.#revokeRefreshToken = revokeRefreshToken;
    this.#renewRefreshToken = renewRefreshToken;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
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

    // Use the same 90%-lifetime threshold as checkMetadataAccessTokenExpired
    // so both code paths agree on when a refresh is needed.
    const decodedToken = decodeJWTToken(metadataAccessToken);
    if (isTokenNearExpiry(decodedToken.exp, decodedToken.iat)) {
      // Token is near expiry or already expired, refresh it
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
   * Gets the node details for the TOPRF operations.
   * This function can be called to get the node endpoints, indexes and pubkeys and cache them locally.
   */
  async preloadToprfNodeDetails(): Promise<void> {
    try {
      await this.toprfClient.getNodeDetails();
    } catch {
      log('Failed to fetch node details');
    }
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
   * @param params.refreshToken - Refresh token issued during OAuth login. Written to state when provided.
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
    refreshToken: string;
    revokeToken?: string;
    skipLock?: boolean;
  }): Promise<AuthenticateResult> {
    const doAuthenticateWithNodes = async (): Promise<AuthenticateResult> => {
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
          state.metadataAccessToken = metadataAccessToken;
          state.refreshToken = refreshToken;
          if (revokeToken) {
            // Temporarily store revoke token & access token in state for later vault creation
            state.revokeToken = revokeToken;
          }
          state.accessToken = accessToken;

          // we will check if the controller state is properly set with the authenticated user info
          // before setting the isSeedlessOnboardingUserAuthenticated to true
          assertIsSeedlessOnboardingUserAuthenticated(state);
          state.isSeedlessOnboardingUserAuthenticated = true;
        });

        return authenticationResult;
      } catch (error) {
        log('Error authenticating user', error);
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.AuthenticationError,
          {
            cause: error,
          },
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

      if (this.state.vault) {
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.VaultAlreadyExists,
        );
      }

      // locally evaluate the encryption key from the password
      const { encKey, pwEncKey, authKeyPair, oprfKey } =
        await this.toprfClient.createLocalKey({
          password,
        });
      const performKeyCreationAndBackup = async (): Promise<void> => {
        // encrypt and store the secret data
        const secretMetadata = await this.#encryptAndStoreSecretData({
          data: seedPhrase,
          dataType: EncAccountDataType.PrimarySrp,
          encKey,
          authKeyPair,
          options: {
            keyringId,
          },
          // Persist local backup state only after the full operation succeeds.
          skipStatePersist: true,
        });

        // store/persist the encryption key shares
        // We store the secret metadata in the metadata store first. If this operation fails,
        // we avoid persisting the encryption key shares to prevent a situation where a user appears
        // to have an account but with no associated data.
        await this.#persistOprfKey(oprfKey, authKeyPair.pk);
        // create a new vault with the resulting authentication data
        await this.#createNewVaultWithAuthData({
          password,
          rawToprfEncryptionKey: encKey as Uint8Array<ArrayBuffer>,
          rawToprfPwEncryptionKey: pwEncKey as Uint8Array<ArrayBuffer>,
          rawToprfAuthKeyPair: authKeyPair,
        });

        // Mark migration as complete since this new backup was created with the new data format (dataType)
        this.#setMigrationVersion(SeedlessOnboardingMigrationVersion.V1);

        // Persist local backup state after all operations succeed.
        this.#filterDupesAndUpdateSocialBackupsMetadata({
          keyringId,
          data: seedPhrase,
          type: secretMetadata.type,
        });
      };

      await this.#executeWithTokenRefresh(
        performKeyCreationAndBackup,
        'createToprfKeyAndBackupSeedPhrase',
      );
    });
  }

  /**
   * Encrypt and add a new secret data to the metadata store.
   *
   * @param data - The data to add.
   * @param dataType - The data type classification for the secret data.
   * @param options - Optional options object, which includes optional data to be added to the metadata store.
   * @param options.keyringId - The keyring id of the backup keyring (SRP).
   * @returns A promise that resolves to the success of the operation.
   */
  async addNewSecretData(
    data: Uint8Array,
    dataType: EncAccountDataType,
    options?: {
      keyringId?: string;
    },
  ): Promise<void> {
    if (dataType === EncAccountDataType.PrimarySrp) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.PrimarySrpCannotBeAddedViaAddNewSecretData,
      );
    }

    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();

      const performBackup = async (): Promise<void> => {
        await this.#assertPasswordInSync({
          skipCache: true,
          skipLock: true, // skip lock since we already have the lock
        });

        // verify the password and unlock the vault
        const { toprfEncryptionKey, toprfAuthKeyPair } =
          await this.#unlockVaultAndGetVaultData();

        // encrypt and store the secret data
        await this.#encryptAndStoreSecretData({
          data,
          dataType,
          encKey: toprfEncryptionKey,
          authKeyPair: toprfAuthKeyPair,
          options,
        });
      };

      await this.#executeWithTokenRefresh(performBackup, 'addNewSecretData');
    });
  }

  /**
   * Run any pending seedless onboarding migrations.
   *
   * This method should be called by clients after the controller is unlocked
   * to ensure legacy data is migrated to the latest format.
   *
   * Migrations are idempotent - running this multiple times is safe.
   * The migration version is tracked in state to prevent re-running migrations.
   *
   * @returns A promise that resolves to `true` if data was actually migrated
   * (items were updated on the server), `false` otherwise.
   * @throws If the password is outdated (changed on another device).
   */
  async runMigrations(): Promise<boolean> {
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();

      await this.#assertPasswordInSync({
        skipCache: true,
        skipLock: true, // skip lock since we already have the lock
      });

      if (this.state.migrationVersion < SeedlessOnboardingMigrationVersion.V1) {
        return this.#migrateDataTypes();
      }
      return false;
    });
  }

  /**
   * Set the migration version directly.
   *
   * Use this for new users who don't have legacy data to migrate,
   * avoiding an unnecessary API call from `runMigrations()`.
   *
   * @param version - The migration version to set.
   */
  setMigrationVersion(version: SeedlessOnboardingMigrationVersion): void {
    this.#setMigrationVersion(version);
  }

  /**
   * Assigns dataType (PrimarySrp/ImportedSrp/ImportedPrivateKey) to legacy secrets
   * that were created before the dataType field was introduced.
   *
   * This migration:
   * 1. Fetches all secret data items
   * 2. Identifies items that need migration (version !== 'v2' OR dataType not set)
   * 3. Assigns PrimarySrp to the first mnemonic (by timestamp)
   * 4. Assigns ImportedSrp to subsequent mnemonics
   * 5. Assigns ImportedPrivateKey to private keys
   * 6. Updates the items via SDK (which sets version to 'v2' and dataType)
   * 7. Updates the migration version in state
   *
   * Note: The SDK's updateSecretDataItem automatically sets version to 'v2'
   * when updating dataType, ensuring migrated items are marked as v2.
   *
   * @returns A promise that resolves to `true` if items were actually updated
   * on the server, `false` if no items needed migration.
   */
  async #migrateDataTypes(): Promise<boolean> {
    return await this.#executeWithTokenRefresh(async () => {
      const { toprfEncryptionKey, toprfAuthKeyPair } =
        await this.#unlockVaultAndGetVaultData();

      let secretDatas: SecretMetadata[];
      try {
        secretDatas = await this.#fetchAllSecretDataFromMetadataStore(
          toprfEncryptionKey,
          toprfAuthKeyPair,
        );
      } catch (error) {
        // If no secret data found, just update migration version
        if (
          error instanceof Error &&
          error.message ===
            SeedlessOnboardingControllerErrorMessage.NoSecretDataFound
        ) {
          this.#setMigrationVersion(SeedlessOnboardingMigrationVersion.V1);
          return false;
        }
        throw error;
      }

      const updates = getDataTypeMigrationUpdates(secretDatas);

      if (updates.length === 1) {
        await this.toprfClient.updateSecretDataItem({
          itemId: updates[0].itemId,
          dataType: updates[0].dataType,
          authKeyPair: toprfAuthKeyPair,
        });
      } else if (updates.length > 1) {
        await this.toprfClient.batchUpdateSecretDataItems({
          updateItems: updates,
          authKeyPair: toprfAuthKeyPair,
        });
      }

      this.#setMigrationVersion(SeedlessOnboardingMigrationVersion.V1);

      return updates.length > 0;
    }, 'migrateDataTypes');
  }

  /**
   * Set the migration version in state.
   *
   * @param version - The migration version to set.
   */
  #setMigrationVersion(version: number): void {
    this.update((state) => {
      state.migrationVersion = version;
    });
  }

  /**
   * Fetches all secret data items from the metadata store.
   *
   * Decrypts the secret data and returns the decrypted secret data using the recovered encryption key from the password.
   *
   * @param password - The optional password used to create new wallet. If not provided, `cached Encryption Key` will be used.
   * @returns A promise that resolves to the secret metadata items.
   */
  async fetchAllSecretData(password?: string): Promise<SecretMetadata[]> {
    return await this.#withControllerLock(async () => {
      return await this.#executeWithTokenRefresh(async () => {
        // assert that the user is authenticated before fetching the secret data
        this.#assertIsAuthenticatedUser(this.state);

        let encKey: Uint8Array;
        let pwEncKey: Uint8Array;
        let authKeyPair: KeyPair;
        let envelope:
          | {
              vaultKeySet: VaultKeySet;
              passwordAuthPubKey: SEC1EncodedPublicKey;
            }
          | undefined;

        if (password) {
          const recoverEncKeyResult = await this.#recoverEncKey(password);
          // an envelope-managed vault keeps its keys across password
          // changes, so the password only opens them (I6)
          const vaultKeySet = await this.#openPasswordEnvelope(
            recoverEncKeyResult.envelopeKeys,
          );
          if (vaultKeySet) {
            encKey = vaultKeySet.encKey;
            pwEncKey = vaultKeySet.localWrapKey;
            authKeyPair = vaultKeySet.authKeyPair;
            envelope = {
              vaultKeySet,
              passwordAuthPubKey: recoverEncKeyResult.authKeyPair.pk,
            };
          } else {
            encKey = recoverEncKeyResult.encKey;
            pwEncKey = recoverEncKeyResult.pwEncKey;
            authKeyPair = recoverEncKeyResult.authKeyPair;
            const passwordKeySet: VaultKeySet = {
              authKeyPair,
              encKey,
              localWrapKey: pwEncKey,
            };
            // a migrated vault has no pbek until its first envelope password
            // change, so the password may derive K_v directly
            if (await this.#hasControlRecords(passwordKeySet)) {
              envelope = {
                vaultKeySet: passwordKeySet,
                passwordAuthPubKey: authKeyPair.pk,
              };
            }
          }
        } else {
          this.#assertIsUnlocked();
          // verify the password and unlock the vault
          const keysFromVault = await this.#unlockVaultAndGetVaultData();
          encKey = keysFromVault.toprfEncryptionKey;
          pwEncKey = keysFromVault.toprfPwEncryptionKey;
          authKeyPair = keysFromVault.toprfAuthKeyPair;
        }

        const secrets = await this.#fetchAllSecretDataFromMetadataStore(
          encKey,
          authKeyPair,
        );

        if (password) {
          // if password is provided, we need to create a new vault with the auth data. (supposedly the user is trying to rehydrate the wallet)
          await this.#createNewVaultWithAuthData({
            password,
            rawToprfEncryptionKey: encKey as Uint8Array<ArrayBuffer>,
            rawToprfPwEncryptionKey: pwEncKey as Uint8Array<ArrayBuffer>,
            rawToprfAuthKeyPair: authKeyPair,
          });
          // the new vault is under the global password, so it is in sync
          this.update((state) => {
            delete state.isPasswordResetPending;
          });
          if (envelope) {
            this.#setEnvelopeState(
              envelope.vaultKeySet,
              envelope.passwordAuthPubKey,
            );
          }
        }

        return secrets;
      }, 'fetchAllSecretData');
    });
  }

  /**
   * Update the password of the seedless onboarding flow.
   *
   * Changing password will also update the encryption key, metadata store and the vault with new encrypted values.
   * If the vault is envelope-managed, only the password envelope and the
   * password OPRF key change; the vault keys and the backend vault stay as
   * they are.
   *
   * @param newPassword - The new password to update.
   * @param oldPassword - The old password to verify.
   * @returns A promise that resolves to the success of the operation.
   * @throws `PasswordResetPending` after {@link setLocalPassword}, until
   * {@link resetPasswordWithVaultKeys} succeeds.
   */
  async changePassword(
    newPassword: string,
    oldPassword: string,
  ): Promise<void> {
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();
      this.#assertNoPasswordResetPending();
      // verify the old password of the encrypted vault
      await this.verifyVaultPassword(oldPassword, {
        skipLock: true, // skip lock since we already have the lock
      });

      const attemptChangePassword = async (): Promise<void> => {
        const { authPubKey: globalAuthPubKey, latestKeyIndex } =
          await this.#assertPasswordInSync({
            skipCache: true,
            skipLock: true, // skip lock since we already have the lock
          });
        // load keyring encryption key if it exists
        let keyringEncryptionKey: string | undefined;
        if (this.state.encryptedKeyringEncryptionKey) {
          keyringEncryptionKey = await this.loadKeyringEncryptionKey();
        }

        const vaultKeySet = toVaultKeySet(
          await this.#unlockVaultAndGetVaultData(),
        );
        // another device may have migrated the vault, so the control record
        // decides, not local state (I6)
        const controlRecords = await this.#envelopeStore.fetchControlRecords(
          deriveControlKeys(vaultKeySet),
        );

        if (controlRecords.length > 0) {
          await this.#changePasswordEnveloped({
            vaultKeySet,
            controlRecords,
            globalAuthPubKey,
            latestKeyIndex,
            newPassword,
          });
        } else {
          if (this.state.envelope) {
            throw new SeedlessOnboardingError(
              SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
            );
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
            rawToprfEncryptionKey: newEncKey as Uint8Array<ArrayBuffer>,
            rawToprfPwEncryptionKey: newPwEncKey as Uint8Array<ArrayBuffer>,
            rawToprfAuthKeyPair: newAuthKeyPair,
          });
        }

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
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.FailedToChangePassword,
          {
            cause: error,
          },
        );
      }
    });
  }

  /**
   * Change the password of an envelope-managed vault: seal `K_v` under the
   * new password's envelope keys, write the next control record, and swap
   * the password OPRF key, all under the vault's metadata lock. The swap is
   * signed with the auth key of the live control record, so the old password
   * is not needed. Then re-encrypt the local vault under the new password.
   * The backend vault data is not touched.
   *
   * @param params - The function parameters.
   * @param params.vaultKeySet - The vault key set `K_v`.
   * @param params.controlRecords - The vault's control records.
   * @param params.globalAuthPubKey - The live password OPRF auth public key.
   * @param params.latestKeyIndex - The live password OPRF key index.
   * @param params.newPassword - The new password.
   * @throws `EnvelopeControlRecordNotFound` if no control record matches the
   * live password OPRF key.
   */
  async #changePasswordEnveloped({
    vaultKeySet,
    controlRecords,
    globalAuthPubKey,
    latestKeyIndex,
    newPassword,
  }: {
    vaultKeySet: VaultKeySet;
    controlRecords: ControlRecord[];
    globalAuthPubKey: SEC1EncodedPublicKey;
    latestKeyIndex: number;
    newPassword: string;
  }): Promise<void> {
    const currentRecord = selectControlRecord(controlRecords, globalAuthPubKey);
    if (!currentRecord) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
      );
    }

    const { oprfKey, seed, envelopeKeys, authKeyPair } =
      await this.toprfClient.createLocalKey({ password: newPassword });
    // the controller only needs the envelope keys, so the seed is not kept
    seed.fill(0);
    const sealed = await sealFor(envelopeKeys, 'password', vaultKeySet);
    const nextControlRecord: ControlRecord = {
      ...currentRecord,
      seq: nextControlSeq(controlRecords),
      passwordNamespace: {
        ...currentRecord.passwordNamespace,
        authSk: bigIntToHex(authKeyPair.sk),
        keyIndex: latestKeyIndex + 1,
        enabled: true,
      },
    };

    await this.#withMetadataLock(vaultKeySet.authKeyPair, async () => {
      await this.#assertGlobalAuthPubKeyUnchanged(globalAuthPubKey);
      await this.#writeAndVerifyEnvelope(sealed);
      await this.#envelopeStore.writeControlRecord(
        deriveControlKeys(vaultKeySet),
        nextControlRecord,
      );

      this.#assertIsAuthenticatedUser(this.state);
      const { nodeAuthTokens, authConnectionId, groupedAuthConnectionId } =
        this.state;
      // commit point: from here on the new password is global
      await this.toprfClient.persistLocalKey({
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId: this.state.userId,
        oprfKey,
        authPubKey: authKeyPair.pk,
        keyShareIndex: latestKeyIndex,
        oldAuthKeyPair: getPasswordNamespaceAuthKeyPair(currentRecord),
      });
    });

    await this.#createNewVaultWithAuthData({
      password: newPassword,
      rawToprfEncryptionKey: vaultKeySet.encKey as Uint8Array<ArrayBuffer>,
      rawToprfPwEncryptionKey:
        vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
      rawToprfAuthKeyPair: vaultKeySet.authKeyPair,
    });
    this.#setEnvelopeState(vaultKeySet, authKeyPair.pk);
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
  ): void {
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
    const doVerify = async (): Promise<void> => {
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
   * This method will be used especially when user unlock the wallet.
   * The provided password will be verified against the encrypted vault, encryption key will be derived and saved in the controller state.
   *
   * This operation is useful when user performs some actions that requires the user password/encryption key. e.g. add new srp backup
   *
   * @param password - The password to submit.
   * @returns A promise that resolves to the success of the operation.
   */
  async submitPassword(password: string): Promise<void> {
    return await this.#withControllerLock(async () => {
      // get the access token from the state before unlocking, it might be the new token set from the `refreshAuthTokens` method.
      const { accessToken: accessTokenBeforeUnlock } = this.state;

      const deserializedVaultData = await this.#unlockVaultAndGetVaultData({
        password,
      });

      const accessTokenFromDecryptedVault = deserializedVaultData.accessToken;

      // Pick the latest access token - the token from state might be newer (from refreshAuthTokens)
      // than the token stored in the vault.
      const latestAccessToken = this.#pickLatestAccessToken(
        accessTokenBeforeUnlock,
        accessTokenFromDecryptedVault,
      );

      // update the state and vault with the latest access token `ONLY` if it's different from the current access token in the state.
      if (latestAccessToken !== accessTokenFromDecryptedVault) {
        const updatedVaultData = {
          ...deserializedVaultData,
          accessToken: latestAccessToken,
        };

        await this.#updateVault({
          password,
          vaultData: updatedVaultData,
          pwEncKey: deserializedVaultData.toprfPwEncryptionKey,
        });
      }

      this.#setUnlocked();

      this.#identifyIncompleteMetadataBackup(password);
    });
  }

  /**
   * Identify an incomplete or mismatched primary SRP backup.
   *
   * This method must only be called after the controller has been unlocked.
   *
   * @param password - The password used to export the local primary SRP.
   * @returns A promise that resolves after identification and telemetry have
   * completed.
   */
  async identifyIncompleteMetadataBackup(password: string): Promise<void> {
    this.#assertIsUnlocked();

    await this.#identifyIncompleteMetadataBackup(password);
  }

  /**
   * Set the controller to locked state, and deallocate the secrets (vault encryption key and salt).
   *
   * When the controller is locked, the user will not be able to perform any operations on the controller/vault.
   *
   * @returns A promise that resolves to the success of the operation.
   */
  async setLocked(): Promise<void> {
    return await this.#withControllerLock(async () => {
      this.update((state) => {
        delete state.vaultEncryptionKey;
        delete state.vaultEncryptionSalt;
        delete state.revokeToken;
        delete state.accessToken;
        delete state.recoverySession;
      });

      this.#cachedDecryptedVaultData = undefined;
      this.#recoveredVaultKeySet = undefined;
      this.#isUnlocked = false;
    });
  }

  /**
   * Sync the latest global password to the controller.
   * reset vault with latest globalPassword,
   * persist the latest global password authPubKey
   *
   * @param params - The parameters for syncing the latest global password.
   * @param params.globalPassword - The latest global password.
   * @returns A promise that resolves to the success of the operation.
   * @throws `PasswordResetPending` after {@link setLocalPassword}, until
   * {@link resetPasswordWithVaultKeys} succeeds.
   */
  async syncLatestGlobalPassword({
    globalPassword,
  }: {
    globalPassword: string;
  }): Promise<void> {
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();
      this.#assertNoPasswordResetPending();
      const doSyncPassword = async (): Promise<void> => {
        // update vault with latest globalPassword
        const { envelopeKeys, encKey, pwEncKey, authKeyPair } =
          await this.#recoverEncKey(globalPassword);
        const vaultKeySet = await this.#openPasswordEnvelope(envelopeKeys);

        if (vaultKeySet) {
          // envelope-managed: keep K_v and re-encrypt under the new password
          await this.#createNewVaultWithAuthData({
            password: globalPassword,
            rawToprfEncryptionKey:
              vaultKeySet.encKey as Uint8Array<ArrayBuffer>,
            rawToprfPwEncryptionKey:
              vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
            rawToprfAuthKeyPair: vaultKeySet.authKeyPair,
          });
          this.#setEnvelopeState(vaultKeySet, authKeyPair.pk);
        } else {
          const passwordKeySet: VaultKeySet = {
            authKeyPair,
            encKey,
            localWrapKey: pwEncKey,
          };
          // a migrated vault has no pbek until its first envelope password
          // change, so the password may derive K_v directly
          const isEnvelopeManaged =
            await this.#hasControlRecords(passwordKeySet);
          // update and encrypt the vault with new password
          await this.#createNewVaultWithAuthData({
            password: globalPassword,
            rawToprfEncryptionKey: encKey as Uint8Array<ArrayBuffer>,
            rawToprfPwEncryptionKey: pwEncKey as Uint8Array<ArrayBuffer>,
            rawToprfAuthKeyPair: authKeyPair,
          });
          this.#updateEnvelopeState(
            isEnvelopeManaged,
            passwordKeySet,
            authKeyPair.pk,
          );
        }

        this.#resetPasswordOutdatedCache();
      };
      return await this.#executeWithTokenRefresh(
        doSyncPassword,
        'syncLatestGlobalPassword',
      );
    });
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
      envelopeKeys,
      pwEncKey: globalPwEncKey,
      authKeyPair: globalAuthKeyPair,
    } = await this.#recoverEncKey(globalPassword);

    try {
      // Envelope first (I6): the global password opens K_v, whose PW_BACKUP
      // chain leads back to this device's key set if it lagged behind.
      const vaultKeySet = await this.#openPasswordEnvelope(envelopeKeys);
      const chainStart = vaultKeySet
        ? {
            pwEncKey: vaultKeySet.localWrapKey,
            authKeyPair: vaultKeySet.authKeyPair,
          }
        : { pwEncKey: globalPwEncKey, authKeyPair: globalAuthKeyPair };

      // Recover vault encryption key.
      const { pwEncKey } =
        vaultKeySet &&
        pubKeysEqual(vaultKeySet.authKeyPair.pk, targetAuthPubKey)
          ? { pwEncKey: vaultKeySet.localWrapKey }
          : await this.toprfClient.recoverPwEncKey({
              targetAuthPubKey,
              curPwEncKey: chainStart.pwEncKey,
              curAuthKeyPair: chainStart.authKeyPair,
              maxPwChainLength: maxKeyChainLength,
            });
      const vaultKey = await this.#loadSeedlessEncryptionKey(
        pwEncKey as Uint8Array<ArrayBuffer>,
      );

      // accessToken before unlocking vault and flooding the state with values from the decrypted vault
      // it might be the new token set from the `refreshAuthTokens` method.
      const { accessToken: accessTokenBeforeUnlock } = this.state;

      // Unlock the controller
      const decryptedVaultData = await this.#unlockVaultAndGetVaultData({
        encryptionKey: vaultKey,
      });
      this.#setUnlocked();

      // Pick the latest access token - the token from state might be newer (from refreshAuthTokens)
      // than the token stored in the vault. The vault will be updated later by syncLatestGlobalPassword.
      this.#pickLatestAccessToken(
        accessTokenBeforeUnlock,
        decryptedVaultData.accessToken,
      );
    } catch (error) {
      if (isAuthTokenError(error)) {
        throw error;
      }
      if (isMaxKeyChainLengthError(error)) {
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
    const doCheckIsPasswordExpired = async (): Promise<boolean> => {
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

      this.#assertIsAuthenticatedUser(this.state);
      const {
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      } = this.state;

      // an envelope-managed vault keeps its key set, so the password OPRF
      // key it last synced with is tracked separately
      const { envelope } = this.state;
      let currentDeviceAuthPubKey: SEC1EncodedPublicKey | undefined;
      if (!envelope) {
        currentDeviceAuthPubKey = this.#recoverAuthPubKey();
      } else if (envelope.passwordAuthPubKey) {
        currentDeviceAuthPubKey = base64ToBytes(envelope.passwordAuthPubKey);
      }

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
            throw new SeedlessOnboardingError(
              SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
              {
                cause: error,
              },
            );
          });
        globalAuthPubKey = authPubKey;
      }

      // use noble lib to deserialize and compare curve point
      const isExpiredPwd =
        !currentDeviceAuthPubKey ||
        !secp256k1.ProjectivePoint.fromHex(currentDeviceAuthPubKey).equals(
          secp256k1.ProjectivePoint.fromHex(globalAuthPubKey),
        );
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
   * Check if the user is authenticated with the seedless onboarding flow by checking the token values in the state.
   *
   * This method will check the `accessToken` and `revokeToken` in the state, besides the social login authentication details.
   * If both are present, the user is authenticated.
   * If either is missing, the user is not authenticated.
   *
   * This method is useful when we want to check if the state has valid authenticated user details to perform vault creations.
   *
   * @returns True if the user is authenticated, false otherwise.
   */
  async getIsUserAuthenticated(): Promise<boolean> {
    try {
      this.#assertIsAuthenticatedUser(this.state);
      return Boolean(this.state.accessToken) && Boolean(this.state.revokeToken);
    } catch {
      return false;
    }
  }

  #setUnlocked(): void {
    this.#isUnlocked = true;
  }

  /**
   * Compares two access tokens and picks the latest one based on JWT expiration.
   * If the tokens are different, the state is updated with the latest token.
   *
   * @param tokenBeforeUnlock - The access token from state before unlocking (may have been set by refreshAuthTokens).
   * @param tokenAfterUnlock - The access token from the decrypted vault after unlocking.
   * @returns The latest access token, or the token after unlock if no reconciliation was needed.
   */
  #pickLatestAccessToken(
    tokenBeforeUnlock: string | undefined,
    tokenAfterUnlock: string,
  ): string {
    let latestToken = tokenAfterUnlock;

    if (
      tokenBeforeUnlock &&
      tokenAfterUnlock &&
      tokenBeforeUnlock !== tokenAfterUnlock
    ) {
      latestToken = compareAndGetLatestToken(
        tokenBeforeUnlock,
        tokenAfterUnlock,
      );

      // Update the access token in the state with the latest access token
      this.update((state) => {
        state.accessToken = latestToken;
      });
    }

    return latestToken;
  }

  /**
   * Clears the current state of the SeedlessOnboardingController.
   */
  clearState(): void {
    const defaultState =
      getInitialSeedlessOnboardingControllerStateWithDefaults();
    this.update(() => {
      return defaultState;
    });
    this.#recoveredVaultKeySet = undefined;
  }

  /**
   * Persist the encryption key for the seedless onboarding flow.
   *
   * @param oprfKey - The OPRF key to be splited and persisted.
   * @param authPubKey - The authentication public key.
   * @returns A promise that resolves to the success of the operation.
   */
  async #persistOprfKey(
    oprfKey: bigint,
    authPubKey: SEC1EncodedPublicKey,
  ): Promise<void> {
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
      if (isAuthTokenError(error)) {
        throw error;
      }
      log('Error persisting local encryption key', error);
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.FailedToPersistOprfKey,
        {
          cause: error,
        },
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
  async storeKeyringEncryptionKey(keyringEncryptionKey: string): Promise<void> {
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
  async loadKeyringEncryptionKey(): Promise<string> {
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
    encKey: Uint8Array<ArrayBuffer>,
    keyringEncryptionKey: string,
  ): Promise<void> {
    const { ciphertext, iv } = await encrypt(
      encKey,
      stringToBytes(keyringEncryptionKey),
    );
    const encryptedKeyringEncryptionKey = concatBytes([iv, ciphertext]);
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
  async #loadKeyringEncryptionKey(
    encKey: Uint8Array<ArrayBuffer>,
  ): Promise<string> {
    const { encryptedKeyringEncryptionKey: encryptedKey } = this.state;
    assertIsEncryptedKeyringEncryptionKeySet(encryptedKey);
    const encryptedPasswordBytes = base64ToBytes(encryptedKey);
    const iv = encryptedPasswordBytes.slice(0, IV_LENGTH);
    const ciphertext = encryptedPasswordBytes.slice(IV_LENGTH);
    const password = await decrypt(encKey, iv, ciphertext);
    return bytesToString(password);
  }

  /**
   * Decrypt the seedless encryption key from state.
   *
   * @param encKey - The encryption key.
   * @returns The seedless encryption key.
   */
  async #loadSeedlessEncryptionKey(
    encKey: Uint8Array<ArrayBuffer>,
  ): Promise<string> {
    const { encryptedSeedlessEncryptionKey: encryptedKey } = this.state;
    assertIsEncryptedSeedlessEncryptionKeySet(encryptedKey);
    const encryptedKeyBytes = base64ToBytes(encryptedKey);
    const iv = encryptedKeyBytes.slice(0, IV_LENGTH);
    const ciphertext = encryptedKeyBytes.slice(IV_LENGTH);
    const seedlessEncryptionKey = await decrypt(encKey, iv, ciphertext);
    return bytesToString(seedlessEncryptionKey);
  }

  /**
   * Recover the authentication public key from the state.
   * convert to pubkey format before recovering.
   *
   * @returns The authentication public key.
   */
  #recoverAuthPubKey(): SEC1EncodedPublicKey {
    const { authPubKey } = this.state;
    if (!authPubKey) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.SRPNotBackedUpError,
      );
    }

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
    const {
      nodeAuthTokens,
      authConnectionId,
      groupedAuthConnectionId,
      userId,
    } = this.state;

    try {
      const recoverEncKeyResult = await this.toprfClient.recoverEncKey({
        nodeAuthTokens,
        password,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      });
      return recoverEncKeyResult;
    } catch (error) {
      // throw token expired error for token refresh handler
      if (isAuthTokenError(error)) {
        throw error;
      }

      throw RecoveryError.getInstance(error);
    }
  }

  async #fetchAllSecretDataFromMetadataStore(
    encKey: Uint8Array,
    authKeyPair: KeyPair,
  ): Promise<SecretMetadata[]> {
    let secretDataItems: FetchedSecretDataItem[] = [];
    try {
      // fetch and decrypt the secret data from the metadata store
      secretDataItems = await this.toprfClient.fetchAllSecretDataItems({
        decKey: encKey,
        authKeyPair,
      });
    } catch (error) {
      log('Error fetching secret data', error);
      if (isAuthTokenError(error)) {
        throw error;
      }
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.FailedToFetchSecretMetadata,
        {
          cause: error,
        },
      );
    }

    // user must have at least one secret data
    if (secretDataItems?.length > 0) {
      return parseAndValidateSecretMetadataBackup(secretDataItems);
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
  }): Promise<ChangeEncryptionKeyResult> {
    this.#assertIsAuthenticatedUser(this.state);
    const { authConnectionId, groupedAuthConnectionId, userId } = this.state;

    let encKey: Uint8Array;
    let pwEncKey: Uint8Array;
    let authKeyPair: KeyPair;
    let globalKeyIndex = latestKeyIndex;
    if (globalKeyIndex) {
      ({
        toprfEncryptionKey: encKey,
        toprfPwEncryptionKey: pwEncKey,
        toprfAuthKeyPair: authKeyPair,
      } = await this.#unlockVaultAndGetVaultData({ password: oldPassword }));
    } else {
      ({
        encKey,
        pwEncKey,
        authKeyPair,
        keyShareIndex: globalKeyIndex,
      } = await this.#recoverEncKey(oldPassword));
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
      transformDataItems: (items) =>
        items
          .sort((a, b) =>
            SecretMetadata.compare(
              SecretMetadata.fromRawMetadata(a.data, { dataType: a.dataType }),
              SecretMetadata.fromRawMetadata(b.data, { dataType: b.dataType }),
              'asc',
            ),
          )
          .map(({ data, dataType, version }) => ({
            data,
            dataType,
            version: dataType === undefined ? 'v1' : version,
          })),
    });
    return result;
  }

  /**
   * Encrypt and store the secret data backup in the metadata store.
   *
   * @param params - The parameters for encrypting and storing the secret data backup.
   * @param params.data - The secret data to store.
   * @param params.dataType - The data type classification for the secret data.
   * @param params.encKey - The encryption key to store.
   * @param params.authKeyPair - The authentication key pair to store.
   * @param params.options - Optional options object.
   * @param params.options.keyringId - The keyring id of the backup keyring (required for SRP types).
   * @param params.skipStatePersist - Whether to persist the backup state after
   *   the remote metadata is stored. When true, the backup metadata is not persisted to the controller state.
   *
   * @returns A promise that resolves to the backup metadata.
   */
  async #encryptAndStoreSecretData(params: {
    data: Uint8Array;
    dataType: EncAccountDataType;
    encKey: Uint8Array;
    authKeyPair: KeyPair;
    options?: {
      keyringId?: string;
    };
    skipStatePersist?: boolean;
  }): Promise<SecretMetadata> {
    const {
      options,
      data,
      encKey,
      authKeyPair,
      dataType,
      skipStatePersist = false,
    } = params;

    const secretMetadata = new SecretMetadata(data, { dataType });
    const { type } = secretMetadata;

    // before encrypting and create backup, we will check the state if the secret data is already backed up
    const backupState = this.getSecretDataBackupState(data, type);
    if (backupState) {
      return secretMetadata;
    }

    const secretData = secretMetadata.toBytes();

    const keyringId = options?.keyringId as string;
    if (type === SecretType.Mnemonic && !keyringId) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.MissingKeyringId,
      );
    }

    try {
      const persistMetadataFn = async (): Promise<
        Omit<SocialBackupsMetadata, 'hash'> & { data: Uint8Array }
      > => {
        await this.toprfClient.addSecretDataItem({
          encKey,
          secretData,
          authKeyPair,
          dataType,
        });
        return {
          keyringId,
          data,
          type,
        };
      };

      // Skip local persistence if `skipStatePersist` is true.
      if (skipStatePersist) {
        await persistMetadataFn();
      } else {
        await this.#withPersistedSecretMetadataBackupsState(persistMetadataFn);
      }

      return secretMetadata;
    } catch (error) {
      if (isAuthTokenError(error)) {
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
   * @param params - The parameters for unlocking the vault.
   * @param params.password - The optional password to unlock the vault.
   * @param params.encryptionKey - The optional encryption key to unlock the vault.
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
  async #unlockVaultAndGetVaultData(params?: {
    password?: string;
    encryptionKey?: string;
  }): Promise<DeserializedVaultData> {
    return this.#withVaultLock(async () => {
      if (this.#cachedDecryptedVaultData) {
        return this.#cachedDecryptedVaultData;
      }

      const { vaultData, vaultEncryptionKey, vaultEncryptionSalt } =
        await this.#decryptAndParseVaultData(params);

      this.update((state) => {
        state.vaultEncryptionKey = vaultEncryptionKey;
        state.vaultEncryptionSalt = vaultEncryptionSalt;
        state.revokeToken = vaultData.revokeToken;
        state.accessToken = vaultData.accessToken;
      });

      const deserializedVaultData = deserializeVaultData(vaultData);
      this.#cachedDecryptedVaultData = deserializedVaultData;
      return deserializedVaultData;
    });
  }

  /**
   * Decrypts the vault data and parses it into a usable format.
   *
   * @param params - The parameters for decrypting the vault.
   * @param params.password - The optional password to decrypt the vault.
   * @param params.encryptionKey - The optional encryption key to decrypt the vault.
   * @returns A promise that resolves to an object containing:
   */
  async #decryptAndParseVaultData(params?: {
    password?: string;
    encryptionKey?: string;
  }): Promise<{
    vaultData: VaultData;
    vaultEncryptionKey: string;
    vaultEncryptionSalt?: string;
  }> {
    let { vaultEncryptionKey, vaultEncryptionSalt } = this.state;
    const { vault: encryptedVault } = this.state;

    if (!encryptedVault) {
      throw new Error(SeedlessOnboardingControllerErrorMessage.VaultError);
    }

    if (params?.encryptionKey) {
      vaultEncryptionKey = params.encryptionKey;
    }

    let decryptedVaultData: unknown;

    // if the encryption key is available, we will use it to decrypt the vault
    if (vaultEncryptionKey) {
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
    } else {
      // if the encryption key is not available, we will use the password to decrypt the vault
      assertIsValidPassword(params?.password);
      // Note that vault decryption using the password is a very costly operation as it involves deriving the encryption key
      // from the password using an intentionally slow key derivation function.
      // We should make sure that we only call it very intentionally.
      const result = await this.#vaultEncryptor.decryptWithDetail(
        params.password,
        encryptedVault,
      );
      decryptedVaultData = result.vault;
      vaultEncryptionKey = result.exportedKeyString;
      vaultEncryptionSalt = result.salt;
    }

    const vaultData = parseVaultData(decryptedVaultData);

    return {
      vaultData,
      vaultEncryptionKey,
      vaultEncryptionSalt,
    };
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
    createSecretMetadataBackupCallback: () => Promise<SecretBackupData>,
  ): Promise<SecretBackupData> {
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
    secretData: SecretBackupData | SecretBackupData[],
  ): void {
    const filteredNewBackupsMetadata = getNewSocialBackupsMetadata(
      this.state.socialBackupsMetadata,
      secretData,
    );

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
   * @param params.rawToprfAuthKeyPair - The authentication key pair for Toprf operations.
   */
  async #createNewVaultWithAuthData({
    password,
    rawToprfEncryptionKey,
    rawToprfPwEncryptionKey,
    rawToprfAuthKeyPair,
  }: {
    password: string;
    rawToprfEncryptionKey: Uint8Array<ArrayBuffer>;
    rawToprfPwEncryptionKey: Uint8Array<ArrayBuffer>;
    rawToprfAuthKeyPair: KeyPair;
  }): Promise<void> {
    this.#assertIsAuthenticatedUser(this.state);

    const { accessToken, revokeToken } =
      await this.#getAccessTokenAndRevokeToken(password);

    const vaultData: DeserializedVaultData = {
      toprfAuthKeyPair: rawToprfAuthKeyPair,
      toprfEncryptionKey: rawToprfEncryptionKey,
      toprfPwEncryptionKey: rawToprfPwEncryptionKey,
      revokeToken,
      accessToken,
    };

    await this.#updateVault({
      password,
      vaultData,
      pwEncKey: rawToprfPwEncryptionKey,
    });

    // update the authPubKey in the state
    this.#persistAuthPubKey({
      authPubKey: rawToprfAuthKeyPair.pk,
    });

    this.#setUnlocked();
  }

  /**
   * Encrypt and update the vault with the given authentication data.
   *
   * @param params - The parameters for updating the vault.
   * @param params.password - The optional password to encrypt the vault. If not provided, the vault will be encrypted with the encryption key in the state.
   * @param params.vaultData - The raw vault data to update the vault with.
   * @param params.pwEncKey - The global password encryption key.
   * @returns A promise that resolves to the updated vault.
   */
  async #updateVault({
    password,
    vaultData,
    pwEncKey,
  }: {
    password?: string;
    vaultData: DeserializedVaultData;
    pwEncKey: Uint8Array<ArrayBuffer>;
  }): Promise<void> {
    await this.#withVaultLock(async () => {
      const serializedVaultData = serializeVaultData(vaultData);

      const { vaultEncryptionKey, vaultEncryptionSalt, vault } = this.state;

      const updatedState: Partial<SeedlessOnboardingControllerState> = {
        vault,
        vaultEncryptionKey,
        vaultEncryptionSalt,
        encryptedSeedlessEncryptionKey:
          this.state.encryptedSeedlessEncryptionKey,
      };

      // if the password is provided (not undefined), encrypt the vault with the password
      // We gonna prioritize the password encryption here, in case of the operation is `Change Password`.
      // We don't wanna re-use the old encryption key from the state.
      if (password !== undefined) {
        assertIsValidPassword(password);

        // Note that vault encryption using the password is a very costly operation as it involves deriving the encryption key
        // from the password using an intentionally slow key derivation function.
        // We should make sure that we only call it very intentionally.
        const { vault: updatedEncVault, exportedKeyString } =
          await this.#vaultEncryptor.encryptWithDetail(
            password,
            serializedVaultData,
          );

        updatedState.vault = updatedEncVault;
        updatedState.vaultEncryptionKey = exportedKeyString;
        updatedState.vaultEncryptionSalt = JSON.parse(updatedEncVault).salt;

        // encrypt the seedless encryption key with the password encryption key from TOPRF network
        updatedState.encryptedSeedlessEncryptionKey =
          await this.#encryptSeedlessEncryptionKey(exportedKeyString, pwEncKey);
      } else if (vaultEncryptionKey && vaultEncryptionSalt) {
        const encryptionKey =
          await this.#vaultEncryptor.importKey(vaultEncryptionKey);
        const updatedEncVault = await this.#vaultEncryptor.encryptWithKey(
          encryptionKey,
          serializedVaultData,
        );

        // NOTE: Referenced from keyring-controller!
        // We need to include the salt used to derive the encryption key, to be able to derive it from password again.
        updatedEncVault.salt = vaultEncryptionSalt;

        updatedState.vault = JSON.stringify(updatedEncVault);
        updatedState.vaultEncryptionKey = vaultEncryptionKey;
        updatedState.vaultEncryptionSalt = vaultEncryptionSalt;
      } else {
        // neither password nor encryption key is provided
        throw new Error(
          SeedlessOnboardingControllerErrorMessage.MissingCredentials,
        );
      }

      // update the state with the updated vault data
      this.update((state) => {
        state.vault = updatedState.vault;
        state.vaultEncryptionKey = updatedState.vaultEncryptionKey;
        state.vaultEncryptionSalt = updatedState.vaultEncryptionSalt;
        state.encryptedSeedlessEncryptionKey =
          updatedState.encryptedSeedlessEncryptionKey;
      });

      // cache the vault data to avoid decrypting the vault data multiple times
      this.#cachedDecryptedVaultData = vaultData;
    });
  }

  /**
   * Encrypt the seedless encryption key with the password encryption key from TOPRF network.
   *
   * @param vaultEncryptionKey - The key which is used to encrypt the vault.
   * @param pwEncKey - The password encryption key from TOPRF network.
   * @returns The encrypted seedless encryption key.
   */
  async #encryptSeedlessEncryptionKey(
    vaultEncryptionKey: string,
    pwEncKey: Uint8Array<ArrayBuffer>,
  ): Promise<string> {
    const { ciphertext, iv } = await encrypt(
      pwEncKey,
      stringToBytes(vaultEncryptionKey),
    );
    return bytesToBase64(concatBytes([iv, ciphertext]));
  }

  /**
   * Get the access token and revoke token from the state or the vault.
   *
   * @param password - The password to decrypt the vault.
   * @returns The access token and revoke token.
   */
  async #getAccessTokenAndRevokeToken(
    password: string,
  ): Promise<{ accessToken: string; revokeToken: string }> {
    let { accessToken, revokeToken } = this.state;
    // `accessToken` and `revokeToken` are both available in the state, `ONLY` when the wallet (vault) is unlocked
    // or during the period between the social authentication and the vault creation during the onboarding flow.
    if (accessToken && revokeToken) {
      return { accessToken, revokeToken };
    }

    // if `password` is provided to decrypt the vault, decrypt the vault and get the access token and revoke token from the vault
    if (this.state.vault) {
      // if the access token or revoke token is not available in the state, decrypt the vault and get the access token and revoke token from the vault
      const { vaultData } = await this.#decryptAndParseVaultData({ password });
      accessToken = accessToken ?? vaultData.accessToken;
      revokeToken = revokeToken ?? vaultData.revokeToken;
    }

    // we should always throw an error if the access token or revoke token is not available
    // to prevent the caller from using the controller in an invalid state

    if (!accessToken) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidAccessToken,
      );
    }

    if (!revokeToken) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.InvalidRevokeToken,
      );
    }

    return { accessToken, revokeToken };
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
    try {
      assertIsSeedlessOnboardingUserAuthenticated(value);
    } catch (error) {
      this.update((state) => {
        state.isSeedlessOnboardingUserAuthenticated = false;
      });
      throw error;
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
    const { authPubKey, keyIndex: latestKeyIndex } =
      await this.#fetchGlobalAuthPubKey();
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

  /**
   * Fetch the live (global) TOPRF1 auth public key and its key index with the
   * aal1 node auth tokens.
   *
   * @returns The global auth public key and its key index.
   * @throws `FailedToFetchAuthPubKey` if the request fails.
   */
  async #fetchGlobalAuthPubKey(): Promise<{
    authPubKey: SEC1EncodedPublicKey;
    keyIndex: number;
  }> {
    this.#assertIsAuthenticatedUser(this.state);
    const {
      nodeAuthTokens,
      authConnectionId,
      groupedAuthConnectionId,
      userId,
    } = this.state;

    return await this.toprfClient
      .fetchAuthPubKey({
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      })
      .catch((error) => {
        log('Error fetching auth pub key', error);
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
          {
            cause: error,
          },
        );
      });
  }

  #resetPasswordOutdatedCache(): void {
    this.update((state) => {
      delete state.passwordOutdatedCache;
    });
  }

  /**
   * Refresh expired nodeAuthTokens, accessToken, and metadataAccessToken using
   * the stored refresh token.
   *
   * Concurrent callers share a single in-flight HTTP request — if a refresh is
   * already in-progress the returned promise resolves when that request settles
   * rather than firing a duplicate request with the same token.
   *
   * @returns A promise that resolves when the tokens have been refreshed.
   */
  async refreshAuthTokens(): Promise<void> {
    // Coalesce concurrent calls to avoid issuing parallel HTTP requests
    // with the same refresh token.
    if (this.#pendingRefreshPromise) {
      return this.#pendingRefreshPromise;
    }

    const promise = this.#doRefreshAuthTokens().finally(() => {
      if (this.#pendingRefreshPromise === promise) {
        this.#pendingRefreshPromise = undefined;
      }
    });

    this.#pendingRefreshPromise = promise;

    return promise;
  }

  /**
   * Internal implementation of token refresh.  Called exclusively by
   * `refreshAuthTokens` which gates concurrent access via
   * `#pendingRefreshPromise`.
   */
  async #doRefreshAuthTokens(): Promise<void> {
    this.#assertIsAuthenticatedUser(this.state);
    const { refreshToken } = this.state;

    const res = await this.#refreshJWTToken({
      connection: this.state.authConnection,
      refreshToken,
    }).catch((error) => {
      // Distinguish a server-side token rejection (401) from transient
      // failures so callers can apply the appropriate recovery strategy.
      const httpStatusCode = (error as Error & { statusCode?: number })
        .statusCode;
      log('Error refreshing JWT tokens', error, { httpStatusCode });
      const isTokenRevoked =
        error instanceof Error &&
        error.name === 'RefreshTokenHttpError' &&
        httpStatusCode === 401;
      throw new SeedlessOnboardingError(
        isTokenRevoked
          ? SeedlessOnboardingControllerErrorMessage.InvalidRefreshToken
          : SeedlessOnboardingControllerErrorMessage.FailedToRefreshJWTTokens,
        {
          cause: error,
        },
      );
    });

    try {
      const { idTokens, accessToken, metadataAccessToken } = res;
      // Re-authenticate with the refreshed id tokens to update node auth
      // tokens, accessToken, and metadataAccessToken in state.
      await this.#reAuthenticate({
        idTokens,
        accessToken,
        metadataAccessToken,
      });

      // update the vault with new access token if wallet is unlocked
      if (this.#isUnlocked && this.#cachedDecryptedVaultData) {
        const updatedVaultData = {
          ...this.#cachedDecryptedVaultData,
          accessToken,
        };
        const pwEncKey = this.#cachedDecryptedVaultData.toprfPwEncryptionKey;

        await this.#updateVault({
          vaultData: updatedVaultData,
          pwEncKey,
        });

        // Proactively rotate the refresh token now that we have vault access.
        await this.rotateRefreshToken().catch((error) => {
          // Rotation failure is intentionally non-fatal: the JWT refresh
          // itself succeeded and the caller should not be blocked.
          // However the user is now operating with a stale refresh token
          // that may be revoked server-side, so log prominently.
          log(
            'Failed to rotate refresh token after successful JWT refresh. ' +
              'The user may be logged out when the old token is revoked.',
            error,
          );
        });
      }
    } catch (error) {
      log('Error refreshing node auth tokens', error);
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.AuthenticationError,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Re-authenticate the user using freshly issued tokens from a JWT refresh.
   *
   * Unlike the public `authenticate` method, this variant is called exclusively
   * from token-refresh paths where the user's identity has already been
   * established.  It only accepts the tokens returned by the JWT-refresh
   * service (`idTokens`, `accessToken`, `metadataAccessToken`) and reads all
   * other auth-connection details from the existing controller state.
   *
   * `refreshToken` and `revokeToken` are intentionally absent — token-refresh
   * paths must not touch `state.refreshToken` directly; that field is managed
   * exclusively by `rotateRefreshToken`.
   *
   * @param params - Tokens issued by the JWT-refresh service.
   * @param params.idTokens - New node id tokens.
   * @param params.accessToken - New access token.
   * @param params.metadataAccessToken - New metadata access token.
   * @returns A promise that resolves to the authentication result.
   */
  async #reAuthenticate(params: {
    idTokens: string[];
    accessToken: string;
    metadataAccessToken: string;
  }): Promise<AuthenticateResult> {
    const { idTokens, accessToken, metadataAccessToken } = params;
    const {
      authConnection,
      authConnectionId,
      groupedAuthConnectionId,
      userId,
      socialLoginEmail,
    } = this.state;

    try {
      const authenticationResult = await this.toprfClient.authenticate({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        authConnectionId: authConnectionId!,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        userId: userId!,
        idTokens,
        groupedAuthConnectionId,
      });

      this.update((state) => {
        state.nodeAuthTokens = authenticationResult.nodeAuthTokens;
        state.authConnection = authConnection;
        state.authConnectionId = authConnectionId;
        state.groupedAuthConnectionId = groupedAuthConnectionId;
        state.userId = userId;
        state.socialLoginEmail = socialLoginEmail;
        state.metadataAccessToken = metadataAccessToken;
        state.accessToken = accessToken;
        assertIsSeedlessOnboardingUserAuthenticated(state);
        state.isSeedlessOnboardingUserAuthenticated = true;
      });

      return authenticationResult;
    } catch (error) {
      log('Error re-authenticating user', error);
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.AuthenticationError,
        {
          cause: error,
        },
      );
    }
  }

  /**
   * Authenticate on the recovery verifier with the aal2 token and store the
   * issued node auth tokens, the token's `exp` and `sub` (profile ID), the
   * verifier IDs, and whether a share already exists, as `recoverySession`.
   * The aal1 `nodeAuthTokens`, `accessToken` and `metadataAccessToken` are
   * left as they are.
   *
   * @param params - The function parameters.
   * @param params.aal2Token - The aal2 token minted by the authentication API.
   * Its `exp` caps the lifetime of the aal2 node auth tokens.
   * @param params.authConnectionId - The recovery sub-verifier ID.
   * @param params.groupedAuthConnectionId - The recovery aggregate verifier ID.
   * @returns A promise that resolves once the aal2 set is stored.
   * @throws `MissingAuthUserInfo` if either verifier ID is empty or not a string.
   */
  async authenticateForRecovery({
    aal2Token,
    authConnectionId,
    groupedAuthConnectionId,
  }: {
    aal2Token: string;
    authConnectionId: string;
    groupedAuthConnectionId: string;
  }): Promise<void> {
    if (
      typeof authConnectionId !== 'string' ||
      !authConnectionId ||
      typeof groupedAuthConnectionId !== 'string' ||
      !groupedAuthConnectionId
    ) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
      );
    }

    return await this.#withControllerLock(async () => {
      const { exp, sub } = decodeAal2Token(
        aal2Token,
        Math.floor(Date.now() / 1000),
      );

      try {
        const { nodeAuthTokens, isNewUser } =
          await this.toprfClient.authenticate({
            authConnectionId,
            groupedAuthConnectionId,
            userId: sub,
            idTokens: [aal2Token],
          });
        this.update((state) => {
          state.recoverySession = {
            nodeAuthTokens,
            expiresAt: exp,
            userId: sub,
            authConnectionId,
            groupedAuthConnectionId,
            hasRecoveryShare: !isNewUser,
          };
        });
      } catch (error) {
        log('Error authenticating at aal2', error);
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.AuthenticationError,
          { cause: error },
        );
      }
    });
  }

  /**
   * Migrate the vault to envelope encryption, adopting its current key set
   * as the vault key set `K_v`.
   *
   * Writes `rbek` (sealed for the Recovery Secret) and the control record
   * into their own partitions. No secret data item is moved, and no password
   * is needed: the current password still derives `K_v` directly, so the
   * first `pbek` is written by the first password change. The sealed
   * envelope is checkpointed before the first remote write, so a failed call
   * can be retried with the same arguments. Does nothing if the vault is
   * already envelope-managed.
   *
   * The vault must be unlocked and in sync with the global password. Register
   * the Recovery Secret at the escrows first, then call
   * {@link authenticateForRecovery}.
   *
   * @param params - The function parameters.
   * @param params.recoverySecret - The 32-byte Recovery Secret held in escrow.
   * @returns A promise that resolves once the vault is envelope-managed.
   * @throws `OutdatedPassword` if the vault is not in sync with the global
   * password.
   */
  async migrateToEnvelope({
    recoverySecret,
  }: {
    recoverySecret: Uint8Array;
  }): Promise<void> {
    return await this.#withControllerLock(async () =>
      this.#executeWithTokenRefresh(async () => {
        this.#assertIsUnlocked();
        if (this.state.envelope) {
          return;
        }
        if (
          this.state.migrationVersion < SeedlessOnboardingMigrationVersion.V1
        ) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationRequiresDataTypes,
          );
        }

        const vaultKeySet = toVaultKeySet(
          await this.#unlockVaultAndGetVaultData(),
        );
        // another device holding the same K_v may have migrated already
        if (await this.#hasControlRecords(vaultKeySet)) {
          this.#setEnvelopeState(vaultKeySet, vaultKeySet.authKeyPair.pk);
          return;
        }
        const recoverySecretHex = bytesToHex(recoverySecret);

        let pending = await this.#loadPendingEnvelopeMigration(vaultKeySet);
        if (pending?.recoverySecret !== recoverySecretHex) {
          pending = await this.#sealEnvelopeMigration({
            recoverySecretHex,
            vaultKeySet,
          });
          const encrypted = await encryptPendingMigration(
            pending,
            vaultKeySet.localWrapKey,
          );
          this.update((state) => {
            state.pendingEnvelopeMigration = encrypted;
          });
        }

        await this.#writeEnvelopeMigration(pending, vaultKeySet);

        this.update((state) => {
          delete state.pendingEnvelopeMigration;
        });
        this.#setEnvelopeState(
          vaultKeySet,
          base64ToBytes(pending.passwordAuthPubKey),
        );
      }, 'migrateToEnvelope'),
    );
  }

  /**
   * Recover an envelope-managed vault with the Recovery Secret instead of the
   * password: open `rbek` to get the vault key set `K_v` and fetch the secret
   * data with it.
   *
   * No local vault is created. The vault keys are held in memory until
   * {@link setLocalPassword} creates the local vault with them, or until the
   * controller is locked or its state is cleared.
   *
   * Authenticate with social login and call {@link authenticateForRecovery}
   * first.
   *
   * @param params - The function parameters.
   * @param params.recoverySecret - The 32-byte Recovery Secret from escrow.
   * @returns The secret data of the vault.
   * @throws `RecoveryEnvelopeNotFound` if no vault keys are sealed for the
   * Recovery Secret, `RecoveryKeyShareConflict` if the nodes hold the key of
   * another Recovery Secret, or `Aal2Required` without a valid aal2 session.
   */
  async recoverWithRecoverySecret({
    recoverySecret,
  }: {
    recoverySecret: Uint8Array;
  }): Promise<SecretMetadata[]> {
    return await this.#withControllerLock(async () =>
      this.#executeWithTokenRefresh(async () => {
        this.#assertIsAuthenticatedUser(this.state);
        if (!this.#requireRecoverySession().hasRecoveryShare) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
        }

        const envelopeKeys = await this.#recoverRecoverySecretEnvelopeKeys(
          bytesToHex(recoverySecret),
        );
        const vaultKeySet = await this.#openNewestEnvelope(
          envelopeKeys,
          'recovery-secret',
        );
        if (!vaultKeySet) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
        }

        const secrets = await this.#fetchAllSecretDataFromMetadataStore(
          vaultKeySet.encKey,
          vaultKeySet.authKeyPair,
        );
        this.#recoveredVaultKeySet = vaultKeySet;
        return secrets;
      }, 'recoverWithRecoverySecret'),
    );
  }

  /**
   * Create the local vault under `password` with the vault keys recovered by
   * {@link recoverWithRecoverySecret}.
   *
   * `password` only encrypts the local vault and counts as outdated. This
   * sets `isPasswordResetPending`, which blocks {@link syncLatestGlobalPassword}
   * and {@link changePassword} until {@link resetPasswordWithVaultKeys} sets a
   * new global password.
   *
   * Any pending envelope migration checkpoint is discarded, since it belongs
   * to the vault this call replaces.
   *
   * @param params - The function parameters.
   * @param params.password - The password of the new local vault.
   * @returns A promise that resolves once the local vault is created.
   * @throws `RecoveryRequired` without a prior {@link recoverWithRecoverySecret},
   * or `Aal2Required` without a valid aal2 session.
   */
  async setLocalPassword({ password }: { password: string }): Promise<void> {
    return await this.#withControllerLock(async () =>
      this.#executeWithTokenRefresh(async () => {
        const vaultKeySet = this.#recoveredVaultKeySet;
        if (!vaultKeySet) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.RecoveryRequired,
          );
        }
        this.#requireRecoverySession();

        await this.#createNewVaultWithAuthData({
          password,
          rawToprfEncryptionKey: vaultKeySet.encKey as Uint8Array<ArrayBuffer>,
          rawToprfPwEncryptionKey:
            vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
          rawToprfAuthKeyPair: vaultKeySet.authKeyPair,
        });
        // the checkpoint belongs to the vault this call just replaced, and
        // `migrateToEnvelope` would never clear it once `envelope` is set
        this.update((state) => {
          delete state.pendingEnvelopeMigration;
          state.isPasswordResetPending = true;
        });
        this.#setEnvelopeState(vaultKeySet);
        this.#resetPasswordOutdatedCache();
        this.#recoveredVaultKeySet = undefined;
      }, 'setLocalPassword'),
    );
  }

  /**
   * Set a new global password on an envelope-managed vault without the old
   * one, after {@link recoverWithRecoverySecret} and {@link setLocalPassword}.
   *
   * Only allowed while the local password is not yet synced with the global
   * password, which is the state the vault is left in after
   * {@link setLocalPassword}, and with a valid aal2 session from
   * {@link authenticateForRecovery}. A successful reset clears
   * `isPasswordResetPending`; after that, use {@link changePassword} instead.
   *
   * The password OPRF key swap is signed with the auth key stored in the
   * vault's control record, so the old password is not needed. The vault
   * keys and the backend vault stay as they are, and the local vault is
   * re-encrypted under the new password.
   *
   * @param params - The function parameters.
   * @param params.newPassword - The new global password.
   * @returns A promise that resolves once the new password is global.
   * @throws `PasswordResetRequiresRecovery` if the vault is not
   * envelope-managed or its local password is already synced,
   * `Aal2Required` without a valid aal2 session, or
   * `EnvelopeControlRecordNotFound` if no control record matches the live
   * password OPRF key.
   */
  async resetPasswordWithVaultKeys({
    newPassword,
  }: {
    newPassword: string;
  }): Promise<void> {
    return await this.#withControllerLock(async () =>
      this.#executeWithTokenRefresh(async () => {
        this.#assertIsUnlocked();
        const { envelope } = this.state;
        if (!envelope || envelope.passwordAuthPubKey) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.PasswordResetRequiresRecovery,
          );
        }
        this.#requireRecoverySession();

        let keyringEncryptionKey: string | undefined;
        if (this.state.encryptedKeyringEncryptionKey) {
          keyringEncryptionKey = await this.loadKeyringEncryptionKey();
        }

        const vaultKeySet = toVaultKeySet(
          await this.#unlockVaultAndGetVaultData(),
        );
        const { authPubKey, keyIndex } = await this.#fetchGlobalAuthPubKey();
        const controlRecords = await this.#envelopeStore.fetchControlRecords(
          deriveControlKeys(vaultKeySet),
        );
        await this.#changePasswordEnveloped({
          vaultKeySet,
          controlRecords,
          globalAuthPubKey: authPubKey,
          latestKeyIndex: keyIndex,
          newPassword,
        });
        this.update((state) => {
          delete state.isPasswordResetPending;
        });
        this.#resetPasswordOutdatedCache();

        if (keyringEncryptionKey) {
          await this.storeKeyringEncryptionKey(keyringEncryptionKey);
        }
      }, 'resetPasswordWithVaultKeys'),
    );
  }

  /**
   * Seal the Recovery Secret envelope and the first control record of an
   * envelope migration (steps 3 and 4).
   *
   * The password OPRF key is still the one the vault keys derive from, so
   * the vault is in sync when the nodes' auth public key equals the vault's.
   *
   * @param params - The function parameters.
   * @param params.recoverySecretHex - The hex encoded Recovery Secret.
   * @param params.vaultKeySet - The vault key set to adopt as `K_v`.
   * @returns The migration checkpoint.
   * @throws `OutdatedPassword` if the vault is not in sync with the global
   * password.
   */
  async #sealEnvelopeMigration({
    recoverySecretHex,
    vaultKeySet,
  }: {
    recoverySecretHex: string;
    vaultKeySet: VaultKeySet;
  }): Promise<PendingEnvelopeMigration> {
    const { latestKeyIndex } = await this.#assertPasswordInSync({
      skipCache: true,
      skipLock: true,
    });

    const recoveryKeys =
      await this.#evalRecoverySecretEnvelopeKeys(recoverySecretHex);
    this.#assertIsAuthenticatedUser(this.state);
    const { authConnectionId, groupedAuthConnectionId, userId } = this.state;
    const record: ControlRecord = {
      v: 1,
      seq: 1,
      passwordNamespace: {
        verifier: groupedAuthConnectionId ?? authConnectionId,
        verifierId: userId,
        authSk: bigIntToHex(vaultKeySet.authKeyPair.sk),
        keyIndex: latestKeyIndex,
        enabled: true,
      },
      migratedAt: Date.now(),
    };

    return {
      v: 2,
      recoverySecret: recoverySecretHex,
      passwordAuthPubKey: bytesToBase64(vaultKeySet.authKeyPair.pk),
      recoveryEnvelope: await sealFor(
        recoveryKeys,
        'recovery-secret',
        vaultKeySet,
      ),
      control: record,
    };
  }

  /**
   * Derive the envelope keys of the Recovery Secret on the recovery verifier,
   * registering the Recovery Secret OPRF key first if the nodes hold none
   * (step 3).
   *
   * @param recoverySecretHex - The hex encoded Recovery Secret.
   * @returns The envelope keys of the Recovery Secret.
   * @throws `RecoveryKeyShareConflict` if the registered key belongs to a
   * different Recovery Secret.
   */
  async #evalRecoverySecretEnvelopeKeys(
    recoverySecretHex: string,
  ): Promise<EnvelopeKeys> {
    const recoverySession = this.#requireRecoverySession();
    if (recoverySession.hasRecoveryShare) {
      return await this.#recoverRecoverySecretEnvelopeKeys(recoverySecretHex);
    }

    const { oprfKey, seed, envelopeKeys, authKeyPair } =
      await this.toprfClient.createLocalKey({ password: recoverySecretHex });
    // the controller only needs the envelope keys, so the seed is not kept
    seed.fill(0);
    await this.#withRecoverySession(async (session) =>
      this.toprfClient.persistLocalKey({
        ...session,
        oprfKey,
        authPubKey: authKeyPair.pk,
      }),
    );
    this.update((state) => {
      state.recoverySession = { ...recoverySession, hasRecoveryShare: true };
    });
    return envelopeKeys;
  }

  /**
   * Derive the envelope keys of the Recovery Secret with the Recovery Secret
   * OPRF key the nodes already hold.
   *
   * @param recoverySecretHex - The hex encoded Recovery Secret.
   * @returns The envelope keys of the Recovery Secret.
   * @throws `RecoveryKeyShareConflict` if the registered key belongs to a
   * different Recovery Secret.
   */
  async #recoverRecoverySecretEnvelopeKeys(
    recoverySecretHex: string,
  ): Promise<EnvelopeKeys> {
    const { envelopeKeys, rateLimitResetResult } =
      await this.#withRecoverySession(async (session) =>
        this.toprfClient
          .recoverEncKey({ ...session, password: recoverySecretHex })
          .catch((error) => {
            if (isCouldNotDeriveEncryptionKeyError(error)) {
              throw new SeedlessOnboardingError(
                SeedlessOnboardingControllerErrorMessage.RecoveryKeyShareConflict,
                { cause: error },
              );
            }
            throw error;
          }),
      );
    rateLimitResetResult.catch((error) => {
      log('Error resetting recovery secret rate limit', error);
    });
    return envelopeKeys;
  }

  /**
   * Write the checkpointed Recovery Secret envelope and control record under
   * the vault's metadata lock, and read each back (step 5).
   *
   * @param pending - The migration checkpoint.
   * @param vaultKeySet - The vault key set `K_v`.
   * @throws `OutdatedPassword`, after discarding the checkpoint, if the
   * password changed since the envelopes were sealed.
   */
  async #writeEnvelopeMigration(
    pending: PendingEnvelopeMigration,
    vaultKeySet: VaultKeySet,
  ): Promise<void> {
    const passwordAuthPubKey = base64ToBytes(pending.passwordAuthPubKey);
    await this.#withMetadataLock(vaultKeySet.authKeyPair, async () => {
      try {
        await this.#assertGlobalAuthPubKeyUnchanged(passwordAuthPubKey);
      } catch (error) {
        this.update((state) => {
          delete state.pendingEnvelopeMigration;
        });
        throw error;
      }

      await this.#writeAndVerifyEnvelope(pending.recoveryEnvelope);

      const controlKeys = deriveControlKeys(vaultKeySet);
      await this.#envelopeStore.writeControlRecord(
        controlKeys,
        pending.control,
      );
      const controlRecords =
        await this.#envelopeStore.fetchControlRecords(controlKeys);
      if (!selectControlRecord(controlRecords, passwordAuthPubKey)) {
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
        );
      }
    });
  }

  /**
   * @param vaultKeySet - The vault key set the checkpoint belongs to.
   * @returns The migration checkpoint, or undefined when there is none for
   * this key set.
   */
  async #loadPendingEnvelopeMigration(
    vaultKeySet: VaultKeySet,
  ): Promise<PendingEnvelopeMigration | undefined> {
    const { pendingEnvelopeMigration } = this.state;
    if (!pendingEnvelopeMigration) {
      return undefined;
    }
    return await decryptPendingMigration(
      pendingEnvelopeMigration,
      vaultKeySet.localWrapKey,
    );
  }

  /**
   * Open the password envelope `pbek` of a password's envelope keys.
   *
   * @param keys - The envelope keys derived from the password's TOPRF seed.
   * @returns The vault key set, or undefined when the password has no
   * envelope (legacy layout).
   * @throws If the envelopes cannot be fetched, or `InvalidEnvelope` if none
   * opens. A fetch error is never treated as "absent" (I6).
   */
  async #openPasswordEnvelope(
    keys: EnvelopeKeys,
  ): Promise<VaultKeySet | undefined> {
    return await this.#openNewestEnvelope(keys, 'password');
  }

  /**
   * Open the newest envelope of a partition's envelope keys that opens.
   *
   * @param keys - The envelope keys of the partition.
   * @param path - The path of the envelopes to open.
   * @returns The vault key set, or undefined when the partition holds no
   * envelope of the path.
   * @throws If the envelopes cannot be fetched, or `InvalidEnvelope` if none
   * opens.
   */
  async #openNewestEnvelope(
    keys: EnvelopeKeys,
    path: Envelope['path'],
  ): Promise<VaultKeySet | undefined> {
    const envelopes = await this.#envelopeStore.fetchEnvelopes(keys, path);
    if (envelopes.length === 0) {
      return undefined;
    }
    for (const envelope of envelopes) {
      try {
        return await openEnvelope(envelope, keys.wrapKey, path);
      } catch (error) {
        log('Ignoring envelope that does not open', error);
      }
    }
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
    );
  }

  /**
   * Write an envelope, then read it back and check that it opens (I1). The
   * header is bound as associated data, so an envelope with the same
   * ciphertext that opens also names the same vault key set.
   *
   * @param sealed - The envelope and its partition keys.
   * @throws `InvalidEnvelope` if the envelope does not read back.
   */
  async #writeAndVerifyEnvelope(sealed: SealedEnvelope): Promise<void> {
    const { keys, envelope } = sealed;
    await this.#envelopeStore.writeEnvelope(keys, envelope);
    const stored = (
      await this.#envelopeStore.fetchEnvelopes(keys, envelope.path)
    ).find(({ ct }) => ct === envelope.ct);
    if (!stored) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
      );
    }
    await openEnvelope(stored, keys.wrapKey, envelope.path);
  }

  /**
   * Re-check, under the metadata lock, that the password OPRF key is still
   * the one the caller started with (I7).
   *
   * @param expected - The password OPRF auth public key the caller saw.
   * @throws `OutdatedPassword` if the nodes now return a different key.
   */
  async #assertGlobalAuthPubKeyUnchanged(
    expected: SEC1EncodedPublicKey,
  ): Promise<void> {
    const { authPubKey } = await this.#fetchGlobalAuthPubKey();
    if (!pubKeysEqual(authPubKey, expected)) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
      );
    }
  }

  /**
   * Run a callback while holding the metadata lock of a partition.
   *
   * @param authKeyPair - The auth key pair of the partition.
   * @param callback - The callback.
   * @returns The callback result.
   */
  async #withMetadataLock<Result>(
    authKeyPair: KeyPair,
    callback: () => Promise<Result>,
  ): Promise<Result> {
    const lockId = await this.toprfClient.acquireMetadataLock(authKeyPair);
    try {
      return await callback();
    } finally {
      await this.toprfClient
        .releaseMetadataLock(authKeyPair, lockId)
        .catch((error) => {
          log('Error releasing metadata lock', error);
        });
    }
  }

  /**
   * Mark the vault as envelope-managed.
   *
   * @param vaultKeySet - The vault key set `K_v`.
   * @param passwordAuthPubKey - The password OPRF auth public key the local
   * password is synced with, or undefined when it is not known to be synced.
   */
  #setEnvelopeState(
    vaultKeySet: VaultKeySet,
    passwordAuthPubKey?: SEC1EncodedPublicKey,
  ): void {
    this.update((state) => {
      state.envelope = {
        v: 1,
        vaultAuthPubKey: bytesToBase64(vaultKeySet.authKeyPair.pk),
        ...(passwordAuthPubKey && {
          passwordAuthPubKey: bytesToBase64(passwordAuthPubKey),
        }),
      };
    });
  }

  /**
   * Until the first envelope password change, a migrated vault has no
   * `pbek`, so its control records are what mark it envelope-managed.
   *
   * @param vaultKeySet - The vault key set.
   * @returns Whether the vault key set has control records.
   * @throws If the control records cannot be fetched.
   */
  async #hasControlRecords(vaultKeySet: VaultKeySet): Promise<boolean> {
    const controlRecords = await this.#envelopeStore.fetchControlRecords(
      deriveControlKeys(vaultKeySet),
    );
    return controlRecords.length > 0;
  }

  /**
   * Mark the vault as envelope-managed, or clear the envelope state.
   *
   * @param isEnvelopeManaged - Whether the vault is envelope-managed.
   * @param vaultKeySet - The vault key set `K_v`.
   * @param passwordAuthPubKey - The password OPRF auth public key the local
   * password is synced with.
   */
  #updateEnvelopeState(
    isEnvelopeManaged: boolean,
    vaultKeySet: VaultKeySet,
    passwordAuthPubKey: SEC1EncodedPublicKey,
  ): void {
    if (isEnvelopeManaged) {
      this.#setEnvelopeState(vaultKeySet, passwordAuthPubKey);
      return;
    }
    this.update((state) => {
      delete state.envelope;
    });
  }

  /**
   * @returns The recovery session, or undefined when it is missing or expired.
   */
  #getRecoverySession(): RecoverySession | undefined {
    return getValidRecoverySession(
      this.state.recoverySession,
      Math.floor(Date.now() / 1000),
    );
  }

  /**
   * @returns The recovery session.
   * @throws `Aal2Required`, after clearing the session, if it is missing or
   * expired. It is never refreshed, because that needs a new aal2 token.
   */
  #requireRecoverySession(): RecoverySession {
    const session = this.#getRecoverySession();
    if (!session) {
      this.#clearRecoverySession();
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.Aal2Required,
      );
    }
    return session;
  }

  /**
   * Run a recovery verifier TOPRF call with the aal2 set. A missing, expired
   * or rejected set is cleared and surfaces as `Aal2Required`.
   *
   * @param operation - The TOPRF call, given the request params.
   * @returns The operation result.
   */
  async #withRecoverySession<Result>(
    operation: (request: RecoveryRequest) => Promise<Result>,
  ): Promise<Result> {
    const {
      nodeAuthTokens,
      userId,
      authConnectionId,
      groupedAuthConnectionId,
    } = this.#requireRecoverySession();
    try {
      return await operation({
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      });
    } catch (error) {
      if (isAuthTokenError(error)) {
        this.#clearRecoverySession();
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.Aal2Required,
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * @throws `PasswordResetPending` after {@link setLocalPassword}, until
   * {@link resetPasswordWithVaultKeys} succeeds.
   */
  #assertNoPasswordResetPending(): void {
    if (this.state.isPasswordResetPending) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.PasswordResetPending,
      );
    }
  }

  #clearRecoverySession(): void {
    this.update((state) => {
      delete state.recoverySession;
    });
  }

  /**
   * Rotate the refresh token — fetch a new refresh/revoke token pair from the
   * auth service and persist the new revoke token in the vault.
   *
   * This method should be called after a successful JWT refresh.
   *
   * @returns A Promise that resolves to void.
   */
  async rotateRefreshToken(): Promise<void> {
    this.#assertIsAuthenticatedUser(this.state);

    const vaultData = this.#cachedDecryptedVaultData;
    // Safety net: the caller (#doRefreshAuthTokens) already guards with
    // `this.#isUnlocked && this.#cachedDecryptedVaultData`, so this branch
    // is unreachable in normal flow. This check is added to satisfy the linter and
    // to make sure any future caller of this method does not bypass the check.
    /* istanbul ignore if */
    if (!vaultData) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.VaultLocked,
      );
    }
    const { refreshToken } = this.state;
    const { toprfPwEncryptionKey: pwEncKey, revokeToken } = vaultData;
    const { newRevokeToken, newRefreshToken } = await this.#renewRefreshToken({
      connection: this.state.authConnection,
      revokeToken,
    });

    if (newRevokeToken && newRefreshToken) {
      // Persist the new revoke token to the vault first. Only update state after
      // the vault write succeeds, so state and vault stay in sync if the write fails.
      await this.#updateVault({
        vaultData: {
          ...vaultData,
          revokeToken: newRevokeToken,
        },
        pwEncKey,
      });

      this.update((state) => {
        state.revokeToken = newRevokeToken;
        state.refreshToken = newRefreshToken;
      });

      // add the old refresh token to the list to be revoked later when possible
      this.#addRefreshTokenToRevokeList({
        refreshToken,
        revokeToken,
      });
    }
  }

  /**
   * Revoke all pending refresh tokens.
   *
   * This method is to be called after user is authenticated.
   *
   * @returns A Promise that resolves to void.
   */
  async revokePendingRefreshTokens(): Promise<void> {
    return await this.#withControllerLock(async () => {
      this.#assertIsAuthenticatedUser(this.state);
      const { pendingToBeRevokedTokens } = this.state;
      if (!pendingToBeRevokedTokens || pendingToBeRevokedTokens.length === 0) {
        return;
      }

      // revoke all pending refresh tokens in parallel
      const promises = pendingToBeRevokedTokens.map(({ revokeToken }) => {
        const revokePromise = async (): Promise<string | null> => {
          try {
            await this.#revokeRefreshToken({
              connection: this.state.authConnection as AuthConnection,
              revokeToken,
            });
            return revokeToken;
          } catch (error) {
            log('Error revoking refresh token', error);
            return null;
          }
        };
        return revokePromise();
      });
      const result = await Promise.all(promises); // no need to do Promise.allSettled because the promise already handle try catch
      // filter out the null values
      const revokedTokens = result.filter((token) => token !== null);
      if (revokedTokens.length > 0) {
        // update the state to remove the revoked tokens once all concurrent token revoke finish
        this.update((state) => {
          state.pendingToBeRevokedTokens =
            state.pendingToBeRevokedTokens?.filter(
              (token) => !revokedTokens.includes(token.revokeToken),
            );
        });
      }
    });
  }

  /**
   * Get the access token from the state.
   *
   * If the tokens are expired, the method will refresh them and return the new access token.
   *
   * @returns The access token.
   */
  async getAccessToken(): Promise<string | undefined> {
    return this.#withControllerLock(async () => {
      this.#assertIsAuthenticatedUser(this.state);

      return this.#executeWithTokenRefresh(async () => {
        return this.state.accessToken;
      }, 'getAccessToken');
    });
  }

  /**
   * Add a pending refresh, revoke token to the state to be revoked later.
   *
   * @param params - The parameters for adding a pending refresh, revoke token.
   * @param params.refreshToken - The refresh token to add.
   * @param params.revokeToken - The revoke token to add.
   */
  #addRefreshTokenToRevokeList({
    refreshToken,
    revokeToken,
  }: {
    refreshToken: string;
    revokeToken: string;
  }): void {
    this.update((state) => {
      state.pendingToBeRevokedTokens = [
        ...(state.pendingToBeRevokedTokens ?? []),
        { refreshToken, revokeToken },
      ];
    });
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
  async #executeWithTokenRefresh<Result>(
    operation: () => Promise<Result>,
    operationName: string,
  ): Promise<Result> {
    try {
      if (this.#checkTokensExpired()) {
        log(
          `JWT token expired during ${operationName}, attempting to refresh tokens`,
          'node auth token exp check',
        );
        await this.refreshAuthTokens();
      }

      return await operation();
    } catch (error) {
      // Check if this is a token expiration error
      if (isAuthTokenError(error)) {
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
   * Check if the tokens are expired.
   *
   * @returns True if the tokens are expired, false otherwise.
   */
  #checkTokensExpired(): boolean {
    // proactively check for expired tokens and refresh them if needed
    const isNodeAuthTokenExpired = this.checkNodeAuthTokenExpired();
    const isMetadataAccessTokenExpired = this.checkMetadataAccessTokenExpired();
    // access token is only accessible when the vault is unlocked
    // so skip the check if the vault is locked
    let isAccessTokenExpired = false;
    if (this.#isUnlocked) {
      isAccessTokenExpired = this.checkAccessTokenExpired();
    }

    return (
      isNodeAuthTokenExpired ||
      isMetadataAccessTokenExpired ||
      isAccessTokenExpired
    );
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
    // Node auth tokens do not carry a reliable iat field — use exact expiry.
    return isTokenNearExpiry(decodedToken.exp);
  }

  /**
   * Check if the current metadata access token should be refreshed.
   * Returns true when the token is expired or when less than 10% of its
   * lifetime remains (proactive refresh).
   *
   * @returns True if the metadata access token should be refreshed, false otherwise.
   */
  public checkMetadataAccessTokenExpired(): boolean {
    try {
      this.#assertIsAuthenticatedUser(this.state);
      const { metadataAccessToken } = this.state;
      // assertIsAuthenticatedUser will throw if metadataAccessToken is missing
      const decodedToken = decodeJWTToken(metadataAccessToken as string);
      return isTokenNearExpiry(decodedToken.exp, decodedToken.iat);
    } catch {
      return true; // Consider unauthenticated user as having expired tokens
    }
  }

  /**
   * Check if the current access token should be refreshed.
   * Returns true when the token is expired or when less than 10% of its
   * lifetime remains (proactive refresh).
   * When the vault is locked, the access token is not accessible, so we return false.
   *
   * @returns True if the access token should be refreshed, false otherwise.
   */
  public checkAccessTokenExpired(): boolean {
    try {
      this.#assertIsAuthenticatedUser(this.state);
      const { accessToken } = this.state;
      if (!accessToken) {
        return true; // Consider missing token as expired
      }
      const decodedToken = decodeJWTToken(accessToken);
      return isTokenNearExpiry(decodedToken.exp, decodedToken.iat);
    } catch {
      return true; // Consider unauthenticated user as having expired tokens
    }
  }

  async #identifyIncompleteMetadataBackup(password: string): Promise<void> {
    const deserializedVaultData =
      this.#cachedDecryptedVaultData as DeserializedVaultData;

    await trackIncompleteMetadataBackupEvents({
      fetchAllSecretDataFn: () =>
        this.toprfClient.fetchAllSecretDataItems({
          decKey: deserializedVaultData.toprfEncryptionKey,
          authKeyPair: deserializedVaultData.toprfAuthKeyPair,
        }),
      getPrimaryKeyringSeedPhraseFn: () =>
        this.messenger.call('KeyringController:exportSeedPhrase', {
          password,
        }),
      trackEvent: (event) =>
        this.messenger.call('AnalyticsController:trackEvent', event),
      logFn: log,
    });
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
