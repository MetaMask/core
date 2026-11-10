import { bytesToHex } from '@metamask/byte-utils';
import { hexToBigInt, remove0x, stringToBytes } from '@metamask/byte-utils';
import { assert } from '@metamask/type-utils';
import { mod } from '@noble/curves/abstract/modular';
import { ed25519 } from '@noble/curves/ed25519';

export const curve = ed25519.Point.CURVE();

/**
 * Named after whitepaper: BIP32-Ed25519 Hierarchical Deterministic Keys over a Non-linear Keyspace
 * https://input-output-hk.github.io/adrestia/static/Ed25519_BIP.pdf
 * "vanilla" "ed25519" curve follows SLIP10: https://tezos.stackexchange.com/questions/2837/can-i-use-bip32-hd-key-pairs-to-derive-ed25519-addresses
 * note that that the important difference of the "bip32" version is that it allows unhardened key derivation
 */
export const name = 'ed25519Bip32';

// Secret is empty string if not provided by user
export const secret = stringToBytes('');

/**
 * Get a byte from a private key at a given index.
 *
 * @param privateKey - The private key.
 * @param index - The index of the byte to get.
 * @returns The byte at the given index.
 * @throws If the private key is too short.
 */
function getByte(privateKey: Uint8Array<ArrayBuffer>, index: number): number {
  const byte = privateKey[index];
  assert(byte !== undefined, 'Private key is too short.');

  return byte;
}

/**
 * Check if a private key is valid.
 *
 * @param privateKey - The private key to check.
 * @returns Whether the private key is valid.
 */
export const isValidPrivateKey = (
  privateKey: Uint8Array<ArrayBuffer>,
): boolean => {
  /* eslint-disable no-bitwise */
  // Lowest 3 bits of the first byte must be zero
  if ((getByte(privateKey, 0) & 0b00000111) !== 0) {
    return false;
  }

  // The highest bit of the last byte must be zero
  if ((getByte(privateKey, 31) & 0b10000000) !== 0) {
    return false;
  }

  // The second highest bit of the last byte must be one
  if ((getByte(privateKey, 31) & 0b01000000) !== 0b01000000) {
    return false;
  }
  /* eslint-enable no-bitwise */

  return true;
};

export const deriveUnhardenedKeys = true;

export const publicKeyLength = 32;

/**
 * Converts a Uint8Array of bytes to a bigint in little-endian format.
 *
 * @param bytes - The Uint8Array of bytes to convert.
 * @returns The converted bigint value.
 */
export const bytesToNumberLE = (bytes: Uint8Array<ArrayBuffer>): bigint => {
  return hexToBigInt(bytesToHex(Uint8Array.from(bytes).reverse()));
};

/**
 * Multiplies the given key with the base point on the Edwards curve.
 * equivalent to https://github.com/jedisct1/libsodium/blob/93a6e79750a31bc0b946bf483b2ba1c77f9e94ce/src/libsodium/crypto_scalarmult/ed25519/ref10/scalarmult_ed25519_ref10.c#L105 .
 * which is used by cardano-js-sdk/crypto https://github.com/input-output-hk/cardano-js-sdk/blob/8a6db2a251cd1c956f52730a0d35de2b7fc67404/packages/crypto/src/Bip32/Bip32PrivateKey.ts#L161 .
 *
 * @param key - The key to multiply with the base point.
 * @returns The resulting point on the Edwards curve.
 */
export const multiplyWithBase = (
  key: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  // Little-endian SHA512 with modulo n
  const scalar = mod(bytesToNumberLE(key), curve.n); // The actual scalar
  const point = ed25519.ExtendedPoint.BASE.multiply(scalar); // Point on Edwards curve aka public key
  return point.toBytes() as Uint8Array<ArrayBuffer>;
};

/**
 * Calculates the public key corresponding to a given private key.
 *
 * @param privateKey - The private key.
 * @param _compressed - Optional parameter to indicate if the public key should be compressed.
 * @returns The public key.
 */
export const getPublicKey = (
  privateKey: Uint8Array<ArrayBuffer>,
  _compressed?: boolean,
): Uint8Array<ArrayBuffer> => {
  return multiplyWithBase(privateKey.slice(0, 32));
};

/**
 * Adds a tweak to a public key.
 *
 * @param publicKey - The public key.
 * @param tweak - The tweak to add.
 * @returns The resulting public key.
 */
export const publicAdd = (
  publicKey: Uint8Array<ArrayBuffer>,
  tweak: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  return ed25519.Point.fromHex(remove0x(bytesToHex(publicKey)))
    .add(ed25519.Point.fromHex(remove0x(bytesToHex(tweak))))
    .toBytes() as Uint8Array<ArrayBuffer>;
};

/**
 * Compresses an Ed25519 public key.
 *
 * @param publicKey - The public key to compress.
 * @returns The compressed public key.
 */
export const compressPublicKey = (
  publicKey: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  // Ed25519 public keys don't have a compressed form.
  return publicKey;
};

/**
 * Decompresses a compressed Ed25519Bip32 public key.
 *
 * @param publicKey - The compressed public key.
 * @returns The decompressed public key.
 */
export const decompressPublicKey = (
  publicKey: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  // Ed25519 public keys don't have a compressed form.
  return publicKey;
};

export const privateKeyLength = 64;

export const masterNodeGenerationSpec = 'cip3';

export const compressedPublicKeyLength = 32;
