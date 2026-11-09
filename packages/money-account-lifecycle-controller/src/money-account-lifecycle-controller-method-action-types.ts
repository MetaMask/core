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
 * upgraded, judged from the latest identity fetch, and never while a
 * migration is in flight. Makes a single attempt;
 * clients decide when to call it and how to retry. Concurrent calls share the
 * attempt in flight. After upgrading, refetches identities so the recorded
 * lifecycle reflects the upgrade.
 *
 * @returns A promise that resolves once the attempt completes, or straight
 * away when the feature is disabled, the wallet is not ready, a migration is
 * in flight, or the Money Account cannot be upgraded.
 * @throws When there is no Money Account, or the error from fetching
 * identities before upgrading or from the upgrade, unchanged.
 */
export type MoneyAccountLifecycleControllerUpgradeMoneyAccountAction = {
  type: `MoneyAccountLifecycleController:upgradeMoneyAccount`;
  handler: MoneyAccountLifecycleController['upgradeMoneyAccount'];
};

/**
 * Starts migrating the primary Money Account from its SFA address to a new
 * MFA address, or resumes its migration if one is already in flight.
 *
 * Reads the profile's identities fresh from CHOMP and records them, then
 * only proceeds when the wallet is still ready and the Money Account is in
 * no other identity. If the Money Account is migrating, and no other
 * identity is, the migration is resumed, but only towards the MPC Money
 * Account of this wallet, which has to sign the successor's steps. That
 * account is restored first when it is missing, as after a reinstall.
 *
 * Otherwise, the Money Account must be a valid SFA and no identity may be
 * migrating. Asks `MoneyAccountController` to create the MPC Money Account,
 * or returns the one an earlier attempt created. Creating it may run the
 * MPC setup, so afterwards the identities are read and checked again, and
 * the MFA address must not be part of any identity. CHOMP itself rejects
 * linking an MFA address that already has active intents.
 *
 * Then, through `MoneyAccountUpgradeController`, links the MFA address as
 * the successor of the Money Account and upgrades it, which starts the
 * migration on CHOMP and freezes the Money Account until it completes, and
 * registers the intents the Money Account signs for the migration. Both
 * only do the work CHOMP reports missing.
 *
 * Before registering those intents, an active Money Account Plus
 * subscription paid by the Money Account is moved to the MFA address,
 * because CHOMP only accepts the intents of a premium migration once the
 * successor holds the premium eligibility. The MFA address signs a new
 * subscription delegation, which also registers its subscription intent,
 * and becomes the payer of the subscription. If CHOMP still reports the
 * subscription intent of the MFA address missing once the MFA address pays,
 * its subscription delegation is prepared again to register the intent,
 * and if no active Money Account Plus subscription is paid by either
 * address, the migration cannot complete, so this throws.
 *
 * Finally, asks CHOMP to start moving the funds of the Money Account to the
 * MFA address. From then on, the migration can no longer be cancelled.
 * CHOMP refuses while a step is missing, for example while the MFA address
 * is not yet monitored, or when a concurrent request conflicts, so the
 * request is retried once after a short delay. If that fails too, calling
 * this again starts the transfer.
 *
 * Identities are then refetched, so the recorded lifecycle becomes
 * `migrating`, even when any of these steps fails.
 *
 * @throws If a migration or Money Account upgrade is already in flight, the
 * checks fail, the wallet stops being ready part way, or linking the
 * successor, moving the subscription, registering the intents or starting
 * the funds transfer fails.
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
