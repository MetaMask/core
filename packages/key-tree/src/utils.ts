import { hexToBytes } from '@metamask/byte-utils';
import { createDataView } from '@metamask/byte-utils';
import { wordlist as englishWordlist } from '@metamask/scure-bip39/dist/wordlists/english.js';
import { assert } from '@metamask/type-utils';
import { sha256 } from '@noble/hashes/sha2';
import {
  base58check as scureBase58check,
  createBase58check,
} from '@scure/base';

import type {
  CoinTypeHDPathTuple,
  CoinTypeSeedPathTuple,
} from './BIP44CoinTypeNode.js';
import { BIP_44_COIN_TYPE_DEPTH } from './BIP44CoinTypeNode.js';
import type {
  BIP32Node,
  ChangeHDPathString,
  CoinTypeHDPathString,
  CoinTypeToAddressTuple,
  HardenedBIP32Node,
  Network,
  UnhardenedBIP32Node,
  UnprefixedNode,
} from './constants.js';
import {
  BIP44PurposeNodeToken,
  MAX_BIP_32_INDEX,
  MAX_UNHARDENED_BIP_32_INDEX,
  UNPREFIXED_BIP_32_PATH_REGEX,
} from './constants.js';
import { ripemd160 } from './cryptography.js';
import type { SupportedCurve } from './curves/index.js';
import { curves } from './curves/index.js';

/**
 * Gets a string representation of a BIP-44 path of depth 2, i.e.:
 * `m / 44' / coin_type'`
 *
 * For display purposes only.
 *
 * @param coin_type - The `coin_type` index to create a path visualization for.
 * @returns The visualization of the BIP-44 path for thte specified `coin_type`.
 */
export function getBIP44CoinTypePathString(
  coin_type: number,
): CoinTypeHDPathString {
  return `m / ${BIP44PurposeNodeToken} / ${getHardenedBIP32NodeToken(
    coin_type,
  )}`;
}

type BIP44PathIndex = number | { index: number; hardened: boolean };

type BIP44PathIndices = {
  coin_type: number;
  account?: number;
  change?: BIP44PathIndex;
  address_index: BIP44PathIndex;
};

export type CoinTypeToAddressIndices = Pick<
  BIP44PathIndices,
  'account' | 'change' | 'address_index'
>;

/**
 * Gets a string representation of a BIP-44 path of depth 4, i.e.:
 * `m / 44' / coin_type' / account' / change`
 *
 * For display purposes only.
 *
 * @param coinTypePath - The parent `coin_type` path.
 * @param indices - The `account` and `change` index to create a path visualization for.
 * @returns The visualization of the BIP-44 path for the specified `coin_type`
 * and `change` indices.
 */
export function getBIP44ChangePathString(
  coinTypePath: CoinTypeHDPathString,
  indices: Omit<CoinTypeToAddressIndices, 'address_index'>,
): ChangeHDPathString {
  return `${coinTypePath} / ${getHardenedBIP32NodeToken(
    indices.account ?? 0,
  )} / ${getBIP32NodeToken(indices.change ?? 0)}`;
}

/**
 * Gets a BIP-44 path tuple of the form `account' / change / address_index`,
 * which can be used to derive address keys together with a `coin_type` key.
 *
 * @param indices - The BIP-44 derivation index values.
 * @param indices.account - The `account` index value.
 * @param indices.change - The `change` index value.
 * @param indices.address_index - The `address_index` index value.
 * @returns The `account' / change / address_index` path corresponding to the
 * specified indices.
 */
export function getBIP44CoinTypeToAddressPathTuple({
  account = 0,
  change = 0,
  address_index,
}: CoinTypeToAddressIndices): CoinTypeToAddressTuple {
  return [
    getHardenedBIP32NodeToken(account),
    getBIP32NodeToken(change),
    getBIP32NodeToken(address_index),
  ] as const;
}

/**
 * A hardened BIP-32 node token, e.g. `bip32:0'`.
 * Validates that the index is a non-negative integer number, and throws an
 * error if validation fails.
 *
 * @param index - The index of the node.
 * @returns The hardened BIP-32 node token.
 */
export function getHardenedBIP32NodeToken(index: number): HardenedBIP32Node {
  validateBIP32Index(index);
  return `${getUnhardenedBIP32NodeToken(index)}'`;
}

/**
 * An unhardened BIP-32 node token, e.g. `bip32:0`.
 * Validates that the index is a non-negative integer number, and throws an
 * error if validation fails.
 *
 * @param index - The index of the node.
 * @returns The unhardened BIP-32 node token.
 */
export function getUnhardenedBIP32NodeToken(
  index: number,
): UnhardenedBIP32Node {
  validateBIP32Index(index);
  return `bip32:${index}`;
}

/**
 * A hardened or unhardened BIP-32 node token, e.g. `bip32:0` or `bip32:0'`.
 * Validates that the index is a non-negative integer number, and throws an
 * error if validation fails.
 *
 * @param index - The index of the node.
 * @returns The hardened or unhardened BIP-32 node token.
 */
export function getBIP32NodeToken(index: BIP44PathIndex): BIP32Node {
  if (typeof index === 'number') {
    return getUnhardenedBIP32NodeToken(index);
  }

  if (
    !index ||
    !Number.isInteger(index.index) ||
    typeof index.hardened !== 'boolean'
  ) {
    throw new Error(
      'Invalid BIP-32 index: Must be an object containing the index and whether it is hardened.',
    );
  }

  if (index.hardened) {
    return getHardenedBIP32NodeToken(index.index);
  }

  return getUnhardenedBIP32NodeToken(index.index);
}

/**
 * Validates that the index is a non-negative integer number. Throws an
 * error if validation fails.
 *
 * @param addressIndex - The index to validate.
 */
export function validateBIP32Index(addressIndex: number): void {
  if (!isValidBIP32Index(addressIndex)) {
    throw new Error(`Invalid BIP-32 index: Must be a non-negative integer.`);
  }
}

/**
 * Check if the index is a valid BIP-32 index.
 *
 * @param index - The BIP-32 index to test.
 * @returns Whether the index is a non-negative integer number.
 */
export function isValidBIP32Index(index: number): boolean {
  return isValidInteger(index) && index <= MAX_BIP_32_INDEX;
}

/**
 * Check if the value is a valid BIP-32 path segment, i.e., a string of the form
 * `0'`.
 *
 * @param segment - The BIP-32 path segment to test.
 * @returns Whether the path segment is a valid BIP-32 path segment.
 */
export function isValidBIP32PathSegment(
  segment: string,
): segment is UnprefixedNode {
  if (typeof segment !== 'string') {
    return false;
  }

  const match = segment.match(UNPREFIXED_BIP_32_PATH_REGEX);
  if (typeof match?.groups?.index === 'undefined') {
    return false;
  }

  const index = parseInt(match.groups.index, 10);
  return isValidInteger(index) && index <= MAX_UNHARDENED_BIP_32_INDEX;
}

/**
 * Check if the value is a hardened BIP-32 index. This only checks if the value
 * ends with a `'` character, and does not validate that the index is a valid
 * BIP-32 index.
 *
 * @param bip32Token - The token to test.
 * @returns Whether the token is hardened, i.e. ends with `'`.
 */
export function isHardened(bip32Token: string): boolean {
  return bip32Token.endsWith(`'`);
}

/**
 * Get a `Uint8Array` from a hexadecimal string or a `Uint8Array`. If the input
 * is a hexadecimal string, it is converted to a `Uint8Array`. If the input is
 * a `Uint8Array`, it is returned as-is.
 *
 * @param hexString - The hexadecimal string to convert.
 * @returns The `Uint8Array` corresponding to the hexadecimal string.
 */
export function hexStringToBytes(hexString: string | Uint8Array): Uint8Array {
  if (hexString instanceof Uint8Array) {
    return hexString;
  }

  return hexToBytes(hexString);
}

/**
 * The same as {@link hexStringToBytes}, but returns `undefined` if the input
 * is `undefined`.
 *
 * @param hexString - The hexadecimal string to convert.
 * @returns The `Uint8Array` corresponding to the hexadecimal string.
 */
export function nullableHexStringToBytes(
  hexString?: string | Uint8Array,
): Uint8Array | undefined {
  if (hexString !== undefined) {
    return hexStringToBytes(hexString);
  }

  return undefined;
}

/**
 * Tests whether the specified `Uint8Array` is a valid BIP-32 key.
 * A valid bytes key is 64 bytes long and has at least one non-zero byte.
 *
 * @param bytes - The `Uint8Array` to test.
 * @param expectedLength - The expected length of the Uint8Array.
 * @returns Whether the Uint8Array represents a valid BIP-32 key.
 */
export function isValidBytesKey(
  bytes: Uint8Array<ArrayBuffer>,
  expectedLength: number,
): boolean {
  if (bytes.length !== expectedLength) {
    return false;
  }

  for (const byte of bytes) {
    if (byte !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Tests whether the specified number is a valid integer equal to or greater than 0.
 *
 * @param value - The number to test.
 * @returns Whether the number is a valid integer.
 */
export function isValidInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isArrayBufferBacked(
  bytes: Uint8Array,
): bytes is Uint8Array<ArrayBuffer> {
  return bytes.buffer instanceof ArrayBuffer;
}

/**
 * Get a `Uint8Array` from a hexadecimal string or `Uint8Array`. Validates that the
 * length of the `Uint8Array` matches the specified length, and that the `Uint8Array`
 * is not empty.
 *
 * @param value - The value to convert to a `Uint8Array`.
 * @param length - The length to validate the `Uint8Array` against.
 * @returns The `Uint8Array` corresponding to the hexadecimal string.
 */
export function getBytes(
  value: unknown,
  length: number,
): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array && isArrayBufferBacked(value)) {
    validateBytes(value, length);

    return value;
  }

  if (typeof value === 'string') {
    const bytes = hexToBytes(value);
    validateBytes(bytes, length);

    return bytes;
  }

  throw new Error(
    `Invalid value: Expected an instance of Uint8Array or hexadecimal string.`,
  );
}

/**
 * Get a `Uint8Array` from a hexadecimal string or `Uint8Array`. Validates that
 * the length of the `Uint8Array` matches the specified length.
 *
 * This function is "unsafe," in the sense that it does not validate that the
 * `Uint8Array` is not empty (i.e., all bytes are zero).
 *
 * @param value - The value to convert to a `Uint8Array`.
 * @param length - The length to validate the `Uint8Array` against.
 * @returns The `Uint8Array` corresponding to the hexadecimal string.
 */
export function getBytesUnsafe(
  value: unknown,
  length: number,
): Uint8Array<ArrayBuffer> {
  if (value instanceof Uint8Array && isArrayBufferBacked(value)) {
    assert(
      value.length === length,
      `Invalid value: Must be a ${length}-byte byte array.`,
    );
    return value;
  }

  if (typeof value === 'string') {
    return getBytesUnsafe(hexToBytes(value), length);
  }

  throw new Error(
    `Invalid value: Expected an instance of Uint8Array or hexadecimal string.`,
  );
}

/**
 * Validate that the specified `Uint8Array` is not empty and has the specified
 * length.
 *
 * @param bytes - The `Uint8Array` to validate.
 * @param length - The length to validate the `Uint8Array` against.
 * @throws An error if the `Uint8Array` is empty or has the wrong length.
 */
export function validateBytes(
  bytes: Uint8Array<ArrayBuffer>,
  length: number,
): asserts bytes is Uint8Array<ArrayBuffer> {
  if (!isValidBytesKey(bytes, length)) {
    throw new Error(
      `Invalid value: Must be a non-zero ${length}-byte byte array.`,
    );
  }
}

export const decodeBase58check = (value: string): Uint8Array => {
  const base58Check = scureBase58check(sha256);

  try {
    return base58Check.decode(value);
  } catch {
    throw new Error(
      `Invalid extended key: Value is not base58-encoded, or the checksum is invalid.`,
    );
  }
};

export const encodeBase58check = (value: Uint8Array<ArrayBuffer>): string => {
  const base58Check = createBase58check(sha256);

  return base58Check.encode(value);
};

/**
 * Get the fingerprint of a compressed public key as number.
 *
 * @param publicKey - The compressed public key to get the fingerprint for.
 * @param compressedPublicKeyLength - The length of the compressed public key.
 * @returns The fingerprint of the public key.
 */
export const getFingerprint = (
  publicKey: Uint8Array<ArrayBuffer>,
  compressedPublicKeyLength: number,
): number => {
  if (!isValidBytesKey(publicKey, compressedPublicKeyLength)) {
    throw new Error(
      `Invalid public key: The key must be a ${compressedPublicKeyLength}-byte, non-zero byte array.`,
    );
  }

  const bytes = ripemd160(sha256(publicKey));
  const view = createDataView(bytes);

  return view.getUint32(0, false);
};

/**
 * Get a secret recovery phrase (or mnemonic phrase) in string form as a
 * `Uint8Array`. The secret recovery phrase is split into words, and each word
 * is converted to a number using the BIP-39 word list. The numbers are then
 * converted to bytes, and the bytes are concatenated into a single
 * `Uint8Array`.
 *
 * @param mnemonicPhrase - The secret recovery phrase to convert.
 * @returns The `Uint8Array` corresponding to the secret recovery phrase.
 */
export function mnemonicPhraseToBytes(
  mnemonicPhrase: string,
): Uint8Array<ArrayBuffer> {
  const words = mnemonicPhrase.split(' ');
  const indices = words.map((word) => {
    const index = englishWordlist.indexOf(word);
    assert(index !== -1, `Invalid mnemonic phrase: Unknown word "${word}".`);

    return index;
  });

  return new Uint8Array(new Uint16Array(indices).buffer);
}

/**
 * Validates the curve name.
 *
 * @param curveName - The name of the curve to validate.
 */
export function validateCurve(
  curveName: unknown,
): asserts curveName is SupportedCurve {
  if (!curveName || typeof curveName !== 'string') {
    throw new Error('Invalid curve: Must specify a curve.');
  }

  if (!Object.keys(curves).includes(curveName)) {
    throw new Error(
      `Invalid curve: Only the following curves are supported: ${Object.keys(
        curves,
      ).join(', ')}.`,
    );
  }
}

/**
 * Get a 4-byte-long `Uint8Array` from a numeric value.
 *
 * @param value - The value to convert to a `Uint8Array`.
 * @param littleEndian - Whether to use little endian byte order.
 * @returns The `Uint8Array` corresponding to the `bigint` value.
 */
export function numberToUint32(
  value: number,
  littleEndian = false,
): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = createDataView(bytes);

  view.setUint32(0, value, littleEndian);

  return bytes;
}

/**
 * Validate the network. If the network is specified, it must be either
 * "mainnet" or "testnet". This function throws an error if the network is
 * invalid.
 *
 * @param network - The network to validate.
 * @throws An error if the network is invalid.
 */
export function validateNetwork(
  network: unknown,
): asserts network is Network | undefined {
  if (network === undefined) {
    return;
  }

  if (typeof network !== 'string') {
    throw new Error('Invalid network: Must be a string if specified.');
  }

  if (!['mainnet', 'testnet'].includes(network)) {
    throw new Error(
      `Invalid network: Must be either "mainnet" or "testnet" if specified.`,
    );
  }
}

/**
 * Get the BIP-44 coin type from a {@link CoinTypeHDPathTuple} or
 * {@link CoinTypeSeedPathTuple}.
 *
 * This function does not validate the derivation path, and assumes that the
 * derivation path is valid.
 *
 * @param derivationPath - The derivation path to get the BIP-44 coin type from.
 * @returns The BIP-44 coin type.
 */
export function getBIP44CoinType(
  derivationPath: CoinTypeHDPathTuple | CoinTypeSeedPathTuple,
): number {
  const pathPart = derivationPath[BIP_44_COIN_TYPE_DEPTH]
    .split(':')[1]
    ?.replace(`'`, '');

  assert(pathPart, 'Invalid derivation path: Coin type is not specified.');

  const value = Number.parseInt(pathPart, 10);
  assert(
    isValidInteger(value),
    'Invalid derivation path: Coin type is not a valid integer.',
  );

  return value;
}
