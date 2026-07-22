import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { v4 as uuid } from 'uuid';

import type { EntropyCategory, EntropyId, EntropyImplementation } from './types';

/**
 * Computes a deterministic, non-reversible fingerprint for a piece of entropy.
 *
 * The fingerprint is a UUID v4 seeded from the first 16 bytes of
 * `HMAC-SHA256(key=material, msg='metamask:fingerprint')`.
 *
 * `@noble/hashes` is synchronous today, but the async signature is kept as a
 * forward-compatible seam: a future migration to the Web Crypto API (or any
 * other async primitive) won't require changes at every call site.
 *
 * @param material - The raw entropy bytes (e.g. BIP-39 mnemonic bytes).
 * @returns A deterministic UUID v4 string that uniquely identifies the entropy
 * without exposing it.
 */
export async function fingerprint(material: Uint8Array): Promise<string> {
  const message = new TextEncoder().encode('metamask:fingerprint');
  const digest = hmac(sha256, material, message);
  return uuid({ random: digest.slice(0, 16) });
}

/**
 * Computes a deterministic, non-reversible hex fingerprint for a piece of
 * entropy. Suitable for comparison and auditing.
 *
 * @param material - The raw entropy bytes.
 * @returns The lowercase hex-encoded 32-byte HMAC-SHA256 digest.
 */
export async function toEntropyFingerprint(
  material: Uint8Array,
): Promise<string> {
  const message = new TextEncoder().encode('metamask:fingerprint');
  const digest = hmac(sha256, material, message);
  return bytesToHex(digest);
}

/**
 * Computes a stable {@link EntropyId} for an entropy source.
 *
 * The ID is formatted as `entropy:{category}:{implementation}:{uuid}`, where
 * the UUID segment is the {@link fingerprint} of `material` when provided, or
 * `'_'` for entropy sources whose secret never leaves the device (e.g. hardware
 * wallets).
 *
 * @param category - The entropy category (e.g. `'bip44'`, `'raw'`).
 * @param implementation - The entropy implementation (e.g. `'mnemonic'`,
 * `'ledger'`, `'private-key'`).
 * @param material - The raw entropy bytes. Omit for hardware wallets or any
 * entropy source where the secret is not directly accessible.
 * @returns A stable {@link EntropyId} string.
 */
export async function toEntropyId(
  category: EntropyCategory,
  implementation: EntropyImplementation,
  material?: Uint8Array,
): Promise<EntropyId> {
  const uuidSegment = material ? await fingerprint(material) : '_';
  return `entropy:${category}:${implementation}:${uuidSegment}`;
}
