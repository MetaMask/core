import { SnapId } from '@metamask/snaps-sdk';
import type { TruncatedSnap } from '@metamask/snaps-utils';

import { projectLogger as log } from './logger.js';
import type { SnapAccountServiceMessenger } from './SnapAccountService.js';

/**
 * Checks if a given Snap is an account management Snap.
 *
 * @param snap - The Snap to check.
 * @returns True if the Snap declares the `endowment:keyring` initial
 * permission.
 */
function isAccountManagementSnap(snap: TruncatedSnap): boolean {
  return snap.initialPermissions['endowment:keyring'] !== undefined;
}

/**
 * Tracks the set of installed, enabled, non-blocked account-management Snaps
 * (Snaps declaring the `endowment:keyring` initial permission) by listening to
 * `SnapController` lifecycle events.
 */
export class SnapTracker {
  readonly #messenger: SnapAccountServiceMessenger;

  readonly #snaps: Set<SnapId> = new Set();

  constructor(messenger: SnapAccountServiceMessenger) {
    this.#messenger = messenger;

    this.#messenger.subscribe('SnapController:snapInstalled', (snap) =>
      this.#handleSnapAdded(snap, 'installed'),
    );
    this.#messenger.subscribe('SnapController:snapUninstalled', (snap) =>
      this.#handleSnapRemoved(snap.id, 'uninstalled'),
    );
    this.#messenger.subscribe('SnapController:snapEnabled', (snap) =>
      this.#handleSnapAdded(snap, 'enabled'),
    );
    this.#messenger.subscribe('SnapController:snapDisabled', (snap) =>
      this.#handleSnapRemoved(snap.id, 'disabled'),
    );
    this.#messenger.subscribe('SnapController:snapBlocked', (snapId) =>
      this.#handleSnapRemoved(snapId as SnapId, 'blocked'),
    );
    this.#messenger.subscribe('SnapController:snapUnblocked', (snapId) =>
      this.#handleSnapUnblocked(snapId as SnapId),
    );

    this.#init();
  }

  /**
   * Seeds the internal set of account-management Snaps from
   * `SnapController:getRunnableSnaps`.
   */
  #init(): void {
    const runnable = this.#messenger.call('SnapController:getRunnableSnaps');
    for (const snap of runnable) {
      if (isAccountManagementSnap(snap)) {
        log(`Found account management Snap: ${snap.id} (initialization)`);
        this.#snaps.add(snap.id);
      }
    }
  }

  /**
   * Returns the IDs of all currently tracked account-management Snaps.
   *
   * @returns The IDs of tracked account-management Snaps.
   */
  getSnaps(): SnapId[] {
    return [...this.#snaps];
  }

  /**
   * Returns true if the given Snap ID is currently tracked and can be used.
   *
   * @param snapId - The Snap ID to check.
   * @returns True if the Snap is tracked and can be used.
   */
  canUse(snapId: SnapId): boolean {
    return this.#snaps.has(snapId);
  }

  /**
   * Handles a Snap being added (installed or enabled). If the Snap is an
   * account-management Snap, adds it to the internal set of tracked Snaps.
   *
   * @param snap - The Snap that was installed or enabled.
   * @param reason - The reason the Snap was added.
   */
  #handleSnapAdded(snap: TruncatedSnap, reason: string): void {
    if (!snap.enabled || snap.blocked) {
      return;
    }

    if (isAccountManagementSnap(snap) && !this.#snaps.has(snap.id)) {
      log(`Added account management Snap: ${snap.id} (${reason})`);

      this.#snaps.add(snap.id);
    }
  }

  /**
   * Handles a Snap being unblocked. If the Snap is an enabled
   * account-management Snap, re-adds it to the internal set of tracked Snaps.
   *
   * @param snapId - The Snap ID that was unblocked.
   */
  #handleSnapUnblocked(snapId: SnapId): void {
    const snap = this.#messenger.call('SnapController:getSnap', snapId);
    if (snap) {
      this.#handleSnapAdded(snap, 'unblocked');
    }
  }

  /**
   * Handles a Snap being removed (disabled, blocked, or uninstalled). If the Snap is an
   * account-management Snap, removes it from the internal set of tracked Snaps.
   *
   * @param snapId - The Snap ID that was disabled, blocked, or uninstalled.
   * @param reason - The reason the Snap was removed.
   */
  #handleSnapRemoved(snapId: SnapId, reason: string): void {
    if (this.#snaps.has(snapId)) {
      log(`Removed account management Snap: ${snapId} (${reason})`);

      this.#snaps.delete(snapId);
    }
  }
}
