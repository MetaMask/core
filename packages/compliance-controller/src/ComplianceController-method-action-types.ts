/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ComplianceController } from './ComplianceController';

/**
 * Checks compliance status for a single wallet address via the API and
 * persists the result to state.
 *
 * @param address - The wallet address to check.
 * @returns The compliance status of the wallet.
 */
export type ComplianceControllerCheckWalletComplianceAction = {
  type: `ComplianceController:checkWalletCompliance`;
  handler: ComplianceController['checkWalletCompliance'];
};

/**
 * Checks compliance status for multiple wallet addresses via the API and
 * persists the results to state.
 *
 * @param addresses - The wallet addresses to check.
 * @returns The compliance statuses of the wallets.
 */
export type ComplianceControllerCheckWalletsComplianceAction = {
  type: `ComplianceController:checkWalletsCompliance`;
  handler: ComplianceController['checkWalletsCompliance'];
};

/**
 * Clears all compliance data from state.
 */
export type ComplianceControllerClearComplianceStateAction = {
  type: `ComplianceController:clearComplianceState`;
  handler: ComplianceController['clearComplianceState'];
};

/**
 * Union of all ComplianceController action types.
 */
export type ComplianceControllerMethodActions =
  | ComplianceControllerCheckWalletComplianceAction
  | ComplianceControllerCheckWalletsComplianceAction
  | ComplianceControllerClearComplianceStateAction;
