/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ComplianceService } from './ComplianceService';

/**
 * Checks compliance status for a single wallet address.
 *
 * @param address - The wallet address to check.
 * @returns The compliance status of the wallet.
 */
export type ComplianceServiceCheckWalletComplianceAction = {
  type: `ComplianceService:checkWalletCompliance`;
  handler: ComplianceService['checkWalletCompliance'];
};

/**
 * Checks compliance status for multiple wallet addresses in a single request.
 *
 * @param addresses - The wallet addresses to check.
 * @returns The compliance statuses of the wallets.
 */
export type ComplianceServiceCheckWalletsComplianceAction = {
  type: `ComplianceService:checkWalletsCompliance`;
  handler: ComplianceService['checkWalletsCompliance'];
};

/**
 * Union of all ComplianceService action types.
 */
export type ComplianceServiceMethodActions =
  | ComplianceServiceCheckWalletComplianceAction
  | ComplianceServiceCheckWalletsComplianceAction;
