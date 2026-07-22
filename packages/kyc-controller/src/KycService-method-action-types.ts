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
 * Creates a UKYC session for the SumSub document-verification sub-flow.
 *
 * @param params - The session parameters.
 * @returns The UKYC session identifiers and wrapped key.
 */
export type KycServiceCreateUkycSessionAction = {
  type: `KycService:createUkycSession`;
  handler: KycService['createUkycSession'];
};

/**
 * Exchanges the wrapped user key for a SumSub applicant access token.
 *
 * @param params - The exchange parameters.
 * @returns The applicant access token and status.
 */
export type KycServiceSubmitWrappedKeyAction = {
  type: `KycService:submitWrappedKey`;
  handler: KycService['submitWrappedKey'];
};

/**
 * Union of all KycService action types.
 */
export type KycServiceMethodActions =
  | KycServiceGetGeoCountryAction
  | KycServiceFetchDisclaimersAction
  | KycServiceCreateSessionAction
  | KycServiceCheckKycRequiredAction
  | KycServiceCreateUkycSessionAction
  | KycServiceSubmitWrappedKeyAction;
