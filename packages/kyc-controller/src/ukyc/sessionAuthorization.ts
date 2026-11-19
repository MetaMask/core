import type { Messenger } from '@metamask/messenger';
import { stringToBytes, wrapError } from '@metamask/utils';

import { generateKeyPair } from '../crypto.js';
import { toBase64Url } from '../encoding.js';
import type {
  KycServiceCreateUkycSessionAction,
  KycServiceFetchIdosEnclaveJwksAction,
  KycServiceFetchIdosRelayJwksAction,
  KycServiceResetWrappingKeysAction,
  KycServiceSetAuthorizationsAction,
} from '../KycService-method-action-types.js';
import type {
  CapabilityAuthorization,
  EncryptionSchema,
  JwksResponse,
  UkycSessionResponse,
} from '../KycService.js';
import type { OnboardingVendor, KycSessionStatus } from '../types.js';
import { deriveClientMaterial } from './deriveClientMaterial.js';
import type { UkycClientMaterial } from './deriveClientMaterial.js';
import { assertAttestedServerPublicKey } from './jwtChain.js';
import type { Jwk } from './jwtChain.js';
import { getOrCreateLocalUserSecret } from './localUserSecret.js';
import type { UkycLocalUserSecretStore } from './localUserSecret.js';
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
 * Messenger that can call the `KycService` actions session authorization uses.
 *
 * `Messenger` is invariant in its action union, so this is the `call` shape
 * rather than `Messenger` itself. A controller messenger that allows more
 * actions is still assignable.
 */
type SessionAuthorizationMessenger = {
  call: (
    ...args: Parameters<
      Messenger<
        string,
        | KycServiceCreateUkycSessionAction
        | KycServiceFetchIdosEnclaveJwksAction
        | KycServiceFetchIdosRelayJwksAction
        | KycServiceResetWrappingKeysAction
        | KycServiceSetAuthorizationsAction
      >['call']
    >
  ) => unknown;
};

/**
 * Creates a UKYC session for the vendor, then wraps the
 * `data_encryption_key` and `ukyc_capability_token` for the session server
 * and submits both. Only the wrapped (encrypted) material leaves the device.
 *
 * @param params - The session parameters.
 * @param params.messenger - Messenger that can call `KycService`.
 * @param params.localUserSecretStore - Encrypted User Storage for the
 * `local_user_secret`.
 * @param params.vendor - Vendor for the session.
 * @param params.residenceCountry - ISO 3166-1 alpha-3 country of residence.
 * @param params.aal2Token - AAL2 token, sent as the bearer value for session
 * creation.
 * @param params.partnerIdentityToken - Partner identity token. kyc-api takes
 * the session's email from its verified claim.
 * @returns The session status after the authorizations are applied.
 */
export async function createUkycSession(params: {
  messenger: SessionAuthorizationMessenger;
  localUserSecretStore: UkycLocalUserSecretStore;
  vendor: OnboardingVendor;
  residenceCountry: string;
  aal2Token: string;
  partnerIdentityToken: string;
}): Promise<KycSessionStatus> {
  const { messenger, localUserSecretStore } = params;
  // A per-session X25519 keypair seals both secrets. The private half stays
  // on the device. The public half is registered on the session so the
  // server can open the authorizations.
  const { privateKey: sessionClientPrivateKey, publicKey } =
    await generateKeyPair();
  const sessionClientPublicKey = toBase64Url(publicKey);

  const {
    sessionId,
    encryptionDataKey: encryptionDataKeySchema,
    ukycCapabilityToken: capabilityTokenSchema,
  } = (await messenger.call('KycService:createUkycSession', {
    sessionClientPublicKey,
    residenceCountry: params.residenceCountry,
    vendor: params.vendor,
    aal2Token: params.aal2Token,
    partnerIdentityToken: params.partnerIdentityToken,
  })) as UkycSessionResponse;

  return setAuthorizations({
    messenger,
    localUserSecretStore,
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
 * @param params.messenger - Messenger that can call `KycService`.
 * @param params.localUserSecretStore - Encrypted User Storage for the
 * `local_user_secret`.
 * @param params.sessionId - The UKYC session id.
 * @returns The session status after the authorizations are applied.
 */
export async function refreshAuthorizations(params: {
  messenger: SessionAuthorizationMessenger;
  localUserSecretStore: UkycLocalUserSecretStore;
  sessionId: string;
}): Promise<KycSessionStatus> {
  const { messenger, localUserSecretStore, sessionId } = params;
  const { privateKey: sessionClientPrivateKey, publicKey } =
    await generateKeyPair();
  const sessionClientPublicKey = toBase64Url(publicKey);

  const {
    encryptionDataKey: encryptionDataKeySchema,
    ukycCapabilityToken: capabilityTokenSchema,
  } = (await messenger.call('KycService:resetWrappingKeys', {
    sessionId,
    sessionClientPublicKey,
  })) as UkycSessionResponse;

  return setAuthorizations({
    messenger,
    localUserSecretStore,
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
 * @param params.messenger - Messenger that can call `KycService`.
 * @param params.localUserSecretStore - Encrypted User Storage for the
 * `local_user_secret`.
 * @param params.sessionId - UKYC session id to authorize.
 * @param params.sessionClientPrivateKey - Per-session X25519 private key.
 * @param params.encryptionDataKeySchema - Schema for the data encryption key.
 * @param params.capabilityTokenSchema - Schema for the capability token.
 * @returns The session status after the authorizations are applied.
 */
async function setAuthorizations(params: {
  messenger: SessionAuthorizationMessenger;
  localUserSecretStore: UkycLocalUserSecretStore;
  sessionId: string;
  sessionClientPrivateKey: Uint8Array;
  encryptionDataKeySchema: EncryptionSchema;
  capabilityTokenSchema: EncryptionSchema;
}): Promise<KycSessionStatus> {
  const {
    messenger,
    localUserSecretStore,
    sessionId,
    sessionClientPrivateKey,
    encryptionDataKeySchema,
    capabilityTokenSchema,
  } = params;

  await verifyWrappingKeys(
    messenger,
    encryptionDataKeySchema,
    capabilityTokenSchema,
  );

  const clientMaterial = await getClientMaterial(localUserSecretStore);
  const wrappedEncryptionDataKey = wrapEncryptionKey(
    sessionClientPrivateKey,
    encryptionDataKeySchema.serverPublicKey.x,
    clientMaterial.dataEncryptionKey,
  );
  const wrappedUkycCapabilityToken = await wrapCapabilityToken({
    clientMaterial,
    sessionClientPrivateKey,
    serverPublicKeyX: capabilityTokenSchema.serverPublicKey.x,
  });

  return (await messenger.call('KycService:setAuthorizations', {
    sessionId,
    wrappedEncryptionDataKey,
    wrappedUkycCapabilityToken,
  })) as KycSessionStatus;
}

/**
 * Verifies each schema's `jwtChain` against the matching issuer's keys, then
 * confirms the server public key matches the value attested inside the
 * verified token. The idOS enclave attests `encryptionDataKey`, and the idOS
 * relay attests `ukycCapabilityToken`.
 *
 * @param messenger - Messenger that can call `KycService`.
 * @param encryptionDataKey - Schema for the data encryption key.
 * @param capabilityTokenSchema - Schema for the capability token.
 * @throws When the issuer keys cannot be fetched, or a schema does not verify.
 */
async function verifyWrappingKeys(
  messenger: SessionAuthorizationMessenger,
  encryptionDataKey: EncryptionSchema,
  capabilityTokenSchema: EncryptionSchema,
): Promise<void> {
  let idosEnclaveKeys: Jwk[];
  let idosRelayKeys: Jwk[];
  try {
    [{ keys: idosEnclaveKeys }, { keys: idosRelayKeys }] = (await Promise.all([
      messenger.call('KycService:fetchIdosEnclaveJwks'),
      messenger.call('KycService:fetchIdosRelayJwks'),
    ])) as [JwksResponse, JwksResponse];
  } catch (error) {
    throw wrapError(
      error,
      'VendorOnboardingController: Unable to fetch JWKS needed to verify wrapping keys.',
    );
  }

  try {
    await Promise.all([
      assertAttestedServerPublicKey(idosEnclaveKeys, encryptionDataKey),
      assertAttestedServerPublicKey(idosRelayKeys, capabilityTokenSchema),
    ]);
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
  store: UkycLocalUserSecretStore,
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
async function wrapCapabilityToken(params: {
  clientMaterial: UkycClientMaterial;
  sessionClientPrivateKey: Uint8Array;
  serverPublicKeyX: string;
}): Promise<CapabilityAuthorization> {
  const ukycCapabilityToken = await signStorageAccessToken({
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
