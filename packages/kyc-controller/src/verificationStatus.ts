import type { KycProviderFlowStatus } from './KycController.js';
import type { KycSessionStatus } from './types.js';

/**
 * KYC status vocabulary used by verification analytics. `'none'` means no
 * session exists yet (or the vendor returned an unrecognized status).
 */
export const KYC_DERIVED_STATUSES = [
  'none',
  'new',
  'retry',
  'pending',
  'approved',
  'rejected',
] as const;

export type KycDerivedStatus = (typeof KYC_DERIVED_STATUSES)[number];

const KYC_DERIVED_STATUS_SET = new Set<string>(KYC_DERIVED_STATUSES);

/**
 * Verification outcomes the controller reports through
 * `KycController:verificationStatusChanged`.
 *
 * - `submitted`, `abandoned` and `failed` mirror the provider-flow outcome of a
 * single SumSub launch attempt.
 * - `succeeded` and `rejected` report the derived KYC status becoming
 * `approved` or `rejected`.
 */
export type KycVerificationEventStatus =
  | 'submitted'
  | 'abandoned'
  | 'failed'
  | 'succeeded'
  | 'rejected';

/**
 * Payload of `KycController:verificationStatusChanged`.
 *
 * Carries no session id, email, disclaimer or token data.
 */
export type KycVerificationStatusChangedPayload = {
  status: KycVerificationEventStatus;
  /** Derived KYC status before the write that caused this event. */
  previousKycStatus: KycDerivedStatus;
  /** Derived KYC status after the write that caused this event. */
  kycStatus: KycDerivedStatus;
  providerFlowStatus: KycProviderFlowStatus;
  vendor: string | null;
};

/**
 * Derives the KYC status from the persisted session and provider-flow outcome.
 *
 * Relay approval (`kycStatus: 'approved'`) counts even when `finalStatus` is
 * still `pending`. A non-approved session whose provider flow was submitted, or
 * whose status is pending, is `pending`.
 *
 * @param session - Persisted or freshly fetched KYC session, if any.
 * @param providerFlowStatus - Durable provider-flow outcome.
 * @returns The derived KYC status.
 */
export function deriveKycStatus(
  session: KycSessionStatus | null,
  providerFlowStatus: KycProviderFlowStatus,
): KycDerivedStatus {
  if (!session) {
    return 'none';
  }
  if (session.finalStatus === 'approved' || session.kycStatus === 'approved') {
    return 'approved';
  }
  const mapped: KycDerivedStatus = KYC_DERIVED_STATUS_SET.has(
    session.finalStatus,
  )
    ? (session.finalStatus as KycDerivedStatus)
    : 'none';
  if (mapped === 'rejected' || mapped === 'retry') {
    return mapped;
  }
  if (
    session.finalStatus === 'pending' ||
    session.kycStatus === 'pending' ||
    providerFlowStatus === 'submitted'
  ) {
    return 'pending';
  }
  return mapped;
}
