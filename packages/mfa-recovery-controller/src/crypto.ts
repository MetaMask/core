import { bytesToHex, hexToBytes, stringToBytes } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { Identifier } from './types.js';

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const ECDSA_SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

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
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    stringToBytes(canonicalize(value)),
  );
  return bytesToHex(new Uint8Array(digest));
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
  const pair = await globalThis.crypto.subtle.generateKey(ECDSA, true, [
    'sign',
    'verify',
  ]);
  const [publicJwk, privateJwk] = await Promise.all([
    globalThis.crypto.subtle.exportKey('jwk', pair.publicKey),
    globalThis.crypto.subtle.exportKey('jwk', pair.privateKey),
  ]);
  return {
    publicKey: JSON.stringify(publicJwk),
    privateKey: JSON.stringify(privateJwk),
  };
}

/**
 * Signs a message with the ephemeral proof private key.
 *
 * @param privateKey - JWK JSON private key.
 * @param message - Prehashed message hex or string.
 * @returns Hex signature.
 */
export async function sign(privateKey: string, message: string): Promise<Hex> {
  const key = await globalThis.crypto.subtle.importKey(
    'jwk',
    JSON.parse(privateKey) as JsonWebKey,
    ECDSA,
    false,
    ['sign'],
  );
  const signature = await globalThis.crypto.subtle.sign(
    ECDSA_SIGN,
    key,
    stringToBytes(message),
  );
  return bytesToHex(new Uint8Array(signature));
}

/**
 * Verifies a proof signature against a public key.
 *
 * @param publicKey - JWK JSON public key.
 * @param signature - Hex signature.
 * @param message - Prehashed message.
 * @returns Whether the signature is valid.
 */
export async function verifySignature(
  publicKey: string,
  signature: string,
  message: string,
): Promise<boolean> {
  const key = await globalThis.crypto.subtle.importKey(
    'jwk',
    JSON.parse(publicKey) as JsonWebKey,
    ECDSA,
    false,
    ['verify'],
  );
  return await globalThis.crypto.subtle.verify(
    ECDSA_SIGN,
    key,
    hexToBytes(signature as Hex),
    stringToBytes(message),
  );
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
