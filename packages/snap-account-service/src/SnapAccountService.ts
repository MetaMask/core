import { AccountGroupId } from '@metamask/account-api';
import {
  SnapKeyring as LegacySnapKeyring,
  SnapMessage,
} from '@metamask/eth-snap-keyring';
import {
  SnapKeyring,
  SnapKeyringState,
  isSnapKeyring,
} from '@metamask/eth-snap-keyring/v2';
import type {
  AccountAssetListUpdatedEventPayload,
  AccountBalancesUpdatedEventPayload,
  AccountTransactionsUpdatedEventPayload,
  Balance,
  CaipAssetType,
  CaipAssetTypeOrId,
  CaipChainId,
  Pagination,
  ResolvedAccountAddress,
  TransactionsPage,
} from '@metamask/keyring-api';
import {
  AccountAssetListUpdatedEventStruct,
  AccountBalancesUpdatedEventStruct,
  AccountTransactionsUpdatedEventStruct,
  KeyringEvent,
} from '@metamask/keyring-api';
import { KeyringType } from '@metamask/keyring-api/v2';
import type { KeyringCapabilities } from '@metamask/keyring-api/v2';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerUnlockEvent,
  KeyringControllerWithControllerAction,
  KeyringControllerWithKeyringV2Action,
  KeyringControllerWithKeyringV2UnsafeAction,
} from '@metamask/keyring-controller';
import {
  isKeyringNotFoundError,
  KeyringTypes,
} from '@metamask/keyring-controller';
import type { KeyringInternalSnapClientMessenger } from '@metamask/keyring-internal-snap-client';
import { KeyringInternalSnapClient } from '@metamask/keyring-internal-snap-client/v2';
import { SnapManageAccountsMethod } from '@metamask/keyring-snap-sdk';
import type {
  AccountId,
  BaseKeyring,
  JsonRpcRequest,
} from '@metamask/keyring-utils';
import type { Messenger } from '@metamask/messenger';
import type {
  SnapControllerGetRunnableSnapsAction,
  SnapControllerGetSnapAction,
  SnapControllerGetStateAction,
  SnapControllerHandleRequestAction,
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

import { projectLogger as log } from './logger.js';
import type {
  SnapAccountServiceEnsureReadyAction,
  SnapAccountServiceEnsureMigratedAction,
  SnapAccountServiceGetCapabilitiesAction,
  SnapAccountServiceGetAccountAssetsAction,
  SnapAccountServiceGetAccountBalancesAction,
  SnapAccountServiceGetAccountTransactionsAction,
  SnapAccountServiceGetSnapsAction,
  SnapAccountServiceHandleKeyringSnapMessageAction,
  SnapAccountServiceResolveAccountAddressAction,
  SnapAccountServiceSetSelectedAccountsAction,
} from './SnapAccountService-method-action-types.js';
import { SnapPlatformWatcher } from './SnapPlatformWatcher.js';
import type { SnapPlatformWatcherConfig } from './SnapPlatformWatcher.js';
import { SnapTracker } from './SnapTracker.js';
import type {
  AccountTreeControllerGetAccountGroupObjectAction,
  AccountTreeControllerGetSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
  AccountTreeControllerAccountGroupCreatedEvent,
  AccountTreeControllerAccountGroupUpdatedEvent,
  AccountTreeControllerAccountGroupRemovedEvent,
  AccountGroupObject,
} from './types.js';

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
  'ensureMigrated',
  'ensureReady',
  'getCapabilities',
  'getAccountAssets',
  'getAccountBalances',
  'getAccountTransactions',
  'getSnaps',
  'handleKeyringSnapMessage',
  'resolveAccountAddress',
  'setSelectedAccounts',
] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions =
  | SnapAccountServiceEnsureMigratedAction
  | SnapAccountServiceEnsureReadyAction
  | SnapAccountServiceGetCapabilitiesAction
  | SnapAccountServiceGetAccountAssetsAction
  | SnapAccountServiceGetAccountBalancesAction
  | SnapAccountServiceGetAccountTransactionsAction
  | SnapAccountServiceGetSnapsAction
  | SnapAccountServiceHandleKeyringSnapMessageAction
  | SnapAccountServiceResolveAccountAddressAction
  | SnapAccountServiceSetSelectedAccountsAction;

/**
 * Actions from other messengers that {@link SnapAccountService} calls.
 */
type AllowedActions =
  | SnapControllerGetStateAction
  | SnapControllerGetSnapAction
  | SnapControllerGetRunnableSnapsAction
  | SnapControllerHandleRequestAction
  | KeyringControllerGetStateAction
  | KeyringControllerWithControllerAction
  | KeyringControllerWithKeyringV2Action
  | KeyringControllerWithKeyringV2UnsafeAction
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

/**
 * Account data update events that can be forwarded from Snaps.
 *
 * These events are then re-emitted by the service for other consumers.
 */
type AccountDataUpdatedKeyringEvent =
  | KeyringEvent.AccountAssetListUpdated
  | KeyringEvent.AccountBalancesUpdated
  | KeyringEvent.AccountTransactionsUpdated;

/**
 * Checks if a Snap message method is an account data update event.
 *
 * @param event - The Snap message event.
 * @returns `true` if the method can be forwarded without the legacy Snap keyring.
 */
function isAccountDataUpdatedKeyringEvent(
  event: string,
): event is AccountDataUpdatedKeyringEvent {
  return (
    event === KeyringEvent.AccountAssetListUpdated ||
    event === KeyringEvent.AccountBalancesUpdated ||
    event === KeyringEvent.AccountTransactionsUpdated
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

  readonly #client: KeyringInternalSnapClient;

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
    this.#client = new KeyringInternalSnapClient({
      messenger: messenger.buildChild({
        namespace: 'KeyringInternalSnapClient',
        actions: ['SnapController:handleRequest'],
        // `keyring-internal-snap-client` depends on `@metamask/messenger@^1.1.1`
        // while this package uses v2. Both versions are structurally identical
        // but TypeScript's `#private` field check rejects cross-version assignment.
      }) as unknown as KeyringInternalSnapClientMessenger,
    });

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
    void this.#forwardSelectedAccounts(
      groupId,
      this.#getAccountGroup(groupId)?.accounts,
    );
  }

  /**
   * Handles the keyring controller unlock event by triggering the migration
   * and forwarding the currently selected account group's accounts to the Snap
   * keyring.
   */
  #handleUnlock(): void {
    void this.ensureMigrated()
      .then(async () => {
        // If the migration is successful, we re-forward the current groups to each new keyrings!
        const groupId = this.#getSelectedAccountGroupId();
        return await this.#forwardSelectedAccounts(
          groupId,
          this.#getAccountGroup(groupId)?.accounts,
        );
      })
      .catch((error) => {
        console.error('Migration failed after unlock:', error);
      });
  }

  /**
   * Handles created or updated account groups by forwarding the accounts of the currently
   * selected account group to the Snap keyring, if the created/updated group is currently selected.
   *
   * @param group - The account group being created or updated.
   */
  #handleAccountGroupCreatedOrUpdated(group: AccountGroupObject): void {
    if (group.id === this.#getSelectedAccountGroupId()) {
      void this.#forwardSelectedAccounts(group.id, group.accounts);
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
      void this.#forwardSelectedAccounts(
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
   * 2. Asserts that the legacy -> v2 migration has been triggered (expected to
   *    happen at `KeyringController:unlock` time).
   * 3. Atomically creates the v2 keyring for this Snap if it doesn't exist
   *    yet.
   * 4. Waits for the Snap platform to be fully started.
   *
   * Safe to call concurrently — each step is idempotent or mutex-protected.
   *
   * @param snapId - ID of the Snap to ensure readiness for.
   * @throws If `snapId` is not a tracked account-management Snap.
   * @throws If the migration has not been triggered yet (wallet not unlocked).
   */
  async ensureReady(snapId: SnapId): Promise<void> {
    if (!this.#tracker.canUse(snapId)) {
      throw new Error(`Unknown snap: "${snapId}"`);
    }

    // The migration is required to ensure the v2 keyring exists.
    await this.ensureMigrated();

    // We still try to create the keyring for the Snap here, since we might
    // want to use a new Snap that never had accounts before.
    await this.#ensureKeyringIsReady(snapId);

    // Before doing anything with our Snap, we need to make sure the platform
    // is ready to process requests.
    await this.#watcher.ensureCanUseSnapPlatform();
  }

  /**
   * Migrate the legacy Snap keyring to the new (per-snap) Snap keyring v2.
   * Expected to be triggered at `KeyringController:unlock` time.
   * Safe to call concurrently — the migration runs only once; all callers
   * await the same promise.
   *
   * @returns A promise that resolves when the migration is complete.
   */
  async ensureMigrated(): Promise<void> {
    if (this.#migrated) {
      return;
    }

    if (!this.#migratePromise) {
      this.#migratePromise = this.#migrate()
        .then(() => {
          this.#migrated = true;
          return undefined;
        })
        .catch((error) => {
          // Clear the promise so the next call can retry.
          this.#migratePromise = null;
          throw error;
        });
    }

    await this.#migratePromise;
  }

  /**
   * Performs the actual migration logic. Should only be called once, and is not
   * safe to call concurrently.
   */
  async #migrate(): Promise<void> {
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

        log('Migration started...');

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

        log('Migration completed!');
      },
    );
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
   * Shared body for {@link SnapAccountService.#withKeyringV2} and
   * {@link SnapAccountService.#withKeyringV2Unsafe}. Hides the per-Snap
   * filter and the cast back to {@link SnapKeyring} (the messenger action's
   * callback receives a generic `Keyring`; the selector's type predicate
   * doesn't flow through the messenger's generics).
   *
   * @param action - The messenger action to invoke.
   * @param snapId - The Snap ID to look up the keyring for.
   * @param operation - The operation to run with the matching keyring.
   * @returns The result of the operation.
   */
  async #withKeyringV2Call<Result>(
    action:
      | 'KeyringController:withKeyringV2'
      | 'KeyringController:withKeyringV2Unsafe',
    snapId: SnapId,
    operation: (keyring: SnapKeyring) => Promise<Result>,
  ): Promise<Result> {
    return this.#messenger.call(
      action,
      {
        filter: (keyring): keyring is SnapKeyring =>
          isSnapKeyring(keyring) && keyring.snapId === snapId,
      },
      async ({ keyring }) => operation(keyring as SnapKeyring),
    ) as Result;
  }

  /**
   * Lock-free variant of {@link SnapAccountService.#withKeyringV2}. Only use
   * for operations that do not mutate keyring or controller state — see
   * `KeyringController.withKeyringV2Unsafe` for the contract.
   *
   * @param snapId - The Snap ID to look up the keyring for.
   * @param operation - The operation to run with the matching keyring.
   * @returns The result of the operation.
   */
  async #withKeyringV2Unsafe<Result>(
    snapId: SnapId,
    operation: (keyring: SnapKeyring) => Promise<Result>,
  ): Promise<Result> {
    return this.#withKeyringV2Call(
      'KeyringController:withKeyringV2Unsafe',
      snapId,
      operation,
    );
  }

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
  async getCapabilities(snapId: SnapId): Promise<KeyringCapabilities> {
    return this.#withKeyringV2Unsafe(
      snapId,
      async (keyring) => keyring.capabilities,
    );
  }

  /**
   * Returns the CAIP-19 asset type/ID list supported by an account.
   *
   * @param snapId - ID of the Snap.
   * @param id - ID of the account.
   * @returns A promise resolving to the list of supported CAIP-19 asset type/IDs.
   */
  async getAccountAssets(
    snapId: SnapId,
    id: AccountId,
  ): Promise<CaipAssetTypeOrId[]> {
    await this.ensureReady(snapId);
    return this.#client.withSnapId(snapId).getAccountAssets(id);
  }

  /**
   * Returns the balances for an account for the requested asset types.
   *
   * @param snapId - ID of the Snap.
   * @param id - ID of the account.
   * @param assets - List of CAIP-19 fungible asset types to fetch balances for.
   * @returns A promise resolving to a map of asset type to balance.
   */
  async getAccountBalances(
    snapId: SnapId,
    id: AccountId,
    assets: CaipAssetType[],
  ): Promise<Record<CaipAssetType, Balance>> {
    await this.ensureReady(snapId);
    return this.#client.withSnapId(snapId).getAccountBalances(id, assets);
  }

  /**
   * Returns a page of transactions for an account.
   *
   * @param snapId - ID of the Snap.
   * @param id - ID of the account.
   * @param pagination - Pagination options.
   * @returns A promise resolving to a page of transactions.
   */
  async getAccountTransactions(
    snapId: SnapId,
    id: AccountId,
    pagination: Pagination,
  ): Promise<TransactionsPage> {
    await this.ensureReady(snapId);
    return this.#client
      .withSnapId(snapId)
      .getAccountTransactions(id, pagination);
  }

  /**
   * Resolves the account address to use for routing a signing request.
   *
   * @param snapId - ID of the Snap.
   * @param scope - CAIP-2 chain ID of the signing request.
   * @param request - The signing JSON-RPC request.
   * @returns A promise resolving to the resolved address, or `null` if the
   * Snap cannot determine an address for this request.
   */
  async resolveAccountAddress(
    snapId: SnapId,
    scope: CaipChainId,
    request: JsonRpcRequest,
  ): Promise<ResolvedAccountAddress | null> {
    await this.ensureReady(snapId);
    return this.#client
      .withSnapId(snapId)
      .resolveAccountAddress(scope, request);
  }

  /**
   * Notifies a Snap of the currently selected accounts.
   *
   * For v1 Snaps the call goes through the keyring (signing interface); for
   * v2 Snaps it is routed via the RPC client because the keyring only covers
   * keyring-only operations (signing, account lifecycle).
   *
   * @param snapId - ID of the Snap.
   * @param accounts - IDs of the accounts to mark as selected.
   */
  async setSelectedAccounts(
    snapId: SnapId,
    accounts: AccountId[],
  ): Promise<void> {
    await this.ensureReady(snapId);
    await this.#withKeyringV2Unsafe(snapId, async (keyring) => {
      await this.#setSelectedAccountsForKeyring(snapId, keyring, accounts);
    });
  }

  /**
   * Dispatches a `setSelectedAccounts` call to the correct layer based on
   * whether the keyring has a v1 interface or not.
   *
   * The keyring is a pure interface for keyring-only operations (signing,
   * account lifecycle). Extra Snap-level methods like `setSelectedAccounts`
   * are invoked via the client for v2 Snaps, which communicates with the Snap
   * over RPC.
   *
   * @param snapId - ID of the Snap.
   * @param keyring - The Snap keyring (v2) instance.
   * @param accounts - IDs of the accounts to mark as selected.
   */
  async #setSelectedAccountsForKeyring(
    snapId: SnapId,
    keyring: SnapKeyring,
    accounts: AccountId[],
  ): Promise<void> {
    if (keyring.v1) {
      // We used to keep track of selected accounts in the v1 keyring, so we need to forward the call there for v1 Snaps.
      await keyring.v1.setSelectedAccounts(accounts);
    } else {
      await this.#client.withSnapId(snapId).setSelectedAccounts(accounts);
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
    const { method: event } = message;
    if (isAccountDataUpdatedKeyringEvent(event)) {
      return this.#publishAccountDataUpdatedEvent(snapId, event, message);
    }

    // Handle specific methods.
    if (message.method === SnapManageAccountsMethod.GetSelectedAccounts) {
      const groupId = this.#getSelectedAccountGroupId();
      const accounts = this.#getAccountGroup(groupId)?.accounts ?? [];

      try {
        return await this.#withKeyringV2Unsafe(snapId, async (keyring) =>
          accounts.filter((id) => keyring.hasAccount(id)),
        );
      } catch (error) {
        if (isKeyringNotFoundError(error)) {
          // Some Snaps might be using `getSelectedAccounts` early in their lifecycle, before the keyring is created. So we
          // do not throw in that case to avoid disrupting their initialization process.
          return [];
        }

        throw error;
      }
    }

    log(
      `Forwarding message "${event}" from Snap "${snapId}" to its keyring...`,
    );

    // We can create a new keyring if the message is an AccountCreated event.
    const isAccountCreatedMessage = event === KeyringEvent.AccountCreated;

    // Create the Snap keyring if it doesn't exist yet (in an atomic way). We cannot assume
    // the keyring exists (e.g for the MMI Snap).
    // NOTE: We only auto-create it for v1 account creation flows.
    if (isAccountCreatedMessage) {
      await this.ensureReady(snapId);
    }

    // This part of the flow relies on v1 flows, but v2 keyrings are compatible with those messages
    // too.
    try {
      // NOTE: We use "unsafe" here since none of the messages should trigger mutations to the keyring state.
      // The exception might be `:accountCreated`, but even in that case, the mutation is handled differently
      // in the client by call `:persistAllKeyrings` explicitly.
      // Using `:withKeyringV2` would cause a deadlock when we're initiating operations like `removeAccount` from
      // the keyring itself:
      // 1: withKeyring(..., ({ keyring }) => { keyring.removeAccount(...) })
      // 2. removeAccount(...) -> handleKeyringSnapMessage(..., { method: 'accountRemoved', ... })
      // 3. handleKeyringSnapMessage tries to acquire the same lock again via withKeyringV2 -> deadlock.
      return await this.#withKeyringV2Unsafe(snapId, async (keyring) => {
        if (!keyring.v1) {
          log(
            `Received message "${event}" for Snap "${snapId}", but that's a v2 keyring... Rejecting.`,
          );

          throw new Error(
            `Cannot delegate keyring Snap message, keyring for Snap "${snapId}" is v2, not v1.`,
          );
        }

        return await keyring.v1.handleKeyringSnapMessage(message);
      });
    } catch (error) {
      if (isKeyringNotFoundError(error)) {
        log(
          `No Snap keyring found for Snap "${snapId}". Cannot handle message with method "${event}".`,
        );

        throw new Error(
          `Cannot delegate keyring Snap message, keyring does not exist yet for Snap "${snapId}".`,
        );
      }

      throw error;
    }
  }

  /**
   * Publishes an account data update event from a Snap.
   *
   * @param snapId - ID of the Snap.
   * @param event - Account data update event.
   * @param message - Message sent by the Snap.
   * @returns `null`.
   */
  #publishAccountDataUpdatedEvent(
    snapId: SnapId,
    event: AccountDataUpdatedKeyringEvent,
    message: SnapMessage,
  ): null {
    log(
      `Forwarding message "${event}" from Snap "${snapId}" as a SnapAccountService event...`,
    );

    if (event === KeyringEvent.AccountAssetListUpdated) {
      assertStruct(message, AccountAssetListUpdatedEventStruct);
      this.#messenger.publish(
        'SnapAccountService:accountAssetListUpdated',
        message.params,
      );
    } else if (event === KeyringEvent.AccountBalancesUpdated) {
      assertStruct(message, AccountBalancesUpdatedEventStruct);
      this.#messenger.publish(
        'SnapAccountService:accountBalancesUpdated',
        message.params,
      );
    } else if (event === KeyringEvent.AccountTransactionsUpdated) {
      assertStruct(message, AccountTransactionsUpdatedEventStruct);
      this.#messenger.publish(
        'SnapAccountService:accountTransactionsUpdated',
        message.params,
      );
    }

    // We need to return a valid JSON value, so we cannot use `undefined` here.
    return null;
  }

  // eslint-disable-next-line jsdoc/require-returns
  /**
   * Forwards the accounts of the given account group to the Snap keyring.
   *
   * @param groupId - The ID of the account group whose accounts should be
   * forwarded. If empty, this is a no-op.
   * @param accounts - The accounts to forward. If not defined, this is a no-op.
   */
  async #forwardSelectedAccounts(
    groupId: AccountGroupId | '',
    accounts: AccountId[] | undefined,
  ): Promise<void> {
    const skipping = (reason: string): void =>
      log(`${reason}, skipping forwarding selected accounts to Snap keyring`);

    if (!this.#migrated) {
      return skipping('Not migrated yet');
    }

    if (!groupId) {
      return skipping('No selected account group');
    }

    if (!accounts) {
      return skipping(`Account group ("${groupId}") has no accounts`);
    }

    const forwardSelectedAccounts = async (): Promise<void> => {
      if (accounts.length) {
        log(
          `Forwarding selected accounts (from "${groupId}"): ${accounts.join(', ')}`,
        );
      } else {
        log(`Clearing selected accounts (from "${groupId}")`);
      }

      await Promise.all(
        this.#tracker.getSnaps().map(async (snapId) => {
          try {
            // We can safely invoke this method without taking the controller lock
            // because it should not mutate the keyring state. So we can use
            // `withKeyringV2Unsafe` in this case.
            await this.#withKeyringV2Unsafe(snapId, async (keyring) => {
              // The group's accounts may belong to several Snaps; only
              // forward the subset this Snap actually owns. An empty
              // subset still gets forwarded to explicitly clear the
              // Snap selected accounts.
              const snapAccounts = accounts.filter((id) =>
                keyring.hasAccount(id),
              );
              await this.#setSelectedAccountsForKeyring(
                snapId,
                keyring,
                snapAccounts,
              );
            });
          } catch (error) {
            // Tracked Snaps without a v2 keyring yet are expected —
            // forwarding will resume on the next event once `ensureReady`
            // has run.
            if (!isKeyringNotFoundError(error)) {
              console.error(
                `Error forwarding selected accounts to Snap "${snapId}":`,
                error,
              );
            }
          }
        }),
      );
    };

    // There is nothing we can do if forwarding fails. This will auto-recover on the next relevant event.
    return await forwardSelectedAccounts().catch((error) => {
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
