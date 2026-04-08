/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountController } from './MoneyAccountController';

/**
 * Creates a money account for the given entropy source. If an account
 * already exists for that entropy source, it is returned as-is (idempotent).
 *
 * @param entropySource - The entropy source ID to create the money account for.
 * @returns The money account.
 */
export type MoneyAccountControllerCreateMoneyAccountAction = {
  type: `MoneyAccountController:createMoneyAccount`;
  handler: MoneyAccountController['createMoneyAccount'];
};

/**
 * Gets a money account by its associated entropy source ID. If no ID is
 * provided, the primary entropy source will be used.
 *
 * @param selector - Selector options for getting the money account.
 * @param selector.entropySource - The entropy source ID to get the money account for. If not provided, the primary entropy source will be used.
 * @returns The money account, or `undefined` if no account exists for the given entropy source.
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
  | MoneyAccountControllerCreateMoneyAccountAction
  | MoneyAccountControllerGetMoneyAccountAction
  | MoneyAccountControllerClearStateAction;
