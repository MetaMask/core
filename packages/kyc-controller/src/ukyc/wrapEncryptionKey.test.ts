import { generateKeyPair } from '@metamask/cryptography/x25519';
import { areUint8ArraysEqual } from '@metamask/utils';
import { xsalsa20poly1305 } from '@noble/ciphers/salsa';
import { describe, expect, it } from 'vitest';

import { base64UrlToBytes, toBase64Url } from '../encoding.js';
import { deriveEncryptionKey, wrapEncryptionKey } from './wrapEncryptionKey.js';

const DATA_ENCRYPTION_KEY = new Uint8Array(32).fill(7);

/**
 * Reverses {@link wrapEncryptionKey} from the server's perspective: derives
 * the `crypto_box` key via {@link deriveEncryptionKey} using the server private
 * key and the client public key registered on `createUkycSession`, then
 * decrypts the ciphertext.
 *
 * @param serverPrivateKey - The server's X25519 private key.
 * @param clientPublicKey - The client's X25519 public key from session creation.
 * @param data - The base64url ciphertext+tag.
 * @param nonce - The base64url nonce.
 * @returns The recovered plaintext.
 */
async function unwrap(
  serverPrivateKey: Uint8Array<ArrayBuffer>,
  clientPublicKey: Uint8Array<ArrayBuffer>,
  data: string,
  nonce: string,
): Promise<Uint8Array> {
  const key = await deriveEncryptionKey(serverPrivateKey, clientPublicKey);
  return xsalsa20poly1305(key, base64UrlToBytes(nonce)).decrypt(
    base64UrlToBytes(data),
  );
}

describe('UKYC wrapEncryptionKey', () => {
  it('wraps a key the session server can recover with the registered client public key', async () => {
    const serverKeyPair = await generateKeyPair();
    const clientKeyPair = await generateKeyPair();

    const { data, nonce } = await wrapEncryptionKey(
      clientKeyPair.privateKey,
      toBase64Url(serverKeyPair.publicKey),
      DATA_ENCRYPTION_KEY,
    );

    const recovered = await unwrap(
      serverKeyPair.privateKey,
      clientKeyPair.publicKey,
      data,
      nonce,
    );
    expect(areUint8ArraysEqual(recovered, DATA_ENCRYPTION_KEY)).toBe(true);
  });

  it('decrypts a vector from the tweetnacl test suite', async () => {
    // `pk1`/`sk2`/`goodBox` from tweetnacl-js test/data/box.random.js; those
    // vectors use a 24-byte zero nonce.
    const clientPublicKey = base64UrlToBytes(
      'qSyzGOJiNb_0I2DYAC1vnTM7ewvWs5gmulNSTQldlj4',
    );
    const serverPrivateKey = base64UrlToBytes(
      'evqDkl_9eWvBSiYr4XIDKyqQl4-R13ss7AEMQRa3koA',
    );
    const plaintext = base64UrlToBytes(
      'ZHDXcbkTFOx4odt3OmvDBCxI9jDY3l0JIdBifqYOkOc',
    );

    const recovered = await unwrap(
      serverPrivateKey,
      clientPublicKey,
      'dTslfLEecF6bvHjBCTvoJycCy6gUnAt2PlwDUM0ZkdjEGSxqx0PFb0Clex4RnXnb',
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );

    expect(areUint8ArraysEqual(recovered, plaintext)).toBe(true);
  });

  it('emits ciphertext-only data without embedding the client public key', async () => {
    const serverKeyPair = await generateKeyPair();
    const clientKeyPair = await generateKeyPair();

    const { data } = await wrapEncryptionKey(
      clientKeyPair.privateKey,
      toBase64Url(serverKeyPair.publicKey),
      DATA_ENCRYPTION_KEY,
    );

    const packed = base64UrlToBytes(data);
    expect(packed.slice(0, clientKeyPair.publicKey.length)).not.toStrictEqual(
      clientKeyPair.publicKey,
    );
  });

  it('cannot be opened with the wrong client public key', async () => {
    const serverKeyPair = await generateKeyPair();
    const clientKeyPair = await generateKeyPair();
    const otherClientKeyPair = await generateKeyPair();

    const { data, nonce } = await wrapEncryptionKey(
      clientKeyPair.privateKey,
      toBase64Url(serverKeyPair.publicKey),
      DATA_ENCRYPTION_KEY,
    );

    await expect(
      unwrap(
        serverKeyPair.privateKey,
        otherClientKeyPair.publicKey,
        data,
        nonce,
      ),
    ).rejects.toThrow('invalid tag');
  });

  it('emits base64url fields', async () => {
    const serverPublicKey = (await generateKeyPair()).publicKey;
    const clientPrivateKey = (await generateKeyPair()).privateKey;

    const { data, nonce } = await wrapEncryptionKey(
      clientPrivateKey,
      toBase64Url(serverPublicKey),
      DATA_ENCRYPTION_KEY,
    );

    expect(data).toMatch(/^[A-Za-z0-9\-_]+$/u);
    expect(nonce).toMatch(/^[A-Za-z0-9\-_]+$/u);
  });

  it('wraps an arbitrary-length payload the session server can recover', async () => {
    const serverKeyPair = await generateKeyPair();
    const clientKeyPair = await generateKeyPair();
    const tokenBytes = new Uint8Array(64).map((_, i) => i + 1);

    const { data, nonce } = await wrapEncryptionKey(
      clientKeyPair.privateKey,
      toBase64Url(serverKeyPair.publicKey),
      tokenBytes,
    );

    const recovered = await unwrap(
      serverKeyPair.privateKey,
      clientKeyPair.publicKey,
      data,
      nonce,
    );
    expect(areUint8ArraysEqual(recovered, tokenBytes)).toBe(true);
  });

  it('uses a fresh nonce per call', async () => {
    const serverPublicKey = (await generateKeyPair()).publicKey;
    const clientPrivateKey = (await generateKeyPair()).privateKey;
    const serverPublicKeyB64 = toBase64Url(serverPublicKey);

    const first = await wrapEncryptionKey(
      clientPrivateKey,
      serverPublicKeyB64,
      DATA_ENCRYPTION_KEY,
    );
    const second = await wrapEncryptionKey(
      clientPrivateKey,
      serverPublicKeyB64,
      DATA_ENCRYPTION_KEY,
    );

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.data).not.toBe(second.data);
  });
});
