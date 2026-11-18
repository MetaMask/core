/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SecurityAlertsApiService } from './SecurityAlertsApiService.js';

/**
 * Get the normalized multi-chain token approval inventory for an account
 * (`POST /approvals/dashboard`).
 *
 * Failures are never reported as an empty inventory: the call rejects with
 * an `ApprovalDashboardError`. A resolved response carries per-chain status
 * and completeness in `chainResults`; a chain that is not `verified` must
 * not be shown as having no approvals.
 *
 * There is no per-call cancellation: identical concurrent calls share one
 * request, bounded by a 15-second timeout. Callers that no longer need a
 * response (e.g. after an account or network switch) should discard it.
 *
 * @param request - The dashboard request.
 * @param request.address - The EVM account address.
 * @param request.chainIds - Hex chain IDs (e.g. `'0x1'`); at most 20
 * distinct.
 * @param request.forceFresh - Ask the server to bypass the allowance cache.
 * The server may throttle this; see `freshness.forced` on the response.
 * @returns The validated approval inventory.
 */
export type SecurityAlertsApiServiceGetApprovalDashboardAction = {
  type: `SecurityAlertsApiService:getApprovalDashboard`;
  handler: SecurityAlertsApiService['getApprovalDashboard'];
};

/**
 * Union of all SecurityAlertsApiService action types.
 */
export type SecurityAlertsApiServiceMethodActions =
  SecurityAlertsApiServiceGetApprovalDashboardAction;
