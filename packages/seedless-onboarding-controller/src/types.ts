import type { RestrictedMessenger } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type {
  ExportableKeyEncryptor,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { NodeAuthTokens } from '@metamask/toprf-secure-backup';
import type { MutexInterface } from 'async-mutex';

import type {
  AuthConnection,
  controllerName,
  SecretMetadataVersion,
  SecretType,
  Web3AuthNetwork,
} from './constants';

/**
 * The backup state of the secret data.
 * Each secret data added/restored will be stored in the state locally.
 *
 * This is used to track the backup status of the secret data.
 */
export type SocialBackupsMetadata = {
  /**
   * The hash of the secret data.
   */
  hash: string;

  /**
   * The type of the secret data.
   */
  type: SecretType;

  /**
   * The optional keyringId to identify the keyring that the secret data belongs to.
   *
   * This is only required for `Mnemonic` secret data.
   */
  keyringId?: string;
};

export type AuthenticatedUserDetails = {
  /**
   * Type of social login provider.
   */
  authConnection: AuthConnection;

  /**
   * The node auth tokens from OAuth User authentication after the Social login.
   *
   * This values are used to authenticate users when they go through the Seedless Onboarding flow.
   */
  nodeAuthTokens: NodeAuthTokens;

  /**
   * OAuth connection id from web3auth dashboard.
   */
  authConnectionId: string;

  /**
   * The optional grouped authConnectionId to authenticate the user with Web3Auth network.
   */
  groupedAuthConnectionId?: string;

  /**
   * The user email or ID from Social login.
   */
  userId: string;

  /**
   * The user email from Social login.
   */
  socialLoginEmail: string;

  /**
   * The refresh token used to refresh expired nodeAuthTokens.
   */
  refreshToken: string;
};

export type SRPBackedUpUserDetails = {
  /**
   * The public key of the authentication key pair in base64 format.
   *
   * This value is used to check if the password is outdated compare to the global password and find backed up old password.
   */
  authPubKey: string;
};

/**
 * The data of the recovery error.
 */
export type RecoveryErrorData = {
  /**
   * The remaining time in seconds before the user can try again.
   */
  remainingTime: number;

  /**
   * The number of attempts made by the user.
   */
  numberOfAttempts: number;
};

// State
export type SeedlessOnboardingControllerState =
  Partial<AuthenticatedUserDetails> &
    Partial<SRPBackedUpUserDetails> & {
      /**
       * Encrypted array of serialized keyrings data.
       */
      vault?: string;

      /**
       * The hashes of the seed phrase backups.
       *
       * This is to facilitate the UI to display backup status of the seed phrases.
       */
      socialBackupsMetadata: SocialBackupsMetadata[];

      /**
       * The encryption key derived from the password and used to encrypt
       * the vault.
       */
      vaultEncryptionKey?: string;

      /**
       * The salt used to derive the encryption key from the password.
       */
      vaultEncryptionSalt?: string;

      /**
       * Cache for checkIsPasswordOutdated result and timestamp.
       */
      passwordOutdatedCache?: { isExpiredPwd: boolean; timestamp: number };

      /**
       * The refresh token used to refresh expired nodeAuthTokens.
       * This is persisted in state.
       */
      refreshToken?: string;

      /**
       * The revoke token used to revoke refresh token and get new refresh token and new revoke token.
       * This is temporarily stored in state during authentication and then persisted in the vault.
       */
      revokeToken?: string;

      /**
       * The encrypted seedless encryption key used to encrypt the seedless vault.
       */
      encryptedSeedlessEncryptionKey?: string;

      /**
       * The encrypted keyring encryption key used to encrypt the keyring vault.
       */
      encryptedKeyringEncryptionKey?: string;

      /**
       * The access token used for pairing with profile sync auth service and to access other services.
       */
      accessToken?: string;

      /**
       * The metadata access token used to access the metadata service.
       *
       * This token is used to access the metadata service before the vault is created or unlocked.
       */
      metadataAccessToken?: string;
    };

// Actions
export type SeedlessOnboardingControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;
export type SeedlessOnboardingControllerActions =
  SeedlessOnboardingControllerGetStateAction;

export type AllowedActions = never;

// Events
export type SeedlessOnboardingControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;
export type SeedlessOnboardingControllerEvents =
  SeedlessOnboardingControllerStateChangeEvent;

export type AllowedEvents =
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

// Messenger
export type SeedlessOnboardingControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  SeedlessOnboardingControllerActions | AllowedActions,
  SeedlessOnboardingControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Encryptor interface for encrypting and decrypting seedless onboarding vault.
 */
export type VaultEncryptor<EncryptionKey> = Omit<
  ExportableKeyEncryptor<EncryptionKey>,
  'encryptWithKey'
>;

/**
 * Additional key deriver for the TOPRF client.
 *
 * This is a function that takes a seed and salt and returns a key in bytes (Uint8Array).
 * It is used as an additional step during key derivation. This can be used, for example, to inject a slow key
 * derivation step to protect against local brute force attacks on the password.
 *
 * @default browser-passworder @link https://github.com/MetaMask/browser-passworder
 */
export type ToprfKeyDeriver = {
  /**
   * Derive a key from a seed and salt.
   *
   * @param seed - The seed to derive the key from.
   * @param salt - The salt to derive the key from.
   * @returns The derived key.
   */
  deriveKey: (seed: Uint8Array, salt: Uint8Array) => Promise<Uint8Array>;
};

export type RefreshJWTToken = (params: {
  connection: AuthConnection;
  refreshToken: string;
}) => Promise<{
  idTokens: string[];
  accessToken: string;
  metadataAccessToken: string;
}>;

export type RevokeRefreshToken = (params: {
  connection: AuthConnection;
  revokeToken: string;
}) => Promise<{ newRevokeToken: string; newRefreshToken: string }>;

/**
 * Seedless Onboarding Controller Options.
 *
 * @param messenger - The messenger to use for this controller.
 * @param state - The initial state to set on this controller.
 * @param encryptor - The encryptor to use for encrypting and decrypting seedless onboarding vault.
 */
export type SeedlessOnboardingControllerOptions<EncryptionKey> = {
  messenger: SeedlessOnboardingControllerMessenger;

  /**
   * Initial state to set on this controller.
   */
  state?: Partial<SeedlessOnboardingControllerState>;

  /**
   * Encryptor to use for encrypting and decrypting seedless onboarding vault.
   *
   * @default browser-passworder @link https://github.com/MetaMask/browser-passworder
   */
  encryptor: VaultEncryptor<EncryptionKey>;

  /**
   * A function to get a new jwt token using refresh token.
   */
  refreshJWTToken: RefreshJWTToken;

  /**
   * A function to revoke the refresh token.
   * And get new refresh token and revoke token.
   */
  revokeRefreshToken: RevokeRefreshToken;

  /**
   * Optional key derivation interface for the TOPRF client.
   *
   * If provided, it will be used as an additional step during
   * key derivation. This can be used, for example, to inject a slow key
   * derivation step to protect against local brute force attacks on the
   * password.
   *
   * @default browser-passworder @link https://github.com/MetaMask/browser-passworder
   */
  toprfKeyDeriver?: ToprfKeyDeriver;

  /**
   * Type of Web3Auth network to be used for the Seedless Onboarding flow.
   *
   * @default Web3AuthNetwork.Mainnet
   */
  network?: Web3AuthNetwork;

  /**
   * The TTL of the password outdated cache in milliseconds.
   *
   * @default PASSWORD_OUTDATED_CACHE_TTL_MS
   */
  passwordOutdatedCacheTTL?: number;
};

/**
 * A function executed within a mutually exclusive lock, with
 * a mutex releaser in its option bag.
 *
 * @param releaseLock - A function to release the lock.
 */
export type MutuallyExclusiveCallback<Result> = ({
  releaseLock,
}: {
  releaseLock: MutexInterface.Releaser;
}) => Promise<Result>;

/**
 * The structure of the data which is serialized and stored in the vault.
 */
export type VaultData = {
  /**
   * The node auth tokens from OAuth User authentication after the Social login.
   */
  authTokens: NodeAuthTokens;
  /**
   * The encryption key to encrypt the seed phrase.
   */
  toprfEncryptionKey: string;
  /**
   * The encryption key to encrypt the password.
   */
  toprfPwEncryptionKey: string;
  /**
   * The authentication key pair to authenticate the TOPRF.
   */
  toprfAuthKeyPair: string;
  /**
   * The revoke token to revoke refresh token and get new refresh token and new revoke token.
   * The revoke token may no longer be available after a large number of password changes. In this case, re-authentication is advised.
   */
  revokeToken?: string;
  /**
   * The access token used for pairing with profile sync auth service and to access other services.
   */
  accessToken: string;
};

export type SecretDataType = Uint8Array | string | number;

/**
 * The constructor options for the seed phrase metadata.
 */
export type SecretMetadataOptions = {
  /**
   * The timestamp when the seed phrase was created.
   */
  timestamp: number;
  /**
   * The type of the seed phrase.
   */
  type: SecretType;
  /**
   * The version of the seed phrase metadata.
   */
  version: SecretMetadataVersion;
};

export type DecodedNodeAuthToken = {
  /**
   * The expiration time of the token in seconds.
   */
  exp: number;
  temp_key_x: string;
  temp_key_y: string;
  aud: string;
  verifier_name: string;
  verifier_id: string;
  scope: string;
  signature: string;
};

export type DecodedBaseJWTToken = {
  /**
   * The expiration time of the token in seconds.
   */
  exp: number;
  /**
   * The issued at time of the token in seconds.
   */
  iat: number;
  /**
   * The audience of the token.
   */
  aud: string;
  /**
   * The issuer of the token.
   */
  iss: string;
  /**
   * The subject of the token.
   */
  sub: string;
};
