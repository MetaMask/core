import { PASSKEY_HKDF_INFO } from './constants';
import type {
  CredentialCreationResult,
  PasskeyDerivationMethod,
} from './types';

/*
 * Base64 via `btoa`/`atob` keeps this package free of Node's `Buffer`, which is
 * not guaranteed in browsers, extension workers, or React Native unless polyfilled.
 * (Profile-sync uses `Buffer.from` in Node-oriented code.)
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function selectDerivationMethod(
  result: CredentialCreationResult,
): PasskeyDerivationMethod {
  if (
    result.prfFirst !== undefined &&
    new Uint8Array(result.prfFirst).byteLength > 0
  ) {
    return 'prf';
  }
  return 'userHandle';
}

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
