import { MfaRecoveryError } from './errors.js';
import type { PendingOperation, RecoveryPhase } from './types.js';

/**
 * Events that change the persisted recovery phase. Each one has a fixed set of
 * source phases and a single target phase in {@link TRANSITIONS}.
 */
export type RecoveryEvent =
  | 'start'
  | 'write'
  | 'complete'
  | 'reject'
  | 'abort'
  | 'discardUnreadable';

const TRANSITIONS: Record<
  RecoveryEvent,
  { from: RecoveryPhase[]; to: RecoveryPhase }
> = {
  start: { from: ['idle'], to: 'authorizing' },
  write: { from: ['authorizing', 'writing'], to: 'writing' },
  complete: { from: ['writing'], to: 'idle' },
  reject: { from: ['writing'], to: 'idle' },
  abort: { from: ['idle', 'authorizing'], to: 'idle' },
  discardUnreadable: { from: ['unreadable'], to: 'idle' },
};

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
 * Checks that an event may change the phase from `from`.
 *
 * A disallowed `start` reports `pending_mutation` and a disallowed `abort`
 * reports `abort_not_allowed`, the codes callers already handle. Any other
 * disallowed event is a controller bug and reports `invalid_transition`.
 *
 * @param event - Event that would change the phase.
 * @param from - Current persisted phase.
 * @returns The phase the event moves to.
 * @throws If the event is not allowed from `from`.
 */
export function assertTransition(
  event: RecoveryEvent,
  from: RecoveryPhase,
): RecoveryPhase {
  const transition = TRANSITIONS[event];
  if (transition.from.includes(from)) {
    return transition.to;
  }
  if (event === 'start') {
    throw new MfaRecoveryError(
      'A pending mutation must be resumed or aborted first',
      'pending_mutation',
    );
  }
  if (event === 'abort') {
    throw new MfaRecoveryError(
      'Cannot abort a mutation that may have been applied',
      'abort_not_allowed',
    );
  }
  throw new MfaRecoveryError(
    `Cannot ${event} a pending mutation in phase ${from}`,
    'invalid_transition',
  );
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
