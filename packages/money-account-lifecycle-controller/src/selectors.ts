import type { MoneyAccountLifecycleControllerState } from './money-account-lifecycle-controller.js';

const FINISHED_BINDING_MIGRATION_STATUSES = ['completed', 'not_required'];

/**
 * Selects whether any binding migrator has not finished moving its binding
 * to the MPC Money Account, in which case clients call `startMigration`.
 *
 * @param state - The MoneyAccountLifecycleController state.
 * @returns True if a binding migration is pending, blocked or unknown.
 */
const selectHasUnfinishedBindingMigrations = (
  state: MoneyAccountLifecycleControllerState,
): boolean =>
  Object.values(state.bindingMigrations).some(
    ({ status }) =>
      !FINISHED_BINDING_MIGRATION_STATUSES.includes(status.status),
  );

/**
 * Selectors for the MoneyAccountLifecycleController state.
 * These can be used with Redux or directly with controller state.
 */
export const moneyAccountLifecycleControllerSelectors = {
  selectHasUnfinishedBindingMigrations,
};
