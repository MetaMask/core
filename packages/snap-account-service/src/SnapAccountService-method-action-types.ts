/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SnapAccountService } from './SnapAccountService';

/**
 * Returns the IDs of all currently tracked account-management Snaps —
 * Snaps that are installed, enabled, not blocked, and have the
 * `endowment:keyring` permission.
 *
 * @returns The IDs of tracked account-management Snaps.
 */
export type SnapAccountServiceGetSnapsAction = {
  type: `SnapAccountService:getSnaps`;
  handler: SnapAccountService['getSnaps'];
};

/**
 * Ensures everything is ready to use Snap accounts for the given Snap.
 * 1. Validates that `snapId` is a tracked account-management Snap.
 * 2. Waits for the Snap platform to be fully started.
 *
 * Safe to call concurrently — each step is idempotent or mutex-protected.
 *
 * @param snapId - ID of the Snap to ensure readiness for.
 * @throws If `snapId` is not a tracked account-management Snap.
 */
export type SnapAccountServiceEnsureReadyAction = {
  type: `SnapAccountService:ensureReady`;
  handler: SnapAccountService['ensureReady'];
};

/**
 * Union of all SnapAccountService action types.
 */
export type SnapAccountServiceMethodActions =
  | SnapAccountServiceGetSnapsAction
  | SnapAccountServiceEnsureReadyAction;
