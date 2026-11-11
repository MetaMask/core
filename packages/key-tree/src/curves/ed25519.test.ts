import { bytesToHex, hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import {
  compressPublicKey,
  curve,
  decompressPublicKey,
  getPublicKey,
  isValidPrivateKey,
  publicAdd,
} from './ed25519.js';

describe('ed25519', () => {
  describe('curve', () => {
    it('has the curve parameters', () => {
      // This is unused for derivation, but to keep the coverage and TypeScript happy, there's
      // a simple test here that asserts the value of `curve.n`.
      expect(curve.n).toBe(
        BigInt(
          '7237005577332262213973186563042994240857116359379907606001950938285454250989',
        ),
      );
    });
  });

  describe('isValidPrivateKey', () => {
    it('returns true', () => {
      expect(
        isValidPrivateKey(fixtures.ed25519.slip10[0].keys[0].privateKey),
      ).toBe(true);
    });
  });

  describe('getPublicKey', () => {
    const { slip10 } = fixtures.ed25519;

    it.each(slip10)(
      'returns the 0-padded public key for a private key',
      async ({ keys }) => {
        for (const { privateKey, publicKey } of keys) {
          expect(bytesToHex(getPublicKey(hexToBytes(privateKey)))).toBe(
            publicKey,
          );

          expect(bytesToHex(getPublicKey(hexToBytes(privateKey), true))).toBe(
            publicKey,
          );
        }
      },
    );
  });

  describe('publicAdd', () => {
    it('throws an error', () => {
      expect(() => publicAdd(new Uint8Array([1]), new Uint8Array([1]))).toThrow(
        'Ed25519 does not support public key derivation.',
      );
    });
  });

  describe('compressPublicKey', () => {
    const { slip10 } = fixtures.ed25519;

    it.each(slip10)('returns the same public key', ({ keys }) => {
      for (const { publicKey } of keys) {
        const publicKeyBytes = hexToBytes(publicKey);
        expect(compressPublicKey(publicKeyBytes)).toStrictEqual(publicKeyBytes);
      }
    });
  });

  describe('decompressPublicKey', () => {
    const { slip10 } = fixtures.ed25519;

    it.each(slip10)('returns the same public key', ({ keys }) => {
      for (const { publicKey } of keys) {
        const publicKeyBytes = hexToBytes(publicKey);
        expect(decompressPublicKey(publicKeyBytes)).toStrictEqual(
          publicKeyBytes,
        );
      }
    });
  });
});
