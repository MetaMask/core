import type { NodeAuthTokens } from '@metamask/toprf-secure-backup';

import { SeedlessOnboardingControllerErrorMessage } from '../constants.js';
import { SeedlessOnboardingError } from '../errors.js';
import type { RecoverySession } from '../types.js';
import { decodeJWTToken } from '../utils/index.js';

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
 * @param session - The stored recovery session, if any.
 * @param nowSeconds - The current time in unix seconds.
 * @returns The recovery session, or undefined when it is missing or expired.
 */
export function getValidRecoverySession(
  session: RecoverySession | undefined,
  nowSeconds: number,
): RecoverySession | undefined {
  if (
    !session?.nodeAuthTokens.length ||
    !session.userId ||
    !session.authConnectionId ||
    !session.groupedAuthConnectionId ||
    session.expiresAt <= nowSeconds
  ) {
    return undefined;
  }
  return session;
}
