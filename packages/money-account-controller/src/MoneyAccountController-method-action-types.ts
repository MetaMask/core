/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountController } from './MoneyAccountController.js';

/**
 * Initializes the controller by creating a money account for the primary
 * entropy source if one does not already exist, and by setting that account
 * as the default if no default is set.
 */
export type MoneyAccountControllerInitAction = {
  type: `MoneyAccountController:init`;
  handler: MoneyAccountController['init'];
};

/**
 * Creates a money account. If an account already exists for the given
 * source, it is returned as-is (idempotent).
 *
 * NOTE: Creating an MPC-backed account may trigger the MPC setup, which can
 * be long-running and require interactive authentication.
 *
 * @param params - The parameters for creating the money account.
 * @returns The money account.
 */
export type MoneyAccountControllerCreateMoneyAccountAction = {
  type: `MoneyAccountController:createMoneyAccount`;
  handler: MoneyAccountController['createMoneyAccount'];
};

/**
 * Sets the default money account.
 *
 * @param id - The id of the money account to use as the default.
 */
export type MoneyAccountControllerSetDefaultMoneyAccountAction = {
  type: `MoneyAccountController:setDefaultMoneyAccount`;
  handler: MoneyAccountController['setDefaultMoneyAccount'];
};

/**
 * Gets a money account by id, by entropy source, the MPC-backed one, or the
 * default one when no selector is provided.
 *
 * @param selector - Selector for getting the money account.
 * @returns The money account, or `undefined` if none matches.
 */
export type MoneyAccountControllerGetMoneyAccountAction = {
  type: `MoneyAccountController:getMoneyAccount`;
  handler: MoneyAccountController['getMoneyAccount'];
};

/**
 * Resets the controller state to its default, removing all money accounts.
 *
 * Intended for use during a full app reset (e.g. when the user wipes all
 * wallet data). Does not interact with the keyring.
 */
export type MoneyAccountControllerClearStateAction = {
  type: `MoneyAccountController:clearState`;
  handler: MoneyAccountController['clearState'];
};

/**
 * Union of all MoneyAccountController action types.
 */
export type MoneyAccountControllerMethodActions =
  | MoneyAccountControllerInitAction
  | MoneyAccountControllerCreateMoneyAccountAction
  | MoneyAccountControllerSetDefaultMoneyAccountAction
  | MoneyAccountControllerGetMoneyAccountAction
  | MoneyAccountControllerClearStateAction;
