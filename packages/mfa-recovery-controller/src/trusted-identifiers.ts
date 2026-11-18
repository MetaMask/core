import { decodePartialCBOR } from '@levischuck/tiny-cbor';
import type { Messenger } from '@metamask/messenger';
import type {
  UserStorageControllerPerformGetStorageAllFeatureEntriesAction,
  UserStorageControllerPerformSetStorageAction,
} from '@metamask/profile-sync-controller/user-storage';
import { bytesToHex, isObject, remove0x, stringToBytes } from '@metamask/utils';
import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';

import { fromBase64Url, hash } from './crypto.js';
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

/**
 * @param witness - What the device saw.
 * @returns The identifier facts to trust.
 */
export function toTrustedIdentifier(
  witness: IdentifierWitness,
): TrustedIdentifier {
  if (witness.type === 'social') {
    return {
      type: 'social',
      namespace: trimSlash(witness.namespace),
      value: remove0x(
        bytesToHex(keccak256(stringToBytes(witness.identity.toLowerCase()))),
      ),
    };
  }
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
 * @param trusted - Trusted identifier list.
 * @returns Whether a user device saw this identifier exactly, including the
 * passkey's RP ID, credential ID and public key. The RP ID check matches the
 * escrow's passkey login check.
 */
export function isTrustedIdentifier(
  identifier: Identifier,
  trusted: TrustedIdentifier[],
): boolean {
  return trusted.some((entry) => {
    if (entry.type === 'social') {
      return (
        identifier.type === 'social' &&
        trimSlash(identifier.namespace) === entry.namespace &&
        identifier.value === entry.value
      );
    }
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

function trimSlash(namespace: string): string {
  return namespace.replace(/\/+$/u, '');
}

export type UserStorageTrustedIdentifierStoreMessenger = Messenger<
  'UserStorageTrustedIdentifierStore',
  | UserStorageControllerPerformGetStorageAllFeatureEntriesAction
  | UserStorageControllerPerformSetStorageAction
>;

/**
 * Keeps trusted identifiers in encrypted user storage, one entry per
 * identifier, so devices adding different identifiers never overwrite each
 * other. Its key comes from the seed phrase, so Auth can delete or roll back
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
      `${STORAGE_FEATURE}.${remove0x(await hash(entry))}`,
      JSON.stringify(entry),
    );
  }
}
