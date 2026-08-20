/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NeoBankService } from './NeoBankService.js';

/**
 * Fetches an autoramp account via the Ramp API proxy of
 * MoonPay `GET /api/autoramps/{autoramp_id}`.
 *
 * @param autorampId - MoonPay / Ramp API autoramp id.
 * @returns Remote snapshot for controller apply/refresh.
 */
export type NeoBankServiceGetAutorampAction = {
  type: `NeoBankService:getAutoramp`;
  handler: NeoBankService['getAutoramp'];
};

/**
 * Union of all NeoBankService action types.
 */
export type NeoBankServiceMethodActions = NeoBankServiceGetAutorampAction;
