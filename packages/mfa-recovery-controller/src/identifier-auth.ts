import { generateSigningKey, hash, sign } from './crypto.js';
import { MfaRecoveryError } from './errors.js';
import { isFulfilledResult } from './escrow-utils.js';
import type {
  Identifier,
  IdentifierAuthMode,
  IdentifierAuthorization,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
} from './types.js';

/**
 * Minimum identifier count for register and updateIdentifiers.
 */
export const MIN_IDENTIFIERS = 2;

/**
 * Trusted identifier-type registry. Escrows and the controller derive the
 * authentication mode from this table, never from a client-selected flag.
 *
 * TODO: MFA-605 / MFA-606 / MFA-568 — add `emailOtp` / `smsOtp` as
 * `escrow-challenge` once escrow OTP commands exist.
 */
export const IDENTIFIER_AUTH_MODES: Record<string, IdentifierAuthMode> = {
  oidc: 'key-bound',
  passkey: 'key-bound',
  siwe: 'key-bound',
};

export type AuthorizedEscrow = {
  escrow: RecoveryEscrowProvider;
  authorization: IdentifierAuthorization;
};

/**
 * Authorizes an identifier with each escrow that successfully provides a
 * challenge.
 *
 * @param params - Identifier authorization parameters.
 * @param params.escrows - Escrows to authorize.
 * @param params.identifier - Identifier to authorize.
 * @param params.requestHash - Request hash bound to the authorization.
 * @param params.identifierAuthProvider - Provider for key-bound assertions.
 * @returns Successful escrow authorizations.
 */
export async function authorizeKeyBoundIdentifier({
  escrows,
  identifier,
  requestHash,
  identifierAuthProvider,
}: {
  escrows: RecoveryEscrowProvider[];
  identifier: Identifier;
  requestHash: string;
  identifierAuthProvider: RecoveryIdentifierAuthProvider;
}): Promise<AuthorizedEscrow[]> {
  const proofKey = generateSigningKey();
  const token = await identifierAuthProvider.getKeyBoundIdentifierToken({
    identifier,
    proofPublicKey: proofKey.publicKey,
    requestHash,
  });
  const challengeResults = await Promise.allSettled(
    escrows.map((escrow) => escrow.generateChallenge()),
  );
  const challenges = challengeResults.flatMap((result, index) =>
    isFulfilledResult(result)
      ? [{ escrow: escrows[index], challenge: result.value }]
      : [],
  );
  const authorizationResults = await Promise.allSettled(
    challenges.map(async ({ escrow, challenge }) => {
      const message = await hash([token, challenge.id, requestHash]);
      return {
        escrow,
        authorization: {
          kind: 'key-bound' as const,
          token,
          proof: {
            challengeId: challenge.id,
            requestHash,
            signature: await sign(proofKey.privateKey, message),
          },
        },
      };
    }),
  );
  return authorizationResults
    .filter(isFulfilledResult)
    .map((result) => result.value);
}

/**
 * Returns the auth mode for an identifier type.
 *
 * @param type - Identifier type.
 * @returns Auth mode.
 * @throws If the type is not in the trusted registry.
 */
export function getIdentifierAuthMode(type: string): IdentifierAuthMode {
  const mode = IDENTIFIER_AUTH_MODES[type];
  if (mode === undefined) {
    throw new MfaRecoveryError(
      `Unknown identifier type: ${type}`,
      'unknown_identifier_type',
    );
  }
  return mode;
}
