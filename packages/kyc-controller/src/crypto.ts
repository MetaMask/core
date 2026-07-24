/**
 * Check / Auth frame key exchange and credential decryption.
 *
 * The identity vendor's Check and Auth frames return encrypted credentials.
 * The confirmed protocol is X25519 ECDH + AES-256-GCM (an "ECDH-ES" pattern
 * signalled by a 12-byte IV):
 *
 *   1. Client generates an X25519 keypair, sends `publicKey` (hex) into the
 *      frame as a URL param.
 *   2. Frame generates its own ephemeral X25519 keypair and encrypts the
 *      credentials, returning `{ ephemeralPublicKey, iv, ciphertext }`.
 *   3. Client reverses:
 *        shared = X25519(ourPrivate, theirEphemeralPublic)
 *        key    = HKDF-SHA256(shared, salt=none, info=none, 32 bytes)
 *        plain  = AES-256-GCM.decrypt(key, iv, ciphertext || 16-byte tag)
 *
 * This module is platform-agnostic: it uses `@noble/*` + `@scure/base` and
 * avoids `Buffer` / `atob` so it runs unchanged on mobile, extension, and web.
 */

import { gcm } from '@noble/ciphers/aes';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { base64 } from '@scure/base';

/**
 * An X25519 keypair used for the Check/Auth frame key exchange.
 */
export type X25519KeyPair = {
  /** Raw 32-byte X25519 private (scalar) key. Never leaves the device. */
  privateKey: Uint8Array;
  /** Raw 32-byte X25519 public key. */
  publicKey: Uint8Array;
  /** Hex-encoded public key, ready to drop into a Check/Auth frame URL. */
  publicKeyHex: string;
};

/**
 * The encrypted-credentials envelope returned by the Check/Auth frames. Binary
 * fields may be hex or base64; the IV field may be named `iv` or `nonce`.
 */
export type EncryptedCredentialsEnvelope = {
  /** Ephemeral public key produced by the frame for this exchange (32 bytes). */
  ephemeralPublicKey: string;
  /** Per-message IV. May be provided as `iv` or `nonce`. */
  iv?: string;
  nonce?: string;
  /** Ciphertext (plaintext + 16-byte GCM auth tag). */
  ciphertext: string;
  /** Optional explicit encoding hint. Defaults to auto-detect. */
  encoding?: 'hex' | 'base64';
};

/**
 * Decrypted Check/Auth frame credentials.
 *
 * - `accessToken` is the Bearer token for the identity API.
 * - `clientToken` is the short-lived token consumed by the Auth frame when the
 *   Check frame returns `connectionRequired`.
 */
export type DecryptedCredentials = {
  accessToken?: string;
  clientToken?: string;
  [key: string]: unknown;
};

/**
 * Result of a successful decryption — the credentials plus the `method` that
 * authenticated.
 */
export type DecryptResult = {
  credentials: DecryptedCredentials;
  method: string;
};

/**
 * Generate a fresh X25519 keypair. The private key never leaves the device;
 * only `publicKeyHex` is sent to the vendor via the frame URL.
 *
 * @returns The generated keypair.
 */
export function generateKeyPair(): X25519KeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return {
    privateKey,
    publicKey,
    publicKeyHex: bytesToHex(publicKey),
  };
}

/**
 * Decode a base64 / base64url string to bytes without relying on `atob` or
 * `Buffer`.
 *
 * @param value - The (possibly url-safe, possibly unpadded) base64 string.
 * @returns The decoded bytes.
 */
function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  return base64.decode(padded);
}

/**
 * Decode a binary envelope field that may be hex or base64.
 *
 * @param value - The encoded field.
 * @param encoding - Optional explicit encoding; auto-detected when omitted.
 * @returns The decoded bytes.
 */
function decodeBinary(value: string, encoding?: 'hex' | 'base64'): Uint8Array {
  const isHex =
    encoding === 'hex' ||
    (encoding === undefined && /^[0-9a-fA-F]+$/u.test(value));
  if (isHex) {
    return hexToBytes(value);
  }
  return base64ToBytes(value);
}

/**
 * Coerce the `credentials` field into a structured envelope. The frame may
 * deliver it as an object, a JSON string, or base64(JSON).
 *
 * @param input - The raw credentials value.
 * @returns The normalized envelope.
 * @throws If the value is not a structured or base64(JSON) envelope, or is
 * missing required fields.
 */
function normalizeEnvelope(
  input: EncryptedCredentialsEnvelope | string,
): EncryptedCredentialsEnvelope {
  let value: unknown = input;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{')) {
      try {
        value = JSON.parse(trimmed);
      } catch {
        throw new Error(
          `credentials looked like JSON but failed to parse (preview: "${trimmed.slice(
            0,
            64,
          )}").`,
        );
      }
    } else {
      let decodedText: string | null = null;
      try {
        decodedText = new TextDecoder().decode(base64ToBytes(trimmed));
      } catch {
        decodedText = null;
      }
      const decodedTrimmed = decodedText?.trim();
      if (decodedTrimmed?.startsWith('{')) {
        try {
          value = JSON.parse(decodedTrimmed);
        } catch {
          throw new Error(
            `credentials base64-decoded to non-JSON (preview: "${decodedTrimmed.slice(
              0,
              64,
            )}").`,
          );
        }
      } else {
        throw new Error(
          `credentials is an opaque string, not a structured or base64(JSON) envelope (preview: "${trimmed.slice(
            0,
            64,
          )}").`,
        );
      }
    }
  }

  const env = value as Partial<EncryptedCredentialsEnvelope>;
  if (!env.ephemeralPublicKey || !(env.iv ?? env.nonce) || !env.ciphertext) {
    const keys =
      value && typeof value === 'object'
        ? Object.keys(value).join(', ')
        : typeof value;
    throw new Error(
      `credentials envelope missing required fields (ephemeralPublicKey/iv/ciphertext). Got: ${keys}`,
    );
  }
  return env as EncryptedCredentialsEnvelope;
}

/**
 * X25519 ECDH to AES-256-GCM decryption.
 *
 * @param theirPublicKey - The frame's ephemeral public key.
 * @param iv - The 12-byte GCM IV.
 * @param ciphertext - The ciphertext including the 16-byte auth tag.
 * @param ourPrivateKey - Our X25519 private key.
 * @returns The decrypted credentials and method.
 */
function aesGcmDecrypt(
  theirPublicKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  ourPrivateKey: Uint8Array,
): DecryptResult {
  const shared = x25519.getSharedSecret(ourPrivateKey, theirPublicKey);
  const key = hkdf(sha256, shared, undefined, undefined, 32);
  const plaintext = gcm(key, iv).decrypt(ciphertext);
  const text = new TextDecoder().decode(plaintext);
  return {
    credentials: JSON.parse(text) as DecryptedCredentials,
    method: 'aes-256-gcm/hkdf-sha256',
  };
}

/**
 * Decrypt a Check/Auth frame credentials envelope using our X25519 private
 * key.
 *
 * @param rawEnvelope - The raw envelope (object, JSON string, or base64(JSON)).
 * @param ourPrivateKey - Our X25519 private key.
 * @returns The parsed credentials and the method that authenticated.
 * @throws If the envelope is malformed or the IV length is not 12 bytes.
 */
export function decryptCredentials(
  rawEnvelope: EncryptedCredentialsEnvelope | string,
  ourPrivateKey: Uint8Array,
): DecryptResult {
  const envelope = normalizeEnvelope(rawEnvelope);
  const theirPublicKey = decodeBinary(
    envelope.ephemeralPublicKey,
    envelope.encoding,
  );
  // `normalizeEnvelope` guarantees one of `iv` / `nonce` is present.
  const ivField = (envelope.iv ?? envelope.nonce) as string;
  const iv = decodeBinary(ivField, envelope.encoding);
  const ciphertext = decodeBinary(envelope.ciphertext, envelope.encoding);

  if (iv.length !== 12) {
    throw new Error(
      `Unexpected IV length ${iv.length} (expected 12 for AES-256-GCM).`,
    );
  }

  return aesGcmDecrypt(theirPublicKey, iv, ciphertext, ourPrivateKey);
}
