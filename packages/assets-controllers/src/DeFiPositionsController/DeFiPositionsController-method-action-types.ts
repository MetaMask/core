/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DeFiPositionsController } from './DeFiPositionsController.js';

export type DeFiPositionsControllerStartPollingAction = {
  type: `DeFiPositionsController:startPolling`;
  handler: DeFiPositionsController['startPolling'];
};

export type DeFiPositionsControllerStopPollingByPollingTokenAction = {
  type: `DeFiPositionsController:stopPollingByPollingToken`;
  handler: DeFiPositionsController['stopPollingByPollingToken'];
};

/**
 * Union of all DeFiPositionsController action types.
 */
export type DeFiPositionsControllerMethodActions =
  | DeFiPositionsControllerStartPollingAction
  | DeFiPositionsControllerStopPollingByPollingTokenAction;
