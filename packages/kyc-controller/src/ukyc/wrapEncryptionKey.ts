import { randomBytes, box } from 'tweetnacl';

import { base64UrlToBytes, toBase64Url } from '../encoding.js';

/**
 * Wraps a secret for the UKYC session server using NaCl's `crypto_box`
 * (X25519 + XSalsa20-Poly1305) established with a per-secret wrapping key
 * returned inside an encryption schema from `createUkycSession`.
 *
 * Reuses a session client keypair whose public half is registered on
 * `createUkycSession`. `data` is still `clientPublicKey (32) || ciphertext+tag`
 * so the box can be opened from `{ data, nonce }` alone. Used for both the
 * `data_encryption_key` and the `ukyc_capability_token`.
 */

/**
 * The transmitted portion of a wrapped secret: the sender public key prefixed
 * to the `crypto_box` ciphertext (which includes the 16-byte Poly1305 auth
 * tag), and the nonce, both unpadded base64url-encoded. Matches the KYC API
 * `CapabilityAuthorization` wire shape.
 */
export type WrappedEncryptionKeyParts = {
  data: string;
  nonce: string;
};

/**
 * Wraps `plaintext` for the UKYC session server.
 *
 * The box is sealed with NaCl's `crypto_box`, keyed by the X25519 shared secret
 * between our session client private key and the session server public key
 * from an encryption schema (`encryptionDataKey` or `ukycCapabilityToken`)
 * returned by `createUkycSession`. The 32-byte client public key is still
 * prefixed onto `data` so the box is self-describing on the wire.
 *
 * @param sessionClientPrivateKey - Our session's X25519 private key.
 * @param sessionServerPublicKey - The server's X25519 public key (base64url).
 * @param plaintext - The raw bytes to encrypt (e.g. the `data_encryption_key`
 * or the encoded `ukyc_capability_token`).
 * @returns The base64url `data` (`clientPublicKey || ciphertext+tag`) and
 * `nonce`.
 */
export function wrapEncryptionKey(
  sessionClientPrivateKey: Uint8Array,
  sessionServerPublicKey: string,
  plaintext: Uint8Array,
): WrappedEncryptionKeyParts {
  const serverPublicKey = base64UrlToBytes(sessionServerPublicKey);
  const { publicKey: clientPublicKey } = box.keyPair.fromSecretKey(
    sessionClientPrivateKey,
  );
  const nonce = randomBytes(box.nonceLength);
  const ciphertext = box(
    plaintext,
    nonce,
    serverPublicKey,
    sessionClientPrivateKey,
  );
  const data = new Uint8Array(clientPublicKey.length + ciphertext.length);
  data.set(clientPublicKey, 0);
  data.set(ciphertext, clientPublicKey.length);
  return {
    data: toBase64Url(data),
    nonce: toBase64Url(nonce),
  };
}
