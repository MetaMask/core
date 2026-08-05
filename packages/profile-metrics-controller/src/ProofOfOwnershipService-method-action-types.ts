/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProofOfOwnershipService } from './ProofOfOwnershipService.js';

/**
 * Sign a proof of ownership for the given account and server-issued nonce.
 *
 * The returned proof is shaped to drop directly into
 * `AccountWithScopes.proof` for `ProfileMetricsService:submitMetrics`.
 *
 * @param data - The account to prove ownership of and the nonce to bind
 * the proof to.
 * @returns The proof of ownership (nonce echo + signature).
 * @throws {ProofUnsupportedNamespaceError} if the account's first scope
 * carries a namespace this service does not know how to sign for, or if
 * the account has no scopes.
 * @throws if the underlying signer (keyring or snap) rejects, or if the
 * snap returns a malformed response.
 */
export type ProofOfOwnershipServiceSignAction = {
  type: `ProofOfOwnershipService:sign`;
  handler: ProofOfOwnershipService['sign'];
};

/**
 * Union of all ProofOfOwnershipService action types.
 */
export type ProofOfOwnershipServiceMethodActions =
  ProofOfOwnershipServiceSignAction;
