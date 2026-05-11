import type { SnapKeyring as LegacySnapKeyring } from '@metamask/eth-snap-keyring';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerWithControllerAction,
  KeyringEntry,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { BaseKeyring } from '@metamask/keyring-utils';
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

import { projectLogger as log } from './logger';
import type {
  SnapAccountServiceEnsureReadyAction,
  SnapAccountServiceGetLegacySnapKeyringAction,
  SnapAccountServiceGetSnapsAction,
} from './SnapAccountService-method-action-types';
import { SnapPlatformWatcher } from './SnapPlatformWatcher';
import type { SnapPlatformWatcherConfig } from './SnapPlatformWatcher';
import { SnapTracker } from './SnapTracker';

/**
 * The name of the {@link SnapAccountService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'SnapAccountService';

/**
 * All of the methods within {@link SnapAccountService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = [
  'ensureReady',
  'getSnaps',
  'getLegacySnapKeyring',
] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions =
  | SnapAccountServiceEnsureReadyAction
  | SnapAccountServiceGetSnapsAction
  | SnapAccountServiceGetLegacySnapKeyringAction;

/**
 * Actions from other messengers that {@link SnapAccountService} calls.
 */
type AllowedActions =
  | SnapControllerGetStateAction
  | SnapControllerGetSnapAction
  | SnapControllerGetRunnableSnapsAction
  | KeyringControllerGetStateAction
  | KeyringControllerWithControllerAction;

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
 * Checks if a given keyring is a Snap keyring (v2).
 *
 * @param keyring - The keyring to check.
 * @param keyring.type - The type of the keyring.
 * @returns `true` if the keyring is a Snap keyring (v2), `false` otherwise.
 */
function isLegacySnapKeyring(keyring: {
  type: BaseKeyring['type'];
}): keyring is LegacySnapKeyring {
  return keyring.type === KeyringTypes.snap;
}

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

  readonly #tracker: SnapTracker;

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
    this.#tracker = new SnapTracker(messenger);

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
    await this.#tracker.init();
  }

  /**
   * Returns the IDs of all currently tracked account-management Snaps —
   * Snaps that are installed, enabled, not blocked, and have the
   * `endowment:keyring` permission.
   *
   * @returns The IDs of tracked account-management Snaps.
   */
  getSnaps(): SnapId[] {
    return this.#tracker.getSnaps();
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
    if (!this.#tracker.canUse(snapId)) {
      throw new Error(`Unknown snap: "${snapId}"`);
    }
    // Before doing anything with our Snap, we need to make sure the platform
    // is ready to process requests.
    await this.#watcher.ensureCanUseSnapPlatform();
  }

  /**
   * Atomically gets-or-creates the legacy (v1) Snap keyring — the keyring
   * associated with {@link KeyringTypes.snap}.
   *
   * @returns The existing or newly-created Snap keyring instance.
   */
  async getLegacySnapKeyring(): Promise<LegacySnapKeyring> {
    type Result = {
      snapKeyring: LegacySnapKeyring;
    };

    // `KeyringController:withController` forbids returning a direct keyring
    // reference (it checks the result via `Object.is`), so we smuggle the
    // instance out wrapped in an object and unwrap it after the call.
    // NOTE: This violates the abstraction of `KeyringController:withController`, but this
    // is how we currently interact with the legacy Snap keyring. Once we migrate it to
    // the Snap keyring v2, we won't be using the same pattern.
    const result = await this.#messenger.call(
      'KeyringController:withController',
      async (controller): Promise<Result> => {
        let snapKeyring: KeyringEntry['keyring'] | undefined;

        const found = controller.keyrings.find(({ keyring }) =>
          isLegacySnapKeyring(keyring),
        );
        if (found) {
          snapKeyring = found.keyring;
        }

        if (!snapKeyring) {
          const {
            keyring: newSnapKeyring,
            metadata: { id },
          } = await controller.addNewKeyring(KeyringTypes.snap);
          snapKeyring = newSnapKeyring;

          log(`Legacy Snap keyring created. ("${id}")`);
        }

        // The legacy Snap keyring is not compatible with `EthKeyring`, so we need to cast here.
        return { snapKeyring } as unknown as Result;
      },
    );

    return (result as Result).snapKeyring;
  }
}
