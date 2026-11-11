/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KycFlowController } from './KycFlowController.js';

/**
 * Asks kyc-api for the vendor's current step and saves it. Call it when a
 * screen opens: the answer replaces whatever was saved.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @returns The step.
 */
export type KycFlowControllerRefreshStepAction = {
  type: `KycFlowController:refreshStep`;
  handler: KycFlowController['refreshStep'];
};

/**
 * Records the user's acceptance of the vendor's terms with kyc-api right
 * away. Nothing is kept on the phone, so there is no draft that the server
 * does not know about.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.disclaimerIds - Accepted terms ids from the vendor catalog.
 * @param params.country - ISO 3166-1 alpha-3 country the terms were
 * fetched for.
 * @returns The next step.
 */
export type KycFlowControllerAcceptTermsAction = {
  type: `KycFlowController:acceptTerms`;
  handler: KycFlowController['acceptTerms'];
};

/**
 * Starts linking the user's account at the vendor (Kalshi), then reads the
 * next step.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.email - The email the vendor sends its code to.
 * @returns The next step.
 */
export type KycFlowControllerStartAccountLinkAction = {
  type: `KycFlowController:startAccountLink`;
  handler: KycFlowController['startAccountLink'];
};

/**
 * Verifies the code the vendor sent for the account link, then reads the
 * next step.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.code - The code from the user.
 * @returns The next step, and the MFA method the vendor wants, if any. The
 * MFA method is not kept: the screen asks for the code and calls this
 * again.
 */
export type KycFlowControllerVerifyAccountLinkAction = {
  type: `KycFlowController:verifyAccountLink`;
  handler: KycFlowController['verifyAccountLink'];
};

/**
 * Sends the vendor's SMS code to the phone number.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.phoneNumber - The phone number in E.164 format.
 * @returns The next step.
 */
export type KycFlowControllerSubmitPhoneAction = {
  type: `KycFlowController:submitPhone`;
  handler: KycFlowController['submitPhone'];
};

/**
 * Verifies the vendor's SMS code.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.code - The code from the user.
 * @returns The next step.
 */
export type KycFlowControllerSubmitPhoneCodeAction = {
  type: `KycFlowController:submitPhoneCode`;
  handler: KycFlowController['submitPhoneCode'];
};

/**
 * Verifies the vendor's email code.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.code - The code from the user.
 * @returns The next step.
 */
export type KycFlowControllerSubmitEmailCodeAction = {
  type: `KycFlowController:submitEmailCode`;
  handler: KycFlowController['submitEmailCode'];
};

/**
 * Sends the vendor's email code again.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @returns The next step.
 */
export type KycFlowControllerResendEmailCodeAction = {
  type: `KycFlowController:resendEmailCode`;
  handler: KycFlowController['resendEmailCode'];
};

/**
 * Tells kyc-api the user finished the identity provider flow (SumSub), so
 * the step survives a reinstall.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @returns The next step.
 */
export type KycFlowControllerMarkProviderSubmittedAction = {
  type: `KycFlowController:markProviderSubmitted`;
  handler: KycFlowController['markProviderSubmitted'];
};

/**
 * Forgets what the phone saved, for one vendor or all of them. kyc-api
 * keeps its own record, so the next refresh brings the step back.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor to forget. Omit to forget all.
 */
export type KycFlowControllerResetAction = {
  type: `KycFlowController:reset`;
  handler: KycFlowController['reset'];
};

/**
 * Union of all KycFlowController action types.
 */
export type KycFlowControllerMethodActions =
  | KycFlowControllerRefreshStepAction
  | KycFlowControllerAcceptTermsAction
  | KycFlowControllerStartAccountLinkAction
  | KycFlowControllerVerifyAccountLinkAction
  | KycFlowControllerSubmitPhoneAction
  | KycFlowControllerSubmitPhoneCodeAction
  | KycFlowControllerSubmitEmailCodeAction
  | KycFlowControllerResendEmailCodeAction
  | KycFlowControllerMarkProviderSubmittedAction
  | KycFlowControllerResetAction;
