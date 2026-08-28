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
 * Records vendor T&C acceptance (`POST /vendors/{vendor}/disclaimers`).
 * For Iron this creates content signings from the disclaimer ids the
 * customer accepted. Session-scoped idOS / KYC-provider consents are
 * recorded separately via {@link submitSessionDisclaimers}. Retries re-POST
 * the same ids, matching the legacy `POST /consents` signing step.
 *
 * @param params - The parameters.
 * @param params.vendor - Identity vendor (e.g. `iron`).
 * @param params.disclaimerIds - Accepted vendor T&C ids.
 * @returns The vendor signing records.
 */
export type KycServiceSubmitVendorDisclaimersAction = {
  type: `KycService:submitVendorDisclaimers`;
  handler: KycService['submitVendorDisclaimers'];
};

/**
 * Fetches the session-scoped idOS + KYC-provider disclaimer catalog
 * (`GET /sessions/{sessionId}/disclaimers`). Requires an existing UKYC
 * session; vendor T&Cs continue to come from {@link fetchDisclaimers}.
 *
 * @param params - The parameters.
 * @param params.sessionId - The UKYC session id.
 * @returns The catalog, including which documents are already consented.
 */
export type KycServiceFetchSessionDisclaimersAction = {
  type: `KycService:fetchSessionDisclaimers`;
  handler: KycService['fetchSessionDisclaimers'];
};

/**
 * Records idOS + KYC-provider consents for a UKYC session
 * (`POST /sessions/{sessionId}/disclaimers`). `key`/`version` pairs must
 * match the current catalog from {@link fetchSessionDisclaimers}. A 409
 * means those document versions were already recorded for the session.
 *
 * @param params - The consent parameters.
 * @returns The updated catalog after recording.
 */
export type KycServiceSubmitSessionDisclaimersAction = {
  type: `KycService:submitSessionDisclaimers`;
  handler: KycService['submitSessionDisclaimers'];
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
 * Fetches the Fractal JWKS used to verify the
 * `encryptionDataKey` schema's `jwtChain` from
 * {@link KycService.createUkycSession}.
 *
 * This is an unauthenticated request to a well-known path on the Fractal encryption service
 * host, distinct from the UKYC base URL.
 *
 * @returns The JWKS keys.
 */
export type KycServiceFetchJwksAction = {
  type: `KycService:fetchJwks`;
  handler: KycService['fetchJwks'];
};

/**
 * Fetches the idOS relay JWKS used to verify the `ukycCapabilityToken`
 * schema's `jwtChain` from {@link KycService.createUkycSession}.
 *
 * This is an unauthenticated request to a well-known path on the idOS relay
 * host, distinct from both the UKYC base URL and the Fractal encryption service.
 *
 * @returns The JWKS keys.
 */
export type KycServiceFetchIdosRelayJwksAction = {
  type: `KycService:fetchIdosRelayJwks`;
  handler: KycService['fetchIdosRelayJwks'];
};

/**
 * Creates a UKYC session for the SumSub document-verification sub-flow.
 *
 * The client registers its per-session X25519 public key so the server can
 * later open boxes sealed with the matching private key, and supplies the
 * customer's ISO 3166-1 alpha-3 country of residence. The response
 * carries per-secret encryption schemas (`encryptionDataKey` and
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
  | KycServiceCreateVendorCustomerAction
  | KycServiceSubmitVendorDisclaimersAction
  | KycServiceFetchSessionDisclaimersAction
  | KycServiceSubmitSessionDisclaimersAction
  | KycServiceFetchKycStatusAction
  | KycServiceFetchJwksAction
  | KycServiceFetchIdosRelayJwksAction
  | KycServiceCreateUkycSessionAction
  | KycServiceSetAuthorizationsAction
  | KycServiceCreateJourneyAction
  | KycServiceGetSessionStatusAction;
