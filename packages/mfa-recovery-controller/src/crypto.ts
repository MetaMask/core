import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  concatBytes,
  hexToBytes,
  sha256,
  stringToBytes,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { p256 } from '@noble/curves/p256';

import type { Identifier } from './types.js';

/**
 * Recursively sorts object keys so hashes are independent of property order.
 *
 * @param value - JSON-compatible value.
 * @returns A canonical JSON string.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
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
 * Canonical identifier list bound into AuthController `identifiersHash`.
 *
 * @param identifiers - Identifier set.
 * @returns Sorted identifier records including verifier material.
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
      canonicalize(left).localeCompare(canonicalize(right)),
    );
}

/**
 * @returns A random 0x-prefixed id.
 */
export function randomId(): Hex {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Generates an ephemeral ECDSA P-256 proof key pair for key-bound identifier PoP.
 *
 * @returns JWK-encoded public and private keys.
 */
export async function generateSigningKey(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const privateKeyBytes = p256.utils.randomPrivateKey();
  const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false);
  const publicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicKeyBytes.slice(1, 33)),
    y: toBase64Url(publicKeyBytes.slice(33, 65)),
  };
  return {
    publicKey: JSON.stringify(publicJwk),
    privateKey: JSON.stringify({
      ...publicJwk,
      d: toBase64Url(privateKeyBytes),
    }),
  };
}

/**
 * Signs a message with the ephemeral proof private key.
 *
 * @param privateKey - JWK JSON private key.
 * @param message - Message string; hashed with SHA-256 before ECDSA.
 * @returns Compact IEEE P1363 hex signature (`r‖s`).
 */
export async function sign(privateKey: string, message: string): Promise<Hex> {
  const jwk = JSON.parse(privateKey) as { d?: string };
  if (typeof jwk.d !== 'string') {
    throw new Error('Invalid P-256 private JWK');
  }
  const digest = await sha256(stringToBytes(message));
  return bytesToHex(
    p256.sign(digest, fromBase64Url(jwk.d)).toCompactRawBytes(),
  );
}

/**
 * Verifies a proof signature against a public key.
 *
 * @param publicKey - JWK JSON public key.
 * @param signature - Compact IEEE P1363 hex signature.
 * @param message - Message string; hashed with SHA-256 before ECDSA.
 * @returns Whether the signature is valid.
 */
export async function verifySignature(
  publicKey: string,
  signature: string,
  message: string,
): Promise<boolean> {
  const jwk = JSON.parse(publicKey) as { x?: string; y?: string };
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    return false;
  }
  try {
    const digest = await sha256(stringToBytes(message));
    return p256.verify(
      hexToBytes(signature as Hex),
      digest,
      concatBytes([
        new Uint8Array([0x04]),
        fromBase64Url(jwk.x),
        fromBase64Url(jwk.y),
      ]),
    );
  } catch {
    return false;
  }
}

/**
 * Receipt domain-separated digest from the recovery ADR.
 *
 * @param receiptFields - Receipt fields covered by the signature.
 * @param receiptFields.escrowId - Escrow that issued the receipt.
 * @param receiptFields.mutationId - Mutation id.
 * @param receiptFields.requestHash - Mutation request hash.
 * @param receiptFields.version - Applied version.
 * @returns Hex digest.
 */
export async function hashMutationReceipt(receiptFields: {
  escrowId: string;
  mutationId: string;
  requestHash: string;
  version: number;
}): Promise<Hex> {
  return await hash([
    'mfa-recovery-mutation-receipt-v1',
    receiptFields.escrowId,
    receiptFields.mutationId,
    receiptFields.requestHash,
    receiptFields.version,
  ]);
}

/**
 * Converts bytes to 0x-prefixed hex.
 *
 * @param bytes - Secret bytes.
 * @returns Hex string.
 */
export function bytesToSecretHex(bytes: Uint8Array): Hex {
  return bytesToHex(bytes);
}

/**
 * Converts a 0x-prefixed hex secret to bytes.
 *
 * @param secretHex - Hex string.
 * @returns Secret bytes.
 */
export function secretHexToBytes(secretHex: string): Uint8Array {
  return hexToBytes(
    (secretHex.startsWith('0x') ? secretHex : `0x${secretHex}`) as Hex,
  );
}

/**
 * Encodes bytes as unpadded base64url (JWK coordinate format).
 *
 * @param bytes - Raw coordinate or scalar.
 * @returns Base64url string.
 */
function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/[=]+$/u, '');
}

/**
 * Decodes unpadded base64url JWK coordinates.
 *
 * @param value - Base64url string.
 * @returns Raw bytes.
 */
function fromBase64Url(value: string): Uint8Array {
  return base64ToBytes(
    value
      .replace(/-/gu, '+')
      .replace(/_/gu, '/')
      .padEnd(value.length + ((4 - (value.length % 4)) % 4), '='),
  );
}

/**
 * Recursively sorts keys and encodes Uint8Array as hex.
 *
 * @param value - Value to normalize.
 * @returns JSON-safe canonical form.
 */
function sortKeys(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
