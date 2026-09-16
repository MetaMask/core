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
 * Abort is allowed while idle, authorizing, or writing with no receipts.
 * Receipts mean an escrow already applied; finish with resume() instead.
 *
 * TODO: empty receipts is not proof the apply never landed (timeout after a
 * successful write). Record explicit rejects vs ambiguous failures.
 *
 * @param pending - Loaded pending operation, if any.
 * @throws If an escrow has already acknowledged the mutation.
 */
export function assertAbortAllowed(pending: PendingOperation | null): void {
  if (pending?.phase === 'writing' && pending.receipts.length > 0) {
    throw new MfaRecoveryError(
      'Cannot abort a mutation once an escrow has acknowledged it',
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
