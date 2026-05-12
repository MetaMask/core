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
 * 2. Runs the legacy -> v2 Snap keyring migration (cached — no-op if
 * already done).
 * 3. Atomically creates the v2 keyring for this Snap if it doesn't exist
 * yet.
 * 4. Waits for the Snap platform to be fully started.
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
 * Migrate the legacy Snap keyring to the new (per-snap) Snap keyring v2.
 * Safe to call concurrently — the migration runs only once; all callers
 * await the same promise.
 *
 * @returns A promise that resolves when the migration is complete.
 */
export type SnapAccountServiceMigrateAction = {
  type: `SnapAccountService:migrate`;
  handler: SnapAccountService['migrate'];
};

/**
 * Atomically gets-or-creates the legacy (v1) Snap keyring — the keyring
 * associated with {@link KeyringTypes.snap}.
 *
 * @returns The existing or newly-created Snap keyring instance.
 */
export type SnapAccountServiceGetLegacySnapKeyringAction = {
  type: `SnapAccountService:getLegacySnapKeyring`;
  handler: SnapAccountService['getLegacySnapKeyring'];
};

/**
 * Handle a message from a Snap.
 *
 * @param snapId - ID of the Snap.
 * @param message - Message sent by the Snap.
 * @returns The execution result.
 */
export type SnapAccountServiceHandleKeyringSnapMessageAction = {
  type: `SnapAccountService:handleKeyringSnapMessage`;
  handler: SnapAccountService['handleKeyringSnapMessage'];
};

/**
 * Union of all SnapAccountService action types.
 */
export type SnapAccountServiceMethodActions =
  | SnapAccountServiceGetSnapsAction
  | SnapAccountServiceEnsureReadyAction
  | SnapAccountServiceMigrateAction
  | SnapAccountServiceGetLegacySnapKeyringAction
  | SnapAccountServiceHandleKeyringSnapMessageAction;
