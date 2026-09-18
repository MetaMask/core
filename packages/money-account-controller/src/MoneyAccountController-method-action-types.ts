/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountController } from './MoneyAccountController.js';

/**
 * Initializes the controller by creating a money account for the primary
 * entropy source if one does not already exist.
 */
export type MoneyAccountControllerInitAction = {
  type: `MoneyAccountController:init`;
  handler: MoneyAccountController['init'];
};

/**
 * Creates a money account from a Money Keyring (entropy source) or an
 * existing MPC Keyring. If an account already exists for that source, it is
 * returned as-is (idempotent).
 *
 * @param params - The keyring source to create the money account from.
 * @returns The money account.
 */
export type MoneyAccountControllerCreateMoneyAccountAction = {
  type: `MoneyAccountController:createMoneyAccount`;
  handler: MoneyAccountController['createMoneyAccount'];
};

/**
 * Registers an already-built money account. If an account with the same id
 * is already in state, it is returned as-is (idempotent).
 *
 * If no default account is set, the added account becomes the default.
 *
 * @param account - The account to register.
 * @returns The registered money account.
 */
export type MoneyAccountControllerAddMoneyAccountAction = {
  type: `MoneyAccountController:addMoneyAccount`;
  handler: MoneyAccountController['addMoneyAccount'];
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
 * Gets a money account. With no selector, returns the default account.
 *
 * @param selector - Selector options for getting the money account.
 * @param selector.id - The account id to look up.
 * @param selector.entropySource - The entropy source ID of a Money Keyring
 * account. Ignored when `id` is provided.
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
  | MoneyAccountControllerAddMoneyAccountAction
  | MoneyAccountControllerSetDefaultMoneyAccountAction
  | MoneyAccountControllerGetMoneyAccountAction
  | MoneyAccountControllerClearStateAction;
