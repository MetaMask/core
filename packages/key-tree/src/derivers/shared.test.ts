import { hexToBytes } from '@metamask/byte-utils';
import { describe, expect, it } from 'vitest';

import fixtures from '../../tests/fixtures.js';
import { secp256k1 } from '../curves/index.js';
import { curve } from '../curves/secp256k1.js';
import { hexStringToBytes } from '../utils.js';
import { privateAdd } from './shared.js';

describe('privateAdd', () => {
  const PRIVATE_KEY = hexStringToBytes(
    '51f34c9afc9d5b43e085688db58bb923c012bb07e42a8eaf18a8400aa9a167fb',
  );

  it.each(fixtures['secp256k1-node'].privateAdd)(
    'adds a tweak to a private key',
    ({ privateKey, tweak, result }) => {
      const expected = hexStringToBytes(result);

      expect(
        privateAdd(
          hexStringToBytes(privateKey),
          hexStringToBytes(tweak),
          secp256k1,
        ),
      ).toStrictEqual(expected);
    },
  );

  it('throws if the tweak is larger than the curve order', () => {
    const tweak = hexStringToBytes(curve.n.toString(16));

    expect(() => privateAdd(PRIVATE_KEY, tweak, secp256k1)).toThrow(
      'Invalid tweak: Tweak is larger than the curve order.',
    );
  });

  it('throws if the result is invalid', () => {
    // n - 1
    const privateKey = hexStringToBytes(
      'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364140',
    );

    // 1
    const tweak = hexStringToBytes(
      '0000000000000000000000000000000000000000000000000000000000000001',
    );

    expect(() => privateAdd(privateKey, tweak, secp256k1)).toThrow(
      'Invalid private key or tweak: The resulting private key is invalid.',
    );
  });

  it.each([
    '0x7ebc0a630524c2d5ac55a98b8527a8ab2e842cd7b4037baadc463e597183408200',
    '0xa0a86d020f4c512b8639c38ecb9a3792f1575d3a4ad832e2523fd447c67170',
    '0x0efd64c97a920e71d90cf54589fb8a93',
    '0x1',
  ])('throws if the tweak is not 32 bytes long', (tweak) => {
    expect(() => privateAdd(PRIVATE_KEY, hexToBytes(tweak), secp256k1)).toThrow(
      'Invalid tweak: Tweak must be a non-zero 32-byte Uint8Array.',
    );
  });

  it('throws if the tweak is zero', () => {
    expect(() =>
      privateAdd(PRIVATE_KEY, new Uint8Array(32).fill(0), secp256k1),
    ).toThrow('Invalid tweak: Tweak must be a non-zero 32-byte Uint8Array.');
  });
});
