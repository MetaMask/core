import type { KycVendorSessionState } from './KycController.js';

/**
 * One verdict for a vendor's KYC session, derived from the session's
 * `finalStatus` / `kycStatus` pair and the provider-flow outcome.
 *
 * - `none` — no session, or a status this client does not recognise.
 * - `new` — a session exists but nothing has been submitted.
 * - `pending` — submitted, or the vendor / relay is still processing.
 * - `approved` — the vendor approved the session.
 * - `rejected` / `retry` — the vendor's final decision.
 *
 * This is deliberately not a "ready" verdict: `approved` says nothing about
 * work a vendor needs after approval (e.g. Iron account activation).
 */
export const KYC_SESSION_DECISIONS = [
  'none',
  'new',
  'pending',
  'approved',
  'rejected',
  'retry',
] as const;

export type KycSessionDecision = (typeof KYC_SESSION_DECISIONS)[number];

const KYC_SESSION_DECISION_SET = new Set<string>(KYC_SESSION_DECISIONS);

/**
 * Reduces a vendor's session entry to a {@link KycSessionDecision}.
 *
 * Only the vendor's own `finalStatus: approved` counts as approved; a relay
 * `kycStatus: approved` alone does not. A non-final session whose provider
 * flow was submitted, or whose status is pending, is `pending`.
 *
 * @param entry - The vendor's session entry, if any.
 * @returns The session decision.
 */
export function getKycSessionDecision(
  entry: KycVendorSessionState | undefined,
): KycSessionDecision {
  const session = entry?.sessionStatus;
  if (!session) {
    return 'none';
  }
  if (session.finalStatus === 'approved') {
    return 'approved';
  }
  if (session.finalStatus === 'rejected' || session.finalStatus === 'retry') {
    return session.finalStatus;
  }
  if (
    session.finalStatus === 'pending' ||
    session.kycStatus === 'pending' ||
    entry.providerFlowStatus === 'submitted'
  ) {
    return 'pending';
  }
  return KYC_SESSION_DECISION_SET.has(session.finalStatus)
    ? (session.finalStatus as KycSessionDecision)
    : 'none';
}
