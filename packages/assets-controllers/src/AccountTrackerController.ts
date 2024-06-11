import type {
  AccountsControllerSelectedEvmAccountChangeEvent,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import {
  query,
  safelyExecuteWithTimeout,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type { Provider } from '@metamask/eth-query';
import type {
  NetworkClient,
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import { assert } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { cloneDeep } from 'lodash';

/**
 * The name of the {@link AccountTrackerController}.
 */
const controllerName = 'AccountTrackerController';

/**
 * @type AccountInformation
 *
 * Account information object
 * @property balance - Hex string of an account balancec in wei
 */
export type AccountInformation = {
  balance: string;
};

/**
 * @type AccountTrackerControllerState
 *
 * Account tracker controller state
 * @property accounts - Map of addresses to account information
 */
export type AccountTrackerControllerState = {
  accounts: { [address: string]: AccountInformation };
  accountsByChainId: Record<string, { [address: string]: AccountInformation }>;
};

const accountTrackerMetadata = {
  accounts: {
    persist: true,
    anonymous: false,
  },
  accountsByChainId: {
    persist: true,
    anonymous: false,
  },
};

/**
 * The action that can be performed to get the state of the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountTrackerControllerState
>;

/**
 * The actions that can be performed using the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerActions =
  AccountTrackerControllerGetStateAction;

/**
 * The messenger of the {@link AccountTrackerController} for communication.
 */
export type AllowedActions =
  | AccountsControllerListAccountsAction
  | PreferencesControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction;

/**
 * The event that {@link AccountTrackerController} can emit.
 */
export type AccountTrackerControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    AccountTrackerControllerState
  >;

/**
 * The events that {@link AccountTrackerController} can emit.
 */
export type AccountTrackerControllerEvents =
  AccountTrackerControllerStateChangeEvent;

/**
 * The external events available to the {@link AccountTrackerController}.
 */
export type AllowedEvents =
  | AccountsControllerSelectedEvmAccountChangeEvent
  | AccountsControllerSelectedAccountChangeEvent;

/**
 * The messenger of the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerMessenger = RestrictedControllerMessenger<
  typeof controllerName,
  AccountTrackerControllerActions | AllowedActions,
  AccountTrackerControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Controller that tracks the network balances for all user accounts.
 */
export class AccountTrackerController extends StaticIntervalPollingController<
  typeof controllerName,
  AccountTrackerControllerState,
  AccountTrackerControllerMessenger
> {
  #provider?: Provider;

  readonly #refreshMutex = new Mutex();

  #handle?: ReturnType<typeof setTimeout>;

  /**
   * Creates an AccountTracker instance.
   *
   * @param options - The controller options.
   * @param options.state - Initial state to set on this controller.
   * @param options.interval - Polling interval used to fetch new account balances.
   * @param options.provider - Network provider.
   * @param options.messenger - The controller messaging system.
   */
  constructor({
    state,
    interval = 10000,
    provider,
    messenger,
  }: {
    interval?: number;
    state?: Partial<AccountTrackerControllerState>;
    provider?: Provider;
    messenger: AccountTrackerControllerMessenger;
  }) {
    const {
      providerConfig: { chainId },
    } = messenger.call('NetworkController:getState');
    super({
      name: controllerName,
      messenger,
      state: {
        accounts: {},
        accountsByChainId: {
          [chainId]: {},
        },
        ...state,
      },
      metadata: accountTrackerMetadata,
    });
    this.#provider = provider;
    this.setIntervalLength(interval);

    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.poll();

    this.messagingSystem.subscribe(
      'AccountsController:selectedEvmAccountChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => this.refresh(),
    );
  }

  /**
   * Sets a new provider.
   * @param provider - Provider used to create a new underlying EthQuery instance.
   */
  setProvider(provider: Provider) {
    this.#provider = provider;
  }

  /**
   * Retrieves the current network client based on the selected network client ID.
   * @returns The current network client.
   */
  #getCurrentNetworkClient(): NetworkClient {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    return this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
  }

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

    // Note: The address from the preferences controller are checksummed
    // The addresses from the accounts controller are lowercased
    const addresses = Object.values(
      this.messagingSystem
        .call('AccountsController:listAccounts')
        .map((internalAccount) =>
          toChecksumHexAddress(internalAccount.address),
        ),
    );
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

    this.update((state) => {
      state.accounts = accounts;
      state.accountsByChainId = accountsByChainId;
    });
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
      const {
        configuration: { chainId },
        provider,
      } = this.messagingSystem.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );

      return {
        chainId,
        ethQuery: new EthQuery(provider),
      };
    }

    const {
      configuration: { chainId },
    } = this.#getCurrentNetworkClient();
    return {
      chainId,
      ethQuery: this.#provider ? new EthQuery(this.#provider) : undefined,
    };
  }

  /**
   * Starts a new polling interval.
   *
   * @param interval - Polling interval trigger a 'refresh'.
   */
  async poll(interval?: number): Promise<void> {
    if (interval) {
      this.setIntervalLength(interval);
    }
    this.#handle && clearTimeout(this.#handle);
    await this.refresh();
    this.#handle = setTimeout(() => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.poll(this.getIntervalLength());
    }, this.getIntervalLength());
  }

  /**
   * Refreshes the balances of the accounts using the networkClientId
   *
   * @param networkClientId - The network client ID used to get balances.
   */
  async _executePoll(networkClientId: string): Promise<void> {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.refresh(networkClientId);
  }

  /**
   * Refreshes the balances of the accounts depending on the multi-account setting.
   * If multi-account is disabled, only updates the selected account balance.
   * If multi-account is enabled, updates balances for all accounts.
   *
   * @param networkClientId - Optional networkClientId to fetch a network client with
   */
  async refresh(networkClientId?: NetworkClientId) {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    const releaseLock = await this.#refreshMutex.acquire();
    try {
      const { chainId, ethQuery } =
        this.#getCorrectNetworkClient(networkClientId);
      this.syncAccounts(chainId);
      const { accounts, accountsByChainId } = this.state;
      const { isMultiAccountBalancesEnabled } = this.messagingSystem.call(
        'PreferencesController:getState',
      );

      const accountsToUpdate = isMultiAccountBalancesEnabled
        ? Object.keys(accounts)
        : [toChecksumHexAddress(selectedAccount.address)];

      const accountsForChain = { ...accountsByChainId[chainId] };
      for (const address of accountsToUpdate) {
        const balance = await this.#getBalanceFromChain(address, ethQuery);
        if (balance) {
          accountsForChain[address] = {
            balance,
          };
        }
      }

      const {
        configuration: { chainId: selectedChainId },
      } = this.#getCurrentNetworkClient();
      this.update((state) => {
        if (chainId === selectedChainId) {
          state.accounts = accountsForChain;
        }
        state.accountsByChainId[chainId] = accountsForChain;
      });
    } finally {
      releaseLock();
    }
  }

  /**
   * Fetches the balance of a given address from the blockchain.
   *
   * @param address - The account address to fetch the balance for.
   * @param ethQuery - The EthQuery instance to query getBalnce with.
   * @returns A promise that resolves to the balance in a hex string format.
   */
  async #getBalanceFromChain(
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
