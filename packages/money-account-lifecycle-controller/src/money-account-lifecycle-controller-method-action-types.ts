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
 * Makes one attempt to upgrade the primary Money Account through
 * `MoneyAccountUpgradeController`, then refreshes its recorded registration
 * status. Clients own when this runs and how failed attempts are retried.
 *
 * Uses the recorded lifecycle, fetching identities fresh from CHOMP when none
 * has been recorded. Only a Money Account that is not in an identity or is a
 * valid SFA is upgraded; a migrating Money Account is frozen by CHOMP, and a
 * valid MFA has already moved on. Concurrent calls share the attempt in
 * flight.
 *
 * @returns A promise that resolves once the attempt completes, or straight
 * away when the feature is unavailable, there is no Money Account, or its
 * lifecycle cannot be upgraded.
 * @throws The error from fetching identities or from the upgrade, unchanged.
 */
export type MoneyAccountLifecycleControllerUpgradeMoneyAccountAction = {
  type: `MoneyAccountLifecycleController:upgradeMoneyAccount`;
  handler: MoneyAccountLifecycleController['upgradeMoneyAccount'];
};

/**
 * Union of all MoneyAccountLifecycleController action types.
 */
export type MoneyAccountLifecycleControllerMethodActions =
  | MoneyAccountLifecycleControllerInitAction
  | MoneyAccountLifecycleControllerGetMoneyAccountIdentityAction
  | MoneyAccountLifecycleControllerUpgradeMoneyAccountAction;
