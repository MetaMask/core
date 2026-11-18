import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';

import {
  UKYC_CAPABILITY_AUTH_SCHEME,
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
} from './constants.js';
import {
  deriveClientMaterial,
  encodeClientMaterial,
} from './deriveClientMaterial.js';
import {
  encodeStorageAccessTokenForHeader,
  signStorageAccessToken,
} from './storageAccessToken.js';
import type {
  UkycStorageAccessToken,
  UkycStorageOperation,
  UkycTokenPresenter,
} from './storageAccessToken.js';

/**
 * Mints ready-to-use UKYC `storage_access_token`s for testing UKYC Storage.
 *
 * This composes the same pure functions the MetaMask client uses in production
 * (`deriveClientMaterial` + `signStorageAccessToken`), so a third party such as
 * idOS can produce a valid, signed token without deriving one on-device. No
 * server "fills in" the `signing_public_key`: it is derived from a
 * `local_user_secret` the caller controls and registered on first write, so
 * reusing the same secret yields a stable `storage_id` and controlling key.
 */

/** Default token lifetime when `expiresAt` is not supplied (4 hours). */
const DEFAULT_TOKEN_LIFETIME_MS = 4 * 60 * 60 * 1000;

/**
 * Inputs for {@link mintUkycTestToken}. All fields are optional; the only value
 * a caller usually pins is `localUserSecret`, so `storage_id` and the signing
 * key stay stable across runs.
 */
export type MintUkycTestTokenParams = {
  /**
   * The root `local_user_secret`, as raw 32 bytes or a hex string. When omitted
   * a fresh random secret is generated (returned in the result so it can be
   * reused).
   */
  localUserSecret?: Uint8Array | string;
  /** Operations the token authorizes. Defaults to `['read']`. */
  operations?: UkycStorageOperation[];
  /** Who will present the token. Defaults to `client`. */
  presenter?: UkycTokenPresenter;
  /** UKYC session id. Required when `presenter` is `idos-relay`. */
  sessionId?: string;
  /** Token issue time. Defaults to now. */
  issuedAt?: Date;
  /** Token expiry. Defaults to `issuedAt` + 4 hours. */
  expiresAt?: Date;
};

/**
 * The minted token plus everything needed to exercise UKYC Storage with it.
 */
export type MintedUkycTestToken = {
  /** The `local_user_secret` used, hex-encoded, so the caller can reuse it. */
  localUserSecret: string;
  /** base64url `storage_id` — use it as the `{storage_id}` path segment. */
  storageId: string;
  /** base64url `signing_public_key` registered on first write. */
  signingPublicKey: string;
  /** The signed token envelope (payload + signature). */
  token: UkycStorageAccessToken;
  /**
   * The full `Authorization` header value, e.g.
   * `AccessToken <base64url(envelope)>`, ready to send to UKYC Storage.
   */
  authorizationHeader: string;
};

/**
 * Resolves the caller-supplied secret into raw bytes, generating a random one
 * when none is provided.
 *
 * @param secret - Raw 32 bytes, a hex string, or undefined for a random secret.
 * @returns The `local_user_secret` bytes.
 */
function resolveLocalUserSecret(secret?: Uint8Array | string): Uint8Array {
  if (secret === undefined) {
    return randomBytes(UKYC_LOCAL_USER_SECRET_SIZE_BYTES);
  }
  return typeof secret === 'string' ? hexToBytes(secret) : secret;
}

/**
 * Mints a signed UKYC `storage_access_token` for testing.
 *
 * @param params - See {@link MintUkycTestTokenParams}.
 * @returns The token, its `Authorization` header, and the derived identifiers.
 */
export function mintUkycTestToken(
  params: MintUkycTestTokenParams = {},
): MintedUkycTestToken {
  const {
    operations = ['read'],
    presenter,
    sessionId,
    issuedAt = new Date(),
    expiresAt = new Date(issuedAt.getTime() + DEFAULT_TOKEN_LIFETIME_MS),
  } = params;

  const localUserSecret = resolveLocalUserSecret(params.localUserSecret);
  const material = deriveClientMaterial(localUserSecret);

  const token = signStorageAccessToken({
    material,
    operations,
    presenter,
    sessionId,
    issuedAt,
    expiresAt,
  });

  const { storageId, signingPublicKey } = encodeClientMaterial(material);

  return {
    localUserSecret: bytesToHex(localUserSecret),
    storageId,
    signingPublicKey,
    token,
    authorizationHeader: `${UKYC_CAPABILITY_AUTH_SCHEME} ${encodeStorageAccessTokenForHeader(
      token,
    )}`,
  };
}
