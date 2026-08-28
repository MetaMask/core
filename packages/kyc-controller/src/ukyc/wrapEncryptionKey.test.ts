import { areUint8ArraysEqual } from '@metamask/utils';
import { box } from 'tweetnacl';

import { base64UrlToBytes, toBase64Url } from '../encoding.js';
import { wrapEncryptionKey } from './wrapEncryptionKey.js';

const DATA_ENCRYPTION_KEY = new Uint8Array(32).fill(7);

/**
 * Reverses {@link wrapEncryptionKey} from the server's perspective: reads the
 * client public key from the first 32 bytes of `data` and opens the NaCl box
 * with the server private key. The client also registers this public key on
 * `createUkycSession`.
 *
 * @param serverPrivateKey - The server's X25519 private key.
 * @param data - The base64url `clientPublicKey || ciphertext+tag`.
 * @param nonce - The base64url nonce.
 * @returns The recovered plaintext.
 */
function unwrap(
  serverPrivateKey: Uint8Array,
  data: string,
  nonce: string,
): Uint8Array {
  const packed = base64UrlToBytes(data);
  const clientPublicKey = packed.slice(0, box.publicKeyLength);
  const ciphertext = packed.slice(box.publicKeyLength);
  const recovered = box.open(
    ciphertext,
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
  it('wraps a key the session server can recover using only the packed data', () => {
    const serverKeyPair = box.keyPair();
    const clientKeyPair = box.keyPair();

    const { data, nonce } = wrapEncryptionKey(
      clientKeyPair.secretKey,
      toBase64Url(serverKeyPair.publicKey),
      DATA_ENCRYPTION_KEY,
    );

    const recovered = unwrap(serverKeyPair.secretKey, data, nonce);
    expect(areUint8ArraysEqual(recovered, DATA_ENCRYPTION_KEY)).toBe(true);
  });

  it('prefixes the client public key onto data so the server can open the box', () => {
    const serverKeyPair = box.keyPair();
    const clientKeyPair = box.keyPair();

    const { data } = wrapEncryptionKey(
      clientKeyPair.secretKey,
      toBase64Url(serverKeyPair.publicKey),
      DATA_ENCRYPTION_KEY,
    );

    const packed = base64UrlToBytes(data);
    expect(packed.slice(0, box.publicKeyLength)).toStrictEqual(
      clientKeyPair.publicKey,
    );
  });

  it('cannot be opened if data is treated as ciphertext with no embedded public key', () => {
    const serverKeyPair = box.keyPair();
    const clientKeyPair = box.keyPair();

    const { data, nonce } = wrapEncryptionKey(
      clientKeyPair.secretKey,
      toBase64Url(serverKeyPair.publicKey),
      DATA_ENCRYPTION_KEY,
    );

    const opened = box.open(
      base64UrlToBytes(data),
      base64UrlToBytes(nonce),
      clientKeyPair.publicKey,
      serverKeyPair.secretKey,
    );
    expect(opened).toBeNull();
  });

  it('emits base64url fields', () => {
    const serverPublicKey = box.keyPair().publicKey;
    const clientPrivateKey = box.keyPair().secretKey;

    const { data, nonce } = wrapEncryptionKey(
      clientPrivateKey,
      toBase64Url(serverPublicKey),
      DATA_ENCRYPTION_KEY,
    );

    expect(data).toMatch(/^[A-Za-z0-9\-_]+$/u);
    expect(nonce).toMatch(/^[A-Za-z0-9\-_]+$/u);
  });

  it('wraps an arbitrary-length payload the session server can recover', () => {
    const serverKeyPair = box.keyPair();
    const clientKeyPair = box.keyPair();
    const tokenBytes = new Uint8Array(64).map((_, i) => i + 1);

    const { data, nonce } = wrapEncryptionKey(
      clientKeyPair.secretKey,
      toBase64Url(serverKeyPair.publicKey),
      tokenBytes,
    );

    const recovered = unwrap(serverKeyPair.secretKey, data, nonce);
    expect(areUint8ArraysEqual(recovered, tokenBytes)).toBe(true);
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
    expect(first.data).not.toBe(second.data);
  });
});
