import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { v4 as uuid } from 'uuid';

import type { EntropyId, EntropyType } from './types';

/**
 * Checks whether a keyring is a source of entropy — i.e. whether it owns
 * secret material that the {@link EntropyController} should track.
 *
 * Currently matches HD keyrings (`'HD Key Tree'`, which own a BIP-39 mnemonic)
 * and Simple keyrings (`'Simple Key Pair'`, which own imported private keys).
 *
 * @param keyring - The keyring object from `KeyringController` state.
 * @returns `true` if the keyring owns entropy, `false` otherwise.
 */
export function isKeyringOwningEntropy(keyring: KeyringObject): boolean {
  return keyring.type === KeyringTypes.hd || keyring.type === KeyringTypes.simple;
}

/**
 * Computes the raw HMAC-SHA256 digest for a piece of entropy — the shared
 * primitive underlying both {@link toEntropyFingerprint} and
 * {@link toEntropyId}.
 *
 * Using the secret as the HMAC key and the `EntropyType` as the domain
 * separator ensures non-reversibility and type-scoping.
 *
 * `@noble/hashes` is synchronous today, but the async signature is kept as a
 * forward-compatible seam: a future migration to the Web Crypto API (or any
 * other async primitive) won't require changes at every call site.
 *
 * @param secret - The raw entropy bytes.
 * @param entropyType - The type of entropy source.
 * @returns The 32-byte HMAC-SHA256 digest.
 */
async function toEntropyFingerprintBytes(
  secret: Uint8Array,
  entropyType: EntropyType,
): Promise<Uint8Array> {
  const message = new TextEncoder().encode(
    `metamask:${entropyType}:fingerprint`,
  );
  return hmac(sha256, secret, message);
}

/**
 * Computes a deterministic, non-reversible hex fingerprint for a piece of
 * entropy.
 *
 * The fingerprint is `hex(HMAC-SHA256(key=secret, msg='metamask:{entropyType}:fingerprint'))`.
 * It is suitable for comparison and auditing — e.g. detecting that two
 * separate components hold the same underlying secret.
 *
 * @param secret - The raw entropy bytes (e.g. BIP-39 mnemonic bytes, a 32-byte
 * private key).
 * @param entropyType - The type of entropy source, expressed as
 * `category:implementation` (e.g. `'bip44:srp'`, `'raw:private-key'`).
 * @returns The lowercase hex-encoded 32-byte HMAC-SHA256 digest.
 */
export async function toEntropyFingerprint(
  secret: Uint8Array,
  entropyType: EntropyType,
): Promise<string> {
  return bytesToHex(await toEntropyFingerprintBytes(secret, entropyType));
}

/**
 * Derives a deterministic UUID v4 to use as an {@link EntropyId}.
 *
 * The UUID is built from the first 16 bytes of
 * `HMAC-SHA256(key=secret, msg='metamask:{entropyType}:fingerprint')`,
 * formatted as a standard UUID v4 (with the version and variant bits fixed by
 * the UUID spec). Same secret + same type always produces the same ID.
 *
 * @param secret - The raw entropy bytes (e.g. BIP-39 mnemonic bytes, a 32-byte
 * private key).
 * @param entropyType - The type of entropy source, expressed as
 * `category:implementation` (e.g. `'bip44:srp'`, `'raw:private-key'`).
 * @returns A deterministic UUID v4 string suitable for use as an
 * {@link EntropyId}.
 */
export async function toEntropyId(
  secret: Uint8Array,
  entropyType: EntropyType,
): Promise<EntropyId> {
  const bytes = await toEntropyFingerprintBytes(secret, entropyType);
  return uuid({ random: bytes.slice(0, 16) });
}
