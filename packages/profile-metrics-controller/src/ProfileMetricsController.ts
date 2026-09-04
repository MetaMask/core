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
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { TransactionControllerTransactionSubmittedEvent } from '@metamask/transaction-controller';
import { Duration, inMilliseconds, parseCaipChainId } from '@metamask/utils';
import { Mutex } from 'async-mutex';

import type { ProfileMetricsControllerMethodActions } from './ProfileMetricsController-method-action-types.js';
import type { ProfileMetricsServiceMethodActions } from './ProfileMetricsService-method-action-types.js';
import type {
  AccountSource,
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
 * The sync queue key for accounts that are not backed by a mnemonic (hardware,
 * imported private key, and non-mnemonic Snap accounts). These are submitted
 * without an entropy source ID, which the AuthenticationController resolves
 * to the primary SRP. The value is `String(null)` so that queues persisted by
 * earlier versions keep draining.
 */
const NON_MNEMONIC_QUEUE_KEY = 'null';

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
   * The queue of accounts to be synced, with canonical addresses.
   * Each key is an entropy source ID, and each value is an array of account
   * addresses associated with that entropy source. Accounts with no entropy
   * source ID are grouped under {@link NON_MNEMONIC_QUEUE_KEY}.
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
  /**
   * Whether known accounts have been re-enqueued once so that they are
   * reported with canonical addresses and, for non-mnemonic accounts, an
   * account source. Set on the first unlock after upgrading; fresh installs
   * flip this on their initial sync.
   */
  accountSourceBackfillEnqueued: boolean;
  /**
   * Canonical addresses that have already been reported. Enqueuing one of
   * these again is a no-op.
   */
  reportedAccounts: string[];
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
  accountSourceBackfillEnqueued: {
    persist: true,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: false,
  },
  reportedAccounts: {
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
    proofBackfillEnqueued: false,
    accountSourceBackfillEnqueued: false,
    reportedAccounts: [],
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
   * Each batch of queued accounts is sent to the ProfileMetricsService and
   * then dropped from the sync queue, with its addresses recorded as
   * reported. Mnemonic batches are attributed to their own entropy source
   * and carry proofs of ownership when one can be produced (see
   * {@link #attachProofs}); the non-mnemonic batch is submitted without an
   * entropy source ID (resolved to the primary SRP downstream) and never
   * carries proofs. This operation is mutexed to prevent concurrent
   * executions.
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
      const batches = Object.entries(this.state.syncQueue);
      if (batches.length === 0) {
        return;
      }
      const proofCandidates = this.#getProofCandidatesByAddress();
      for (const [queueKey, accounts] of batches) {
        const entropySourceId =
          queueKey === NON_MNEMONIC_QUEUE_KEY ? null : queueKey;
        try {
          const accountsToSubmit =
            entropySourceId === null
              ? accounts
              : await this.#attachProofs(
                  accounts,
                  proofCandidates,
                  entropySourceId,
                );
          await this.messenger.call('ProfileMetricsService:submitMetrics', {
            metametricsId: this.#getMetaMetricsId(),
            entropySourceId,
            accounts: accountsToSubmit,
          });
          this.update((state) => {
            for (const { address } of accountsToSubmit) {
              if (!state.reportedAccounts.includes(address)) {
                state.reportedAccounts.push(address);
              }
            }
            delete state.syncQueue[queueKey];
          });
        } catch (error) {
          // We want to log the error but continue processing other batches.
          console.error(
            `Failed to submit profile metrics for sync queue key ${queueKey}:`,
            error,
          );
        }
      }
    });
  }

  /**
   * Attach a proof of ownership to each account in a single entropy-source
   * batch when possible.
   *
   * Per-account failures (snap missing the `signProofOfOwnership` method,
   * snap rejection) and whole-batch nonce failures are caught and
   * downgraded to "submit without a proof" so the batch still goes through
   * and the proof is retried on the next poll.
   *
   * @param accounts - The queued accounts for a single batch.
   * @param proofCandidates - Live accounts that can produce a proof, keyed by
   * canonical address (see {@link #getProofCandidatesByAddress}).
   * @param entropySourceId - The entropy source ID for this batch.
   * @returns The accounts with `proof` populated where signing succeeded.
   */
  async #attachProofs(
    accounts: AccountWithScopes[],
    proofCandidates: Map<string, InternalAccount>,
    entropySourceId: string,
  ): Promise<AccountWithScopes[]> {
    const identifiers = new Set(
      accounts
        .map(({ address }) => address)
        .filter((address) => proofCandidates.has(address)),
    );
    if (identifiers.size === 0) {
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
        const account = proofCandidates.get(queued.address);
        const nonce = nonces[queued.address];
        if (!account || !nonce) {
          return queued;
        }
        try {
          const proof = await this.messenger.call(
            'ProofOfOwnershipService:sign',
            { account, nonce },
          );
          return { ...queued, proof };
        } catch (error) {
          console.error(
            `Failed to sign proof of ownership for account ${account.id}:`,
            error,
          );
          return queued;
        }
      }),
    );
  }

  /**
   * Snapshot the live accounts keyed by canonical address, so they can be
   * matched against queued accounts when signing proofs of ownership.
   * Accounts whose namespace has no canonical form cannot produce a proof
   * and are left out.
   *
   * @returns A map of canonical address → `InternalAccount`.
   */
  #getProofCandidatesByAddress(): Map<string, InternalAccount> {
    const candidates = new Map<string, InternalAccount>();
    const { accounts } = this.messenger.call(
      'AccountsController:getState',
    ).internalAccounts;
    for (const account of Object.values(accounts)) {
      const canonicalAddress = getCanonicalAddress(account);
      if (canonicalAddress) {
        candidates.set(canonicalAddress, account);
      }
    }
    return candidates;
  }

  /**
   * Enqueue all currently-known accounts onto the sync queue if needed.
   * Single entry point covering the fresh-install first sync and the
   * one-time backfills for users upgrading (proofs of ownership, then
   * canonical addresses and account sources).
   *
   * Bails for opted-out users (the poll wouldn't drain the queue
   * anyway), and bails once every bootstrap step has already run.
   * Otherwise enqueues all known accounts and flips every flag so this
   * becomes a permanent no-op for the lifetime of the install.
   */
  async #enqueueAccountsIfNeeded(): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      if (!this.#assertUserOptedIn()) {
        return;
      }
      if (
        this.state.initialEnqueueCompleted &&
        this.state.proofBackfillEnqueued &&
        this.state.accountSourceBackfillEnqueued
      ) {
        return;
      }
      const { accounts } = this.messenger.call(
        'AccountsController:getState',
      ).internalAccounts;
      this.update((state) => {
        // Replace the queue rather than append. `AccountsController` is
        // the source of truth, so this drops stale entries that survived
        // from a prior session and re-derives each account's canonical
        // address and source.
        state.syncQueue = {};
        for (const account of Object.values(accounts)) {
          enqueueAccount(state, account);
        }
        state.initialEnqueueCompleted = true;
        state.proofBackfillEnqueued = true;
        state.accountSourceBackfillEnqueued = true;
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
   * Queue the given account to be synced at the next poll, unless it has
   * already been reported or queued.
   *
   * @param account - The account to sync.
   */
  async #addAccountToQueue(account: InternalAccount): Promise<void> {
    await this.#mutex.runExclusive(async () => {
      this.update((state) => {
        enqueueAccount(state, account);
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
 * Derive the reporting source of an account that is not backed by a mnemonic,
 * from its keyring type.
 *
 * @param account - The account to classify.
 * @returns The account source, or undefined for mnemonic-backed accounts
 * (which are attributed to their entropy source instead) and for
 * unrecognized keyring types.
 */
function getAccountSource(account: InternalAccount): AccountSource | undefined {
  if (getAccountEntropySourceId(account) !== null) {
    return undefined;
  }
  switch (account.metadata.keyring.type) {
    case KeyringTypes.simple:
      return 'imported';
    case KeyringTypes.snap:
      return 'snap';
    case KeyringTypes.qr:
    case KeyringTypes.trezor:
    case KeyringTypes.oneKey:
    case KeyringTypes.ledger:
    case KeyringTypes.lattice:
      return 'hardware';
    default:
      return undefined;
  }
}

/**
 * Retrieves the canonical address of the given account, as expected by the
 * auth API (see {@link canonicalizeAddress}).
 *
 * @param account - The account whose address to canonicalize.
 * @returns The canonical address, or undefined when the account's namespace
 * has no canonical form (in which case it cannot produce a proof of
 * ownership either).
 */
function getCanonicalAddress(account: InternalAccount): string | undefined {
  try {
    const [scope] = account.scopes;
    if (!scope) {
      throw new Error(`Scope not found for account ${account.id}`);
    }
    return canonicalizeAddress(
      account.address,
      parseCaipChainId(scope).namespace,
    );
  } catch (error) {
    // Unsupported namespaces are an expected pass-through; anything
    // else is logged so a new namespace doesn't go unnoticed.
    if (!(error instanceof ProofUnsupportedNamespaceError)) {
      console.error(
        `Failed to canonicalize address for account ${account.id}:`,
        error,
      );
    }
    return undefined;
  }
}

/**
 * Convert an internal account to the payload stored in the sync queue and
 * submitted to the ProfileMetricsService.
 *
 * @param account - The internal account.
 * @returns The queued account, with a canonical address and, for
 * non-mnemonic accounts, a source.
 */
function toQueuedAccount(account: InternalAccount): AccountWithScopes {
  const source = getAccountSource(account);
  return {
    address: getCanonicalAddress(account) ?? account.address,
    scopes: account.scopes,
    ...(source ? { source } : {}),
  };
}

/**
 * Push the given account onto the sync queue held in `state`, unless its
 * canonical address has already been reported or is already queued.
 *
 * @param state - The controller state to mutate.
 * @param account - The account to enqueue.
 */
function enqueueAccount(
  state: ProfileMetricsControllerState,
  account: InternalAccount,
): void {
  const queuedAccount = toQueuedAccount(account);
  const isKnown =
    state.reportedAccounts.includes(queuedAccount.address) ||
    Object.values(state.syncQueue).some((batch) =>
      batch.some(({ address }) => address === queuedAccount.address),
    );
  if (isKnown) {
    return;
  }
  const queueKey = getAccountEntropySourceId(account) ?? NON_MNEMONIC_QUEUE_KEY;
  (state.syncQueue[queueKey] ??= []).push(queuedAccount);
}
