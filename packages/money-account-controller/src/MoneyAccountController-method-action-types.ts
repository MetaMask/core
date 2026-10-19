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
 * The parameters determine the backing keyring:
 * - `{ type: 'mpc' }`: the MPC Money keyring (MFA account), which is created and
 * initialized if it does not exist yet.
 * - `{ type?: 'mnemonic', entropySource }` (the default): the `MoneyKeyring`
 * for that entropy source (SFA account), which is created if it does not
 * exist yet.
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
 * Gets a money account by id, by entropy source, or the default one.
 *
 * @param selector - Selector options for getting the money account.
 * @param selector.id - The account id to look up. Takes precedence over `entropySource`.
 * @param selector.entropySource - The entropy source ID to get the money account for.
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
 * wallet data). Does not interact with the keyring — the caller is
 * responsible for ensuring the associated keyring state is also cleared.
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
