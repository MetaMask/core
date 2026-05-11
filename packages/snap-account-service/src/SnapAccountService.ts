import { AccountGroupId } from '@metamask/account-api';
import type { SnapKeyring as LegacySnapKeyring } from '@metamask/eth-snap-keyring';
import type {
  SnapKeyring as LegacySnapKeyring,
  SnapMessage,
} from '@metamask/eth-snap-keyring';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerUnlockEvent,
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
import type { Json } from '@metamask/utils';

import { projectLogger as log } from './logger';
import type {
  SnapAccountServiceEnsureReadyAction,
  SnapAccountServiceGetLegacySnapKeyringAction,
  SnapAccountServiceGetSnapsAction,
  SnapAccountServiceHandleKeyringSnapMessageAction,
} from './SnapAccountService-method-action-types';
import { SnapPlatformWatcher } from './SnapPlatformWatcher';
import type { SnapPlatformWatcherConfig } from './SnapPlatformWatcher';
import { SnapTracker } from './SnapTracker';
import type {
  AccountTreeControllerGetAccountGroupObjectAction,
  AccountTreeControllerGetSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from './types';

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
  'handleKeyringSnapMessage',
] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions =
  | SnapAccountServiceEnsureReadyAction
  | SnapAccountServiceGetSnapsAction
  | SnapAccountServiceGetLegacySnapKeyringAction
  | SnapAccountServiceHandleKeyringSnapMessageAction;

/**
 * Actions from other messengers that {@link SnapAccountService} calls.
 */
type AllowedActions =
  | SnapControllerGetStateAction
  | SnapControllerGetSnapAction
  | SnapControllerGetRunnableSnapsAction
  | KeyringControllerGetStateAction
  | KeyringControllerWithControllerAction
  | AccountTreeControllerGetAccountGroupObjectAction
  | AccountTreeControllerGetSelectedAccountGroupAction;

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
  | KeyringControllerStateChangeEvent
  | KeyringControllerUnlockEvent
  | AccountTreeControllerSelectedAccountGroupChangeEvent;

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

    this.#messenger.subscribe(
      'AccountTreeController:selectedAccountGroupChange',
      (groupId) => this.#handleSelectedAccountGroupChange(groupId),
    );

    this.#messenger.subscribe('KeyringController:unlock', () =>
      this.#handleUnlock(),
    );
  }

  /**
   * Handles changes to the selected account group by forwarding the new
   * group's accounts to the Snap keyring.
   *
   * @param groupId - The ID of the newly selected account group.
   */
  #handleSelectedAccountGroupChange(groupId: AccountGroupId | ''): void {
    this.#forwardSelectedAccountGroup(groupId).catch((error) => {
      console.error('Error handling selected account group change:', error);
    });
  }

  /**
   * Handles the keyring controller unlock event by forwarding the currently
   * selected account group's accounts to the Snap keyring.
   */
  #handleUnlock(): void {
    const groupId = this.#messenger.call(
      'AccountTreeController:getSelectedAccountGroup',
    );
    this.#forwardSelectedAccountGroup(groupId).catch((error) => {
      console.error(
        'Error forwarding selected account group on unlock:',
        error,
      );
    });
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

  /**
   * Handle a message from a Snap.
   *
   * @param snapId - ID of the Snap.
   * @param message - Message sent by the Snap.
   * @returns The execution result.
   */
  async handleKeyringSnapMessage(
    snapId: SnapId,
    message: SnapMessage,
  ): Promise<Json> {
    const snapKeyring = await this.getLegacySnapKeyring();
    return snapKeyring.handleKeyringSnapMessage(snapId, message);
  }

  /**
   * Forwards the accounts of the given account group to the Snap keyring.
   *
   * @param groupId - The ID of the account group whose accounts should be
   * forwarded. If empty, this is a no-op.
   */
  async #forwardSelectedAccountGroup(
    groupId: AccountGroupId | '',
  ): Promise<void> {
    if (groupId) {
      const group = this.#messenger.call(
        'AccountTreeController:getAccountGroupObject',
        groupId,
      );

      if (group) {
        log(
          `Forwarding selected accounts (from "${groupId}") to Snap keyring: ${group.accounts.join(', ')}`,
        );

        const snapKeyring = await this.getLegacySnapKeyring();
        await snapKeyring.setSelectedAccounts(group.accounts);
      }
    }
  }
}
