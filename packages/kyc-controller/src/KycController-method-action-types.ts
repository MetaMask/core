/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KycController } from './KycController.js';

/**
 * Creates the UKYC `local_user_secret` and stores it in Encrypted User
 * Storage when one does not already exist.
 *
 * Call this after the user has expressed intent to onboard and before
 * {@link startSession}. Persisting the secret here moves generation and the
 * storage write off the `startSession` path. `startSession` still reads the
 * secret, and still creates it when this has not been called.
 *
 * Await this call, or attach a rejection handler. A failure does not block
 * onboarding: {@link startSession} creates the secret if it is still missing.
 *
 * The operation is idempotent and uses the same primary entropy source as
 * session creation. The plaintext secret is not returned and is not sent to
 * idOS. Only the encrypted User Storage copy is synced.
 *
 * @throws When Encrypted User Storage cannot be read or written, or when a
 * stored secret has an unexpected length.
 */
export type KycControllerEnsureLocalUserSecretAction = {
  type: `KycController:ensureLocalUserSecret`;
  handler: KycController['ensureLocalUserSecret'];
};

/**
 * Starts a KYC session for the given vendor. Reuses a latest vendor session
 * when one exists; otherwise creates a UKYC session. Sessions for other
 * vendors are left untouched.
 *
 * Creating a vendor customer and UKYC session requires a partner identity
 * token carrying a verified email; both requests send it as
 * `partnerIdentityToken`. Resuming an existing session does not.
 *
 * Session creation derives client material from the UKYC
 * `local_user_secret`. Call {@link ensureLocalUserSecret} after the user
 * has expressed intent to onboard so that secret is generated and stored
 * before this method runs.
 *
 * @param params - The session parameters.
 * @param params.vendor - Identity vendor for the session.
 * @param params.aal2Token - AAL2 authentication token. Required only when a
 * UKYC session must be created, where it is sent as the Authorization bearer
 * value. Omit it when reusing an existing session.
 * @returns The current or newly created session status.
 */
export type KycControllerStartSessionAction = {
  type: `KycController:startSession`;
  handler: KycController['startSession'];
};

/**
 * Stops session-status polling and restores default controller state.
 */
export type KycControllerResetAction = {
  type: `KycController:reset`;
  handler: KycController['reset'];
};

/**
 * Stops every vendor's session-status polling and removes every session
 * entry.
 */
export type KycControllerClearStateAction = {
  type: `KycController:clearState`;
  handler: KycController['clearState'];
};

/**
 * Fetches the latest UKYC session status for a vendor.
 *
 * @param vendor - Identity vendor whose latest session should be queried.
 * @returns The session status, or `null` when none exists.
 */
export type KycControllerGetSessionStatusForVendorAction = {
  type: `KycController:getSessionStatusForVendor`;
  handler: KycController['getSessionStatusForVendor'];
};

/**
 * Fetches the vendors this customer's verified identity data has been shared
 * with, newest first.
 *
 * The external user id is the same for every vendor, so it is read from any
 * stored session. When none is stored, the latest session for each vendor
 * with an entry is fetched (without writing it to state). An unresolvable
 * session yields an empty list rather than an error, so consumers can render
 * an empty "shared with" list.
 *
 * @returns The data shares, newest first; empty when no session can be
 * resolved.
 */
export type KycControllerGetDataSharesAction = {
  type: `KycController:getDataShares`;
  handler: KycController['getDataShares'];
};

/**
 * Returns the durable outcome of a vendor's identity-provider flow.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns The latest provider-flow status, or `not_started` when the vendor
 * has no entry.
 */
export type KycControllerGetProviderFlowStatusAction = {
  type: `KycController:getProviderFlowStatus`;
  handler: KycController['getProviderFlowStatus'];
};

/**
 * Returns the vendor's session already stored on state.
 *
 * Starts that vendor's session-status polling when `finalStatus` is not
 * `approved`, `rejected`, or `retry`. Does not fetch status or refresh
 * capability authorization.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns The session status stored at call time.
 * @throws If the vendor has no session on state.
 */
export type KycControllerRefreshSessionStatusAction = {
  type: `KycController:refreshSessionStatus`;
  handler: KycController['refreshSessionStatus'];
};

/**
 * Returns the vendor's persisted session status.
 *
 * Does not call the network and does not start session-status polling.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns The vendor's session on state, or `null` when none is stored.
 */
export type KycControllerReadSessionStatusAction = {
  type: `KycController:readSessionStatus`;
  handler: KycController['readSessionStatus'];
};

/**
 * Fetches `GET /sessions/{id}/status` once for the vendor's stored session
 * and writes the result onto that vendor's entry.
 *
 * Does not start the session-status polling timer.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns The fetched session status.
 * @throws If the vendor has no session on state.
 */
export type KycControllerFetchSessionStatusOnceAction = {
  type: `KycController:fetchSessionStatusOnce`;
  handler: KycController['fetchSessionStatusOnce'];
};

/**
 * Starts polling `GET /sessions/{id}/status` for the vendor's stored
 * session. Each vendor has its own loop. Each tick writes the result onto
 * that vendor's entry only when the payload changed. The first poll runs
 * immediately. Each later wait starts at 10 seconds and grows by 10 seconds
 * after every poll, including a failed one. Starting the loop again resets
 * that delay. The loop stops once `finalStatus` is `approved`, `rejected`,
 * or `retry`, or when {@link reset} / {@link clearState} runs.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @throws If the vendor has no session id to poll.
 */
export type KycControllerStartSessionStatusPollingAction = {
  type: `KycController:startSessionStatusPolling`;
  handler: KycController['startSessionStatusPolling'];
};

/**
 * Fetches the idOS + KYC-provider disclaimer catalog. Pass exactly one of
 * `vendor` or `country`:
 *
 * - `{ vendor }` → {@link KycService.fetchSessionDisclaimersBySessionId}
 * for that vendor's session (`GET /sessions/{sessionId}/disclaimers`)
 * - `{ country }` → {@link KycService.fetchSessionDisclaimersByCountry}
 * (`GET /disclaimers?country=`)
 *
 * @param params - The parameters. Provide exactly one of `vendor` or
 * `country`.
 * @param params.vendor - Identity vendor whose session catalog to fetch.
 * @param params.country - ISO 3166-1 alpha-3 country code.
 * @returns The catalog. Session fetches include consent state; country
 * fetches do not.
 */
export type KycControllerFetchSessionDisclaimersAction = {
  type: `KycController:fetchSessionDisclaimers`;
  handler: KycController['fetchSessionDisclaimers'];
};

/**
 * Fetches the vendor's session-scoped disclaimer catalog and records
 * consents derived from the T&C2 flags. Already-consented catalog rows are
 * omitted from the POST. A 409 is re-checked with a GET: continue only when
 * every accepted document is now consented, otherwise fail closed.
 *
 * @param params - Accepted session-disclaimer records.
 * @param params.vendor - The identity vendor.
 * @param params.providerDisclaimersAccepted - Accepted Sumsub disclaimer records.
 * @param params.idosDisclaimersAccepted - Accepted idOS disclaimer records.
 * @param params.credentialReusabilityConsentGiven - Whether credential
 * reuse was accepted.
 */
export type KycControllerRecordSessionDisclaimersAction = {
  type: `KycController:recordSessionDisclaimers`;
  handler: KycController['recordSessionDisclaimers'];
};

/**
 * Fetches the vendor's current session status and reports whether consent
 * was given.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns Whether `consentStatus` is `given`.
 * @throws If the vendor has no session on state.
 */
export type KycControllerHasCompletedSessionDisclaimersAction = {
  type: `KycController:hasCompletedSessionDisclaimers`;
  handler: KycController['hasCompletedSessionDisclaimers'];
};

/**
 * Fetches the vendor T&Cs the customer must accept before a session is
 * created (`GET /vendors/{vendor}/disclaimers?country=`).
 *
 * @param params - The parameters.
 * @param params.vendor - Identity vendor.
 * @param params.country - ISO 3166-1 alpha-3 country code.
 * @returns The disclaimers.
 */
export type KycControllerFetchVendorDisclaimersAction = {
  type: `KycController:fetchVendorDisclaimers`;
  handler: KycController['fetchVendorDisclaimers'];
};

/**
 * Stores the customer's acceptance of a vendor's T&Cs on the device, before
 * the vendor has it. Makes no network call, so it works before a session
 * exists; {@link recordVendorDisclaimers} submits it once one does. Creates
 * the vendor's entry when it has none.
 *
 * Accepting again replaces earlier acceptance and marks it not submitted.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @param params.country - ISO 3166-1 alpha-3 country the terms were fetched
 * for. Recorded as the entry's residence country until a session exists.
 * @param params.disclaimerIds - Accepted vendor T&C ids.
 */
export type KycControllerAcceptVendorDisclaimersAction = {
  type: `KycController:acceptVendorDisclaimers`;
  handler: KycController['acceptVendorDisclaimers'];
};

/**
 * Submits the vendor T&C acceptance stored by
 * {@link acceptVendorDisclaimers} via
 * {@link KycService.submitVendorDisclaimers}, then marks it submitted.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns The vendor signing records.
 * @throws If the vendor has no stored acceptance, or no session yet (the
 * vendor records terms against a customer that session creation creates).
 */
export type KycControllerRecordVendorDisclaimersAction = {
  type: `KycController:recordVendorDisclaimers`;
  handler: KycController['recordVendorDisclaimers'];
};

/**
 * Fetches the vendor's current T&C catalog for the entry's residence country
 * and returns whether submitted acceptance covers every document.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns Whether submitted acceptance covers the fetched catalog.
 * @throws If the vendor has no entry or no residence country.
 */
export type KycControllerHasCompletedVendorDisclaimersAction = {
  type: `KycController:hasCompletedVendorDisclaimers`;
  handler: KycController['hasCompletedVendorDisclaimers'];
};

/**
 * Verifies the code a vendor emailed during onboarding.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @param params.otp - The code the vendor sent.
 * @returns The session status after the step.
 */
export type KycControllerVerifyVendorEmailOtpAction = {
  type: `KycController:verifyVendorEmailOtp`;
  handler: KycController['verifyVendorEmailOtp'];
};

/**
 * Asks the vendor to email a new onboarding code.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns The session status after the step.
 */
export type KycControllerResendVendorEmailOtpAction = {
  type: `KycController:resendVendorEmailOtp`;
  handler: KycController['resendVendorEmailOtp'];
};

/**
 * Asks the vendor to text an onboarding code to a phone number.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @param params.phoneNumber - Phone number in E.164 format.
 * @returns The session status after the step.
 */
export type KycControllerSendVendorPhoneOtpAction = {
  type: `KycController:sendVendorPhoneOtp`;
  handler: KycController['sendVendorPhoneOtp'];
};

/**
 * Verifies the code a vendor texted during onboarding.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @param params.otp - The code the vendor sent.
 * @returns The session status after the step.
 */
export type KycControllerVerifyVendorPhoneOtpAction = {
  type: `KycController:verifyVendorPhoneOtp`;
  handler: KycController['verifyVendorPhoneOtp'];
};

/**
 * Returns one verdict for the vendor's KYC session. See
 * {@link KycSessionDecision}.
 *
 * @param params - The parameters.
 * @param params.vendor - The identity vendor.
 * @returns The session decision; `none` when the vendor has no session.
 */
export type KycControllerGetSessionDecisionAction = {
  type: `KycController:getSessionDecision`;
  handler: KycController['getSessionDecision'];
};

/**
 * Deletes the caller's encrypted KYC blobs from MetaMask servers.
 *
 * Mints a fresh X25519 keypair, fetches a wrapping key from
 * `POST /deletions`, seals a `delete`-scoped `ukyc_capability_token` (4 hour
 * lifetime, client-presented) for that key, and submits it to
 * `DELETE /deletions/{deletionId}`. Both KYC API calls are authenticated
 * with `params.aal2Token`. Does not clear controller state.
 *
 * @param params - The deletion parameters.
 * @param params.aal2Token - AAL2 authentication token sent as the
 * Authorization bearer value for both deletion requests.
 */
export type KycControllerDeleteEncryptedStorageAction = {
  type: `KycController:deleteEncryptedStorage`;
  handler: KycController['deleteEncryptedStorage'];
};

/**
 * Presents the identity-provider verification UI for the vendor's session.
 * Currently launches SumSub.
 *
 * Only one flow is presented at a time. A launch while another flow is on
 * screen returns `failed` without writing state.
 *
 * @param params - The vendor and optional SDK presentation options.
 * @param params.vendor - The identity vendor.
 * @param params.locale - BCP-47 locale for the SDK UI.
 * @param params.debug - Enables SDK debug logging.
 * @returns The durable provider-flow outcome.
 */
export type KycControllerLaunchProviderFlowAction = {
  type: `KycController:launchProviderFlow`;
  handler: KycController['launchProviderFlow'];
};

/**
 * Union of all KycController action types.
 */
export type KycControllerMethodActions =
  | KycControllerEnsureLocalUserSecretAction
  | KycControllerStartSessionAction
  | KycControllerResetAction
  | KycControllerClearStateAction
  | KycControllerGetSessionStatusForVendorAction
  | KycControllerGetDataSharesAction
  | KycControllerGetProviderFlowStatusAction
  | KycControllerRefreshSessionStatusAction
  | KycControllerReadSessionStatusAction
  | KycControllerFetchSessionStatusOnceAction
  | KycControllerStartSessionStatusPollingAction
  | KycControllerFetchSessionDisclaimersAction
  | KycControllerRecordSessionDisclaimersAction
  | KycControllerHasCompletedSessionDisclaimersAction
  | KycControllerFetchVendorDisclaimersAction
  | KycControllerAcceptVendorDisclaimersAction
  | KycControllerRecordVendorDisclaimersAction
  | KycControllerHasCompletedVendorDisclaimersAction
  | KycControllerVerifyVendorEmailOtpAction
  | KycControllerResendVendorEmailOtpAction
  | KycControllerSendVendorPhoneOtpAction
  | KycControllerVerifyVendorPhoneOtpAction
  | KycControllerGetSessionDecisionAction
  | KycControllerDeleteEncryptedStorageAction
  | KycControllerLaunchProviderFlowAction;
