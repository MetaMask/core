/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KycController } from './KycController';

/**
 * Resolves persisted terms + geolocation, and auto-creates a session when
 * terms are already accepted and an email is available.
 *
 * @param params - Optional parameters.
 * @param params.email - The account email to associate with the session.
 */
export type KycControllerInitializeAction = {
  type: `KycController:initialize`;
  handler: KycController['initialize'];
};

/**
 * Loads the disclaimers for the resolved (or provided) country.
 *
 * @param params - Optional parameters.
 * @param params.country - ISO 3166-1 alpha-3 country code override.
 */
export type KycControllerLoadDisclaimersAction = {
  type: `KycController:loadDisclaimers`;
  handler: KycController['loadDisclaimers'];
};

/**
 * Captures terms acceptance for the currently loaded disclaimers and creates
 * a session.
 *
 * @param params - Optional parameters.
 * @param params.email - The account email to associate with the session.
 */
export type KycControllerAcceptTermsAndStartSessionAction = {
  type: `KycController:acceptTermsAndStartSession`;
  handler: KycController['acceptTermsAndStartSession'];
};

/**
 * Clears the persisted terms acceptance.
 */
export type KycControllerClearSavedTermsAction = {
  type: `KycController:clearSavedTerms`;
  handler: KycController['clearSavedTerms'];
};

/**
 * Handles a message posted by a Check/Auth frame and advances the flow.
 *
 * The transport-agnostic caller (WebView on mobile, iframe on web) forwards
 * the raw message and injects the returned `reply` back into the frame.
 *
 * @param params - The parameters.
 * @param params.message - The raw message posted by the frame.
 * @returns An object whose optional `reply` should be posted back.
 */
export type KycControllerHandleFrameMessageAction = {
  type: `KycController:handleFrameMessage`;
  handler: KycController['handleFrameMessage'];
};

/**
 * Builds the Check-frame URL, or `null` when no session exists yet.
 *
 * @returns The Check-frame URL or `null`.
 */
export type KycControllerBuildCheckFrameUrlAction = {
  type: `KycController:buildCheckFrameUrl`;
  handler: KycController['buildCheckFrameUrl'];
};

/**
 * Builds the Auth-frame URL, or `null` when no client token is available.
 *
 * @returns The Auth-frame URL or `null`.
 */
export type KycControllerBuildAuthFrameUrlAction = {
  type: `KycController:buildAuthFrameUrl`;
  handler: KycController['buildAuthFrameUrl'];
};

/**
 * Builds the Reset-frame URL.
 *
 * @returns The Reset-frame URL.
 */
export type KycControllerBuildResetFrameUrlAction = {
  type: `KycController:buildResetFrameUrl`;
  handler: KycController['buildResetFrameUrl'];
};

/**
 * Checks whether KYC is required for a product and caches the result.
 *
 * @param params - The parameters.
 * @param params.product - The consuming feature.
 * @param params.country - Optional alpha-3 country override.
 * @returns Whether KYC is required.
 */
export type KycControllerCheckKycRequiredAction = {
  type: `KycController:checkKycRequired`;
  handler: KycController['checkKycRequired'];
};

/**
 * Reads the cached "is KYC required" result for a product.
 *
 * @param params - The parameters.
 * @param params.product - The consuming feature.
 * @returns The cached value, or `undefined` if not yet checked.
 */
export type KycControllerGetKycStatusAction = {
  type: `KycController:getKycStatus`;
  handler: KycController['getKycStatus'];
};

/**
 * Runs the SumSub document-verification sub-flow: creates a UKYC session,
 * exchanges the wrapped key for an applicant access token, and presents the
 * SDK via the injected launcher.
 *
 * @param params - Optional parameters.
 * @param params.locale - BCP-47 locale for the SDK UI.
 * @param params.debug - Enables SDK debug logging.
 * @returns The SDK result.
 */
export type KycControllerStartSumSubAction = {
  type: `KycController:startSumSub`;
  handler: KycController['startSumSub'];
};

/**
 * Resets the flow to idle, clearing session tokens and sub-flow state while
 * preserving persisted terms acceptance and the per-product cache.
 */
export type KycControllerResetAction = {
  type: `KycController:reset`;
  handler: KycController['reset'];
};

/**
 * Union of all KycController action types.
 */
export type KycControllerMethodActions =
  | KycControllerInitializeAction
  | KycControllerLoadDisclaimersAction
  | KycControllerAcceptTermsAndStartSessionAction
  | KycControllerClearSavedTermsAction
  | KycControllerHandleFrameMessageAction
  | KycControllerBuildCheckFrameUrlAction
  | KycControllerBuildAuthFrameUrlAction
  | KycControllerBuildResetFrameUrlAction
  | KycControllerCheckKycRequiredAction
  | KycControllerGetKycStatusAction
  | KycControllerStartSumSubAction
  | KycControllerResetAction;
