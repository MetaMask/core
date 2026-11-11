/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MfaRecoveryController } from './MfaRecoveryController.js';

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
 * `session` for {@link getRecoverySecret} and, for seedless social logins,
 * `seedlessAuthData` for `SeedlessOnboardingController.authenticate`.
 * Callers decide whether they need `seedlessAuthData` (and its
 * `revokeToken`), drop it after seedless authenticate, and keep only
 * `session` for recovery reads.
 *
 * @param identifier - Identifier to authenticate.
 * @returns Session for recovery reads, plus seedless auth data when the
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
 * Completes a persisted pending mutation, if any. Clears a `writing` one,
 * throwing `MutationRejectedError`, once its approval has expired and no
 * escrow applied it.
 */
export type MfaRecoveryControllerResumeAction = {
  type: `MfaRecoveryController:resume`;
  handler: MfaRecoveryController['resume'];
};

/**
 * Drops `authorizing` pending. Drops `writing` pending only once its approval
 * has expired and no escrow applied it; otherwise finish it with
 * {@link resume}.
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
  | MfaRecoveryControllerRegisterAction
  | MfaRecoveryControllerUpdateRecoverySecretAction
  | MfaRecoveryControllerUpdateIdentifiersAction
  | MfaRecoveryControllerAuthenticateIdentifierAction
  | MfaRecoveryControllerGetRecoverySecretAction
  | MfaRecoveryControllerGetIdentifiersAction
  | MfaRecoveryControllerResumeAction
  | MfaRecoveryControllerAbortAction
  | MfaRecoveryControllerGetPhaseAction;
