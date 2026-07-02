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
 * 2. Asserts that the legacy -> v2 migration has been triggered (expected to
 * happen at `KeyringController:unlock` time).
 * 3. Atomically creates the v2 keyring for this Snap if it doesn't exist
 * yet.
 * 4. Waits for the Snap platform to be fully started.
 *
 * Safe to call concurrently — each step is idempotent or mutex-protected.
 *
 * @param snapId - ID of the Snap to ensure readiness for.
 * @throws If `snapId` is not a tracked account-management Snap.
 * @throws If the migration has not been triggered yet (wallet not unlocked).
 */
export type SnapAccountServiceEnsureReadyAction = {
  type: `SnapAccountService:ensureReady`;
  handler: SnapAccountService['ensureReady'];
};

/**
 * Migrate the legacy Snap keyring to the new (per-snap) Snap keyring v2.
 * Expected to be triggered at `KeyringController:unlock` time.
 * Safe to call concurrently — the migration runs only once; all callers
 * await the same promise.
 *
 * @returns A promise that resolves when the migration is complete.
 */
export type SnapAccountServiceEnsureMigratedAction = {
  type: `SnapAccountService:ensureMigrated`;
  handler: SnapAccountService['ensureMigrated'];
};

/**
 * Returns the keyring capabilities declared by the given Snap. These are
 * populated by the bridge keyring from the Snap's manifest, and describe
 * which keyring features the Snap supports (scopes, BIP-44 options, etc.).
 *
 * Consumers use this to decide whether to drive the Snap through the v1 or
 * v2 keyring path. Reading capabilities does not mutate state, so the
 * lock-free keyring access is used.
 *
 * @param snapId - ID of the Snap.
 * @returns The Snap's keyring capabilities.
 */
export type SnapAccountServiceGetCapabilitiesAction = {
  type: `SnapAccountService:getCapabilities`;
  handler: SnapAccountService['getCapabilities'];
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
  | SnapAccountServiceEnsureMigratedAction
  | SnapAccountServiceGetCapabilitiesAction
  | SnapAccountServiceHandleKeyringSnapMessageAction;
