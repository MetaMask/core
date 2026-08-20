/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KycController } from './KycController.js';

/**
 * Resolves persisted terms + geolocation, and auto-creates a session when
 * terms are already accepted and an email is available.
 *
 * @param params - Optional parameters.
 * @param params.email - The account email to associate with the session.
 * @param params.product - The consuming feature the flow runs for. When
 * provided, the controller automatically runs the KYC-required check once
 * authentication completes (and chains into document verification when KYC
 * is required). When omitted, the flow stops at `form` and the consumer must
 * call `checkKycRequired` manually.
 * @param params.vendor - Identity vendor for this flow. Non-MoonPay vendors
 * skip Check/Auth frames and use the consents path. Defaults to `moonpay`.
 */
export type KycControllerInitializeAction = {
  type: `KycController:initialize`;
  handler: KycController['initialize'];
};

/**
 * Creates (or resumes) an empty-shell customer for the given identity
 * vendor. Exposed so a consumer can ensure the customer exists before
 * showing T&C screens independently of {@link initialize}.
 *
 * @param params - The parameters.
 * @param params.vendor - Identity vendor for the customer.
 * @param params.email - Email for the vendor customer.
 */
export type KycControllerCreateVendorCustomerAction = {
  type: `KycController:createVendorCustomer`;
  handler: KycController['createVendorCustomer'];
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
 * @param params.product - The consuming feature the flow runs for. See
 * {@link initialize} for how the product drives the automatic post
 * authentication continuation.
 * @param params.sumsubTncSigned - Consents-path vendors: whether Sumsub
 * T&C were accepted (T&C2). Required on the consents path; ignored for
 * MoonPay.
 * @param params.idosTncSigned - Consents-path vendors: whether idOS T&C
 * were accepted (T&C2). Required on the consents path; ignored for
 * MoonPay.
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
 * Returns the vendor-scoped identity for the currently authenticated
 * customer, or `null` when the flow has not yet captured a vendor customer
 * id (before authentication or after {@link reset}).
 *
 * Exposed so consumers (e.g. ramps autoramp creation) can attach the vendor
 * customer id to downstream calls without reading the full KYC state, which
 * also holds session/access tokens. The id is session-scoped and never
 * persisted.
 *
 * @returns The current {@link KycCustomerIdentity}, or `null`.
 */
export type KycControllerGetCustomerIdentityAction = {
  type: `KycController:getCustomerIdentity`;
  handler: KycController['getCustomerIdentity'];
};

/**
 * Runs the SumSub document-verification sub-flow end to end:
 *
 * 1. requests a per-session wrapping key from the UKYC backend;
 * 2. verifies its `jwtChain` against the Fractal JWKS and confirms the
 * attested session server public key;
 * 3. derives the `data_encryption_key` from the wallet's UKYC
 * `local_user_secret` and wraps it for the session server;
 * 4. mints a client-signed, read-only `ukyc_capability_token` and creates
 * the UKYC session (handing over the wrapped key and the token);
 * 5. fetches the SumSub applicant access token; and
 * 6. presents the SDK via the injected launcher.
 *
 * If session creation reports the applicant is already approved on the relay
 * while the vendor is still finalizing (`kycStatus: approved`,
 * `finalStatus: pending`), the sub-flow stops at step 4 with a
 * `vendorProcessing` status and a message rather than launching the SDK.
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
 * Refreshes the user-keyed simplified KYC status from `GET /kyc/status`,
 * stores it on state, publishes {@link KycControllerStatusChangedEvent}, and
 * schedules short-interval polling while the status is `pending`.
 *
 * @returns The latest status payload.
 */
export type KycControllerRefreshKycStatusAction = {
  type: `KycController:refreshKycStatus`;
  handler: KycController['refreshKycStatus'];
};

/**
 * Fetches the current UKYC session status for the active sub-flow and records
 * it on state. Useful for a one-off refresh outside the automatic polling
 * loop that {@link startSumSub} runs.
 *
 * @returns The fetched session status.
 * @throws If there is no active SumSub session to query.
 */
export type KycControllerGetSessionStatusAction = {
  type: `KycController:getSessionStatus`;
  handler: KycController['getSessionStatus'];
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
  | KycControllerCreateVendorCustomerAction
  | KycControllerLoadDisclaimersAction
  | KycControllerAcceptTermsAndStartSessionAction
  | KycControllerClearSavedTermsAction
  | KycControllerHandleFrameMessageAction
  | KycControllerBuildCheckFrameUrlAction
  | KycControllerBuildAuthFrameUrlAction
  | KycControllerBuildResetFrameUrlAction
  | KycControllerCheckKycRequiredAction
  | KycControllerGetKycStatusAction
  | KycControllerGetCustomerIdentityAction
  | KycControllerStartSumSubAction
  | KycControllerRefreshKycStatusAction
  | KycControllerGetSessionStatusAction
  | KycControllerResetAction;
