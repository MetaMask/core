import type { NodeAuthTokens } from '@metamask/toprf-secure-backup';
import { describe, expect, it } from 'vitest';

import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import { SeedlessOnboardingError } from '../errors.js';
import type { RecoverySession } from '../types.js';
import {
  decodeAal2Token,
  getValidRecoverySession,
} from './recovery-session.js';

const NOW_SECONDS = 1_700_000_000;

const NODE_AUTH_TOKENS: NodeAuthTokens = [
  { authToken: 'aal2Token1', nodeIndex: 1, nodePubKey: 'nodePubKey' },
];

/**
 * Build an unsigned JWT with the given raw payload object.
 *
 * @param payload - The payload to encode as-is.
 * @returns The JWT string.
 */
function createRawJwt(payload: unknown): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = Buffer.from(JSON.stringify(payload));
  return `${header.toString('base64')}.${body.toString('base64')}.signature`;
}

/**
 * Build a valid recovery session, overridable per field.
 *
 * @param overrides - The fields to override.
 * @returns The recovery session.
 */
function createSession(
  overrides: Partial<RecoverySession> = {},
): RecoverySession {
  return {
    nodeAuthTokens: NODE_AUTH_TOKENS,
    expiresAt: NOW_SECONDS + 600,
    userId: 'user-id',
    authConnectionId: 'mm-recovery-dev-aal2-common',
    groupedAuthConnectionId: 'mm-recovery-aal2-dev',
    hasRecoveryShare: true,
    ...overrides,
  };
}

describe('recovery-session', () => {
  describe('decodeAal2Token', () => {
    it('returns the exp and sub of a valid token', () => {
      const token = createRawJwt({ exp: NOW_SECONDS + 60, sub: 'profile-id' });

      expect(decodeAal2Token(token, NOW_SECONDS)).toStrictEqual({
        exp: NOW_SECONDS + 60,
        sub: 'profile-id',
      });
    });

    it('throws Aal2Required with the cause for a malformed token', () => {
      let caught: unknown;
      try {
        decodeAal2Token('not-a-jwt', NOW_SECONDS);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(SeedlessOnboardingError);
      expect((caught as SeedlessOnboardingError).message).toBe(
        SeedlessOnboardingControllerErrorMessage.Aal2Required,
      );
      expect((caught as SeedlessOnboardingError).cause).toBeInstanceOf(Error);
    });

    it('throws Aal2Required for an expired token', () => {
      const token = createRawJwt({ exp: NOW_SECONDS, sub: 'profile-id' });

      expect(() => decodeAal2Token(token, NOW_SECONDS)).toThrow(
        SeedlessOnboardingControllerErrorMessage.Aal2Required,
      );
    });

    it('throws Aal2Required when exp is not a number', () => {
      const token = createRawJwt({ exp: '123', sub: 'profile-id' });

      expect(() => decodeAal2Token(token, NOW_SECONDS)).toThrow(
        SeedlessOnboardingControllerErrorMessage.Aal2Required,
      );
    });

    it('throws Aal2Required when sub is missing', () => {
      const token = createRawJwt({ exp: NOW_SECONDS + 60 });

      expect(() => decodeAal2Token(token, NOW_SECONDS)).toThrow(
        SeedlessOnboardingControllerErrorMessage.Aal2Required,
      );
    });

    it('throws Aal2Required when sub is empty', () => {
      const token = createRawJwt({ exp: NOW_SECONDS + 60, sub: '' });

      expect(() => decodeAal2Token(token, NOW_SECONDS)).toThrow(
        SeedlessOnboardingControllerErrorMessage.Aal2Required,
      );
    });
  });

  describe('getValidRecoverySession', () => {
    it('returns the same session when it is valid', () => {
      const session = createSession();

      expect(getValidRecoverySession(session, NOW_SECONDS)).toBe(session);
    });

    it('returns undefined when there is no session', () => {
      expect(getValidRecoverySession(undefined, NOW_SECONDS)).toBeUndefined();
    });

    it('returns undefined when nodeAuthTokens is empty', () => {
      const session = createSession({ nodeAuthTokens: [] });

      expect(getValidRecoverySession(session, NOW_SECONDS)).toBeUndefined();
    });

    it('returns undefined when userId is missing', () => {
      const session = createSession({ userId: '' });

      expect(getValidRecoverySession(session, NOW_SECONDS)).toBeUndefined();
    });

    it('returns undefined when authConnectionId is missing', () => {
      const session = createSession({ authConnectionId: '' });

      expect(getValidRecoverySession(session, NOW_SECONDS)).toBeUndefined();
    });

    it('returns undefined when groupedAuthConnectionId is missing', () => {
      const session = createSession({ groupedAuthConnectionId: '' });

      expect(getValidRecoverySession(session, NOW_SECONDS)).toBeUndefined();
    });

    it('returns undefined when the session has expired', () => {
      const session = createSession({ expiresAt: NOW_SECONDS });

      expect(getValidRecoverySession(session, NOW_SECONDS)).toBeUndefined();
    });
  });
});
