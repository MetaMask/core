import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '@noble/hashes/utils';

import { base64UrlToBytes, toBase64Url } from './encoding';

/**
 * Wraps the `data_encryption_key` for the UKYC session server using the
 * static-static ECDH established with the server's per-session wrapping key.
 *
 * Unlike {@link wrapUserKey} (which generates a fresh ephemeral keypair per
 * call), this uses the session client keypair whose public half was already
 * handed to the server via `POST /wrapping-key`. The server therefore already
 * knows our public key and can derive the same shared secret from its session
 * private key, so only `{ encryptedKey, nonce }` need be transmitted.
 */

/** 96-bit nonce, the AES-GCM standard nonce size. */
const NONCE_SIZE_BYTES = 12;

/**
 * The transmitted portion of a wrapped encryption key: the AES-256-GCM
 * ciphertext (which includes the 16-byte auth tag) and the nonce, both
 * base64url-encoded.
 */
export type WrappedEncryptionKeyParts = {
  encryptedKey: string;
  nonce: string;
};

/**
 * Wraps `keyToWrap` for the UKYC session server.
 *
 * The AEAD key is the ECDH shared secret between our session client private key
 * and the session server public key returned by `getWrappingKey`, run through
 * HKDF-SHA256; the key is then sealed with AES-256-GCM.
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
  const shared = x25519.getSharedSecret(
    sessionClientPrivateKey,
    serverPublicKey,
  );
  const aeadKey = hkdf(sha256, shared, undefined, undefined, 32);
  const nonce = randomBytes(NONCE_SIZE_BYTES);
  const encryptedKey = gcm(aeadKey, nonce).encrypt(keyToWrap);
  return {
    encryptedKey: toBase64Url(encryptedKey),
    nonce: toBase64Url(nonce),
  };
}
