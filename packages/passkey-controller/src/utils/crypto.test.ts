import {
  decryptWithKey,
  deriveEncryptionKey,
  encryptWithKey,
  randomBytesToBase64URL,
} from './crypto';
import { base64URLToBytes } from './encoding';

describe('crypto', () => {
  describe('randomBytesToBase64URL', () => {
    it('returns base64url whose decoded length matches byteLength', () => {
      const encoded = randomBytesToBase64URL(32);
      expect(base64URLToBytes(encoded)).toHaveLength(32);
    });

    it('returns distinct values on successive calls', () => {
      const a = randomBytesToBase64URL(32);
      const b = randomBytesToBase64URL(32);
      expect(a).not.toBe(b);
    });
  });

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
