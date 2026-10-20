import type { KeyPair } from '@metamask/cryptography';
import { getRandomBytes } from '@metamask/cryptography';
import { decrypt, encrypt, IV_LENGTH } from '@metamask/cryptography/aes-gcm';
import {
  generateKeyPair as generateEd25519KeyPair,
  sign as ed25519Sign,
  verify as ed25519Verify,
} from '@metamask/cryptography/ed25519';
import { hkdfSha256 } from '@metamask/cryptography/hkdf';
import { sha256 } from '@metamask/cryptography/sha';
import {
  generateKeyPair as generateX25519KeyPair,
  getSharedSecret,
} from '@metamask/cryptography/x25519';
import {
  base64ToBytes,
  bytesToHex,
  concatBytes,
  hexToBytes,
  stringToBytes,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import stableStringify from 'json-stable-stringify';

import type { Identifier } from './types.js';

const WRAP_INFO = new TextEncoder().encode('escrow-wrap-v1');
const WRAP_KEY_LEN = 32;

/**
 * Recursively sorts object keys so hashes are independent of property order.
 *
 * @param value - JSON-compatible value.
 * @returns A canonical JSON string.
 */
export function canonicalize(value: unknown): string {
  return stableStringify(value, {
    replacer: (_key, node) =>
      node instanceof Uint8Array ? bytesToHex(node) : node,
  }) as string;
}

/**
 * SHA-256 of the canonical JSON form of `value`, as a 0x-prefixed hex string.
 *
 * @param value - Value to hash.
 * @returns Hex digest.
 */
export async function hash(value: unknown): Promise<Hex> {
  return bytesToHex(await sha256(stringToBytes(canonicalize(value))));
}

/**
 * Orders two strings by their UTF-8 bytes. The escrow sorts identifiers the same
 * way (Rust `String` ordering), so this must not be locale or UTF-16 aware.
 *
 * @param left - First string.
 * @param right - Second string.
 * @returns Negative, zero, or positive like `Array.prototype.sort` expects.
 */
export function compareUtf8(left: string, right: string): number {
  const leftBytes = stringToBytes(left);
  const rightBytes = stringToBytes(right);
  const shared = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = leftBytes[index] - rightBytes[index];
    if (difference !== 0) {
      return difference;
    }
  }
  return leftBytes.length - rightBytes.length;
}

/**
 * Canonical identifier list bound into AuthController `identifiersHash`.
 *
 * @param identifiers - Identifier set.
 * @returns Identifier records including verifier material, sorted by the UTF-8
 * bytes of their canonical JSON.
 */
export function canonicalizeIdentifiers(identifiers: Identifier[]): unknown {
  return [...identifiers]
    .map((identifier) => ({
      namespace: identifier.namespace,
      type: identifier.type,
      value: identifier.value,
      verifier: identifier.verifier,
    }))
    .sort((left, right) =>
      compareUtf8(canonicalize(left), canonicalize(right)),
    );
}

/**
 * @returns A random 0x-prefixed id.
 */
export function randomId(): Hex {
  return bytesToHex(getRandomBytes(16));
}

/**
 * Unix time in seconds. AuthController tokens and PoP challenges use this unit.
 *
 * @returns Seconds since the Unix epoch.
 */
export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Generates an ephemeral Ed25519 proof key pair for key-bound identifier PoP.
 *
 * @returns Raw 32-byte Ed25519 public and private keys.
 */
export async function generateSigningKey(): Promise<KeyPair> {
  return await generateEd25519KeyPair();
}

/**
 * Generates an X25519 wrap key pair.
 *
 * @returns Raw 32-byte X25519 public and private keys.
 */
export async function generateWrapKey(): Promise<KeyPair> {
  return await generateX25519KeyPair();
}

/**
 * Signs a message with an Ed25519 private key.
 *
 * @param privateKey - Raw 32-byte Ed25519 private key.
 * @param message - Message string; signed as its UTF-8 bytes without a
 * pre-hash, since Ed25519 hashes internally.
 * @returns 0x-prefixed hex of the 64-byte Ed25519 signature.
 */
export async function sign(
  privateKey: Uint8Array,
  message: string,
): Promise<Hex> {
  return bytesToHex(
    await ed25519Sign(
      new Uint8Array(privateKey),
      new Uint8Array(stringToBytes(message)),
    ),
  );
}

/**
 * Verifies an Ed25519 signature against a public key. Never throws: malformed
 * keys or signatures yield `false`.
 *
 * @param publicKey - Raw 32-byte Ed25519 public key.
 * @param signature - Hex of the 64-byte signature, with or without a 0x prefix.
 * @param message - Message string; verified as its UTF-8 bytes without a
 * pre-hash.
 * @returns Whether the signature is valid.
 */
export async function verifySignature(
  publicKey: Uint8Array,
  signature: string,
  message: string,
): Promise<boolean> {
  try {
    return await ed25519Verify(
      new Uint8Array(publicKey),
      new Uint8Array(hexToBytes(signature)),
      new Uint8Array(stringToBytes(message)),
    );
  } catch {
    return false;
  }
}

/**
 * Unsigned mutation-receipt digest. SHA-256 of canonical JSON of the receipt
 * fields excluding `signature`.
 *
 * @param receipt - Receipt fields covered by the signature.
 * @param receipt.escrowId - Escrow that issued the receipt.
 * @param receipt.mutationId - Mutation id.
 * @param receipt.receiptKeyId - SHA-256 of the raw 32-byte Ed25519 receipt public key.
 * @param receipt.requestHash - Mutation request hash.
 * @param receipt.version - Applied version.
 * @returns Hex digest.
 */
export async function hashMutationReceipt(receipt: {
  escrowId: string;
  mutationId: string;
  receiptKeyId: string;
  requestHash: string;
  version: number;
}): Promise<Hex> {
  return hash({
    escrowId: receipt.escrowId,
    mutationId: receipt.mutationId,
    receiptKeyId: receipt.receiptKeyId,
    requestHash: receipt.requestHash,
    version: receipt.version,
  });
}

/**
 * SHA-256 of the raw 32-byte X25519 wrap public key, as `0x` hex.
 *
 * @param wrapPublicKey - Raw 32-byte X25519 wrap public key.
 * @returns Key id matching cubist `wrapKeyId`.
 */
export async function wrapKeyId(wrapPublicKey: Uint8Array): Promise<Hex> {
  return bytesToHex(await sha256(new Uint8Array(wrapPublicKey)));
}

/**
 * SHA-256 of the raw 32-byte Ed25519 receipt public key, as `0x` hex.
 *
 * @param receiptPublicKey - Raw 32-byte Ed25519 receipt public key.
 * @returns Key id matching cubist `receiptKeyId`.
 */
export async function receiptKeyId(receiptPublicKey: Uint8Array): Promise<Hex> {
  return bytesToHex(await sha256(new Uint8Array(receiptPublicKey)));
}

/**
 * Encrypts plaintext to an X25519 public key using escrow-wrap-v1.
 *
 * @param privateKey - Sender raw 32-byte X25519 private key.
 * @param publicKey - Recipient raw 32-byte X25519 public key.
 * @param plaintext - Bytes to encrypt.
 * @returns `iv || ciphertext+tag` bytes.
 */
export async function encryptToPublic(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const key = await deriveTransportKey(privateKey, publicKey);
  const { iv, ciphertext } = await encrypt(key, new Uint8Array(plaintext));
  return concatBytes([iv, ciphertext]);
}

/**
 * Decrypts escrow-wrap-v1 ciphertext produced by {@link encryptToPublic}.
 *
 * @param privateKey - Recipient raw 32-byte X25519 private key.
 * @param publicKey - Sender raw 32-byte X25519 public key.
 * @param ciphertext - `iv || ciphertext+tag` bytes.
 * @returns Plaintext bytes.
 */
export async function decryptFromPublic(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const key = await deriveTransportKey(privateKey, publicKey);
  const blob = new Uint8Array(ciphertext);
  if (blob.length < IV_LENGTH) {
    throw new Error('Wrapped secret is truncated');
  }
  return decrypt(key, blob.subarray(0, IV_LENGTH), blob.subarray(IV_LENGTH));
}

async function deriveTransportKey(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  // WebCrypto rejects the all-zero shared secret of a low-order public key.
  const shared = await getSharedSecret(
    new Uint8Array(privateKey),
    new Uint8Array(publicKey),
  );
  return hkdfSha256(shared, new Uint8Array(0), WRAP_INFO, WRAP_KEY_LEN);
}

/**
 * Decodes unpadded base64url, as used by JWT segments.
 *
 * @param value - Base64url string.
 * @returns Raw bytes.
 */
export function fromBase64Url(value: string): Uint8Array {
  return base64ToBytes(
    value
      .replace(/-/gu, '+')
      .replace(/_/gu, '/')
      .padEnd(value.length + ((4 - (value.length % 4)) % 4), '='),
  );
}
