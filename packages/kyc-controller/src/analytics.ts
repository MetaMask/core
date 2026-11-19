/**
 * Analytics-only types and helpers for `KycController`. Nothing here is used
 * by the KYC business logic; it describes the payloads passed to
 * {@link KycAnalyticsTrackers} and the status they report.
 */

import type { KycProviderFlowStatus } from './KycController.js';
import type { KycSessionStatus } from './types.js';

/**
 * KYC status vocabulary used by verification analytics. `'none'` means no
 * session exists yet (or the vendor returned an unrecognized status).
 */
export const KYC_ANALYTICS_STATUSES = [
  'none',
  'new',
  'retry',
  'pending',
  'approved',
  'rejected',
] as const;

export type KycAnalyticsStatus = (typeof KYC_ANALYTICS_STATUSES)[number];

const KYC_ANALYTICS_STATUS_SET = new Set<string>(KYC_ANALYTICS_STATUSES);

/**
 * SumSub launch outcomes reported through
 * {@link KycAnalyticsTrackers.verificationOutcome}, one per launch attempt.
 */
export type KycAnalyticsVerificationOutcome =
  | 'submitted'
  | 'abandoned'
  | 'failed';

/**
 * Payload of {@link KycAnalyticsTrackers.verificationOutcome}.
 *
 * Carries no session id, email, disclaimer or token data.
 */
export type KycAnalyticsVerificationOutcomePayload = {
  status: KycAnalyticsVerificationOutcome;
  /** Analytics KYC status after the launch outcome was recorded. */
  kycStatus: KycAnalyticsStatus;
  providerFlowStatus: KycProviderFlowStatus;
  vendor: string | null;
};

/**
 * Payload of {@link KycAnalyticsTrackers.statusChanged}.
 *
 * Carries no session id, email, disclaimer or token data.
 */
export type KycAnalyticsStatusChangedPayload = {
  /**
   * Analytics KYC status before the change. `'none'` when no status was
   * stored before, which covers both a session that was just created and a
   * stored `finalStatus` outside {@link KYC_ANALYTICS_STATUSES}. Always
   * present, so a consumer never has to read an absent field as "first
   * observation".
   */
  previousKycStatus: KycAnalyticsStatus;
  /** Analytics KYC status after the change. */
  kycStatus: KycAnalyticsStatus;
  providerFlowStatus: KycProviderFlowStatus;
  vendor: string | null;
};

/**
 * Client callbacks that record KYC analytics. Passed to `KycController` as
 * `trackKycAnalytics`. The controller calls them after the state write that
 * caused the signal.
 */
export type KycAnalyticsTrackers = {
  /**
   * Called once per SumSub launch attempt (`submitted`, `abandoned`, or
   * `failed`), including a repeat of the previous outcome and the failures
   * that leave state unchanged.
   *
   * @param payload - The launch outcome and the analytics status after it.
   */
  verificationOutcome: (
    payload: KycAnalyticsVerificationOutcomePayload,
  ) => void;
  /**
   * Called after a state write that changes the analytics KYC status. Not
   * called when a session is loaded into an empty slot.
   *
   * @param payload - The analytics status before and after the change.
   */
  statusChanged: (payload: KycAnalyticsStatusChangedPayload) => void;
};

/**
 * Maps the session's `finalStatus` onto the analytics KYC status. A missing
 * session is `none`, and so is a `finalStatus` outside
 * {@link KYC_ANALYTICS_STATUSES}.
 *
 * @param session - Persisted or freshly fetched KYC session, if any.
 * @returns The analytics KYC status.
 */
export function getKycAnalyticsStatus(
  session: KycSessionStatus | null,
): KycAnalyticsStatus {
  if (session && KYC_ANALYTICS_STATUS_SET.has(session.finalStatus)) {
    return session.finalStatus as KycAnalyticsStatus;
  }
  return 'none';
}
