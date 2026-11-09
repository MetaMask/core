import { base64ToBytes, hexToBytes, stringToBytes } from '@metamask/utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as mlDsa44 from './ml-dsa-44.js';
import * as mlDsa65 from './ml-dsa-65.js';
import * as mlDsa87 from './ml-dsa-87.js';

// Test vectors from the Web Platform Tests WebCrypto ML-DSA suite, which is
// also used by Node.js. See https://github.com/web-platform-tests/wpt/blob/master/WebCryptoAPI/modern-algos/sign_verify/mldsa_vectors.js.
const message = stringToBytes(
  'ML-DSA test message for signing and verification. This is a test of ML-DSA implementation.',
);
const { vectors } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../tests/ml-dsa-wpt-vectors.json'),
    'utf8',
  ),
) as {
  vectors: {
    algorithm: keyof typeof VARIANTS;
    seed: string;
    publicKey: string;
    signature: string;
  }[];
};

const VARIANTS = {
  'ML-DSA-44': {
    module: mlDsa44,
    publicKeyLength: 1312,
    signatureLength: 2420,
  },
  'ML-DSA-65': {
    module: mlDsa65,
    publicKeyLength: 1952,
    signatureLength: 3309,
  },
  'ML-DSA-87': {
    module: mlDsa87,
    publicKeyLength: 2592,
    signatureLength: 4627,
  },
};

describe.each(vectors)('$algorithm', (vector) => {
  const { algorithm } = vector;
  const { module, publicKeyLength, signatureLength } = VARIANTS[algorithm];
  const seed = hexToBytes(vector.seed);
  const publicKey = base64ToBytes(vector.publicKey);
  const signature = base64ToBytes(vector.signature);

  describe('sign', () => {
    it('produces a signature that verifies against the WPT public key', async () => {
      const result = await module.sign(seed, message);

      expect(result).toHaveLength(signatureLength);
      expect(await module.verify(publicKey, result, message)).toBe(true);
    });

    it('throws if the seed is not 32 bytes', async () => {
      await expect(module.sign(new Uint8Array(31), message)).rejects.toThrow(
        'Invalid seed length: Seed must be exactly 32 bytes for ML-DSA.',
      );
    });
  });

  describe('verify', () => {
    it('verifies the WPT signature', async () => {
      expect(await module.verify(publicKey, signature, message)).toBe(true);
    });

    it('returns false if the data was modified', async () => {
      expect(
        await module.verify(
          publicKey,
          signature,
          stringToBytes('a different message'),
        ),
      ).toBe(false);
    });

    it('returns false if the signature was modified', async () => {
      expect(await module.verify(publicKey, new Uint8Array(signatureLength), message)).toBe(false);
    });

    it(`throws if the public key is not ${publicKeyLength} bytes`, async () => {
      await expect(
        module.verify(publicKey.slice(1), signature, message),
      ).rejects.toThrow(
        `Invalid public key length: Public key must be exactly ${publicKeyLength} bytes for ${algorithm}.`,
      );
    });

    it(`throws if the signature is not ${signatureLength} bytes`, async () => {
      await expect(
        module.verify(publicKey, new Uint8Array([1, 2, 3, 4, 5]), message),
      ).rejects.toThrow(
        `Invalid signature length: Signature must be exactly ${signatureLength} bytes for ${algorithm}.`,
      );
    });
  });
});
