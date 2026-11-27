import { createSelector } from 'reselect';

import { getRunnableBindingMigrationPhases } from './binding-migration.js';
import type { MoneyAccountLifecycleControllerState } from './money-account-lifecycle-controller.js';

const UNFINISHED_BINDING_MIGRATOR_STATUSES = ['pending', 'unknown'];

const selectBindingMigrations = (
  state: MoneyAccountLifecycleControllerState,
): MoneyAccountLifecycleControllerState['bindingMigrations'] =>
  state.bindingMigrations;

const selectMoneyAccounts = (
  state: MoneyAccountLifecycleControllerState,
): MoneyAccountLifecycleControllerState['moneyAccounts'] => state.moneyAccounts;

/**
 * Selects whether a binding migrator that `startMigration` can still run has
 * not finished, in which case clients call `startMigration` again. Migrators
 * of phases that have passed are left out, as `startMigration` never runs
 * them again. A blocked migrator needs investigation rather than another run,
 * and `startMigration` stops at its phase, so nothing from that phase onwards
 * counts.
 *
 * @param state - The MoneyAccountLifecycleController state.
 * @returns True if a binding migrator that can still run is pending or
 * unknown.
 */
const selectHasUnfinishedBindingMigrations = createSelector(
  [selectBindingMigrations, selectMoneyAccounts],
  (bindingMigrations, moneyAccounts): boolean => {
    if (!bindingMigrations) {
      return false;
    }
    const migrators = Object.values(bindingMigrations.migrators);
    for (const phase of getRunnableBindingMigrationPhases(
      moneyAccounts[bindingMigrations.previousAddress],
    )) {
      const statuses = migrators
        .filter((migrator) => migrator.phase === phase)
        .map(({ status }) => status);
      if (statuses.includes('blocked')) {
        return false;
      }
      if (
        statuses.some((status) =>
          UNFINISHED_BINDING_MIGRATOR_STATUSES.includes(status),
        )
      ) {
        return true;
      }
    }
    return false;
  },
);

/**
 * Selects the ids of the blocked binding migrators, whatever their phase, for
 * support and UI. A blocked migrator needs investigation.
 *
 * @param state - The MoneyAccountLifecycleController state.
 * @returns The ids of the blocked binding migrators.
 */
const selectBlockedBindingMigrations = createSelector(
  [selectBindingMigrations],
  (bindingMigrations): string[] =>
    Object.entries(bindingMigrations?.migrators ?? {})
      .filter(([, { status }]) => status === 'blocked')
      .map(([migratorId]) => migratorId),
);

/**
 * Selects the ids of the binding migrators whose phase has passed for the
 * recorded migration while they are pending or unknown, so their work may
 * never run: `startMigration` does not run a phase again once it has passed.
 * This happens when a migrator is registered after the migration reached its
 * phase. A migrator that ran on another device, or before a reinstall, can
 * also be unknown here.
 *
 * @param state - The MoneyAccountLifecycleController state.
 * @returns The ids of the skipped binding migrators.
 */
const selectSkippedBindingMigrations = createSelector(
  [selectBindingMigrations, selectMoneyAccounts],
  (bindingMigrations, moneyAccounts): string[] => {
    if (!bindingMigrations) {
      return [];
    }
    const runnablePhases = getRunnableBindingMigrationPhases(
      moneyAccounts[bindingMigrations.previousAddress],
    );
    return Object.entries(bindingMigrations.migrators)
      .filter(
        ([, { phase, status }]) =>
          !runnablePhases.includes(phase) &&
          UNFINISHED_BINDING_MIGRATOR_STATUSES.includes(status),
      )
      .map(([migratorId]) => migratorId);
  },
);

/**
 * Selectors for the MoneyAccountLifecycleController state.
 * These can be used with Redux or directly with controller state.
 */
export const moneyAccountLifecycleControllerSelectors = {
  selectHasUnfinishedBindingMigrations,
  selectBlockedBindingMigrations,
  selectSkippedBindingMigrations,
};
