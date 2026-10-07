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
 * registered with CHOMP, and switches `MoneyAccountController` to the MPC
 * keyring for a valid MFA. Registers the Money Account address through
 * `MoneyAccountUpgradeController` when it is not registered and is either
 * not in an identity or a valid SFA. A migrating Money Account is frozen by
 * CHOMP, so it is never registered.
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
 * Starts migrating the primary Money Account from its SFA address to a new
 * MFA address.
 *
 * Reads the profile's identities fresh from CHOMP and records them, then
 * only proceeds when no identity is migrating and the Money Account is a
 * valid SFA. Asks the MFA Migration Controller to create the MFA account,
 * and checks that its address is fresh for CHOMP: not part of any identity,
 * and without intents.
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
  | MoneyAccountLifecycleControllerStartMigrationAction;
