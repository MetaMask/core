import { hexToBytes } from '@metamask/byte-utils';
// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { describe, expect, it } from 'vitest';

import type { Curve } from '../src/curves/index.js';
import { ed25519Bip32, ed25519 } from '../src/curves/index.js';
import {
  createBip39KeyFromSeed,
  entropyToCip3MasterNode,
} from '../src/derivers/bip39.js';
import type { SLIP10Node, SLIP10PathTuple } from '../src/index.js';
import { secp256k1 } from '../src/index.js';
import derivationVectors from './vectors/derivation.json';

type Vector = (typeof derivationVectors.bip32.hardened)[0];

const masterNodeFromSeed = async (
  seed: Uint8Array<ArrayBuffer>,
  curve: Curve,
): Promise<SLIP10Node> => {
  return curve.masterNodeGenerationSpec === 'slip10'
    ? createBip39KeyFromSeed(seed, curve)
    : // in the context of tests, we assume seed to be just random bytes which we use here as entropy
      entropyToCip3MasterNode(seed, curve);
};

type Options = {
  publicDerivation?: boolean;
  curve?: Curve;
};

/**
 * Generate a test suite for the given vector.
 *
 * @param vector - The vector to test.
 * @param vector.hexSeed - The seed to use for testing.
 * @param vector.privateKey - The expected private key.
 * @param vector.publicKey - The expected public key.
 * @param vector.chainCode - The expected chain code.
 * @param vector.parentFingerprint - The expected parent fingerprint.
 * @param vector.masterFingerprint - The expected master fingerprint.
 * @param vector.index - The expected index.
 * @param vector.depth - The expected depth.
 * @param vector.keys - The expected child keys.
 * @param options - The options to use for testing.
 * @param options.publicDerivation - Whether to test public derivation. Defaults
 * to false.
 * @param options.curve - The curve to use. Defaults to secp256k1.
 */
function generateTests(
  {
    hexSeed,
    privateKey,
    publicKey,
    chainCode,
    parentFingerprint,
    masterFingerprint,
    index,
    depth,
    keys,
  }: Vector,
  { publicDerivation = false, curve = secp256k1 }: Options = {},
): void {
  describe(`seed: ${hexSeed}`, () => {
    it('derives the correct master keys', async () => {
      const node = await masterNodeFromSeed(hexToBytes(hexSeed), curve);
      expect(node.privateKey).toBe(privateKey);
      expect(node.compressedPublicKey).toBe(publicKey);
      expect(node.chainCode).toBe(chainCode);
      expect(node.parentFingerprint).toBe(parentFingerprint);
      expect(node.masterFingerprint).toBe(masterFingerprint);
      expect(node.index).toBe(index);
      expect(node.depth).toBe(depth);
    });

    it('derives the correct child keys', async () => {
      expect.assertions(keys.length * 7);

      const node = await masterNodeFromSeed(hexToBytes(hexSeed), curve);

      for (const key of keys) {
        const childNode = await node.derive(key.path.tuple as SLIP10PathTuple);

        expect(childNode.privateKey).toBe(key.privateKey);
        expect(childNode.compressedPublicKey).toBe(key.publicKey);
        expect(childNode.chainCode).toBe(key.chainCode);
        expect(childNode.parentFingerprint).toBe(key.parentFingerprint);
        expect(childNode.masterFingerprint).toBe(key.masterFingerprint);
        expect(childNode.index).toBe(key.index);
        expect(childNode.depth).toBe(key.depth);
      }
    });

    if (publicDerivation) {
      it('derives the correct public child keys', async () => {
        expect.assertions(keys.length * 7);

        const node = await masterNodeFromSeed(hexToBytes(hexSeed), curve).then(
          (privateNode) => privateNode.neuter(),
        );

        for (const key of keys) {
          const childNode = await node.derive(
            key.path.tuple as SLIP10PathTuple,
          );

          expect(childNode.privateKey).toBeUndefined();
          expect(childNode.compressedPublicKey).toBe(key.publicKey);
          expect(childNode.chainCode).toBe(key.chainCode);
          expect(childNode.parentFingerprint).toBe(key.parentFingerprint);
          expect(childNode.masterFingerprint).toBe(key.masterFingerprint);
          expect(childNode.index).toBe(key.index);
          expect(childNode.depth).toBe(key.depth);
        }
      });
    }
  });
}

describe('vectors', () => {
  describe('bip32', () => {
    describe('hardened', () => {
      for (const vector of derivationVectors.bip32.hardened) {
        generateTests(vector);
      }
    });

    describe('unhardened', () => {
      for (const vector of derivationVectors.bip32.unhardened) {
        generateTests(vector, {
          publicDerivation: true,
        });
      }
    });

    describe('mixed', () => {
      for (const vector of derivationVectors.bip32.mixed) {
        generateTests(vector);
      }
    });
  });

  describe('slip10', () => {
    describe('hardened', () => {
      describe('secp256k1', () => {
        for (const vector of derivationVectors.slip10.hardened.secp256k1) {
          generateTests(vector);
        }
      });

      describe('ed25519', () => {
        for (const vector of derivationVectors.slip10.hardened.ed25519) {
          generateTests(vector, {
            curve: ed25519,
          });
        }
      });
    });

    describe('unhardened', () => {
      for (const vector of derivationVectors.slip10.unhardened) {
        generateTests(vector, {
          publicDerivation: true,
        });
      }
    });

    describe('mixed', () => {
      for (const vector of derivationVectors.slip10.mixed) {
        generateTests(vector);
      }
    });
  });

  describe('cip3', () => {
    describe('hardened', () => {
      for (const vector of derivationVectors.cip3.hardened) {
        generateTests(vector, { curve: ed25519Bip32 });
      }
    });

    describe('unhardened', () => {
      for (const vector of derivationVectors.cip3.unhardened) {
        generateTests(vector, {
          publicDerivation: true,
          curve: ed25519Bip32,
        });
      }
    });

    describe('mixed', () => {
      for (const vector of derivationVectors.cip3.mixed) {
        generateTests(vector, { curve: ed25519Bip32 });
      }
    });
  });
});
