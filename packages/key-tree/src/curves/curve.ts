import * as ed25519 from './ed25519.js';
import * as ed25519Bip32 from './ed25519Bip32.js';
import * as secp256k1 from './secp256k1.js';

export type SupportedCurve = keyof typeof curves;

export const curves = {
  secp256k1,
  ed25519,
  ed25519Bip32,
};

type CurveSpecification =
  | {
      masterNodeGenerationSpec: 'slip10';
      name: Extract<SupportedCurve, 'secp256k1' | 'ed25519'>;
    }
  | {
      name: Extract<SupportedCurve, 'ed25519Bip32'>;
      masterNodeGenerationSpec: 'cip3';
    };

export type Curve = {
  secret: Uint8Array<ArrayBuffer>;
  deriveUnhardenedKeys: boolean;
  publicKeyLength: number;
  curve: {
    n: bigint;
  };
  getPublicKey: (
    privateKey: Uint8Array<ArrayBuffer>,
    compressed?: boolean,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  isValidPrivateKey: (privateKey: Uint8Array<ArrayBuffer>) => boolean;
  publicAdd: (
    publicKey: Uint8Array<ArrayBuffer>,
    tweak: Uint8Array<ArrayBuffer>,
  ) => Uint8Array<ArrayBuffer>;
  compressPublicKey: (
    publicKey: Uint8Array<ArrayBuffer>,
  ) => Uint8Array<ArrayBuffer>;
  decompressPublicKey: (
    publicKey: Uint8Array<ArrayBuffer>,
  ) => Uint8Array<ArrayBuffer>;
  privateKeyLength: number;
  compressedPublicKeyLength: number;
} & CurveSpecification;

/**
 * Get a curve by name.
 *
 * @param curveName - The name of the curve to get.
 * @returns The curve.
 */
export function getCurveByName(curveName: SupportedCurve): Curve {
  return curves[curveName];
}

export { mod } from '@noble/curves/abstract/modular';
