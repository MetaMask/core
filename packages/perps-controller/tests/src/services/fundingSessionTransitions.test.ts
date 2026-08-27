/* eslint-disable */
import type { FundingLeg, FundingSession } from '../../../src/types/index.js';
import {
  completeSession,
  failPreflight,
  legEvent,
  markPreflightPassed,
  pauseSession,
  resumeSession,
  retryLeg,
  startSession,
  type TransitionContext,
} from '../../../src/services/fundingSessionTransitions.js';

const NOW = 1_700_000_000_000;
const CTX: TransitionContext = { now: NOW };
const ADDRESS = '0xAbC0000000000000000000000000000000000001';

const makeLeg = (overrides: Partial<FundingLeg> = {}): FundingLeg => ({
  kind: 'swap',
  capability: { requiresDeviceSignature: false, silent: false },
  status: 'pending',
  ...overrides,
});

const makeLegs = (count: number): FundingLeg[] =>
  Array.from({ length: count }, () => makeLeg());

/** startSession -> markPreflightPassed => status 'active' with N pending legs. */
const buildActiveSession = (legCount = 2): FundingSession =>
  markPreflightPassed(startSession(ADDRESS, makeLegs(legCount), CTX), CTX);

/** Drive a single leg forward through the happy path to the target status. */
const advanceLeg = (
  session: FundingSession,
  legIndex: number,
  target: 'awaiting_signature' | 'submitted' | 'confirmed' | 'failed',
): FundingSession => {
  let next = legEvent(session, legIndex, { type: 'awaiting_signature' }, CTX);
  if (target === 'awaiting_signature') {
    return next;
  }
  next = legEvent(
    next,
    legIndex,
    { type: 'submitted', externalId: `ext-${legIndex}` },
    CTX,
  );
  if (target === 'submitted') {
    return next;
  }
  if (target === 'confirmed') {
    return legEvent(next, legIndex, { type: 'confirmed' }, CTX);
  }
  return legEvent(
    next,
    legIndex,
    { type: 'failed', reason: 'rpc timeout', retryable: true },
    CTX,
  );
};

describe('fundingSessionTransitions', () => {
  describe('startSession', () => {
    it('creates a preflight session with all legs pending', () => {
      const result = startSession(ADDRESS, makeLegs(2), CTX);

      expect(result.status).toBe('preflight');
      expect(result.accountAddress).toBe(ADDRESS.toLowerCase());
      expect(result.createdAt).toBe(NOW);
      expect(result.updatedAt).toBe(NOW);
      expect(result.id).toBeTruthy();
      expect(result.legs.map((leg) => leg.status)).toEqual([
        'pending',
        'pending',
      ]);
      expect(result.legs.map((leg) => leg.kind)).toEqual(['swap', 'swap']);
    });

    it('normalizes template legs: strips stale externalId and failure', () => {
      const dirtyLegs = [
        makeLeg({
          externalId: 'stale-tx',
          failure: {
            reason: 'old',
            retryable: false,
            at: 1,
          },
        }),
      ];

      const result = startSession(ADDRESS, dirtyLegs, CTX);

      expect(result.legs[0]?.status).toBe('pending');
      expect(result.legs[0]?.externalId).toBeUndefined();
      expect(result.legs[0]?.failure).toBeUndefined();
    });
  });

  describe('markPreflightPassed', () => {
    it('transitions preflight -> active and stamps updatedAt', () => {
      const session = startSession(ADDRESS, makeLegs(2), CTX);

      const result = markPreflightPassed(session, { now: NOW + 10 });

      expect(result.status).toBe('active');
      expect(result.updatedAt).toBe(NOW + 10);
    });

    it('throws on any other status', () => {
      const active = buildActiveSession();
      const paused = pauseSession(active, CTX);
      const completed = completeSession(active, CTX);
      const failed = failPreflight(
        startSession(ADDRESS, makeLegs(1), CTX),
        'insufficient funds',
        CTX,
      );

      expect(() => markPreflightPassed(active, CTX)).toThrow(/status 'active'/);
      expect(() => markPreflightPassed(paused, CTX)).toThrow(/status 'paused'/);
      expect(() => markPreflightPassed(completed, CTX)).toThrow(
        /status 'completed'/,
      );
      expect(() => markPreflightPassed(failed, CTX)).toThrow(/status 'failed'/);
    });
  });

  describe('failPreflight', () => {
    it('transitions preflight -> failed with the reason', () => {
      const session = startSession(ADDRESS, makeLegs(2), CTX);

      const result = failPreflight(session, 'no USDC', { now: NOW + 7 });

      expect(result.status).toBe('failed');
      expect(result.updatedAt).toBe(NOW + 7);
    });

    it('throws on any other status', () => {
      const active = buildActiveSession();

      expect(() => failPreflight(active, 'nope', CTX)).toThrow(
        /status 'active'/,
      );
    });
  });

  describe('legEvent', () => {
    it('advances pending -> awaiting_signature and stamps updatedAt', () => {
      const session = buildActiveSession();

      const result = legEvent(
        session,
        0,
        { type: 'awaiting_signature' },
        {
          now: NOW + 3,
        },
      );

      expect(result.legs[0]?.status).toBe('awaiting_signature');
      expect(result.updatedAt).toBe(NOW + 3);
    });

    it('advances awaiting_signature -> submitted and records externalId', () => {
      const session = advanceLeg(buildActiveSession(), 0, 'awaiting_signature');

      const result = legEvent(
        session,
        0,
        { type: 'submitted', externalId: 'tx-1' },
        { now: NOW + 4 },
      );

      expect(result.legs[0]?.status).toBe('submitted');
      expect(result.legs[0]?.externalId).toBe('tx-1');
      expect(result.updatedAt).toBe(NOW + 4);
    });

    it('advances submitted -> confirmed and advances the next leg to pending', () => {
      const session = advanceLeg(buildActiveSession(), 0, 'submitted');

      const result = legEvent(
        session,
        0,
        { type: 'confirmed' },
        {
          now: NOW + 5,
        },
      );

      expect(result.legs[0]?.status).toBe('confirmed');
      expect(result.legs[1]?.status).toBe('pending');
      expect(result.updatedAt).toBe(NOW + 5);
    });

    it('does NOT complete the session when the last leg is confirmed', () => {
      let session = buildActiveSession(2);
      session = advanceLeg(session, 0, 'confirmed');
      session = advanceLeg(session, 1, 'confirmed');

      expect(session.status).toBe('active');
      expect(session.legs.map((leg) => leg.status)).toEqual([
        'confirmed',
        'confirmed',
      ]);
    });

    it('applies failed from awaiting_signature with failure details', () => {
      const session = advanceLeg(buildActiveSession(), 0, 'awaiting_signature');

      const result = legEvent(
        session,
        0,
        { type: 'failed', reason: 'user rejected', retryable: false },
        { now: NOW + 6 },
      );

      expect(result.legs[0]?.status).toBe('failed');
      expect(result.legs[0]?.failure).toEqual({
        reason: 'user rejected',
        retryable: false,
        at: NOW + 6,
      });
      expect(result.updatedAt).toBe(NOW + 6);
    });

    it('applies failed from submitted', () => {
      const session = advanceLeg(buildActiveSession(), 0, 'submitted');

      const result = legEvent(
        session,
        0,
        { type: 'failed', reason: 'reverted on-chain', retryable: true },
        CTX,
      );

      expect(result.legs[0]?.status).toBe('failed');
    });

    it('throws when re-running an event on a confirmed leg', () => {
      const session = advanceLeg(buildActiveSession(), 0, 'confirmed');

      expect(() => legEvent(session, 0, { type: 'confirmed' }, CTX)).toThrow(
        /confirmed/,
      );
      expect(() =>
        legEvent(session, 0, { type: 'awaiting_signature' }, CTX),
      ).toThrow(/confirmed/);
      expect(() =>
        legEvent(session, 0, { type: 'submitted', externalId: 'x' }, CTX),
      ).toThrow(/confirmed/);
      expect(() =>
        legEvent(
          session,
          0,
          { type: 'failed', reason: 'r', retryable: true },
          CTX,
        ),
      ).toThrow(/confirmed/);
    });

    it('throws on backward transitions', () => {
      const submitted = advanceLeg(buildActiveSession(), 0, 'submitted');

      // awaiting_signature on a submitted leg is backward
      expect(() =>
        legEvent(submitted, 0, { type: 'awaiting_signature' }, CTX),
      ).toThrow(/submitted/);

      const awaiting = advanceLeg(
        buildActiveSession(),
        0,
        'awaiting_signature',
      );
      // confirmed on an awaiting_signature leg skips submitted
      expect(() => legEvent(awaiting, 0, { type: 'confirmed' }, CTX)).toThrow(
        /awaiting_signature/,
      );
      // submitted on a pending leg skips awaiting_signature
      const pendingSession = buildActiveSession();
      expect(() =>
        legEvent(
          pendingSession,
          0,
          { type: 'submitted', externalId: 'x' },
          CTX,
        ),
      ).toThrow(/pending/);
      // failed on a pending leg that never started
      expect(() =>
        legEvent(
          pendingSession,
          0,
          { type: 'failed', reason: 'r', retryable: true },
          CTX,
        ),
      ).toThrow(/pending/);
    });

    it('throws on an out-of-range leg index', () => {
      const session = buildActiveSession(2);

      expect(() =>
        legEvent(session, -1, { type: 'awaiting_signature' }, CTX),
      ).toThrow(/leg index/i);
      expect(() =>
        legEvent(session, 2, { type: 'awaiting_signature' }, CTX),
      ).toThrow(/leg index/i);
    });
  });

  describe('retryLeg', () => {
    it('returns a failed retryable leg to pending when all previous legs are confirmed', () => {
      let session = buildActiveSession(3);
      session = advanceLeg(session, 0, 'confirmed');
      session = advanceLeg(session, 1, 'failed');

      const result = retryLeg(session, 1, { now: NOW + 9 });

      expect(result.legs[1]?.status).toBe('pending');
      expect(result.legs[1]?.failure).toBeUndefined();
      expect(result.updatedAt).toBe(NOW + 9);
    });

    it('allows retrying leg 0 (no previous legs)', () => {
      const session = advanceLeg(buildActiveSession(2), 0, 'failed');

      const result = retryLeg(session, 0, CTX);

      expect(result.legs[0]?.status).toBe('pending');
    });

    it('throws when the leg is not failed', () => {
      const session = buildActiveSession();

      expect(() => retryLeg(session, 0, CTX)).toThrow(/pending/);
    });

    it('throws when the failure is not retryable', () => {
      let session = buildActiveSession(2);
      session = advanceLeg(session, 0, 'confirmed');
      session = legEvent(session, 1, { type: 'awaiting_signature' }, CTX);
      session = legEvent(
        session,
        1,
        { type: 'failed', reason: 'permanent', retryable: false },
        CTX,
      );

      expect(() => retryLeg(session, 1, CTX)).toThrow(/retryable/);
    });

    it('throws when an earlier leg is not confirmed', () => {
      let session = buildActiveSession(3);
      session = advanceLeg(session, 0, 'confirmed');
      session = advanceLeg(session, 1, 'failed');
      session = advanceLeg(session, 2, 'failed');

      expect(() => retryLeg(session, 2, CTX)).toThrow(/confirmed/);
    });

    it('throws on an out-of-range leg index', () => {
      const session = buildActiveSession(1);

      expect(() => retryLeg(session, 5, CTX)).toThrow(/leg index/i);
    });
  });

  describe('pauseSession / resumeSession', () => {
    it('transitions active -> paused (D10) and stamps updatedAt', () => {
      const session = buildActiveSession();

      const result = pauseSession(session, { now: NOW + 11 });

      expect(result.status).toBe('paused');
      expect(result.updatedAt).toBe(NOW + 11);
    });

    it('throws when pausing a non-active session', () => {
      const preflight = startSession(ADDRESS, makeLegs(1), CTX);

      expect(() => pauseSession(preflight, CTX)).toThrow(/preflight/);
      expect(() => resumeSession(preflight, CTX)).toThrow(/preflight/);
    });

    it('transitions paused -> active and stamps updatedAt', () => {
      const paused = pauseSession(buildActiveSession(), CTX);

      const result = resumeSession(paused, { now: NOW + 12 });

      expect(result.status).toBe('active');
      expect(result.updatedAt).toBe(NOW + 12);
    });
  });

  describe('completeSession', () => {
    it('transitions active -> completed and stamps updatedAt', () => {
      const session = buildActiveSession();

      const result = completeSession(session, { now: NOW + 13 });

      expect(result.status).toBe('completed');
      expect(result.updatedAt).toBe(NOW + 13);
    });

    it('throws when the session is not active', () => {
      const paused = pauseSession(buildActiveSession(), CTX);
      const preflight = startSession(ADDRESS, makeLegs(1), CTX);

      expect(() => completeSession(paused, CTX)).toThrow(/paused/);
      expect(() => completeSession(preflight, CTX)).toThrow(/preflight/);
    });
  });

  describe('purity', () => {
    it('never mutates the input session', () => {
      const session = buildActiveSession(2);
      const snapshot = JSON.stringify(session);

      let driven = advanceLeg(session, 0, 'confirmed');
      driven = retryLeg(advanceLeg(driven, 1, 'failed'), 1, CTX);
      pauseSession(driven, CTX);

      expect(JSON.stringify(session)).toBe(snapshot);
      expect(driven).not.toBe(session);
      expect(driven.legs[0]).not.toBe(session.legs[0]);
    });
  });
});
