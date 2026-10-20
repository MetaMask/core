import { decrypt, encrypt, IV_LENGTH } from '@metamask/cryptography/aes-gcm';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToString,
  concatBytes,
  stringToBytes,
} from '@metamask/utils';

/**
 * Encrypt a string with AES-GCM and encode the IV and ciphertext together.
 *
 * The returned format is base64(`iv || ciphertext`), which is also the
 * persisted format used for Seedless and Keyring encryption keys.
 *
 * @param value - The string to encrypt.
 * @param encryptionKey - The AES-GCM encryption key.
 * @returns The base64-encoded IV and ciphertext.
 */
export async function encryptStringWithKey(
  value: string,
  encryptionKey: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const { ciphertext, iv } = await encrypt(encryptionKey, stringToBytes(value));
  return bytesToBase64(concatBytes([iv, ciphertext]));
}

/**
 * Decode and decrypt a base64(`iv || ciphertext`) string.
 *
 * @param encryptedValue - The base64-encoded IV and ciphertext.
 * @param encryptionKey - The AES-GCM encryption key.
 * @returns The decrypted string.
 */
export async function decryptStringWithKey(
  encryptedValue: string,
  encryptionKey: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const encryptedBytes = base64ToBytes(encryptedValue);
  const iv = encryptedBytes.slice(0, IV_LENGTH);
  const ciphertext = encryptedBytes.slice(IV_LENGTH);
  const value = await decrypt(encryptionKey, iv, ciphertext);
  return bytesToString(value);
}
