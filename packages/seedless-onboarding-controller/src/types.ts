import type { RestrictedMessenger } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { NodeAuthTokens } from '@metamask/toprf-secure-backup';
import type { Json } from '@metamask/utils';
import type { MutexInterface } from 'async-mutex';

import type { controllerName, Web3AuthNetwork } from './constants';

// State
export type SeedlessOnboardingControllerState = {
  /**
   * Encrypted array of serialized keyrings data.
   */
  vault?: string;

  /**
   * The node auth tokens from OAuth User authentication after the Social login.
   *
   * This values are used to authenticate users when they go through the Seedless Onboarding flow.
   */
  nodeAuthTokens?: NodeAuthTokens;

  /**
   * The hashes of the seed phrase backups.
   *
   * This is to facilitate the UI to display backup status of the seed phrases.
   */
  backupHashes: string[];
};

// Actions
export type SeedlessOnboardingControllerGetStateActions =
  ControllerGetStateAction<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;
export type SeedlessOnboardingControllerActions =
  SeedlessOnboardingControllerGetStateActions;

// Events
export type SeedlessOnboardingControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;
export type SeedlessOnboardingControllerEvents =
  SeedlessOnboardingControllerStateChangeEvent;

// Messenger
export type SeedlessOnboardingControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  SeedlessOnboardingControllerActions,
  SeedlessOnboardingControllerEvents,
  SeedlessOnboardingControllerActions['type'],
  SeedlessOnboardingControllerEvents['type']
>;

/**
 * @description Encryptor interface for encrypting and decrypting seedless onboarding vault.
 */
export type Encryptor = {
  /**
   * Encrypts the given object with the given password.
   *
   * @param password - The password to encrypt with.
   * @param object - The object to encrypt.
   * @returns The encrypted string.
   */
  encrypt: (password: string, object: Json) => Promise<string>;
  /**
   * Decrypts the given encrypted string with the given password.
   *
   * @param password - The password to decrypt with.
   * @param encryptedString - The encrypted string to decrypt.
   * @returns The decrypted object.
   */
  decrypt: (password: string, encryptedString: string) => Promise<unknown>;
};

/**
 * Seedless Onboarding Controller Options.
 *
 * @param messenger - The messenger to use for this controller.
 * @param state - The initial state to set on this controller.
 * @param encryptor - The encryptor to use for encrypting and decrypting seedless onboarding vault.
 */
export type SeedlessOnboardingControllerOptions = {
  messenger: SeedlessOnboardingControllerMessenger;

  /**
   * @description Initial state to set on this controller.
   */
  state?: SeedlessOnboardingControllerState;

  /**
   * @description Encryptor to use for encrypting and decrypting seedless onboarding vault.
   * @default browser-passworder @link https://github.com/MetaMask/browser-passworder
   */
  encryptor?: Encryptor;

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
 * @description The structure of the data which is serialized and stored in the vault.
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
