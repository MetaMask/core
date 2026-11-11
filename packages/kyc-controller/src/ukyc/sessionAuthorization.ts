import { stringToBytes, wrapError } from '@metamask/utils';
import { x25519 } from '@noble/curves/ed25519';

import { toBase64Url } from '../encoding.js';
import type {
  CapabilityAuthorization,
  EncryptionSchema,
  KycService,
} from '../KycService.js';
import type { OnboardingVendor, KycSessionStatus } from '../types.js';
import { deriveClientMaterial } from './deriveClientMaterial.js';
import type { UkycClientMaterial } from './deriveClientMaterial.js';
import { assertAttestedServerPublicKey } from './jwtChain.js';
import type { Jwk } from './jwtChain.js';
import { getOrCreateLocalUserSecret } from './localUserSecret.js';
import type { UkycLocalUserSecretStoreAccess } from './localUserSecret.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './storageAccessToken.js';
import { wrapEncryptionKey } from './wrapEncryptionKey.js';

/**
 * How long the capability token that lets idOS read and write the user's
 * encrypted KYC data stays valid.
 */
const UKYC_CAPABILITY_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * What session authorization calls out to: the `KycService` requests and
 * Encrypted User Storage for the `local_user_secret`. The controller builds
 * this from its own messenger, so the helpers need no messenger type.
 */
export type UkycSessionDeps = Pick<
  KycService,
  | 'createUkycSession'
  | 'resetWrappingKeys'
  | 'setAuthorizations'
  | 'fetchIdosEnclaveJwks'
  | 'fetchIdosRelayJwks'
> & {
  localUserSecretStore: UkycLocalUserSecretStoreAccess;
};

/**
 * Creates a UKYC session for the vendor, then wraps the
 * `data_encryption_key` and `ukyc_capability_token` for the session server
 * and submits both. Only the wrapped (encrypted) material leaves the device.
 *
 * @param params - The session parameters.
 * @param params.deps - The calls session authorization makes.
 * @param params.vendor - Vendor for the session.
 * @param params.residenceCountry - ISO 3166-1 alpha-3 country of residence.
 * @param params.aal2Token - AAL2 token, sent as the bearer value for session
 * creation.
 * @param params.email - Email the vendor registers the user with, for vendors
 * kyc-api opens sessions for through the relay.
 * @returns The session status after the authorizations are applied.
 */
export async function createAuthorizedSession(params: {
  deps: UkycSessionDeps;
  vendor: OnboardingVendor;
  residenceCountry: string;
  aal2Token: string;
  email?: string;
}): Promise<KycSessionStatus> {
  const { deps } = params;
  // A per-session X25519 keypair seals both secrets. The private half stays
  // on the device. The public half is registered on the session so the
  // server can open the authorizations.
  const sessionClientPrivateKey = x25519.utils.randomSecretKey();
  const sessionClientPublicKey = toBase64Url(
    x25519.getPublicKey(sessionClientPrivateKey),
  );

  const {
    sessionId,
    encryptionDataKey: encryptionDataKeySchema,
    ukycCapabilityToken: capabilityTokenSchema,
  } = await deps.createUkycSession({
    sessionClientPublicKey,
    residenceCountry: params.residenceCountry,
    vendor: params.vendor,
    aal2Token: params.aal2Token,
    ...(params.email ? { email: params.email } : {}),
  });

  return submitAuthorizations({
    deps,
    sessionId,
    sessionClientPrivateKey,
    encryptionDataKeySchema,
    capabilityTokenSchema,
  });
}

/**
 * Issues new wrapping keys for an existing session and submits fresh
 * authorizations. Used when the session reports its capability authorization
 * as `new` or `expired`.
 *
 * @param params - The parameters.
 * @param params.deps - The calls session authorization makes.
 * @param params.sessionId - The UKYC session id.
 * @returns The session status after the authorizations are applied.
 */
export async function refreshSessionAuthorizations(params: {
  deps: UkycSessionDeps;
  sessionId: string;
}): Promise<KycSessionStatus> {
  const { deps, sessionId } = params;
  const sessionClientPrivateKey = x25519.utils.randomSecretKey();
  const sessionClientPublicKey = toBase64Url(
    x25519.getPublicKey(sessionClientPrivateKey),
  );

  const {
    encryptionDataKey: encryptionDataKeySchema,
    ukycCapabilityToken: capabilityTokenSchema,
  } = await deps.resetWrappingKeys({
    sessionId,
    sessionClientPublicKey,
  });

  return submitAuthorizations({
    deps,
    sessionId,
    sessionClientPrivateKey,
    encryptionDataKeySchema,
    capabilityTokenSchema,
  });
}

/**
 * Verifies the encryption schemas, wraps both secrets and submits them.
 *
 * @param params - Session key material and encryption schemas.
 * @param params.deps - The calls session authorization makes.
 * @param params.sessionId - UKYC session id to authorize.
 * @param params.sessionClientPrivateKey - Per-session X25519 private key.
 * @param params.encryptionDataKeySchema - Schema for the data encryption key.
 * @param params.capabilityTokenSchema - Schema for the capability token.
 * @returns The session status after the authorizations are applied.
 */
async function submitAuthorizations(params: {
  deps: UkycSessionDeps;
  sessionId: string;
  sessionClientPrivateKey: Uint8Array;
  encryptionDataKeySchema: EncryptionSchema;
  capabilityTokenSchema: EncryptionSchema;
}): Promise<KycSessionStatus> {
  const {
    deps,
    sessionId,
    sessionClientPrivateKey,
    encryptionDataKeySchema,
    capabilityTokenSchema,
  } = params;

  await verifyWrappingKeys(
    deps,
    encryptionDataKeySchema,
    capabilityTokenSchema,
  );

  const clientMaterial = await getClientMaterial(deps.localUserSecretStore);
  const wrappedEncryptionDataKey = wrapEncryptionKey(
    sessionClientPrivateKey,
    encryptionDataKeySchema.serverPublicKey.x,
    clientMaterial.dataEncryptionKey,
  );
  const wrappedUkycCapabilityToken = wrapCapabilityToken({
    clientMaterial,
    sessionClientPrivateKey,
    serverPublicKeyX: capabilityTokenSchema.serverPublicKey.x,
  });

  return deps.setAuthorizations({
    sessionId,
    wrappedEncryptionDataKey,
    wrappedUkycCapabilityToken,
  });
}

/**
 * Verifies each schema's `jwtChain` against the matching issuer's keys, then
 * confirms the server public key matches the value attested inside the
 * verified token. The idOS enclave attests `encryptionDataKey`, and the idOS
 * relay attests `ukycCapabilityToken`.
 *
 * @param deps - The calls session authorization makes.
 * @param encryptionDataKey - Schema for the data encryption key.
 * @param capabilityTokenSchema - Schema for the capability token.
 * @throws When the issuer keys cannot be fetched, or a schema does not verify.
 */
async function verifyWrappingKeys(
  deps: UkycSessionDeps,
  encryptionDataKey: EncryptionSchema,
  capabilityTokenSchema: EncryptionSchema,
): Promise<void> {
  let idosEnclaveKeys: Jwk[];
  let idosRelayKeys: Jwk[];
  try {
    [{ keys: idosEnclaveKeys }, { keys: idosRelayKeys }] = await Promise.all([
      deps.fetchIdosEnclaveJwks(),
      deps.fetchIdosRelayJwks(),
    ]);
  } catch (error) {
    throw wrapError(
      error,
      'VendorOnboardingController: Unable to fetch JWKS needed to verify wrapping keys.',
    );
  }

  try {
    assertAttestedServerPublicKey(idosEnclaveKeys, encryptionDataKey);
    assertAttestedServerPublicKey(idosRelayKeys, capabilityTokenSchema);
  } catch (error) {
    throw wrapError(
      error,
      'VendorOnboardingController: Failed to verify the wrapping keys.',
    );
  }
}

/**
 * Loads the stored `local_user_secret`, creating one when none exists, and
 * derives the UKYC client material from it.
 *
 * @param store - Encrypted User Storage adapter.
 * @returns Client material derived from `local_user_secret`.
 */
async function getClientMaterial(
  store: UkycLocalUserSecretStoreAccess,
): Promise<UkycClientMaterial> {
  const localUserSecret = await getOrCreateLocalUserSecret(store);
  return deriveClientMaterial(localUserSecret);
}

/**
 * Mints a `ukyc_capability_token` that grants read and write for the session
 * and seals it for the capability-token server key.
 *
 * @param params - Key material.
 * @param params.clientMaterial - Client material from `local_user_secret`.
 * @param params.sessionClientPrivateKey - X25519 private key used to seal.
 * @param params.serverPublicKeyX - Server X25519 public key (unpadded
 * base64url) from the capability-token schema.
 * @returns The wrapped capability token.
 */
function wrapCapabilityToken(params: {
  clientMaterial: UkycClientMaterial;
  sessionClientPrivateKey: Uint8Array;
  serverPublicKeyX: string;
}): CapabilityAuthorization {
  const ukycCapabilityToken = signStorageAccessToken({
    material: params.clientMaterial,
    // TODO: Confirm with idOS when this can be switched back to read and a
    // separate token is sent for write (same open question as KycController).
    operations: ['read', 'write'],
    expiresAt: new Date(Date.now() + UKYC_CAPABILITY_TOKEN_TTL_MS),
  });
  return wrapEncryptionKey(
    params.sessionClientPrivateKey,
    params.serverPublicKeyX,
    stringToBytes(encodeStorageAccessTokenForHeader(ukycCapabilityToken)),
  );
}
