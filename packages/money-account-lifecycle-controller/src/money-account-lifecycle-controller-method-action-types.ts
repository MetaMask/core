/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';

/**
 * Fetches derived identities from CHOMP whenever the feature is enabled and
 * the wallet is unlocked with an HD keyring. Identities are cleared on lock
 * and refetched on unlock, when the remote feature flag values change, or on
 * the next trigger after a failed fetch.
 *
 * After each fetch, and whenever the primary Money Account changes, records
 * whether that account is not in an identity, a valid SFA, migrating to a
 * successor, or a valid MFA, along with its identity. After each fetch, or
 * when the recorded lifecycle changes, looks up whether the Money Account
 * address, and the identity's current address for a valid MFA, are
 * registered with CHOMP. For a valid MFA, makes `MoneyAccountController`'s
 * MPC money account its default once that account exists and matches the
 * identity's current address; it never creates the MPC money account.
 * Never upgrades the Money Account itself; clients do so through
 * `upgradeMoneyAccount`.
 */
export type MoneyAccountLifecycleControllerInitAction = {
  type: `MoneyAccountLifecycleController:init`;
  handler: MoneyAccountLifecycleController['init'];
};

/**
 * Projects the identity of the primary Money Account from the recorded
 * lifecycle, so consumers can read balances across every address in its
 * chain. `currentAddress` is authoritative: while migrating it is still the
 * old address.
 *
 * A Money Account that is not in an identity has not been registered with
 * CHOMP yet, so it is projected as its own identity with status `NONE`.
 *
 * @returns The identity's current address, previous addresses, and status,
 * or `undefined` when there is no Money Account or no lifecycle has been
 * recorded for it yet.
 */
export type MoneyAccountLifecycleControllerGetMoneyAccountIdentityAction = {
  type: `MoneyAccountLifecycleController:getMoneyAccountIdentity`;
  handler: MoneyAccountLifecycleController['getMoneyAccountIdentity'];
};

/**
 * Refetches derived identities from CHOMP and re-records the Money Account
 * lifecycle and registration statuses. CHOMP cannot push updates, so clients
 * call this to pick up changes made elsewhere, such as another device
 * migrating the Money Account to MFA (for example, when a screen gains focus).
 * Joins a fetch already in flight instead of starting another.
 *
 * @returns A promise that resolves once the latest fetch has been recorded,
 * or straight away when the feature is disabled or the wallet is not ready.
 * @throws The error from fetching identities, unchanged.
 */
export type MoneyAccountLifecycleControllerRefreshAction = {
  type: `MoneyAccountLifecycleController:refresh`;
  handler: MoneyAccountLifecycleController['refresh'];
};

/**
 * Triggers the Money Account upgrade process for the primary Money Account,
 * including its EIP-7702 upgrade, through `MoneyAccountUpgradeController`.
 * Only a Money Account that is not in an identity or is a valid SFA is
 * upgraded, judged from the latest identity fetch. Makes a single attempt;
 * clients decide when to call it and how to retry. Concurrent calls share the
 * attempt in flight. After upgrading, refetches identities so the recorded
 * lifecycle reflects the upgrade.
 *
 * @returns A promise that resolves once the attempt completes, or straight
 * away when the feature is disabled, the wallet is not ready, or the Money
 * Account cannot be upgraded.
 * @throws When there is no Money Account, or the error from fetching
 * identities before upgrading or from the upgrade, unchanged.
 */
export type MoneyAccountLifecycleControllerUpgradeMoneyAccountAction = {
  type: `MoneyAccountLifecycleController:upgradeMoneyAccount`;
  handler: MoneyAccountLifecycleController['upgradeMoneyAccount'];
};

/**
 * Starts migrating the primary Money Account from its SFA address to a new
 * MFA address.
 *
 * Reads the profile's identities fresh from CHOMP and records them, then
 * only proceeds when the wallet is still ready, no identity is migrating, and
 * the Money Account is a valid SFA in no other identity. Asks
 * `MoneyAccountController` to create the MPC Money Account, or returns the
 * one an earlier attempt created, and checks that its address is fresh for
 * CHOMP: not part of any identity, and without intents.
 *
 * Linking the MFA address to the Money Account and completing the migration
 * steps are not implemented yet, so this always throws once the checks
 * pass.
 *
 * @throws If a migration is already in flight, the checks fail, or the
 * migration is reached.
 */
export type MoneyAccountLifecycleControllerStartMigrationAction = {
  type: `MoneyAccountLifecycleController:startMigration`;
  handler: MoneyAccountLifecycleController['startMigration'];
};

/**
 * Union of all MoneyAccountLifecycleController action types.
 */
export type MoneyAccountLifecycleControllerMethodActions =
  | MoneyAccountLifecycleControllerInitAction
  | MoneyAccountLifecycleControllerGetMoneyAccountIdentityAction
  | MoneyAccountLifecycleControllerRefreshAction
  | MoneyAccountLifecycleControllerUpgradeMoneyAccountAction
  | MoneyAccountLifecycleControllerStartMigrationAction;
