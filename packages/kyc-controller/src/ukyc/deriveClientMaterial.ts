import { getPublicKey } from '@metamask/cryptography/ed25519';
import { hkdfSha256 } from '@metamask/cryptography/hkdf';
import { stringToBytes } from '@metamask/utils';

import { toBase64Url } from '../encoding.js';
import { UKYC_DERIVED_KEY_SIZES, UKYC_KDF_INFO } from './constants.js';

/**
 * Derives UKYC client material from the root `local_user_secret` using
 * HKDF-SHA256 with domain-separated `info` labels — see the architecture doc,
 * section "Client-Derived Material".
 */

/**
 * The set of values derived from `local_user_secret`.
 */
export type UkycClientMaterial = {
  /** Opaque lookup key for the encrypted KYC object. */
  storageId: Uint8Array<ArrayBuffer>;
  /** Symmetric key that encrypts `encrypted_kyc_data` (or wraps per-blob keys). */
  dataEncryptionKey: Uint8Array<ArrayBuffer>;
  /**
   * Ed25519 private key used to sign `storage_access_token` capabilities. For
   * Ed25519 the 32-byte HKDF output *is* the private key. The private half
   * never leaves the device.
   */
  signingKey: Uint8Array<ArrayBuffer>;
  /** Public half of `signingKey`, registered with the object on first write. */
  signingPublicKey: Uint8Array<ArrayBuffer>;
  /** Key for establishing/authenticating the encrypted tunnel to idOS, if needed. */
  relayTunnelKey: Uint8Array<ArrayBuffer>;
};

/**
 * The same material with byte fields base64url-encoded, matching the wire
 * shapes in the architecture doc (`storage_id` as an opaque id, public key as a
 * "base64url public key"). Secret material is intentionally omitted.
 */
export type EncodedUkycClientMaterial = {
  storageId: string;
  signingPublicKey: string;
};

/**
 * Derives a single labeled value from `local_user_secret`.
 *
 * No salt is used: `local_user_secret` is already a high-entropy
 * uniformly-random secret, so per-output domain separation comes entirely from
 * the `info` label.
 *
 * @param localUserSecret - The root `local_user_secret` bytes.
 * @param info - Domain-separation label for this output.
 * @param length - Desired output length in bytes.
 * @returns The derived bytes.
 */
async function deriveLabeled(
  localUserSecret: Uint8Array<ArrayBuffer>,
  info: string,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  return hkdfSha256(
    localUserSecret,
    new Uint8Array(),
    stringToBytes(info),
    length,
  );
}

/**
 * Derives all UKYC client material from the root `local_user_secret`.
 *
 * This is a pure function of `local_user_secret`: the same input always yields
 * the same outputs, which is what makes `storage_id` and `signing_key` stable
 * across sessions and devices.
 *
 * @param localUserSecret - The `local_user_secret` produced by
 * `getOrCreateLocalUserSecret`.
 * @returns The derived {@link UkycClientMaterial}.
 */
export async function deriveClientMaterial(
  localUserSecret: Uint8Array<ArrayBuffer>,
): Promise<UkycClientMaterial> {
  const storageId = await deriveLabeled(
    localUserSecret,
    UKYC_KDF_INFO.storageId,
    UKYC_DERIVED_KEY_SIZES.storageId,
  );

  const dataEncryptionKey = await deriveLabeled(
    localUserSecret,
    UKYC_KDF_INFO.dataEncryptionKey,
    UKYC_DERIVED_KEY_SIZES.dataEncryptionKey,
  );

  const signingKey = await deriveLabeled(
    localUserSecret,
    UKYC_KDF_INFO.signingKey,
    UKYC_DERIVED_KEY_SIZES.signingKey,
  );

  const relayTunnelKey = await deriveLabeled(
    localUserSecret,
    UKYC_KDF_INFO.relayTunnelKey,
    UKYC_DERIVED_KEY_SIZES.relayTunnelKey,
  );

  const signingPublicKey = await getPublicKey(signingKey);

  return {
    storageId,
    dataEncryptionKey,
    signingKey,
    signingPublicKey,
    relayTunnelKey,
  };
}

/**
 * Encodes the non-secret client material into the base64url wire shapes used by
 * the UKYC storage API (`storage_id` and `signing_public_key`).
 *
 * @param material - The derived client material.
 * @returns The base64url-encoded, non-secret fields.
 */
export function encodeClientMaterial(
  material: UkycClientMaterial,
): EncodedUkycClientMaterial {
  return {
    storageId: toBase64Url(material.storageId),
    signingPublicKey: toBase64Url(material.signingPublicKey),
  };
}
