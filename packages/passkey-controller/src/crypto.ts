import { PASSKEY_HKDF_INFO } from './constants';
import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';

export async function deriveWrappingKey(
  ikm: ArrayBuffer,
  credentialId: ArrayBuffer,
): Promise<CryptoKey> {
  const rawKey = await globalThis.crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  return globalThis.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: credentialId,
      info: new TextEncoder().encode(PASSKEY_HKDF_INFO),
    },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function wrapKey(
  encryptionKey: string,
  wrappingKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(encryptionKey);

  const ciphertextBuffer = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    wrappingKey,
    encoded,
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

export async function unwrapKey(
  ciphertext: string,
  iv: string,
  wrappingKey: CryptoKey,
): Promise<string> {
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
  const ivBuffer = new Uint8Array(base64ToArrayBuffer(iv));

  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
    wrappingKey,
    ciphertextBuffer,
  );

  return new TextDecoder().decode(plaintext);
}
