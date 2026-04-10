/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountUpgradeController } from './MoneyAccountUpgradeController';

/**
 * Runs the full upgrade sequence for a Money Account.
 *
 * @param address - The Money Account address to upgrade.
 * @param chainId - The target chain for the upgrade.
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
