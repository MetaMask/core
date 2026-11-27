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
 * MFA address, or resumes its migration if one is already in flight. Once
 * it has migrated, only runs the `afterDone` binding migrators, which
 * requires the MPC Money Account of this wallet to be the identity's
 * current address.
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
 * Before registering those intents, the built-in `money-account-plus-payer`
 * binding migrator moves an active Money Account Plus subscription paid by
 * the Money Account to the MFA address, in the `beforeMigrationIntents`
 * phase, because CHOMP only accepts the intents of a premium migration once
 * the successor holds the premium eligibility. If no such subscription is
 * paid by either address for a premium migration, that migrator is
 * blocked. A subscription the Money Account starts paying for once the
 * funds transfer has started is not moved.
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
 * Registered binding migrators run once the successor is linked
 * (`afterLink`), before the migration intents are registered
 * (`beforeMigrationIntents`) and before the funds transfer starts
 * (`beforeFundsTransfer`), until CHOMP has started the funds transfer:
 * from then on those phases have passed, and their migrators are never run
 * again, even when the migration resumes. When `afterDone` migrators are
 * registered, this then waits up to a minute for CHOMP to finish moving the
 * funds and runs them. If the funds have not moved by then, or their
 * transfer failed, this resolves without running them; calling this again
 * once the migration has finished runs them.
 *
 * Only one migration runs at a time. A call made while one is in flight
 * joins it instead of starting another: it gets the same promise, so it
 * resolves or rejects with that migration's outcome. A call made after it
 * settles starts a new run. After `clearState`, a call waits for the
 * migration that was in flight to stop, without taking on its outcome, and
 * then starts a new run.
 *
 * @returns A promise that resolves once the migration run, started by this
 * call or joined by it, completes.
 * @throws If a Money Account upgrade is in flight, the checks fail, the
 * wallet stops being ready part way, or linking the successor, registering
 * the intents or starting the funds transfer fails. A
 * `BindingMigrationIncompleteError` once every binding migrator of a phase
 * has run, if any of them is pending or blocked.
 */
export type MoneyAccountLifecycleControllerStartMigrationAction = {
  type: `MoneyAccountLifecycleController:startMigration`;
  handler: MoneyAccountLifecycleController['startMigration'];
};

/**
 * Clears all recorded lifecycles and address registrations, for example
 * when the wallet is reset. Also discards the derived identities and any
 * identity or registration status request in flight, so nothing from the
 * previous wallet is recorded afterwards, and the next sync fetches
 * identities again. An upgrade in flight stops without refetching
 * identities, and a migration in flight throws before its next step.
 */
export type MoneyAccountLifecycleControllerClearStateAction = {
  type: `MoneyAccountLifecycleController:clearState`;
  handler: MoneyAccountLifecycleController['clearState'];
};

/**
 * Registers a migrator that moves an integration bound to the Money Account
 * address, such as a deposit destination, to the MPC Money Account when the
 * Money Account migrates. `startMigration` runs it in its phase, in
 * registration order. A migrator is never run once its phase has passed,
 * including when it is registered after that: owners must roll out a
 * migrator before the migrations it has to cover reach its phase.
 *
 * While the Money Account is migrating or migrated, and this wallet can
 * drive that migration, its status from `getStatus` is recorded in
 * `bindingMigrations`, now, after each identity fetch, and after each of
 * its runs. Register migrators when the client starts, before it can call
 * `startMigration`.
 *
 * @param migrator - The binding migrator. It holds functions, so it can
 * only be passed within the same process.
 * @throws If the migrator is invalid, or one with the same id is already
 * registered.
 */
export type MoneyAccountLifecycleControllerRegisterBindingMigratorAction = {
  type: `MoneyAccountLifecycleController:registerBindingMigrator`;
  handler: MoneyAccountLifecycleController['registerBindingMigrator'];
};

/**
 * Union of all MoneyAccountLifecycleController action types.
 */
export type MoneyAccountLifecycleControllerMethodActions =
  | MoneyAccountLifecycleControllerInitAction
  | MoneyAccountLifecycleControllerGetMoneyAccountIdentityAction
  | MoneyAccountLifecycleControllerRefreshAction
  | MoneyAccountLifecycleControllerUpgradeMoneyAccountAction
  | MoneyAccountLifecycleControllerStartMigrationAction
  | MoneyAccountLifecycleControllerClearStateAction
  | MoneyAccountLifecycleControllerRegisterBindingMigratorAction;
