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

export type SocialBackupsMetadata = {
  id: string;
  hash: string;
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
};

export type SRPBackedUpUserDetails = {
  /**
   * The public key of the authentication key pair in base64 format.
   *
   * This value is used to check if the password is outdated compare to the global password and find backed up old password.
   */
  authPubKey: string;
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
   * Type of Web3Auth network to be used for the Seedless Onboarding flow.
   *
   * @default Web3AuthNetwork.Mainnet
   */
  network?: Web3AuthNetwork;
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
   * The authentication key pair to authenticate the TOPRF.
   */
  toprfAuthKeyPair: string;
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
