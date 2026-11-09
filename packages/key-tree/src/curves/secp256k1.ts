import { stringToBytes } from '@metamask/byte-utils';
import { assert } from '@metamask/type-utils';
import { secp256k1 } from '@noble/curves/secp256k1';

import { isValidBytesKey } from '../utils.js';

export const curve = secp256k1.CURVE;
export const name = 'secp256k1';

// Secret is defined in BIP-32 and SLIP-10:
// https://github.com/bitcoin/bips/blob/274fa400d630ba757bec0c03b35ebe2345197108/bip-0032.mediawiki#master-key-generation
// https://github.com/satoshilabs/slips/blob/133ea52a8e43d338b98be208907e144277e44c0e/slip-0010.md#master-key-generation
export const secret = stringToBytes('Bitcoin seed');

export const deriveUnhardenedKeys = true;

export const publicKeyLength = 65;

export const isValidPrivateKey = (privateKey: Uint8Array): boolean => {
  return secp256k1.utils.isValidPrivateKey(privateKey);
};

const getGetPublicKey = (): ((
  privateKey: Uint8Array,
  compressed?: boolean,
) => Uint8Array) => {
  let hasSetWindowSize = false;

  const getPublicKey = (
    privateKey: Uint8Array,
    compressed = false,
  ): Uint8Array => {
    if (!hasSetWindowSize) {
      secp256k1.ProjectivePoint.BASE._setWindowSize(4);
      hasSetWindowSize = true;
    }
    return secp256k1.getPublicKey(privateKey, compressed);
  };

  return getPublicKey;
};

export const getPublicKey = getGetPublicKey();

export const publicAdd = (
  publicKey: Uint8Array,
  tweak: Uint8Array,
): Uint8Array => {
  assert(
    isValidBytesKey(tweak, 32),
    'Invalid tweak: Tweak must be a non-zero 32-byte Uint8Array.',
  );

  const point = secp256k1.ProjectivePoint.fromHex(publicKey);

  // The returned child key Ki is point(parse256(IL)) + Kpar.
  // This multiplies the tweak with the base point of the curve (Gx, Gy).
  // https://github.com/bitcoin/bips/blob/274fa400d630ba757bec0c03b35ebe2345197108/bip-0032.mediawiki#public-parent-key--public-child-key
  const newPoint = point.add(secp256k1.ProjectivePoint.fromPrivateKey(tweak));
  newPoint.assertValidity();

  return newPoint.toRawBytes(false);
};

export const compressPublicKey = (publicKey: Uint8Array): Uint8Array => {
  const point = secp256k1.ProjectivePoint.fromHex(publicKey);
  return point.toRawBytes(true);
};

export const decompressPublicKey = (publicKey: Uint8Array): Uint8Array => {
  // This calculates a point on the elliptic curve from a compressed public key. We can then use
  // this to get the uncompressed version of the public key.
  const point = secp256k1.ProjectivePoint.fromHex(publicKey);
  return point.toRawBytes(false);
};

export const privateKeyLength = 32;

export const masterNodeGenerationSpec = 'slip10';

export const compressedPublicKeyLength = 33;
