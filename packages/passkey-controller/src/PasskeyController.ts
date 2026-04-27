import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { areUint8ArraysEqual, stringToBytes } from '@metamask/utils';
import { randomBytes } from '@noble/ciphers/webcrypto';

import { WEBAUTHN_TIMEOUT_MS, CeremonyManager } from './ceremony-manager';
import {
  controllerName,
  PasskeyControllerErrorCode,
  PasskeyControllerErrorMessage,
} from './constants';
import { PasskeyControllerError } from './errors';
import {
  deriveKeyFromAuthenticationResponse,
  deriveKeyFromRegistrationResponse,
} from './key-derivation';
import { createModuleLogger, projectLogger } from './logger';
import type { PasskeyRecord } from './types';
import { decryptWithKey, encryptWithKey } from './utils/crypto';
import { base64URLToBytes, bytesToBase64URL } from './utils/encoding';
import { COSEALG } from './webauthn/constants';
import { decodeClientDataJSON } from './webauthn/decode-client-data-json';
import type {
  PasskeyAuthenticationOptions,
  PasskeyAuthenticationResponse,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResponse,
} from './webauthn/types';
import { verifyAuthenticationResponse } from './webauthn/verify-authentication-response';
import { verifyRegistrationResponse } from './webauthn/verify-registration-response';

export type PasskeyControllerState = {
  passkeyRecord: PasskeyRecord | null;
};

export type PasskeyControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PasskeyControllerState
>;

/**
 * Actions exposed by {@link PasskeyController} on its messenger.
 *
 * Only `:getState` is exposed. Derived enrollment status is available via
 * {@link passkeyControllerSelectors.selectIsPasskeyEnrolled}, and lifecycle
 * methods ({@link PasskeyController.generateRegistrationOptions},
 * {@link PasskeyController.protectVaultKeyWithPasskey}, etc.) accept or
 * return non-`Json` runtime values (WebAuthn `PublicKeyCredential` objects
 * and the vault key string), so they require a direct controller reference.
 */
export type PasskeyControllerActions = PasskeyControllerGetStateAction;

export type PasskeyControllerStateChangedEvent = ControllerStateChangedEvent<
  typeof controllerName,
  PasskeyControllerState
>;

export type PasskeyControllerEvents = PasskeyControllerStateChangedEvent;

export type PasskeyControllerMessenger = Messenger<
  typeof controllerName,
  PasskeyControllerActions,
  PasskeyControllerEvents
>;

/**
 * Returns the default (empty) state for {@link PasskeyController}.
 *
 * @returns A fresh state object with no enrolled passkey.
 */
export function getDefaultPasskeyControllerState(): PasskeyControllerState {
  return { passkeyRecord: null };
}

const passkeyControllerMetadata = {
  passkeyRecord: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    usedInUi: true,
  },
} satisfies StateMetadata<PasskeyControllerState>;

const log = createModuleLogger(projectLogger, controllerName);

/**
 * Selectors for {@link PasskeyControllerState}.
 *
 * Use these instead of dedicated getter methods on the controller, so that
 * derived values can be consumed from Redux selectors and other places that
 * only have access to a state object.
 */
export const passkeyControllerSelectors = {
  selectIsPasskeyEnrolled: (state: PasskeyControllerState): boolean =>
    state.passkeyRecord !== null,
};

/**
 * Passkey-based protection for the vault encryption key (WebAuthn).
 *
 * Uses PRF-backed derivation when available; otherwise uses the credential
 * `userHandle`.
 */
export class PasskeyController extends BaseController<
  typeof controllerName,
  PasskeyControllerState,
  PasskeyControllerMessenger
> {
  readonly #ceremonyManager = new CeremonyManager();

  readonly #rpID: string;

  readonly #rpName: string;

  readonly #expectedOrigin: string | string[];

  readonly #userName: string;

  readonly #userDisplayName: string;

  /**
   * Constructs a new {@link PasskeyController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - Initial state. Missing properties are filled in with
   *   defaults from {@link getDefaultPasskeyControllerState}.
   * @param args.rpID - WebAuthn Relying Party ID (typically the eTLD+1 of the
   *   client origin, or `localhost` in dev).
   * @param args.rpName - Human-readable Relying Party name shown by the OS
   *   passkey UI.
   * @param args.expectedOrigin - One or more acceptable origins for the
   *   `clientDataJSON.origin` check (e.g. `chrome-extension://...`).
   * @param args.userName - Optional `user.name` shown by the OS passkey UI.
   *   Defaults to `rpName` so client builds (Stable, Flask, etc.) can
   *   differentiate without changes here.
   * @param args.userDisplayName - Optional `user.displayName` shown by the OS
   *   passkey UI. Defaults to `rpName`.
   */
  constructor({
    messenger,
    state = {},
    rpID,
    rpName,
    expectedOrigin,
    userName,
    userDisplayName,
  }: {
    messenger: PasskeyControllerMessenger;
    state?: Partial<PasskeyControllerState>;
    rpID: string;
    rpName: string;
    expectedOrigin: string | string[];
    userName?: string;
    userDisplayName?: string;
  }) {
    super({
      messenger,
      metadata: passkeyControllerMetadata,
      name: controllerName,
      state: { ...getDefaultPasskeyControllerState(), ...state },
    });

    this.#rpID = rpID;
    this.#rpName = rpName;
    this.#expectedOrigin = expectedOrigin;
    this.#userName = userName ?? rpName;
    this.#userDisplayName = userDisplayName ?? rpName;
  }

  #requireEnrolled(): PasskeyRecord {
    const record = this.state.passkeyRecord;
    if (!record) {
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.NotEnrolled,
        {
          code: PasskeyControllerErrorCode.NotEnrolled,
        },
      );
    }
    return record;
  }

  #getChallengeFromClientData(clientDataJSON: string): string {
    return decodeClientDataJSON(clientDataJSON).challenge;
  }

  /**
   * Checks if the passkey is enrolled.
   *
   * @returns Whether the passkey is enrolled.
   */
  isPasskeyEnrolled(): boolean {
    return passkeyControllerSelectors.selectIsPasskeyEnrolled(this.state);
  }

  /**
   * Registration options for enrolling a passkey.
   *
   * Call before {@link protectVaultKeyWithPasskey}.
   *
   * @param creationOptionsConfig - Optional configuration.
   * @param creationOptionsConfig.prfAvailable - Omit PRF when `false`. Default `true`.
   * @returns Options for `navigator.credentials.create()`.
   */
  generateRegistrationOptions(creationOptionsConfig?: {
    prfAvailable?: boolean;
  }): PasskeyRegistrationOptions {
    const includePrf = creationOptionsConfig?.prfAvailable !== false;
    const prfSalt = includePrf
      ? bytesToBase64URL(randomBytes(32).slice())
      : undefined;
    const userHandle = bytesToBase64URL(randomBytes(64).slice());
    const challenge = bytesToBase64URL(randomBytes(32).slice());

    const extensions: Record<string, unknown> = {};
    if (prfSalt) {
      extensions.prf = { eval: { first: prfSalt } };
    }

    const options: PasskeyRegistrationOptions = {
      rp: { name: this.#rpName, id: this.#rpID },
      user: {
        id: userHandle,
        name: this.#userName,
        displayName: this.#userDisplayName,
      },
      challenge,
      pubKeyCredParams: [
        { alg: COSEALG.EdDSA, type: 'public-key' },
        { alg: COSEALG.ES256, type: 'public-key' },
        { alg: COSEALG.RS256, type: 'public-key' },
      ],
      timeout: WEBAUTHN_TIMEOUT_MS,
      authenticatorSelection: {
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
      },
      hints: ['client-device', 'hybrid'],
      attestation: 'none',
      ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
    };

    this.#ceremonyManager.saveRegistrationCeremony(challenge, {
      userHandle,
      prfSalt: prfSalt ?? '',
      challenge,
      createdAt: Date.now(),
    });

    return options;
  }

  /**
   * WebAuthn request options for authenticating with the enrolled passkey.
   *
   * Call before {@link retrieveVaultKeyWithPasskey},
   * {@link verifyPasskeyAuthentication}, or {@link renewVaultKeyProtection}.
   *
   * @returns Options for `navigator.credentials.get()`.
   */
  generateAuthenticationOptions(): PasskeyAuthenticationOptions {
    const record = this.#requireEnrolled();

    const challenge = bytesToBase64URL(randomBytes(32).slice());

    const extensions: Record<string, unknown> = {};
    if (record.keyDerivation.method === 'prf') {
      extensions.prf = { eval: { first: record.keyDerivation.prfSalt } };
    }

    const options: PasskeyAuthenticationOptions = {
      challenge,
      rpId: this.#rpID,
      allowCredentials: [
        {
          id: record.credential.id,
          type: 'public-key',
          transports: record.credential.transports,
        },
      ],
      userVerification: 'preferred',
      hints: ['client-device', 'hybrid'],
      timeout: WEBAUTHN_TIMEOUT_MS,
      extensions,
    };

    this.#ceremonyManager.saveAuthenticationCeremony(challenge, {
      challenge,
      createdAt: Date.now(),
    });

    return options;
  }

  /**
   * Completes enrollment and binds the vault key to the new passkey.
   *
   * @param params - Protection parameters.
   * @param params.registrationResponse - Credential from `navigator.credentials.create()`.
   * @param params.vaultKey - Vault encryption key to protect.
   */
  async protectVaultKeyWithPasskey(params: {
    registrationResponse: PasskeyRegistrationResponse;
    vaultKey: string;
  }): Promise<void> {
    const { registrationResponse, vaultKey } = params;

    // get challenge
    const challenge = this.#getChallengeFromClientData(
      registrationResponse.response.clientDataJSON,
    );
    const registrationCeremony =
      this.#ceremonyManager.getRegistrationCeremony(challenge);
    if (!registrationCeremony) {
      log('No active passkey registration ceremony for challenge');
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.NoRegistrationCeremony,
        { code: PasskeyControllerErrorCode.NoRegistrationCeremony },
      );
    }

    try {
      // verify registration response
      const { verified, registrationInfo } = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: registrationCeremony.challenge,
        expectedOrigin: this.#expectedOrigin,
        expectedRPID: this.#rpID,
        requireUserVerification: false,
      }).catch((error) => {
        log('Error verifying passkey registration response', error);
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.RegistrationVerificationFailed,
          {
            code: PasskeyControllerErrorCode.RegistrationVerificationFailed,
            cause: error instanceof Error ? error : new Error(String(error)),
          },
        );
      });
      if (!verified || !registrationInfo) {
        log(
          'Passkey registration verification returned unverified or missing registration info',
        );
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.RegistrationVerificationFailed,
          { code: PasskeyControllerErrorCode.RegistrationVerificationFailed },
        );
      }

      // derive key
      const { encKey, keyDerivation } = deriveKeyFromRegistrationResponse(
        registrationResponse,
        registrationCeremony,
        registrationInfo.credentialId,
      );

      // encrypt vault key
      const { ciphertext, iv } = encryptWithKey(vaultKey, encKey);

      // persist passkey record
      this.update((state) => {
        state.passkeyRecord = {
          credential: {
            id: registrationInfo.credentialId,
            publicKey: bytesToBase64URL(registrationInfo.publicKey),
            counter: registrationInfo.counter,
            transports: registrationInfo.transports,
            aaguid: registrationInfo.aaguid,
          },
          encryptedVaultKey: { ciphertext, iv },
          keyDerivation,
        };
      });
    } finally {
      this.#ceremonyManager.deleteRegistrationCeremony(challenge);
    }
  }

  /**
   * Returns the decrypted vault encryption key from the passkey authentication
   * response.
   *
   * @param authenticationResponse - Credential from `navigator.credentials.get()`.
   * @returns The vault encryption key.
   */
  async retrieveVaultKeyWithPasskey(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<string> {
    // verify authentication response
    await this.#verifyAuthenticationResponse(authenticationResponse);

    // derive key (#verifyAuthenticationResponse guarantees enrolled)
    const passkeyRecord = this.#requireEnrolled();
    const encKey = deriveKeyFromAuthenticationResponse(
      authenticationResponse,
      passkeyRecord,
    );

    // decrypt vault key
    let vaultKey: string;
    try {
      vaultKey = decryptWithKey(
        passkeyRecord.encryptedVaultKey.ciphertext,
        passkeyRecord.encryptedVaultKey.iv,
        encKey,
      );
    } catch (cause) {
      log(
        'Error decrypting vault key with passkey',
        cause instanceof Error ? cause : new Error(String(cause)),
      );
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.VaultKeyDecryptionFailed,
        {
          code: PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
          cause: cause instanceof Error ? cause : new Error(String(cause)),
        },
      );
    }

    return vaultKey;
  }

  /**
   * Returns whether passkey authentication succeeds for this credential (same
   * work as {@link retrieveVaultKeyWithPasskey} without exposing the vault key).
   *
   * Returns `false` only when the failure is a {@link PasskeyControllerError}
   * with a defined `code`. Unexpected errors (e.g. malformed `clientDataJSON`,
   * internal bugs) are rethrown.
   *
   * @param authenticationResponse - Credential from `navigator.credentials.get()`.
   * @returns `true` if authentication succeeds, otherwise `false`.
   */
  async verifyPasskeyAuthentication(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<boolean> {
    try {
      await this.retrieveVaultKeyWithPasskey(authenticationResponse);
      return true;
    } catch (error: unknown) {
      if (error instanceof PasskeyControllerError && error.code !== undefined) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Updates the vault encryption key for the same passkey (e.g. after a password change).
   *
   * Caller MUST first verify the assertion via {@link verifyPasskeyAuthentication}
   * or {@link retrieveVaultKeyWithPasskey}. This method does not re-verify
   * because the ceremony is single-use (deleted on verify) and the signature
   * counter is advanced (replay would be rejected). Authentication here is
   * enforced by the prior verification plus the `oldVaultKey` match below.
   *
   * @param params - Renewal parameters.
   * @param params.authenticationResponse - Credential from `navigator.credentials.get()`,
   *   already verified by the caller.
   * @param params.oldVaultKey - Expected current vault key.
   * @param params.newVaultKey - New vault key to protect.
   */
  async renewVaultKeyProtection(params: {
    authenticationResponse: PasskeyAuthenticationResponse;
    oldVaultKey: string;
    newVaultKey: string;
  }): Promise<void> {
    const { authenticationResponse } = params;
    const passkeyRecord = this.#requireEnrolled();

    // derive key
    const encKey = deriveKeyFromAuthenticationResponse(
      authenticationResponse,
      passkeyRecord,
    );

    // decrypt vault key
    let decryptedVaultKey: string;
    try {
      decryptedVaultKey = decryptWithKey(
        passkeyRecord.encryptedVaultKey.ciphertext,
        passkeyRecord.encryptedVaultKey.iv,
        encKey,
      );
    } catch (error) {
      log(
        'Error decrypting vault key during passkey vault key renewal',
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.VaultKeyDecryptionFailed,
        {
          code: PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
          cause: error instanceof Error ? error : new Error(String(error)),
        },
      );
    }

    // check if vault key matches
    const { oldVaultKey, newVaultKey } = params;
    if (
      !areUint8ArraysEqual(
        stringToBytes(decryptedVaultKey),
        stringToBytes(oldVaultKey),
      )
    ) {
      log(
        'Passkey renewal rejected: decrypted vault key does not match oldVaultKey',
      );
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.VaultKeyMismatch,
        { code: PasskeyControllerErrorCode.VaultKeyMismatch },
      );
    }

    // encrypt new vault key
    const { ciphertext, iv } = encryptWithKey(newVaultKey, encKey);

    // persist passkey record (mutate current state only for vault key material)
    this.update((state) => {
      if (!state.passkeyRecord) {
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.NotEnrolled,
          {
            code: PasskeyControllerErrorCode.NotEnrolled,
          },
        );
      }
      state.passkeyRecord.encryptedVaultKey = { ciphertext, iv };
    });
  }

  /**
   * Unenrolls the passkey, removing the protected vault key material.
   */
  removePasskey(): void {
    this.update(() => getDefaultPasskeyControllerState());
    this.#ceremonyManager.clear();
  }

  /**
   * Resets state and clears in-flight registration/authentication ceremonies.
   */
  clearState(): void {
    this.removePasskey();
  }

  /**
   * Releases all in-flight ceremony state and tears down the messenger.
   */
  destroy(): void {
    this.#ceremonyManager.clear();
    super.destroy();
  }

  /**
   * Verifies an authentication response for the enrolled passkey.
   *
   * @param authenticationResponse - Authentication result JSON.
   */
  async #verifyAuthenticationResponse(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<void> {
    let challenge: string | undefined;
    try {
      // get challenge
      challenge = this.#getChallengeFromClientData(
        authenticationResponse.response.clientDataJSON,
      );

      // get passkey record
      const record = this.#requireEnrolled();

      // get authentication ceremony
      const authenticationCeremony =
        this.#ceremonyManager.getAuthenticationCeremony(challenge);
      if (!authenticationCeremony) {
        log('No active passkey authentication ceremony for challenge');
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.NoAuthenticationCeremony,
          { code: PasskeyControllerErrorCode.NoAuthenticationCeremony },
        );
      }

      // verify authentication response
      const result = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: authenticationCeremony.challenge,
        expectedOrigin: this.#expectedOrigin,
        expectedRPID: this.#rpID,
        credential: {
          id: record.credential.id,
          publicKey: base64URLToBytes(record.credential.publicKey),
          counter: record.credential.counter,
          transports: record.credential.transports,
        },
        // UV optional for device compatibility; vault key remains password-gated.
        requireUserVerification: false,
      }).catch((error) => {
        log(
          'Error verifying passkey authentication response',
          error instanceof Error ? error : new Error(String(error)),
        );
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.AuthenticationVerificationFailed,
          {
            code: PasskeyControllerErrorCode.AuthenticationVerificationFailed,
            cause: error instanceof Error ? error : new Error(String(error)),
          },
        );
      });
      if (!result.verified) {
        log('Passkey authentication verification returned unverified');
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.AuthenticationVerificationFailed,
          {
            code: PasskeyControllerErrorCode.AuthenticationVerificationFailed,
          },
        );
      }

      // persist passkey record with updated counter without clobbering concurrent updates
      this.update((state) => {
        if (!state.passkeyRecord) {
          throw new PasskeyControllerError(
            PasskeyControllerErrorMessage.NotEnrolled,
            { code: PasskeyControllerErrorCode.NotEnrolled },
          );
        }
        const latest = state.passkeyRecord;
        latest.credential.counter = Math.max(
          result.authenticationInfo.newCounter,
          latest.credential.counter,
        );
      });
    } finally {
      if (challenge) {
        this.#ceremonyManager.deleteAuthenticationCeremony(challenge);
      }
    }
  }
}
