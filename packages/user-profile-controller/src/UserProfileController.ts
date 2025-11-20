import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type { KeyringControllerUnlockEvent } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { Mutex } from 'async-mutex';

import type { UserProfileServiceMethodActions } from '.';

/**
 * The name of the {@link UserProfileController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'UserProfileController';

/**
 * Describes the shape of the state object for {@link UserProfileController}.
 */
export type UserProfileControllerState = {
  /**
   * Whether the first sync has been completed.
   */
  firstSyncCompleted: boolean;
  /**
   * The queue of accounts to be synced.
   * Each key is an entropy source ID, and each value is an array of account
   * addresses associated with that entropy source. Accounts with no entropy
   * source ID are grouped under the key "null".
   */
  syncQueue: Record<string, string[]>;
};

/**
 * The metadata for each property in {@link UserProfileControllerState}.
 */
const userProfileControllerMetadata = {
  firstSyncCompleted: {
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
} satisfies StateMetadata<UserProfileControllerState>;

/**
 * Constructs the default {@link UserProfileController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link UserProfileController} state.
 */
export function getDefaultUserProfileControllerState(): UserProfileControllerState {
  return {
    firstSyncCompleted: false,
    syncQueue: {},
  };
}

const MESSENGER_EXPOSED_METHODS = [] as const;

/**
 * Retrieves the state of the {@link UserProfileController}.
 */
export type UserProfileControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  UserProfileControllerState
>;

/**
 * Actions that {@link UserProfileControllerMessenger} exposes to other consumers.
 */
export type UserProfileControllerActions =
  | UserProfileControllerGetStateAction
  | UserProfileServiceMethodActions;

/**
 * Actions from other messengers that {@link UserProfileControllerMessenger} calls.
 */
type AllowedActions =
  | UserProfileServiceMethodActions
  | AccountsControllerListAccountsAction;

/**
 * Published when the state of {@link UserProfileController} changes.
 */
export type UserProfileControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  UserProfileControllerState
>;

/**
 * Events that {@link UserProfileControllerMessenger} exposes to other consumers.
 */
export type UserProfileControllerEvents = UserProfileControllerStateChangeEvent;

/**
 * Events from other messengers that {@link UserProfileControllerMessenger} subscribes
 * to.
 */
type AllowedEvents =
  | KeyringControllerUnlockEvent
  | AccountsControllerAccountAddedEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link UserProfileController}.
 */
export type UserProfileControllerMessenger = Messenger<
  typeof controllerName,
  UserProfileControllerActions | AllowedActions,
  UserProfileControllerEvents | AllowedEvents
>;

export class UserProfileController extends StaticIntervalPollingController()<
  typeof controllerName,
  UserProfileControllerState,
  UserProfileControllerMessenger
> {
  readonly #mutex = new Mutex();

  readonly #assertUserOptedIn: () => boolean;

  readonly #getMetaMetricsId: () => string;

  /**
   * Constructs a new {@link UserProfileController}.
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
    messenger: UserProfileControllerMessenger;
    state?: Partial<UserProfileControllerState>;
    interval?: number;
    assertUserOptedIn: () => boolean;
    getMetaMetricsId: () => string;
  }) {
    super({
      messenger,
      metadata: userProfileControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultUserProfileControllerState(),
        ...state,
      },
    });

    this.#assertUserOptedIn = assertUserOptedIn;
    this.#getMetaMetricsId = getMetaMetricsId;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.#registerSyncTriggers();

    this.setIntervalLength(interval);
    this.startPolling(null);
  }

  /**
   * Execute a single poll to sync user profile data.
   *
   * The queued accounts are sent to the UserProfileService, and the sync
   * queue is cleared. This operation is mutexed to prevent concurrent
   * executions.
   *
   * @returns A promise that resolves when the poll is complete.
   */
  async _executePoll(): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      for (const [entropySourceId, accounts] of Object.entries(
        this.state.syncQueue,
      )) {
        await this.messenger.call('UserProfileService:updateProfile', {
          metametricsId: this.#getMetaMetricsId(),
          entropySourceId: entropySourceId === 'null' ? null : entropySourceId,
          accounts,
        });
        this.update((state) => {
          delete state.syncQueue[entropySourceId];
        });
      }
    });
  }

  /**
   * Register triggers to initiate user profile sync.
   *
   * These triggers guarantee that the user profile is synced at least
   * once per user after the first wallet unlock, and recurringly
   * whenever a new account is added.
   */
  #registerSyncTriggers() {
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#queueFirstSyncIfNeeded().catch(console.error);
    });

    this.messenger.subscribe('AccountsController:accountAdded', (account) => {
      this.#queueAccount(account).catch(console.error);
    });
  }

  /**
   * Add existing accounts to the sync queue if it has not been done yet.
   *
   * This method ensures that the first sync is only executed once,
   * and only if the user has opted in to user profile features.
   */
  async #queueFirstSyncIfNeeded() {
    await this.#mutex.runExclusive(async () => {
      if (this.state.firstSyncCompleted || !this.#assertUserOptedIn()) {
        return;
      }
      const newGroupedAccounts = groupAccountsByEntropySourceId(
        this.messenger
          .call('AccountsController:listAccounts')
          .map((account) => ({
            entropySourceId: getAccountEntropySourceId(account),
            address: account.address,
          })),
      );
      const queuedAddresses = { ...this.state.syncQueue };
      for (const key of Object.keys(newGroupedAccounts)) {
        if (!queuedAddresses[key]) {
          queuedAddresses[key] = [];
        }
        queuedAddresses[key].push(...newGroupedAccounts[key]);
      }
      this.update((state) => {
        state.firstSyncCompleted = true;
        state.syncQueue = queuedAddresses;
      });
    });
  }

  /**
   * Queue the given account to be synced at the next poll.
   *
   * @param account - The account to sync.
   */
  async #queueAccount(account: InternalAccount) {
    await this.#mutex.runExclusive(async () => {
      if (!this.#assertUserOptedIn()) {
        return;
      }
      this.update((state) => {
        const entropySourceId = getAccountEntropySourceId(account) || 'null';
        if (!state.syncQueue[entropySourceId]) {
          state.syncQueue[entropySourceId] = [];
        }
        state.syncQueue[entropySourceId].push(account.address);
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
  if (account.options.entropy && account.options.entropy.type === 'mnemonic') {
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
  accounts: { address: string; entropySourceId?: string | null }[],
): Record<string, string[]> {
  return accounts.reduce((result: Record<string, string[]>, account) => {
    const key = account.entropySourceId ?? 'null';
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(account.address);
    return result;
  }, {});
}
