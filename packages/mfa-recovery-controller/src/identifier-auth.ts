import {
  AUTH_CONNECTION_BY_NAMESPACE,
  parseSeedlessAuthData,
} from '@metamask/seedless-onboarding-controller';
import type {
  AuthConnection,
  SeedlessAuthData,
} from '@metamask/seedless-onboarding-controller';
import { areUint8ArraysEqual } from '@metamask/utils';

import { generateSigningKey, hash, sign } from './crypto.js';
import { MfaRecoveryError } from './errors.js';
import { isFulfilledResult } from './escrow-utils.js';
import type {
  AuthControllerToken,
  Identifier,
  IdentifierAuthMode,
  IdentifierAuthorization,
  KeyBoundCredential,
  KeyBoundIdentifierLogin,
  KeyBoundIdentifierToken,
  RecoveryEscrowProvider,
  RecoveryIdentifierAuthProvider,
} from './types.js';

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
  social: 'key-bound',
  passkey: 'key-bound',
  siwe: 'key-bound',
};

export type AuthorizedEscrow = {
  escrow: RecoveryEscrowProvider;
  authorization: IdentifierAuthorization;
};

/**
 * Logs in an identifier with a fresh proof key and checks the returned token
 * is bound to the request. Returns everything the provider issued; callers
 * use only the parts they need. An empty request `identifier.value` may bind
 * to the subject the provider discovers (see metamask-mobile OIDC identifier
 * provider).
 *
 * @param params - Identifier login parameters.
 * @param params.identifier - Identifier to log in.
 * @param params.requestHash - Request hash bound to the token.
 * @param params.identifierAuthProvider - Provider for key-bound assertions.
 * @returns Key-bound credential and the unvalidated seedless auth data, if
 * the provider returned any.
 * @throws If the returned token is not bound to this identifier and request.
 */
export async function requestIdentifierLogin({
  identifier,
  requestHash,
  identifierAuthProvider,
}: {
  identifier: Identifier;
  requestHash: string;
  identifierAuthProvider: RecoveryIdentifierAuthProvider;
}): Promise<KeyBoundCredential & { seedlessAuthData?: unknown }> {
  const proofKey = await generateSigningKey();
  const login: Partial<KeyBoundIdentifierLogin> | null | undefined =
    await identifierAuthProvider.getKeyBoundIdentifierLogin({
      identifier,
      proofPublicKey: proofKey.publicKey,
      requestHash,
    });
  const token: unknown = login?.token;
  if (
    !login ||
    !isTokenBoundToRequest(token, identifier, proofKey.publicKey, requestHash)
  ) {
    throwInvalidIdentifierToken();
  }
  return {
    token,
    proofPrivateKey: proofKey.privateKey,
    seedlessAuthData: login.seedlessAuthData,
  };
}

/**
 * @param token - Token returned by the identifier provider.
 * @param identifier - Identifier the provider was asked to authenticate.
 * @param proofPublicKey - Proof public key sent to the provider.
 * @param requestHash - Request hash sent to the provider.
 * @returns Whether the token is bound to the identifier, proof key, and
 * request. An empty request `value` binds to any non-empty token `value`.
 */
function isTokenBoundToRequest(
  token: unknown,
  identifier: Identifier,
  proofPublicKey: Uint8Array,
  requestHash: string,
): token is KeyBoundIdentifierToken {
  if (typeof token !== 'object' || token === null) {
    return false;
  }
  const candidate = token as Partial<KeyBoundIdentifierToken>;
  const tokenIdentifier = candidate.identifier;
  if (
    candidate.requestHash !== requestHash ||
    !(candidate.proofPublicKey instanceof Uint8Array) ||
    !areUint8ArraysEqual(candidate.proofPublicKey, proofPublicKey) ||
    tokenIdentifier === undefined ||
    tokenIdentifier.type !== identifier.type ||
    tokenIdentifier.namespace !== identifier.namespace
  ) {
    return false;
  }
  if (identifier.value === '') {
    return tokenIdentifier.value.length > 0;
  }
  return tokenIdentifier.value === identifier.value;
}

/**
 * Expected seedless `authConnection` for a social identifier, if known.
 *
 * @param identifier - Authenticated identifier.
 * @returns Matching connection, or `undefined` when the identifier is not a
 * known social issuer.
 */
export function expectedSeedlessAuthConnection(
  identifier: Identifier,
): AuthConnection | undefined {
  if (identifier.type !== 'social') {
    return undefined;
  }
  return AUTH_CONNECTION_BY_NAMESPACE[identifier.namespace];
}

/**
 * Validates seedless auth data shape, strips unknown fields, and checks that
 * `authConnection` matches the expected provider for the authenticated social
 * identifier's issuer namespace. It does not verify that tokens belong to the
 * same subject / `userId` as the identifier value.
 *
 * @param data - Provider-returned seedless auth data.
 * @param identifier - Identifier that was authenticated.
 * @returns Documented seedless auth data fields only.
 */
export function validateSeedlessAuthData(
  data: unknown,
  identifier: Identifier,
): SeedlessAuthData {
  const seedlessAuthData = parseSeedlessAuthData(data);
  if (seedlessAuthData === undefined) {
    throw new MfaRecoveryError(
      'Incomplete seedless auth data',
      'invalid_seedless_auth_data',
    );
  }
  const expectedConnection = expectedSeedlessAuthConnection(identifier);
  if (
    expectedConnection === undefined ||
    seedlessAuthData.authConnection !== expectedConnection
  ) {
    throw new MfaRecoveryError(
      'Seedless auth data does not match the authenticated identifier',
      'invalid_seedless_auth_data',
    );
  }
  return seedlessAuthData;
}

function throwInvalidIdentifierToken(): never {
  throw new MfaRecoveryError(
    'Identifier token is not bound to this request',
    'invalid_identifier_token',
  );
}

/**
 * Presents a key-bound credential to each escrow that provides a challenge.
 *
 * @param params - Escrow authorization parameters.
 * @param params.escrows - Escrows to authorize.
 * @param params.credential - Key-bound identifier credential.
 * @param params.authControllerToken - Approval each escrow keys its challenge
 * to.
 * @returns Successful escrow authorizations.
 */
export async function authorizeEscrowsWithToken({
  escrows,
  credential,
  authControllerToken,
}: {
  escrows: RecoveryEscrowProvider[];
  credential: KeyBoundCredential;
  authControllerToken: AuthControllerToken;
}): Promise<AuthorizedEscrow[]> {
  const { token, proofPrivateKey } = credential;
  const challengeResults = await Promise.allSettled(
    escrows.map((escrow) => escrow.generateChallenge(authControllerToken)),
  );
  const challenges = challengeResults.flatMap((result, index) =>
    isFulfilledResult(result)
      ? [{ escrow: escrows[index], challenge: result.value }]
      : [],
  );
  const authorizationResults = await Promise.allSettled(
    challenges.map(async ({ escrow, challenge }) => {
      const message = await hash([token, challenge.id, token.requestHash]);
      return {
        escrow,
        authorization: {
          kind: 'key-bound' as const,
          token,
          proof: {
            challengeId: challenge.id,
            requestHash: token.requestHash,
            signature: await sign(proofPrivateKey, message),
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
