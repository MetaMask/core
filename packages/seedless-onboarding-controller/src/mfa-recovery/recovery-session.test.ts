import type {
  NodeAuthTokens,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { TOPRFError, TOPRFErrorCode } from '@metamask/toprf-secure-backup';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import type { RecoverySession } from '../types.js';
import { SeedlessOnboardingError } from '../utils/errors.js';
import {
  decodeAal2Token,
  isRecoverySessionValid,
  RecoverySessionManager,
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
  return `${header.toString('base64url')}.${body.toString('base64url')}.signature`;
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

/**
 * Build a `RecoverySessionManager` backed by an in-memory session slot and
 * mock TOPRF client.
 *
 * @param options - Initial state and clock overrides.
 * @param options.initialSession - The initial stored session, if any.
 * @param options.nowSeconds - Current time provider in unix seconds.
 * @returns The manager, state helpers, and mock spies.
 */
function createManager({
  initialSession,
  nowSeconds = (): number => NOW_SECONDS,
}: {
  initialSession?: RecoverySession;
  nowSeconds?: () => number;
} = {}): {
  manager: RecoverySessionManager;
  authenticate: Mock;
  setSession: Mock;
  clearSession: Mock;
  getSession: () => RecoverySession | undefined;
} {
  let session = initialSession;
  const authenticate = vi.fn().mockResolvedValue({
    nodeAuthTokens: NODE_AUTH_TOKENS,
    isNewUser: false,
  });
  const toprfClient = { authenticate } as unknown as ToprfSecureBackup;
  const setSession = vi.fn((next: RecoverySession) => {
    session = next;
  });
  const clearSession = vi.fn(() => {
    session = undefined;
  });
  const manager = new RecoverySessionManager({
    getToprfClient: (): ToprfSecureBackup => toprfClient,
    getSession: (): RecoverySession | undefined => session,
    setSession,
    clearSession,
    nowSeconds,
  });

  return {
    manager,
    authenticate,
    setSession,
    clearSession,
    getSession: (): RecoverySession | undefined => session,
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

    it('decodes base64url payloads containing - and _ characters', () => {
      const token = createRawJwt({
        exp: NOW_SECONDS + 60,
        sub: 'profile>>>???',
      });
      const payload = token.split('.')[1];
      expect(payload).toContain('-');
      expect(payload).toContain('_');

      expect(decodeAal2Token(token, NOW_SECONDS)).toStrictEqual({
        exp: NOW_SECONDS + 60,
        sub: 'profile>>>???',
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

  describe('isRecoverySessionValid', () => {
    it('returns true when the session is valid', () => {
      expect(isRecoverySessionValid(createSession(), NOW_SECONDS)).toBe(true);
    });

    it('returns false when there is no session', () => {
      expect(isRecoverySessionValid(undefined, NOW_SECONDS)).toBe(false);
    });

    it('returns false when nodeAuthTokens is empty', () => {
      expect(
        isRecoverySessionValid(
          createSession({ nodeAuthTokens: [] }),
          NOW_SECONDS,
        ),
      ).toBe(false);
    });

    it('returns false when userId is missing', () => {
      expect(
        isRecoverySessionValid(createSession({ userId: '' }), NOW_SECONDS),
      ).toBe(false);
    });

    it('returns false when authConnectionId is missing', () => {
      expect(
        isRecoverySessionValid(
          createSession({ authConnectionId: '' }),
          NOW_SECONDS,
        ),
      ).toBe(false);
    });

    it('returns false when groupedAuthConnectionId is missing', () => {
      expect(
        isRecoverySessionValid(
          createSession({ groupedAuthConnectionId: '' }),
          NOW_SECONDS,
        ),
      ).toBe(false);
    });

    it('returns false when the session has expired', () => {
      expect(
        isRecoverySessionValid(
          createSession({ expiresAt: NOW_SECONDS }),
          NOW_SECONDS,
        ),
      ).toBe(false);
    });
  });

  describe('RecoverySessionManager', () => {
    describe('authenticate', () => {
      it('authenticates on the recovery verifier and stores the session', async () => {
        const { manager, authenticate, getSession } = createManager();
        const aal2Token = createRawJwt({
          exp: NOW_SECONDS + 300,
          sub: 'profile-id',
        });

        await manager.authenticate({
          aal2Token,
          authConnectionId: 'mm-recovery-dev-aal2-common',
          groupedAuthConnectionId: 'mm-recovery-aal2-dev',
        });

        expect(authenticate).toHaveBeenCalledWith({
          authConnectionId: 'mm-recovery-dev-aal2-common',
          groupedAuthConnectionId: 'mm-recovery-aal2-dev',
          userId: 'profile-id',
          idTokens: [aal2Token],
        });
        expect(getSession()).toStrictEqual({
          nodeAuthTokens: NODE_AUTH_TOKENS,
          expiresAt: NOW_SECONDS + 300,
          userId: 'profile-id',
          authConnectionId: 'mm-recovery-dev-aal2-common',
          groupedAuthConnectionId: 'mm-recovery-aal2-dev',
          hasRecoveryShare: true,
        });
      });

      it('sets hasRecoveryShare to false for a new user', async () => {
        const { manager, authenticate, getSession } = createManager();
        authenticate.mockResolvedValueOnce({
          nodeAuthTokens: NODE_AUTH_TOKENS,
          isNewUser: true,
        });

        await manager.authenticate({
          aal2Token: createRawJwt({
            exp: NOW_SECONDS + 300,
            sub: 'profile-id',
          }),
          authConnectionId: 'mm-recovery-dev-aal2-common',
          groupedAuthConnectionId: 'mm-recovery-aal2-dev',
        });

        expect(getSession()?.hasRecoveryShare).toBe(false);
      });

      it.each([
        ['empty authConnectionId', { authConnectionId: '' }],
        [
          'non-string authConnectionId',
          { authConnectionId: undefined as unknown as string },
        ],
        ['empty groupedAuthConnectionId', { groupedAuthConnectionId: '' }],
        [
          'non-string groupedAuthConnectionId',
          { groupedAuthConnectionId: undefined as unknown as string },
        ],
      ])('throws MissingAuthUserInfo for %s', async (_label, overrides) => {
        const { manager, authenticate } = createManager();

        await expect(
          manager.authenticate({
            aal2Token: createRawJwt({
              exp: NOW_SECONDS + 300,
              sub: 'profile-id',
            }),
            authConnectionId: 'mm-recovery-dev-aal2-common',
            groupedAuthConnectionId: 'mm-recovery-aal2-dev',
            ...overrides,
          }),
        ).rejects.toThrow(
          SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
        );
        expect(authenticate).not.toHaveBeenCalled();
      });

      it('throws Aal2Required when the token is invalid', async () => {
        const { manager, authenticate } = createManager();

        await expect(
          manager.authenticate({
            aal2Token: 'bad-token',
            authConnectionId: 'mm-recovery-dev-aal2-common',
            groupedAuthConnectionId: 'mm-recovery-aal2-dev',
          }),
        ).rejects.toThrow(
          SeedlessOnboardingControllerErrorMessage.Aal2Required,
        );
        expect(authenticate).not.toHaveBeenCalled();
      });

      it('wraps toprfClient.authenticate failures in AuthenticationError', async () => {
        const { manager, authenticate, getSession } = createManager();
        const cause = new Error('network down');
        authenticate.mockRejectedValueOnce(cause);

        let caught: unknown;
        try {
          await manager.authenticate({
            aal2Token: createRawJwt({
              exp: NOW_SECONDS + 300,
              sub: 'profile-id',
            }),
            authConnectionId: 'mm-recovery-dev-aal2-common',
            groupedAuthConnectionId: 'mm-recovery-aal2-dev',
          });
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(SeedlessOnboardingError);
        expect((caught as SeedlessOnboardingError).message).toBe(
          SeedlessOnboardingControllerErrorMessage.AuthenticationError,
        );
        expect((caught as SeedlessOnboardingError).cause).toBe(cause);
        expect(getSession()).toBeUndefined();
      });
    });

    describe('require', () => {
      it('returns the current session when valid', () => {
        const session = createSession();
        const { manager, clearSession } = createManager({
          initialSession: session,
        });

        expect(manager.require()).toBe(session);
        expect(clearSession).not.toHaveBeenCalled();
      });

      it('clears the session and throws Aal2Required when missing or expired', () => {
        const { manager, clearSession } = createManager({
          initialSession: createSession({ expiresAt: NOW_SECONDS }),
        });

        expect(() => manager.require()).toThrow(
          SeedlessOnboardingControllerErrorMessage.Aal2Required,
        );
        expect(clearSession).toHaveBeenCalledTimes(1);
      });
    });

    describe('withSession', () => {
      it('passes the recovery request to the operation and returns its result', async () => {
        const { manager } = createManager({ initialSession: createSession() });
        const operation = vi.fn().mockResolvedValue('ok');

        const result = await manager.withSession(operation);

        expect(result).toBe('ok');
        expect(operation).toHaveBeenCalledWith({
          nodeAuthTokens: NODE_AUTH_TOKENS,
          authConnectionId: 'mm-recovery-dev-aal2-common',
          groupedAuthConnectionId: 'mm-recovery-aal2-dev',
          userId: 'user-id',
        });
      });

      it('clears the session and throws Aal2Required on auth token errors', async () => {
        const { manager, clearSession, getSession } = createManager({
          initialSession: createSession(),
        });
        const authError = new TOPRFError(
          TOPRFErrorCode.AuthTokenExpired,
          'expired',
        );

        let caught: unknown;
        try {
          await manager.withSession(async () => {
            throw authError;
          });
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(SeedlessOnboardingError);
        expect((caught as SeedlessOnboardingError).message).toBe(
          SeedlessOnboardingControllerErrorMessage.Aal2Required,
        );
        expect((caught as SeedlessOnboardingError).cause).toBe(authError);
        expect(clearSession).toHaveBeenCalledTimes(1);
        expect(getSession()).toBeUndefined();
      });

      it('rethrows non-auth errors without clearing the session', async () => {
        const { manager, clearSession } = createManager({
          initialSession: createSession(),
        });
        const otherError = new Error('transient');

        await expect(
          manager.withSession(async () => {
            throw otherError;
          }),
        ).rejects.toBe(otherError);
        expect(clearSession).not.toHaveBeenCalled();
      });
    });

    describe('markRecoveryShareExists', () => {
      it('updates hasRecoveryShare to true when it was false', () => {
        const { manager, setSession, getSession } = createManager({
          initialSession: createSession({ hasRecoveryShare: false }),
        });

        manager.markRecoveryShareExists();

        expect(setSession).toHaveBeenCalledTimes(1);
        expect(getSession()?.hasRecoveryShare).toBe(true);
      });

      it('does not update state when hasRecoveryShare is already true', () => {
        const { manager, setSession } = createManager({
          initialSession: createSession({ hasRecoveryShare: true }),
        });

        manager.markRecoveryShareExists();

        expect(setSession).not.toHaveBeenCalled();
      });

      it('does nothing when there is no session', () => {
        const { manager, setSession, clearSession, getSession } =
          createManager();

        manager.markRecoveryShareExists();

        expect(setSession).not.toHaveBeenCalled();
        expect(clearSession).not.toHaveBeenCalled();
        expect(getSession()).toBeUndefined();
      });

      it('updates hasRecoveryShare without throwing when the session has expired', () => {
        const { manager, setSession, clearSession, getSession } = createManager(
          {
            initialSession: createSession({
              hasRecoveryShare: false,
              expiresAt: NOW_SECONDS,
            }),
          },
        );

        manager.markRecoveryShareExists();

        expect(clearSession).not.toHaveBeenCalled();
        expect(setSession).toHaveBeenCalledTimes(1);
        expect(getSession()?.hasRecoveryShare).toBe(true);
      });
    });
  });
});
