import EthQuery from 'eth-query';
import { Mutex } from 'async-mutex';
import {
  BaseConfig,
  BaseController,
  BaseState,
} from '@metamask/base-controller';
import { PreferencesState } from '@metamask/preferences-controller';
import {
  BNToHex,
  query,
  safelyExecuteWithTimeout,
} from '@metamask/controller-utils';

/**
 * @type AccountInformation
 *
 * Account information object
 * @property balance - Hex string of an account balancec in wei
 */
export interface AccountInformation {
  balance: string;
}

/**
 * @type AccountTrackerConfig
 *
 * Account tracker controller configuration
 * @property provider - Provider used to create a new underlying EthQuery instance
 */
export interface AccountTrackerConfig extends BaseConfig {
  interval: number;
  provider?: any;
}

/**
 * @type AccountTrackerState
 *
 * Account tracker controller state
 * @property accounts - Map of addresses to account information
 */
export interface AccountTrackerState extends BaseState {
  accounts: { [address: string]: AccountInformation };
}

/**
 * Controller that tracks the network balances for all user accounts.
 */
export class AccountTrackerController extends BaseController<
  AccountTrackerConfig,
  AccountTrackerState
> {
  private ethQuery: any;

  private mutex = new Mutex();

  private handle?: ReturnType<typeof setTimeout>;

  private syncAccounts() {
    const { accounts } = this.state;
    const addresses = Object.keys(this.getIdentities());
    const existing = Object.keys(accounts);
    const newAddresses = addresses.filter(
      (address) => existing.indexOf(address) === -1,
    );
    const oldAddresses = existing.filter(
      (address) => addresses.indexOf(address) === -1,
    );
    newAddresses.forEach((address) => {
      accounts[address] = { balance: '0x0' };
    });

    oldAddresses.forEach((address) => {
      delete accounts[address];
    });
    this.update({ accounts: { ...accounts } });
  }

  /**
   * Name of this controller used during composition
   */
  override name = 'AccountTrackerController';

  private getIdentities: () => PreferencesState['identities'];
  private getSelectedAddress: () => PreferencesState['selectedAddress'];
  private getMultiAccountBalancesEnabled: () => PreferencesState['isMultiAccountBalancesEnabled'];
  /**
   * Creates an AccountTracker instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.getIdentities - Gets the identities from the Preferences store.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onPreferencesStateChange,
      getIdentities,
      getSelectedAddress,
      getMultiAccountBalancesEnabled,
    }: {
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      getIdentities: () => PreferencesState['identities'];
      getSelectedAddress: () => PreferencesState['selectedAddress'];
      getMultiAccountBalancesEnabled: () => PreferencesState['isMultiAccountBalancesEnabled'];
    },
    config?: Partial<AccountTrackerConfig>,
    state?: Partial<AccountTrackerState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: 10000,
    };
    this.defaultState = { accounts: {} };
    this.initialize();
    this.getIdentities = getIdentities;
    this.getSelectedAddress = getSelectedAddress;
    this.getMultiAccountBalancesEnabled = getMultiAccountBalancesEnabled;
    onPreferencesStateChange(() => {
      this.refresh();
    });
    this.poll();
  }

  /**
   * Sets a new provider.
   *
   * TODO: Replace this wth a method.
   *
   * @param provider - Provider used to create a new underlying EthQuery instance.
   */
  set provider(provider: any) {
    this.ethQuery = new EthQuery(provider);
  }

  get provider() {
    throw new Error('Property only used for setting');
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval trigger a 'refresh'.
   */
  async poll(interval?: number): Promise<void> {
    const releaseLock = await this.mutex.acquire();
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await this.refresh();
    this.handle = setTimeout(() => {
      releaseLock();
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Refreshes the balances of the accounts depending on the multi-account setting.
   * If multi-account is disabled, only updates the selected account balance.
   * If multi-account is enabled, updates balances for all accounts.
   *
   * @async
   */
  refresh = async () => {
    this.syncAccounts();
    const accounts = { ...this.state.accounts };
    const selectedAddress = this.getSelectedAddress();
    const isMultiAccountBalancesEnabled = this.getMultiAccountBalancesEnabled();

    if (!isMultiAccountBalancesEnabled) {
      const balance = await this.getBalanceFromChain(selectedAddress);
      accounts[selectedAddress] = { balance: BNToHex(balance) };
      this.update({ accounts });
      return;
    }

    for (const address in accounts) {
      const balance = await this.getBalanceFromChain(address);
      accounts[address] = { balance: BNToHex(balance) };
    }

    this.update({ accounts });
  };

  /**
   * Fetches the balance of a given address from the blockchain.
   *
   * @async
   * @param {string} address - The account address to fetch the balance for.
   * @returns {Promise<string>} - A promise that resolves to the balance in a hex string format.
   */
  async getBalanceFromChain(address: string): Promise<string> {
    let balance = '0x0';

    await safelyExecuteWithTimeout(async () => {
      balance = await query(this.ethQuery, 'getBalance', [address]);
    });

    return balance;
  }

  /**
   * Sync accounts balances with some additional addresses.
   *
   * @param addresses - the additional addresses, may be hardware wallet addresses.
   * @returns accounts - addresses with synced balance
   */
  async syncBalanceWithAddresses(
    addresses: string[],
  ): Promise<Record<string, { balance: string }>> {
    return await Promise.all(
      addresses.map((address): Promise<[string, string] | undefined> => {
        return safelyExecuteWithTimeout(async () => {
          const balance = await query(this.ethQuery, 'getBalance', [address]);
          return [address, balance];
        });
      }),
    ).then((value) => {
      return value.reduce((obj, item) => {
        if (!item) {
          return obj;
        }

        const [address, balance] = item;
        return {
          ...obj,
          [address]: {
            balance,
          },
        };
      }, {});
    });
  }
}

export default AccountTrackerController
