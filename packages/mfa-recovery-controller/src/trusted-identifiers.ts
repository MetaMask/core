import { decodePartialCBOR } from '@levischuck/tiny-cbor';
import type { Messenger } from '@metamask/messenger';
import type {
  UserStorageControllerPerformDeleteStorageAction,
  UserStorageControllerPerformGetStorageAllFeatureEntriesAction,
  UserStorageControllerPerformSetStorageAction,
} from '@metamask/profile-sync-controller/user-storage';
import {
  AUTH_CONNECTION_BY_NAMESPACE,
  AuthConnection,
} from '@metamask/seedless-onboarding-controller';
import type { SeedlessOnboardingControllerState } from '@metamask/seedless-onboarding-controller';
import { bytesToHex, isObject, remove0x, stringToBytes } from '@metamask/utils';
import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';

import { fromBase64Url } from './crypto.js';
import { MfaRecoveryError } from './errors.js';
import type {
  Identifier,
  IdentifierWitness,
  RecoveryTrustedIdentifierStore,
  TrustedIdentifier,
} from './types.js';

const STORAGE_FEATURE = 'mfaRecoveryTrustedIdentifiers';

// rpIdHash (32) + flags (1) + signCount (4) + aaguid (16) + credentialIdLength (2)
const CREDENTIAL_ID_OFFSET = 55;
const FLAG_ATTESTED_CREDENTIAL = 0x40;

// The escrow identifies Google logins by email and Apple logins by `sub`.
const IDENTITY_FIELD: Partial<
  Record<AuthConnection, 'socialLoginEmail' | 'userId'>
> = {
  [AuthConnection.Google]: 'socialLoginEmail',
  [AuthConnection.Apple]: 'userId',
};

/**
 * The device's seedless social login.
 */
export type SocialLogin = Pick<
  SeedlessOnboardingControllerState,
  'authConnection' | 'userId' | 'socialLoginEmail'
>;

/**
 * Reads the RP ID hash, credential ID and COSE public key from the
 * authenticator data of a passkey's creation attestation.
 *
 * @param witness - The passkey's creation attestation.
 * @returns The passkey to trust.
 */
export function toTrustedIdentifier(
  witness: IdentifierWitness,
): TrustedIdentifier {
  try {
    const [attestation] = decodePartialCBOR(
      fromBase64Url(witness.attestationObject),
      0,
    );
    const authData =
      attestation instanceof Map ? attestation.get('authData') : undefined;
    if (
      authData instanceof Uint8Array &&
      authData.length > CREDENTIAL_ID_OFFSET &&
      // eslint-disable-next-line no-bitwise
      authData[32] & FLAG_ATTESTED_CREDENTIAL
    ) {
      const data = new Uint8Array(authData);
      // eslint-disable-next-line no-bitwise
      const keyOffset = CREDENTIAL_ID_OFFSET + ((data[53] << 8) | data[54]);
      const [, keyLength] = decodePartialCBOR(data, keyOffset);
      return {
        type: 'passkey',
        rpIdHash: bytesToHex(data.slice(0, 32)),
        credentialId: bytesToHex(data.slice(CREDENTIAL_ID_OFFSET, keyOffset)),
        publicKey: bytesToHex(data.slice(keyOffset, keyOffset + keyLength)),
      };
    }
  } catch {
    // Rejected below.
  }
  throw new MfaRecoveryError(
    'Passkey attestation has no credential',
    'invalid_witness',
  );
}

/**
 * @param identifier - Identifier to check.
 * @param trusted - Trusted passkey list.
 * @param socialLogin - The device's seedless social login.
 * @returns Whether the identifier is the device's social login, or a passkey a
 * user device created, matching its RP ID, credential ID and public key. The
 * RP ID check matches the escrow's passkey login check.
 */
export function isTrustedIdentifier(
  identifier: Identifier,
  trusted: TrustedIdentifier[],
  socialLogin: SocialLogin,
): boolean {
  if (identifier.type === 'social') {
    return isSocialLogin(identifier, socialLogin);
  }
  return trusted.some((entry) => {
    const { verifier } = identifier;
    if (
      identifier.type !== 'passkey' ||
      !isObject(verifier) ||
      typeof verifier.rpId !== 'string' ||
      typeof verifier.credentialId !== 'string' ||
      !isObject(verifier.publicKey) ||
      typeof verifier.publicKey.cose !== 'string'
    ) {
      return false;
    }
    try {
      return (
        bytesToHex(sha256(stringToBytes(verifier.rpId))) === entry.rpIdHash &&
        bytesToHex(fromBase64Url(verifier.credentialId)) ===
          entry.credentialId &&
        bytesToHex(fromBase64Url(verifier.publicKey.cose)) === entry.publicKey
      );
    } catch {
      return false;
    }
  });
}

function isSocialLogin(identifier: Identifier, login: SocialLogin): boolean {
  if (
    AUTH_CONNECTION_BY_NAMESPACE[trimSlash(identifier.namespace)] !==
    login.authConnection
  ) {
    return false;
  }
  const field = login.authConnection && IDENTITY_FIELD[login.authConnection];
  const identity = field && login[field];
  return (
    identity !== undefined &&
    identifier.value ===
      remove0x(bytesToHex(keccak256(stringToBytes(identity.toLowerCase()))))
  );
}

function trimSlash(namespace: string): string {
  let end = namespace.length;
  while (namespace[end - 1] === '/') {
    end -= 1;
  }
  return namespace.slice(0, end);
}

export type UserStorageTrustedIdentifierStoreMessenger = Messenger<
  'UserStorageTrustedIdentifierStore',
  | UserStorageControllerPerformGetStorageAllFeatureEntriesAction
  | UserStorageControllerPerformSetStorageAction
  | UserStorageControllerPerformDeleteStorageAction
>;

/**
 * Keeps trusted passkeys in encrypted user storage, one entry per credential
 * ID, so devices adding different passkeys never overwrite each other. Its key comes from the seed phrase, so Auth can delete or roll back
 * entries but not write one.
 */
export class UserStorageTrustedIdentifierStore implements RecoveryTrustedIdentifierStore {
  readonly #messenger: UserStorageTrustedIdentifierStoreMessenger;

  /**
   * @param options - Store options.
   * @param options.messenger - Messenger with the UserStorageController
   * actions.
   */
  constructor(options: {
    messenger: UserStorageTrustedIdentifierStoreMessenger;
  }) {
    this.#messenger = options.messenger;
  }

  async get(): Promise<TrustedIdentifier[]> {
    const values = await this.#messenger.call(
      'UserStorageController:performGetStorageAllFeatureEntries',
      STORAGE_FEATURE,
    );
    return (values ?? []).map(
      (value) => JSON.parse(value) as TrustedIdentifier,
    );
  }

  async add(entry: TrustedIdentifier): Promise<void> {
    await this.#messenger.call(
      'UserStorageController:performSetStorage',
      storagePath(entry),
      JSON.stringify(entry),
    );
  }

  async remove(entry: TrustedIdentifier): Promise<void> {
    await this.#messenger.call(
      'UserStorageController:performDeleteStorage',
      storagePath(entry),
    );
  }
}

function storagePath(
  entry: TrustedIdentifier,
): `${typeof STORAGE_FEATURE}.${string}` {
  return `${STORAGE_FEATURE}.${remove0x(entry.credentialId)}`;
}
