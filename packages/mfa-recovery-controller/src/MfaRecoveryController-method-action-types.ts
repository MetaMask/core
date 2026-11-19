/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MfaRecoveryController } from './MfaRecoveryController.js';

/**
 * Acquires or extends the per-profile recovery lease. Hold it from the first
 * read through any Auth identifier changes and mutations.
 */
export type MfaRecoveryControllerAcquireLockAction = {
  type: `MfaRecoveryController:acquireLock`;
  handler: MfaRecoveryController['acquireLock'];
};

/**
 * Releases the lease. A pending mutation must finish first.
 */
export type MfaRecoveryControllerReleaseLockAction = {
  type: `MfaRecoveryController:releaseLock`;
  handler: MfaRecoveryController['releaseLock'];
};

/**
 * Creates version 1 of a recovery record.
 *
 * @param recoverySecret - Secret replicated in full to every escrow.
 * @param identifiers - Ownership-approved identifier set. Must contain at
 * least two identifiers.
 */
export type MfaRecoveryControllerRegisterAction = {
  type: `MfaRecoveryController:register`;
  handler: MfaRecoveryController['register'];
};

/**
 * Replaces the recovery secret.
 *
 * @param identifier - Currently registered identifier used to authorize.
 * @param recoverySecret - New secret.
 * @param epoch - Current recovery version, used as `expectedVersion`.
 */
export type MfaRecoveryControllerUpdateRecoverySecretAction = {
  type: `MfaRecoveryController:updateRecoverySecret`;
  handler: MfaRecoveryController['updateRecoverySecret'];
};

/**
 * Replaces the complete identifier set.
 *
 * @param identifier - Currently registered identifier used to authorize.
 * @param identifiers - New identifier set. Must contain at least two
 * identifiers.
 * @param epoch - Current recovery version, used as `expectedVersion`.
 */
export type MfaRecoveryControllerUpdateIdentifiersAction = {
  type: `MfaRecoveryController:updateIdentifiers`;
  handler: MfaRecoveryController['updateIdentifiers'];
};

/**
 * Authenticates an identifier with a single login. Returns an ephemeral
 * {@link IdentifierSession} for {@link getRecoverySecret}. For seedless
 * social logins, the session also carries `seedlessAuthData` for
 * `SeedlessOnboardingController.authenticate`. Callers decide whether they
 * need `seedlessAuthData` (and its `revokeToken`), drop it after seedless
 * authenticate, and keep the key-bound session fields for recovery reads.
 *
 * @param identifier - Identifier to authenticate.
 * @returns Session for recovery reads, with seedless auth data when the
 * login returned it.
 */
export type MfaRecoveryControllerAuthenticateIdentifierAction = {
  type: `MfaRecoveryController:authenticateIdentifier`;
  handler: MfaRecoveryController['authenticateIdentifier'];
};

/**
 * Reads the recovery secret from available escrows and returns the highest
 * consistent version. `epoch` is the current recovery version and is required
 * by later mutations. Does not wait for a pending mutation to be repaired.
 *
 * @param session - Identifier authentication session used to authorize the
 * read.
 * @returns Recovered secret bytes and the selected epoch.
 */
export type MfaRecoveryControllerGetRecoverySecretAction = {
  type: `MfaRecoveryController:getRecoverySecret`;
  handler: MfaRecoveryController['getRecoverySecret'];
};

/**
 * Reads the enrolled identifiers from every escrow, with Auth's current
 * identifiers. Needs no recent MFA, so a new device can build an
 * {@link updateIdentifiers} call from it. Throws `replica_lagging` when
 * escrows are at different versions.
 *
 * @returns Enrolled identifiers, `epoch`, and Auth's identifiers.
 */
export type MfaRecoveryControllerGetIdentifiersAction = {
  type: `MfaRecoveryController:getIdentifiers`;
  handler: MfaRecoveryController['getIdentifiers'];
};

/**
 * Completes a persisted pending mutation. With none pending and an
 * `identifier`, copies the highest escrow record to escrows one version
 * behind it; pass an identifier when a mutation fails with
 * `replica_lagging`. Clears a `writing` mutation, throwing
 * `MutationRejectedError`, once its approval expired more than 5 minutes ago
 * and no escrow applied it.
 *
 * @param identifier - Enrolled identifier that authorizes the repair, or
 * replaces the one authorizing a pending update (e.g. if it was lost).
 */
export type MfaRecoveryControllerResumeAction = {
  type: `MfaRecoveryController:resume`;
  handler: MfaRecoveryController['resume'];
};

/**
 * Drops `authorizing` pending. Drops `writing` pending only once its approval
 * expired more than 5 minutes ago and no escrow applied it; otherwise finish
 * it with {@link resume}.
 */
export type MfaRecoveryControllerAbortAction = {
  type: `MfaRecoveryController:abort`;
  handler: MfaRecoveryController['abort'];
};

/**
 * @returns Current recovery phase.
 */
export type MfaRecoveryControllerGetPhaseAction = {
  type: `MfaRecoveryController:getPhase`;
  handler: MfaRecoveryController['getPhase'];
};

/**
 * Union of all MfaRecoveryController action types.
 */
export type MfaRecoveryControllerMethodActions =
  | MfaRecoveryControllerAcquireLockAction
  | MfaRecoveryControllerReleaseLockAction
  | MfaRecoveryControllerRegisterAction
  | MfaRecoveryControllerUpdateRecoverySecretAction
  | MfaRecoveryControllerUpdateIdentifiersAction
  | MfaRecoveryControllerAuthenticateIdentifierAction
  | MfaRecoveryControllerGetRecoverySecretAction
  | MfaRecoveryControllerGetIdentifiersAction
  | MfaRecoveryControllerResumeAction
  | MfaRecoveryControllerAbortAction
  | MfaRecoveryControllerGetPhaseAction;
