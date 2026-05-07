/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SnapAccountService } from './SnapAccountService';

/**
 * Ensures everything is ready to use Snap accounts for the given Snap.
 * 1. Waits for the Snap platform to be fully started.
 *
 * Safe to call concurrently — each step is idempotent or mutex-protected.
 *
 * @param _snapId - ID of the Snap to ensure readiness for.
 */
export type SnapAccountServiceEnsureReadyAction = {
  type: `SnapAccountService:ensureReady`;
  handler: SnapAccountService['ensureReady'];
};

/**
 * Union of all SnapAccountService action types.
 */
export type SnapAccountServiceMethodActions =
  SnapAccountServiceEnsureReadyAction;
