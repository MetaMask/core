/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MfaRecoveryController } from './MfaRecoveryController.js';

/**
 * Acquires the per-profile recovery lease. Hold it from the first read
 * through any Auth identifier changes and mutations.
 */
export type MfaRecoveryControllerAcquireLockAction = {
  type: `MfaRecoveryController:acquireLock`;
  handler: MfaRecoveryController['acquireLock'];
};

/**
 * Renews the held lease. Fails if it expired or another operation holds it;
 * then acquire again and reread state.
 */
export type MfaRecoveryControllerRenewLockAction = {
  type: `MfaRecoveryController:renewLock`;
  handler: MfaRecoveryController['renewLock'];
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
 * Authenticates an identifier for a subsequent recovery-secret read.
 *
 * @param identifier - Identifier to authenticate.
 * @returns Ephemeral session data required by {@link getRecoverySecret}.
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
 * Reads the enrolled identifiers from available escrows at the highest
 * consistent version, with Auth's current identifiers. Needs no recent MFA,
 * so a new device can build an {@link updateIdentifiers} call from it.
 *
 * @returns Enrolled identifiers, `epoch`, and Auth's identifiers.
 */
export type MfaRecoveryControllerGetIdentifiersAction = {
  type: `MfaRecoveryController:getIdentifiers`;
  handler: MfaRecoveryController['getIdentifiers'];
};

/**
 * Completes a persisted pending mutation, if any.
 */
export type MfaRecoveryControllerResumeAction = {
  type: `MfaRecoveryController:resume`;
  handler: MfaRecoveryController['resume'];
};

/**
 * Drops `authorizing` pending. `writing` must be finished with {@link resume}.
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
  | MfaRecoveryControllerRenewLockAction
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
