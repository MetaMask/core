import { createDataView } from '@metamask/byte-utils';
import { assertExhaustive } from '@metamask/type-utils';

import { validateBIP44Depth } from './BIP44Node.js';
import type { Network } from './constants.js';
import { compressPublicKey, decompressPublicKey } from './curves/secp256k1.js';
import {
  decodeBase58check,
  encodeBase58check,
  isValidBytesKey,
} from './utils.js';

// https://github.com/bitcoin/bips/blob/274fa400d630ba757bec0c03b35ebe2345197108/bip-0032.mediawiki#Serialization_format
const PUBLIC_KEY_VERSION = 0x0488b21e;
const PRIVATE_KEY_VERSION = 0x0488ade4;

const TESTNET_PUBLIC_KEY_VERSION = 0x043587cf;
const TESTNET_PRIVATE_KEY_VERSION = 0x04358394;

/**
 * An extended public or private key. Contains either a public or private key,
 * depending on the version.
 */
type ExtendedKeyLike = {
  depth: number;
  parentFingerprint: number;
  index: number;
  network: Network;
  chainCode: Uint8Array<ArrayBuffer>;
};

type ExtendedPublicKey = ExtendedKeyLike & {
  type: 'public';
  publicKey: Uint8Array<ArrayBuffer>;
};

type ExtendedPrivateKey = ExtendedKeyLike & {
  type: 'private';
  privateKey: Uint8Array<ArrayBuffer>;
};

export type ExtendedKey = ExtendedPublicKey | ExtendedPrivateKey;

type VersionOptions =
  | {
      type: 'public';
      network: Network;
    }
  | {
      type: 'private';
      network: Network;
    };

/**
 * Get the version options for a given version.
 *
 * @param version - The version to get the options for.
 * @returns The version options.
 */
function getVersionOptions(version: number): VersionOptions {
  switch (version) {
    case PUBLIC_KEY_VERSION:
      return { type: 'public', network: 'mainnet' };
    case TESTNET_PUBLIC_KEY_VERSION:
      return { type: 'public', network: 'testnet' };
    case PRIVATE_KEY_VERSION:
      return { type: 'private', network: 'mainnet' };
    case TESTNET_PRIVATE_KEY_VERSION:
      return { type: 'private', network: 'testnet' };
    default:
      throw new Error(
        `Invalid extended key: Expected a public (xpub) or private key (xprv) version.`,
      );
  }
}

/**
 * Get the version for a given network and type.
 *
 * @param network - The network to get the version for.
 * @param type - The type to get the version for.
 * @returns The version.
 */
function getVersionFromNetwork(
  network: Network,
  type: 'public' | 'private',
): number {
  switch (network) {
    case 'mainnet':
      return type === 'public' ? PUBLIC_KEY_VERSION : PRIVATE_KEY_VERSION;
    case 'testnet':
      return type === 'public'
        ? TESTNET_PUBLIC_KEY_VERSION
        : TESTNET_PRIVATE_KEY_VERSION;
    default:
      return assertExhaustive(network);
  }
}

/**
 * Decode an extended public or private key. In the case of an extended public
 * key, the public key is returned in the uncompressed form.
 *
 * Throws an error if the extended key is invalid.
 *
 * @param extendedKey - The extended key string to attempt to decode.
 * @returns The decoded extended key.
 */
export const decodeExtendedKey = (extendedKey: string): ExtendedKey => {
  const bytes = decodeBase58check(extendedKey);

  if (bytes.length !== 78) {
    throw new Error(
      `Invalid extended key: Expected a length of 78, got ${bytes.length}.`,
    );
  }

  const view = createDataView(bytes);

  const version = view.getUint32(0, false);
  const { network, type } = getVersionOptions(version);

  const depth = view.getUint8(4);
  validateBIP44Depth(depth);

  const parentFingerprint = view.getUint32(5, false);
  const index = view.getUint32(9, false);

  const chainCode = bytes.slice(13, 45);
  if (!isValidBytesKey(chainCode, 32)) {
    throw new Error(
      `Invalid extended key: Chain code must be a 32-byte non-zero byte array.`,
    );
  }

  const key = bytes.slice(45, 78);
  if (!isValidBytesKey(key, 33)) {
    throw new Error(
      `Invalid extended key: Key must be a 33-byte non-zero byte array.`,
    );
  }

  const keyView = createDataView(key);

  if (type === 'public') {
    if (keyView.getUint8(0) !== 0x02 && keyView.getUint8(0) !== 0x03) {
      throw new Error(
        `Invalid extended key: Public key must start with 0x02 or 0x03.`,
      );
    }

    return {
      type,
      depth,
      parentFingerprint,
      index,
      network,
      chainCode,
      publicKey: decompressPublicKey(key),
    };
  }

  if (keyView.getUint8(0) !== 0x00) {
    throw new Error(`Invalid extended key: Private key must start with 0x00.`);
  }

  return {
    type,
    depth,
    parentFingerprint,
    index,
    network,
    chainCode,
    privateKey: key.slice(1),
  };
};

/**
 * Encodes an extended public or private key. Assumes that all the inputs are verified beforehand.
 *
 * @param extendedKey - The extended key data to encode.
 * @returns The encoded extended key.
 */
export const encodeExtendedKey = (extendedKey: ExtendedKey): string => {
  const { type, depth, parentFingerprint, index, network, chainCode } =
    extendedKey;

  const bytes = new Uint8Array(78);

  const view = createDataView(bytes);
  const version = getVersionFromNetwork(network, type);

  view.setUint32(0, version, false);
  view.setUint8(4, depth);
  view.setUint32(5, parentFingerprint, false);
  view.setUint32(9, index, false);

  bytes.set(chainCode, 13);

  if (type === 'public') {
    const { publicKey } = extendedKey;
    const compressedPublicKey = compressPublicKey(publicKey);

    bytes.set(compressedPublicKey, 45);
  }

  if (type === 'private') {
    const { privateKey } = extendedKey;
    bytes.set(privateKey, 46);
  }

  return encodeBase58check(bytes);
};
