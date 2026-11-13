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
