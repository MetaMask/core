/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DelegationController } from './DelegationController';

/**
 * Signs a delegation.
 *
 * @param params - The parameters for signing the delegation.
 * @param params.delegation - The delegation to sign.
 * @param params.chainId - The chainId of the chain to sign the delegation for.
 * @returns The signature of the delegation.
 */
export type DelegationControllerSignDelegationAction = {
  type: `DelegationController:signDelegation`;
  handler: DelegationController['signDelegation'];
};

/**
 * Union of all DelegationController action types.
 */
export type DelegationControllerMethodActions =
  DelegationControllerSignDelegationAction;
