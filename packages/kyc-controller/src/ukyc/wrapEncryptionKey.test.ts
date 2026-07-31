import { areUint8ArraysEqual } from '@metamask/utils';
import { box } from 'tweetnacl';

import { base64UrlToBytes, toBase64Url } from './encoding.js';
import { wrapEncryptionKey } from './wrapEncryptionKey.js';

const DATA_ENCRYPTION_KEY = new Uint8Array(32).fill(7);

/**
 * Reverses {@link wrapEncryptionKey} from the server's perspective: opens the
 * NaCl box using the server private key + client public key.
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
  const recovered = box.open(
    base64UrlToBytes(encryptedKey),
    base64UrlToBytes(nonce),
    clientPublicKey,
    serverPrivateKey,
  );
  if (recovered === null) {
    throw new Error('Failed to open NaCl box');
  }
  return recovered;
}

describe('UKYC wrapEncryptionKey', () => {
  it('wraps a key the session server can recover', () => {
    const serverKeyPair = box.keyPair();
    const clientKeyPair = box.keyPair();

    const { encryptedKey, nonce } = wrapEncryptionKey(
      clientKeyPair.secretKey,
      toBase64Url(serverKeyPair.publicKey),
      DATA_ENCRYPTION_KEY,
    );

    const recovered = unwrap(
      serverKeyPair.secretKey,
      clientKeyPair.publicKey,
      encryptedKey,
      nonce,
    );
    expect(areUint8ArraysEqual(recovered, DATA_ENCRYPTION_KEY)).toBe(true);
  });

  it('emits base64url fields', () => {
    const serverPublicKey = box.keyPair().publicKey;
    const clientPrivateKey = box.keyPair().secretKey;

    const { encryptedKey, nonce } = wrapEncryptionKey(
      clientPrivateKey,
      toBase64Url(serverPublicKey),
      DATA_ENCRYPTION_KEY,
    );

    expect(encryptedKey).toMatch(/^[A-Za-z0-9\-_]+$/u);
    expect(nonce).toMatch(/^[A-Za-z0-9\-_]+$/u);
  });

  it('uses a fresh nonce per call', () => {
    const serverPublicKey = box.keyPair().publicKey;
    const clientPrivateKey = box.keyPair().secretKey;
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
