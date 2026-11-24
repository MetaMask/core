/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { VendorOnboardingController } from './VendorOnboardingController.js';

/**
 * Asks kyc-api for the vendor's current step and saves it. Call it when a
 * screen opens: the answer replaces whatever was saved. Calls that overlap
 * share one request.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @returns The step.
 */
export type VendorOnboardingControllerRefreshStepAction = {
  type: `VendorOnboardingController:refreshStep`;
  handler: VendorOnboardingController['refreshStep'];
};

/**
 * Records that the user finished MetaMask's MFA on this device, then reads
 * the step. Call it when MFA succeeds, before any session exists: kyc-api
 * cannot see MFA until the session is created, and without this it would
 * ask for MFA again.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @returns The next step.
 */
export type VendorOnboardingControllerRecordMfaCompletedAction = {
  type: `VendorOnboardingController:recordMfaCompleted`;
  handler: VendorOnboardingController['recordMfaCompleted'];
};

/**
 * Records the user's acceptance of the vendor's terms, then reads the step.
 *
 * Kalshi keeps the acceptance on the phone and sends it with every step
 * read. The idOS and identity provider consents wait on the phone until
 * the session exists, because kyc-api only takes consents on a session. If
 * a session already exists they are posted to it straight away.
 *
 * Other vendors send the acceptance to kyc-api right away.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.disclaimerIds - Accepted terms ids from the vendor catalog.
 * @param params.country - Iron only. ISO 3166-1 alpha-3 country the terms
 * were fetched for.
 * @param params.idOS - Kalshi only. Accepted idOS documents (`key` and
 * `version` from {@link KycService.fetchSessionDisclaimersByCountry}).
 * @param params.kycProvider - Kalshi only. Accepted identity provider
 * documents.
 * @param params.credentialReusabilityConsentGiven - Kalshi only. Whether the
 * user lets idOS reuse their existing credentials. The screen asks for it,
 * so it is an argument and never a default.
 * @returns The step the user is on once the terms are recorded.
 */
export type VendorOnboardingControllerSubmitTermsAction = {
  type: `VendorOnboardingController:submitTerms`;
  handler: VendorOnboardingController['submitTerms'];
};

/**
 * Opens the vendor's UKYC session, or picks up the one kyc-api already has,
 * then reads the next step. Call it from the step that asks for MFA
 * (`mfa`), with the token MFA returned.
 *
 * A new session creates the user's `local_user_secret` when it is missing,
 * then wraps the encryption key and a capability token for idOS. The
 * consents the user gave on the terms pages are posted to the new session,
 * then cleared from the phone. An existing session gets fresh
 * authorizations every time, because the step does not say whether its
 * capability authorization is still valid, and any consents still waiting
 * on the phone are posted to it. A Kalshi email given while resuming sends
 * a code to that address.
 *
 * The MFA flag is cleared once the session exists, because kyc-api reads
 * MFA from the session from then on.
 *
 * This does not create a vendor customer. A vendor that needs one before
 * its session (Iron) adds that when it moves to this controller.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.aal2Token - AAL2 token from MFA. Required only when a new
 * session has to be created. Omit it to pick up an existing session. Held
 * in memory by the caller and never saved here.
 * @param params.email - The Kalshi email the phone signs into `users/link`.
 * Required when creating a Kalshi session, and when resuming one to send a
 * code. kyc-api does not receive it: the relay is given the verified email
 * from the partner identity token, so this must be that address. Any other
 * is refused with `kalshi_signed_request_email_mismatch` before anything is
 * signed.
 * @param params.intentOpen - Whether the user already has an open Kalshi
 * enrollment intent. The phone then signs `users/link` alone, where a new
 * session signs `enrollment/intents` first.
 * @returns The step the user is on once the session exists.
 */
export type VendorOnboardingControllerStartSessionAction = {
  type: `VendorOnboardingController:startSession`;
  handler: VendorOnboardingController['startSession'];
};

/**
 * The verified MetaMask email the vendor's session is opened with: the
 * address a screen should start its email field with. Reads it from a
 * partner identity token minted for the vendor.
 *
 * It records no identity-sharing consent. Before the user has granted it,
 * MetaMask Auth refuses the token and this returns `undefined`.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @returns The email, or `undefined` when no token can be minted yet or it
 * carries no verified email.
 */
export type VendorOnboardingControllerGetPartnerEmailAction = {
  type: `VendorOnboardingController:getPartnerEmail`;
  handler: VendorOnboardingController['getPartnerEmail'];
};

/**
 * Fetches the idOS and identity provider (SumSub) documents the user
 * consents to once the vendor session exists, with which ones are already
 * consented. Nothing is saved on the phone.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @returns The documents and the reusability consent.
 */
export type VendorOnboardingControllerFetchSessionDisclaimersAction = {
  type: `VendorOnboardingController:fetchSessionDisclaimers`;
  handler: VendorOnboardingController['fetchSessionDisclaimers'];
};

/**
 * Records the user's idOS and identity provider consents with kyc-api right
 * away, then reads the next step. Nothing is kept on the phone.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.idOS - Accepted idOS documents (`key` and `version` from
 * {@link VendorOnboardingController.fetchSessionDisclaimers}).
 * @param params.kycProvider - Accepted identity provider documents.
 * @param params.credentialReusabilityConsentGiven - Whether the user lets
 * idOS reuse their existing credentials. The screen asks for it, so it is
 * an argument and never a default.
 * @returns The next step.
 */
export type VendorOnboardingControllerRecordSessionDisclaimersAction = {
  type: `VendorOnboardingController:recordSessionDisclaimers`;
  handler: VendorOnboardingController['recordSessionDisclaimers'];
};

/**
 * Presents the identity provider flow (SumSub) for the vendor's session.
 * When the user finishes it, the next step is read: kyc-api works out from
 * the relay whether idOS still needs anything. Nothing about the flow is
 * kept on
 * the phone.
 *
 * The session must already have its authorizations (see
 * {@link VendorOnboardingController.startSession}) and its consents (see
 * {@link VendorOnboardingController.recordSessionDisclaimers}).
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.locale - BCP-47 locale for the SDK UI.
 * @param params.debug - Enables SDK debug logging.
 * @returns How the flow ended.
 */
export type VendorOnboardingControllerLaunchProviderFlowAction = {
  type: `VendorOnboardingController:launchProviderFlow`;
  handler: VendorOnboardingController['launchProviderFlow'];
};

/**
 * Sends the vendor's SMS code to the phone number.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.phoneNumber - The phone number in E.164 format.
 * @returns The next step.
 */
export type VendorOnboardingControllerSendPhoneOtpAction = {
  type: `VendorOnboardingController:sendPhoneOtp`;
  handler: VendorOnboardingController['sendPhoneOtp'];
};

/**
 * Verifies the vendor's SMS code.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.code - The code from the user.
 * @returns The next step.
 */
export type VendorOnboardingControllerVerifyPhoneOtpAction = {
  type: `VendorOnboardingController:verifyPhoneOtp`;
  handler: VendorOnboardingController['verifyPhoneOtp'];
};

/**
 * Verifies the vendor's email code.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.code - The code from the user.
 * @returns The next step.
 */
export type VendorOnboardingControllerVerifyEmailOtpAction = {
  type: `VendorOnboardingController:verifyEmailOtp`;
  handler: VendorOnboardingController['verifyEmailOtp'];
};

/**
 * Sends the vendor's email code again.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor.
 * @param params.email - The Kalshi email to sign into the new `users/link`.
 * Required for Kalshi, including when the user corrects the address.
 * @returns The next step.
 */
export type VendorOnboardingControllerSendEmailOtpAction = {
  type: `VendorOnboardingController:sendEmailOtp`;
  handler: VendorOnboardingController['sendEmailOtp'];
};

/**
 * Forgets what the phone saved, for one vendor or all of them. kyc-api
 * keeps the session and what it holds, so the next refresh brings that
 * step back. What only the phone knew is gone: MFA done before a session,
 * the accepted terms, and any consents still waiting for a session.
 *
 * @param params - The parameters.
 * @param params.vendor - The vendor to forget. Omit to forget all.
 */
export type VendorOnboardingControllerResetAction = {
  type: `VendorOnboardingController:reset`;
  handler: VendorOnboardingController['reset'];
};

/**
 * Union of all VendorOnboardingController action types.
 */
export type VendorOnboardingControllerMethodActions =
  | VendorOnboardingControllerRefreshStepAction
  | VendorOnboardingControllerRecordMfaCompletedAction
  | VendorOnboardingControllerSubmitTermsAction
  | VendorOnboardingControllerStartSessionAction
  | VendorOnboardingControllerGetPartnerEmailAction
  | VendorOnboardingControllerFetchSessionDisclaimersAction
  | VendorOnboardingControllerRecordSessionDisclaimersAction
  | VendorOnboardingControllerLaunchProviderFlowAction
  | VendorOnboardingControllerSendPhoneOtpAction
  | VendorOnboardingControllerVerifyPhoneOtpAction
  | VendorOnboardingControllerVerifyEmailOtpAction
  | VendorOnboardingControllerSendEmailOtpAction
  | VendorOnboardingControllerResetAction;
