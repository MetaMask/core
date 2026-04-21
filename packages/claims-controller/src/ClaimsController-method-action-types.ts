/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ClaimsController } from './ClaimsController';

/**
 * Fetch the required configurations for the claims service.
 *
 * @returns The required configurations for the claims service.
 */
export type ClaimsControllerFetchClaimsConfigurationsAction = {
  type: `ClaimsController:fetchClaimsConfigurations`;
  handler: ClaimsController['fetchClaimsConfigurations'];
};

/**
 * Get required config for submitting a claim.
 *
 * @param claim - The claim request to get the required config for.
 * @returns The required config for submitting the claim.
 */
export type ClaimsControllerGetSubmitClaimConfigAction = {
  type: `ClaimsController:getSubmitClaimConfig`;
  handler: ClaimsController['getSubmitClaimConfig'];
};

/**
 * Generate a signature for a claim.
 *
 * @param chainId - The chain id of the claim.
 * @param walletAddress - The impacted wallet address of the claim.
 * @returns The signature for the claim.
 */
export type ClaimsControllerGenerateClaimSignatureAction = {
  type: `ClaimsController:generateClaimSignature`;
  handler: ClaimsController['generateClaimSignature'];
};

/**
 * Get the list of claims for the current user.
 *
 * @returns The list of claims for the current user.
 */
export type ClaimsControllerGetClaimsAction = {
  type: `ClaimsController:getClaims`;
  handler: ClaimsController['getClaims'];
};

/**
 * Save a claim draft to the state.
 * If the draft name is not provided, a default name will be generated.
 * If the draft with the same id already exists, it will be updated.
 *
 * @param draft - The draft to save.
 * @returns The saved draft.
 */
export type ClaimsControllerSaveOrUpdateClaimDraftAction = {
  type: `ClaimsController:saveOrUpdateClaimDraft`;
  handler: ClaimsController['saveOrUpdateClaimDraft'];
};

/**
 * Get the list of claim drafts.
 *
 * @returns The list of claim drafts.
 */
export type ClaimsControllerGetClaimDraftsAction = {
  type: `ClaimsController:getClaimDrafts`;
  handler: ClaimsController['getClaimDrafts'];
};

/**
 * Delete a claim draft from the state.
 *
 * @param draftId - The ID of the draft to delete.
 */
export type ClaimsControllerDeleteClaimDraftAction = {
  type: `ClaimsController:deleteClaimDraft`;
  handler: ClaimsController['deleteClaimDraft'];
};

/**
 * Delete all claim drafts from the state.
 */
export type ClaimsControllerDeleteAllClaimDraftsAction = {
  type: `ClaimsController:deleteAllClaimDrafts`;
  handler: ClaimsController['deleteAllClaimDrafts'];
};

/**
 * Clears the claims state and resets to default values.
 */
export type ClaimsControllerClearStateAction = {
  type: `ClaimsController:clearState`;
  handler: ClaimsController['clearState'];
};

/**
 * Union of all ClaimsController action types.
 */
export type ClaimsControllerMethodActions =
  | ClaimsControllerFetchClaimsConfigurationsAction
  | ClaimsControllerGetSubmitClaimConfigAction
  | ClaimsControllerGenerateClaimSignatureAction
  | ClaimsControllerGetClaimsAction
  | ClaimsControllerSaveOrUpdateClaimDraftAction
  | ClaimsControllerGetClaimDraftsAction
  | ClaimsControllerDeleteClaimDraftAction
  | ClaimsControllerDeleteAllClaimDraftsAction
  | ClaimsControllerClearStateAction;
