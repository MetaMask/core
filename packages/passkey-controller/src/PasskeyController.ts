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

  readonly #expectedOrigin: string | string[];

  constructor({
    messenger,
    state,
    rpID,
    expectedOrigin,
  }: {
    messenger: PasskeyControllerMessenger;
    state?: Partial<PasskeyControllerState>;
    rpID?: string;
    expectedOrigin?: string | string[];
  }) {
    super({
      messenger,
      metadata: passkeyControllerMetadata,
      name: controllerName,
      state: { ...getDefaultPasskeyControllerState(), ...state },
    });

    this.#rpID = rpID ?? 'metamask.io';
    this.#expectedOrigin = expectedOrigin ?? [];

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
   * Builds a `PublicKeyCredentialCreationOptions` object for the browser
   * WebAuthn `navigator.credentials.create()` call.
   *
   * Generates fresh random values for the challenge, userHandle, and PRF
   * salt, then stores them in an in-memory registration session so they
   * can be verified later in {@link protectVaultKeyWithPasskey}.
   *
   * @param creationOptionsConfig - Optional overrides for the relying
   *   party identity.
   * @param creationOptionsConfig.rp - Relying party configuration.
   * @param creationOptionsConfig.rp.name - Display name shown to the user
   *   during the ceremony (defaults to `"MetaMask"`).
   * @param creationOptionsConfig.rp.id - RP ID domain (defaults to the
   *   value passed to the constructor).
   * @returns Options JSON ready to pass to `navigator.credentials.create()`.
   */
  generateRegistrationOptions(creationOptionsConfig?: {
    rp?: { name?: string; id?: string };
  }): PasskeyRegistrationOptions {
    const prfSalt = bytesToBase64URL(randomBytes(32).slice());
    const userHandle = bytesToBase64URL(randomBytes(64).slice());
    const challenge = bytesToBase64URL(randomBytes(32).slice());

    const rpID = creationOptionsConfig?.rp?.id ?? this.#rpID;
    const rpName = creationOptionsConfig?.rp?.name ?? 'MetaMask';

    const options: PasskeyRegistrationOptions = {
      rp: { name: rpName, id: rpID },
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
      extensions: {
        prf: { eval: { first: prfSalt } },
      },
    };

    this.#registrationSession = {
      userHandle,
      prfSalt,
      challenge,
    };

    return options;
  }

  /**
   * Builds a `PublicKeyCredentialRequestOptions` object for the browser
   * WebAuthn `navigator.credentials.get()` call.
   *
   * Generates a fresh challenge and stores it in an in-memory
   * authentication session for later verification in
   * {@link retrieveVaultKeyWithPasskey} or {@link renewVaultKeyProtection}.
   *
   * @returns Options JSON ready to pass to `navigator.credentials.get()`.
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
   * Completes passkey enrollment by verifying the registration response,
   * wrapping the vault key, and persisting the credential.
   *
   * Steps performed:
   * 1. Verifies the authenticator's registration response (challenge,
   *    origin, RP ID, attestation).
   * 2. Derives an AES-256 wrapping key via HKDF from the PRF output or
   *    the random userHandle.
   * 3. Encrypts the vault key with AES-256-GCM using the derived key.
   * 4. Persists a {@link PasskeyRecord} with the encrypted vault key,
   *    credential public key, and derivation metadata.
   *
   * @param params - Protection parameters.
   * @param params.registrationResponse - The credential result from
   *   `navigator.credentials.create()`.
   * @param params.vaultKey - The plaintext vault encryption key to wrap.
   * @throws If no registration session is active (call
   *   {@link generateRegistrationOptions} first).
   * @throws If WebAuthn verification fails.
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
   * Unlocks the vault by verifying the authentication response and
   * decrypting the protected vault key.
   *
   * @param authenticationResponse - The credential result from
   *   `navigator.credentials.get()`.
   * @returns The decrypted plaintext vault encryption key.
   * @throws If no passkey is enrolled.
   * @throws If no authentication session is active (call
   *   {@link generateAuthenticationOptions} first).
   * @throws If WebAuthn verification or decryption fails.
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
   * Re-wraps the vault key after a password change without re-enrolling
   * the passkey.
   *
   * Authenticates via the existing passkey, verifies that decryption
   * yields the expected old vault key, then re-encrypts with the new
   * vault key using the same derived wrapping key.
   *
   * @param params - Renewal parameters.
   * @param params.authenticationResponse - The credential result from
   *   `navigator.credentials.get()`.
   * @param params.oldVaultKey - The vault key that was active before the
   *   password change (used as a consistency check).
   * @param params.newVaultKey - The new vault key to wrap.
   * @throws If no passkey is enrolled.
   * @throws If no authentication session is active.
   * @throws If the decrypted vault key does not match `oldVaultKey`.
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
   * Removes the enrolled passkey and clears all in-memory ceremony sessions.
   *
   * After calling this method, the vault key can no longer be recovered
   * via passkey authentication until a new passkey is enrolled.
   */
  removePasskey(): void {
    this.update((state) => {
      state.passkeyRecord = null;
    });
    this.#registrationSession = null;
    this.#authenticationSession = null;
  }

  /**
   * Verifies the authentication response using full WebAuthn verification
   * and persists the updated signature counter for replay detection.
   *
   * @param authenticationResponse - Authentication result JSON.
   * @param record - The stored passkey record containing publicKey and
   *   last known counter value.
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
