/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { TokenBalancesController } from './TokenBalancesController';

/**
 * @deprecated This is deprecated and will be removed in a future version. Use `AssetsController` from `@metamask/assets-controller` instead.
 */
export type TokenBalancesControllerGetChainPollingConfigAction = {
  type: `TokenBalancesController:getChainPollingConfig`;
  handler: TokenBalancesController['getChainPollingConfig'];
};

/**
 * @deprecated This is deprecated and will be removed in a future version. Use `AssetsController` from `@metamask/assets-controller` instead.
 */
export type TokenBalancesControllerUpdateChainPollingConfigsAction = {
  type: `TokenBalancesController:updateChainPollingConfigs`;
  handler: TokenBalancesController['updateChainPollingConfigs'];
};

/**
 * @deprecated This is deprecated and will be removed in a future version. Use `AssetsController` from `@metamask/assets-controller` instead.
 */
export type TokenBalancesControllerUpdateBalancesAction = {
  type: `TokenBalancesController:updateBalances`;
  handler: TokenBalancesController['updateBalances'];
};

/**
 * @deprecated This is deprecated and will be removed in a future version. Use `AssetsController` from `@metamask/assets-controller` instead.
 */
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
