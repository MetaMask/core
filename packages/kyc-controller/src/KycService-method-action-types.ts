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
 * Fetches the Fractal encryption service JWKS used to verify the `jwtChain`s
 * returned inside encryption schemas from {@link KycService.createUkycSession}.
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
 * Creates a UKYC session for the SumSub document-verification sub-flow.
 *
 * The response carries per-secret encryption schemas (`encryptionDataKey` and
 * `ukycCapabilityToken`) so the client can wrap the `data_encryption_key` and
 * the read-only `ukyc_capability_token` and submit them via
 * {@link KycService.setAuthorizations}.
 *
 * @param params - The session parameters.
 * @returns The UKYC session id and encryption schemas.
 */
export type KycServiceCreateUkycSessionAction = {
  type: `KycService:createUkycSession`;
  handler: KycService['createUkycSession'];
};

/**
 * Submits the wrapped `data_encryption_key` and wrapped
 * `ukyc_capability_token` for a UKYC session. Both secrets are sealed with
 * `wrapEncryptionKey` against the encryption schemas returned by
 * {@link KycService.createUkycSession}.
 *
 * @param params - The wrapped authorizations.
 * @returns The session status after the authorizations are applied.
 */
export type KycServiceSetAuthorizationsAction = {
  type: `KycService:setAuthorizations`;
  handler: KycService['setAuthorizations'];
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
  | KycServiceFetchJwksAction
  | KycServiceCreateUkycSessionAction
  | KycServiceSetAuthorizationsAction
  | KycServiceCreateJourneyAction
  | KycServiceGetSessionStatusAction;
