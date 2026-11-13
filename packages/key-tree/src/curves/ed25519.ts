import { concatBytes, stringToBytes } from '@metamask/byte-utils';
import { getPublicKey as getPublicKeyNative } from '@metamask/cryptography/ed25519';
import { ed25519 } from '@noble/curves/ed25519';

export const curve = ed25519.CURVE;
export const name = 'ed25519';

// Secret is defined in SLIP-10:
// https://github.com/satoshilabs/slips/blob/133ea52a8e43d338b98be208907e144277e44c0e/slip-0010.md#master-key-generation
export const secret = stringToBytes('ed25519 seed');

// All private keys are valid for ed25519:
// https://github.com/satoshilabs/slips/blob/133ea52a8e43d338b98be208907e144277e44c0e/slip-0010.md#master-key-generation
export const isValidPrivateKey = (
  _privateKey: Uint8Array<ArrayBuffer> | string | bigint,
): boolean => true;

export const deriveUnhardenedKeys = false;

export const publicKeyLength = 33;

export const getPublicKey = async (
  privateKey: Uint8Array<ArrayBuffer>,
  _compressed?: boolean,
): Promise<Uint8Array<ArrayBuffer>> => {
  const publicKey = await getPublicKeyNative(privateKey);
  return concatBytes([new Uint8Array([0]), publicKey]);
};

export const publicAdd = (
  _publicKey: Uint8Array<ArrayBuffer>,
  _tweak: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  throw new Error('Ed25519 does not support public key derivation.');
};

export const compressPublicKey = (
  publicKey: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  // Ed25519 public keys don't have a compressed form.
  return publicKey;
};

export const decompressPublicKey = (
  publicKey: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> => {
  // Ed25519 public keys don't have a compressed form.
  return publicKey;
};

export const privateKeyLength = 32;

export const masterNodeGenerationSpec = 'slip10';

export const compressedPublicKeyLength = 33;
