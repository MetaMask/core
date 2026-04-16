import { bytesToBase64, base64ToBytes } from '@metamask/utils';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

const PASSKEY_HKDF_INFO = 'metamask:passkey:encryption-key:v1';

const AES_GCM_IV_LENGTH = 12;

/**
 * Derives an AES-256 encryption key from input key material and a credential ID
 * using HKDF-SHA256.
 *
 * @param ikm - Input key material (e.g. PRF output or userHandle).
 * @param salt - HKDF salt.
 * @returns 32-byte derived encryption key.
 */
export function deriveEncryptionKey(
  ikm: Uint8Array,
  salt: Uint8Array,
): Uint8Array {
  return hkdf(sha256, ikm, salt, PASSKEY_HKDF_INFO, 32);
}

/**
 * Encrypts plaintext with an AES-256-GCM key.
 *
 * @param plaintext - UTF-8 string to encrypt.
 * @param key - 32-byte AES-256 key from {@link deriveEncryptionKey}.
 * @returns Base64-encoded ciphertext and IV.
 */
export function encryptWithKey(
  plaintext: string,
  key: Uint8Array,
): { ciphertext: string; iv: string } {
  const iv = randomBytes(AES_GCM_IV_LENGTH);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertextBytes = gcm(key, iv).encrypt(encoded);

  return {
    ciphertext: bytesToBase64(ciphertextBytes),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypts AES-256-GCM ciphertext with the given key.
 *
 * @param ciphertext - Base64-encoded ciphertext.
 * @param iv - Base64-encoded initialization vector.
 * @param key - 32-byte AES-256 key from {@link deriveEncryptionKey}.
 * @returns Decrypted UTF-8 string.
 */
export function decryptWithKey(
  ciphertext: string,
  iv: string,
  key: Uint8Array,
): string {
  const ciphertextBytes = base64ToBytes(ciphertext);
  const ivBytes = base64ToBytes(iv);
  const plaintext = gcm(key, ivBytes).decrypt(ciphertextBytes);

  return new TextDecoder().decode(plaintext);
}
