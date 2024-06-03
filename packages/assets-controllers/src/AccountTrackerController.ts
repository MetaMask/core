import type { BaseConfig, BaseState } from '@metamask/base-controller';
import { query, safelyExecuteWithTimeout } from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type { Provider } from '@metamask/eth-query';
import type {
  NetworkClientId,
  NetworkController,
  NetworkState,
} from '@metamask/network-controller';
import { StaticIntervalPollingControllerV1 } from '@metamask/polling-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import { assert } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { cloneDeep } from 'lodash';

/**
 * @type AccountInformation
 *
 * Account information object
 * @property balance - Hex string of an account balancec in wei
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface AccountInformation {
  balance: string;
}

/**
 * @type AccountTrackerConfig
 *
 * Account tracker controller configuration
 * @property provider - Provider used to create a new underlying EthQuery instance
 */
// This interface was created before this ESLint rule was added.
// Remove in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface AccountTrackerConfig extends BaseConfig {
  interval: number;
  provider?: Provider;
}

/**
 * @type AccountTrackerState
 *
 * Account tracker controller state
 * @property accounts - Map of addresses to account information
 */
// This interface was created before this ESLint rule was added.
// Remove in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface AccountTrackerState extends BaseState {
  accounts: { [address: string]: AccountInformation };
  accountsByChainId: Record<string, { [address: string]: AccountInformation }>;
}

/**
 * Controller that tracks the network balances for all user accounts.
 */
export class AccountTrackerController extends StaticIntervalPollingControllerV1<
  AccountTrackerConfig,
  AccountTrackerState
> {
  private _provider?: Provider;

  private readonly refreshMutex = new Mutex();

  private handle?: ReturnType<typeof setTimeout>;

  private syncAccounts(newChainId: string) {
    const accounts = { ...this.state.accounts };
    const accountsByChainId = cloneDeep(this.state.accountsByChainId);

    const existing = Object.keys(accounts);
    if (!accountsByChainId[newChainId]) {
      accountsByChainId[newChainId] = {};
      existing.forEach((address) => {
        accountsByChainId[newChainId][address] = { balance: '0x0' };
      });
    }

    const addresses = Object.keys(this.getIdentities());
    const newAddresses = addresses.filter(
      (address) => !existing.includes(address),
    );
    const oldAddresses = existing.filter(
      (address) => !addresses.includes(address),
    );
    newAddresses.forEach((address) => {
      accounts[address] = { balance: '0x0' };
    });
    Object.keys(accountsByChainId).forEach((chainId) => {
      newAddresses.forEach((address) => {
        accountsByChainId[chainId][address] = {
          balance: '0x0',
        };
      });
    });

    oldAddresses.forEach((address) => {
      delete accounts[address];
    });
    Object.keys(accountsByChainId).forEach((chainId) => {
      oldAddresses.forEach((address) => {
        delete accountsByChainId[chainId][address];
      });
    });

    this.update({ accounts, accountsByChainId });
  }

  /**
   * Name of this controller used during composition
   */
  override name = 'AccountTrackerController' as const;

  private readonly getIdentities: () => PreferencesState['identities'];

  private readonly getSelectedAddress: () => PreferencesState['selectedAddress'];

  private readonly getMultiAccountBalancesEnabled: () => PreferencesState['isMultiAccountBalancesEnabled'];

  private readonly getCurrentChainId: () => NetworkState['providerConfig']['chainId'];

  private readonly getNetworkClientById: NetworkController['getNetworkClientById'];

  /**
   * Creates an AccountTracker instance.
   *
   * @param options - The controller options.
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.getIdentities - Gets the identities from the Preferences store.
   * @param options.getSelectedAddress - Gets the selected address from the Preferences store.
   * @param options.getMultiAccountBalancesEnabled - Gets the multi account balances enabled flag from the Preferences store.
   * @param options.getCurrentChainId - Gets the chain ID for the current network from the Network store.
   * @param options.getNetworkClientById - Gets the network client with the given id from the NetworkController.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onPreferencesStateChange,
      getIdentities,
      getSelectedAddress,
      getMultiAccountBalancesEnabled,
      getCurrentChainId,
      getNetworkClientById,
    }: {
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
      ) => void;
      getIdentities: () => PreferencesState['identities'];
      getSelectedAddress: () => PreferencesState['selectedAddress'];
      getMultiAccountBalancesEnabled: () => PreferencesState['isMultiAccountBalancesEnabled'];
      getCurrentChainId: () => NetworkState['providerConfig']['chainId'];
      getNetworkClientById: NetworkController['getNetworkClientById'];
    },
    config?: Partial<AccountTrackerConfig>,
    state?: Partial<AccountTrackerState>,
  ) {
    super(config, state);
    this.defaultConfig = {
      interval: 10000,
    };
    this.defaultState = {
      accounts: {},
      accountsByChainId: {
        [getCurrentChainId()]: {},
      },
    };
    this.initialize();
    this.setIntervalLength(this.config.interval);
    this.getIdentities = getIdentities;
    this.getSelectedAddress = getSelectedAddress;
    this.getMultiAccountBalancesEnabled = getMultiAccountBalancesEnabled;
    this.getCurrentChainId = getCurrentChainId;
    this.getNetworkClientById = getNetworkClientById;
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
  set provider(provider: Provider) {
    this._provider = provider;
  }

  get provider() {
    throw new Error('Property only used for setting');
  }

  /**
   * Resolves a networkClientId to a network client config
   * or globally selected network config if not provided
   *
   * @param networkClientId - Optional networkClientId to fetch a network client with
   * @returns network client config
   */
  #getCorrectNetworkClient(networkClientId?: NetworkClientId): {
    chainId: string;
    ethQuery?: EthQuery;
  } {
    if (networkClientId) {
      const networkClient = this.getNetworkClientById(networkClientId);

      return {
        chainId: networkClient.configuration.chainId,
        ethQuery: new EthQuery(networkClient.provider),
      };
    }

    return {
      chainId: this.getCurrentChainId(),
      ethQuery: this._provider ? new EthQuery(this._provider) : undefined,
    };
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval trigger a 'refresh'.
   */
  async poll(interval?: number): Promise<void> {
    interval && this.configure({ interval }, false, false);
    this.handle && clearTimeout(this.handle);
    await this.refresh();
    this.handle = setTimeout(() => {
      this.poll(this.config.interval);
    }, this.config.interval);
  }

  /**
   * Refreshes the balances of the accounts using the networkClientId
   *
   * @param networkClientId - The network client ID used to get balances.
   */
  async _executePoll(networkClientId: string): Promise<void> {
    this.refresh(networkClientId);
  }

  /**
   * Refreshes the balances of the accounts depending on the multi-account setting.
   * If multi-account is disabled, only updates the selected account balance.
   * If multi-account is enabled, updates balances for all accounts.
   *
   * @param networkClientId - Optional networkClientId to fetch a network client with
   */
  refresh = async (networkClientId?: NetworkClientId) => {
    const releaseLock = await this.refreshMutex.acquire();
    try {
      const { chainId, ethQuery } =
        this.#getCorrectNetworkClient(networkClientId);
      this.syncAccounts(chainId);
      const { accounts, accountsByChainId } = this.state;
      const isMultiAccountBalancesEnabled =
        this.getMultiAccountBalancesEnabled();

      const accountsToUpdate = isMultiAccountBalancesEnabled
        ? Object.keys(accounts)
        : [this.getSelectedAddress()];

      const accountsForChain = { ...accountsByChainId[chainId] };
      for (const address of accountsToUpdate) {
        const balance = await this.getBalanceFromChain(address, ethQuery);
        if (balance) {
          accountsForChain[address] = {
            balance,
          };
        }
      }

      this.update({
        ...(chainId === this.getCurrentChainId() && {
          accounts: accountsForChain,
        }),
        accountsByChainId: {
          ...this.state.accountsByChainId,
          [chainId]: accountsForChain,
        },
      });
    } finally {
      releaseLock();
    }
  };

  /**
   * Fetches the balance of a given address from the blockchain.
   *
   * @param address - The account address to fetch the balance for.
   * @param ethQuery - The EthQuery instance to query getBalnce with.
   * @returns A promise that resolves to the balance in a hex string format.
   */
  private async getBalanceFromChain(
    address: string,
    ethQuery?: EthQuery,
  ): Promise<string | undefined> {
    return await safelyExecuteWithTimeout(async () => {
      assert(ethQuery, 'Provider not set.');
      return await query(ethQuery, 'getBalance', [address]);
    });
  }

  /**
   * Sync accounts balances with some additional addresses.
   *
   * @param addresses - the additional addresses, may be hardware wallet addresses.
   * @param networkClientId - Optional networkClientId to fetch a network client with.
   * @returns accounts - addresses with synced balance
   */
  async syncBalanceWithAddresses(
    addresses: string[],
    networkClientId?: NetworkClientId,
  ): Promise<Record<string, { balance: string }>> {
    const { ethQuery } = this.#getCorrectNetworkClient(networkClientId);

    return await Promise.all(
      addresses.map((address): Promise<[string, string] | undefined> => {
        return safelyExecuteWithTimeout(async () => {
          assert(ethQuery, 'Provider not set.');
          const balance = await query(ethQuery, 'getBalance', [address]);
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

export default AccountTrackerController;
