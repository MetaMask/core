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
 * Sign proofs of ownership for multiple accounts.
 *
 * EVM accounts continue to sign through the keyring one account at a time.
 * Snap-backed accounts are grouped by snap ID and sent through the
 * `signProofOfOwnershipBatch` snap method once per snap.
 *
 * @param data - The account/nonce pairs to prove ownership of.
 * @returns Per-item proof or error results in input order.
 * @throws if a snap batch request rejects, returns a malformed response, or
 * returns a result count/account ordering that does not match the request.
 */
export type ProofOfOwnershipServiceSignBatchAction = {
  type: `ProofOfOwnershipService:signBatch`;
  handler: ProofOfOwnershipService['signBatch'];
};

/**
 * Union of all ProofOfOwnershipService action types.
 */
export type ProofOfOwnershipServiceMethodActions =
  | ProofOfOwnershipServiceSignAction
  | ProofOfOwnershipServiceSignBatchAction;
