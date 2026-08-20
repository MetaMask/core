/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KycService } from './KycService.js';

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
 * @param params.vendor - Identity vendor. Defaults to `moonpay`.
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
 * Checks whether KYC is required for the given vendor, country, and
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
 * Creates (or resumes) an empty-shell customer for the authenticated
 * canonical user on the given identity vendor. Must run before showing
 * vendor T&C so the customer exists and resume logic can key off vendor
 * status.
 *
 * @param params - The parameters.
 * @param params.vendor - Identity vendor (e.g. `iron` for Money/VBA).
 * @param params.email - Email associated with the customer.
 * @returns The vendor customer record (subset validated for controller use).
 */
export type KycServiceCreateVendorCustomerAction = {
  type: `KycService:createVendorCustomer`;
  handler: KycService['createVendorCustomer'];
};

/**
 * Posts T&C1 (vendor signings) and T&C2 (Sumsub + idOS) consents for the
 * authenticated user. The API responds with 204 No Content on success.
 *
 * @param params - The consent parameters.
 */
export type KycServiceSubmitConsentsAction = {
  type: `KycService:submitConsents`;
  handler: KycService['submitConsents'];
};

/**
 * Fetches the user-keyed simplified KYC status used by Money toast / banner
 * surfaces (`GET /kyc/status`).
 *
 * @returns The simplified status payload.
 */
export type KycServiceFetchKycStatusAction = {
  type: `KycService:fetchKycStatus`;
  handler: KycService['fetchKycStatus'];
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
 * handing over the wrapped `data_encryption_key` and the client-signed,
 * read-only `ukyc_capability_token` that authorizes later storage access for
 * the session.
 *
 * @param params - The session parameters.
 * @returns The UKYC session identifiers.
 */
export type KycServiceCreateUkycSessionAction = {
  type: `KycService:createUkycSession`;
  handler: KycService['createUkycSession'];
};

/**
 * Creates (or refreshes) the SumSub verification journey for a UKYC session,
 * returning the applicant access token used to launch the SDK.
 *
 * @param sessionId - The UKYC session id from `createUkycSession`.
 * @returns The applicant access token and status.
 */
export type KycServiceCreateJourneyAction = {
  type: `KycService:createJourney`;
  handler: KycService['createJourney'];
};

/**
 * Fetches the current status of a UKYC session. Polled after the SumSub SDK
 * completes to determine the final verification decision.
 *
 * @param params - The parameters.
 * @param params.sessionId - The UKYC session id.
 * @returns The session status.
 */
export type KycServiceGetSessionStatusAction = {
  type: `KycService:getSessionStatus`;
  handler: KycService['getSessionStatus'];
};

/**
 * Union of all KycService action types.
 */
export type KycServiceMethodActions =
  | KycServiceGetGeoCountryAction
  | KycServiceFetchDisclaimersAction
  | KycServiceCreateSessionAction
  | KycServiceCheckKycRequiredAction
  | KycServiceCreateVendorCustomerAction
  | KycServiceSubmitConsentsAction
  | KycServiceFetchKycStatusAction
  | KycServiceGetWrappingKeyAction
  | KycServiceFetchJwksAction
  | KycServiceCreateUkycSessionAction
  | KycServiceCreateJourneyAction
  | KycServiceGetSessionStatusAction;
