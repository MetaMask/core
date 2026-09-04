/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MfaRecoveryController } from './MfaRecoveryController.js';

/**
 * Creates version 1 of a recovery record.
 *
 * @param recoverySecret - Secret replicated in full to every escrow.
 * @param identifiers - Ownership-approved identifier set. Must be non-empty.
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
 */
export type MfaRecoveryControllerUpdateRecoverySecretAction = {
  type: `MfaRecoveryController:updateRecoverySecret`;
  handler: MfaRecoveryController['updateRecoverySecret'];
};

/**
 * Replaces the complete identifier set.
 *
 * @param identifier - Currently registered identifier used to authorize.
 * @param identifiers - New non-empty identifier set.
 */
export type MfaRecoveryControllerUpdateIdentifiersAction = {
  type: `MfaRecoveryController:updateIdentifiers`;
  handler: MfaRecoveryController['updateIdentifiers'];
};

/**
 * Reads the recovery secret from available escrows and returns the highest
 * consistent version.
 *
 * @param identifier - Identifier used to authorize the read.
 * @returns Recovered secret bytes.
 */
export type MfaRecoveryControllerGetRecoverySecretAction = {
  type: `MfaRecoveryController:getRecoverySecret`;
  handler: MfaRecoveryController['getRecoverySecret'];
};

/**
 * Completes a persisted pending mutation, if any.
 */
export type MfaRecoveryControllerResumeAction = {
  type: `MfaRecoveryController:resume`;
  handler: MfaRecoveryController['resume'];
};

/**
 * Drops a mutation that has not yet begun writing. Writing mutations must be
 * resumed instead.
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
  | MfaRecoveryControllerGetRecoverySecretAction
  | MfaRecoveryControllerResumeAction
  | MfaRecoveryControllerAbortAction
  | MfaRecoveryControllerGetPhaseAction;
