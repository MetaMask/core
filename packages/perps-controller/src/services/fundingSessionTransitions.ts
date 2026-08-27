/**
 * Pure transition guards for funding sessions — the state machine behind the
 * composed funding flow (swap → bridge → deposit Legs over Resting Points).
 *
 * A funding session tracks progress across Legs; funds always sit in
 * user-recoverable balances between Legs. These functions enforce:
 * - forward-only Leg transitions (backward transitions throw),
 * - confirmed Legs are never re-run,
 * - 'confirmed' on Leg i advances Leg i+1 to pending,
 * - retryLeg only on failed + retryable Legs whose predecessors are confirmed.
 *
 * Pure module: no side effects, no controller/Engine imports, inputs are
 * never mutated — every accepted transition returns a new FundingSession
 * with updatedAt = ctx.now.
 */
import type {
  FundingLeg,
  FundingSession,
  FundingSessionStatus,
} from '../types/index.js';
import { generatePerpsId } from '../utils/idUtils.js';

export type TransitionContext = {
  now: number;
};

/** The leg-event union accepted by {@link legEvent}. */
export type FundingLegEvent =
  | { type: 'awaiting_signature' }
  | { type: 'submitted'; externalId: string }
  | { type: 'confirmed' }
  | { type: 'failed'; reason: string; retryable: boolean };

/**
 * Guard helper: assert the session is in the expected status.
 *
 * @param session - The session to check.
 * @param expected - The status the transition requires.
 * @param action - Human-readable action name used in the error message.
 * @throws If the session is not in the expected status.
 */
const requireStatus = (
  session: FundingSession,
  expected: FundingSessionStatus,
  action: string,
): void => {
  if (session.status !== expected) {
    throw new Error(
      `Funding session ${session.id}: cannot ${action} from status '${session.status}' (expected '${expected}')`,
    );
  }
};

/**
 * Guard helper: assert a leg index is in range.
 *
 * @param session - The session whose legs bound the index.
 * @param legIndex - The leg index to validate.
 * @throws If the index is not a valid leg position.
 */
const requireLegIndex = (session: FundingSession, legIndex: number): void => {
  if (
    !Number.isInteger(legIndex) ||
    legIndex < 0 ||
    legIndex >= session.legs.length
  ) {
    throw new Error(
      `Funding session ${session.id}: invalid leg index ${legIndex} (session has ${session.legs.length} legs)`,
    );
  }
};

/**
 * Copy a leg with a new status.
 *
 * @param leg - The leg to copy.
 * @param status - The new leg status.
 * @returns A new leg with the given status.
 */
const withLegStatus = (
  leg: FundingLeg,
  status: FundingLeg['status'],
): FundingLeg => ({
  ...leg,
  status,
});

/**
 * Create a new funding session in 'preflight' status with every Leg pending.
 * Template legs are normalized: stale externalId/failure from a previous
 * attempt are stripped. The account address is stored lowercased (Trading EOA).
 *
 * @param accountAddress - The Trading EOA the deposit will credit.
 * @param legs - Template legs for the composed flow.
 * @param ctx - Transition context providing the clock.
 * @returns A new preflight session.
 */
export function startSession(
  accountAddress: string,
  legs: FundingLeg[],
  ctx: TransitionContext,
): FundingSession {
  return {
    id: generatePerpsId('funding'),
    accountAddress: accountAddress.toLowerCase(),
    createdAt: ctx.now,
    updatedAt: ctx.now,
    status: 'preflight',
    legs: legs.map((leg) => ({
      kind: leg.kind,
      capability: leg.capability,
      status: 'pending' as const,
      ...(leg.quote ? { quote: leg.quote } : {}),
    })),
  };
}

/**
 * Transition preflight -> active.
 *
 * @param session - The session in 'preflight' status.
 * @param ctx - Transition context providing the clock.
 * @returns A new session with status 'active'.
 * @throws If the session is not in 'preflight' status.
 */
export function markPreflightPassed(
  session: FundingSession,
  ctx: TransitionContext,
): FundingSession {
  requireStatus(session, 'preflight', 'mark preflight passed');
  return { ...session, status: 'active', updatedAt: ctx.now };
}

/**
 * Transition preflight -> failed (no funds have moved).
 * The reason is intentionally not persisted on FundingSession — the session
 * type has no failure field; the controller layer owns where the reason lives.
 *
 * @param session - The session in 'preflight' status.
 * @param _reason - Why preflight failed; accepted per the contract, not stored.
 * @param ctx - Transition context providing the clock.
 * @returns A new session with status 'failed'.
 * @throws If the session is not in 'preflight' status.
 */
export function failPreflight(
  session: FundingSession,
  _reason: string,
  ctx: TransitionContext,
): FundingSession {
  requireStatus(session, 'preflight', 'fail preflight');
  return { ...session, status: 'failed', updatedAt: ctx.now };
}

/**
 * Forward-only Leg event application.
 * - pending -> awaiting_signature -> submitted -> confirmed
 * - failed is accepted from awaiting_signature or submitted
 * - 'confirmed' on Leg i advances Leg i+1 to pending
 * - the last Leg being confirmed does NOT complete the session
 *   (credit detection is mobile-side)
 * - events on a confirmed Leg always throw (confirmed Legs are never re-run)
 *
 * @param session - The session owning the leg.
 * @param legIndex - Index of the leg the event applies to.
 * @param event - The leg event to apply.
 * @param ctx - Transition context providing the clock.
 * @returns A new session with the leg transition applied.
 * @throws If the index is out of range or the event is not a forward step.
 */
export function legEvent(
  session: FundingSession,
  legIndex: number,
  event: FundingLegEvent,
  ctx: TransitionContext,
): FundingSession {
  requireLegIndex(session, legIndex);
  const leg = session.legs[legIndex];
  if (!leg) {
    throw new Error(
      `Funding session ${session.id}: missing leg at index ${legIndex}`,
    );
  }

  switch (event.type) {
    case 'awaiting_signature':
      if (leg.status !== 'pending') {
        throw new Error(
          `Funding session ${session.id} leg ${legIndex}: cannot apply 'awaiting_signature' to leg in status '${leg.status}' (forward-only transitions)`,
        );
      }
      return {
        ...session,
        updatedAt: ctx.now,
        legs: session.legs.map((current, i) =>
          i === legIndex
            ? withLegStatus(current, 'awaiting_signature')
            : current,
        ),
      };

    case 'submitted':
      if (leg.status !== 'awaiting_signature') {
        throw new Error(
          `Funding session ${session.id} leg ${legIndex}: cannot apply 'submitted' to leg in status '${leg.status}' (forward-only transitions)`,
        );
      }
      return {
        ...session,
        updatedAt: ctx.now,
        legs: session.legs.map((current, i) =>
          i === legIndex
            ? {
                ...current,
                status: 'submitted' as const,
                externalId: event.externalId,
              }
            : current,
        ),
      };

    case 'confirmed':
      if (leg.status !== 'submitted') {
        throw new Error(
          `Funding session ${session.id} leg ${legIndex}: cannot apply 'confirmed' to leg in status '${leg.status}' (confirmed legs are never re-run; forward-only transitions)`,
        );
      }
      return {
        ...session,
        updatedAt: ctx.now,
        legs: session.legs.map((current, i) => {
          if (i === legIndex) {
            return withLegStatus(current, 'confirmed');
          }
          if (i === legIndex + 1) {
            // Advance the next Leg to pending so the composer can start it.
            return withLegStatus(current, 'pending');
          }
          return current;
        }),
      };

    case 'failed':
      if (leg.status !== 'awaiting_signature' && leg.status !== 'submitted') {
        throw new Error(
          `Funding session ${session.id} leg ${legIndex}: cannot apply 'failed' to leg in status '${leg.status}' (forward-only transitions)`,
        );
      }
      return {
        ...session,
        updatedAt: ctx.now,
        legs: session.legs.map((current, i) =>
          i === legIndex
            ? {
                ...current,
                status: 'failed' as const,
                failure: {
                  reason: event.reason,
                  retryable: event.retryable,
                  at: ctx.now,
                },
              }
            : current,
        ),
      };

    default:
      // Exhaustive over FundingLegEvent; guards future event additions.
      throw new Error(
        `Funding session ${session.id} leg ${legIndex}: unknown leg event`,
      );
  }
}

/**
 * Return a failed Leg to 'pending' so the composer may retry it
 * (requote policy is the composer's, D7). ONLY allowed when:
 * - the leg status is 'failed',
 * - the failure is retryable,
 * - every previous Leg is 'confirmed'.
 *
 * @param session - The session owning the leg.
 * @param legIndex - Index of the leg to retry.
 * @param ctx - Transition context providing the clock.
 * @returns A new session with the leg back to 'pending'.
 * @throws If the leg is not failed, not retryable, or a predecessor is unconfirmed.
 */
export function retryLeg(
  session: FundingSession,
  legIndex: number,
  ctx: TransitionContext,
): FundingSession {
  requireLegIndex(session, legIndex);
  const leg = session.legs[legIndex];
  if (!leg) {
    throw new Error(
      `Funding session ${session.id}: missing leg at index ${legIndex}`,
    );
  }
  if (leg.status !== 'failed') {
    throw new Error(
      `Funding session ${session.id} leg ${legIndex}: cannot retry leg in status '${leg.status}' (only failed legs can be retried)`,
    );
  }
  if (!leg.failure?.retryable) {
    throw new Error(
      `Funding session ${session.id} leg ${legIndex}: failure is not retryable`,
    );
  }
  for (let index = 0; index < legIndex; index += 1) {
    const previous = session.legs[index];
    if (previous?.status !== 'confirmed') {
      throw new Error(
        `Funding session ${session.id} leg ${legIndex}: cannot retry because previous leg ${index} is '${previous?.status}', expected 'confirmed'`,
      );
    }
  }
  return {
    ...session,
    updatedAt: ctx.now,
    legs: session.legs.map((current, i) =>
      i === legIndex
        ? {
            kind: current.kind,
            capability: current.capability,
            status: 'pending' as const,
            ...(current.quote ? { quote: current.quote } : {}),
          }
        : current,
    ),
  };
}

/**
 * Transition active -> paused (D10).
 *
 * @param session - The session in 'active' status.
 * @param ctx - Transition context providing the clock.
 * @returns A new session with status 'paused'.
 * @throws If the session is not in 'active' status.
 */
export function pauseSession(
  session: FundingSession,
  ctx: TransitionContext,
): FundingSession {
  requireStatus(session, 'active', 'pause');
  return { ...session, status: 'paused', updatedAt: ctx.now };
}

/**
 * Transition paused -> active (D10).
 *
 * @param session - The session in 'paused' status.
 * @param ctx - Transition context providing the clock.
 * @returns A new session with status 'active'.
 * @throws If the session is not in 'paused' status.
 */
export function resumeSession(
  session: FundingSession,
  ctx: TransitionContext,
): FundingSession {
  requireStatus(session, 'paused', 'resume');
  return { ...session, status: 'active', updatedAt: ctx.now };
}

/**
 * Transition active -> completed. Driven by mobile-side credit detection,
 * never by the last Leg confirming.
 *
 * @param session - The session in 'active' status.
 * @param ctx - Transition context providing the clock.
 * @returns A new session with status 'completed'.
 * @throws If the session is not in 'active' status.
 */
export function completeSession(
  session: FundingSession,
  ctx: TransitionContext,
): FundingSession {
  requireStatus(session, 'active', 'complete');
  return { ...session, status: 'completed', updatedAt: ctx.now };
}
