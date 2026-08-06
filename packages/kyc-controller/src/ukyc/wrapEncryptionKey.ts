import { randomBytes, box } from 'tweetnacl';

import { base64UrlToBytes, toBase64Url } from '../encoding.js';

/**
 * Wraps the `data_encryption_key` for the UKYC session server using NaCl's
 * `crypto_box` (X25519 + XSalsa20-Poly1305) established with the server's
 * per-session wrapping key.
 *
 * Unlike {@link wrapUserKey} (which generates a fresh ephemeral keypair per
 * call), this uses the session client keypair whose public half was already
 * handed to the server via `POST /wrapping-key`. The server therefore already
 * knows our public key and can derive the same shared secret from its session
 * private key, so only `{ encryptedKey, nonce }` need be transmitted.
 */

/**
 * The transmitted portion of a wrapped encryption key: the `crypto_box`
 * ciphertext (which includes the 16-byte Poly1305 auth tag) and the nonce,
 * both unpadded base64url-encoded.
 */
export type WrappedEncryptionKeyParts = {
  encryptedKey: string;
  nonce: string;
};

/**
 * Wraps `keyToWrap` for the UKYC session server.
 *
 * The box is sealed with NaCl's `crypto_box`, keyed by the X25519 shared secret
 * between our session client private key and the session server public key
 * returned by `getWrappingKey`.
 *
 * @param sessionClientPrivateKey - Our session's X25519 private key.
 * @param sessionServerPublicKey - The server's X25519 public key (base64url).
 * @param keyToWrap - The raw symmetric key bytes to encrypt.
 * @returns The base64url `encryptedKey` (ciphertext + tag) and `nonce`.
 */
export function wrapEncryptionKey(
  sessionClientPrivateKey: Uint8Array,
  sessionServerPublicKey: string,
  keyToWrap: Uint8Array,
): WrappedEncryptionKeyParts {
  const serverPublicKey = base64UrlToBytes(sessionServerPublicKey);
  const nonce = randomBytes(box.nonceLength);
  const encryptedKey = box(
    keyToWrap,
    nonce,
    serverPublicKey,
    sessionClientPrivateKey,
  );
  return {
    encryptedKey: toBase64Url(encryptedKey),
    nonce: toBase64Url(nonce),
  };
}
