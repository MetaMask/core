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
 * Ensures a persisted mutation targets configured escrows, in configured
 * order. Repairs target only the lagging escrows.
 *
 * @param audiences - Mutation audience ids.
 * @param escrowIds - Configured escrow ids.
 */
export function assertConfiguredAudienceIds(
  audiences: string[],
  escrowIds: string[],
): void {
  const expected = escrowIds.filter((id) => audiences.includes(id));
  if (
    audiences.length === 0 ||
    audiences.length !== expected.length ||
    audiences.some((id, index) => id !== expected[index])
  ) {
    throw new MfaRecoveryError(
      'Persisted mutation audiences do not match configured escrows',
      'audience_mismatch',
    );
  }
}
