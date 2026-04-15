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
import { base64URLToBytes, bytesToBase64URL } from './encoding';
import type {
  PasskeyAuthenticationOptions,
  PasskeyAuthenticationResponse,
  PasskeyAuthenticationSession,
  PasskeyRecord,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResponse,
  PasskeyRegistrationSession,
  PrfClientExtensionResults,
} from './types';
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
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
   * Generates passkey registration options synchronously.
   *
   * @param creationOptionsConfig - Configuration for the registration options.
   * @param creationOptionsConfig.rp - Configuration for the relying party.
   * @param creationOptionsConfig.rp.name - Name of the relying party.
   * @param creationOptionsConfig.rp.id - ID of the relying party.
   * @returns Public key credential creation options JSON for
   *   `navigator.credentials.create`.
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
        name: 'MetaMask User',
        displayName: 'MetaMask',
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
   * Generates passkey authentication options synchronously.
   *
   * @returns Public key credential request options JSON for
   *   `navigator.credentials.get`.
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
   * Verifies the registration response, derives a wrapping key via HKDF
   * (PRF output or userHandle), protects the supplied vault encryption key
   * with AES-GCM, and persists a PasskeyRecord.
   *
   * @param params - Protection parameters.
   * @param params.registrationResponse - Registration result JSON from the
   *   browser ceremony.
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

    const { encKey, derivationMethod } =
      this.#deriveKeyFromRegistrationResponse(registrationResponse, session);

    const { ciphertext, iv } = encryptWithKey(vaultKey, encKey);

    this.#setPasskeyRecord({
      credentialId: registrationInfo.credentialId,
      derivationMethod,
      encryptedVaultKey: ciphertext,
      iv,
      prfSalt: derivationMethod === 'prf' ? session.prfSalt : undefined,
      publicKey: bytesToBase64URL(registrationInfo.publicKey),
      transports: registrationInfo.transports,
    });

    this.#registrationSession = null;
  }

  /**
   * Verifies the authentication response, derives a wrapping key, decrypts
   * the protected vault key, and returns it.
   *
   * @param authenticationResponse - Authentication result JSON from the
   *   browser ceremony.
   * @returns Decrypted vault key.
   */
  async retrieveVaultKeyWithPasskey(
    authenticationResponse: PasskeyAuthenticationResponse,
  ): Promise<string> {
    const record = this.#getPasskeyRecord();
    if (!record) {
      throw new Error('Passkey is not enrolled');
    }

    await this.#verifyAuthentication(authenticationResponse, record);

    const encKey = this.#deriveKeyFromAuthenticationResponse(
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
   * Verifies the authentication response, re-derives the wrapping key, checks
   * the old vault key matches, then re-wraps with the new vault key.
   *
   * @param params - Renewal parameters.
   * @param params.authenticationResponse - Authentication result JSON from the
   *   browser ceremony.
   * @param params.oldVaultKey - Serialized vault key before password change.
   * @param params.newVaultKey - Serialized vault key after password change.
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

    const encKey = this.#deriveKeyFromAuthenticationResponse(
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
   * Clears the passkey record and resets the registration and authentication
   * sessions.
   */
  removePasskey(): void {
    this.update((state) => {
      state.passkeyRecord = null;
    });
    this.#registrationSession = null;
    this.#authenticationSession = null;
  }

  /**
   * Verifies the authentication response using full WebAuthn verification.
   *
   * @param authenticationResponse - Authentication result JSON.
   * @param record - The stored passkey record containing publicKey.
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
        counter: 0,
        transports: record.transports,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      throw new Error('Passkey authentication verification failed');
    }
  }

  /**
   * Derives the encryption key from the registration response.
   *
   * @param registrationResponse - Registration result JSON from the browser
   *   ceremony.
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
    const prf = (
      registrationResponse.clientExtensionResults as PrfClientExtensionResults
    )?.prf;
    const prfFirst = prf?.results?.first;
    const prfEnabled =
      prf?.enabled === true || (prfFirst !== undefined && prfFirst.length > 0);
    const derivationMethod = prfEnabled ? 'prf' : 'userHandle';
    const ikm: Uint8Array =
      derivationMethod === 'prf'
        ? base64URLToBytes(prfFirst as string)
        : base64URLToBytes(session.userHandle);
    const encKey = deriveEncryptionKey(ikm, base64URLToBytes(credentialId));
    return { encKey, derivationMethod };
  }

  /**
   * Derives the encryption key from the authentication response.
   *
   * @param authenticationResponse - Authentication result JSON.
   * @param record - The stored passkey record.
   * @returns Derived encryption key.
   */
  #deriveKeyFromAuthenticationResponse(
    authenticationResponse: PasskeyAuthenticationResponse,
    record: PasskeyRecord,
  ): Uint8Array {
    const { userHandle } = authenticationResponse.response;
    const prfFirst = (
      authenticationResponse.clientExtensionResults as PrfClientExtensionResults
    )?.prf?.results?.first;

    let ikm: Uint8Array;
    if (record.derivationMethod === 'prf') {
      ikm = base64URLToBytes(prfFirst as string);
    } else if (userHandle) {
      ikm = base64URLToBytes(userHandle);
    } else {
      throw new Error('Passkey assertion missing required key material');
    }

    return deriveEncryptionKey(ikm, base64URLToBytes(record.credentialId));
  }
}
