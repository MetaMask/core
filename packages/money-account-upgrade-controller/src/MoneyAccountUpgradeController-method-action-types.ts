/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountUpgradeController } from './MoneyAccountUpgradeController';

/**
 * Upgrades a money account. This method iterates over a number of
 * steps to perform the upgrade.
 *
 * @returns A promise that resolves when the upgrade is complete.
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
