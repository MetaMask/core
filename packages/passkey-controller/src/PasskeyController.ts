import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import { COSEALG } from './constants';
import { deriveWrappingKey, unwrapKey, wrapKey } from './crypto';
import { base64UrlStringToArrayBuffer, bytesToBase64URL } from './encoding';
import type {
  PasskeyAuthenticationResponse,
  Base64URLString as PasskeyBase64URLString,
  PasskeyRegistrationOptions,
  PasskeyRecord,
  PasskeyRegistrationSession,
  PasskeyAuthenticationOptions,
  PasskeyRegistrationResponse,
  PasskeyAuthenticationSession,
} from './types';
import { verifyChallengeInClientData } from './webauthn';

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

export class PasskeyController extends BaseController<
  typeof controllerName,
  PasskeyControllerState,
  PasskeyControllerMessenger
> {
  /** In-memory registration ceremony (not persisted, not part of `state`). */
  #registrationSession: PasskeyRegistrationSession | null = null;

  /** In-memory authentication ceremony challenge (not persisted). */
  #authenticationSession: PasskeyAuthenticationSession | null = null;

  constructor({
    messenger,
    state,
  }: {
    messenger: PasskeyControllerMessenger;
    state?: Partial<PasskeyControllerState>;
  }) {
    super({
      messenger,
      metadata: passkeyControllerMetadata,
      name: controllerName,
      state: { ...getDefaultPasskeyControllerState(), ...state },
    });

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

  isPasskeyEnrolled(): boolean {
    return this.state.passkeyRecord !== null;
  }

  generatePasskeyRegistrationOptions(creationOptionsConfig?: {
    rp?: { name?: string; id?: string };
  }): PasskeyRegistrationOptions {
    // create registration session
    const userHandle = bytesToBase64URL(
      globalThis.crypto.getRandomValues(new Uint8Array(64)),
    );
    const prfSalt = bytesToBase64URL(
      globalThis.crypto.getRandomValues(new Uint8Array(32)),
    );
    const challenge = bytesToBase64URL(
      globalThis.crypto.getRandomValues(new Uint8Array(32)),
    );
    this.#registrationSession = { userHandle, prfSalt, challenge };

    // build registration options
    const options: PasskeyRegistrationOptions = {
      rp: {
        name: creationOptionsConfig?.rp?.name ?? 'MetaMask',
        id: creationOptionsConfig?.rp?.id,
      },
      user: {
        id: userHandle,
        name: 'MetaMask User',
        displayName: 'MetaMask',
      },
      challenge,
      pubKeyCredParams: [
        { alg: COSEALG.EdDSA, type: 'public-key' },
        { alg: COSEALG.ES256, type: 'public-key' },
        { alg: COSEALG.RS256, type: 'public-key' },
      ],
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      attestation: 'direct',
      hints: ['client-device', 'hybrid'],
      extensions: {
        prf: { eval: { first: prfSalt } },
      },
    };

    return options;
  }

  /**
   * Starts passkey authentication: stores a random challenge in memory and returns WebAuthn request options.
   *
   * @returns Public key credential request options for `navigator.credentials.get`.
   */
  generatePasskeyAuthenticationOptions(): PasskeyAuthenticationOptions {
    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }

    // generate challenge
    const challenge = bytesToBase64URL(
      globalThis.crypto.getRandomValues(new Uint8Array(32)),
    );
    this.#authenticationSession = { challenge };

    const options: PasskeyAuthenticationOptions = {
      challenge,
      allowCredentials: [{ type: 'public-key', id: record.credentialId }],
      userVerification: 'preferred',
      hints: ['client-device', 'hybrid'],
    };

    if (record.derivationMethod === 'prf' && record.prfSalt) {
      options.extensions = {
        prf: { eval: { first: record.prfSalt } },
      };
    }

    return options;
  }

  async completePasskeyRegistration(input: {
    registrationResponse: PasskeyRegistrationResponse;
    encryptionKey: string;
    encryptionSalt: string;
  }): Promise<void> {
    const session = this.#registrationSession;
    if (!session) {
      throw new Error('No active passkey registration session');
    }

    // verify challenge
    const { registrationResponse, encryptionKey, encryptionSalt } = input;
    const ok = verifyChallengeInClientData(
      registrationResponse.response.clientDataJSON,
      session.challenge,
      'webauthn.create',
    );
    if (!ok) {
      throw new Error('Passkey registration challenge verification failed');
    }
    const credentialId = registrationResponse.id;
    const prf = registrationResponse.clientExtensionResults?.prf;
    const prfFirst = prf?.results?.first;
    const prfEnabled =
      prf?.enabled === true || (prfFirst !== undefined && prfFirst.length > 0);

    // create wrapping key
    const derivationMethod = prfEnabled ? 'prf' : 'userHandle';
    const ikm: ArrayBuffer =
      derivationMethod === 'prf'
        ? base64UrlStringToArrayBuffer(prfFirst as PasskeyBase64URLString)
        : base64UrlStringToArrayBuffer(session.userHandle);
    const wrappingKey = await deriveWrappingKey(
      ikm,
      base64UrlStringToArrayBuffer(credentialId),
    );

    // wrap encryption key
    const { ciphertext, iv } = await wrapKey(encryptionKey, wrappingKey);

    // build passkey record
    const record: PasskeyRecord = {
      credentialId,
      derivationMethod,
      wrappedEncryptionKey: ciphertext,
      iv,
      encryptionSalt,
      prfSalt: derivationMethod === 'prf' ? session.prfSalt : undefined,
    };
    this.#setPasskeyRecord(record);
    this.#registrationSession = null;
  }

  /**
   * Verifies the assertion against the in-memory auth challenge and stored record, then derives the vault encryption key.
   *
   * @param authenticationResponse - Authentication result JSON from the browser ceremony.
   * @returns Serialized vault encryption key for `submitEncryptionKey` (or equivalent).
   */
  /**
   * Verifies the WebAuthn authentication challenge and derives the wrapping key
   * for the enrolled credential (same material as {@link unwrapVaultEncryptionKey}).
   *
   * @param authenticationResponse - Authentication result JSON from the browser ceremony.
   * @returns Wrapping key and passkey record for unwrap/re-wrap.
   */
  async #getWrappingKey(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<CryptoKey> {
    const session = this.#authenticationSession;
    if (!session) {
      throw new Error('No active passkey authentication session');
    }
    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }

    const ok = verifyChallengeInClientData(
      authenticationResponse.response.clientDataJSON,
      session.challenge,
      'webauthn.get',
    );
    if (!ok) {
      throw new Error('Passkey authentication challenge verification failed');
    }
    const { userHandle } = authenticationResponse.response;
    const prfFirst =
      authenticationResponse.clientExtensionResults?.prf?.results?.first;

    let ikm: ArrayBuffer;
    if (record.derivationMethod === 'prf') {
      ikm = base64UrlStringToArrayBuffer(prfFirst as PasskeyBase64URLString);
    } else if (userHandle) {
      ikm = base64UrlStringToArrayBuffer(userHandle);
    } else {
      throw new Error('Passkey assertion missing required key material');
    }
    const wrappingKey = await deriveWrappingKey(
      ikm,
      base64UrlStringToArrayBuffer(record.credentialId),
    );

    return wrappingKey;
  }

  async unwrapVaultEncryptionKey(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<string> {
    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }
    const wrappingKey = await this.#getWrappingKey(authenticationResponse);
    const encryptionKey = await unwrapKey(
      record.wrappedEncryptionKey,
      record.iv,
      wrappingKey,
    );

    this.#authenticationSession = null;
    return encryptionKey;
  }

  /**
   * After the keyring vault encryption key has changed (e.g. wallet password change),
   * re-wraps the new serialized encryption key with the same passkey-derived wrapping key
   * from a verified WebAuthn authentication response.
   *
   * Verifies the auth challenge, checks that the stored passkey wrap still decrypts to
   * `encryptionKeyBeforePasswordChange`, clears the auth session, then persists a new
   * wrap for `encryptionKeyAfterPasswordChange` and `encryptionSaltAfterPasswordChange`.
   *
   * @param input - Re-wrap parameters.
   * @param input.authenticationResponse - Authentication result JSON from the browser ceremony.
   * @param input.oldEncryptionKey - Serialized vault encryption key before password change.
   * @param input.newEncryptionKey - Serialized vault encryption key after password change.
   * @param input.newEncryptionSalt - Keyring encryption salt after password change.
   */
  async changeVaultEncryptionKey(input: {
    authenticationResponse: PasskeyAuthenticationResponse;
    oldEncryptionKey: string;
    newEncryptionKey: string;
    newEncryptionSalt: string;
  }): Promise<void> {
    const {
      authenticationResponse,
      oldEncryptionKey,
      newEncryptionKey,
      newEncryptionSalt,
    } = input;

    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }
    const wrappingKey = await this.#getWrappingKey(authenticationResponse);

    // TODO: why we need to do this?
    const decryptedKey = await unwrapKey(
      record.wrappedEncryptionKey,
      record.iv,
      wrappingKey,
    );
    if (decryptedKey !== oldEncryptionKey) {
      this.#authenticationSession = null;
      throw new Error(
        'Passkey authentication does not match the current vault encryption key',
      );
    }

    this.#authenticationSession = null;

    const { ciphertext, iv } = await wrapKey(newEncryptionKey, wrappingKey);

    const nextRecord: PasskeyRecord = {
      ...record,
      wrappedEncryptionKey: ciphertext,
      iv,
      encryptionSalt: newEncryptionSalt,
    };
    this.#setPasskeyRecord(nextRecord);
  }

  removePasskey(): void {
    this.#registrationSession = null;
    this.#authenticationSession = null;
    this.update((state) => {
      state.passkeyRecord = null;
    });
  }
}
