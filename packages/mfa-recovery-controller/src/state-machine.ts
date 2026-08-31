import { MfaRecoveryError } from './errors.js';
import type { PendingOperation, RecoveryPhase } from './types.js';

/**
 * Returns the persisted recovery phase.
 *
 * @param pending - Loaded pending operation, if any.
 * @returns Current phase.
 */
export function getRecoveryPhase(
  pending: PendingOperation | null,
): RecoveryPhase {
  return pending?.phase ?? 'idle';
}

/**
 * Abort is allowed only before the first escrow write. Once `writing` begins
 * the same mutation must be retried to completion.
 *
 * @param phase - Current phase.
 * @throws If the mutation is already being written.
 */
export function assertAbortAllowed(phase: RecoveryPhase): void {
  if (phase === 'writing') {
    throw new MfaRecoveryError(
      'Cannot abort a mutation once writing has begun',
      'abort_not_allowed',
    );
  }
}

/**
 * Ensures a persisted mutation targets the build-configured escrow set.
 *
 * @param audiences - Mutation audience ids.
 * @param escrowIds - Configured escrow ids.
 */
export function assertSameAudienceIds(
  audiences: string[],
  escrowIds: string[],
): void {
  if (
    audiences.length !== escrowIds.length ||
    audiences.some((id, index) => id !== escrowIds[index])
  ) {
    throw new MfaRecoveryError(
      'Persisted mutation audiences do not match configured escrows',
      'audience_mismatch',
    );
  }
}
