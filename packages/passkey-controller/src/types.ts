import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
} from '@metamask/base-controller';
import type {
  KeyringControllerChangePasswordAction,
  KeyringControllerExportAccountAction,
  KeyringControllerExportEncryptionKeyAction,
  KeyringControllerExportSeedPhraseAction,
  KeyringControllerSubmitEncryptionKeyAction,
  KeyringControllerVerifyPasswordAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import { controllerName } from './constants';
import type { PasskeyControllerMethodActions } from './PasskeyController-method-action-types';

export type Base64String = string;

export type Base64URLString = string;

export type AuthenticatorTransportFuture =
  | 'ble'
  | 'cable'
  | 'hybrid'
  | 'internal'
  | 'nfc'
  | 'smart-card'
  | 'usb';

/**
 * WebAuthn credential metadata used to identify the passkey and verify
 * subsequent assertions.
 */
export type PasskeyCredentialInfo = {
  /** WebAuthn credential ID (base64url). */
  id: Base64URLString;
  /** COSE-encoded credential public key (base64url) used to verify assertions. */
  publicKey: Base64URLString;
  /** Authenticator signature counter for replay/clone detection. */
  counter: number;
  /** Authenticator transports hint for `allowCredentials`. */
  transports?: AuthenticatorTransportFuture[];
  /** Authenticator AAGUID captured from attested credential data at registration. */
  aaguid: string;
};

/**
 * Vault key wrapped under the passkey-derived AES-256-GCM key.
 */
export type EncryptedVaultKey = {
  /** Base64-encoded AES-256-GCM ciphertext of the vault key. */
  ciphertext: Base64String;
  /** Base64-encoded AES-GCM IV used during encryption. */
  iv: Base64String;
};

/**
 * Parameters needed to reproduce the AES-256 wrapping key at unlock time.
 *
 * Encoded as a discriminated union so PRF-only fields (e.g. `prfSalt`) can
 * only exist on the PRF branch, removing the "optional but actually
 * required" footgun.
 */
export type PasskeyKeyDerivation =
  | {
      method: 'prf';
      /**
       * PRF salt sent in `get()` extension options to reproduce the same PRF
       * output that was generated at registration.
       */
      prfSalt: Base64URLString;
    }
  | { method: 'userHandle' };

/** Discriminator value for {@link PasskeyKeyDerivation}. */
export type PasskeyDerivationMethod = PasskeyKeyDerivation['method'];

export type PasskeyRecord = {
  /** WebAuthn credential metadata used for assertion verification & re-discovery. */
  credential: PasskeyCredentialInfo;
  /** Vault key wrapped under the passkey-derived key. */
  encryptedVaultKey: EncryptedVaultKey;
  /** How the wrapping key is reconstructed at unlock time. */
  keyDerivation: PasskeyKeyDerivation;
};

/**
 * In-memory state for one **in-flight** WebAuthn **registration** ceremony
 * (from `create()` options until `protectVaultKeyWithPasskey` completes). This is
 * not a user login session; it is keyed by challenge and distinct from the full
 * spec ceremony (which includes the authenticator round-trip).
 */
export type PasskeyRegistrationCeremony = {
  userHandle: Base64URLString;
  prfSalt?: Base64URLString;
  challenge: Base64URLString;
  /** When this ceremony was started (ms since epoch); used for TTL pruning. */
  createdAt: number;
};

/**
 * In-memory state for one **in-flight** WebAuthn **authentication** ceremony
 * (`get()` options until the assertion is verified). Not a user login session.
 */
export type PasskeyAuthenticationCeremony = {
  challenge: Base64URLString;
  /** When this ceremony was started (ms since epoch); used for TTL pruning. */
  createdAt: number;
};

/**
 * PRF extension types not covered by DOM typings.
 */
export type PrfEvalExtension = {
  eval: {
    first: Base64URLString;
  };
};

export type PrfClientExtensionResults = {
  prf?: {
    enabled?: boolean;
    results?: { first?: Base64URLString };
  };
};

export type PasskeyControllerState = {
  passkeyRecord: PasskeyRecord | null;
};

export type PasskeyControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PasskeyControllerState
>;

/**
 * KeyringController actions that {@link PasskeyController} may call during
 * orchestrated passkey flows. The restricted messenger must allow these at init.
 */
export type PasskeyControllerAllowedActions =
  | KeyringControllerVerifyPasswordAction
  | KeyringControllerExportEncryptionKeyAction
  | KeyringControllerSubmitEncryptionKeyAction
  | KeyringControllerChangePasswordAction
  | KeyringControllerExportSeedPhraseAction
  | KeyringControllerExportAccountAction;

/**
 * Actions exposed by {@link PasskeyController} on its messenger, including
 * `:getState`, enrollment/unlock ceremony methods, and lifecycle helpers.
 */
export type PasskeyControllerActions =
  | PasskeyControllerGetStateAction
  | PasskeyControllerMethodActions;

export type PasskeyControllerStateChangedEvent = ControllerStateChangedEvent<
  typeof controllerName,
  PasskeyControllerState
>;

export type PasskeyControllerEvents = PasskeyControllerStateChangedEvent;

export type PasskeyControllerMessenger = Messenger<
  typeof controllerName,
  PasskeyControllerActions | PasskeyControllerAllowedActions,
  PasskeyControllerEvents
>;

export type PasskeyControllerOptions = {
  messenger: PasskeyControllerMessenger;
  state?: Partial<PasskeyControllerState>;
  rpId?: string;
  expectedRPID: string | string[];
  rpName: string;
  expectedOrigin: string | string[];
  userName?: string;
  userDisplayName?: string;
  /**
   * Returns whether wallet onboarding is complete. When `true`, enrollment
   * requires password step-up. The integrator typically supplies
   * `() => onboardingController.state.completedOnboarding`.
   */
  getIsOnboardingCompleted: () => boolean;
};
