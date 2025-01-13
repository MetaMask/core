import { Poller } from './Poller';

type BalanceInfo = {
  lastUpdated: number;
  blockTime: number;
};

const BALANCES_TRACKING_INTERVAL = 5000; // Every 5s in milliseconds.

export class BalancesTracker {
  #poller: Poller;

  #updateBalance: (accountId: string) => Promise<void>;

  #balances: Record<string, BalanceInfo> = {};

  constructor(updateBalanceCallback: (accountId: string) => Promise<void>) {
    this.#updateBalance = updateBalanceCallback;

    this.#poller = new Poller(
      () => this.updateBalances(),
      BALANCES_TRACKING_INTERVAL,
    );
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
    return Object.prototype.hasOwnProperty.call(this.#balances, accountId);
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
   * @param blockTime - The block time (used when refreshing the account balances).
   */
  track(accountId: string, blockTime: number) {
    // Do not overwrite current info if already being tracked!
    if (!this.isTracked(accountId)) {
      this.#balances[accountId] = {
        lastUpdated: 0,
        blockTime,
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
    delete this.#balances[accountId];
  }

  /**
   * Update the balances for a tracked account ID.
   *
   * @param accountId - The account ID.
   * @throws If the account ID is not being tracked.
   */
  async updateBalance(accountId: string) {
    this.assertBeingTracked(accountId);

    // We check if the balance is outdated (by comparing to the block time associated
    // with this kind of account).
    //
    // This might not be super accurate, but we could probably compute this differently
    // and try to sync with the "real block time"!
    const info = this.#balances[accountId];
    if (this.#isBalanceOutdated(info)) {
      await this.#updateBalance(accountId);
      this.#balances[accountId].lastUpdated = Date.now();
    }
  }

  /**
   * Update the balances of all tracked accounts (only if the balances
   * is considered outdated).
   */
  async updateBalances() {
    await Promise.allSettled(
      Object.keys(this.#balances).map(async (accountId) => {
        await this.updateBalance(accountId);
      }),
    );
  }

  /**
   * Checks if the balance is outdated according to the provided data.
   *
   * @param param - The balance info.
   * @param param.lastUpdated - The last updated timestamp.
   * @param param.blockTime - The block time.
   * @returns True if the balance is outdated, false otherwise.
   */
  #isBalanceOutdated({ lastUpdated, blockTime }: BalanceInfo): boolean {
    return (
      // Never been updated:
      lastUpdated === 0 ||
      // Outdated:
      Date.now() - lastUpdated >= blockTime
    );
  }
}
