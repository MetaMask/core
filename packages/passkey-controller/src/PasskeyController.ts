import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { randomBytes } from '@noble/ciphers/webcrypto';

import {
  deriveKeyFromAuthenticationResponse,
  deriveKeyFromRegistrationResponse,
} from './key-derivation';
import type {
  PasskeyAuthenticationSession,
  PasskeyRecord,
  PasskeyRegistrationSession,
} from './types';
import { decryptWithKey, encryptWithKey } from './utils/crypto';
import { base64URLToBytes, bytesToBase64URL } from './utils/encoding';
import {
  COSEALG,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from './webauthn';
import type {
  PasskeyAuthenticationOptions,
  PasskeyAuthenticationResponse,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResponse,
} from './webauthn';

const controllerName = 'PasskeyController';

const MESSENGER_EXPOSED_METHODS = ['isPasskeyEnrolled'] as const;

export type PasskeyControllerState = {
  passkeyRecord: PasskeyRecord | null;
};

type PasskeyControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PasskeyControllerState
>;

type PasskeyControllerMessengerMethodActions = {
  [Method in (typeof MESSENGER_EXPOSED_METHODS)[number]]: {
    type: `${typeof controllerName}:${Method}`;
    handler: PasskeyController[Method];
  };
}[(typeof MESSENGER_EXPOSED_METHODS)[number]];

type PasskeyControllerActions =
  | PasskeyControllerGetStateAction
  | PasskeyControllerMessengerMethodActions;

type PasskeyControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PasskeyControllerState
>;

type PasskeyControllerEvents = PasskeyControllerStateChangeEvent;

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

/**
 * Manages passkey-based vault key protection using WebAuthn.
 *
 * Orchestrates the full passkey lifecycle: generating WebAuthn ceremony
 * options, verifying authenticator responses, and protecting/retrieving
 * the vault encryption key via AES-256-GCM wrapping with HKDF-derived keys.
 *
 * Supports two key derivation strategies:
 * - **PRF** -- uses the WebAuthn PRF extension output as HKDF input.
 * - **userHandle** -- falls back to the random userHandle when PRF is
 *   unavailable.
 */
export class PasskeyController extends BaseController<
  typeof controllerName,
  PasskeyControllerState,
  PasskeyControllerMessenger
> {
  #registrationSession: PasskeyRegistrationSession | null = null;

  #authenticationSession: PasskeyAuthenticationSession | null = null;

  readonly #rpID: string;

  readonly #rpName: string;

  readonly #expectedOrigin: string | string[];

  constructor({
    messenger,
    state,
    rpID,
    rpName,
    expectedOrigin,
  }: {
    messenger: PasskeyControllerMessenger;
    state?: Partial<PasskeyControllerState>;
    rpID: string;
    rpName: string;
    expectedOrigin: string | string[];
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

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  #setPasskeyRecord(record: PasskeyRecord): void {
    this.update((state) => {
      state.passkeyRecord = record;
    });
  }

  #getPasskeyRecord(): PasskeyRecord | null {
    return this.state.passkeyRecord;
  }

  /**
   * Checks if the passkey is enrolled.
   *
   * @returns Whether the passkey is enrolled.
   */
  isPasskeyEnrolled(): boolean {
    return this.state.passkeyRecord !== null;
  }

  /**
   * Produces WebAuthn credential creation options for passkey enrollment.
   *
   * Must be called before {@link protectVaultKeyWithPasskey}.
   *
   * @param creationOptionsConfig - Optional configuration.
   * @param creationOptionsConfig.prfAvailable - Whether the client
   *   supports the WebAuthn PRF extension. When `false`, the PRF
   *   extension is omitted. Defaults to `true`.
   * @returns Options JSON for `navigator.credentials.create()`.
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
        name: 'MetaMask Wallet',
        displayName: 'MetaMask Wallet',
      },
      challenge,
      pubKeyCredParams: [
        { alg: COSEALG.EdDSA, type: 'public-key' },
        { alg: COSEALG.ES256, type: 'public-key' },
        { alg: COSEALG.RS256, type: 'public-key' },
      ],
      timeout: 60000,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      attestation: 'direct',
      ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
    };

    this.#registrationSession = {
      userHandle,
      prfSalt: prfSalt ?? '',
      challenge,
    };

    return options;
  }

  /**
   * Produces WebAuthn credential request options for passkey
   * authentication.
   *
   * Must be called before {@link retrieveVaultKeyWithPasskey} or
   * {@link renewVaultKeyProtection}.
   *
   * @returns Options JSON for `navigator.credentials.get()`.
   * @throws If no passkey is currently enrolled.
   */
  generateAuthenticationOptions(): PasskeyAuthenticationOptions {
    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }

    const challenge = bytesToBase64URL(randomBytes(32).slice());

    const extensions: Record<string, unknown> = {};
    if (record.derivationMethod === 'prf' && record.prfSalt) {
      extensions.prf = { eval: { first: record.prfSalt } };
    }

    const options: PasskeyAuthenticationOptions = {
      challenge,
      rpId: this.#rpID,
      allowCredentials: [
        {
          id: record.credentialId,
          type: 'public-key',
          transports: record.transports,
        },
      ],
      userVerification: 'preferred',
      timeout: 60000,
      extensions,
    };

    this.#authenticationSession = { challenge };

    return options;
  }

  /**
   * Completes passkey enrollment by verifying the registration response
   * and protecting the vault key with the new credential.
   *
   * @param params - Protection parameters.
   * @param params.registrationResponse - The credential result from
   *   `navigator.credentials.create()`.
   * @param params.vaultKey - The vault encryption key to protect.
   * @throws If no registration session is active (call
   *   {@link generateRegistrationOptions} first).
   * @throws If registration verification fails.
   */
  async protectVaultKeyWithPasskey(params: {
    registrationResponse: PasskeyRegistrationResponse;
    vaultKey: string;
  }): Promise<void> {
    const session = this.#registrationSession;
    if (!session) {
      throw new Error('No active passkey registration session');
    }

    const { registrationResponse, vaultKey } = params;

    const verification = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: session.challenge,
      expectedOrigin: this.#expectedOrigin,
      expectedRPID: this.#rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Passkey registration verification failed');
    }

    const { registrationInfo } = verification;

    const { encKey, derivationMethod } = deriveKeyFromRegistrationResponse(
      registrationResponse,
      session,
    );

    const { ciphertext, iv } = encryptWithKey(vaultKey, encKey);

    this.#setPasskeyRecord({
      credentialId: registrationInfo.credentialId,
      derivationMethod,
      encryptedVaultKey: ciphertext,
      iv,
      prfSalt: derivationMethod === 'prf' ? session.prfSalt : undefined,
      publicKey: bytesToBase64URL(registrationInfo.publicKey),
      counter: registrationInfo.counter,
      transports: registrationInfo.transports,
    });

    this.#registrationSession = null;
  }

  /**
   * Retrieves the vault key protected by the enrolled passkey.
   *
   * @param authenticationResponse - The credential result from
   *   `navigator.credentials.get()`.
   * @returns The recovered vault encryption key.
   * @throws If no passkey is enrolled.
   * @throws If no authentication session is active (call
   *   {@link generateAuthenticationOptions} first).
   * @throws If authentication verification or key recovery fails.
   */
  async retrieveVaultKeyWithPasskey(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<string> {
    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }

    await this.#verifyAuthentication(authenticationResponse, record);

    const encKey = deriveKeyFromAuthenticationResponse(
      authenticationResponse,
      record,
    );

    const vaultKey = decryptWithKey(
      record.encryptedVaultKey,
      record.iv,
      encKey,
    );

    this.#authenticationSession = null;

    return vaultKey;
  }

  /**
   * Replaces the protected vault key without re-enrolling the passkey.
   *
   * Intended for password-change flows where the vault key rotates but
   * the same passkey credential should continue to work.
   *
   * @param params - Renewal parameters.
   * @param params.authenticationResponse - The credential result from
   *   `navigator.credentials.get()`.
   * @param params.oldVaultKey - The vault key before the password change
   *   (verified for consistency).
   * @param params.newVaultKey - The new vault key to protect.
   * @throws If no passkey is enrolled.
   * @throws If no authentication session is active.
   * @throws If `oldVaultKey` does not match the currently protected key.
   */
  async renewVaultKeyProtection(params: {
    authenticationResponse: PasskeyAuthenticationResponse;
    oldVaultKey: string;
    newVaultKey: string;
  }): Promise<void> {
    const { authenticationResponse, oldVaultKey, newVaultKey } = params;

    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }

    await this.#verifyAuthentication(authenticationResponse, record);

    const encKey = deriveKeyFromAuthenticationResponse(
      authenticationResponse,
      record,
    );

    const decryptedVaultKey = decryptWithKey(
      record.encryptedVaultKey,
      record.iv,
      encKey,
    );

    if (decryptedVaultKey !== oldVaultKey) {
      this.#authenticationSession = null;
      throw new Error(
        'Passkey authentication does not match the current vault key',
      );
    }

    const { ciphertext, iv: newIv } = encryptWithKey(newVaultKey, encKey);

    this.#setPasskeyRecord({
      ...record,
      encryptedVaultKey: ciphertext,
      iv: newIv,
    });

    this.#authenticationSession = null;
  }

  /**
   * Unenrolls the passkey, removing the protected vault key material.
   */
  removePasskey(): void {
    this.update((state) => {
      state.passkeyRecord = null;
    });
    this.#registrationSession = null;
    this.#authenticationSession = null;
  }

  /**
   * Verifies a WebAuthn authentication response against the enrolled
   * credential.
   *
   * @param authenticationResponse - Authentication result JSON.
   * @param record - The enrolled passkey record to verify against.
   */
  async #verifyAuthentication(
    authenticationResponse: PasskeyAuthenticationResponse,
    record: PasskeyRecord,
  ): Promise<void> {
    const session = this.#authenticationSession;
    if (!session) {
      throw new Error('No active passkey authentication session');
    }

    const verification = await verifyAuthenticationResponse({
      response: authenticationResponse,
      expectedChallenge: session.challenge,
      expectedOrigin: this.#expectedOrigin,
      expectedRPID: this.#rpID,
      credential: {
        id: record.credentialId,
        publicKey: base64URLToBytes(record.publicKey),
        counter: record.counter,
        transports: record.transports,
      },
      // Passkeys with touch-only authenticators (no PIN/biometric) are
      // accepted intentionally to maximise device compatibility. The
      // vault key is already protected by the user's wallet password.
      requireUserVerification: false,
    });

    if (!verification.verified) {
      throw new Error('Passkey authentication verification failed');
    }

    this.#setPasskeyRecord({
      ...record,
      counter: verification.authenticationInfo.newCounter,
    });
  }
}
