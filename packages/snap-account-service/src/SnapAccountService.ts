import { AccountGroupId } from '@metamask/account-api';
import type {
  SnapKeyring as LegacySnapKeyring,
  SnapMessage,
} from '@metamask/eth-snap-keyring';
import { SnapKeyring, SnapKeyringState } from '@metamask/eth-snap-keyring/v2';
import { Keyring, KeyringType } from '@metamask/keyring-api/v2';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerUnlockEvent,
  KeyringControllerWithControllerAction,
  KeyringEntry,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { AccountId, BaseKeyring } from '@metamask/keyring-utils';
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
  SnapAccountServiceMigrateAction,
} from './SnapAccountService-method-action-types';
import { SnapPlatformWatcher } from './SnapPlatformWatcher';
import type { SnapPlatformWatcherConfig } from './SnapPlatformWatcher';
import { SnapTracker } from './SnapTracker';
import type {
  AccountTreeControllerGetAccountGroupObjectAction,
  AccountTreeControllerGetSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
  AccountTreeControllerAccountGroupCreatedEvent,
  AccountTreeControllerAccountGroupUpdatedEvent,
  AccountTreeControllerAccountGroupRemovedEvent,
  AccountGroupObject,
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
  'migrate',
] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions =
  | SnapAccountServiceEnsureReadyAction
  | SnapAccountServiceGetSnapsAction
  | SnapAccountServiceGetLegacySnapKeyringAction
  | SnapAccountServiceHandleKeyringSnapMessageAction
  | SnapAccountServiceMigrateAction;

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
  | AccountTreeControllerSelectedAccountGroupChangeEvent
  | AccountTreeControllerAccountGroupCreatedEvent
  | AccountTreeControllerAccountGroupUpdatedEvent
  | AccountTreeControllerAccountGroupRemovedEvent;

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
 * Checks if a given keyring is a Snap keyring (v2).
 *
 * @param keyring - The keyring to check.
 * @returns `true` if the keyring is a Snap keyring (v2), `false` otherwise.
 */
function isSnapKeyring(keyring: Keyring): keyring is SnapKeyring {
  // Using `KeyringType.Snap` (used for v2).
  return keyring.type === KeyringType.Snap;
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

  #migrated = false;

  #migratePromise: Promise<void> | null = null;

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

    this.#messenger.subscribe(
      'AccountTreeController:accountGroupCreated',
      (group) => this.#handleAccountGroupCreatedOrUpdated(group),
    );

    this.#messenger.subscribe(
      'AccountTreeController:accountGroupUpdated',
      (group) => this.#handleAccountGroupCreatedOrUpdated(group),
    );

    this.#messenger.subscribe(
      'AccountTreeController:accountGroupRemoved',
      (groupId) => this.#handleAccountGroupRemoved(groupId),
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
    this.#forwardSelectedAccounts(
      groupId,
      this.#getAccountGroup(groupId)?.accounts,
    );
  }

  /**
   * Handles the keyring controller unlock event by forwarding the currently
   * selected account group's accounts to the Snap keyring.
   */
  #handleUnlock(): void {
    const groupId = this.#getSelectedAccountGroupId();
    this.#forwardSelectedAccounts(
      groupId,
      this.#getAccountGroup(groupId)?.accounts,
    );
  }

  /**
   * Handles created or updated account groups by forwarding the accounts of the currently
   * selected account group to the Snap keyring, if the created/updated group is currently selected.
   *
   * @param group - The account group being created or updated.
   */
  #handleAccountGroupCreatedOrUpdated(group: AccountGroupObject): void {
    if (group.id === this.#getSelectedAccountGroupId()) {
      this.#forwardSelectedAccounts(group.id, group.accounts);
    }
  }

  /**
   * Handles removed account groups by forwarding the accounts of the currently
   * selected account group to the Snap keyring, if the removed group is currently selected.
   *
   * @param groupId - The ID of the account group being removed.
   */
  #handleAccountGroupRemoved(groupId: AccountGroupId): void {
    if (groupId === this.#getSelectedAccountGroupId()) {
      this.#forwardSelectedAccounts(
        groupId,
        [], // Clearing accounts since the group is removed
      );
    }
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
   * 2. Runs the legacy -> v2 Snap keyring migration (cached — no-op if
   *    already done).
   * 3. Atomically creates the v2 keyring for this Snap if it doesn't exist
   *    yet.
   * 4. Waits for the Snap platform to be fully started.
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

    // Migrate from the global v1 Snap keyring to the per-Snap v2 keyring
    // before doing anything else.
    await this.migrate();

    // We still try to create the keyring for the Snap here, since we might
    // want to use a new Snap that never had accounts before.
    await this.#ensureKeyringIsReady(snapId);

    // Before doing anything with our Snap, we need to make sure the platform
    // is ready to process requests.
    await this.#watcher.ensureCanUseSnapPlatform();
  }

  /**
   * Migrate the legacy Snap keyring to the new (per-snap) Snap keyring v2.
   * Safe to call concurrently — the migration runs only once; all callers
   * await the same promise.
   *
   * @returns A promise that resolves when the migration is complete.
   */
  async migrate(): Promise<void> {
    if (this.#migrated) {
      return;
    }
    if (!this.#migratePromise) {
      this.#migratePromise = this.#migrate();

      try {
        await this.#migratePromise;

        // Only mark it as migrated after the migration logic completes successfully. If
        // it fails, we want future calls to retry the migration.
        this.#migrated = true;
      } finally {
        this.#migratePromise = null;
      }
    }
    await this.#migratePromise;
  }

  /**
   * Performs the actual migration logic. Should only be called once, and is not
   * safe to call concurrently.
   */
  async #migrate(): Promise<void> {
    log('Migration started...');

    await this.#messenger.call(
      'KeyringController:withController',
      async (controller) => {
        const { keyrings } = controller;

        const legacySnapKeyringEntry = keyrings.find(({ keyring }) =>
          isLegacySnapKeyring(keyring),
        );
        if (!legacySnapKeyringEntry) {
          log('No legacy Snap keyring found. Migration not required.');
          return;
        }

        // The legacy Snap keyring has never been a true `EthKeyring` so we
        // need to cast it to `unknown` first.
        const legacySnapKeyring =
          legacySnapKeyringEntry.keyring as unknown as LegacySnapKeyring;

        // Compute the account list for each Snap, grouped by snap ID.
        const states = new Map<SnapId, SnapKeyringState>();
        for (const internalAccount of legacySnapKeyring.listAccounts()) {
          // Convert `InternalAccount` to `KeyringAccount` since the Snap
          // keyring (v2) expects accounts in that format and will verify it
          // with `superstruct` when adding the keyring.
          const { metadata, ...account } = internalAccount;

          const snap = metadata?.snap;
          if (snap) {
            const snapId = snap.id as SnapId;

            let state = states.get(snapId);
            if (!state) {
              state = { snapId, accounts: {} };
              states.set(snapId, state);
            }
            state.accounts[account.id] = account;
          }
        }

        // Create the new Snap keyring (v2) for each Snap and migrate the
        // accounts over.
        for (const state of states.values()) {
          log(`Migrating accounts for Snap "${state.snapId}"...`);
          await controller.addNewKeyring(
            // IMPORTANT: The Snap keyring (v2) can also be used as a v1
            // keyring. So the builder associated with the v2 keyring type is
            // able to build both v1 and v2 keyrings.
            KeyringType.Snap,
            state,
          );
        }

        // Remove the legacy Snap keyring after migration.
        log('Removing legacy Snap keyring...');
        await controller.removeKeyring(legacySnapKeyringEntry.metadata.id);
      },
    );

    log('Migration completed!');
  }

  /**
   * Ensures a Snap keyring is ready for the given Snap. If it doesn't exist yet, it will be created.
   * Safe to call concurrently.
   *
   * @param snapId - The Snap ID to ensure the keyring is ready for.
   */
  async #ensureKeyringIsReady(snapId: SnapId): Promise<void> {
    await this.#messenger.call(
      'KeyringController:withController',
      async (controller) => {
        const hasKeyring = controller.keyrings.some(
          ({ keyringV2 }) =>
            keyringV2 &&
            isSnapKeyring(keyringV2) &&
            keyringV2.snapId === snapId,
        );

        if (!hasKeyring) {
          log(`Creating v2 keyring for Snap "${snapId}"...`);
          await controller.addNewKeyring(KeyringType.Snap, {
            snapId,
            accounts: {},
          });
        }
      },
    );
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
   * @param accounts - The accounts to forward. If not defined, this is a no-op.
   */
  #forwardSelectedAccounts(
    groupId: AccountGroupId | '',
    accounts: AccountId[] | undefined,
  ): void {
    if (!groupId) {
      log(
        'No selected account group, skipping forwarding selected accounts to Snap keyring.',
      );
      return;
    }

    if (!accounts) {
      log(
        `Account group ("${groupId}") has no accounts, skipping forwarding selected accounts to Snap keyring.`,
      );
      return;
    }

    const forwardSelectedAccounts = async (): Promise<void> => {
      if (accounts.length) {
        log(
          `Forwarding selected accounts (from "${groupId}"): ${accounts.join(', ')}`,
        );
      } else {
        log(`Clearing selected accounts (from "${groupId}")`);
      }

      const snapKeyring = await this.getLegacySnapKeyring();
      await snapKeyring.setSelectedAccounts(accounts);
    };

    // There is nothing we can do if forwarding fails. This will auto-recover on the next relevant event.
    forwardSelectedAccounts().catch((error) => {
      console.error('Error forwarding selected accounts:', error);
    });
  }

  /**
   * Gets the account group object for the given group ID.
   *
   * @param groupId - The ID of the account group.
   * @returns The account group object, or undefined if the group ID is empty or the group does not exist.
   */
  #getAccountGroup(
    groupId: AccountGroupId | '',
  ): AccountGroupObject | undefined {
    if (!groupId) {
      return undefined;
    }

    return this.#messenger.call(
      'AccountTreeController:getAccountGroupObject',
      groupId,
    );
  }

  /**
   * Gets the currently selected account group ID.
   *
   * @returns The currently selected account group ID, or an empty string if
   * there is no selected account group.
   */
  #getSelectedAccountGroupId(): AccountGroupId | '' {
    return this.#messenger.call(
      'AccountTreeController:getSelectedAccountGroup',
    );
  }
}
