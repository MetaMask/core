import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerListAccountsAction,
  AccountsControllerAccountRemovedEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { Mutex } from 'async-mutex';

import type { ProfileMetricsServiceMethodActions } from '.';
import type { AccountWithScopes } from './ProfileMetricsService';

/**
 * The name of the {@link ProfileMetricsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'ProfileMetricsController';

/**
 * Describes the shape of the state object for {@link ProfileMetricsController}.
 */
export type ProfileMetricsControllerState = {
  /**
   * Whether existing accounts have been added
   * to the queue.
   */
  initialEnqueueCompleted: boolean;
  /**
   * The queue of accounts to be synced.
   * Each key is an entropy source ID, and each value is an array of account
   * addresses associated with that entropy source. Accounts with no entropy
   * source ID are grouped under the key "null".
   */
  syncQueue: Record<string, AccountWithScopes[]>;
};

/**
 * The metadata for each property in {@link ProfileMetricsControllerState}.
 */
const profileMetricsControllerMetadata = {
  initialEnqueueCompleted: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: false,
  },
  syncQueue: {
    persist: true,
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    usedInUi: false,
  },
} satisfies StateMetadata<ProfileMetricsControllerState>;

/**
 * Constructs the default {@link ProfileMetricsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link ProfileMetricsController} state.
 */
export function getDefaultProfileMetricsControllerState(): ProfileMetricsControllerState {
  return {
    initialEnqueueCompleted: false,
    syncQueue: {},
  };
}

const MESSENGER_EXPOSED_METHODS = [] as const;

/**
 * Retrieves the state of the {@link ProfileMetricsController}.
 */
export type ProfileMetricsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ProfileMetricsControllerState
>;

/**
 * Actions that {@link ProfileMetricsControllerMessenger} exposes to other consumers.
 */
export type ProfileMetricsControllerActions =
  | ProfileMetricsControllerGetStateAction
  | ProfileMetricsServiceMethodActions;

/**
 * Actions from other messengers that {@link ProfileMetricsControllerMessenger} calls.
 */
type AllowedActions =
  | ProfileMetricsServiceMethodActions
  | AccountsControllerListAccountsAction;

/**
 * Published when the state of {@link ProfileMetricsController} changes.
 */
export type ProfileMetricsControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    ProfileMetricsControllerState
  >;

/**
 * Events that {@link ProfileMetricsControllerMessenger} exposes to other consumers.
 */
export type ProfileMetricsControllerEvents =
  ProfileMetricsControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ProfileMetricsControllerMessenger} subscribes
 * to.
 */
type AllowedEvents =
  | KeyringControllerUnlockEvent
  | KeyringControllerLockEvent
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ProfileMetricsController}.
 */
export type ProfileMetricsControllerMessenger = Messenger<
  typeof controllerName,
  ProfileMetricsControllerActions | AllowedActions,
  ProfileMetricsControllerEvents | AllowedEvents
>;

export class ProfileMetricsController extends StaticIntervalPollingController()<
  typeof controllerName,
  ProfileMetricsControllerState,
  ProfileMetricsControllerMessenger
> {
  readonly #mutex = new Mutex();

  readonly #assertUserOptedIn: () => boolean;

  readonly #getMetaMetricsId: () => string;

  /**
   * Constructs a new {@link ProfileMetricsController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   * @param args.assertUserOptedIn - A function that asserts whether the user has
   * opted in to user profile features. If the user has not opted in, sync
   * operations will be no-ops.
   * @param args.getMetaMetricsId - A function that returns the MetaMetrics ID
   * of the user.
   * @param args.interval - The interval, in milliseconds, at which the controller will
   * attempt to send user profile data. Defaults to 10 seconds.
   */
  constructor({
    messenger,
    state,
    assertUserOptedIn,
    getMetaMetricsId,
    interval = 10 * 1000,
  }: {
    messenger: ProfileMetricsControllerMessenger;
    state?: Partial<ProfileMetricsControllerState>;
    interval?: number;
    assertUserOptedIn: () => boolean;
    getMetaMetricsId: () => string;
  }) {
    super({
      messenger,
      metadata: profileMetricsControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultProfileMetricsControllerState(),
        ...state,
      },
    });

    this.#assertUserOptedIn = assertUserOptedIn;
    this.#getMetaMetricsId = getMetaMetricsId;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.messenger.subscribe('KeyringController:unlock', () => {
      this.startPolling(null);
      this.#queueFirstSyncIfNeeded().catch(console.error);
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.stopAllPolling();
    });

    this.messenger.subscribe('AccountsController:accountAdded', (account) => {
      this.#addAccountToQueue(account).catch(console.error);
    });

    this.messenger.subscribe('AccountsController:accountRemoved', (account) => {
      this.#removeAccountFromQueue(account).catch(console.error);
    });

    this.setIntervalLength(interval);
  }

  /**
   * Execute a single poll to sync user profile data.
   *
   * The queued accounts are sent to the ProfileMetricsService, and the sync
   * queue is cleared. This operation is mutexed to prevent concurrent
   * executions.
   *
   * @returns A promise that resolves when the poll is complete.
   */
  async _executePoll(): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      if (!this.#assertUserOptedIn()) {
        return;
      }
      for (const [entropySourceId, accounts] of Object.entries(
        this.state.syncQueue,
      )) {
        try {
          await this.messenger.call('ProfileMetricsService:submitMetrics', {
            metametricsId: this.#getMetaMetricsId(),
            entropySourceId:
              entropySourceId === 'null' ? null : entropySourceId,
            accounts,
          });
          this.update((state) => {
            delete state.syncQueue[entropySourceId];
          });
        } catch (error) {
          // We want to log the error but continue processing other batches.
          console.error(
            `Failed to submit profile metrics for entropy source ID ${entropySourceId}:`,
            error,
          );
        }
      }
    });
  }

  /**
   * Add existing accounts to the sync queue if it has not been done yet.
   *
   * This method ensures that the first sync is only executed once,
   * and only if the user has opted in to user profile features.
   */
  async #queueFirstSyncIfNeeded(): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      if (this.state.initialEnqueueCompleted) {
        return;
      }
      const newGroupedAccounts = groupAccountsByEntropySourceId(
        this.messenger.call('AccountsController:listAccounts'),
      );
      this.update((state) => {
        for (const key of Object.keys(newGroupedAccounts)) {
          if (!state.syncQueue[key]) {
            state.syncQueue[key] = [];
          }
          state.syncQueue[key].push(...newGroupedAccounts[key]);
        }
        state.initialEnqueueCompleted = true;
      });
    });
  }

  /**
   * Queue the given account to be synced at the next poll.
   *
   * @param account - The account to sync.
   */
  async #addAccountToQueue(account: InternalAccount): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      this.update((state) => {
        const entropySourceId = getAccountEntropySourceId(account) ?? 'null';
        if (!state.syncQueue[entropySourceId]) {
          state.syncQueue[entropySourceId] = [];
        }
        state.syncQueue[entropySourceId].push({
          address: account.address,
          scopes: account.scopes,
        });
      });
    });
  }

  /**
   * Remove the given account from the sync queue.
   *
   * @param account - The account address to remove.
   */
  async #removeAccountFromQueue(account: string): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      this.update((state) => {
        for (const [entropySourceId, groupedAddresses] of Object.entries(
          state.syncQueue,
        )) {
          const index = groupedAddresses.findIndex(
            ({ address }) => address === account,
          );
          if (index === -1) {
            continue;
          }
          groupedAddresses.splice(index, 1);
          if (groupedAddresses.length === 0) {
            delete state.syncQueue[entropySourceId];
          }
          break;
        }
      });
    });
  }
}

/**
 * Retrieves the entropy source ID from the given account, if it exists.
 *
 * @param account - The account from which to retrieve the entropy source ID.
 * @returns The entropy source ID, or null if it does not exist.
 */
function getAccountEntropySourceId(account: InternalAccount): string | null {
  if (account.options.entropy?.type === 'mnemonic') {
    return account.options.entropy.id;
  }
  return null;
}

/**
 * Groups accounts by their entropy source ID.
 *
 * @param accounts - The accounts to group.
 * @returns An object where each key is an entropy source ID and each value is
 * an array of account addresses associated with that entropy source ID.
 */
function groupAccountsByEntropySourceId(
  accounts: InternalAccount[],
): Record<string, AccountWithScopes[]> {
  return accounts.reduce(
    (result: Record<string, AccountWithScopes[]>, account) => {
      const entropySourceId = getAccountEntropySourceId(account);
      const key = entropySourceId ?? 'null';
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push({ address: account.address, scopes: account.scopes });
      return result;
    },
    {},
  );
}
