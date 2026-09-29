import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type * as encryptionUtils from '@metamask/browser-passworder';
import type {
  DefaultEncryptionResult,
  EncryptionResultConstraint,
  Encryptor,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import { controllerName } from './constants.js';
import type { Web3AuthNetwork } from './constants.js';
import type { SeedlessOnboardingControllerMethodActions } from './SeedlessOnboardingController-method-action-types.js';
import type {
  RefreshJWTToken,
  RevokeRefreshToken,
  RenewRefreshToken,
  SeedlessOnboardingControllerState,
  ToprfKeyDeriver,
} from './types.js';

// Actions
export type SeedlessOnboardingControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;

export type SeedlessOnboardingControllerActions =
  | SeedlessOnboardingControllerGetStateAction
  | SeedlessOnboardingControllerMethodActions;

type AllowedActions = never;

// Events
export type SeedlessOnboardingControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SeedlessOnboardingControllerState
  >;
export type SeedlessOnboardingControllerEvents =
  SeedlessOnboardingControllerStateChangeEvent;

type AllowedEvents = never;

// Messenger
export type SeedlessOnboardingControllerMessenger = Messenger<
  typeof controllerName,
  SeedlessOnboardingControllerActions | AllowedActions,
  SeedlessOnboardingControllerEvents | AllowedEvents
>;

/**
 * Seedless Onboarding Controller Options.
 *
 * @param messenger - The messenger to use for the Seedless Onboarding Controller.
 * @param state - The initial state to set on the Seedless Onboarding Controller.
 * @param encryptor - The encryptor to use for encrypting and decrypting the Seedless Onboarding vault.
 */
export type SeedlessOnboardingControllerOptions<
  EncryptionKey = encryptionUtils.EncryptionKey,
  SupportedKeyDerivationParams = encryptionUtils.KeyDerivationOptions,
  EncryptionResult extends
    EncryptionResultConstraint<SupportedKeyDerivationParams> =
    DefaultEncryptionResult<SupportedKeyDerivationParams>,
> = {
  messenger: SeedlessOnboardingControllerMessenger;

  /**
   * Initial state to set on the Seedless Onboarding Controller.
   */
  state?: Partial<SeedlessOnboardingControllerState>;

  /**
   * Encryptor to use for encrypting and decrypting the Seedless Onboarding vault.
   *
   * @default browser-passworder @link https://github.com/MetaMask/browser-passworder
   */
  encryptor: Encryptor<
    EncryptionKey,
    SupportedKeyDerivationParams,
    EncryptionResult
  >;

  /**
   * A function to get a new JWT token using a refresh token.
   */
  refreshJWTToken: RefreshJWTToken;

  /**
   * A function to revoke a refresh token.
   */
  revokeRefreshToken: RevokeRefreshToken;

  /**
   * A function to renew a refresh token and get a new revoke token.
   */
  renewRefreshToken: RenewRefreshToken;

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
