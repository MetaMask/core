import type { RestrictedMessenger } from '@metamask/base-controller';
import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

import type { controllerName } from './constants';

// State
export type SeedlessOnboardingControllerState = {
  /**
   * Encrypted array of serialized keyrings data.
   */
  vault?: string;
  /**
   * Indicates whether the user has already fully/partially completed the Seedless Onboarding flow.
   *
   * An encryption key is generated from user entered password using Threshold OPRF and the seed phrase is encrypted with the key.
   * During the Seedless Onboarding Authentication step, TOPRF services check whether user has already generated the encryption key.
   *
   * If this value is `true`, we can assume that user already has completed the `SeedPhrase` generation step, and user will have to
   * fetch the `SeedPhrase` with correct password. Otherwise, users will be asked to set up seedphrase and password, first.
   */
  isNewUser?: boolean;
};

// Actions
export type SeedlessOnboardingControllerGetStateActions =
  ControllerGetStateAction<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;
export type AllowedActions = SeedlessOnboardingControllerGetStateActions;

// Events
export type SeedlessOnboardingControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;
export type AllowedEvents = SeedlessOnboardingControllerStateChangeEvent;

// Messenger
export type SeedlessOnboardingControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AllowedActions,
  AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
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
};
