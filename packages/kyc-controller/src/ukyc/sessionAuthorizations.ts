import { stringToBytes } from '@metamask/utils';

import { deriveClientMaterial } from './deriveClientMaterial.js';
import { verifyJwtChain } from './jwtChain.js';
import type { Jwk } from './jwtChain.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './storageAccessToken.js';
import { wrapEncryptionKey } from './wrapEncryptionKey.js';
import type { WrappedEncryptionKeyParts } from './wrapEncryptionKey.js';

/**
 * Lifetime of the read-only `ukyc_capability_token` minted when creating a
 * UKYC session. The storage-and-auth spec requires the token's `expires_at` to
 * cover the KYC session's expected lifetime — including the provider journey —
 * rather than a fixed short window, so this is a session-scoped window.
 */
export const UKYC_CAPABILITY_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

/**
 * Per-secret encryption schema from `createUkycSession`. Only the attested
 * server public key and jwtChain are needed to wrap authorizations.
 */
export type UkycEncryptionSchema = {
  serverPublicKey: { x: string };
  jwtChain: string;
};

/**
 * Confirms that an encryption schema's `serverPublicKey.x` matches the
 * `sessionServerPublicKeyX` attested inside its verified `jwtChain`. Rejects
 * a key that was swapped out-of-band after the chain was signed.
 *
 * @param keys - The issuer JWKS used to verify the chain (idOS enclave for
 * `encryptionDataKey`, idOS relay for `ukycCapabilityToken`).
 * @param schema - The encryption schema returned by session creation.
 */
export function assertAttestedServerPublicKey(
  keys: Jwk[],
  schema: UkycEncryptionSchema,
): void {
  const jwtChainPayload = verifyJwtChain(keys, schema.jwtChain);
  if (jwtChainPayload.sessionServerPublicKeyX !== schema.serverPublicKey.x) {
    throw new Error(
      'sessionServerPublicKey does not match the verified jwtChain payload (sessionServerPublicKeyX).',
    );
  }
}

/**
 * Derives the `data_encryption_key` from `local_user_secret`, mints a
 * read-only capability token, and wraps both for the session server. Only the
 * wrapped (encrypted) material should leave the device.
 *
 * @param params - Wrapping inputs.
 * @param params.sessionClientPrivateKey - Per-session X25519 private key.
 * @param params.encryptionDataKey - Schema used to wrap the encryption key.
 * @param params.capabilityTokenSchema - Schema used to wrap the capability token.
 * @param params.localUserSecret - Wallet UKYC `local_user_secret`.
 * @param params.now - Clock used for the token `expires_at`. Defaults to `Date.now`.
 * @returns Wrapped authorizations ready for `setAuthorizations`.
 */
export function wrapUkycSessionAuthorizations(params: {
  sessionClientPrivateKey: Uint8Array;
  encryptionDataKey: UkycEncryptionSchema;
  capabilityTokenSchema: UkycEncryptionSchema;
  localUserSecret: Uint8Array;
}): {
  wrappedEncryptionDataKey: WrappedEncryptionKeyParts;
  wrappedUkycCapabilityToken: WrappedEncryptionKeyParts;
} {
  const {
    sessionClientPrivateKey,
    encryptionDataKey,
    capabilityTokenSchema,
    localUserSecret,
  } = params;
  const clientMaterial = deriveClientMaterial(localUserSecret);

  const wrappedEncryptionDataKey = wrapEncryptionKey(
    sessionClientPrivateKey,
    encryptionDataKey.serverPublicKey.x,
    clientMaterial.dataEncryptionKey,
  );
  const ukycCapabilityToken = signStorageAccessToken({
    material: clientMaterial,
    // TODO: Confirm with idOS when this can be switched back to read and a separate token is sent for write
    operations: ['read', 'write'],
    expiresAt: new Date(Date.now() + UKYC_CAPABILITY_TOKEN_TTL_MS),
  });
  const wrappedUkycCapabilityToken = wrapEncryptionKey(
    sessionClientPrivateKey,
    capabilityTokenSchema.serverPublicKey.x,
    stringToBytes(encodeStorageAccessTokenForHeader(ukycCapabilityToken)),
  );

  return { wrappedEncryptionDataKey, wrappedUkycCapabilityToken };
}
