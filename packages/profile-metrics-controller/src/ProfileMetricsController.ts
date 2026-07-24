import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetStateAction,
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
import { TransactionControllerTransactionSubmittedEvent } from '@metamask/transaction-controller';
import { Duration, inMilliseconds, parseCaipChainId } from '@metamask/utils';
import { Mutex } from 'async-mutex';

import type { ProfileMetricsControllerMethodActions } from './ProfileMetricsController-method-action-types.js';
import type { ProfileMetricsServiceMethodActions } from './ProfileMetricsService-method-action-types.js';
import type {
  AccountOwnershipProof,
  AccountWithScopes,
} from './ProfileMetricsService.js';
import type { ProofOfOwnershipServiceMethodActions } from './ProofOfOwnershipService-method-action-types.js';
import {
  canonicalizeAddress,
  ProofUnsupportedNamespaceError,
} from './utils/canonicalize.js';

/**
 * The name of the {@link ProfileMetricsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'ProfileMetricsController';

/**
 * The default delay duration before data is sent for the first time.
 */
export const DEFAULT_INITIAL_DELAY_DURATION = inMilliseconds(
  1,
  Duration.Minute,
);

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
  /**
   * The timestamp when the first data sending can be attempted.
   */
  initialDelayEndTimestamp?: number;
  /**
   * Whether previously-synced accounts have been re-enqueued so their
   * proofs of ownership are submitted alongside everything else. Set on
   * the first unlock after upgrading to a version that signs proofs of
   * ownership; fresh installs flip this on their initial sync since the
   * first poll already attaches proofs.
   */
  proofBackfillEnqueued: boolean;
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
  initialDelayEndTimestamp: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: false,
  },
  proofBackfillEnqueued: {
    persist: true,
    includeInDebugSnapshot: true,
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
    proofBackfillEnqueued: false,
  };
}

const MESSENGER_EXPOSED_METHODS = ['skipInitialDelay'] as const;

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
  | ProfileMetricsControllerMethodActions;

/**
 * Actions from other messengers that {@link ProfileMetricsControllerMessenger} calls.
 */
type AllowedActions =
  | ProfileMetricsServiceMethodActions
  | ProofOfOwnershipServiceMethodActions
  | AccountsControllerGetStateAction;

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
  | AccountsControllerAccountRemovedEvent
  | TransactionControllerTransactionSubmittedEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ProfileMetricsController}.
 */
export type ProfileMetricsControllerMessenger = Messenger<
  typeof controllerName,
  ProfileMetricsControllerActions | AllowedActions,
  ProfileMetricsControllerEvents | AllowedEvents
>;

/**
 * Manages user profile metrics.
 *
 * For users who opt-in to metrics, this controller ensures we have metrics about their user
 * profile (metrics ID and accounts).
 */
export class ProfileMetricsController extends StaticIntervalPollingController()<
  typeof controllerName,
  ProfileMetricsControllerState,
  ProfileMetricsControllerMessenger
> {
  readonly #mutex = new Mutex();

  readonly #assertUserOptedIn: () => boolean;

  readonly #getMetaMetricsId: () => string;

  readonly #initialDelayDuration: number;

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
   * @param args.initialDelayDuration - The delay duration before data is sent
   * for the first time, in milliseconds. Defaults to 10 minutes.
   */
  constructor({
    messenger,
    state,
    assertUserOptedIn,
    getMetaMetricsId,
    interval = 10 * 1000,
    initialDelayDuration = DEFAULT_INITIAL_DELAY_DURATION,
  }: {
    messenger: ProfileMetricsControllerMessenger;
    state?: Partial<ProfileMetricsControllerState>;
    interval?: number;
    assertUserOptedIn: () => boolean;
    getMetaMetricsId: () => string;
    initialDelayDuration?: number;
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
    this.#initialDelayDuration = initialDelayDuration;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.messenger.subscribe('KeyringController:unlock', () => {
      if (this.#assertUserOptedIn()) {
        // If the user has already opted in at the start of the session,
        // it must have opted in during onboarding, or during a previous session.
        this.skipInitialDelay();
      }
      this.#enqueueAccountsIfNeeded().catch(
        this.messenger.captureException ?? console.error,
      );
      this.startPolling(null);
    });

    this.messenger.subscribe('KeyringController:lock', () =>
      this.stopAllPolling(),
    );

    this.messenger.subscribe('TransactionController:transactionSubmitted', () =>
      this.skipInitialDelay(),
    );

    this.messenger.subscribe('AccountsController:accountAdded', (account) => {
      this.#addAccountToQueue(account).catch(console.error);
    });

    this.messenger.subscribe('AccountsController:accountRemoved', (account) => {
      this.#removeAccountFromQueue(account).catch(console.error);
    });

    this.setIntervalLength(interval);
  }

  /**
   * Skip the initial delay period by setting the end timestamp to the current time.
   * Metrics will be sent on the next poll.
   */
  skipInitialDelay(): void {
    this.update((state) => {
      state.initialDelayEndTimestamp = Date.now();
    });
  }

  /**
   * Execute a single poll to sync user profile data.
   *
   * The queued accounts are sent to the ProfileMetricsService, each with
   * a proof of ownership when one can be produced (see {@link #attachProofs}),
   * and the sync queue is cleared. This operation is mutexed to prevent
   * concurrent executions.
   *
   * @returns A promise that resolves when the poll is complete.
   */
  async _executePoll(): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      if (!this.#assertUserOptedIn()) {
        return;
      }
      this.#setInitialDelayEndTimestampIfNull();
      if (!this.#isInitialDelayComplete()) {
        return;
      }
      const fullAccountsByAddress = this.#getFullAccountsByAddress();
      for (const [entropySourceId, accounts] of Object.entries(
        this.state.syncQueue,
      )) {
        const normalizedEntropySourceId =
          entropySourceId === 'null' ? null : entropySourceId;
        // Skip proof-of-ownership for accounts without an entropy source
        const accountsWithProofs =
          normalizedEntropySourceId === null
            ? accounts
            : await this.#attachProofs(
                accounts,
                fullAccountsByAddress,
                normalizedEntropySourceId,
              );
        try {
          await this.messenger.call('ProfileMetricsService:submitMetrics', {
            metametricsId: this.#getMetaMetricsId(),
            entropySourceId: normalizedEntropySourceId,
            accounts: accountsWithProofs,
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
   * Attach a proof of ownership to each account in a single entropy-source
   * batch when possible, canonicalizing the address along the way.
   *
   * Per-account failures (unknown namespace, snap missing the
   * `signProofOfOwnership` method, snap rejection) and whole-batch nonce
   * failures are caught and downgraded to "submit without a proof" so the
   * batch still goes through and the proof is retried on the next poll.
   *
   * @param accounts - The queued accounts for a single batch.
   * @param fullAccountsByAddress - Live `InternalAccount` lookup keyed by address.
   * @param entropySourceId - The entropy source ID for this batch. Callers
   * are expected to short-circuit before invoking this method when the
   * batch has no entropy source; see `_executePoll` for why.
   * @returns The accounts with `proof` populated where signing succeeded.
   */
  async #attachProofs(
    accounts: AccountWithScopes[],
    fullAccountsByAddress: Map<string, InternalAccount>,
    entropySourceId: string,
  ): Promise<AccountWithScopes[]> {
    const candidates = new Map<
      string,
      { account: InternalAccount; canonicalAddress: string }
    >();
    const identifiers = new Set<string>();
    for (const queued of accounts) {
      const fullAccount = fullAccountsByAddress.get(queued.address);
      if (!fullAccount) {
        continue;
      }
      try {
        const [scope] = fullAccount.scopes;
        if (!scope) {
          throw new Error(`Scope not found for account ${fullAccount.id}`);
        }
        const { namespace } = parseCaipChainId(scope);
        const canonicalAddress = canonicalizeAddress(
          fullAccount.address,
          namespace,
        );
        candidates.set(queued.address, {
          account: fullAccount,
          canonicalAddress,
        });
        identifiers.add(canonicalAddress);
      } catch (error) {
        // Unsupported namespaces are an expected pass-through; anything
        // else is logged so a new namespace doesn't go unnoticed.
        if (!(error instanceof ProofUnsupportedNamespaceError)) {
          console.error(`Skipping proof for account ${fullAccount.id}:`, error);
        }
      }
    }

    if (candidates.size === 0) {
      return accounts;
    }

    let nonces: Record<string, string> = {};
    try {
      nonces = await this.messenger.call('ProfileMetricsService:fetchNonces', {
        identifiers: [...identifiers],
        entropySourceId,
      });
    } catch (error) {
      console.error(
        `Failed to fetch proof-of-ownership nonces for entropy source ID ${entropySourceId}:`,
        error,
      );
    }

    return await Promise.all(
      accounts.map(async (queued): Promise<AccountWithScopes> => {
        const candidate = candidates.get(queued.address);
        if (!candidate) {
          return queued;
        }
        const nonce = nonces[candidate.canonicalAddress];
        if (!nonce) {
          return { ...queued, address: candidate.canonicalAddress };
        }
        let proof: AccountOwnershipProof;
        try {
          proof = await this.messenger.call('ProofOfOwnershipService:sign', {
            account: candidate.account,
            nonce,
          });
        } catch (error) {
          console.error(
            `Failed to sign proof of ownership for account ${candidate.account.id}:`,
            error,
          );
          return { ...queued, address: candidate.canonicalAddress };
        }
        return {
          address: candidate.canonicalAddress,
          scopes: queued.scopes,
          proof,
        };
      }),
    );
  }

  /**
   * Snapshot the live `InternalAccount` map keyed by address for the
   * current poll.
   *
   * @returns A map of address → `InternalAccount`.
   */
  #getFullAccountsByAddress(): Map<string, InternalAccount> {
    const byAddress = new Map<string, InternalAccount>();
    const accountsState = this.messenger.call('AccountsController:getState');
    for (const account of Object.values(
      accountsState.internalAccounts.accounts,
    )) {
      byAddress.set(account.address, account);
    }
    return byAddress;
  }

  /**
   * Enqueue all currently-known accounts onto the sync queue if needed.
   * Single entry point covering both the fresh-install first sync and
   * the one-time proof-of-ownership backfill for users upgrading.
   *
   * Bails for opted-out users (the poll wouldn't drain the queue
   * anyway), and bails once both bootstrap steps have already run.
   * Otherwise enqueues all known accounts and flips both flags so this
   * becomes a permanent no-op for the lifetime of the install.
   */
  async #enqueueAccountsIfNeeded(): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      if (!this.#assertUserOptedIn()) {
        return;
      }
      if (
        this.state.initialEnqueueCompleted &&
        this.state.proofBackfillEnqueued
      ) {
        return;
      }
      const groupedAccounts = groupAccountsByEntropySourceId(
        Object.values(
          this.messenger.call('AccountsController:getState').internalAccounts
            .accounts,
        ),
      );
      this.update((state) => {
        // Replace the queue rather than append. `AccountsController` is
        // the source of truth and the queue is otherwise kept in sync
        // with it via the `accountAdded` / `accountRemoved` subscriptions,
        // so assigning here avoids duplicating entries that survived from
        // a prior session or were pushed earlier in this same unlock
        // cycle. Duplicates would matter because nonces are single-use:
        // letting one through causes `#attachProofs` to sign and submit
        // twice with the same nonce.
        state.syncQueue = groupedAccounts;
        state.initialEnqueueCompleted = true;
        state.proofBackfillEnqueued = true;
      });
    });
  }

  /**
   * Set the initial delay end timestamp if it is not already set.
   */
  #setInitialDelayEndTimestampIfNull(): void {
    this.update((state) => {
      state.initialDelayEndTimestamp ??=
        Date.now() + this.#initialDelayDuration;
    });
  }

  /**
   * Check if the initial delay end timestamp is in the past.
   *
   * @returns True if the initial delay period has completed, false otherwise.
   */
  #isInitialDelayComplete(): boolean {
    return (
      this.state.initialDelayEndTimestamp !== undefined &&
      Date.now() >= this.state.initialDelayEndTimestamp
    );
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
