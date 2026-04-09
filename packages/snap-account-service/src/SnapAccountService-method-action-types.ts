/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SnapAccountService } from './SnapAccountService';

/**
 * Returns the Snap IDs of all account management Snaps.
 *
 * @returns Set of Snap IDs of all account management Snaps.
 */
export type SnapAccountServiceGetSnapsAction = {
  type: `SnapAccountService:getSnaps`;
  handler: SnapAccountService['getSnaps'];
};

/**
 * Union of all SnapAccountService action types.
 */
export type SnapAccountServiceMethodActions = SnapAccountServiceGetSnapsAction;
