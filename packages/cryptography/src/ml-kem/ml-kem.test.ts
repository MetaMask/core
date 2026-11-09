import { bytesToHex, hexToBytes } from '@metamask/utils';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as mlKem768 from './ml-kem-768.js';
import * as mlKem1024 from './ml-kem-1024.js';

type WycheproofVector = {
  seed: string;
  ek: string;
  c: string;
  K: string;
};

// Test case 2 (the first valid case) of each Wycheproof ML-KEM test file,
// `mlkem_768_test.json` and `mlkem_1024_test.json`:
// https://github.com/C2SP/wycheproof/tree/main/testvectors_v1
const vectors: Record<string, WycheproofVector> = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../tests/fixtures/ml-kem-wycheproof.json'),
    'utf8',
  ),
);

describe.each([
  {
    name: 'ML-KEM-768',
    mlKem: mlKem768,
    publicKeyLength: 1184,
    ciphertextLength: 1088,
  },
  {
    name: 'ML-KEM-1024',
    mlKem: mlKem1024,
    publicKeyLength: 1568,
    ciphertextLength: 1568,
  },
])('$name', ({ name, mlKem, publicKeyLength, ciphertextLength }) => {
  const vector = vectors[name] as WycheproofVector;
  const seed = hexToBytes(vector.seed);
  const publicKey = hexToBytes(vector.ek);
  const ciphertext = hexToBytes(vector.c);
  const sharedSecret = hexToBytes(vector.K);

  describe('decapsulate', () => {
    it('recovers the shared secret of a Wycheproof test case', async () => {
      const result = await mlKem.decapsulate(seed, ciphertext);

      expect(bytesToHex(result)).toBe(bytesToHex(sharedSecret));
    });

    it('accepts an ArrayBuffer seed and ciphertext', async () => {
      const result = await mlKem.decapsulate(seed.buffer, ciphertext.buffer);

      expect(bytesToHex(result)).toBe(bytesToHex(sharedSecret));
    });

    it('accepts a DataView seed and ciphertext', async () => {
      const result = await mlKem.decapsulate(
        new DataView(seed.buffer),
        new DataView(ciphertext.buffer),
      );

      expect(bytesToHex(result)).toBe(bytesToHex(sharedSecret));
    });

    it('throws if the seed is too short', async () => {
      await expect(
        mlKem.decapsulate(new Uint8Array(63), ciphertext),
      ).rejects.toThrow(
        `Invalid seed length: Seed must be exactly 64 bytes for ${name}.`,
      );
    });

    it('throws if the seed is too long', async () => {
      await expect(
        mlKem.decapsulate(new Uint8Array(65), ciphertext),
      ).rejects.toThrow(
        `Invalid seed length: Seed must be exactly 64 bytes for ${name}.`,
      );
    });

    it('throws if the ciphertext is too short', async () => {
      await expect(
        mlKem.decapsulate(seed, new Uint8Array(ciphertextLength - 1)),
      ).rejects.toThrow(
        `Invalid ciphertext length: Ciphertext must be exactly ${ciphertextLength} bytes for ${name}.`,
      );
    });

    it('throws if the ciphertext is too long', async () => {
      await expect(
        mlKem.decapsulate(seed, new Uint8Array(ciphertextLength + 1)),
      ).rejects.toThrow(
        `Invalid ciphertext length: Ciphertext must be exactly ${ciphertextLength} bytes for ${name}.`,
      );
    });
  });

  describe('encapsulate', () => {
    it('returns a ciphertext and a shared secret of the expected lengths', async () => {
      const result = await mlKem.encapsulate(publicKey);

      expect(result.ciphertext).toHaveLength(ciphertextLength);
      expect(result.sharedSecret).toHaveLength(32);
    });

    // Encapsulation is randomized and WebCrypto does not allow supplying the
    // randomness, so there are no known answers to compare against. Instead,
    // check that decapsulating (which is covered by the test vectors above)
    // recovers the same shared secret.
    it('returns a shared secret that the holder of the seed can recover', async () => {
      const result = await mlKem.encapsulate(publicKey);

      const recovered = await mlKem.decapsulate(seed, result.ciphertext);

      expect(bytesToHex(recovered)).toBe(bytesToHex(result.sharedSecret));
    });

    it('returns a different ciphertext and shared secret each time', async () => {
      const first = await mlKem.encapsulate(publicKey);
      const second = await mlKem.encapsulate(publicKey);

      expect(bytesToHex(first.ciphertext)).not.toBe(
        bytesToHex(second.ciphertext),
      );
      expect(bytesToHex(first.sharedSecret)).not.toBe(
        bytesToHex(second.sharedSecret),
      );
    });

    it('accepts an ArrayBuffer public key', async () => {
      const result = await mlKem.encapsulate(publicKey.buffer);

      expect(result.ciphertext).toHaveLength(ciphertextLength);
    });

    it('accepts a DataView public key', async () => {
      const result = await mlKem.encapsulate(new DataView(publicKey.buffer));

      expect(result.ciphertext).toHaveLength(ciphertextLength);
    });

    it('throws if the public key is too short', async () => {
      await expect(
        mlKem.encapsulate(new Uint8Array(publicKeyLength - 1)),
      ).rejects.toThrow(
        `Invalid public key length: Public key must be exactly ${publicKeyLength} bytes for ${name}.`,
      );
    });

    it('throws if the public key is too long', async () => {
      await expect(
        mlKem.encapsulate(new Uint8Array(publicKeyLength + 1)),
      ).rejects.toThrow(
        `Invalid public key length: Public key must be exactly ${publicKeyLength} bytes for ${name}.`,
      );
    });
  });
});
