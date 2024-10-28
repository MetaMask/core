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
import type {
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import { type Hex, assert } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { cloneDeep } from 'lodash';

import type { AssetsContractController } from './AssetsContractController';

/**
 * The name of the {@link AccountTrackerController}.
 */
const controllerName = 'AccountTrackerController';

/**
 * @type AccountInformation
 *
 * Account information object
 * @property balance - Hex string of an account balance in wei
 * @property stakedBalance - Hex string of an account staked balance in wei
 */
export type AccountInformation = {
  balance: string;
  stakedBalance?: string;
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

/** The input to start polling for the {@link AccountTrackerController} */
type AccountTrackerPollingInput = {
  networkClientId: NetworkClientId;
};

/**
 * Controller that tracks the network balances for all user accounts.
 */
export class AccountTrackerController extends StaticIntervalPollingController<AccountTrackerPollingInput>()<
  typeof controllerName,
  AccountTrackerControllerState,
  AccountTrackerControllerMessenger
> {
  readonly #refreshMutex = new Mutex();

  readonly #includeStakedAssets: boolean;

  readonly #getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];

  #handle?: ReturnType<typeof setTimeout>;

  /**
   * Creates an AccountTracker instance.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new account balances.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller messaging system.
   * @param options.getStakedBalanceForChain - The function to get the staked native asset balance for a chain.
   * @param options.includeStakedAssets - Whether to include staked assets in the account balances.
   */
  constructor({
    interval = 10000,
    state,
    messenger,
    getStakedBalanceForChain,
    includeStakedAssets = false,
  }: {
    interval?: number;
    state?: Partial<AccountTrackerControllerState>;
    messenger: AccountTrackerControllerMessenger;
    getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];
    includeStakedAssets?: boolean;
  }) {
    const { selectedNetworkClientId } = messenger.call(
      'NetworkController:getState',
    );
    const {
      configuration: { chainId },
    } = messenger.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
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
    this.#getStakedBalanceForChain = getStakedBalanceForChain;

    this.#includeStakedAssets = includeStakedAssets;

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
   * Gets the current chain ID.
   * @returns The current chain ID.
   */
  #getCurrentChainId(): Hex {
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const {
      configuration: { chainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );
    return chainId;
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
    const selectedNetworkClientId =
      networkClientId ??
      this.messagingSystem.call('NetworkController:getState')
        .selectedNetworkClientId;
    const {
      configuration: { chainId },
      provider,
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );

    return {
      chainId,
      ethQuery: new EthQuery(provider),
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

    if (this.#handle) {
      clearTimeout(this.#handle);
    }

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
   * @param input - The input for the poll.
   * @param input.networkClientId - The network client ID used to get balances.
   */
  async _executePoll({
    networkClientId,
  }: AccountTrackerPollingInput): Promise<void> {
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
        if (this.#includeStakedAssets) {
          const stakedBalance = await this.#getStakedBalanceForChain(
            address,
            networkClientId,
          );
          if (stakedBalance) {
            accountsForChain[address] = {
              ...accountsForChain[address],
              stakedBalance,
            };
          }
        }
      }

      this.update((state) => {
        if (chainId === this.#getCurrentChainId()) {
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
      addresses.map(
        (
          address,
        ): Promise<[string, string, string | undefined] | undefined> => {
          return safelyExecuteWithTimeout(async () => {
            assert(ethQuery, 'Provider not set.');
            const balance = await query(ethQuery, 'getBalance', [address]);

            let stakedBalance: string | undefined;
            if (this.#includeStakedAssets) {
              stakedBalance = await this.#getStakedBalanceForChain(
                address,
                networkClientId,
              );
            }
            return [address, balance, stakedBalance];
          });
        },
      ),
    ).then((value) => {
      return value.reduce((obj, item) => {
        if (!item) {
          return obj;
        }

        const [address, balance, stakedBalance] = item;
        return {
          ...obj,
          [address]: {
            balance,
            stakedBalance,
          },
        };
      }, {});
    });
  }
}

export default AccountTrackerController;
