import type {
  NodeAuthTokens,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';

import {
  controllerName,
  SeedlessOnboardingControllerErrorMessage,
} from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import type { RecoverySession } from '../types.js';
import { SeedlessOnboardingError } from '../utils/errors.js';
import { decodeJWTToken, isAuthTokenError } from '../utils/index.js';

const log = createModuleLogger(projectLogger, controllerName);

/**
 * The params every recovery verifier TOPRF call takes from the recovery session.
 */
export type RecoveryRequest = {
  nodeAuthTokens: NodeAuthTokens;
  authConnectionId: string;
  groupedAuthConnectionId: string;
  userId: string;
};

/**
 * Options for {@link RecoverySessionManager}.
 */
export type RecoverySessionManagerOptions = {
  getToprfClient: () => ToprfSecureBackup;
  getSession: () => RecoverySession | undefined;
  setSession: (session: RecoverySession) => void;
  clearSession: () => void;
  nowSeconds?: () => number;
};

/**
 * @param aal2Token - The aal2 JWT.
 * @param nowSeconds - The current time in unix seconds.
 * @returns The token's `exp` in unix seconds and its `sub`.
 * @throws `Aal2Required` if the token is malformed, expired or has no `sub`.
 */
export function decodeAal2Token(
  aal2Token: string,
  nowSeconds: number,
): { exp: number; sub: string } {
  let decoded: { exp?: unknown; sub?: unknown };
  try {
    decoded = decodeJWTToken(aal2Token);
  } catch (error) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.Aal2Required,
      { cause: error },
    );
  }
  const { exp, sub } = decoded;
  if (
    typeof exp !== 'number' ||
    exp <= nowSeconds ||
    typeof sub !== 'string' ||
    sub.length === 0
  ) {
    throw new SeedlessOnboardingError(
      SeedlessOnboardingControllerErrorMessage.Aal2Required,
    );
  }
  return { exp, sub };
}

/**
 * Check whether a stored recovery session is complete and unexpired.
 *
 * @param session - The stored recovery session, if any.
 * @param nowSeconds - The current time in unix seconds.
 * @returns `true` if `session` is present, complete, and unexpired.
 */
export function isRecoverySessionValid(
  session: RecoverySession | undefined,
  nowSeconds: number,
): session is RecoverySession {
  return Boolean(
    session?.nodeAuthTokens.length &&
    session.userId &&
    session.authConnectionId &&
    session.groupedAuthConnectionId &&
    session.expiresAt > nowSeconds,
  );
}

/**
 * Manages the lifecycle of the aal2 recovery session: authentication against
 * the recovery verifier, validity checks, executing recovery-verifier TOPRF
 * calls with automatic invalidation on auth-token rejection, and tracking
 * whether a recovery share exists.
 */
export class RecoverySessionManager {
  readonly #getToprfClient: () => ToprfSecureBackup;

  readonly #getSession: () => RecoverySession | undefined;

  readonly #setSession: (session: RecoverySession) => void;

  readonly #clearSession: () => void;

  readonly #nowSeconds: () => number;

  /**
   * @param options - The manager options.
   * @param options.getToprfClient - Returns the current TOPRF client.
   * @param options.getSession - Reads the stored recovery session from state.
   * @param options.setSession - Persists a recovery session to state.
   * @param options.clearSession - Removes the recovery session from state.
   * @param options.nowSeconds - Current time provider in unix seconds.
   */
  constructor({
    getToprfClient,
    getSession,
    setSession,
    clearSession,
    nowSeconds = (): number => Math.floor(Date.now() / 1000),
  }: RecoverySessionManagerOptions) {
    this.#getToprfClient = getToprfClient;
    this.#getSession = getSession;
    this.#setSession = setSession;
    this.#clearSession = clearSession;
    this.#nowSeconds = nowSeconds;
  }

  /**
   * Authenticate on the recovery verifier with the aal2 token and store the
   * resulting recovery session.
   *
   * @param params - The authentication parameters.
   * @param params.aal2Token - The aal2 token minted by the authentication API.
   * @param params.authConnectionId - The recovery sub-verifier ID.
   * @param params.groupedAuthConnectionId - The recovery aggregate verifier ID.
   * @throws `MissingAuthUserInfo` if either verifier ID is empty or not a string.
   * @throws `Aal2Required` if `aal2Token` is malformed, expired, or lacks `sub`.
   * @throws `AuthenticationError` if authenticating against the TOPRF nodes fails.
   */
  async authenticate({
    aal2Token,
    authConnectionId,
    groupedAuthConnectionId,
  }: {
    aal2Token: string;
    authConnectionId: string;
    groupedAuthConnectionId: string;
  }): Promise<void> {
    if (
      typeof authConnectionId !== 'string' ||
      !authConnectionId ||
      typeof groupedAuthConnectionId !== 'string' ||
      !groupedAuthConnectionId
    ) {
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.MissingAuthUserInfo,
      );
    }

    const { exp, sub } = decodeAal2Token(aal2Token, this.#nowSeconds());

    try {
      const { nodeAuthTokens, isNewUser } =
        await this.#getToprfClient().authenticate({
          authConnectionId,
          groupedAuthConnectionId,
          userId: sub,
          idTokens: [aal2Token],
        });
      this.#setSession({
        nodeAuthTokens,
        expiresAt: exp,
        userId: sub,
        authConnectionId,
        groupedAuthConnectionId,
        hasRecoveryShare: !isNewUser,
      });
    } catch (error) {
      log('Error authenticating at aal2', error);
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.AuthenticationError,
        { cause: error },
      );
    }
  }

  /**
   * Return the active recovery session or clear it and throw `Aal2Required`.
   *
   * @returns The active recovery session.
   * @throws `Aal2Required`, after clearing the session, if it is missing or
   * expired. It is never refreshed, because that needs a new aal2 token.
   */
  require(): RecoverySession {
    const session = this.#getSession();
    if (!isRecoverySessionValid(session, this.#nowSeconds())) {
      this.#clearSession();
      throw new SeedlessOnboardingError(
        SeedlessOnboardingControllerErrorMessage.Aal2Required,
      );
    }
    return session;
  }

  /**
   * Run a recovery verifier TOPRF call with the aal2 set. A missing, expired
   * or rejected set is cleared and surfaces as `Aal2Required`.
   *
   * @param operation - The TOPRF call, given the request params.
   * @returns The operation result.
   */
  async withSession<Result>(
    operation: (request: RecoveryRequest) => Promise<Result>,
  ): Promise<Result> {
    const {
      nodeAuthTokens,
      userId,
      authConnectionId,
      groupedAuthConnectionId,
    } = this.require();
    try {
      return await operation({
        nodeAuthTokens,
        authConnectionId,
        groupedAuthConnectionId,
        userId,
      });
    } catch (error) {
      if (isAuthTokenError(error)) {
        this.#clearSession();
        throw new SeedlessOnboardingError(
          SeedlessOnboardingControllerErrorMessage.Aal2Required,
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * Mark `recoverySession.hasRecoveryShare` as `true` once a Recovery Secret
   * OPRF key is confirmed to exist on the recovery verifier.
   */
  markRecoveryShareExists(): void {
    const recoverySession = this.#getSession();
    if (recoverySession && !recoverySession.hasRecoveryShare) {
      this.#setSession({ ...recoverySession, hasRecoveryShare: true });
    }
  }
}
