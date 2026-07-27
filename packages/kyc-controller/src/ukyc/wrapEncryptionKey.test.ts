import { areUint8ArraysEqual } from '@metamask/utils';
import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';

import { base64UrlToBytes, toBase64Url } from './encoding';
import { wrapEncryptionKey } from './wrapEncryptionKey';

const DATA_ENCRYPTION_KEY = new Uint8Array(32).fill(7);

/**
 * Reverses {@link wrapEncryptionKey} from the server's perspective: derives the
 * same shared secret from the server private key + client public key and
 * decrypts.
 *
 * @param serverPrivateKey - The server's X25519 private key.
 * @param clientPublicKey - The client's X25519 public key.
 * @param encryptedKey - The base64url ciphertext (+ tag).
 * @param nonce - The base64url nonce.
 * @returns The recovered plaintext key.
 */
function unwrap(
  serverPrivateKey: Uint8Array,
  clientPublicKey: Uint8Array,
  encryptedKey: string,
  nonce: string,
): Uint8Array {
  const shared = x25519.getSharedSecret(serverPrivateKey, clientPublicKey);
  const aeadKey = hkdf(sha256, shared, undefined, undefined, 32);
  return gcm(aeadKey, base64UrlToBytes(nonce)).decrypt(
    base64UrlToBytes(encryptedKey),
  );
}

describe('UKYC wrapEncryptionKey', () => {
  it('wraps a key the session server can recover', () => {
    const serverPrivateKey = x25519.utils.randomSecretKey();
    const serverPublicKey = x25519.getPublicKey(serverPrivateKey);
    const clientPrivateKey = x25519.utils.randomSecretKey();
    const clientPublicKey = x25519.getPublicKey(clientPrivateKey);

    const { encryptedKey, nonce } = wrapEncryptionKey(
      clientPrivateKey,
      toBase64Url(serverPublicKey),
      DATA_ENCRYPTION_KEY,
    );

    const recovered = unwrap(
      serverPrivateKey,
      clientPublicKey,
      encryptedKey,
      nonce,
    );
    expect(areUint8ArraysEqual(recovered, DATA_ENCRYPTION_KEY)).toBe(true);
  });

  it('emits unpadded base64url fields', () => {
    const serverPublicKey = x25519.getPublicKey(x25519.utils.randomSecretKey());
    const clientPrivateKey = x25519.utils.randomSecretKey();

    const { encryptedKey, nonce } = wrapEncryptionKey(
      clientPrivateKey,
      toBase64Url(serverPublicKey),
      DATA_ENCRYPTION_KEY,
    );

    expect(encryptedKey).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  it('uses a fresh nonce per call', () => {
    const serverPublicKey = x25519.getPublicKey(x25519.utils.randomSecretKey());
    const clientPrivateKey = x25519.utils.randomSecretKey();
    const serverPublicKeyB64 = toBase64Url(serverPublicKey);

    const first = wrapEncryptionKey(
      clientPrivateKey,
      serverPublicKeyB64,
      DATA_ENCRYPTION_KEY,
    );
    const second = wrapEncryptionKey(
      clientPrivateKey,
      serverPublicKeyB64,
      DATA_ENCRYPTION_KEY,
    );

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.encryptedKey).not.toBe(second.encryptedKey);
  });
});
