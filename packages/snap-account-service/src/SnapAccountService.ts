import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  SnapControllerGetRunnableSnapsAction,
  SnapControllerGetSnapAction,
  SnapControllerGetStateAction,
  SnapControllerSnapBlockedEvent,
  SnapControllerSnapDisabledEvent,
  SnapControllerSnapEnabledEvent,
  SnapControllerSnapInstalledEvent,
  SnapControllerSnapUnblockedEvent,
  SnapControllerSnapUninstalledEvent,
  SnapControllerStateChangeEvent,
} from '@metamask/snaps-controllers';
import { SnapId } from '@metamask/snaps-sdk';
import type { TruncatedSnap } from '@metamask/snaps-utils';

import { projectLogger as log } from './logger';
import type {
  SnapAccountServiceEnsureReadyAction,
  SnapAccountServiceGetSnapsAction,
} from './SnapAccountService-method-action-types';
import { SnapPlatformWatcher } from './SnapPlatformWatcher';
import type { SnapPlatformWatcherConfig } from './SnapPlatformWatcher';

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
 * The name of the {@link SnapAccountService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'SnapAccountService';

/**
 * All of the methods within {@link SnapAccountService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['ensureReady', 'getSnaps'] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions =
  | SnapAccountServiceEnsureReadyAction
  | SnapAccountServiceGetSnapsAction;

/**
 * Actions from other messengers that {@link SnapAccountService} calls.
 */
type AllowedActions =
  | SnapControllerGetStateAction
  | SnapControllerGetSnapAction
  | SnapControllerGetRunnableSnapsAction
  | KeyringControllerGetStateAction;

/**
 * Events that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceEvents = never;

/**
 * Events from other messengers that {@link SnapAccountService} subscribes to.
 */
type AllowedEvents =
  | SnapControllerStateChangeEvent
  | SnapControllerSnapInstalledEvent
  | SnapControllerSnapEnabledEvent
  | SnapControllerSnapDisabledEvent
  | SnapControllerSnapBlockedEvent
  | SnapControllerSnapUnblockedEvent
  | SnapControllerSnapUninstalledEvent
  | KeyringControllerStateChangeEvent;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link SnapAccountService}.
 */
export type SnapAccountServiceMessenger = Messenger<
  typeof serviceName,
  SnapAccountServiceActions | AllowedActions,
  SnapAccountServiceEvents | AllowedEvents
>;

/**
 * Configuration for the {@link SnapAccountService}.
 */
export type SnapAccountServiceConfig = {
  snapPlatformWatcher?: SnapPlatformWatcherConfig;
};

/**
 * The options that {@link SnapAccountService} takes.
 */
export type SnapAccountServiceOptions = {
  messenger: SnapAccountServiceMessenger;
  config?: SnapAccountServiceConfig;
};

/**
 * Service responsible for managing account management snaps.
 */
export class SnapAccountService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  readonly #messenger: SnapAccountServiceMessenger;

  readonly #watcher: SnapPlatformWatcher;

  readonly #snaps: Set<SnapId> = new Set();

  #initialized = false;

  /**
   * Constructs a new {@link SnapAccountService}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.config - Optional service configuration.
   */
  constructor({ messenger, config }: SnapAccountServiceOptions) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#watcher = new SnapPlatformWatcher(
      messenger,
      config?.snapPlatformWatcher,
    );

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

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Initializes the snap account service.
   *
   * Seeds the internal set of account-management Snaps from
   * `SnapController:getRunnableSnaps`, then starts processing lifecycle
   * events.
   */
  async init(): Promise<void> {
    const runnable = this.#messenger.call('SnapController:getRunnableSnaps');
    for (const snap of runnable) {
      if (isAccountManagementSnap(snap) && !this.#snaps.has(snap.id)) {
        log(`Found account management Snap: ${snap.id} (initialization)`);
        this.#snaps.add(snap.id);
      }
    }

    this.#initialized = true;
  }

  /**
   * Returns the IDs of all currently tracked account-management Snaps —
   * Snaps that are installed, enabled, not blocked, and have the
   * `endowment:keyring` permission.
   *
   * @returns The IDs of tracked account-management Snaps.
   */
  getSnaps(): SnapId[] {
    return [...this.#snaps];
  }

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
  async ensureReady(snapId: SnapId): Promise<void> {
    if (!this.#snaps.has(snapId)) {
      throw new Error(`Unknown snap: "${snapId}"`);
    }
    // Before doing anything with our Snap, we need to make sure the platform
    // is ready to process requests.
    await this.#watcher.ensureCanUseSnapPlatform();
  }

  /**
   * Handles a Snap being added (installed or enabled). If the Snap is an
   * account-management Snap, adds it to the internal set of tracked Snaps.
   *
   * @param snap - The Snap that was installed or enabled.
   * @param reason - The reason the Snap was added.
   */
  #handleSnapAdded(snap: TruncatedSnap, reason: string): void {
    if (!this.#initialized) {
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
    if (!this.#initialized) {
      return;
    }

    const snap = this.#messenger.call('SnapController:getSnap', snapId);
    if (snap && snap.enabled && !snap.blocked) {
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
    if (!this.#initialized) {
      return;
    }

    if (this.#snaps.has(snapId)) {
      log(`Removed account management Snap: ${snapId} (${reason})`);

      this.#snaps.delete(snapId);
    }
  }
}
