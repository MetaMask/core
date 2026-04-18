import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { randomBytes } from '@noble/ciphers/webcrypto';

import { WEBAUTHN_TIMEOUT_MS, CeremonyManager } from './ceremony-manager';
import {
  deriveKeyFromAuthenticationResponse,
  deriveKeyFromRegistrationResponse,
} from './key-derivation';
import type { PasskeyRecord } from './types';
import { decryptWithKey, encryptWithKey } from './utils/crypto';
import { base64URLToBytes, bytesToBase64URL } from './utils/encoding';
import {
  COSEALG,
  decodeClientDataJSON,
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

export type PasskeyControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  PasskeyControllerState
>;

export type PasskeyControllerIsPasskeyEnrolledAction = {
  type: `${typeof controllerName}:isPasskeyEnrolled`;
  handler: PasskeyController['isPasskeyEnrolled'];
};

export type PasskeyControllerActions =
  | PasskeyControllerGetStateAction
  | PasskeyControllerIsPasskeyEnrolledAction;

export type PasskeyControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  PasskeyControllerState
>;

export type PasskeyControllerEvents = PasskeyControllerStateChangeEvent;

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

  #getChallengeFromClientData(clientDataJSON: string): string {
    return decodeClientDataJSON(clientDataJSON).challenge;
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
        name: 'MetaMask Wallet',
        displayName: 'MetaMask Wallet',
      },
      challenge,
      pubKeyCredParams: [
        { alg: COSEALG.EdDSA, type: 'public-key' },
        { alg: COSEALG.ES256, type: 'public-key' },
        { alg: COSEALG.RS256, type: 'public-key' },
      ],
      timeout: WEBAUTHN_TIMEOUT_MS,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform',
      },
      attestation: 'direct',
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
   * Call before {@link retrieveVaultKeyWithPasskey} or {@link renewVaultKeyProtection}.
   *
   * @returns Options for `navigator.credentials.get()`.
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
    // get challenge
    const { registrationResponse, vaultKey } = params;
    const challenge = this.#getChallengeFromClientData(
      registrationResponse.response.clientDataJSON,
    );
    const registrationCeremony =
      this.#ceremonyManager.getRegistrationCeremony(challenge);
    if (!registrationCeremony) {
      throw new Error('No active passkey registration ceremony');
    }

    // verify registration response
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response: registrationResponse,
      expectedChallenge: registrationCeremony.challenge,
      expectedOrigin: this.#expectedOrigin,
      expectedRPID: this.#rpID,
      requireUserVerification: false,
    }).catch((error) => {
      this.#ceremonyManager.deleteRegistrationCeremony(challenge);
      throw error;
    });
    if (!verified || !registrationInfo) {
      this.#ceremonyManager.deleteRegistrationCeremony(challenge);
      throw new Error('Passkey registration verification failed');
    }

    // derive key
    const { encKey, derivationMethod } = deriveKeyFromRegistrationResponse(
      registrationResponse,
      registrationCeremony,
    );

    // encrypt vault key
    const { ciphertext, iv } = encryptWithKey(vaultKey, encKey);

    // persist passkey record
    this.#setPasskeyRecord({
      credentialId: registrationInfo.credentialId,
      derivationMethod,
      encryptedVaultKey: ciphertext,
      iv,
      prfSalt:
        derivationMethod === 'prf' ? registrationCeremony.prfSalt : undefined,
      publicKey: bytesToBase64URL(registrationInfo.publicKey),
      counter: registrationInfo.counter,
      transports: registrationInfo.transports,
    });

    // delete ceremony
    this.#ceremonyManager.deleteRegistrationCeremony(challenge);
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
    await this.#verifyAuthentication(authenticationResponse);

    // derive key
    const passkeyRecord = this.#getPasskeyRecord() as PasskeyRecord;
    const encKey = deriveKeyFromAuthenticationResponse(
      authenticationResponse,
      passkeyRecord,
    );

    // decrypt vault key
    const vaultKey = decryptWithKey(
      passkeyRecord.encryptedVaultKey,
      passkeyRecord.iv,
      encKey,
    );

    return vaultKey;
  }

  /**
   * Updates the vault encryption key for the same passkey (e.g. after a password change).
   *
   * @param params - Renewal parameters.
   * @param params.authenticationResponse - Credential from `navigator.credentials.get()`.
   * @param params.oldVaultKey - Expected current vault key.
   * @param params.newVaultKey - New vault key to protect.
   */
  async renewVaultKeyProtection(params: {
    authenticationResponse: PasskeyAuthenticationResponse;
    oldVaultKey: string;
    newVaultKey: string;
  }): Promise<void> {
    // verify authentication response
    const { authenticationResponse } = params;
    await this.#verifyAuthentication(authenticationResponse);

    // derive key
    const passkeyRecord = this.#getPasskeyRecord() as PasskeyRecord;
    const encKey = deriveKeyFromAuthenticationResponse(
      authenticationResponse,
      passkeyRecord,
    );

    // decrypt vault key
    const decryptedVaultKey = decryptWithKey(
      passkeyRecord.encryptedVaultKey,
      passkeyRecord.iv,
      encKey,
    );

    // check if vault key matches
    const { oldVaultKey, newVaultKey } = params;
    if (decryptedVaultKey !== oldVaultKey) {
      throw new Error(
        'Passkey authentication does not match the current vault key',
      );
    }

    // encrypt new vault key
    const { ciphertext, iv: newIv } = encryptWithKey(newVaultKey, encKey);

    // persist passkey record
    this.#setPasskeyRecord({
      ...passkeyRecord,
      encryptedVaultKey: ciphertext,
      iv: newIv,
    });
  }

  /** Resets state and clears in-flight registration/authentication ceremonies. */
  clearState(): void {
    this.update((state) => {
      Object.assign(state, getDefaultPasskeyControllerState());
    });
    this.#ceremonyManager.clear();
  }

  /**
   * Unenrolls the passkey, removing the protected vault key material.
   */
  removePasskey(): void {
    this.clearState();
  }

  /**
   * Verifies an authentication response for the enrolled passkey.
   *
   * @param authenticationResponse - Authentication result JSON.
   * @param shouldDeleteCeremony - Remove the in-flight ceremony after success (default: true).
   */
  async #verifyAuthentication(
    authenticationResponse: PasskeyAuthenticationResponse,
    shouldDeleteCeremony = true,
  ): Promise<void> {
    let challenge: string | undefined;
    try {
      // get challenge
      challenge = this.#getChallengeFromClientData(
        authenticationResponse.response.clientDataJSON,
      );

      // get passkey record
      const record = this.#getPasskeyRecord();
      if (!record) {
        throw new Error('Passkey is not enrolled');
      }

      // get authentication ceremony
      const authenticationCeremony =
        this.#ceremonyManager.getAuthenticationCeremony(challenge);
      if (!authenticationCeremony) {
        throw new Error('No active passkey authentication ceremony');
      }

      // verify authentication response
      const { verified, authenticationInfo } =
        await verifyAuthenticationResponse({
          response: authenticationResponse,
          expectedChallenge: authenticationCeremony.challenge,
          expectedOrigin: this.#expectedOrigin,
          expectedRPID: this.#rpID,
          credential: {
            id: record.credentialId,
            publicKey: base64URLToBytes(record.publicKey),
            counter: record.counter,
            transports: record.transports,
          },
          // UV optional for device compatibility; vault key remains password-gated.
          requireUserVerification: false,
        });

      if (!verified) {
        throw new Error('Passkey authentication verification failed');
      }

      // persist passkey record with updated counter
      const updatedRecord: PasskeyRecord = {
        ...record,
        counter: authenticationInfo.newCounter,
      };
      this.#setPasskeyRecord(updatedRecord);

      // delete ceremony if requested
      if (shouldDeleteCeremony) {
        this.#ceremonyManager.deleteAuthenticationCeremony(challenge);
      }
    } catch (error) {
      if (challenge && shouldDeleteCeremony) {
        this.#ceremonyManager.deleteAuthenticationCeremony(challenge);
      }
      throw error;
    }
  }
}
