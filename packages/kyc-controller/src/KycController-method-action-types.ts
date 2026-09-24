/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { KycController } from './KycController.js';

/**
 * Starts a KYC session for the given vendor and email. Reuses a latest
 * vendor session when one exists; otherwise creates a UKYC session.
 *
 * @param params - The session parameters.
 * @param params.vendor - Identity vendor for the session.
 * @param params.email - Fallback account email associated with the session if unable to resolve from partner identity token
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
 * Restores the controller to its default state.
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
 * Returns the current session status and starts polling when it is not yet
 * terminal.
 *
 * @returns The current session status.
 * @throws If there is no session on state.
 */
export type KycControllerRefreshSessionStatusAction = {
  type: `KycController:refreshSessionStatus`;
  handler: KycController['refreshSessionStatus'];
};

/**
 * Starts polling `GET /sessions/{id}/status` for
 * {@link KycControllerState.sessionStatus}'s current `id`. Each tick writes
 * the result onto state only when the payload changed. The loop stops once
 * `finalStatus` is `approved`, `rejected`, or `retry`, or when
 * {@link reset} / {@link clearState} runs.
 *
 * @throws If there is no current session id to poll.
 */
export type KycControllerStartSessionStatusPollingAction = {
  type: `KycController:startSessionStatusPolling`;
  handler: KycController['startSessionStatusPolling'];
};

/**
 * Fetches the idOS + KYC-provider disclaimer catalog. Pass exactly one of
 * `sessionId` or `country`:
 *
 * - `{ sessionId }` → {@link KycService.fetchSessionDisclaimersBySessionId}
 * (`GET /sessions/{sessionId}/disclaimers`)
 * - `{ country }` → {@link KycService.fetchSessionDisclaimersByCountry}
 * (`GET /disclaimers?country=`)
 *
 * A session-id fetch also writes the catalog to `sessionDisclaimers`.
 *
 * @param params - The parameters. Provide exactly one of `sessionId` or
 * `country`.
 * @param params.sessionId - The UKYC session id.
 * @param params.country - ISO 3166-1 alpha-3 country code.
 * @returns The catalog. Session fetches include consent state; country
 * fetches do not.
 */
export type KycControllerFetchSessionDisclaimersAction = {
  type: `KycController:fetchSessionDisclaimers`;
  handler: KycController['fetchSessionDisclaimers'];
};

/**
 * Fetches the session-scoped disclaimer catalog and records consents
 * derived from the T&C2 flags. Already-consented catalog rows are omitted
 * from the POST. A 409 is re-checked with a GET: continue only when every
 * accepted document is now consented, otherwise fail closed.
 *
 * @param params - Accepted session-disclaimer records.
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
 * Fetches session-scoped disclaimers and reports whether every document is
 * consented and credential reuse was accepted.
 *
 * @returns Whether session disclaimers are complete.
 * @throws If there is no session on state.
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
 * @param params.vendor - Identity vendor. Defaults to `moonpay`.
 * @param params.country - ISO 3166-1 alpha-3 country code.
 * @returns The disclaimers.
 */
export type KycControllerFetchVendorDisclaimersAction = {
  type: `KycController:fetchVendorDisclaimers`;
  handler: KycController['fetchVendorDisclaimers'];
};

/**
 * Records vendor T&C acceptance via {@link KycService.submitVendorDisclaimers}
 * and persists the accepted ids on state.
 *
 * @param params - The parameters.
 * @param params.disclaimerIds - Accepted vendor T&C ids.
 * @returns The vendor signing records.
 * @throws If `vendor` is missing from state.
 */
export type KycControllerRecordVendorDisclaimersAction = {
  type: `KycController:recordVendorDisclaimers`;
  handler: KycController['recordVendorDisclaimers'];
};

/**
 * Fetches the current vendor T&C catalog and returns whether every document
 * is already recorded in {@link KycControllerState.vendorDisclaimersAccepted}.
 *
 * @returns Whether persisted acceptance covers the fetched catalog.
 * @throws If `vendor` or `geoCountry` is missing from state.
 */
export type KycControllerHasCompletedVendorDisclaimersAction = {
  type: `KycController:hasCompletedVendorDisclaimers`;
  handler: KycController['hasCompletedVendorDisclaimers'];
};

/**
 * Presents the identity-provider verification UI. Currently launches SumSub.
 *
 * @param params - Optional SDK presentation options.
 * @param params.locale - BCP-47 locale for the SDK UI.
 * @param params.debug - Enables SDK debug logging.
 * @returns A promise that settles when the provider flow finishes.
 */
export type KycControllerLaunchProviderFlowAction = {
  type: `KycController:launchProviderFlow`;
  handler: KycController['launchProviderFlow'];
};

/**
 * Union of all KycController action types.
 */
export type KycControllerMethodActions =
  | KycControllerStartSessionAction
  | KycControllerResetAction
  | KycControllerClearStateAction
  | KycControllerGetSessionStatusForVendorAction
  | KycControllerRefreshSessionStatusAction
  | KycControllerStartSessionStatusPollingAction
  | KycControllerFetchSessionDisclaimersAction
  | KycControllerRecordSessionDisclaimersAction
  | KycControllerHasCompletedSessionDisclaimersAction
  | KycControllerFetchVendorDisclaimersAction
  | KycControllerRecordVendorDisclaimersAction
  | KycControllerHasCompletedVendorDisclaimersAction
  | KycControllerLaunchProviderFlowAction;
