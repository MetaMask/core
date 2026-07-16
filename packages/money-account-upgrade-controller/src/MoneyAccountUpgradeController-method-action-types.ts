/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountUpgradeController } from './MoneyAccountUpgradeController.js';

/**
 * Runs each step in the upgrade sequence in order. A step that reports
 * `'already-done'` is skipped without performing any action; a step that
 * reports `'completed'` has performed its action. An error thrown by any
 * step halts the sequence and is re-thrown wrapped in a
 * {@link MoneyAccountUpgradeStepError} that records which step failed (the
 * original error is preserved as `cause`).
 *
 * @param address - The Money Account address to upgrade.
 */
export type MoneyAccountUpgradeControllerUpgradeAccountAction = {
  type: `MoneyAccountUpgradeController:upgradeAccount`;
  handler: MoneyAccountUpgradeController['upgradeAccount'];
};

/**
 * Union of all MoneyAccountUpgradeController action types.
 */
export type MoneyAccountUpgradeControllerMethodActions =
  MoneyAccountUpgradeControllerUpgradeAccountAction;
