import { deriveWrappingKey, unwrapKey, wrapKey } from './crypto';

describe('crypto', () => {
  describe('wrapKey / unwrapKey', () => {
    it('round-trips the encryption key with a derived wrapping key', async () => {
      const ikm = new Uint8Array(32);
      ikm.fill(11);
      const credentialId = new Uint8Array(16);
      credentialId.fill(22);

      const wrappingKey = await deriveWrappingKey(
        ikm.buffer,
        credentialId.buffer,
      );
      const plaintext = 'vault-encryption-key-material';
      const { ciphertext, iv } = await wrapKey(plaintext, wrappingKey);
      const recovered = await unwrapKey(ciphertext, iv, wrappingKey);
      expect(recovered).toBe(plaintext);
    });

    it('fails unwrap when a different wrapping key is used', async () => {
      const wrappingKeyA = await deriveWrappingKey(
        new Uint8Array(32).fill(1).buffer,
        new Uint8Array(8).fill(2).buffer,
      );
      const wrappingKeyB = await deriveWrappingKey(
        new Uint8Array(32).fill(3).buffer,
        new Uint8Array(8).fill(4).buffer,
      );
      const { ciphertext, iv } = await wrapKey('secret', wrappingKeyA);
      await expect(unwrapKey(ciphertext, iv, wrappingKeyB)).rejects.toThrow(
        'The operation failed for an operation-specific reason',
      );
    });
  });
});
