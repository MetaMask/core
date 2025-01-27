import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerAccountTransactionsUpdatedEvent,
} from '@metamask/accounts-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  isEvmAccountType,
  type Transaction,
  type AccountTransactionsUpdatedEventPayload,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { HandleSnapRequest } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import type { Draft } from 'immer';

import { MultichainNetwork, TRANSACTIONS_CHECK_INTERVALS } from './constants';
import { MultichainTransactionsTracker } from './MultichainTransactionsTracker';

const controllerName = 'MultichainTransactionsController';

/**
 * PaginationOptions
 *
 * Represents options for paginating transaction results
 * limit - The maximum number of transactions to return
 * next - The cursor for the next page of transactions, or null if there is no next page
 */
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
 * Constructs the default {@link MultichainTransactionsController} state.
 *
 * @returns The default {@link MultichainTransactionsController} state.
 */
export function getDefaultMultichainTransactionsControllerState(): MultichainTransactionsControllerState {
  return {
    nonEvmTransactions: {},
  };
}

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
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerAccountTransactionsUpdatedEvent;

/**
 * {@link MultichainTransactionsController}'s metadata.
 *
 * This allows us to choose if fields of the state should be persisted or not
 * using the `persist` flag; and if they can be sent to Sentry or not, using
 * the `anonymous` flag.
 */
const multichainTransactionsControllerMetadata = {
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

/**
 * The MultichainTransactionsController is responsible for fetching and caching account
 * transactions for non-EVM accounts.
 */
export class MultichainTransactionsController extends BaseController<
  typeof controllerName,
  MultichainTransactionsControllerState,
  MultichainTransactionsControllerMessenger
> {
  readonly #tracker: MultichainTransactionsTracker;

  constructor({
    messenger,
    state,
  }: {
    messenger: MultichainTransactionsControllerMessenger;
    state?: Partial<MultichainTransactionsControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: multichainTransactionsControllerMetadata,
      state: {
        ...getDefaultMultichainTransactionsControllerState(),
        ...state,
      },
    });

    this.#tracker = new MultichainTransactionsTracker(
      async (accountId: string, pagination: PaginationOptions) =>
        await this.#updateTransactions(accountId, pagination),
    );

    // Register all non-EVM accounts into the tracker
    for (const account of this.#listAccounts()) {
      if (this.#isNonEvmAccount(account)) {
        this.#tracker.track(account.id, this.#getBlockTimeFor(account));
      }
    }

    this.messagingSystem.subscribe(
      'AccountsController:accountAdded',
      (account) => this.#handleOnAccountAdded(account),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      (accountId: string) => this.#handleOnAccountRemoved(accountId),
    );
    this.messagingSystem.subscribe(
      'AccountsController:accountTransactionsUpdated',
      (transactionsUpdate: AccountTransactionsUpdatedEvent) =>
        this.#handleOnAccountTransactionsUpdated(transactionsUpdate),
    );
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
        const chain = tx.chain as MultichainNetwork;
        if (chain.startsWith(MultichainNetwork.Solana)) {
          return chain === MultichainNetwork.Solana;
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
   * Updates transactions for a specific account
   *
   * @param accountId - The ID of the account to get transactions for.
   */
  async updateTransactionsForAccount(accountId: string) {
    await this.#tracker.updateTransactionsForAccount(accountId);
  }

  /**
   * Updates the transactions of all supported accounts. This method doesn't return
   * anything, but it updates the state of the controller.
   */
  async updateTransactions() {
    await this.#tracker.updateTransactions();
  }

  /**
   * Starts the polling process.
   */
  start(): void {
    this.#tracker.start();
  }

  /**
   * Stops the polling process.
   */
  stop(): void {
    this.#tracker.stop();
  }

  /**
   * Gets the block time for a given account.
   *
   * @param account - The account to get the block time for.
   * @returns The block time for the account.
   */
  #getBlockTimeFor(account: InternalAccount): number {
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

    this.#tracker.track(account.id, this.#getBlockTimeFor(account));
  }

  /**
   * Handles changes when a new account has been removed.
   *
   * @param accountId - The account ID being removed.
   */
  async #handleOnAccountRemoved(accountId: string) {
    if (this.#tracker.isTracked(accountId)) {
      this.#tracker.untrack(accountId);
    }

    if (accountId in this.state.nonEvmTransactions) {
      this.update((state: Draft<MultichainTransactionsControllerState>) => {
        delete state.nonEvmTransactions[accountId];
      });
    }
  }

  /**
   * Handles transaction updates received from the AccountsController.
   *
   * @param transactionsUpdate - The transaction update event containing new transactions.
   */
  #handleOnAccountTransactionsUpdated(
    transactionsUpdate: AccountTransactionsUpdatedEventPayload,
  ): void {
    this.update((state: Draft<MultichainTransactionsControllerState>) => {
      Object.entries(transactionsUpdate.transactions).forEach(
        ([accountId, transactions]) => {
          if (
            this.#tracker.isTracked(accountId) &&
            state.nonEvmTransactions[accountId]
          ) {
            state.nonEvmTransactions[accountId].transactions = transactions;
            state.nonEvmTransactions[accountId].lastUpdated = Date.now();
          }
        },
      );
    });
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
