import type {
  AccountsControllerSelectedEvmAccountChangeEvent,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  RestrictedMessenger,
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
import { assert } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { cloneDeep } from 'lodash';

import type {
  AssetsContractController,
  StakedBalance,
} from './AssetsContractController';
import { reduceInBatchesSerially, TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';

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
 * @property accountsByChainId - Map of addresses to account information by chain
 */
export type AccountTrackerControllerState = {
  accountsByChainId: Record<string, { [address: string]: AccountInformation }>;
};

const accountTrackerMetadata = {
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
export type AccountTrackerControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AccountTrackerControllerActions | AllowedActions,
  AccountTrackerControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/** The input to start polling for the {@link AccountTrackerController} */
type AccountTrackerPollingInput = {
  networkClientIds: NetworkClientId[];
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

    this.messagingSystem.subscribe(
      'AccountsController:selectedEvmAccountChange',
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      () => this.refresh(this.#getNetworkClientIds()),
    );
  }

  private syncAccounts(newChainId: string) {
    const accountsByChainId = cloneDeep(this.state.accountsByChainId);
    const { selectedNetworkClientId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const {
      configuration: { chainId: currentChainId },
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );

    const existing = Object.keys(accountsByChainId?.[currentChainId] ?? {});

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
    Object.keys(accountsByChainId).forEach((chainId) => {
      newAddresses.forEach((address) => {
        accountsByChainId[chainId][address] = {
          balance: '0x0',
        };
      });
    });

    Object.keys(accountsByChainId).forEach((chainId) => {
      oldAddresses.forEach((address) => {
        delete accountsByChainId[chainId][address];
      });
    });

    this.update((state) => {
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
   * Retrieves the list of network client IDs.
   *
   * @returns An array of network client IDs.
   */
  #getNetworkClientIds(): NetworkClientId[] {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    return Object.values(networkConfigurationsByChainId).flatMap(
      (networkConfiguration) =>
        networkConfiguration.rpcEndpoints.map(
          (rpcEndpoint) => rpcEndpoint.networkClientId,
        ),
    );
  }

  /**
   * Refreshes the balances of the accounts using the networkClientId
   *
   * @param input - The input for the poll.
   * @param input.networkClientIds - The network client IDs used to get balances.
   */
  async _executePoll({
    networkClientIds,
  }: AccountTrackerPollingInput): Promise<void> {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.refresh(networkClientIds);
  }

  /**
   * Refreshes the balances of the accounts depending on the multi-account setting.
   * If multi-account is disabled, only updates the selected account balance.
   * If multi-account is enabled, updates balances for all accounts.
   *
   * @param networkClientIds - Optional network client IDs to fetch a network client with
   */
  async refresh(networkClientIds: NetworkClientId[]) {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    const releaseLock = await this.#refreshMutex.acquire();
    try {
      // Create an array of promises for each networkClientId
      const updatePromises = networkClientIds.map(async (networkClientId) => {
        const { chainId, ethQuery } =
          this.#getCorrectNetworkClient(networkClientId);
        this.syncAccounts(chainId);
        const { accountsByChainId } = this.state;
        const { isMultiAccountBalancesEnabled } = this.messagingSystem.call(
          'PreferencesController:getState',
        );

        const accountsToUpdate = isMultiAccountBalancesEnabled
          ? Object.keys(accountsByChainId[chainId])
          : [toChecksumHexAddress(selectedAccount.address)];

        const accountsForChain = { ...accountsByChainId[chainId] };

        // Process accounts in batches using reduceInBatchesSerially
        await reduceInBatchesSerially<string, void>({
          values: accountsToUpdate,
          batchSize: TOKEN_PRICES_BATCH_SIZE,
          initialResult: undefined,
          eachBatch: async (workingResult: void, batch: string[]) => {
            const balancePromises = batch.map(async (address: string) => {
              const balancePromise = this.#getBalanceFromChain(
                address,
                ethQuery,
              );
              const stakedBalancePromise = this.#includeStakedAssets
                ? this.#getStakedBalanceForChain(address, networkClientId)
                : Promise.resolve(null);

              const [balanceResult, stakedBalanceResult] =
                await Promise.allSettled([
                  balancePromise,
                  stakedBalancePromise,
                ]);

              // Update account balances
              if (balanceResult.status === 'fulfilled' && balanceResult.value) {
                accountsForChain[address] = {
                  balance: balanceResult.value,
                };
              }

              if (
                stakedBalanceResult.status === 'fulfilled' &&
                stakedBalanceResult.value
              ) {
                accountsForChain[address] = {
                  ...accountsForChain[address],
                  stakedBalance: stakedBalanceResult.value,
                };
              }
            });

            await Promise.allSettled(balancePromises);
            return workingResult;
          },
        });

        // After all batches are processed, return the updated data
        return { chainId, accountsForChain };
      });

      // Wait for all networkClientId updates to settle in parallel
      const allResults = await Promise.allSettled(updatePromises);

      // Update the state once all networkClientId updates are completed
      allResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const { chainId, accountsForChain } = result.value;
          this.update((state) => {
            state.accountsByChainId[chainId] = accountsForChain;
          });
        }
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
  ): Promise<
    Record<string, { balance: string; stakedBalance?: StakedBalance }>
  > {
    const { ethQuery } = this.#getCorrectNetworkClient(networkClientId);

    return await Promise.all(
      addresses.map(
        (address): Promise<[string, string, StakedBalance] | undefined> => {
          return safelyExecuteWithTimeout(async () => {
            assert(ethQuery, 'Provider not set.');
            const balance = await query(ethQuery, 'getBalance', [address]);

            let stakedBalance: StakedBalance;
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
