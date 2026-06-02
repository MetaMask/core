import { AccountGroupId } from '@metamask/account-api';
import {
  SnapKeyring as LegacySnapKeyring,
  SnapMessage,
} from '@metamask/eth-snap-keyring';
import type {
  AccountAssetListUpdatedEventPayload,
  AccountBalancesUpdatedEventPayload,
  AccountTransactionsUpdatedEventPayload,
} from '@metamask/keyring-api';
import {
  AccountAssetListUpdatedEventStruct,
  AccountBalancesUpdatedEventStruct,
  AccountTransactionsUpdatedEventStruct,
  KeyringEvent,
} from '@metamask/keyring-api';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerUnlockEvent,
  KeyringControllerWithControllerAction,
  KeyringEntry,
} from '@metamask/keyring-controller';
import {
  isKeyringNotFoundError,
  KeyringTypes,
} from '@metamask/keyring-controller';
import { KeyringControllerWithKeyringUnsafeAction } from '@metamask/keyring-controller';
import { SnapManageAccountsMethod } from '@metamask/keyring-snap-sdk';
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
import { assertStruct } from '@metamask/utils';

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
  | KeyringControllerWithKeyringUnsafeAction
  | AccountTreeControllerGetAccountGroupObjectAction
  | AccountTreeControllerGetSelectedAccountGroupAction;

/**
 * Events that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceAccountBalancesUpdatedEvent = {
  type: `${typeof serviceName}:accountBalancesUpdated`;
  payload: [AccountBalancesUpdatedEventPayload];
};

export type SnapAccountServiceAccountAssetListUpdatedEvent = {
  type: `${typeof serviceName}:accountAssetListUpdated`;
  payload: [AccountAssetListUpdatedEventPayload];
};

export type SnapAccountServiceAccountTransactionsUpdatedEvent = {
  type: `${typeof serviceName}:accountTransactionsUpdated`;
  payload: [AccountTransactionsUpdatedEventPayload];
};

export type SnapAccountServiceEvents =
  | SnapAccountServiceAccountAssetListUpdatedEvent
  | SnapAccountServiceAccountBalancesUpdatedEvent
  | SnapAccountServiceAccountTransactionsUpdatedEvent;

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

type AccountDataUpdatedKeyringEvent =
  | KeyringEvent.AccountAssetListUpdated
  | KeyringEvent.AccountBalancesUpdated
  | KeyringEvent.AccountTransactionsUpdated;

/**
 * Checks if a Snap message method is an account data update event.
 *
 * @param method - The Snap message method.
 * @returns `true` if the method can be forwarded without the legacy Snap keyring.
 */
function isAccountDataUpdatedKeyringEvent(
  method: string,
): method is AccountDataUpdatedKeyringEvent {
  return (
    method === KeyringEvent.AccountAssetListUpdated ||
    method === KeyringEvent.AccountBalancesUpdated ||
    method === KeyringEvent.AccountTransactionsUpdated
  );
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

    // This is a fast-path for the common case where the keyring already exists, to avoid the
    // overhead of acquiring the `KeyringController` mutex if we don't need to.
    // NOTE: If it doesn't exist, we'll create it **safely** with `:withController` (which was
    // not the case with the previous client's implementation).
    const exists = await this.#getLegacySnapKeyringIfAvailable();
    if (exists) {
      return exists;
    }

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
   * Gets the legacy (v1) Snap keyring but do not auto-create it if it doesn't exist.
   *
   * @returns The existing Snap keyring instance, or undefined if it doesn't exist.
   */
  async #getLegacySnapKeyringIfAvailable(): Promise<
    LegacySnapKeyring | undefined
  > {
    type Result = {
      snapKeyring: LegacySnapKeyring;
    };

    try {
      const result = await this.#messenger.call(
        'KeyringController:withKeyringUnsafe',
        { filter: isLegacySnapKeyring },
        async ({ keyring }): Promise<Result> => {
          // The legacy Snap keyring is not compatible with `EthKeyring`, so we need to cast here.
          return { snapKeyring: keyring } as unknown as Result;
        },
      );

      return (result as Result).snapKeyring;
    } catch (error) {
      if (isKeyringNotFoundError(error)) {
        log('Legacy Snap keyring not available yet.');
        return undefined;
      }

      throw error;
    }
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
    const { method } = message;

    if (isAccountDataUpdatedKeyringEvent(method)) {
      return this.#publishAccountDataUpdatedEvent(snapId, method, message);
    }

    let snapKeyring: LegacySnapKeyring | undefined =
      await this.#getLegacySnapKeyringIfAvailable();

    // Handle specific methods first.
    if (message.method === SnapManageAccountsMethod.GetSelectedAccounts) {
      if (snapKeyring) {
        // The legacy Snap keyring already maintain a local list of selected accounts per Snaps, so we
        // just delegate the call.
        return snapKeyring.handleKeyringSnapMessage(snapId, message);
      }

      // Some Snaps might be using `getSelectedAccounts` early in their lifecycle, before the keyring is created. So we
      // do not throw in that case to avoid disrupting their initialization process.
      return [];
    }

    const event = message.method as KeyringEvent; // We assume the Snap platform always sends a valid `KeyringEvent` here.
    log(
      `Forwarding message "${event}" from Snap "${snapId}" to its keyring...`,
    );

    // We can create a new keyring if the message is an AccountCreated event.
    const isAccountCreatedMessage = event === KeyringEvent.AccountCreated;

    // Create the Snap keyring if it doesn't exist yet (in an atomic way). We cannot assume
    // the keyring exists (e.g for the MMI Snap).
    // NOTE: We only auto-create it for v1 account creation flows.
    if (isAccountCreatedMessage && !snapKeyring) {
      snapKeyring = await this.getLegacySnapKeyring();
    }

    if (!snapKeyring) {
      throw new Error(
        `Legacy Snap keyring does not exist yet for snap "${snapId}".`,
      );
    }

    return snapKeyring.handleKeyringSnapMessage(snapId, message);
  }

  /**
   * Publishes an account data update event from a Snap.
   *
   * @param snapId - ID of the Snap.
   * @param method - Account data update event method.
   * @param message - Message sent by the Snap.
   * @returns `null`.
   */
  #publishAccountDataUpdatedEvent(
    snapId: SnapId,
    method: AccountDataUpdatedKeyringEvent,
    message: SnapMessage,
  ): null {
    log(
      `Forwarding message "${method}" from Snap "${snapId}" as a SnapAccountService event...`,
    );

    if (method === KeyringEvent.AccountAssetListUpdated) {
      assertStruct(message, AccountAssetListUpdatedEventStruct);
      this.#messenger.publish(
        'SnapAccountService:accountAssetListUpdated',
        message.params,
      );
      return null;
    }

    if (method === KeyringEvent.AccountBalancesUpdated) {
      assertStruct(message, AccountBalancesUpdatedEventStruct);
      this.#messenger.publish(
        'SnapAccountService:accountBalancesUpdated',
        message.params,
      );
      return null;
    }

    assertStruct(message, AccountTransactionsUpdatedEventStruct);
    this.#messenger.publish(
      'SnapAccountService:accountTransactionsUpdated',
      message.params,
    );
    return null;
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

      const snapKeyring = await this.#getLegacySnapKeyringIfAvailable();
      if (!snapKeyring) {
        log(
          'No legacy Snap keyring available, skipping forwarding selected accounts.',
        );
        return;
      }

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
