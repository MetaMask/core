import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { randomBytes } from '@noble/ciphers/webcrypto';

import { COSEALG } from './constants';
import { decryptWithKey, deriveEncryptionKey, encryptWithKey } from './crypto';
import { bytesToBase64URL, base64URLToBytes } from './encoding';
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

  /**
   * Checks if the passkey is enrolled.
   *
   * @returns Whether the passkey is enrolled.
   */
  isPasskeyEnrolled(): boolean {
    return this.state.passkeyRecord !== null;
  }

  /**
   * Generates passkey registration options.
   *
   * @param creationOptionsConfig - Configuration for the registration options.
   * @param creationOptionsConfig.rp - Configuration for the relying party.
   * @param creationOptionsConfig.rp.name - Name of the relying party.
   * @param creationOptionsConfig.rp.id - ID of the relying party.
   * @returns Public key credential request options for `navigator.credentials.create`.
   */
  generateRegistrationOptions(creationOptionsConfig?: {
    rp?: { name?: string; id?: string };
  }): PasskeyRegistrationOptions {
    // create registration session
    const userHandle = bytesToBase64URL(randomBytes(64));
    const prfSalt = bytesToBase64URL(randomBytes(32));
    const challenge = bytesToBase64URL(randomBytes(32));
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
   * Generates passkey authentication options.
   *
   * @returns Public key credential request options for `navigator.credentials.get`.
   */
  generateAuthenticationOptions(): PasskeyAuthenticationOptions {
    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }

    // generate challenge
    const challenge = bytesToBase64URL(randomBytes(32));
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

  /**
   * Verifies the registration challenge in `clientDataJSON`, derives a wrapping key via HKDF (PRF output or `userHandle`), protects the supplied vault encryption key with AES-GCM, and persists `PasskeyRecord`.
   *
   * @param params - Protection parameters.
   * @param params.registrationResponse - Registration result JSON from the browser ceremony.
   * @param params.vaultKey - Vault encryption key to protect.
   */
  async protectVaultKeyWithPasskey(params: {
    registrationResponse: PasskeyRegistrationResponse;
    vaultKey: string;
  }): Promise<void> {
    const session = this.#registrationSession;
    if (!session) {
      throw new Error('No active passkey registration session');
    }

    // verify challenge
    const { registrationResponse, vaultKey } = params;
    const ok = verifyChallengeInClientData(
      registrationResponse.response.clientDataJSON,
      session.challenge,
      'webauthn.create',
    );
    if (!ok) {
      throw new Error('Passkey registration challenge verification failed');
    }

    // derive encryption key from registration response
    const { encKey, derivationMethod } =
      this.#deriveKeyFromRegistrationResponse(registrationResponse, session);

    // encrypt vault key
    const { ciphertext, iv } = encryptWithKey(vaultKey, encKey);

    // persist passkey record
    const record: PasskeyRecord = {
      credentialId: registrationResponse.id,
      derivationMethod,
      encryptedVaultKey: ciphertext,
      iv,
      prfSalt: derivationMethod === 'prf' ? session.prfSalt : undefined,
    };
    this.#setPasskeyRecord(record);

    // clear registration session
    this.#registrationSession = null;
  }

  /**
   * Verifies the authentication challenge in `clientDataJSON`, derives a wrapping key via HKDF (PRF output or `userHandle`), decrypts the protected vault key with AES-GCM, and returns the decrypted vault key.
   *
   * @param authenticationResponse - Authentication result JSON from the browser ceremony.
   * @returns Decrypted vault key.
   */
  async retrieveVaultKeyWithPasskey(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<string> {
    // derive encryption key
    const encKey = this.#deriveKeyFromAuthenticationResponse(
      authenticationResponse,
    );

    // decrypt vault key
    const passkeyRecord = this.#getPasskeyRecord();
    if (!passkeyRecord) {
      throw new Error('Passkey is not enrolled');
    }
    const { encryptedVaultKey, iv } = passkeyRecord;
    const vaultKey = decryptWithKey(encryptedVaultKey, iv, encKey);

    // clear authentication session
    this.#authenticationSession = null;

    return vaultKey;
  }

  /**
   * Verifies the authentication challenge in `clientDataJSON`, derives a wrapping key via HKDF (PRF output or `userHandle`), decrypts the protected vault key with AES-GCM, and persists the new protected vault key.
   *
   * @param params - Renewal parameters.
   * @param params.authenticationResponse - Authentication result JSON from the browser ceremony.
   * @param params.oldVaultKey - Serialized vault key before password change.
   * @param params.newVaultKey - Serialized vault key after password change.
   */
  async renewVaultKeyProtection(params: {
    authenticationResponse: PasskeyAuthenticationResponse;
    oldVaultKey: string;
    newVaultKey: string;
  }): Promise<void> {
    // derive encryption key
    const { authenticationResponse, oldVaultKey } = params;
    const encKey = this.#deriveKeyFromAuthenticationResponse(
      authenticationResponse,
    );

    // decrypt vault key
    const passkeyRecord = this.#getPasskeyRecord();
    if (!passkeyRecord) {
      throw new Error('Passkey is not enrolled');
    }
    const { encryptedVaultKey, iv } = passkeyRecord;
    const decryptedVaultKey = decryptWithKey(encryptedVaultKey, iv, encKey);

    // verify old vault key
    if (decryptedVaultKey !== oldVaultKey) {
      this.#authenticationSession = null;
      throw new Error(
        'Passkey authentication does not match the current vault key',
      );
    }

    // encrypt new vault key
    const { newVaultKey } = params;
    const { ciphertext, iv: newIv } = encryptWithKey(newVaultKey, encKey);

    // persist new passkey record
    this.#setPasskeyRecord({
      ...passkeyRecord,
      encryptedVaultKey: ciphertext,
      iv: newIv,
    });

    // clear authentication session
    this.#authenticationSession = null;
  }

  /**
   * Clears the passkey record and resets the registration and authentication sessions.
   */
  removePasskey(): void {
    this.update((state) => {
      state.passkeyRecord = null;
    });
    this.#registrationSession = null;
    this.#authenticationSession = null;
  }

  /**
   * Derives the encryption key from the registration response.
   *
   * @param registrationResponse - Registration result JSON from the browser ceremony.
   * @param session - Registration session.
   * @returns Derived encryption key and derivation method.
   */
  #deriveKeyFromRegistrationResponse(
    registrationResponse: PasskeyRegistrationResponse,
    session: PasskeyRegistrationSession,
  ): {
    encKey: Uint8Array;
    derivationMethod: 'prf' | 'userHandle';
  } {
    const credentialId = registrationResponse.id;
    const prf = registrationResponse.clientExtensionResults?.prf;
    const prfFirst = prf?.results?.first;
    const prfEnabled =
      prf?.enabled === true || (prfFirst !== undefined && prfFirst.length > 0);
    const derivationMethod = prfEnabled ? 'prf' : 'userHandle';
    const ikm: Uint8Array =
      derivationMethod === 'prf'
        ? base64URLToBytes(prfFirst as PasskeyBase64URLString)
        : base64URLToBytes(session.userHandle);
    const encKey = deriveEncryptionKey(ikm, base64URLToBytes(credentialId));
    return { encKey, derivationMethod };
  }

  /**
   * Verifies the WebAuthn authentication challenge and derives the encryption key
   * for the enrolled credential.
   *
   * @param authenticationResponse - Authentication result JSON from the browser ceremony.
   * @returns Derived encryption key for decrypt/re-encrypt operations.
   */
  #deriveKeyFromAuthenticationResponse(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Uint8Array {
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

    let ikm: Uint8Array;
    if (record.derivationMethod === 'prf') {
      ikm = base64URLToBytes(prfFirst as PasskeyBase64URLString);
    } else if (userHandle) {
      ikm = base64URLToBytes(userHandle);
    } else {
      throw new Error('Passkey assertion missing required key material');
    }

    return deriveEncryptionKey(ikm, base64URLToBytes(record.credentialId));
  }
}
