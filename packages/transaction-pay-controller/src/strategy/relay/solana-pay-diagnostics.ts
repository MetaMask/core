import type {
  MetamaskPaySolanaExecution,
  MetamaskPaySource,
} from '@metamask/transaction-controller';
import { parseCaipAssetType } from '@metamask/utils';
import { isEqual } from 'lodash-es';

import type {
  SolanaPayErrorCode,
  SolanaPayStatus,
  SolanaPaySupportDiagnostics,
} from '../../types.js';
import { SOLANA_SOURCE_EXPIRED_REASON } from './solana-transaction.js';

const NATIVE_ASSET_NAMESPACE = 'slip44';

/**
 * Creates the privacy-safe support projection of a Solana Pay execution.
 *
 * Accounts, assets, amounts, request IDs, transaction IDs, provider payloads
 * and free-form failure reasons are deliberately left out.
 *
 * @param status - Observable status derived from the checkpoint.
 * @param execution - Durable Solana execution checkpoint.
 * @param source - Persisted CAIP source of the target transaction, if any.
 * @returns Categorical support and analytics diagnostics.
 */
export function getSolanaPaySupportDiagnostics(
  status: SolanaPayStatus,
  execution: MetamaskPaySolanaExecution,
  source: MetamaskPaySource | undefined,
): SolanaPaySupportDiagnostics {
  const errorCode = getSolanaPayErrorCode(status, execution);

  return {
    ...(errorCode && { errorCode }),
    followUpStatus: status.followUpStatus,
    followUpTransactionIdPresent: status.followUpTransactionId !== undefined,
    notificationStatus: status.notificationStatus,
    outcome: status.outcome,
    phase: status.phase,
    provider: 'relay',
    relayStatus: status.relayStatus,
    ...(source && {
      sourceAssetClass:
        parseCaipAssetType(source.sourceAssetId).assetNamespace ===
        NATIVE_ASSET_NAMESPACE
          ? 'native'
          : 'token',
    }),
    sourceStatus: status.sourceStatus,
    sourceTransactionIdPresent: status.sourceTransactionId !== undefined,
    targetTransactionIdPresent: status.targetTransactionId !== undefined,
  };
}

/**
 * Whether any categorical diagnostics value changed between two checkpoints.
 *
 * @param previous - Diagnostics of the previous checkpoint, if any.
 * @param next - Diagnostics of the next checkpoint.
 * @returns True if a lifecycle event should be emitted.
 */
export function isSolanaPayLifecycleTransition(
  previous: SolanaPaySupportDiagnostics | undefined,
  next: SolanaPaySupportDiagnostics,
): boolean {
  return !isEqual(previous, next);
}

/**
 * Classifies the most significant problem of a Solana Pay execution, in the
 * same precedence as its derived outcome.
 *
 * @param status - Observable status derived from the checkpoint.
 * @param execution - Durable Solana execution checkpoint.
 * @returns Stable error code, or undefined if nothing is wrong.
 */
function getSolanaPayErrorCode(
  status: SolanaPayStatus,
  execution: MetamaskPaySolanaExecution,
): SolanaPayErrorCode | undefined {
  if (status.phase === 'user-rejected') {
    return 'user_rejected';
  }

  if (status.phase === 'not-submitted') {
    return 'preflight_failed';
  }

  if (status.sourceStatus === 'failed') {
    return status.sourceFailureReason === SOLANA_SOURCE_EXPIRED_REASON
      ? 'source_transaction_expired'
      : 'source_transaction_failed';
  }

  if (status.relayStatus === 'failure') {
    return 'settlement_failed';
  }

  if (status.relayStatus === 'refund') {
    return 'settlement_refunded';
  }

  if (status.followUpStatus === 'failed') {
    return 'follow_up_failed';
  }

  if (status.phase === 'unknown') {
    return 'submission_unknown';
  }

  if (status.sourceStatus === 'unknown') {
    return 'source_status_unknown';
  }

  if (status.relayStatus === 'unknown') {
    return 'settlement_status_unknown';
  }

  // An observed `attempting` follow-up was interrupted, so its outcome is
  // unknown (see `deriveSolanaPayOutcome`).
  if (
    status.followUpStatus === 'unknown' ||
    status.followUpStatus === 'attempting'
  ) {
    return 'follow_up_status_unknown';
  }

  if (
    execution.atomicProductActionRequired &&
    !execution.atomicProductActionIncluded
  ) {
    return 'construction_failed';
  }

  if (status.notificationStatus === 'failure') {
    return 'provider_notification_failed';
  }

  return undefined;
}
