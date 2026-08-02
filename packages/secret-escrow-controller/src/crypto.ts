import { bytesToBase64, base64ToBytes } from '@metamask/utils';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';

const AES_GCM_IV_LENGTH = 12;

/**
 * AES-256-GCM ciphertext of a wallet password wrapped under an escrow secret.
 */
export type WrappedPassword = {
  ciphertext: string;
  iv: string;
};

/**
 * Encrypts a wallet password under a 32-byte escrow secret.
 *
 * @param password - Wallet password to wrap.
 * @param secret - 32-byte escrow secret.
 * @returns Base64 ciphertext and IV.
 */
export function wrapPassword(
  password: string,
  secret: Uint8Array,
): WrappedPassword {
  if (secret.byteLength !== 32) {
    throw new Error('Escrow secret must be 32 bytes');
  }
  const iv = randomBytes(AES_GCM_IV_LENGTH);
  const encoded = new TextEncoder().encode(password);
  const ciphertextBytes = gcm(secret, iv).encrypt(encoded);
  return {
    ciphertext: bytesToBase64(ciphertextBytes),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypts a wallet password previously wrapped with {@link wrapPassword}.
 *
 * @param wrapped - Ciphertext and IV.
 * @param secret - 32-byte escrow secret.
 * @returns Plaintext password.
 */
export function unwrapPassword(
  wrapped: WrappedPassword,
  secret: Uint8Array,
): string {
  if (secret.byteLength !== 32) {
    throw new Error('Escrow secret must be 32 bytes');
  }
  const plaintext = gcm(secret, base64ToBytes(wrapped.iv)).decrypt(
    base64ToBytes(wrapped.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
