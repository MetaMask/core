import { BaseController } from '@metamask/base-controller';
import type * as encryptionUtils from '@metamask/browser-passworder';
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
} from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';
import { Mutex } from 'async-mutex';

import type { AuthConnection } from './constants.js';
import {
  controllerName,
  PASSWORD_OUTDATED_CACHE_TTL_MS,
  PASSWORD_RECOVERY_OPERATIONS,
  SecretType,
  SeedlessIdentityMismatchSource,
  SeedlessOnboardingControllerErrorMessage,
  SeedlessOnboardingMigrationVersion,
  SeedlessOnboardingOperation,
  SeedlessOnboardingCheckpoint,
  PasswordSyncInstruction,
  Web3AuthNetwork,
} from './constants.js';
import {
  getPasswordNamespaceAuthKeyPair,
  nextControlSeq,
  pubKeysEqual,
  selectControlRecord,
  unpackEnvelope,
} from './envelope/envelope-keys.js';
import type {
  ControlRecord,
  Envelope,
  PackedEnvelope,
  VaultKeySet,
} from './envelope/envelope-keys.js';
import { EnvelopeStore } from './envelope/EnvelopeStore.js';
import { projectLogger, createModuleLogger } from './logger.js';
import { RecoverySessionManager } from './mfa-recovery/recovery-session.js';
import { SecretMetadata } from './SecretMetadata.js';
import {
  SeedlessOnboardingControllerMessenger,
  SeedlessOnboardingControllerOptions,
} from './SeedlessOnboardingController-types.js';
import {
  getEnvelopeStatus,
  getInitialSeedlessOnboardingControllerStateWithDefaults,
  seedlessOnboardingMetadata,
} from './state.js';
import type {
  MutuallyExclusiveCallback,
  SeedlessOnboardingControllerState,
  AuthenticatedUserDetails,
  SeedlessAuthData,
  SocialBackupsMetadata,
  RefreshJWTToken,
  RevokeRefreshToken,
  RenewRefreshToken,
  VaultData,
  DeserializedVaultData,
  RecoverySession,
} from './types.js';
import { SeedlessEnvelopeMigrationCheckpointEventName } from './utils/analytics.js';
import { assertIsRecoverySecret } from './utils/assertions.js';
import { getPasswordSyncInstruction } from './utils/checkpoint.js';
import {
  isIdentityMismatchError,
  PasswordSyncError,
  RecoveryError,
  SeedlessOnboardingError,
} from './utils/errors.js';
import {
  assertCanChangePassword,
  assertIsEncryptedKeyringEncryptionKeySet,
  assertIsEncryptedSeedlessEncryptionKeySet,
  assertIsPasswordOutdatedCacheValid,
  assertIsSeedlessOnboardingUserAuthenticated,
  assertIsValidPassword,
  decodeJWTToken,
  decodeNodeAuthToken,
  deserializeVaultData,
  decryptStringWithKey,
  getDataTypeMigrationUpdates,
  getNewSocialBackupsMetadata,
  assertIdentityUnchangedAndTrackEvent,
  assertIdTokenMismatchAndTrackEvent,
  findSocialBackupMetadata,
  getLatestAccessToken,
  encryptStringWithKey,
  trackIncompleteMetadataBackupEvents,
  isAuthTokenError,
  isMaxKeyChainLengthError,
  isTokenNearExpiry,
  parseVaultData,
  parseAndValidateSecretMetadataBackup,
  serializeVaultData,
} from './utils/index.js';
import type { SecretBackupData } from './utils/index.js';
import { splitVaultItems } from './utils/secret-data-utils.js';
import {
  createEnvelopeState,
  isCouldNotDeriveEncryptionKeyError,
  isCouldNotDeriveThresholdAuthPubKeyError,
  packFor,
  toVaultKeySet,
} from './utils/utils.js';

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

type UpdatedVaultState = Pick<
  SeedlessOnboardingControllerState,
  | 'vault'
  | 'vaultEncryptionKey'
  | 'vaultEncryptionSalt'
  | 'encryptedSeedlessEncryptionKey'
>;

const MESSENGER_EXPOSED_METHODS = [
  'fetchMetadataAccessCreds',
  'preloadToprfNodeDetails',
  'authenticate',
  'createToprfKeyAndBackupSeedPhrase',
  'addNewSecretData',
  'fetchAllSecretData',
  'restoreVaultWithPassword',
  'changePassword',
  'completePasswordChange',
  'markPasswordChangeKeySyncPending',
  'resolvePasswordSyncState',
  'reconcilePassword',
  'updateBackupMetadataState',
  'verifyVaultPassword',
  'getSecretDataBackupState',
  'submitPassword',
  'identifyIncompleteMetadataBackup',
  'setLocked',
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

  /**
   * Incremented by `clearState` so that a token refresh started in a previous
   * session can detect it has been abandoned and must not touch state or the
   * vault of the current session.
   */
  #sessionGeneration = 0;

  readonly toprfClient: ToprfSecureBackup;

  readonly #envelopeStore: EnvelopeStore;

  readonly #recoverySession: RecoverySessionManager;

  readonly #refreshJWTToken: RefreshJWTToken;

  readonly #revokeRefreshToken: RevokeRefreshToken;

  readonly #renewRefreshToken: RenewRefreshToken;

  /**
   * The TTL of the password outdated cache in milliseconds.
   */
  readonly #passwordOutdatedCacheTTL: number;

  /**
   * Callback returning whether MFA recovery / envelope migration is enabled.
   */
  readonly #mfaFlag: () => boolean;

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
   * @param options.passwordOutdatedCacheTTL - The TTL of the password outdated cache in milliseconds.
   * @param options.mfaFlag - Callback returning whether MFA recovery / envelope migration is enabled. Defaults to `() => false`.
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
    mfaFlag = (): boolean => false,
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
    this.#mfaFlag = mfaFlag;

    this.#vaultEncryptor = encryptor;

    this.toprfClient = new ToprfSecureBackup({
      network,
      keyDeriver: toprfKeyDeriver,
      fetchMetadataAccessCreds: this.fetchMetadataAccessCreds.bind(this),
    });
    this.#envelopeStore = new EnvelopeStore({
      getToprfClient: (): ToprfSecureBackup => this.toprfClient,
    });
    this.#recoverySession = new RecoverySessionManager({
      getToprfClient: (): ToprfSecureBackup => this.toprfClient,
      getSession: (): RecoverySession | undefined => this.state.recoverySession,
      setSession: (session): void => {
        this.update((draft) => {
          draft.recoverySession = session;
        });
      },
      clearSession: (): void => {
        this.update((draft) => {
          delete draft.recoverySession;
        });
      },
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
   * @throws `UserAlreadyAuthenticated` if `mfaFlag` is enabled and a different user or verifier is already in state. Call `clearState` before authenticating another user.
   */
  async authenticate(
    params: SeedlessAuthData & { skipLock?: boolean },
  ): Promise<AuthenticateResult> {
    const doAuthenticateWithNodes = async (): Promise<AuthenticateResult> => {
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

      // Fail fast if the idToken does not belong to the provided user, before
      // making any network request. This detects caller-side inconsistencies
      // (e.g. a userId sourced from a different login than the idTokens).
      this.#assertIdTokenMismatchAndTrackEvent(
        idTokens,
        userId,
        SeedlessIdentityMismatchSource.ToprfAuthenticate,
      );

      // Fail fast when `mfaFlag` is enabled and a different user or verifier is
      // already in state. Callers must call `clearState` before authenticating
      // another user so prior user state (vault, envelope, recovery session,
      // operation lifecycle) is never mixed across sessions.
      if (this.#mfaFlag()) {
        const currentVerifier =
          this.state.groupedAuthConnectionId ?? this.state.authConnectionId;
        const nextVerifier = groupedAuthConnectionId ?? authConnectionId;
        if (
          (this.state.userId !== undefined && this.state.userId !== userId) ||
          (currentVerifier !== undefined && currentVerifier !== nextVerifier)
        ) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.UserAlreadyAuthenticated,
          );
        }
      }

      try {
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

    if (
      dataType !== EncAccountDataType.ImportedSrp &&
      dataType !== EncAccountDataType.ImportedPrivateKey
    ) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.InvalidSecretDataType,
      );
    }

    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();

      const performBackup = async (): Promise<void> => {
        // a local password is outdated by design until it is reset, so the
        // vault keys it unlocks are the source of truth for the new data
        if (getEnvelopeStatus(this.state).isLocalPassword) {
          assertCanChangePassword(this.state.seedlessOperationLifecycle);
        } else {
          await this.#assertPasswordInSync({
            skipCache: true,
          });
        }

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
        ({ secrets: secretDatas } =
          await this.#fetchAllSecretDataFromMetadataStore(
            toprfEncryptionKey,
            toprfAuthKeyPair,
          ));
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
   * Decrypts the secret data with the keys of the unlocked vault. The vault
   * and the `envelope` state are not changed.
   *
   * @returns A promise that resolves to the secret metadata items.
   */
  async fetchAllSecretData(): Promise<SecretMetadata[]> {
    return await this.#withControllerLock(async () => {
      this.#assertIsAuthenticatedUser(this.state);
      this.#assertIsUnlocked();

      return await this.#executeWithTokenRefresh(async () => {
        const keysFromVault = await this.#unlockVaultAndGetVaultData();
        const { secrets } = await this.#fetchAllSecretDataFromMetadataStore(
          keysFromVault.toprfEncryptionKey,
          keysFromVault.toprfAuthKeyPair,
        );

        return secrets;
      }, 'fetchAllSecretData');
    });
  }

  /**
   * Restores the local vault with the global password.
   *
   * Derives the keys from `password`, fetches and decrypts the secret data,
   * and creates the local vault under `password`, replacing any existing
   * one. If the vault is envelope-managed, the password opens the vault keys
   * and the `envelope` state is set; otherwise any existing `envelope` state
   * is cleared. `isLocalPassword` and `seedlessOperationLifecycle` are cleared.
   *
   * @param params - The function parameters.
   * @param params.password - The global password.
   * @returns The secret data of the vault.
   */
  async restoreVaultWithPassword({
    password,
  }: {
    password: string;
  }): Promise<SecretMetadata[]> {
    assertIsValidPassword(password);
    return await this.#withControllerLock(async () => {
      const sessionGeneration = this.#sessionGeneration;
      this.#assertIsAuthenticatedUser(this.state);

      return await this.#executeWithTokenRefresh(async () => {
        let encKey: Uint8Array;
        let pwEncKey: Uint8Array;
        let authKeyPair: KeyPair;
        let envelope:
          | {
              vaultKeySet: VaultKeySet;
              passwordAuthPubKey: SEC1EncodedPublicKey;
            }
          | undefined;
        let passwordKeySet: VaultKeySet | undefined;

        const recoverEncKeyResult = await this.#recoverEncKey(password);
        // an envelope-managed vault keeps its keys across password
        // changes, so the password only opens them (I6)
        const vaultKeySet = await this.#openNewestEnvelope(
          recoverEncKeyResult.envelopeKeys,
          'password',
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
          passwordKeySet = {
            authKeyPair,
            encKey,
            localWrapKey: pwEncKey,
          };
        }

        const { secrets, controlRecords } =
          await this.#fetchAllSecretDataFromMetadataStore(encKey, authKeyPair);

        // a migrated vault has no pbek until its first envelope password
        // change, so the password may derive K_v directly
        if (
          passwordKeySet &&
          selectControlRecord(controlRecords, authKeyPair.pk)
        ) {
          envelope = {
            vaultKeySet: passwordKeySet,
            passwordAuthPubKey: authKeyPair.pk,
          };
        }

        await this.#createNewVaultWithAuthData({
          password,
          rawToprfEncryptionKey: encKey as Uint8Array<ArrayBuffer>,
          rawToprfPwEncryptionKey: pwEncKey as Uint8Array<ArrayBuffer>,
          rawToprfAuthKeyPair: authKeyPair,
          sessionGeneration,
          // the vault was replaced, so `isLocalPassword`, `envelope`, and any
          // prior operation lifecycle describe the old password and key set
          onStateUpdate: (state) => {
            delete state.isLocalPassword;
            if (envelope) {
              state.envelope = createEnvelopeState(
                envelope.vaultKeySet,
                envelope.passwordAuthPubKey,
              );
            } else {
              delete state.envelope;
            }
            delete state.passwordOutdatedCache;
            delete state.seedlessOperationLifecycle;
          },
        });

        return secrets;
      }, 'restoreVaultWithPassword');
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
   */
  async changePassword(
    newPassword: string,
    oldPassword: string,
  ): Promise<void> {
    assertIsValidPassword(newPassword);
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();

      assertCanChangePassword(this.state.seedlessOperationLifecycle);

      // verify the old password of the encrypted vault
      await this.verifyVaultPassword(oldPassword, {
        skipLock: true, // skip lock since we already have the lock
      });

      const attemptChangePassword = async (): Promise<void> => {
        const { authPubKey: globalAuthPubKey, latestKeyIndex } =
          await this.#assertPasswordInSync({
            skipCache: true,
            // `changePassword` writes the checkpoint before its token-refresh retry
            // and guards concurrency itself at entry, so its own assert must
            // not be blocked by the checkpoint it just wrote.
            skipCheckpointCheck: true,
          });
        // load keyring encryption key if it exists
        let keyringEncryptionKey: string | undefined;
        if (this.state.encryptedKeyringEncryptionKey) {
          keyringEncryptionKey = await this.#loadKeyringEncryptionKeyUnlocked();
        }

        const vaultKeySet = toVaultKeySet(
          await this.#unlockVaultAndGetVaultData(),
        );
        // An envelope-managed device skips the pre-lock check and reads the
        // control records once under the metadata lock. A legacy device checks
        // once in case another device migrated the vault (I6).
        const isEnvelopeManaged =
          getEnvelopeStatus(this.state).isEnvelopeManaged ||
          (await this.#envelopeStore.fetchControlRecords(vaultKeySet)).length >
            0;

        if (isEnvelopeManaged) {
          const { authKeyPair: newPasswordAuthKeyPair } =
            await this.#changePasswordEnveloped({
              vaultKeySet,
              globalAuthPubKey,
              latestKeyIndex,
              newPassword,
            });

          await this.#commitPasswordChangeState({
            password: newPassword,
            encKey: vaultKeySet.encKey as Uint8Array<ArrayBuffer>,
            pwEncKey: vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
            authKeyPair: vaultKeySet.authKeyPair,
            keyringEncryptionKey,
            checkpoint: SeedlessOnboardingCheckpoint.LocalPasswordPending,
            operation: SeedlessOnboardingOperation.PasswordChange,
            onStateUpdate: (state) => {
              state.envelope = createEnvelopeState(
                vaultKeySet,
                newPasswordAuthKeyPair.pk,
              );
              delete state.isLocalPassword;
            },
          });
        } else {
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

          await this.#commitPasswordChangeState({
            password: newPassword,
            encKey: newEncKey as Uint8Array<ArrayBuffer>,
            pwEncKey: newPwEncKey as Uint8Array<ArrayBuffer>,
            authKeyPair: newAuthKeyPair,
            keyringEncryptionKey,
            checkpoint: SeedlessOnboardingCheckpoint.LocalPasswordPending,
            operation: SeedlessOnboardingOperation.PasswordChange,
            onStateUpdate: (state) => {
              delete state.isLocalPassword;
            },
          });
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
   * Swap the password OPRF key of an envelope-managed vault: seal `K_v` under
   * the new password's envelope keys, then under the vault's metadata lock
   * fetch the latest control records, write and verify the next control record,
   * and swap the password OPRF key. The swap is signed with the auth key of the
   * live control record, so the old password is not needed. The backend vault
   * data is not touched.
   *
   * @param params - The function parameters.
   * @param params.vaultKeySet - The vault key set `K_v`.
   * @param params.globalAuthPubKey - The live password OPRF auth public key.
   * @param params.latestKeyIndex - The live password OPRF key index.
   * @param params.newPassword - The new password.
   * @returns The new password OPRF authentication key pair.
   * @throws `EnvelopeControlRecordNotFound` if no control record matches the
   * live password OPRF key, or if the new control record does not read back.
   */
  async #changePasswordEnveloped({
    vaultKeySet,
    globalAuthPubKey,
    latestKeyIndex,
    newPassword,
  }: {
    vaultKeySet: VaultKeySet;
    globalAuthPubKey: SEC1EncodedPublicKey;
    latestKeyIndex: number;
    newPassword: string;
  }): Promise<{ authKeyPair: KeyPair }> {
    const { oprfKey, seed, envelopeKeys, authKeyPair } =
      await this.toprfClient.createLocalKey({ password: newPassword });
    // the controller only needs the envelope keys, so the seed is not kept
    seed.fill(0);
    const packed = packFor(envelopeKeys, 'password', vaultKeySet);

    await this.#withMetadataLock(vaultKeySet.authKeyPair, async (lockId) => {
      await this.#assertGlobalAuthPubKeyUnchanged(globalAuthPubKey);
      const controlRecords =
        await this.#envelopeStore.fetchControlRecords(vaultKeySet);
      const currentRecord = selectControlRecord(
        controlRecords,
        globalAuthPubKey,
      );
      if (!currentRecord) {
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
        );
      }

      const nextControlRecord: ControlRecord = {
        ...currentRecord,
        seq: nextControlSeq(controlRecords),
        passwordNamespace: {
          ...currentRecord.passwordNamespace,
          authSk: bigIntToHex(authKeyPair.sk),
          keyIndex: latestKeyIndex + 1,
        },
      };

      await this.#writeAndVerifyEnvelope(packed);
      await this.#envelopeStore.writeControlRecord(
        vaultKeySet,
        nextControlRecord,
        lockId,
      );
      const updatedRecords =
        await this.#envelopeStore.fetchControlRecords(vaultKeySet);
      if (!selectControlRecord(updatedRecords, authKeyPair.pk)) {
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
        );
      }

      this.#assertIsAuthenticatedUser(this.state);
      const { nodeAuthTokens, authConnectionId, groupedAuthConnectionId } =
        this.state;
      // Persist the lifecycle before the first remote mutation so a later
      // crash or lost response leaves a recovery signal.
      this.#writeSeedlessOperationLifecycle(
        SeedlessOnboardingCheckpoint.RemotePasswordPending,
      );
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

    return { authKeyPair };
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
    return findSocialBackupMetadata(
      this.state.socialBackupsMetadata,
      data,
      type,
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
      await this.#unlockVaultAndReconcileAccessToken(password);

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
      this.#isUnlocked = false;
    });
  }

  /**
   * Rewrite the local Seedless vault under the latest global password.
   *
   * Rewrites the local Seedless vault under the latest global password,
   * re-encrypts `encryptedKeyringEncryptionKey` under the new wrapping key,
   * and resets the password-outdated cache. Must be called while the
   * controller lock is held (or from a context that does not hold the lock,
   * in which case the caller manages locking).
   *
   * @param globalPassword - The latest global password.
   * @param globalKeys - The keys recovered from the latest global password.
   * @param globalKeys.encKey - The latest TOPRF encryption key.
   * @param globalKeys.pwEncKey - The latest TOPRF password encryption key.
   * @param globalKeys.authKeyPair - The latest TOPRF authentication key pair.
   * @param vaultKeySet - The vault key set opened from the password envelope,
   * if one exists for the global password.
   * @throws `PasswordEnvelopeNotFound` if the vault is envelope-managed, but
   * no vault keys are sealed for the global password and it does not derive
   * the vault keys either, or the envelope sealed for the global password
   * holds another vault key set.
   * @throws `NoSecretDataFound` if the global password has no envelope and
   * its partition has neither secret items nor a matching control record.
   */
  async #syncLatestGlobalPasswordInner(
    globalPassword: string,
    {
      encKey,
      pwEncKey,
      authKeyPair,
    }: Omit<RecoverEncryptionKeyResult, 'rateLimitResetResult'>,
    vaultKeySet?: VaultKeySet,
  ): Promise<void> {
    // Decrypt under the old wrapping key before the vault rewrite so the
    // ciphertext can be persisted under the new `toprfPwEncryptionKey`.
    let keyringEncryptionKey: string | undefined;
    if (this.state.encryptedKeyringEncryptionKey) {
      keyringEncryptionKey = await this.#loadKeyringEncryptionKeyUnlocked();
    }

    if (vaultKeySet) {
      // envelope-managed: keep K_v and re-encrypt under the new password
      await this.#commitPasswordChangeState({
        password: globalPassword,
        encKey: vaultKeySet.encKey as Uint8Array<ArrayBuffer>,
        pwEncKey: vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
        authKeyPair: vaultKeySet.authKeyPair,
        keyringEncryptionKey,
        checkpoint: SeedlessOnboardingCheckpoint.LocalPasswordPending,
        operation: SeedlessOnboardingOperation.PasswordSync,
        onStateUpdate: (state) => {
          state.envelope = createEnvelopeState(vaultKeySet, authKeyPair.pk);
          delete state.isLocalPassword;
        },
      });
      return;
    }

    const passwordKeySet: VaultKeySet = {
      authKeyPair,
      encKey,
      localWrapKey: pwEncKey,
    };
    // a migrated vault has no pbek until its first envelope password
    // change, so the password may derive K_v directly
    const { secretItems, controlRecords } =
      await this.#envelopeStore.fetchVaultItems(passwordKeySet);
    const isEnvelopeManaged = Boolean(
      selectControlRecord(controlRecords, authKeyPair.pk),
    );
    if (this.state.envelope && !isEnvelopeManaged) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.PasswordEnvelopeNotFound,
      );
    }
    if (!isEnvelopeManaged && secretItems.length === 0) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.NoSecretDataFound,
      );
    }

    await this.#commitPasswordChangeState({
      password: globalPassword,
      encKey: encKey as Uint8Array<ArrayBuffer>,
      pwEncKey: pwEncKey as Uint8Array<ArrayBuffer>,
      authKeyPair,
      keyringEncryptionKey,
      checkpoint: SeedlessOnboardingCheckpoint.LocalPasswordPending,
      operation: SeedlessOnboardingOperation.PasswordSync,
      onStateUpdate: (state) => {
        if (isEnvelopeManaged) {
          state.envelope = createEnvelopeState(passwordKeySet, authKeyPair.pk);
        } else {
          delete state.envelope;
        }
        delete state.isLocalPassword;
      },
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
   * @returns A promise that resolves to the keys recovered from the latest
   * global password and any opened password envelope vault key set, so the
   * password-sync flow can rewrite the vault without recovering them again.
   */
  async #submitGlobalPassword({
    targetAuthPubKey,
    globalPassword,
    maxKeyChainLength,
  }: {
    targetAuthPubKey: SEC1EncodedPublicKey;
    globalPassword: string;
    maxKeyChainLength: number;
  }): Promise<{
    globalKeys: Omit<RecoverEncryptionKeyResult, 'rateLimitResetResult'>;
    vaultKeySet?: VaultKeySet;
  }> {
    const globalKeys = await this.#recoverEncKey(globalPassword);
    const {
      envelopeKeys,
      pwEncKey: globalPwEncKey,
      authKeyPair: globalAuthKeyPair,
    } = globalKeys;

    try {
      // Envelope first (I6): the global password opens K_v, whose PW_BACKUP
      // chain leads back to this device's key set if it lagged behind.
      const vaultKeySet = await this.#openNewestEnvelope(
        envelopeKeys,
        'password',
      );
      const { envelope } = this.state;
      if (envelope) {
        const expectedVaultPk = base64ToBytes(envelope.vaultAuthPubKey);
        if (
          vaultKeySet
            ? !pubKeysEqual(vaultKeySet.authKeyPair.pk, expectedVaultPk)
            : !pubKeysEqual(globalAuthKeyPair.pk, expectedVaultPk)
        ) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.PasswordEnvelopeNotFound,
          );
        }
      }
      const chainStart = vaultKeySet
        ? {
            pwEncKey: vaultKeySet.localWrapKey,
            authKeyPair: vaultKeySet.authKeyPair,
          }
        : { pwEncKey: globalPwEncKey, authKeyPair: globalAuthKeyPair };

      // Recover vault encryption key.
      const { pwEncKey } = pubKeysEqual(
        chainStart.authKeyPair.pk,
        targetAuthPubKey,
      )
        ? { pwEncKey: chainStart.pwEncKey }
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
      // than the token stored in the vault. The vault will be updated later
      // by the password-sync flow.
      this.#pickLatestAccessToken(
        accessTokenBeforeUnlock,
        decryptedVaultData.accessToken,
      );

      return { globalKeys, vaultKeySet };
    } catch (error) {
      if (
        isAuthTokenError(error) ||
        (error instanceof SeedlessOnboardingError &&
          (error.message ===
            SeedlessOnboardingControllerErrorMessage.InvalidEnvelope ||
            error.message ===
              SeedlessOnboardingControllerErrorMessage.PasswordEnvelopeNotFound))
      ) {
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
   * @returns A promise that resolves to true if the password is outdated, false otherwise.
   */
  async #checkIsPasswordOutdated(options?: {
    skipCache?: boolean;
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

      // an envelope-managed vault keeps its key set, so the password OPRF
      // key it last synced with is tracked separately
      const { envelope } = this.state;
      const currentDeviceAuthPubKey = envelope
        ? base64ToBytes(envelope.passwordAuthPubKey)
        : this.#recoverAuthPubKey();

      let globalAuthPubKey = options?.globalAuthPubKey;
      if (!globalAuthPubKey) {
        const { authPubKey } = await this.#fetchGlobalAuthPubKey();
        globalAuthPubKey = authPubKey;
      }

      // use noble lib to deserialize and compare curve point
      const isExpiredPwd = !secp256k1.Point.fromHex(
        currentDeviceAuthPubKey,
      ).equals(secp256k1.Point.fromHex(globalAuthPubKey));
      // Cache the result in state
      this.update((state) => {
        state.passwordOutdatedCache = { isExpiredPwd, timestamp: Date.now() };
      });
      return isExpiredPwd;
    };

    return await this.#executeWithTokenRefresh(
      async () => await doCheckIsPasswordExpired(),
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
   * Unlock the vault with a password and keep a newer `accessToken` if one was
   * stored in state by `refreshAuthTokens` before unlock.
   *
   * `#unlockVaultAndGetVaultData` writes the vault token over
   * `state.accessToken`. Snapshot the pre-unlock token, pick the latest, and
   * persist it into the vault when it differs. Caller must hold the controller
   * lock.
   *
   * @param password - The password to unlock the vault with.
   */
  async #unlockVaultAndReconcileAccessToken(password: string): Promise<void> {
    const { accessToken: accessTokenBeforeUnlock } = this.state;

    const deserializedVaultData = await this.#unlockVaultAndGetVaultData({
      password,
    });

    const accessTokenFromDecryptedVault = deserializedVaultData.accessToken;

    const latestAccessToken = this.#pickLatestAccessToken(
      accessTokenBeforeUnlock,
      accessTokenFromDecryptedVault,
    );

    if (latestAccessToken !== accessTokenFromDecryptedVault) {
      await this.#updateVault({
        password,
        vaultData: {
          ...deserializedVaultData,
          accessToken: latestAccessToken,
        },
        pwEncKey: deserializedVaultData.toprfPwEncryptionKey,
      });
    }

    this.#setUnlocked();
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
    const latestToken = getLatestAccessToken(
      tokenBeforeUnlock,
      tokenAfterUnlock,
    );

    if (latestToken !== tokenAfterUnlock) {
      // Update the access token in the state with the latest access token
      this.update((state) => {
        state.accessToken = latestToken;
      });
    }

    return latestToken;
  }

  /**
   * Clears the current state of the SeedlessOnboardingController.
   *
   * Waits for any in-flight controller operation before clearing state and
   * releases the in-memory decrypted vault data.
   *
   * @returns A promise that resolves once the state has been cleared.
   */
  async clearState(): Promise<void> {
    this.#pendingRefreshPromise = undefined;
    this.#sessionGeneration += 1;
    await this.#withControllerLock(async () => {
      this.#cachedDecryptedVaultData = undefined;
      this.#isUnlocked = false;
      this.#pendingRefreshPromise = undefined;
      const defaultState =
        getInitialSeedlessOnboardingControllerStateWithDefaults();
      this.update(() => {
        return defaultState;
      });
    });
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
   * Store the keyring encryption key in state, encrypted under the current
   * encryption key.
   *
   * Remains lifecycle-neutral: the client calls this during recovery without
   * advancing the lifecycle checkpoint.
   *
   * @param keyringEncryptionKey - The keyring encryption key.
   */
  async storeKeyringEncryptionKey(keyringEncryptionKey: string): Promise<void> {
    await this.#withControllerLock(async () => {
      await this.#storeKeyringEncryptionKeyUnlocked(keyringEncryptionKey);
    });
  }

  /**
   * Store the keyring encryption key in state while the controller lock is
   * held.
   *
   * @param keyringEncryptionKey - The keyring encryption key.
   */
  async #storeKeyringEncryptionKeyUnlocked(
    keyringEncryptionKey: string,
  ): Promise<void> {
    const { toprfPwEncryptionKey: encKey } =
      await this.#unlockVaultAndGetVaultData();
    const encryptedKeyringEncryptionKey =
      await this.#encryptKeyringEncryptionKey(keyringEncryptionKey, encKey);
    this.update((state) => {
      state.encryptedKeyringEncryptionKey = encryptedKeyringEncryptionKey;
    });
  }

  /**
   * Load the keyring encryption key from state, decrypted under the current
   * encryption key.
   *
   * @returns The keyring encryption key.
   */
  async loadKeyringEncryptionKey(): Promise<string> {
    return await this.#withControllerLock(
      async () => await this.#loadKeyringEncryptionKeyUnlocked(),
    );
  }

  /**
   * Load the keyring encryption key while the controller lock is held.
   *
   * @returns The keyring encryption key.
   */
  async #loadKeyringEncryptionKeyUnlocked(): Promise<string> {
    const { toprfPwEncryptionKey: encKey } =
      await this.#unlockVaultAndGetVaultData();
    return await this.#loadKeyringEncryptionKey(encKey);
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
    return await decryptStringWithKey(encryptedKey, encKey);
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
    return await decryptStringWithKey(encryptedKey, encKey);
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

  /**
   * Fetch the vault partition once and split it into the secrets and the
   * envelope control records.
   *
   * @param encKey - The encryption key of the vault partition.
   * @param authKeyPair - The auth key pair of the vault partition.
   * @returns The parsed secrets and the control records, newest first.
   * @throws `NoSecretDataFound` if the partition has no secret items, even
   * when it has control records.
   */
  async #fetchAllSecretDataFromMetadataStore(
    encKey: Uint8Array,
    authKeyPair: KeyPair,
  ): Promise<{ secrets: SecretMetadata[]; controlRecords: ControlRecord[] }> {
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

    const { secretItems, controlRecords } = splitVaultItems(secretDataItems);
    // user must have at least one secret data
    if (secretItems.length > 0) {
      return {
        secrets: parseAndValidateSecretMetadataBackup(secretItems),
        controlRecords,
      };
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

    // Persist the lifecycle before the first remote mutation so a later
    // crash or lost response leaves a recovery signal. The password change
    // is never retried; recovery reconciles local state via the existing
    // password-sync flow.
    this.#writeSeedlessOperationLifecycle(
      SeedlessOnboardingCheckpoint.RemotePasswordPending,
    );

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
      transformDataItems: (items) => {
        // the new partition must keep the control record, or the vault turns
        // legacy while `rbek` still seals the old K_v
        if (
          items.some(
            ({ dataType }) => dataType === EncAccountDataType.EnvelopeControl,
          )
        ) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.EnvelopeVaultRequiresEnvelopePasswordChange,
          );
        }
        return items
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
          }));
      },
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
   * @param params.onStateUpdate - Optional callback to apply additional state changes in the same atomic update.
   * @param params.sessionGeneration - Session generation to assert before and after vault encryption; defaults to the current generation.
   */
  async #createNewVaultWithAuthData({
    password,
    rawToprfEncryptionKey,
    rawToprfPwEncryptionKey,
    rawToprfAuthKeyPair,
    onStateUpdate,
    sessionGeneration = this.#sessionGeneration,
  }: {
    password: string;
    rawToprfEncryptionKey: Uint8Array<ArrayBuffer>;
    rawToprfPwEncryptionKey: Uint8Array<ArrayBuffer>;
    rawToprfAuthKeyPair: KeyPair;
    onStateUpdate?: (state: SeedlessOnboardingControllerState) => void;
    sessionGeneration?: number;
  }): Promise<void> {
    this.#assertSessionGeneration(sessionGeneration);
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
      sessionGeneration,
      onStateUpdate: (state) => {
        state.authPubKey = bytesToBase64(rawToprfAuthKeyPair.pk);
        onStateUpdate?.(state);
      },
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
   * @param params.onStateUpdate - Optional callback to apply additional state changes in the same atomic update.
   * @param params.assertBeforeWrite - Optional assertion invoked before and after vault encryption (immediately before writing state).
   * @param params.sessionGeneration - Session generation to assert before and after vault encryption; defaults to the current generation.
   * @param params.skipLock - Whether the caller already holds the vault lock.
   * Use it when the vault data is read from the cache and written back in one
   * critical section, so that a concurrent vault rewrite cannot be overwritten
   * with stale data.
   * @returns A promise that resolves to the updated vault.
   */
  async #updateVault({
    password,
    vaultData,
    pwEncKey,
    onStateUpdate,
    assertBeforeWrite,
    sessionGeneration = this.#sessionGeneration,
    skipLock = false,
  }: {
    password?: string;
    vaultData: DeserializedVaultData;
    pwEncKey: Uint8Array<ArrayBuffer>;
    onStateUpdate?: (state: SeedlessOnboardingControllerState) => void;
    assertBeforeWrite?: () => void;
    sessionGeneration?: number;
    skipLock?: boolean;
  }): Promise<void> {
    const doUpdateVault = async (): Promise<void> => {
      assertBeforeWrite?.();
      this.#assertSessionGeneration(sessionGeneration);

      const updatedState = await this.#createUpdatedVaultState({
        password,
        vaultData,
        pwEncKey,
      });

      assertBeforeWrite?.();
      this.#assertSessionGeneration(sessionGeneration);

      // update the state with the updated vault data
      this.update((state) => {
        state.vault = updatedState.vault;
        state.vaultEncryptionKey = updatedState.vaultEncryptionKey;
        state.vaultEncryptionSalt = updatedState.vaultEncryptionSalt;
        state.encryptedSeedlessEncryptionKey =
          updatedState.encryptedSeedlessEncryptionKey;
        onStateUpdate?.(state);
      });

      // cache the vault data to avoid decrypting the vault data multiple times
      this.#cachedDecryptedVaultData = vaultData;
    };

    if (skipLock) {
      await doUpdateVault();
      return;
    }

    await this.#withVaultLock(doUpdateVault);
  }

  /**
   * Create the updated vault state without persisting it.
   *
   * This method must be called while the vault lock is held. Keeping vault
   * encryption separate from the state update allows password-change flows to
   * combine the vault fields with their other state changes in one update.
   *
   * @param params - The parameters for updating the vault.
   * @param params.password - The optional password to encrypt the vault.
   * @param params.vaultData - The raw vault data to update the vault with.
   * @param params.pwEncKey - The global password encryption key.
   * @returns The prepared vault state.
   */
  async #createUpdatedVaultState({
    password,
    vaultData,
    pwEncKey,
  }: {
    password?: string;
    vaultData: DeserializedVaultData;
    pwEncKey: Uint8Array<ArrayBuffer>;
  }): Promise<UpdatedVaultState> {
    const serializedVaultData = serializeVaultData(vaultData);

    const { vaultEncryptionKey, vaultEncryptionSalt, vault } = this.state;

    const updatedState: UpdatedVaultState = {
      vault,
      vaultEncryptionKey,
      vaultEncryptionSalt,
      encryptedSeedlessEncryptionKey: this.state.encryptedSeedlessEncryptionKey,
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

    return updatedState;
  }

  /**
   * Persist the local Seedless state for a password operation in one update.
   *
   * This is intentionally separate from the generic vault creation path. The
   * password boundary includes the vault, authentication public key, Keyring
   * encryption key, and lifecycle checkpoint.
   *
   * @param params - The password-operation state to persist.
   * @param params.password - The password to encrypt the vault with.
   * @param params.encKey - The TOPRF encryption key.
   * @param params.pwEncKey - The TOPRF password encryption key.
   * @param params.authKeyPair - The TOPRF authentication key pair.
   * @param params.keyringEncryptionKey - The decrypted Keyring encryption key.
   * @param params.checkpoint - The lifecycle checkpoint to persist.
   * @param params.operation - The password lifecycle operation to persist.
   * @param params.onStateUpdate - Optional callback to apply additional state
   * changes in the same atomic update.
   */
  async #commitPasswordChangeState({
    password,
    encKey,
    pwEncKey,
    authKeyPair,
    keyringEncryptionKey,
    checkpoint,
    operation,
    onStateUpdate,
  }: {
    password: string;
    encKey: Uint8Array<ArrayBuffer>;
    pwEncKey: Uint8Array<ArrayBuffer>;
    authKeyPair: KeyPair;
    keyringEncryptionKey?: string;
    checkpoint: SeedlessOnboardingCheckpoint;
    operation: SeedlessOnboardingOperation;
    onStateUpdate?: (state: SeedlessOnboardingControllerState) => void;
  }): Promise<void> {
    this.#assertIsAuthenticatedUser(this.state);

    // The remote Seedless change is committed. Persist the boundary so
    // recovery knows the remote password is new.
    this.#writeSeedlessOperationLifecycle(
      SeedlessOnboardingCheckpoint.LocalStatePending,
      operation,
    );

    const { accessToken, revokeToken } =
      await this.#getAccessTokenAndRevokeToken(password);
    const vaultData: DeserializedVaultData = {
      toprfAuthKeyPair: authKeyPair,
      toprfEncryptionKey: encKey,
      toprfPwEncryptionKey: pwEncKey,
      revokeToken,
      accessToken,
    };

    await this.#withVaultLock(async () => {
      const updatedVaultState = await this.#createUpdatedVaultState({
        password,
        vaultData,
        pwEncKey,
      });
      const encryptedKeyringEncryptionKey =
        keyringEncryptionKey === undefined
          ? undefined
          : await this.#encryptKeyringEncryptionKey(
              keyringEncryptionKey,
              pwEncKey,
            );

      this.update((state) => {
        state.vault = updatedVaultState.vault;
        state.vaultEncryptionKey = updatedVaultState.vaultEncryptionKey;
        state.vaultEncryptionSalt = updatedVaultState.vaultEncryptionSalt;
        state.encryptedSeedlessEncryptionKey =
          updatedVaultState.encryptedSeedlessEncryptionKey;
        state.authPubKey = bytesToBase64(authKeyPair.pk);
        if (encryptedKeyringEncryptionKey !== undefined) {
          state.encryptedKeyringEncryptionKey = encryptedKeyringEncryptionKey;
        }
        state.seedlessOperationLifecycle = {
          operation,
          checkpoint,
        };
        delete state.passwordOutdatedCache;
        onStateUpdate?.(state);
      });

      this.#cachedDecryptedVaultData = vaultData;
    });

    this.#setUnlocked();
  }

  /**
   * Encrypt the Keyring encryption key with the TOPRF password encryption key.
   *
   * @param keyringEncryptionKey - The Keyring encryption key.
   * @param pwEncKey - The TOPRF password encryption key.
   * @returns The encrypted Keyring encryption key in base64 format.
   */
  async #encryptKeyringEncryptionKey(
    keyringEncryptionKey: string,
    pwEncKey: Uint8Array<ArrayBuffer>,
  ): Promise<string> {
    return await encryptStringWithKey(keyringEncryptionKey, pwEncKey);
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
    return await encryptStringWithKey(vaultEncryptionKey, pwEncKey);
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

  /**
   * Persist a lifecycle boundary to controller state.
   *
   * The lifecycle is a recovery signal only; it is not proof that a remote or
   * local operation completed. Recovery must always re-verify actual remote
   * and local state.
   *
   * Must be called while the controller lock is held.
   *
   * @param checkpoint - The lifecycle checkpoint to persist, or `undefined` to
   * clear the lifecycle.
   * @param operation - The operation to persist with the checkpoint.
   */
  #writeSeedlessOperationLifecycle(
    checkpoint: SeedlessOnboardingCheckpoint | undefined,
    operation: SeedlessOnboardingOperation = SeedlessOnboardingOperation.PasswordChange,
  ): void {
    this.update((state) => {
      if (checkpoint) {
        state.seedlessOperationLifecycle = {
          operation,
          checkpoint,
        };
      } else {
        state.seedlessOperationLifecycle = undefined;
      }
    });
  }

  /**
   * Complete password-change recovery.
   *
   * Call this after the current Keyring encryption key has been synchronized
   * and all required local writes have succeeded. The controller clears the
   * lifecycle so the next unlock is normal.
   *
   * This only completes a lifecycle that is at `KEY_SYNC_PENDING`; in any other
   * state it is a no-op.
   *
   * @returns A promise that resolves once recovery has been completed.
   */
  async completePasswordChange(): Promise<void> {
    await this.#withControllerLock(async () => {
      const lifecycle = this.state.seedlessOperationLifecycle;
      // Only complete from `KEY_SYNC_PENDING`. Any other lifecycle (or none) is
      // a no-op, so a stray call cannot discard an unfinished recovery
      // checkpoint before the key sync has been recorded.
      if (
        lifecycle?.checkpoint !== SeedlessOnboardingCheckpoint.KeySyncPending ||
        !PASSWORD_RECOVERY_OPERATIONS.has(lifecycle.operation)
      ) {
        return;
      }
      this.#writeSeedlessOperationLifecycle(undefined);
    });
  }

  /**
   * Mark the password-change lifecycle as `KEY_SYNC_PENDING`.
   *
   * Called by the client coordinator before it synchronizes the current
   * Keyring encryption key to Seedless. The controller only records the
   * boundary; it does not perform or verify synchronization.
   *
   * This only advances a lifecycle that is at `LOCAL_PASSWORD_PENDING`; in any
   * other state it is a no-op.
   *
   * @returns A promise that resolves once the checkpoint has been persisted.
   */
  async markPasswordChangeKeySyncPending(): Promise<void> {
    await this.#withControllerLock(async () => {
      const { seedlessOperationLifecycle } = this.state;
      // Only advance from `LOCAL_PASSWORD_PENDING`. Any other lifecycle (or
      // none) is a no-op, so a stray call cannot skip earlier checkpoints.
      if (
        seedlessOperationLifecycle?.checkpoint !==
          SeedlessOnboardingCheckpoint.LocalPasswordPending ||
        !PASSWORD_RECOVERY_OPERATIONS.has(seedlessOperationLifecycle.operation)
      ) {
        return;
      }
      this.#writeSeedlessOperationLifecycle(
        SeedlessOnboardingCheckpoint.KeySyncPending,
        seedlessOperationLifecycle.operation,
      );
    });
  }

  /**
   * Resolve the password-sync instruction without consuming a password.
   *
   * Checks the remote password before routing recovery for every valid
   * password-sync checkpoint. The checkpoint then determines the next local
   * recovery instruction when the passwords are in sync.
   *
   * @param options - The options.
   * @param options.skipCache - Whether to bypass the outdated cache. Recovery
   * checkpoints always bypass the cache.
   * @returns The sync/recovery instruction.
   * @throws If another operation is active or the password state cannot be
   * established.
   */
  async resolvePasswordSyncState(options?: {
    skipCache?: boolean;
  }): Promise<PasswordSyncInstruction> {
    // The checkpoint snapshot and any resulting check or transition must share
    // the controller lock. Otherwise a concurrent password change can advance
    // the checkpoint after it is read and before this method acts on it.
    return await this.#withControllerLock(async () => {
      const { seedlessOperationLifecycle } = this.state;
      if (
        seedlessOperationLifecycle &&
        !PASSWORD_RECOVERY_OPERATIONS.has(seedlessOperationLifecycle.operation)
      ) {
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.OperationInProgress,
        );
      }
      const checkpoint = seedlessOperationLifecycle?.checkpoint;
      const isPasswordOutdated = await this.#checkIsPasswordOutdated({
        // Recovery checkpoints must always use a fresh remote comparison.
        skipCache: checkpoint !== undefined || options?.skipCache,
      });
      const instruction = getPasswordSyncInstruction(
        checkpoint,
        isPasswordOutdated,
      );
      if (instruction === PasswordSyncInstruction.InSync) {
        // The local password matches. Clear a stale checkpoint.
        this.#writeSeedlessOperationLifecycle(undefined);
      }
      return instruction;
    });
  }

  /**
   * Reconcile the local Seedless password with the remote password.
   *
   * For `LOCAL_STATE_PENDING` it re-runs the existing password-sync flow
   * (chain unlock + local vault rewrite) with the new password and advances
   * the checkpoint to `LOCAL_PASSWORD_PENDING`. These operations are
   * idempotent, so re-running them is safe whether or not the local Seedless
   * vault was already rewritten. The controller is left unlocked.
   *
   * For `LOCAL_PASSWORD_PENDING` or `KEY_SYNC_PENDING` the local Seedless vault
   * is already rewritten. The method unlocks it with the supplied password so
   * `loadKeyringEncryptionKey` and `storeKeyringEncryptionKey` work after a
   * restart, without repeating remote TOPRF recovery or a vault rewrite. A
   * newer `accessToken` from `refreshAuthTokens` is kept instead of being
   * overwritten by the vault copy.
   *
   * It always re-checks whether the remote password is outdated, including when
   * the local Seedless vault was already rewritten. If it is, it runs the same
   * password-sync flow, advances to `LOCAL_PASSWORD_PENDING`, and returns
   * `ReconcileKeyring` so the client can reconcile the local Keyring. If the
   * remote password is current, the checkpoint determines whether the client
   * must reconcile the Keyring, sync its key, or do nothing.
   *
   * The client remains responsible for the Keyring side (classifying the local
   * Keyring via `KeyringController:verifyPassword` and running the old-Keyring
   * or new-Keyring branch), because this controller does not depend on
   * `KeyringController`. See
   * [the password sync flow](../docs/0002-seedless-password-sync-flow.md).
   *
   * @param params - The reconciliation parameters.
   * @param params.globalPassword - The current global password.
   * @param params.maxKeyChainLength - The maximum chain length of the pwd encryption keys. @default 5
   * @returns The reconciliation instruction.
   * @throws If recovery cannot establish the current password state.
   */
  async reconcilePassword({
    globalPassword,
    maxKeyChainLength = 5,
  }: {
    globalPassword: string;
    maxKeyChainLength?: number;
  }): Promise<PasswordSyncInstruction> {
    assertIsValidPassword(globalPassword);
    return await this.#withControllerLock(async () => {
      const { seedlessOperationLifecycle } = this.state;
      if (
        seedlessOperationLifecycle &&
        !PASSWORD_RECOVERY_OPERATIONS.has(seedlessOperationLifecycle.operation)
      ) {
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.OperationInProgress,
        );
      }
      const checkpoint = seedlessOperationLifecycle?.checkpoint;
      const isPasswordOutdated = await this.#checkIsPasswordOutdated({
        skipCache: true,
      });
      let instruction = getPasswordSyncInstruction(
        checkpoint,
        isPasswordOutdated,
      );

      if (
        instruction === PasswordSyncInstruction.ReconcileKeyring ||
        instruction === PasswordSyncInstruction.SyncKey
      ) {
        // Vault is already rewritten; unlock locally so Keyring key load/store
        // works after a restart without repeating TOPRF recovery.
        await this.#unlockVaultAndReconcileAccessToken(globalPassword);
      }

      if (instruction === PasswordSyncInstruction.InSync) {
        // Clear the checkpoint if available.
        this.#writeSeedlessOperationLifecycle(undefined);
      } else {
        // Update the checkpoint to the current operation.
        this.#writeSeedlessOperationLifecycle(
          checkpoint,
          SeedlessOnboardingOperation.PasswordSync,
        );

        if (instruction === PasswordSyncInstruction.PasswordOutdated) {
          // The instruction says current device password is outdated.
          // We will run the password-sync flow with the new password.
          await this.#runPasswordSyncFlow(globalPassword, maxKeyChainLength);
          // After the password-sync flow is completed, update the next instruction to reconcile the local Keyring.
          instruction = PasswordSyncInstruction.ReconcileKeyring;
        }
      }

      return instruction;
    });
  }

  /**
   * Re-run the password-sync flow (chain unlock + local vault rewrite) with
   * the supplied password.
   *
   * Both operations are idempotent if the local Seedless vault is already
   * synced, so this is safe to re-run during recovery or a plain
   * another-device sync. The controller is left unlocked. Caller must hold
   * the controller lock.
   *
   * @param globalPassword - The current global password.
   * @param maxKeyChainLength - The maximum chain length of the pwd encryption keys. @default 5
   */
  async #runPasswordSyncFlow(
    globalPassword: string,
    maxKeyChainLength: number = 5,
  ): Promise<void> {
    const { globalKeys, vaultKeySet } = await this.#executeWithTokenRefresh(
      async () => {
        const currentDeviceAuthPubKey = this.#recoverAuthPubKey();
        return await this.#submitGlobalPassword({
          targetAuthPubKey: currentDeviceAuthPubKey,
          globalPassword,
          maxKeyChainLength,
        });
      },
      'submitGlobalPassword',
    );
    await this.#executeWithTokenRefresh(async () => {
      await this.#syncLatestGlobalPasswordInner(
        globalPassword,
        globalKeys,
        vaultKeySet,
      );
    }, 'syncLatestGlobalPassword');
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
   * @param options.skipCheckpointCheck - Whether to skip the
   * `seedlessOperationLifecycle` guard. Only `changePassword` should set this:
   * it guards concurrency itself at entry and writes the lifecycle before its
   * token-refresh retry, so its own internal assert must not be blocked by the
   * lifecycle it just wrote.
   * @returns The global auth public key and the latest key index.
   * @throws If the password is outdated.
   */
  async #assertPasswordInSync(options?: {
    skipCache?: boolean;
    /**
     * Skip the `seedlessOperationLifecycle` guard. Only `changePassword`
     * should set this: it guards concurrency itself at entry and writes the
     * lifecycle before its token-refresh retry, so its own internal assert
     * must not be blocked by the lifecycle it just wrote.
     */
    skipCheckpointCheck?: boolean;
  }): Promise<{
    authPubKey: SEC1EncodedPublicKey;
    latestKeyIndex: number;
  }> {
    this.#assertIsAuthenticatedUser(this.state);

    // Block TOPRF operations while an operation is unresolved. The
    // controller mutex serializes in-process calls, but a previous change may
    // have left a persisted checkpoint after a crash. Running a fresh TOPRF
    // operation against ambiguous state could corrupt recovery. Recovery
    // itself bypasses this assert (it calls the password-sync primitives
    // directly), so this guard does not block reconciliation. `changePassword`
    // passes `skipCheckpointCheck` because it writes the checkpoint before its
    // own token-refresh retry and already guards concurrency at entry.
    if (!options?.skipCheckpointCheck) {
      assertCanChangePassword(this.state.seedlessOperationLifecycle);
    }

    const { authPubKey, keyIndex: latestKeyIndex } =
      await this.#fetchGlobalAuthPubKey();
    const isPasswordOutdated = await this.#checkIsPasswordOutdated({
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
        if (isAuthTokenError(error)) {
          throw error;
        }
        log('Error fetching auth pub key', error);
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.FailedToFetchAuthPubKey,
          {
            cause: error,
          },
        );
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
    const { refreshToken, userId, authConnectionId } = this.state;
    const sessionGeneration = this.#sessionGeneration;
    const assertRefreshIdentityUnchanged = (): void => {
      this.#assertIdentityUnchangedAndTrackEvent(
        {
          userId: this.state.userId,
          authConnectionId: this.state.authConnectionId,
        },
        { userId, authConnectionId },
        SeedlessIdentityMismatchSource.TokenRefresh,
      );
    };

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
      assertRefreshIdentityUnchanged();
      this.#assertSessionGeneration(sessionGeneration);
      const { idTokens, accessToken, metadataAccessToken } = res;
      // Re-authenticate with the refreshed id tokens to update node auth
      // tokens, accessToken, and metadataAccessToken in state.
      await this.#reAuthenticate({
        idTokens,
        accessToken,
        metadataAccessToken,
        sessionGeneration,
      });
      this.#assertSessionGeneration(sessionGeneration);

      // Update the vault with the new access token if wallet is unlocked. The
      // cached vault data is read and written under the vault lock, so a vault
      // rewrite (for example by a password change) cannot happen in between.
      const isVaultUpdated = await this.#withVaultLock(async () => {
        const latestVaultData = this.#cachedDecryptedVaultData;
        if (!this.#isUnlocked || !latestVaultData) {
          return false;
        }

        // Side-effect guard: the identity may have changed while the vault
        // update was in flight. Asserting before the vault write prevents
        // overwriting the new session's vault or rotating tokens for the wrong
        // identity.
        await this.#updateVault({
          vaultData: { ...latestVaultData, accessToken },
          pwEncKey: latestVaultData.toprfPwEncryptionKey,
          sessionGeneration,
          assertBeforeWrite: assertRefreshIdentityUnchanged,
          skipLock: true,
        });
        return true;
      });

      if (isVaultUpdated) {
        // Side-effect guard: the identity may have changed while the vault
        // update was in flight. Aborting here prevents the refresh-token
        // rotation from mixing the previous identity's tokens into the
        // current state.
        assertRefreshIdentityUnchanged();
        this.#assertSessionGeneration(sessionGeneration);

        // Proactively rotate the refresh token now that we have vault access.
        // IdentityMismatch must propagate: a sub/userId mismatch means the
        // vault revoke token must not be renewed for the wrong identity.
        await this.rotateRefreshToken(idTokens).catch((error) => {
          if (isIdentityMismatchError(error)) {
            throw error;
          }
          this.#assertSessionGeneration(sessionGeneration);
          // Other rotation failures are intentionally non-fatal: the JWT
          // refresh itself succeeded and the caller should not be blocked.
          // However the user is now operating with a stale refresh token
          // that may be revoked server-side, so log prominently.
          log(
            'Failed to rotate refresh token after successful JWT refresh. ' +
              'The user may be logged out when the old token is revoked.',
            error,
          );
        });
        this.#assertSessionGeneration(sessionGeneration);
      }
    } catch (error) {
      if (isIdentityMismatchError(error)) {
        // Propagate identity mismatch errors as-is so callers can distinguish
        // them from generic authentication failures.
        throw error;
      }
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
   * @param params.sessionGeneration - The session generation the refresh was
   * started in; the result is discarded if `clearState` ran since then.
   * @returns A promise that resolves to the authentication result.
   */
  async #reAuthenticate(params: {
    idTokens: string[];
    accessToken: string;
    metadataAccessToken: string;
    sessionGeneration: number;
  }): Promise<AuthenticateResult> {
    const { idTokens, accessToken, metadataAccessToken, sessionGeneration } =
      params;
    const {
      authConnection,
      authConnectionId,
      groupedAuthConnectionId,
      userId,
      socialLoginEmail,
    } = this.state;

    // Fail fast if the refreshed idTokens do not belong to the identity in
    // state. This can happen when the identity changes while a token refresh
    // is in flight (there is no lock between the refresh and this call).
    this.#assertIdTokenMismatchAndTrackEvent(
      idTokens,
      userId,
      SeedlessIdentityMismatchSource.TokenRefresh,
    );

    try {
      const authenticationResult = await this.toprfClient.authenticate({
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        authConnectionId: authConnectionId!,
        userId,
        idTokens,
        groupedAuthConnectionId,
      });
      // Stale-write guard: the state may have been overwritten by another
      // `authenticate()` call or wiped by `clearState()` while the request
      // was in flight. Discard the result instead of resurrecting the previous
      // identity into the current state. There is no `await` between this
      // check and the `update` below, so the pair is atomic.
      this.#assertIdentityUnchangedAndTrackEvent(
        {
          userId: this.state.userId,
          authConnectionId: this.state.authConnectionId,
        },
        { userId, authConnectionId },
        SeedlessIdentityMismatchSource.TokenRefresh,
      );
      this.#assertSessionGeneration(sessionGeneration);

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
      if (isIdentityMismatchError(error)) {
        // Propagate identity mismatch errors as-is so callers can distinguish
        // them from generic authentication failures.
        throw error;
      }
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
   * Assert that `clearState` has not run since the given session generation
   * was captured.
   *
   * @param sessionGeneration - The session generation captured earlier.
   */
  #assertSessionGeneration(sessionGeneration: number): void {
    if (sessionGeneration !== this.#sessionGeneration) {
      throw new Error('Session was cleared during token refresh');
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
   * Requires a successful {@link authenticate} first, since the recovery
   * session is bound to the authenticated user.
   *
   * @returns A promise that resolves once the aal2 set is stored.
   * @throws `MissingAuthUserInfo` if the user is not authenticated, or if either
   * verifier ID is empty or not a string.
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
    return await this.#withControllerLock(async () => {
      this.#assertIsAuthenticatedUser(this.state);
      await this.#recoverySession.authenticate({
        aal2Token,
        authConnectionId,
        groupedAuthConnectionId,
      });
    });
  }

  /**
   * Migrate the vault to envelope encryption, adopting its current key set
   * as the vault key set `K_v`.
   *
   * Writes, in order: `rbek` (`K_v` sealed for the Recovery Secret) under a
   * fresh OPRF key, the OPRF key on the recovery verifier, and the control
   * record under the vault's metadata lock. The control record is the
   * commit. No data item is moved and no password is needed; the first
   * `pbek` is written by the first password change.
   *
   * Retries are safe. An unregistered `rbek` is abandoned and a new one is
   * written. If the key is registered, `K_v` is resealed when the newest
   * `rbek` does not hold it (e.g. after a legacy password change), then the
   * control record is written. On an already migrated vault, it only checks
   * the recovery verifier and reseals `K_v` if needed.
   *
   * Requires an unlocked vault whose keys derive from the global password,
   * the Recovery Secret registered at the escrows, and a valid aal2 session
   * from {@link authenticateForRecovery}.
   *
   * @param params - The function parameters.
   * @param params.recoverySecret - The 32-byte Recovery Secret held in escrow.
   * @returns A promise that resolves once the vault is envelope-managed.
   * @throws `EnvelopeMigrationDisabled` if `mfaFlag` is not enabled.
   * @throws `InvalidRecoverySecret` if `recoverySecret` is not a 32-byte
   * `Uint8Array`.
   * @throws `PasswordChangeInProgress` if a password change lifecycle is
   * active.
   * @throws `OperationInProgress` if another operation lifecycle is active.
   * @throws `OutdatedPassword` if the vault is behind the global password.
   * @throws `EnvelopeControlRecordNotFound` if no control record matching the
   * global password reads back.
   * @throws `EnvelopeMigrationInconsistent` if a control record exists but
   * the recovery verifier holds no key.
   * @throws `RecoveryKeyShareConflict` if the recovery verifier holds another
   * Recovery Secret's key.
   * @throws `InvalidEnvelope` if `rbek` does not read back.
   * @throws `Aal2Required` without a valid aal2 session.
   * @throws `EnvelopeMigrationRequiresDataTypes` before the data type
   * migration.
   */
  async migrateToEnvelope({
    recoverySecret,
  }: {
    recoverySecret: Uint8Array;
  }): Promise<void> {
    if (!this.#mfaFlag()) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationDisabled,
      );
    }

    assertIsRecoverySecret(recoverySecret);
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();
      assertCanChangePassword(this.state.seedlessOperationLifecycle);
      if (this.state.migrationVersion < SeedlessOnboardingMigrationVersion.V1) {
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationRequiresDataTypes,
        );
      }
      this.#recoverySession.require();

      return await this.#executeWithTokenRefresh(async () => {
        const vaultKeySet = toVaultKeySet(
          await this.#unlockVaultAndGetVaultData(),
        );
        const recoveryAuthPubKey = await this.#fetchRecoveryAuthPubKey();
        const { authPubKey, controlRecords } =
          await this.#fetchEnvelopeMigrationPasswordKey(vaultKeySet);
        const isCommitted = controlRecords.length > 0;
        const partial = recoveryAuthPubKey !== undefined;
        if (isCommitted && !partial) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.EnvelopeMigrationInconsistent,
          );
        }

        if (!isCommitted) {
          this.#trackEnvelopeMigrationCheckpoint('STARTED', partial);
        }
        if (partial) {
          await this.#resealRecoveryEnvelope(recoverySecret, vaultKeySet);
        } else {
          await this.#sealAndRegisterRecoveryEnvelope(
            recoverySecret,
            vaultKeySet,
          );
        }
        if (isCommitted) {
          this.#setEnvelopeState(vaultKeySet, authPubKey);
          return;
        }

        const passwordAuthPubKey =
          await this.#writeEnvelopeMigrationControlRecord(vaultKeySet);
        this.#setEnvelopeState(vaultKeySet, passwordAuthPubKey);
        this.#trackEnvelopeMigrationCheckpoint('COMPLETED', partial);
      }, 'migrateToEnvelope');
    });
  }

  /**
   * Recover an envelope-managed vault with the Recovery Secret instead of the
   * password: open `rbek` to get the vault key set `K_v`, fetch the secret
   * data with it, and create the local vault under `password`.
   *
   * Intended for wallet rehydration, not while the wallet is locked. If this
   * device has `envelope` state, the recovered vault keys must be the ones
   * it names.
   *
   * `password` only encrypts the local vault. This sets `isLocalPassword`,
   * which {@link resetPasswordWithVaultKeys}, {@link changePassword} and
   * {@link reconcilePassword} clear once the password is global.
   * `envelope.passwordAuthPubKey` is set to the live password OPRF key, so
   * {@link resolvePasswordSyncState} reports a password change made elsewhere
   * after recovery.
   *
   * Authenticate with social login and call {@link authenticateForRecovery}
   * first.
   *
   * @param params - The function parameters.
   * @param params.recoverySecret - The 32-byte Recovery Secret from escrow.
   * @param params.password - The password of the new local vault.
   * @returns The secret data of the vault.
   * @throws `InvalidRecoverySecret` unless `recoverySecret` is a 32-byte
   * `Uint8Array`, before any request.
   * @throws `RecoveryEnvelopeNotFound` if no vault keys are sealed for the
   * Recovery Secret, they are not the vault keys named by the `envelope`
   * state, or the vault they open has no control record, as its migration is
   * not committed, `NoSecretDataFound` if a committed vault holds no secret
   * items, `EnvelopeControlRecordNotFound` if no control
   * record matches the live password OPRF key, since the password could never
   * be reset, `RecoveryKeyShareConflict` if the nodes hold the key of another
   * Recovery Secret, or `Aal2Required` without a valid aal2 session. No local
   * vault is created when it throws.
   */
  async recoverWithRecoverySecret({
    recoverySecret,
    password,
  }: {
    recoverySecret: Uint8Array;
    password: string;
  }): Promise<SecretMetadata[]> {
    assertIsRecoverySecret(recoverySecret);
    assertIsValidPassword(password);
    return await this.#withControllerLock(async () => {
      const sessionGeneration = this.#sessionGeneration;
      this.#assertIsAuthenticatedUser(this.state);
      this.#recoverySession.require();

      return await this.#executeWithTokenRefresh(async () => {
        if (!this.#recoverySession.require().hasRecoveryShare) {
          if (!(await this.#fetchRecoveryAuthPubKey())) {
            throw new SeedlessOnboardingError(
              SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
            );
          }
          this.#recoverySession.markRecoveryShareExists();
        }

        const { envelopeKeys } = await this.#recoverRecoverySecretEnvelopeKeys(
          bytesToHex(recoverySecret),
        );
        const candidates = await this.#openAllEnvelopes(
          envelopeKeys,
          'recovery-secret',
        );
        // K_v never changes once this device has envelope state
        const { envelope } = this.state;
        const matchingCandidates = envelope
          ? candidates.filter((candidate) =>
              pubKeysEqual(
                candidate.authKeyPair.pk,
                base64ToBytes(envelope.vaultAuthPubKey),
              ),
            )
          : candidates;
        if (matchingCandidates.length === 0) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
        }

        const recovered =
          await this.#findCommittedRecoveryVault(matchingCandidates);
        if (!recovered) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.RecoveryEnvelopeNotFound,
          );
        }
        const { vaultKeySet, secrets, controlRecords } = recovered;

        const { authPubKey } = await this.#fetchGlobalAuthPubKey();
        if (!selectControlRecord(controlRecords, authPubKey)) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );
        }

        await this.#createNewVaultWithAuthData({
          password,
          rawToprfEncryptionKey: vaultKeySet.encKey as Uint8Array<ArrayBuffer>,
          rawToprfPwEncryptionKey:
            vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
          rawToprfAuthKeyPair: vaultKeySet.authKeyPair,
          sessionGeneration,
          onStateUpdate: (state) => {
            state.isLocalPassword = true;
            state.envelope = createEnvelopeState(vaultKeySet, authPubKey);
            delete state.passwordOutdatedCache;
            delete state.seedlessOperationLifecycle;
          },
        });
        return secrets;
      }, 'recoverWithRecoverySecret');
    });
  }

  /**
   * Set a new global password on an envelope-managed vault without the old
   * one, after {@link recoverWithRecoverySecret}.
   *
   * Only allowed while `isLocalPassword` is set, which is the state the vault
   * is left in after {@link recoverWithRecoverySecret}, and with a valid aal2 session
   * from {@link authenticateForRecovery}. A successful reset clears
   * `isLocalPassword` and records the `LOCAL_PASSWORD_PENDING` password-change
   * lifecycle checkpoint; clients must advance and complete the lifecycle via
   * {@link markPasswordChangeKeySyncPending} and {@link completePasswordChange},
   * and after that use {@link changePassword} instead.
   *
   * The password OPRF key swap is signed with the auth key stored in the
   * vault's control record, so the old password is not needed. The vault
   * keys and the backend vault stay as they are, and the local vault is
   * re-encrypted under the new password.
   *
   * @param params - The function parameters.
   * @param params.newPassword - The new global password.
   * @returns A promise that resolves once the new password is global.
   * @throws `PasswordChangeInProgress` if a password change lifecycle is
   * active, `OperationInProgress` if another operation lifecycle is active,
   * `PasswordResetRequiresRecovery` if the vault is not
   * envelope-managed or `isLocalPassword` is not set,
   * `Aal2Required` without a valid aal2 session, or
   * `EnvelopeControlRecordNotFound` if no control record matches the live
   * password OPRF key.
   */
  async resetPasswordWithVaultKeys({
    newPassword,
  }: {
    newPassword: string;
  }): Promise<void> {
    assertIsValidPassword(newPassword);
    return await this.#withControllerLock(async () => {
      this.#assertIsUnlocked();
      assertCanChangePassword(this.state.seedlessOperationLifecycle);
      const status = getEnvelopeStatus(this.state);
      if (!status.isEnvelopeManaged || !status.isLocalPassword) {
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.PasswordResetRequiresRecovery,
        );
      }
      this.#recoverySession.require();

      return await this.#executeWithTokenRefresh(async () => {
        let keyringEncryptionKey: string | undefined;
        if (this.state.encryptedKeyringEncryptionKey) {
          keyringEncryptionKey = await this.#loadKeyringEncryptionKeyUnlocked();
        }

        const vaultKeySet = toVaultKeySet(
          await this.#unlockVaultAndGetVaultData(),
        );
        const { authPubKey, keyIndex } = await this.#fetchGlobalAuthPubKey();
        const { authKeyPair: newPasswordAuthKeyPair } =
          await this.#changePasswordEnveloped({
            vaultKeySet,
            globalAuthPubKey: authPubKey,
            latestKeyIndex: keyIndex,
            newPassword,
          });

        await this.#commitPasswordChangeState({
          password: newPassword,
          encKey: vaultKeySet.encKey as Uint8Array<ArrayBuffer>,
          pwEncKey: vaultKeySet.localWrapKey as Uint8Array<ArrayBuffer>,
          authKeyPair: vaultKeySet.authKeyPair,
          keyringEncryptionKey,
          checkpoint: SeedlessOnboardingCheckpoint.LocalPasswordPending,
          operation: SeedlessOnboardingOperation.PasswordChange,
          onStateUpdate: (state) => {
            state.envelope = createEnvelopeState(
              vaultKeySet,
              newPasswordAuthKeyPair.pk,
            );
            delete state.isLocalPassword;
          },
        });
      }, 'resetPasswordWithVaultKeys');
    });
  }

  /**
   * Fetch the auth public key of the Recovery Secret OPRF key from the
   * recovery verifier.
   *
   * @returns The auth public key, or undefined when the recovery verifier
   * holds no key.
   * @throws `Aal2Required` without a valid aal2 session.
   */
  async #fetchRecoveryAuthPubKey(): Promise<SEC1EncodedPublicKey | undefined> {
    try {
      const { authPubKey } = await this.#recoverySession.withSession(
        async (session) => this.toprfClient.fetchAuthPubKey(session),
      );
      return authPubKey;
    } catch (error) {
      if (isCouldNotDeriveThresholdAuthPubKeyError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Fetch the live password OPRF key and the vault's control records, and
   * check that both this device's local password and the vault are in sync
   * with the live key: without control records, the vault keys must still
   * derive from the password; with them, one must match the key, as the vault
   * is already envelope-managed by this or another device.
   *
   * @param vaultKeySet - The vault key set `K_v`.
   * @returns The live password OPRF key, its key index, and the control
   * records.
   * @throws `OutdatedPassword` if this device or the vault is not in sync
   * with the live key.
   */
  async #fetchEnvelopeMigrationPasswordKey(vaultKeySet: VaultKeySet): Promise<{
    authPubKey: SEC1EncodedPublicKey;
    keyIndex: number;
    controlRecords: ControlRecord[];
  }> {
    const { authPubKey, keyIndex } = await this.#fetchGlobalAuthPubKey();
    const controlRecords =
      await this.#envelopeStore.fetchControlRecords(vaultKeySet);
    const localPasswordAuthPubKey = this.state.envelope
      ? base64ToBytes(this.state.envelope.passwordAuthPubKey)
      : vaultKeySet.authKeyPair.pk;
    const isInSync =
      pubKeysEqual(authPubKey, localPasswordAuthPubKey) &&
      (controlRecords.length === 0
        ? pubKeysEqual(authPubKey, vaultKeySet.authKeyPair.pk)
        : selectControlRecord(controlRecords, authPubKey) !== undefined);
    if (!isInSync) {
      throw new Error(
        SeedlessOnboardingControllerErrorMessage.OutdatedPassword,
      );
    }
    return { authPubKey, keyIndex, controlRecords };
  }

  /**
   * Under the vault's metadata lock, re-check the live password OPRF key and
   * write the first control record, which commits the migration, unless the
   * vault already has one, e.g. from another device holding the same `K_v`.
   *
   * @param vaultKeySet - The vault key set `K_v`.
   * @returns The live password OPRF auth public key.
   * @throws `OutdatedPassword` if the live password key is not in sync, or
   * `EnvelopeControlRecordNotFound` if no control record matches it.
   */
  async #writeEnvelopeMigrationControlRecord(
    vaultKeySet: VaultKeySet,
  ): Promise<SEC1EncodedPublicKey> {
    return await this.#withMetadataLock(
      vaultKeySet.authKeyPair,
      async (lockId) => {
        const { authPubKey, keyIndex, controlRecords } =
          await this.#fetchEnvelopeMigrationPasswordKey(vaultKeySet);
        let records = controlRecords;
        if (records.length === 0) {
          this.#assertIsAuthenticatedUser(this.state);
          const { authConnectionId, groupedAuthConnectionId, userId } =
            this.state;
          await this.#envelopeStore.writeControlRecord(
            vaultKeySet,
            {
              v: 1,
              seq: 1,
              passwordNamespace: {
                verifier: groupedAuthConnectionId ?? authConnectionId,
                verifierId: userId,
                authSk: bigIntToHex(vaultKeySet.authKeyPair.sk),
                keyIndex,
              },
              migratedAt: Date.now(),
            },
            lockId,
          );
          records = await this.#envelopeStore.fetchControlRecords(vaultKeySet);
        }
        if (!selectControlRecord(records, authPubKey)) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.EnvelopeControlRecordNotFound,
          );
        }
        return authPubKey;
      },
    );
  }

  /**
   * Report an envelope migration phase. Reporting never fails the migration.
   *
   * @param phase - The phase.
   * @param partial - Whether the recovery verifier already held a Recovery
   * Secret OPRF key when the attempt started.
   */
  #trackEnvelopeMigrationCheckpoint(
    phase: 'STARTED' | 'COMPLETED',
    partial: boolean,
  ): void {
    const logError = (error: unknown): void => {
      log('Error tracking envelope migration checkpoint', error);
    };
    try {
      // handlers may return a promise despite the action's void type
      Promise.resolve(
        this.messenger.call('AnalyticsController:trackEvent', {
          name: SeedlessEnvelopeMigrationCheckpointEventName,
          properties: { phase, partial },
          sensitiveProperties: {},
          saveDataRecording: false,
          hasProperties: true,
        }),
      ).catch(logError);
    } catch (error) {
      logError(error);
    }
  }

  /**
   * Register the Recovery Secret OPRF key on the recovery verifier.
   *
   * A failed registration still goes on when the recovery verifier holds a
   * key afterwards, e.g. when only the response was lost. That key may not
   * be this one, so the caller must check it against the Recovery Secret.
   *
   * @param oprfKey - The Recovery Secret OPRF key.
   * @param authPubKey - The auth public key of the OPRF key.
   * @returns Whether the recovery verifier confirmed this key, rather than
   * only holding a key after a failed registration.
   * @throws The registration error if the recovery verifier holds no key, or
   * `Aal2Required` without a valid aal2 session.
   */
  async #registerRecoverySecretKey(
    oprfKey: bigint,
    authPubKey: SEC1EncodedPublicKey,
  ): Promise<boolean> {
    let isConfirmed = true;
    try {
      await this.#recoverySession.withSession(async (session) =>
        this.toprfClient.persistLocalKey({ ...session, oprfKey, authPubKey }),
      );
    } catch (error) {
      if (!(await this.#fetchRecoveryAuthPubKey().catch(() => undefined))) {
        throw error;
      }
      isConfirmed = false;
    }
    this.#recoverySession.markRecoveryShareExists();
    return isConfirmed;
  }

  /**
   * Make sure the newest `rbek` of the registered Recovery Secret OPRF key
   * holds `K_v`, sealing it again if not.
   *
   * @param recoverySecret - The Recovery Secret.
   * @param vaultKeySet - The vault key set `K_v`.
   * @throws `RecoveryKeyShareConflict` if the registered key belongs to a
   * different Recovery Secret, or `InvalidEnvelope` if the new `rbek` does
   * not read back.
   */
  async #resealRecoveryEnvelope(
    recoverySecret: Uint8Array,
    vaultKeySet: VaultKeySet,
  ): Promise<void> {
    const { envelopeKeys } = await this.#recoverRecoverySecretEnvelopeKeys(
      bytesToHex(recoverySecret),
    );
    this.#recoverySession.markRecoveryShareExists();
    let sealed: VaultKeySet | undefined;
    try {
      sealed = await this.#openNewestEnvelope(envelopeKeys, 'recovery-secret');
    } catch (error) {
      if (
        !(error instanceof SeedlessOnboardingError) ||
        error.message !==
          SeedlessOnboardingControllerErrorMessage.InvalidEnvelope
      ) {
        throw error;
      }
    }
    if (
      sealed &&
      pubKeysEqual(sealed.authKeyPair.pk, vaultKeySet.authKeyPair.pk)
    ) {
      return;
    }
    await this.#writeAndVerifyEnvelope(
      packFor(envelopeKeys, 'recovery-secret', vaultKeySet),
    );
  }

  /**
   * Seal `K_v` for the Recovery Secret under a fresh OPRF key, then register
   * the key. If another key got registered instead, seal `K_v` under that one.
   *
   * @param recoverySecret - The Recovery Secret.
   * @param vaultKeySet - The vault key set `K_v`.
   * @throws `InvalidEnvelope` if the new `rbek` does not read back, the
   * registration error if the recovery verifier holds no key afterwards, or
   * `RecoveryKeyShareConflict` if it holds another Recovery Secret's key.
   */
  async #sealAndRegisterRecoveryEnvelope(
    recoverySecret: Uint8Array,
    vaultKeySet: VaultKeySet,
  ): Promise<void> {
    const { oprfKey, seed, envelopeKeys, authKeyPair } =
      await this.toprfClient.createLocalKey({
        password: bytesToHex(recoverySecret),
      });
    // the controller only needs the envelope keys, so the seed is not kept
    seed.fill(0);
    await this.#writeAndVerifyEnvelope(
      packFor(envelopeKeys, 'recovery-secret', vaultKeySet),
    );
    if (!(await this.#registerRecoverySecretKey(oprfKey, authKeyPair.pk))) {
      await this.#resealRecoveryEnvelope(recoverySecret, vaultKeySet);
    }
  }

  /**
   * Derive the envelope keys of the Recovery Secret with the Recovery Secret
   * OPRF key the nodes already hold.
   *
   * @param recoverySecretHex - The hex encoded Recovery Secret.
   * @returns The envelope keys and the auth key pair of the Recovery Secret.
   * @throws `RecoveryKeyShareConflict` if the registered key belongs to a
   * different Recovery Secret.
   */
  async #recoverRecoverySecretEnvelopeKeys(
    recoverySecretHex: string,
  ): Promise<{ envelopeKeys: EnvelopeKeys; authKeyPair: KeyPair }> {
    const { envelopeKeys, authKeyPair, rateLimitResetResult } =
      await this.#recoverySession.withSession(async (session) =>
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
    return { envelopeKeys, authKeyPair };
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
        return unpackEnvelope(envelope, path);
      } catch (error) {
        log('Ignoring envelope that does not open', error);
      }
    }
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
    );
  }

  /**
   * Open every valid envelope of a partition's envelope keys, newest first,
   * deduplicated by vault auth public key.
   *
   * @param keys - The envelope keys of the partition.
   * @param path - The path of the envelopes to open.
   * @returns The unique vault key sets, newest first, or an empty array when
   * the partition holds no envelope of the path.
   * @throws If the envelopes cannot be fetched, or `InvalidEnvelope` if none
   * opens.
   */
  async #openAllEnvelopes(
    keys: EnvelopeKeys,
    path: Envelope['path'],
  ): Promise<VaultKeySet[]> {
    const envelopes = await this.#envelopeStore.fetchEnvelopes(keys, path);
    if (envelopes.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const vaultKeySets: VaultKeySet[] = [];
    for (const envelope of envelopes) {
      try {
        const vaultKeySet = unpackEnvelope(envelope, path);
        const keyId = bytesToHex(vaultKeySet.authKeyPair.pk);
        if (!seen.has(keyId)) {
          seen.add(keyId);
          vaultKeySets.push(vaultKeySet);
        }
      } catch (error) {
        log('Ignoring envelope that does not open', error);
      }
    }
    if (vaultKeySets.length === 0) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
      );
    }
    return vaultKeySets;
  }

  /**
   * Find the first candidate vault key set whose partition holds committed
   * control records. Skips uncommitted partitions (no control records,
   * including partitions emptied by a legacy password change) while
   * propagating real fetch errors.
   *
   * @param candidates - Candidate vault key sets, newest first.
   * @returns The committed vault key set, its secrets, and its control
   * records, or undefined if no candidate is committed.
   * @throws `NoSecretDataFound` if a committed candidate partition holds no
   * secret items and no other committed candidate has secrets, or any metadata
   * fetch error.
   */
  async #findCommittedRecoveryVault(candidates: VaultKeySet[]): Promise<
    | {
        vaultKeySet: VaultKeySet;
        secrets: SecretMetadata[];
        controlRecords: ControlRecord[];
      }
    | undefined
  > {
    let noSecretDataError: Error | undefined;
    for (const vaultKeySet of candidates) {
      const { secretItems, controlRecords } =
        await this.#envelopeStore.fetchVaultItems(vaultKeySet);
      // the migration that sealed these keys is not committed yet
      if (controlRecords.length === 0) {
        continue;
      }
      if (secretItems.length === 0) {
        noSecretDataError ??= new Error(
          SeedlessOnboardingControllerErrorMessage.NoSecretDataFound,
        );
        continue;
      }
      return {
        vaultKeySet,
        secrets: parseAndValidateSecretMetadataBackup(secretItems),
        controlRecords,
      };
    }
    if (noSecretDataError) {
      throw noSecretDataError;
    }
    return undefined;
  }

  /**
   * Write an envelope, then read it back and check that it unpacks (I1).
   *
   * @param packed - The envelope and its partition keys.
   * @throws `InvalidEnvelope` if the envelope does not read back.
   */
  async #writeAndVerifyEnvelope(packed: PackedEnvelope): Promise<void> {
    const { keys, envelope } = packed;
    await this.#envelopeStore.writeEnvelope(keys, envelope);
    const stored = (
      await this.#envelopeStore.fetchEnvelopes(keys, envelope.path)
    ).find(
      (item) =>
        item.authSk === envelope.authSk &&
        item.encKey === envelope.encKey &&
        item.localWrapKey === envelope.localWrapKey,
    );
    if (!stored) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.InvalidEnvelope,
      );
    }
    unpackEnvelope(stored, envelope.path);
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
   * @param callback - The callback, given the lock id to pass to batch
   * writes, which would otherwise try to acquire the lock again.
   * @returns The callback result.
   */
  async #withMetadataLock<Result>(
    authKeyPair: KeyPair,
    callback: (lockId: string) => Promise<Result>,
  ): Promise<Result> {
    const lockId = await this.toprfClient.acquireMetadataLock(authKeyPair);
    try {
      return await callback(lockId);
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
   * password is synced with.
   */
  #setEnvelopeState(
    vaultKeySet: VaultKeySet,
    passwordAuthPubKey: SEC1EncodedPublicKey,
  ): void {
    this.update((state) => {
      state.envelope = createEnvelopeState(vaultKeySet, passwordAuthPubKey);
    });
  }

  /**
   * Rotate the refresh token — fetch a new refresh/revoke token pair from the
   * auth service and persist the new revoke token in the vault.
   *
   * This method should be called after a successful JWT refresh.
   *
   * When `idTokens` are provided, their `sub` claim is checked against
   * `state.userId` before the renewal request. A mismatch throws
   * {@link SeedlessOnboardingControllerErrorMessage.IdentityMismatch} and the
   * vault revoke token is not renewed.
   *
   * @param idTokens - Id tokens from the JWT refresh. Only the first token is
   * validated. Omit when the caller has no id token to check.
   * @returns A Promise that resolves to void.
   */
  async rotateRefreshToken(idTokens?: string[]): Promise<void> {
    const sessionGeneration = this.#sessionGeneration;
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
    const { refreshToken, userId, authConnectionId } = this.state;

    // Fail before renewing the vault revoke token. A mismatched, missing, or
    // corrupted id token must not refresh another identity's credentials.
    if (idTokens) {
      this.#assertIdTokenMismatchAndTrackEvent(
        idTokens,
        userId,
        SeedlessIdentityMismatchSource.RotateRefreshToken,
      );
    }

    const { revokeToken } = vaultData;
    const { newRevokeToken, newRefreshToken } = await this.#renewRefreshToken({
      connection: this.state.authConnection,
      revokeToken,
    });

    const assertRotationIdentityUnchanged = (): void => {
      // The identity may have changed while the renewal or vault write was in
      // flight. Check before persisting so the vault and state do not keep the
      // previous identity's revoke token.
      this.#assertIdentityUnchangedAndTrackEvent(
        {
          userId: this.state.userId,
          authConnectionId: this.state.authConnectionId,
        },
        { userId, authConnectionId },
        SeedlessIdentityMismatchSource.RotateRefreshToken,
      );
    };

    assertRotationIdentityUnchanged();
    this.#assertSessionGeneration(sessionGeneration);

    if (newRevokeToken && newRefreshToken) {
      // The renewal can take a while, and the vault may have been rewritten in
      // the meantime (for example by a password change). Read the latest vault
      // data and write it back under the vault lock, otherwise the old TOPRF
      // keys could be written back.
      // Persist the new revoke token to the vault and update state atomically
      // after vault encryption succeeds, so state and vault stay in sync if
      // the write fails, the identity changes, or the session is cleared in
      // flight.
      await this.#withVaultLock(async () => {
        const latestVaultData = this.#cachedDecryptedVaultData;
        if (!this.#isUnlocked || !latestVaultData) {
          throw new SeedlessOnboardingError(
            SeedlessOnboardingControllerErrorMessage.VaultLocked,
          );
        }

        await this.#updateVault({
          vaultData: {
            ...latestVaultData,
            revokeToken: newRevokeToken,
          },
          pwEncKey: latestVaultData.toprfPwEncryptionKey,
          sessionGeneration,
          assertBeforeWrite: assertRotationIdentityUnchanged,
          skipLock: true,
          onStateUpdate: (state) => {
            state.revokeToken = newRevokeToken;
            state.refreshToken = newRefreshToken;
            state.pendingToBeRevokedTokens = [
              ...(state.pendingToBeRevokedTokens ?? []),
              { refreshToken, revokeToken },
            ];
          },
        });
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

  /**
   * Assert the id token belongs to `userId` and report a mismatch.
   *
   * @param idTokens - Id tokens to check. Only the first is validated.
   * @param userId - The user id the token should belong to.
   * @param source - The flow that is checking the token.
   */
  #assertIdTokenMismatchAndTrackEvent(
    idTokens: string[],
    userId: string | null | undefined,
    source: SeedlessIdentityMismatchSource,
  ): asserts userId is string {
    assertIdTokenMismatchAndTrackEvent(
      idTokens,
      userId,
      source,
      (event) => this.messenger.call('AnalyticsController:trackEvent', event),
      this.state.migrationVersion,
    );
  }

  /**
   * Assert the controller identity is unchanged and report a mismatch.
   *
   * @param currentState - Identity fields from the current controller state.
   * @param expectedIdentity - Identity fields captured before the request.
   * @param source - The flow that is checking the identity.
   */
  #assertIdentityUnchangedAndTrackEvent(
    currentState: {
      userId?: string;
      authConnectionId?: string;
    },
    expectedIdentity: {
      userId?: string;
      authConnectionId?: string;
    },
    source: SeedlessIdentityMismatchSource,
  ): void {
    assertIdentityUnchangedAndTrackEvent({
      currentState,
      expectedIdentity,
      source,
      trackEvent: (event) =>
        this.messenger.call('AnalyticsController:trackEvent', event),
      migrationVersion: this.state.migrationVersion,
    });
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
