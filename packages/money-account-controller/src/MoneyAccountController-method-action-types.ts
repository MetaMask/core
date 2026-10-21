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
 * - `{ type: 'mpc' }`: the MPC Money keyring (MFA account), which is
 * registered if it does not exist yet (its constructor parameters are
 * captured by the keyring builder that the client registers). When the
 * keyring has no account yet, the MPC setup is triggered to create it,
 * inferring the mode from the backend — import when the profile already
 * has a key share or backup, create otherwise — which may require
 * interactive authentication via the client-captured callbacks and can be
 * long-running.
 * - `{ type: 'mnemonic', entropySource? }`: the `MoneyKeyring` for that
 * entropy source (SFA account), defaulting to the primary HD keyring's
 * entropy source, which is created if it does not exist yet.
 *
 * NOTE: Both paths use the V2 keyring wrappers, so V2 builders must be
 * registered with the `KeyringController` for the `Money Keyring` and
 * `MPC Money Keyring` keyring types.
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
 * @param selector.id - The account id to look up.
 * @param selector.type - The kind of account to look up: `'mpc'` for the MPC-backed account (MFA), or `'mnemonic'` with an optional `entropySource` for the `MoneyKeyring` account (SFA).
 * @param selector.entropySource - The entropy source ID of the SRP-backed account to look up. Defaults to the primary HD keyring's entropy source.
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
