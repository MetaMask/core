/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KycService } from './KycService';

/**
 * Resolves the customer's country from the geolocation source and converts it
 * to an ISO 3166-1 alpha-3 code.
 *
 * @returns The alpha-3 country code.
 * @throws If the country cannot be determined or mapped.
 */
export type KycServiceGetGeoCountryAction = {
  type: `KycService:getGeoCountry`;
  handler: KycService['getGeoCountry'];
};

/**
 * Fetches the disclaimers the customer must accept before a session is
 * created.
 *
 * @param params - The parameters.
 * @param params.country - ISO 3166-1 alpha-3 country code.
 * @returns The disclaimers.
 */
export type KycServiceFetchDisclaimersAction = {
  type: `KycService:fetchDisclaimers`;
  handler: KycService['fetchDisclaimers'];
};

/**
 * Creates a vendor session via the UKYC backend.
 *
 * @param params - The session parameters.
 * @returns The created session token.
 */
export type KycServiceCreateSessionAction = {
  type: `KycService:createSession`;
  handler: KycService['createSession'];
};

/**
 * Checks whether KYC is required for the given access token, country, and
 * capabilities.
 *
 * @param params - The check parameters.
 * @returns Whether KYC is required.
 */
export type KycServiceCheckKycRequiredAction = {
  type: `KycService:checkKycRequired`;
  handler: KycService['checkKycRequired'];
};

/**
 * Requests a per-session wrapping key from the UKYC backend.
 *
 * The client sends its ephemeral X25519 public key; the backend responds with
 * its session public key (`sessionServerPublicKey`) and a `jwtChain` that
 * attests it. The caller must verify `jwtChain` against the Fractal JWKS
 * (see {@link KycService.fetchJwks}) before trusting the key to wrap the
 * `data_encryption_key`.
 *
 * @param params - The parameters.
 * @param params.sessionClientPublicKey - Our ephemeral X25519 public key
 * (base64url).
 * @returns The wrapping key id, `jwtChain`, and session server public key.
 */
export type KycServiceGetWrappingKeyAction = {
  type: `KycService:getWrappingKey`;
  handler: KycService['getWrappingKey'];
};

/**
 * Fetches the Fractal encryption service JWKS used to verify the `jwtChain`
 * returned by {@link KycService.getWrappingKey}.
 *
 * This is an unauthenticated request to a well-known path on the Fractal
 * host, distinct from the UKYC base URL.
 *
 * @returns The JWKS keys.
 */
export type KycServiceFetchJwksAction = {
  type: `KycService:fetchJwks`;
  handler: KycService['fetchJwks'];
};

/**
 * Creates a UKYC session for the SumSub document-verification sub-flow,
 * handing over the wrapped `data_encryption_key` and a client-signed,
 * read-only `ukyc_capability_token`.
 *
 * @param params - The session parameters.
 * @returns The UKYC session identifiers.
 */
export type KycServiceCreateUkycSessionAction = {
  type: `KycService:createUkycSession`;
  handler: KycService['createUkycSession'];
};

/**
 * Fetches (or refreshes) the SumSub applicant access token for a UKYC
 * session.
 *
 * @param params - The parameters.
 * @param params.sessionId - The UKYC session id from `createUkycSession`.
 * @param params.idosSessionId - The idOS session id from `createUkycSession`.
 * @returns The applicant access token and status.
 */
export type KycServiceFetchApplicantAccessTokenAction = {
  type: `KycService:fetchApplicantAccessToken`;
  handler: KycService['fetchApplicantAccessToken'];
};

/**
 * Union of all KycService action types.
 */
export type KycServiceMethodActions =
  | KycServiceGetGeoCountryAction
  | KycServiceFetchDisclaimersAction
  | KycServiceCreateSessionAction
  | KycServiceCheckKycRequiredAction
  | KycServiceGetWrappingKeyAction
  | KycServiceFetchJwksAction
  | KycServiceCreateUkycSessionAction
  | KycServiceFetchApplicantAccessTokenAction;
