import { getRandomBytes } from '@metamask/cryptography';
import { hkdfSha256 } from '@metamask/cryptography/hkdf';
import { bytesToNumberBE } from '@noble/curves/abstract/utils';
import { secp256k1 } from '@noble/curves/secp256k1';

/** The item ID of the data encryption seed, stored in the TOPRF namespace. */
export const DATA_ENCRYPTION_SEED_ITEM_ID = 'DATA_ENCRYPTION_SEED';

/** Length in bytes of the data encryption seed. */
export const DATA_ENCRYPTION_SEED_LENGTH = 32;

const HKDF_DATA_ENCRYPTION_KEY_INFO = new TextEncoder().encode(
  'data-encryption-key',
);
const HKDF_DATA_AUTHENTICATION_KEY_INFO = new TextEncoder().encode(
  'data-authentication-key',
);
const HKDF_SALT = new Uint8Array(0);

/**
 * The keys derived from a data encryption seed.
 */
export type DataEncryptionKeys = {
  /** AES-256 key that encrypts the secret data items. */
  dataEncryptionKey: Uint8Array<ArrayBuffer>;
  /** secp256k1 key pair that signs requests to the secret data namespace. */
  dataAuthKeyPair: { sk: bigint; pk: Uint8Array };
};

/**
 * Generate a random data encryption seed.
 *
 * @returns A random seed of `DATA_ENCRYPTION_SEED_LENGTH` bytes.
 */
export function generateDataEncryptionSeed(): Uint8Array<ArrayBuffer> {
  return getRandomBytes(DATA_ENCRYPTION_SEED_LENGTH);
}

/**
 * Deterministically derive the data encryption key and the data authentication
 * key pair from a data encryption seed.
 *
 * @param seed - The data encryption seed.
 * @returns A promise that resolves to the derived data encryption key and data
 * authentication key pair.
 */
export async function deriveDataKeys(
  seed: Uint8Array<ArrayBuffer>,
): Promise<DataEncryptionKeys> {
  const dataEncryptionKey = await hkdfSha256(
    seed,
    HKDF_SALT,
    HKDF_DATA_ENCRYPTION_KEY_INFO,
    32,
  );

  // Reducing a uniformly random 256-bit value modulo the curve order is
  // statistically indistinguishable from a uniform scalar.
  const authSecret = await hkdfSha256(
    seed,
    HKDF_SALT,
    HKDF_DATA_AUTHENTICATION_KEY_INFO,
    32,
  );
  const sk = bytesToNumberBE(authSecret) % secp256k1.CURVE.n;
  const pk = secp256k1.getPublicKey(sk, false);

  return { dataEncryptionKey, dataAuthKeyPair: { sk, pk } };
}

/**
 * Check whether a fetched item is the data encryption seed item.
 *
 * The seed item holds raw seed bytes (not secret metadata JSON), so it must be
 * excluded before parsing secret metadata.
 *
 * @param item - The fetched item (or any object with an `itemId`).
 * @returns True if the item is the data encryption seed item.
 */
export function isDataEncryptionSeedItem(item: {
  itemId?: string | null;
}): boolean {
  return item.itemId === DATA_ENCRYPTION_SEED_ITEM_ID;
}
