import type { MfaRecoveryError } from './errors.js';
import {
  assertSameAudienceIds,
  assertTransition,
  getRecoveryPhase,
} from './state-machine.js';
import type { RecoveryEvent } from './state-machine.js';
import type { PendingOperation, RecoveryPhase } from './types.js';

/**
 * @param action - Function expected to throw.
 * @returns The error it threw.
 */
function getThrownError(action: () => unknown): MfaRecoveryError {
  try {
    action();
  } catch (error) {
    return error as MfaRecoveryError;
  }
  throw new Error('Expected the action to throw');
}

const PHASES: RecoveryPhase[] = [
  'idle',
  'unreadable',
  'authorizing',
  'writing',
];

const EVENTS: RecoveryEvent[] = [
  'start',
  'write',
  'complete',
  'reject',
  'abort',
  'discardUnreadable',
];

const ALLOWED_FROM: Record<RecoveryEvent, RecoveryPhase[]> = {
  start: ['idle'],
  write: ['authorizing', 'writing'],
  complete: ['writing'],
  reject: ['writing'],
  abort: ['idle', 'authorizing'],
  discardUnreadable: ['unreadable'],
};

const TARGET: Record<RecoveryEvent, RecoveryPhase> = {
  start: 'authorizing',
  write: 'writing',
  complete: 'idle',
  reject: 'idle',
  abort: 'idle',
  discardUnreadable: 'idle',
};

/**
 * Error code for a disallowed transition. `start` and `abort` keep the codes
 * their callers already report; any other disallowed transition is a bug.
 */
const REJECTED_CODE: Record<RecoveryEvent, string> = {
  start: 'pending_mutation',
  write: 'invalid_transition',
  complete: 'invalid_transition',
  reject: 'invalid_transition',
  abort: 'abort_not_allowed',
  discardUnreadable: 'invalid_transition',
};

describe('state machine', () => {
  describe('getRecoveryPhase', () => {
    it('returns idle when there is no pending operation', () => {
      expect(getRecoveryPhase(null)).toBe('idle');
    });

    it('returns the persisted phase of a pending operation', () => {
      const pending = { phase: 'writing' } as PendingOperation;
      expect(getRecoveryPhase(pending)).toBe('writing');
    });
  });

  describe('assertTransition', () => {
    const allowed = EVENTS.flatMap((event) =>
      ALLOWED_FROM[event].map((from) => [event, from] as const),
    );
    const disallowed = EVENTS.flatMap((event) =>
      PHASES.filter((from) => !ALLOWED_FROM[event].includes(from)).map(
        (from) => [event, from] as const,
      ),
    );

    it.each(allowed)(
      'allows %s from %s and returns the target phase',
      (event, from) => {
        expect(assertTransition(event, from)).toBe(TARGET[event]);
      },
    );

    it.each(disallowed)(
      'rejects %s from %s with the expected code',
      (event, from) => {
        expect(getThrownError(() => assertTransition(event, from)).code).toBe(
          REJECTED_CODE[event],
        );
      },
    );

    it('rejects a mutation start while a writing record is pending', () => {
      expect(() => assertTransition('start', 'writing')).toThrow(
        'A pending mutation must be resumed or aborted first',
      );
    });

    it('rejects abort of a writing record with the existing message', () => {
      expect(() => assertTransition('abort', 'writing')).toThrow(
        'Cannot abort a mutation that may have been applied',
      );
    });
  });

  describe('assertSameAudienceIds', () => {
    it('accepts the configured escrow ids in order', () => {
      expect(() =>
        assertSameAudienceIds(
          ['escrow-a', 'escrow-b'],
          ['escrow-a', 'escrow-b'],
        ),
      ).not.toThrow();
    });

    it('rejects a reordered escrow set', () => {
      expect(
        getThrownError(() =>
          assertSameAudienceIds(
            ['escrow-b', 'escrow-a'],
            ['escrow-a', 'escrow-b'],
          ),
        ).code,
      ).toBe('audience_mismatch');
    });
  });
});
