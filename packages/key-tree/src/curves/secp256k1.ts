import { stringToBytes } from '@metamask/byte-utils';
import { assert } from '@metamask/type-utils';
import { secp256k1 } from '@noble/curves/secp256k1';

import { isValidBytesKey } from '../utils.js';

export const curve = secp256k1.Point.CURVE();
export const name = 'secp256k1';

// Secret is defined in BIP-32 and SLIP-10:
// https://github.com/bitcoin/bips/blob/274fa400d630ba757bec0c03b35ebe2345197108/bip-0032.mediawiki#master-key-generation
// https://github.com/satoshilabs/slips/blob/133ea52a8e43d338b98be208907e144277e44c0e/slip-0010.md#master-key-generation
export const secret = stringToBytes('Bitcoin seed');

export const deriveUnhardenedKeys = true;

export const publicKeyLength = 65;

export const isValidPrivateKey = (
  privateKey: Uint8Array<ArrayBuffer>,
): boolean => {
  return secp256k1.utils.isValidSecretKey(privateKey);
};

const getGetPublicKey = (): ((
  privateKey: Uint8Array<ArrayBuffer>,
  compressed?: boolean,
) => Uint8Array<ArrayBuffer>) => {
  let hasPrecomputed = false;

  const getPublicKey = (
    privateKey: Uint8Array<ArrayBuffer>,
    compressed = false,
  ): Uint8Array<ArrayBuffer> => {
    if (!hasPrecomputed) {
      secp256k1.Point.BASE.precompute(4);
      hasPrecomputed = true;
    }

    return secp256k1.getPublicKey(
      privateKey,
      compressed,
    ) as Uint8Array<ArrayBuffer>;
  };

  return getPublicKey;
};

export const getPublicKey = getGetPublicKey();

export const publicAdd = (
  publicKey: Uint8Array<ArrayBuffer>,
  tweak: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  assert(
    isValidBytesKey(tweak, 32),
    'Invalid tweak: Tweak must be a non-zero 32-byte Uint8Array.',
  );

  const point = secp256k1.Point.fromHex(publicKey);

  // The returned child key Ki is point(parse256(IL)) + Kpar.
  // This multiplies the tweak with the base point of the curve (Gx, Gy).
  // https://github.com/bitcoin/bips/blob/274fa400d630ba757bec0c03b35ebe2345197108/bip-0032.mediawiki#public-parent-key--public-child-key
  const newPoint = point.add(
    secp256k1.Point.BASE.multiply(secp256k1.Point.Fn.fromBytes(tweak)),
  );

  newPoint.assertValidity();

  return newPoint.toBytes(false) as Uint8Array<ArrayBuffer>;
};

export const compressPublicKey = (
  publicKey: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  const point = secp256k1.Point.fromHex(publicKey);
  return point.toBytes(true) as Uint8Array<ArrayBuffer>;
};

export const decompressPublicKey = (
  publicKey: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  // This calculates a point on the elliptic curve from a compressed public key. We can then use
  // this to get the uncompressed version of the public key.
  const point = secp256k1.Point.fromHex(publicKey);
  return point.toBytes(false) as Uint8Array<ArrayBuffer>;
};

export const privateKeyLength = 32;

export const masterNodeGenerationSpec = 'slip10';

export const compressedPublicKeyLength = 33;
