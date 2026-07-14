/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ComplianceController } from './ComplianceController';

/**
 * Checks compliance status for a single wallet address via the API and
 * persists the result to state. If the API call fails and a previously
 * cached result exists for the address, the cached result is returned as a
 * fallback. If no cached result exists, the error is re-thrown.
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
 * persists the results to state. If the API call fails and every requested
 * address has a previously cached result, those cached results are returned
 * as a fallback. If any address lacks a cached result, the error is
 * re-thrown.
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
