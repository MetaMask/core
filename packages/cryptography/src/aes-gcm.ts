import { toUint8Array } from './utils.js';

// https://www.rfc-editor.org/rfc/rfc5116#section-5.1
const AES_GCM_IV_LENGTH = 12;

export type AesGcmOptions = {
  /**
   * Skip the IV length check. Using an IV other than 12 bytes deviates from
   * the standard and is considered less safe.
   */
  unsafeIvLength?: boolean;
};

/**
 * Encrypt data using AES-GCM.
 *
 * @param key - The 16, 24, or 32-byte AES key.
 * @param iv - The initialization vector.
 * @param plaintext - The plaintext.
 * @param options - Additional configuration options.
 * @returns The ciphertext.
 */
export async function encrypt(
  key: BufferSource,
  iv: BufferSource,
  plaintext: BufferSource,
  options?: AesGcmOptions,
): Promise<Uint8Array> {
  if (key.byteLength === 0) {
    throw new Error(
      'Invalid key length: Key must not be zero bytes for AES-GCM.',
    );
  }

  if (iv.byteLength === 0) {
    throw new Error(
      'Invalid IV length: IV must not be zero bytes for AES-GCM.',
    );
  }

  if (!options?.unsafeIvLength && iv.byteLength !== AES_GCM_IV_LENGTH) {
    throw new Error(
      `Unsafe IV length: IV must be exactly ${AES_GCM_IV_LENGTH} bytes for AES-GCM. To bypass this check, set the \`unsafeIvLength\` option to \`true\`.`,
    );
  }

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    // Converting to Uint8Array to work around a Node 22 bug, we may be able to remove in the future.
    { name: 'AES-GCM', iv: toUint8Array(iv) },
    subtleKey,
    toUint8Array(plaintext),
  );

  return new Uint8Array(ciphertext);
}

/**
 * Decrypt data using AES-GCM.
 *
 * @param key - The 16, 24, or 32-byte AES key.
 * @param iv - The initialization vector.
 * @param ciphertext - The ciphertext.
 * @param options - Additional configuration options.
 * @returns The decrypted plaintext.
 */
export async function decrypt(
  key: BufferSource,
  iv: BufferSource,
  ciphertext: BufferSource,
  options?: AesGcmOptions,
): Promise<Uint8Array> {
  if (key.byteLength === 0) {
    throw new Error(
      'Invalid key length: Key must not be zero bytes for AES-GCM.',
    );
  }

  if (iv.byteLength === 0) {
    throw new Error(
      'Invalid IV length: IV must not be zero bytes for AES-GCM.',
    );
  }

  if (!options?.unsafeIvLength && iv.byteLength !== AES_GCM_IV_LENGTH) {
    throw new Error(
      `Unsafe IV length: IV must be exactly ${AES_GCM_IV_LENGTH} bytes for AES-GCM. To bypass this check, set the \`unsafeIvLength\` option to \`true\`.`,
    );
  }

  const subtleKey = await globalThis.crypto.subtle.importKey(
    'raw',
    key,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const plaintext = await globalThis.crypto.subtle.decrypt(
    // Converting to Uint8Array to work around a Node 22 bug, we may be able to remove in the future.
    { name: 'AES-GCM', iv: toUint8Array(iv) },
    subtleKey,
    toUint8Array(ciphertext),
  );

  return new Uint8Array(plaintext);
}
