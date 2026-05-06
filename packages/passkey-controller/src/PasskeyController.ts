import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { areUint8ArraysEqual, stringToBytes } from '@metamask/utils';

import { WEBAUTHN_TIMEOUT_MS, CeremonyManager } from './ceremony-manager';
import {
  controllerName,
  PasskeyControllerErrorCode,
  PasskeyControllerErrorMessage,
} from './constants';
import { PasskeyControllerError } from './errors';
import { deriveKeyFromAuthenticationResponse } from './key-derivation';
import { createModuleLogger, projectLogger } from './logger';
import type {
  AuthenticatorTransportFuture,
  PasskeyCredentialInfo,
  PasskeyKeyDerivation,
  PasskeyRecord,
  PrfClientExtensionResults,
} from './types';
import {
  decryptWithKey,
  encryptWithKey,
  randomBytesToBase64URL,
} from './utils/crypto';
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
 * Controller that enrolls a WebAuthn passkey and uses it to protect and unlock
 * the vault encryption key.
 */
export class PasskeyController extends BaseController<
  typeof controllerName,
  PasskeyControllerState,
  PasskeyControllerMessenger
> {
  readonly #ceremonyManager = new CeremonyManager();

  readonly #expectedRPIDs: string[];

  readonly #rpId: string | undefined;

  readonly #rpName: string;

  readonly #expectedOrigin: string | string[];

  readonly #userName: string;

  readonly #userDisplayName: string;

  /**
   * Creates a passkey controller with WebAuthn relying-party settings.
   *
   * @param args - Constructor options.
   * @param args.messenger - Controller messenger.
   * @param args.state - Partial initial state; merged with {@link getDefaultPasskeyControllerState}.
   * @param args.expectedRPID - Relying party ID(s) for verification (SHA-256 hash match in
   *   authenticator data). Pass a string or array of strings; an empty array skips RP ID
   *   allowlist checks in {@link verifyRegistrationResponse} / {@link verifyAuthenticationResponse}.
   * @param args.rpId - When set, included as `rp.id` on registration options and `rpId` on
   *   authentication options. When omitted, those fields are left unset (client default RP ID).
   * @param args.rpName - Relying party name shown in the platform passkey UI.
   * @param args.expectedOrigin - Allowed value(s) for the WebAuthn client origin.
   * @param args.userName - Optional passkey user name; defaults to `rpName`.
   * @param args.userDisplayName - Optional display name; defaults to `rpName`.
   */
  constructor({
    messenger,
    state = {},
    rpId,
    expectedRPID,
    rpName,
    expectedOrigin,
    userName,
    userDisplayName,
  }: {
    messenger: PasskeyControllerMessenger;
    state?: Partial<PasskeyControllerState>;
    rpId?: string;
    expectedRPID: string | string[];
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

    const expectedRPIDs = Array.isArray(expectedRPID)
      ? expectedRPID
      : [expectedRPID];
    this.#expectedRPIDs = [...expectedRPIDs];
    this.#rpId = rpId;
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
   * Whether a passkey is enrolled and vault key material is stored.
   *
   * @returns `true` if enrolled, otherwise `false`.
   */
  isPasskeyEnrolled(): boolean {
    return passkeyControllerSelectors.selectIsPasskeyEnrolled(this.state);
  }

  /**
   * Builds WebAuthn credential creation options for passkey enrollment.
   *
   * @param creationOptionsConfig - Optional creation behavior.
   * @param creationOptionsConfig.prfAvailable - Request the PRF extension unless `false`. Defaults to `true`.
   * @returns Public key credential creation options for `navigator.credentials.create()`.
   */
  generateRegistrationOptions(creationOptionsConfig?: {
    prfAvailable?: boolean;
  }): PasskeyRegistrationOptions {
    if (this.isPasskeyEnrolled()) {
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.AlreadyEnrolled,
        { code: PasskeyControllerErrorCode.AlreadyEnrolled },
      );
    }

    const includePrf = creationOptionsConfig?.prfAvailable !== false;
    const prfSalt = includePrf ? randomBytesToBase64URL(32) : undefined;
    const userHandle = randomBytesToBase64URL(64);
    const challenge = randomBytesToBase64URL(32);

    const extensions: Record<string, unknown> = {};
    if (prfSalt) {
      extensions.prf = { eval: { first: prfSalt } };
    }

    const options: PasskeyRegistrationOptions = {
      rp: {
        name: this.#rpName,
        id: this.#rpId,
      },
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
      prfSalt,
      challenge,
      createdAt: Date.now(),
    });

    return options;
  }

  /**
   * Builds WebAuthn credential request options for the post-registration
   * authentication step (between `create` and {@link protectVaultKeyWithPasskey}).
   *
   * @param params - Input for the pending registration ceremony.
   * @param params.registrationResponse - Result of `navigator.credentials.create()`.
   * @returns Public key credential request options for `navigator.credentials.get()`.
   */
  generatePostRegistrationAuthenticationOptions(params: {
    registrationResponse: PasskeyRegistrationResponse;
  }): PasskeyAuthenticationOptions {
    // get registration ceremony
    const { registrationResponse } = params;
    const regChallenge = this.#getChallengeFromClientData(
      registrationResponse.response.clientDataJSON,
    );
    const registrationCeremony =
      this.#ceremonyManager.getRegistrationCeremony(regChallenge);
    if (!registrationCeremony) {
      log('No active passkey registration ceremony for challenge');
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.NoRegistrationCeremony,
        { code: PasskeyControllerErrorCode.NoRegistrationCeremony },
      );
    }

    // build auth options
    const challenge = randomBytesToBase64URL(32);
    const extensions: Record<string, unknown> = {};
    if (registrationCeremony.prfSalt) {
      extensions.prf = { eval: { first: registrationCeremony.prfSalt } };
    }
    const options: PasskeyAuthenticationOptions = {
      challenge,
      rpId: this.#rpId,
      allowCredentials: [
        {
          id: registrationResponse.id,
          type: 'public-key',
          transports: registrationResponse.response.transports as
            | AuthenticatorTransportFuture[]
            | undefined,
        },
      ],
      userVerification: 'preferred',
      hints: ['client-device', 'hybrid'],
      timeout: WEBAUTHN_TIMEOUT_MS,
      extensions,
    };

    // save auth ceremony
    this.#ceremonyManager.saveAuthenticationCeremony(challenge, {
      challenge,
      createdAt: Date.now(),
    });

    return options;
  }

  /**
   * Builds WebAuthn credential request options for the enrolled passkey.
   *
   * @returns Public key credential request options for `navigator.credentials.get()`.
   */
  generateAuthenticationOptions(): PasskeyAuthenticationOptions {
    const record = this.#requireEnrolled();

    const challenge = randomBytesToBase64URL(32);

    const extensions: Record<string, unknown> = {};
    if (record.keyDerivation.method === 'prf') {
      extensions.prf = { eval: { first: record.keyDerivation.prfSalt } };
    }

    const options: PasskeyAuthenticationOptions = {
      challenge,
      rpId: this.#rpId,
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
   * Verifies registration and post-registration authentication, then stores the
   * vault key encrypted under the new passkey.
   *
   * @param params - Enrollment completion inputs.
   * @param params.registrationResponse - Result of `navigator.credentials.create()`.
   * @param params.authenticationResponse - Result of `navigator.credentials.get()` after {@link generatePostRegistrationAuthenticationOptions}.
   * @param params.vaultKey - Vault encryption key to encrypt and persist.
   */
  async protectVaultKeyWithPasskey(params: {
    registrationResponse: PasskeyRegistrationResponse;
    authenticationResponse: PasskeyAuthenticationResponse;
    vaultKey: string;
  }): Promise<void> {
    if (this.isPasskeyEnrolled()) {
      throw new PasskeyControllerError(
        PasskeyControllerErrorMessage.AlreadyEnrolled,
        { code: PasskeyControllerErrorCode.AlreadyEnrolled },
      );
    }
    const { registrationResponse, authenticationResponse, vaultKey } = params;

    // get registration ceremony
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
        expectedRPIDs: this.#expectedRPIDs,
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

      // verify authentication response
      const credential = {
        id: registrationInfo.credentialId,
        publicKey: bytesToBase64URL(registrationInfo.publicKey),
        counter: registrationInfo.counter,
        transports: registrationInfo.transports,
        aaguid: registrationInfo.aaguid,
      };
      const { newCounter } = await this.#verifyAuthenticationResponse(
        authenticationResponse,
        credential,
      );

      // determine key derivation method
      const prfFirst = (
        authenticationResponse.clientExtensionResults as PrfClientExtensionResults
      )?.prf?.results?.first;
      const authHasPrfOutput =
        typeof prfFirst === 'string' && prfFirst.length > 0;
      const keyDerivation: PasskeyKeyDerivation =
        authHasPrfOutput && registrationCeremony.prfSalt
          ? { method: 'prf', prfSalt: registrationCeremony.prfSalt }
          : { method: 'userHandle' };

      if (
        keyDerivation.method === 'userHandle' &&
        authenticationResponse.response.userHandle !==
          registrationCeremony.userHandle
      ) {
        log(
          'Post-registration assertion userHandle does not match registration ceremony',
        );
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.AuthenticationVerificationFailed,
          { code: PasskeyControllerErrorCode.AuthenticationVerificationFailed },
        );
      }

      // derive key and encrypt vault key
      const encKey = deriveKeyFromAuthenticationResponse(
        authenticationResponse,
        { credential, keyDerivation },
      );
      const { ciphertext, iv } = encryptWithKey(vaultKey, encKey);

      // persist passkey record
      this.update((state) => {
        state.passkeyRecord = {
          credential: {
            ...credential,
            counter: Math.max(newCounter, credential.counter),
          },
          encryptedVaultKey: { ciphertext, iv },
          keyDerivation,
        };
      });
    } finally {
      // delete registration ceremony
      this.#ceremonyManager.deleteRegistrationCeremony(challenge);
    }
  }

  /**
   * Verifies an authentication assertion and returns the decrypted vault key.
   *
   * @param authenticationResponse - Result of `navigator.credentials.get()`.
   * @returns The plaintext vault encryption key.
   */
  async retrieveVaultKeyWithPasskey(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<string> {
    const passkeyRecord = this.#requireEnrolled();

    // verify authentication response and update counter
    const { newCounter } = await this.#verifyAuthenticationResponse(
      authenticationResponse,
      passkeyRecord.credential,
    );
    this.update((state) => {
      if (!state.passkeyRecord) {
        throw new PasskeyControllerError(
          PasskeyControllerErrorMessage.NotEnrolled,
          { code: PasskeyControllerErrorCode.NotEnrolled },
        );
      }
      state.passkeyRecord.credential.counter = Math.max(
        newCounter,
        state.passkeyRecord.credential.counter,
      );
    });

    // derive key
    const encKey = deriveKeyFromAuthenticationResponse(
      authenticationResponse,
      passkeyRecord,
    );

    // decrypt vault key
    try {
      const vaultKey = decryptWithKey(
        passkeyRecord.encryptedVaultKey.ciphertext,
        passkeyRecord.encryptedVaultKey.iv,
        encKey,
      );
      return vaultKey;
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
  }

  /**
   * Checks whether the given authentication assertion is valid for the enrolled passkey.
   *
   * On failure, returns `false` for {@link PasskeyControllerError} with a `code`;
   * other errors propagate.
   *
   * @param authenticationResponse - Result of `navigator.credentials.get()`.
   * @returns `true` if verification succeeds, otherwise `false`.
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
   * Re-wraps the vault key after rotation. Updates persisted `encryptedVaultKey` on success.
   *
   * Does not verify WebAuthn or ceremony state—call only after your layer has authenticated
   * the user (passkey `get()` + verified assertion, or verified password). On passkey paths,
   * pass the same `authenticationResponse` you just verified (e.g. from
   * {@link retrieveVaultKeyWithPasskey} / {@link verifyPasskeyAuthentication}).
   *
   * @param params - Re-wrap inputs.
   * @param params.authenticationResponse - Used to derive the wrapping key.
   * @param params.oldVaultKey - Expected current vault key.
   * @param params.newVaultKey - New vault key to encrypt under the passkey.
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
   * Clears enrolled passkey state and in-flight ceremonies. Call only after the same
   * auth gate as renewal (verified passkey assertion or password).
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
   * Validates a WebAuthn authentication response against stored credential data.
   *
   * @param authenticationResponse - Parsed authentication response from the client.
   * @param credential - Credential identifiers and public key material for verification.
   * @returns Updated authenticator signature counter.
   */
  async #verifyAuthenticationResponse(
    authenticationResponse: PasskeyAuthenticationResponse,
    credential: PasskeyCredentialInfo,
  ): Promise<{ newCounter: number }> {
    // get challenge
    const challenge = this.#getChallengeFromClientData(
      authenticationResponse.response.clientDataJSON,
    );

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

    try {
      // verify authentication response
      const result = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: authenticationCeremony.challenge,
        expectedOrigin: this.#expectedOrigin,
        expectedRPIDs: this.#expectedRPIDs,
        credential: {
          id: credential.id,
          publicKey: base64URLToBytes(credential.publicKey),
          counter: credential.counter,
          transports: credential.transports,
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

      return { newCounter: result.authenticationInfo.newCounter };
    } finally {
      // delete authentication ceremony
      this.#ceremonyManager.deleteAuthenticationCeremony(challenge);
    }
  }
}
