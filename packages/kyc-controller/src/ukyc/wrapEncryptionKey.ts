import { getRandomBytes } from '@metamask/cryptography';
import { getSharedSecret } from '@metamask/cryptography/x25519';
import { stringToBytes } from '@metamask/utils';
import { hsalsa, xsalsa20poly1305 } from '@noble/ciphers/salsa';
import { u8, u32 } from '@noble/ciphers/utils';

import { base64UrlToBytes, toBase64Url } from '../encoding.js';

// HSalsa20 sigma constant, used by NaCl's `crypto_box` to derive the
// XSalsa20-Poly1305 secretbox key from the X25519 shared secret.
// See: https://nacl.cr.yp.to/box.html, https://github.com/dchest/tweetnacl-js/blob/master/nacl.js#L128
const HSALSA_SIGMA = u32(stringToBytes('expand 32-byte k'));

/**
 * The transmitted portion of a wrapped secret: the `crypto_box` ciphertext
 * (which includes the 16-byte Poly1305 auth tag) and the nonce, both unpadded
 * base64url-encoded. Matches the KYC API `CapabilityAuthorization` wire shape.
 */
export type WrappedEncryptionKeyParts = {
  data: string;
  nonce: string;
};

/**
 * Derive the XSalsa20-Poly1305 key used for `crypto_box` from the X25519
 * shared secret.
 *
 * @param privateKey - The 32-byte X25519 private key.
 * @param publicKey - The 32-byte X25519 public key of the peer.
 * @returns The 32-byte symmetric key.
 */
export async function deriveEncryptionKey(
  privateKey: Uint8Array<ArrayBuffer>,
  publicKey: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const sharedSecret = await getSharedSecret(privateKey, publicKey);
  // NaCl's `crypto_box` derives the secretbox key with HSalsa20 over the
  // X25519 shared secret and a zero counter.
  const key = new Uint32Array(8);
  hsalsa(HSALSA_SIGMA, u32(sharedSecret), new Uint32Array(4), key);
  return u8(key);
}

/**
 * Wraps `plaintext` for the UKYC session server.
 *
 * The box is sealed with x25519-xsalsa20-poly1305 via `@noble/ciphers`,
 * wire-compatible with NaCl's `crypto_box`, keyed by the X25519 shared secret
 * between our session client private key and the session server public key
 * from an encryption schema (`encryptionDataKey` or `ukycCapabilityToken`)
 * returned by `createUkycSession`. The client public key is not embedded in
 * `data`; it was already registered on `createUkycSession`.
 *
 * @param sessionClientPrivateKey - Our session's X25519 private key.
 * @param sessionServerPublicKey - The server's X25519 public key (base64url).
 * @param plaintext - The raw bytes to encrypt (e.g. the `data_encryption_key`
 * or the encoded `ukyc_capability_token`).
 * @returns The base64url `data` (ciphertext+tag) and `nonce`.
 */
export async function wrapEncryptionKey(
  sessionClientPrivateKey: Uint8Array<ArrayBuffer>,
  sessionServerPublicKey: string,
  plaintext: Uint8Array,
): Promise<WrappedEncryptionKeyParts> {
  const serverPublicKey = base64UrlToBytes(sessionServerPublicKey);
  const key = await deriveEncryptionKey(
    sessionClientPrivateKey,
    serverPublicKey,
  );
  const nonce = getRandomBytes(xsalsa20poly1305.nonceLength);
  const ciphertext = xsalsa20poly1305(key, nonce).encrypt(plaintext);
  return {
    data: toBase64Url(ciphertext),
    nonce: toBase64Url(nonce),
  };
}
