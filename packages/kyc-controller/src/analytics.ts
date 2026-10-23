/**
 * Analytics-only types and helpers for `KycController`. Nothing here is used
 * by the KYC business logic; it describes the payloads of the
 * `KycController:analytics*` events and the status they report.
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
 * SumSub launch outcomes the controller reports through
 * `KycController:analyticsVerificationOutcome`, one per launch attempt.
 */
export type KycAnalyticsVerificationOutcome =
  | 'submitted'
  | 'abandoned'
  | 'failed';

/**
 * Payload of `KycController:analyticsVerificationOutcome`.
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
 * Payload of `KycController:analyticsStatusChanged`.
 *
 * Carries no session id, email, disclaimer or token data.
 */
export type KycAnalyticsStatusChangedPayload = {
  /**
   * Analytics KYC status before the change. Absent when no status was stored
   * before (the session was just created).
   */
  previousKycStatus?: KycAnalyticsStatus;
  /** Analytics KYC status after the change. */
  kycStatus: KycAnalyticsStatus;
  providerFlowStatus: KycProviderFlowStatus;
  vendor: string | null;
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
