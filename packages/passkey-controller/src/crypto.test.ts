import { decryptWithKey, deriveEncryptionKey, encryptWithKey } from './crypto';

describe('crypto', () => {
  describe('encryptWithKey / decryptWithKey', () => {
    it('round-trips the encryption key with a derived key', () => {
      const ikm = new Uint8Array(32);
      ikm.fill(11);
      const credentialId = new Uint8Array(16);
      credentialId.fill(22);

      const key = deriveEncryptionKey(ikm, credentialId);
      const plaintext = 'vault-encryption-key-material';
      const { ciphertext, iv } = encryptWithKey(plaintext, key);
      const recovered = decryptWithKey(ciphertext, iv, key);
      expect(recovered).toBe(plaintext);
    });

    it('fails decryption when a different key is used', () => {
      const keyA = deriveEncryptionKey(
        new Uint8Array(32).fill(1),
        new Uint8Array(8).fill(2),
      );
      const keyB = deriveEncryptionKey(
        new Uint8Array(32).fill(3),
        new Uint8Array(8).fill(4),
      );
      const { ciphertext, iv } = encryptWithKey('secret', keyA);
      expect(() => decryptWithKey(ciphertext, iv, keyB)).toThrow('aes/gcm');
    });
  });
});
