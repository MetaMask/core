import type { Json, JsonRpcRequest } from '@metamask/utils';

import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';

import { isEvmAccountType, Transaction } from '@metamask/keyring-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import { type InternalAccount } from '@metamask/keyring-internal-api';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Draft } from 'immer';
import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import {
  MultichainNetworks,
  TRANSACTIONS_CHECK_INTERVALS,
} from './constants';

const controllerName = 'MultichainTransactionsController';

export type PaginationOptions = {
  limit: number;
  next?: string | null;
};

/**
 * State used by the {@link MultichainTransactionsController} to cache account transactions.
 */
export type MultichainTransactionsControllerState = {
  nonEvmTransactions: {
    [accountId: string]: TransactionStateEntry;
  };
};

/**
 * Default state of the {@link MultichainTransactionsController}.
 */
export const defaultState: MultichainTransactionsControllerState = {
  nonEvmTransactions: {},
};

/**
 * Returns the state of the {@link MultichainTransactionsController}.
 */
export type MultichainTransactionsControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MultichainTransactionsControllerState
  >;

/**
 * Updates the transactions of all supported accounts.
 */
export type MultichainTransactionsControllerListTransactionsAction = {
  type: `${typeof controllerName}:updateTransactions`;
  handler: MultichainTransactionsController['updateTransactions'];
};

/**
 * Event emitted when the state of the {@link MultichainTransactionsController} changes.
 */
export type MultichainTransactionsControllerStateChange =
  ControllerStateChangeEvent<
    typeof controllerName,
    MultichainTransactionsControllerState
  >;

/**
 * Actions exposed by the {@link MultichainTransactionsController}.
 */
export type MultichainTransactionsControllerActions =
  | MultichainTransactionsControllerGetStateAction
  | MultichainTransactionsControllerListTransactionsAction;

/**
 * Events emitted by {@link MultichainTransactionsController}.
 */
export type MultichainTransactionsControllerEvents =
  MultichainTransactionsControllerStateChange;

/**
 * Messenger type for the MultichainTransactionsController.
 */
export type MultichainTransactionsControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    MultichainTransactionsControllerActions | AllowedActions,
    MultichainTransactionsControllerEvents | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

/**
 * Actions that this controller is allowed to call.
 */
export type AllowedActions =
  | HandleSnapRequest
  | AccountsControllerListMultichainAccountsAction;

/**
 * Events that this controller is allowed to subscribe.
 */
export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

/**
 * {@link MultichainTransactionsController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const MultichainTransactionsControllerMetadata = {
  nonEvmTransactions: {
    persist: true,
    anonymous: false,
  },
};

/**
 * The state of transactions for a specific account.
 */
export type TransactionStateEntry = {
  transactions: Transaction[];
  next: string | null;
  lastUpdated: number;
};

/** The input to start polling for the {@link MultichainTransactionsController} */
type MultichainTransactionsPollingInput = {
  accountId: string;
  pagination: PaginationOptions;
};

/**
 * This type is used to track the state of transaction fetching for each account.
 * It's not about the transactions themselves, but rather about managing when and how we fetch them.
 */
type TransactionInfo = {
  lastUpdated: number;
  blockTime: number;
  pagination: PaginationOptions;
};

/**
 * The MultichainTransactionsController is responsible for fetching and caching account
 * transactions for non-EVM accounts.
 */
export class MultichainTransactionsController extends StaticIntervalPollingController<MultichainTransactionsPollingInput>()<
  typeof controllerName,
  MultichainTransactionsControllerState,
  MultichainTransactionsControllerMessenger
> {
  #transactions: Record<string, TransactionInfo> = {};

  #handle?: ReturnType<typeof setTimeout>;

  constructor({
    messenger,
    state,
    interval = 5000,
  }: {
    messenger: MultichainTransactionsControllerMessenger;
    state: MultichainTransactionsControllerState;
    interval?: number;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: MultichainTransactionsControllerMetadata,
      state: {
        ...defaultState,
        ...state,
      },
    });

    this.setIntervalLength(interval);

    // Register all non-EVM accounts
    for (const account of this.#listAccounts()) {
      if (this.#isNonEvmAccount(account)) {
        this.track(
          account.id,
          this.#getBlockTimeForAccount(account),
        );
      }
    }

    this.messagingSystem.subscribe(
      'AccountsController:accountAdded',
      (account: InternalAccount) => this.#handleOnAccountAdded(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      (accountId: string) => this.#handleOnAccountRemoved(accountId),
    );
  }

    /**
   * Checks if an account ID is being tracked.
   *
   * @param accountId - The account ID.
   * @returns True if the account is being tracked, false otherwise.
   */
  isTracked(accountId: string) {
    return accountId in this.#transactions;
  }

    /**
   * Asserts that an account ID is being tracked.
   *
   * @param accountId - The account ID.
   * @throws If the account ID is not being tracked.
   */
    assertBeingTracked(accountId: string) {
      if (!this.isTracked(accountId)) {
      throw new Error(`Account is not being tracked: ${accountId}`);
    }
  }

  /**
   * Implementation of polling execution
   */
  async _executePoll(): Promise<void> {
    try {
      await Promise.allSettled(
        Object.keys(this.#transactions).map(async (accountId) => {
          this.assertBeingTracked(accountId);
  
          const info = this.#transactions[accountId];
          const isOutdated = Date.now() - info.lastUpdated >= info.blockTime;
          const hasNoTransactionsYet = info.lastUpdated === 0;
      
          if (hasNoTransactionsYet || isOutdated) {
            await this.#updateTransactions(accountId, info.pagination);
            this.#transactions[accountId].lastUpdated = Date.now();
          }
        }),
      );
    } catch (error) {
      console.error('Error during transaction polling:', error);
    }
  }

  /**
   * Starts tracking a new account ID. This method has no effect on already tracked
   * accounts.
   *
   * @param accountId - The account ID.
   * @param blockTime - The block time (used when refreshing the account transactions).
   * @param pagination - Options for paginating transaction results. Defaults to { limit: 10 }.
   */
  track(
    accountId: string,
    blockTime: number,
    pagination: PaginationOptions = { limit: 10 },
  ) {
    if (blockTime <= 0) {
      throw new Error('Block time must be positive');
    }

    if (!this.isTracked(accountId)) {
      this.#transactions[accountId] = {
        lastUpdated: 0,
        blockTime,
        pagination,
      };
    }
  }

  /**
   * Stop tracking an account
   */
  untrack(accountId: string) {
    this.assertBeingTracked(accountId);
    delete this.#transactions[accountId];
  }

  /**
   * Lists the multichain accounts coming from the `AccountsController`.
   *
   * @returns A list of multichain accounts.
   */
  #listMultichainAccounts(): InternalAccount[] {
    return this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    );
  }

  /**
   * Lists the accounts that we should get transactions for.
   *
   * @returns A list of accounts that we should get transactions for.
   */
  #listAccounts(): InternalAccount[] {
    const accounts = this.#listMultichainAccounts();
    return accounts.filter((account) => this.#isNonEvmAccount(account));
  }

  /**
   * Updates the transactions for one account.
   *
   * @param accountId - The ID of the account to update transactions for.
   * @param pagination - Options for paginating transaction results.
   */
  async #updateTransactions(accountId: string, pagination: PaginationOptions) {
    const account = this.#listAccounts().find(
      (accountItem) => accountItem.id === accountId,
    );

    if (account?.metadata.snap) {
      const response = await this.#getTransactions(
        account.id,
        account.metadata.snap.id,
        pagination,
      );

      /**
       * Filter only Solana transactions to ensure they're mainnet
       * All other chain transactions are included as-is
       */
      const transactions = response.data.filter((tx) => {
        if (tx.chain.startsWith(MultichainNetworks.Solana)) {
          return tx.chain === MultichainNetworks.Solana;
        }
        return true;
      });

      this.update((state: Draft<MultichainTransactionsControllerState>) => {
        const entry: TransactionStateEntry = {
          transactions,
          next: response.next,
          lastUpdated: Date.now(),
        };

        Object.assign(state.nonEvmTransactions, { [account.id]: entry });
      });
    }
  }

  /**
   * Gets transactions for an account.
   *
   * @param accountId - The ID of the account to get transactions for.
   * @param snapId - The ID of the snap that manages the account.
   * @param pagination - Options for paginating transaction results.
   * @returns A promise that resolves to the transaction data and pagination info.
   */
  async #getTransactions(
    accountId: string,
    snapId: string,
    pagination: PaginationOptions,
  ): Promise<{
    data: Transaction[];
    next: string | null;
  }> {
    return await this.#getClient(snapId).listAccountTransactions(
      accountId,
      pagination,
    );
  }

  /**
   * Update the transactions for a tracked account ID.
   *
   * @param accountId - The account ID.
   * @throws If the account ID is not being tracked.
   */
  async updateTransactionsForAccount(accountId: string) {
    this.assertBeingTracked(accountId);

    const info = this.#transactions[accountId];
    const isOutdated = Date.now() - info.lastUpdated >= info.blockTime;
    const hasNoTransactionsYet = info.lastUpdated === 0;

    if (hasNoTransactionsYet || isOutdated) {
      await this.#updateTransactions(accountId, info.pagination);
      this.#transactions[accountId].lastUpdated = Date.now();
    }
  }

  /**
   * Update the transactions of all tracked accounts
   */
  async updateTransactions() {
    await Promise.allSettled(
      Object.keys(this.#transactions).map(async (accountId) => {
        await this.updateTransactionsForAccount(accountId);
      }),
    );
  }

  /**
   * Starts the polling process.
   */

  async start(): Promise<void> {
    await this.startPolling({
      accountId: '', // Empty string as we're not polling individual accounts
      pagination: { limit: 10 }, // Default pagination
    });
  }

  /**
   * Stops the polling process.
   */
  stop(): void {
    this.stopAllPolling();
  }

  /**
   * Gets the block time for a given account.
   *
   * @param account - The account to get the block time for.
   * @returns The block time for the account.
   */
  #getBlockTimeForAccount(account: InternalAccount): number {
    if (account.type in TRANSACTIONS_CHECK_INTERVALS) {
      return TRANSACTIONS_CHECK_INTERVALS[
        account.type as keyof typeof TRANSACTIONS_CHECK_INTERVALS
      ];
    }
    throw new Error(
      `Unsupported account type for transactions tracking: ${account.type}`,
    );
  }

  /**
   * Checks for non-EVM accounts.
   *
   * @param account - The new account to be checked.
   * @returns True if the account is a non-EVM account, false otherwise.
   */
  #isNonEvmAccount(account: InternalAccount): boolean {
    return (
      !isEvmAccountType(account.type) &&
      // Non-EVM accounts are backed by a Snap for now
      account.metadata.snap !== undefined
    );
  }

  /**
   * Handles changes when a new account has been added.
   *
   * @param account - The new account being added.
   */
  async #handleOnAccountAdded(account: InternalAccount) {
    if (!this.#isNonEvmAccount(account)) {
      return;
    }

    this.track(account.id, this.#getBlockTimeForAccount(account));
  }

  /**
   * Handles changes when a new account has been removed.
   *
   * @param accountId - The account ID being removed.
   */
  async #handleOnAccountRemoved(accountId: string) {
    if (this.isTracked(accountId)) {
      this.untrack(accountId);
    }

    if (accountId in this.state.nonEvmTransactions) {
      this.update((state: Draft<MultichainTransactionsControllerState>) => {
        delete state.nonEvmTransactions[accountId];
      });
    }
  }

  /**
   * Gets a `KeyringClient` for a Snap.
   *
   * @param snapId - ID of the Snap to get the client for.
   * @returns A `KeyringClient` for the Snap.
   */
  #getClient(snapId: string): KeyringClient {
    return new KeyringClient({
      send: async (request: JsonRpcRequest) =>
        (await this.messagingSystem.call('SnapController:handleRequest', {
          snapId: snapId as SnapId,
          origin: 'metamask',
          handler: HandlerType.OnKeyringRequest,
          request,
        })) as Promise<Json>,
    });
  }
}
