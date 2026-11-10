import { bytesToHex, hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import {
  curve,
  getPublicKey,
  isValidPrivateKey,
  publicAdd,
} from './secp256k1.js';

describe('secp256k1', () => {
  describe('curve', () => {
    it('has the curve parameters', () => {
      expect(curve.n).toBe(
        BigInt(
          '115792089237316195423570985008687907852837564279074904382605163141518161494337',
        ),
      );
    });
  });

  describe('isValidPrivateKey', () => {
    it('checks if a private key is valid', () => {
      expect(isValidPrivateKey(hexToBytes('0x0'))).toBe(false);
      expect(
        isValidPrivateKey(hexToBytes(fixtures.bip32[0].keys[0].privateKey)),
      ).toBe(true);
    });
  });

  describe('getPublicKey', () => {
    const { bip32 } = fixtures;

    it.each(bip32)('returns the public key for a private key', ({ keys }) => {
      for (const { privateKey, publicKey } of keys) {
        expect(bytesToHex(getPublicKey(hexToBytes(privateKey)))).toBe(
          publicKey,
        );
      }
    });
  });

  describe('publicAdd', () => {
    const PUBLIC_KEY = getPublicKey(
      hexToBytes(fixtures.bip32[0].keys[0].privateKey),
    );

    it.each([
      '0x7ebc0a630524c2d5ac55a98b8527a8ab2e842cd7b4037baadc463e597183408200',
      '0xa0a86d020f4c512b8639c38ecb9a3792f1575d3a4ad832e2523fd447c67170',
      '0x0efd64c97a920e71d90cf54589fb8a93',
      '0x1',
    ])('throws if the tweak is not 32 bytes long', (tweak) => {
      expect(() => publicAdd(PUBLIC_KEY, hexToBytes(tweak))).toThrow(
        'Invalid tweak: Tweak must be a non-zero 32-byte Uint8Array.',
      );
    });

    it('throws if the tweak is zero', () => {
      expect(() => publicAdd(PUBLIC_KEY, new Uint8Array(32).fill(0))).toThrow(
        'Invalid tweak: Tweak must be a non-zero 32-byte Uint8Array.',
      );
    });
  });
});
