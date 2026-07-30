/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { TokenBalancesController } from './TokenBalancesController.js';

export type TokenBalancesControllerGetChainPollingConfigAction = {
  type: `TokenBalancesController:getChainPollingConfig`;
  handler: TokenBalancesController['getChainPollingConfig'];
};

export type TokenBalancesControllerUpdateChainPollingConfigsAction = {
  type: `TokenBalancesController:updateChainPollingConfigs`;
  handler: TokenBalancesController['updateChainPollingConfigs'];
};

export type TokenBalancesControllerUpdateBalancesAction = {
  type: `TokenBalancesController:updateBalances`;
  handler: TokenBalancesController['updateBalances'];
};

export type TokenBalancesControllerResetStateAction = {
  type: `TokenBalancesController:resetState`;
  handler: TokenBalancesController['resetState'];
};

/**
 * Union of all TokenBalancesController action types.
 */
export type TokenBalancesControllerMethodActions =
  | TokenBalancesControllerGetChainPollingConfigAction
  | TokenBalancesControllerUpdateChainPollingConfigsAction
  | TokenBalancesControllerUpdateBalancesAction
  | TokenBalancesControllerResetStateAction;
