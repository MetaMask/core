import type { MetamaskPaySolanaExecution } from '@metamask/transaction-controller';

import { deriveSolanaPayOutcome } from './strategy/relay/solana-pay.js';
import type {
  SolanaPayErrorCode,
  SolanaPaySupportDiagnostics,
  TransactionPaySource,
} from './types.js';

/** Error carrying a stable, non-sensitive Solana Pay support code. */
export class SolanaPayError extends Error {
  readonly code: SolanaPayErrorCode;

  constructor(code: SolanaPayErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Creates a privacy-safe support projection from a durable execution.
 *
 * Raw accounts, assets, amounts, request IDs, transaction IDs, provider
 * payloads, and free-form error text are deliberately excluded.
 *
 * @param source - Persisted chain-agnostic source metadata.
 * @param execution - Durable external Solana execution checkpoint.
 * @returns Stable support and analytics diagnostics.
 */
export function getSolanaPaySupportDiagnostics(
  source: TransactionPaySource,
  execution: MetamaskPaySolanaExecution,
): SolanaPaySupportDiagnostics {
  const errorCode = getSolanaPayErrorCode(execution);

  return {
    ...(errorCode && { errorCode }),
    followUpStatus: execution.followUpStatus,
    followUpTransactionIdPresent:
      execution.followUpTransactionId !== undefined,
    notificationStatus: execution.notificationStatus,
    outcome: deriveSolanaPayOutcome(execution),
    phase: execution.phase,
    provider: 'relay',
    relayStatus: execution.relayStatus,
    requestIdPresent: true,
    sourceAssetClass: source.sourceAssetId.endsWith('/slip44:501')
      ? 'native'
      : 'token',
    sourceStatus: execution.sourceStatus,
    sourceTransactionIdPresent:
      'sourceTransactionId' in execution &&
      execution.sourceTransactionId !== undefined,
    targetTransactionIdPresent: execution.targetTransactionId !== undefined,
  };
}

/**
 * Determines whether any emitted lifecycle property changed.
 *
 * @param previous - Previous privacy-safe projection.
 * @param next - Next privacy-safe projection.
 * @returns Whether the lifecycle event should be emitted.
 */
export function isSolanaPayLifecycleTransition(
  previous: SolanaPaySupportDiagnostics | undefined,
  next: SolanaPaySupportDiagnostics,
): boolean {
  return (
    previous === undefined ||
    previous.errorCode !== next.errorCode ||
    previous.followUpStatus !== next.followUpStatus ||
    previous.followUpTransactionIdPresent !==
      next.followUpTransactionIdPresent ||
    previous.notificationStatus !== next.notificationStatus ||
    previous.outcome !== next.outcome ||
    previous.phase !== next.phase ||
    previous.provider !== next.provider ||
    previous.relayStatus !== next.relayStatus ||
    previous.requestIdPresent !== next.requestIdPresent ||
    previous.sourceAssetClass !== next.sourceAssetClass ||
    previous.sourceStatus !== next.sourceStatus ||
    previous.sourceTransactionIdPresent !==
      next.sourceTransactionIdPresent ||
    previous.targetTransactionIdPresent !== next.targetTransactionIdPresent
  );
}

/**
 * Returns an execution with only its current stable error code retained.
 *
 * @param execution - Durable external Solana execution checkpoint.
 * @returns Execution with stale codes removed and the current code applied.
 */
export function withSolanaPayErrorCode(
  execution: MetamaskPaySolanaExecution,
): MetamaskPaySolanaExecution {
  const result = { ...execution };
  const errorCode = getSolanaPayErrorCode(execution);

  if (errorCode) {
    result.errorCode = errorCode;
  } else {
    delete result.errorCode;
  }

  return result;
}

function getSolanaPayErrorCode(
  execution: MetamaskPaySolanaExecution,
): SolanaPayErrorCode | undefined {
  if (execution.phase === 'user-rejected') {
    return 'user_rejected';
  }

  if (execution.phase === 'not-submitted') {
    return execution.errorCode ?? 'preflight_failed';
  }

  if (execution.sourceStatus === 'failed') {
    return 'source_transaction_failed';
  }

  if (execution.relayStatus === 'failure') {
    return 'settlement_failed';
  }

  if (execution.relayStatus === 'refund') {
    return 'settlement_refunded';
  }

  if (execution.followUpStatus === 'failed') {
    return 'follow_up_failed';
  }

  if (execution.phase === 'unknown') {
    return 'submission_unknown';
  }

  if (execution.sourceStatus === 'unknown') {
    return 'source_status_unknown';
  }

  if (execution.relayStatus === 'unknown') {
    return 'settlement_status_unknown';
  }

  if (execution.followUpStatus === 'unknown') {
    return 'follow_up_status_unknown';
  }

  if (
    execution.atomicProductActionRequired &&
    !execution.atomicProductActionIncluded
  ) {
    return 'construction_failed';
  }

  if (execution.notificationStatus === 'failure') {
    return 'provider_notification_failed';
  }

  return undefined;
}
