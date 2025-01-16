import type { PaginationOptions } from './MultichainTransactionsController';
import { Poller } from './Poller';

type TransactionInfo = {
  lastUpdated: number;
  blockTime: number;
  pagination: PaginationOptions;
};

// Every 5s in milliseconds.
const TRANSACTIONS_TRACKING_INTERVAL = 5 * 1000;

/**
 * This class manages the tracking and periodic updating of transactions for multiple blockchain accounts.
 *
 * The tracker uses a polling mechanism to periodically check and update transactions
 * for all tracked accounts, respecting each account's specific block time to determine
 * when updates are needed.
 */
export class MultichainTransactionsTracker {
  readonly #poller: Poller;

  readonly #updateTransactions: (
    accountId: string,
    pagination: PaginationOptions,
  ) => Promise<void>;

  #transactions: Record<string, TransactionInfo> = {};

  constructor(
    updateTransactionsCallback: (
      accountId: string,
      pagination: PaginationOptions,
    ) => Promise<void>,
  ) {
    this.#updateTransactions = updateTransactionsCallback;

    this.#poller = new Poller(() => {
      this.updateTransactions().catch((error) => {
        console.error('Failed to update transactions:', error);
      });
    }, TRANSACTIONS_TRACKING_INTERVAL);
  }

  /**
   * Starts the tracking process.
   */
  start(): void {
    this.#poller.start();
  }

  /**
   * Stops the tracking process.
   */
  stop(): void {
    this.#poller.stop();
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
    if (!this.isTracked(accountId)) {
      this.#transactions[accountId] = {
        lastUpdated: 0,
        blockTime,
        pagination,
      };
    }
  }

  /**
   * Stops tracking a tracked account ID.
   *
   * @param accountId - The account ID.
   * @throws If the account ID is not being tracked.
   */
  untrack(accountId: string) {
    this.assertBeingTracked(accountId);
    delete this.#transactions[accountId];
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
}
