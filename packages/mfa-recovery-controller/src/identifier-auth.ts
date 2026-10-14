import { generateSigningKey, hash, sign } from './crypto.js';
import { MfaRecoveryError } from './errors.js';
import { isFulfilledResult } from './escrow-utils.js';
import type {
  Identifier,
  IdentifierAuthMode,
  IdentifierAuthorization,
  KeyBoundCredential,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
} from './types.js';
import { withTimeout } from './with-timeout.js';

/**
 * Minimum identifier count for register and updateIdentifiers.
 */
export const MIN_IDENTIFIERS = 2;

/**
 * Distinct identifier identities (`type` + `namespace` + `value`).
 *
 * @param identifiers - Identifier list.
 * @returns Distinct identity count.
 */
export function countDistinctIdentifiers(identifiers: Identifier[]): number {
  return new Set(
    identifiers.map(
      ({ type, namespace, value }) => `${type}\0${namespace}\0${value}`,
    ),
  ).size;
}

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
 * Requests a key-bound identifier token and returns the private key used to
 * prove possession of it.
 *
 * @param params - Identifier authorization parameters.
 * @param params.identifier - Identifier to authenticate.
 * @param params.requestHash - Request hash bound to the authorization.
 * @param params.identifierAuthProvider - Provider for key-bound assertions.
 * @param params.signal - Optional parent cancellation signal.
 * @param params.timeoutMs - Maximum time to wait for the identifier provider.
 * @returns Key-bound identifier token and its proof private key.
 */
export async function requestKeyBoundIdentifierToken({
  identifier,
  requestHash,
  identifierAuthProvider,
  signal,
  timeoutMs,
}: {
  identifier: Identifier;
  requestHash: string;
  identifierAuthProvider: RecoveryIdentifierAuthProvider;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<KeyBoundCredential> {
  const proofKey = generateSigningKey();
  const token = await withTimeout(
    (childSignal) =>
      identifierAuthProvider.getKeyBoundIdentifierToken({
        identifier,
        proofPublicKey: proofKey.publicKey,
        requestHash,
        signal: childSignal,
      }),
    { ms: timeoutMs, signal, kind: 'prompt' },
  );
  return { token, proofPrivateKey: proofKey.privateKey };
}

/**
 * Presents a key-bound credential to each escrow that provides a challenge.
 *
 * @param params - Escrow authorization parameters.
 * @param params.escrows - Escrows to authorize.
 * @param params.credential - Key-bound identifier credential.
 * @param params.signal - Optional parent cancellation signal.
 * @param params.timeoutMs - Maximum time to wait for escrow challenges.
 * @returns Successful escrow authorizations.
 */
export async function authorizeEscrowsWithToken({
  escrows,
  credential,
  signal,
  timeoutMs,
}: {
  escrows: RecoveryEscrowProvider[];
  credential: KeyBoundCredential;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<AuthorizedEscrow[]> {
  const { token, proofPrivateKey } = credential;
  const challengeResults = await Promise.allSettled(
    escrows.map((escrow) =>
      withTimeout(
        (childSignal) => escrow.generateChallenge({ signal: childSignal }),
        { ms: timeoutMs, signal, kind: 'request' },
      ),
    ),
  );
  throwIfOperationAborted(signal, challengeResults);
  const challenges = challengeResults.flatMap((result, index) =>
    isFulfilledResult(result)
      ? [{ escrow: escrows[index], challenge: result.value }]
      : [],
  );
  const authorizationResults = await Promise.allSettled(
    challenges.map(async ({ escrow, challenge }) => {
      const message = hash([token, challenge.id, token.requestHash]);
      return {
        escrow,
        authorization: {
          kind: 'key-bound' as const,
          token,
          proof: {
            challengeId: challenge.id,
            requestHash: token.requestHash,
            signature: sign(proofPrivateKey, message),
          },
        },
      };
    }),
  );
  return authorizationResults
    .filter(isFulfilledResult)
    .map((result) => result.value);
}

function throwIfOperationAborted(
  signal: AbortSignal | undefined,
  results: PromiseSettledResult<unknown>[],
): void {
  if (signal?.aborted) {
    throw new MfaRecoveryError('Operation aborted', 'operation_aborted');
  }
  for (const result of results) {
    if (
      result.status === 'rejected' &&
      result.reason instanceof MfaRecoveryError &&
      result.reason.code === 'operation_aborted'
    ) {
      throw result.reason;
    }
  }
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
