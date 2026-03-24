/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ShieldController } from './ShieldController';

/**
 * Start the ShieldController and subscribe to the transaction and signature controller state changes.
 */
export type ShieldControllerStartAction = {
  type: `ShieldController:start`;
  handler: ShieldController['start'];
};

/**
 * Stop the ShieldController and unsubscribe from the transaction and signature controller state changes.
 */
export type ShieldControllerStopAction = {
  type: `ShieldController:stop`;
  handler: ShieldController['stop'];
};

/**
 * Clears the shield state and resets to default values.
 */
export type ShieldControllerClearStateAction = {
  type: `ShieldController:clearState`;
  handler: ShieldController['clearState'];
};

/**
 * Checks the coverage of a transaction.
 *
 * @param txMeta - The transaction to check coverage for.
 * @returns The coverage result.
 */
export type ShieldControllerCheckCoverageAction = {
  type: `ShieldController:checkCoverage`;
  handler: ShieldController['checkCoverage'];
};

/**
 * Checks the coverage of a signature request.
 *
 * @param signatureRequest - The signature request to check coverage for.
 * @returns The coverage result.
 */
export type ShieldControllerCheckSignatureCoverageAction = {
  type: `ShieldController:checkSignatureCoverage`;
  handler: ShieldController['checkSignatureCoverage'];
};

/**
 * Union of all ShieldController action types.
 */
export type ShieldControllerMethodActions =
  | ShieldControllerStartAction
  | ShieldControllerStopAction
  | ShieldControllerClearStateAction
  | ShieldControllerCheckCoverageAction
  | ShieldControllerCheckSignatureCoverageAction;
