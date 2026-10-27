import { IV_LENGTH } from '@metamask/cryptography/aes-gcm';
import { base64ToBytes, stringToBytes } from '@metamask/utils';

import { describe, expect, it } from 'vitest';

import { decryptStringWithKey, encryptStringWithKey } from './encryption.js';

const encryptionKey = stringToBytes('01234567890123456789012345678901');
const differentEncryptionKey = stringToBytes(
  '12345678901234567890123456789012',
);

describe('encryption utilities', () => {
  describe('encryptStringWithKey and decryptStringWithKey', () => {
    it('round trips a string using the base64 iv and ciphertext format', async () => {
      const value = 'keyring encryption key';

      const encryptedValue = await encryptStringWithKey(value, encryptionKey);

      expect(base64ToBytes(encryptedValue).length).toBeGreaterThan(IV_LENGTH);
      expect(await decryptStringWithKey(encryptedValue, encryptionKey)).toBe(
        value,
      );
    });

    it('supports unicode and empty strings', async () => {
      for (const value of ['こんにちは 🔐', '']) {
        const encryptedValue = await encryptStringWithKey(value, encryptionKey);

        expect(await decryptStringWithKey(encryptedValue, encryptionKey)).toBe(
          value,
        );
      }
    });

    it('rejects decryption with a different key', async () => {
      const encryptedValue = await encryptStringWithKey(
        'sensitive value',
        encryptionKey,
      );

      await expect(
        decryptStringWithKey(encryptedValue, differentEncryptionKey),
      ).rejects.toThrow(/./u);
    });
  });
});
