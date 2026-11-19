/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ClaimsService } from './ClaimsService.js';

/**
 * Fetch required configurations for the claims service.
 *
 * @returns The required configurations for the claims service.
 */
export type ClaimsServiceFetchClaimsConfigurationsAction = {
  type: `ClaimsService:fetchClaimsConfigurations`;
  handler: ClaimsService['fetchClaimsConfigurations'];
};

/**
 * Get the claims for the current user.
 *
 * @returns The claims for the current user.
 */
export type ClaimsServiceGetClaimsAction = {
  type: `ClaimsService:getClaims`;
  handler: ClaimsService['getClaims'];
};

/**
 * Get the claim by id.
 *
 * @param id - The id of the claim to get.
 * @returns The claim by id.
 */
export type ClaimsServiceGetClaimByIdAction = {
  type: `ClaimsService:getClaimById`;
  handler: ClaimsService['getClaimById'];
};

/**
 * Generate a message to be signed by the user for the claim request.
 *
 * @param chainId - The chain id of the claim.
 * @param walletAddress - The impacted wallet address of the claim.
 * @returns The message for the claim signature.
 */
export type ClaimsServiceGenerateMessageForClaimSignatureAction = {
  type: `ClaimsService:generateMessageForClaimSignature`;
  handler: ClaimsService['generateMessageForClaimSignature'];
};

/**
 * Create the headers for the current request.
 *
 * @returns The headers for the current request.
 */
export type ClaimsServiceGetRequestHeadersAction = {
  type: `ClaimsService:getRequestHeaders`;
  handler: ClaimsService['getRequestHeaders'];
};

/**
 * Get the URL for the claims API for the current environment.
 *
 * @returns The URL for the claims API for the current environment.
 */
export type ClaimsServiceGetClaimsApiUrlAction = {
  type: `ClaimsService:getClaimsApiUrl`;
  handler: ClaimsService['getClaimsApiUrl'];
};

/**
 * Union of all ClaimsService action types.
 */
export type ClaimsServiceMethodActions =
  | ClaimsServiceFetchClaimsConfigurationsAction
  | ClaimsServiceGetClaimsAction
  | ClaimsServiceGetClaimByIdAction
  | ClaimsServiceGenerateMessageForClaimSignatureAction
  | ClaimsServiceGetRequestHeadersAction
  | ClaimsServiceGetClaimsApiUrlAction;
