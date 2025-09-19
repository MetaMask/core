import { Web3Provider } from '@ethersproject/providers';
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
  NetworkClient,
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import { assert, type Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { cloneDeep, isEqual } from 'lodash';

import type {
  AssetsContractController,
  StakedBalance,
} from './AssetsContractController';
import {
  AccountsApiBalanceFetcher,
  type BalanceFetcher,
  type ProcessedBalance,
} from './multi-chain-accounts-service/api-balance-fetcher';
import { RpcBalanceFetcher } from './rpc-service/rpc-balance-fetcher';

/**
 * The name of the {@link AccountTrackerController}.
 */
const controllerName = 'AccountTrackerController';

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;

/**
 * Creates an RPC balance fetcher configured for AccountTracker use case.
 * Returns only native balances and staked balances (no token balances).
 *
 * @param getProvider - Function to get Web3Provider for a given chain ID
 * @param getNetworkClient - Function to get NetworkClient for a given chain ID
 * @param includeStakedAssets - Whether to include staked assets in the fetch
 * @returns BalanceFetcher configured to fetch only native and optionally staked balances
 */
function createAccountTrackerRpcBalanceFetcher(
  getProvider: (chainId: Hex) => Web3Provider,
  getNetworkClient: (chainId: Hex) => NetworkClient,
  includeStakedAssets: boolean,
): BalanceFetcher {
  // Provide empty tokens state to ensure only native and staked balances are fetched
  const getEmptyTokensState = () => ({
    allTokens: {},
    allDetectedTokens: {},
  });

  const rpcBalanceFetcher = new RpcBalanceFetcher(
    getProvider,
    getNetworkClient,
    getEmptyTokensState,
  );

  // Wrap the RpcBalanceFetcher to filter staked balances when not needed
  return {
    supports(_chainId: ChainIdHex): boolean {
      return rpcBalanceFetcher.supports();
    },

    async fetch(params) {
      const balances = await rpcBalanceFetcher.fetch(params);

      if (!includeStakedAssets) {
        // Filter out staked balances from the results
        return balances.filter((balance) => balance.token === ZERO_ADDRESS);
      }

      return balances;
    },
  };
}

/**
 * AccountInformation
 *
 * Account information object
 *
 * balance - Hex string of an account balance in wei
 *
 * stakedBalance - Hex string of an account staked balance in wei
 */
export type AccountInformation = {
  balance: string;
  stakedBalance?: string;
};

/**
 * AccountTrackerControllerState
 *
 * Account tracker controller state
 *
 * accountsByChainId - Map of addresses to account information by chain
 */
export type AccountTrackerControllerState = {
  accountsByChainId: Record<string, { [address: string]: AccountInformation }>;
};

const accountTrackerMetadata = {
  accountsByChainId: {
    includeInStateLogs: false,
    persist: true,
    anonymous: false,
    usedInUi: true,
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
 * The action that can be performed to update multiple native token balances in batch.
 */
export type AccountTrackerUpdateNativeBalancesAction = {
  type: `${typeof controllerName}:updateNativeBalances`;
  handler: AccountTrackerController['updateNativeBalances'];
};

/**
 * The action that can be performed to update multiple staked balances in batch.
 */
export type AccountTrackerUpdateStakedBalancesAction = {
  type: `${typeof controllerName}:updateStakedBalances`;
  handler: AccountTrackerController['updateStakedBalances'];
};

/**
 * The actions that can be performed using the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerActions =
  | AccountTrackerControllerGetStateAction
  | AccountTrackerUpdateNativeBalancesAction
  | AccountTrackerUpdateStakedBalancesAction;

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
  queryAllAccounts?: boolean;
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

  readonly #accountsApiChainIds: ChainIdHex[];

  readonly #getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];

  readonly #balanceFetchers: BalanceFetcher[];

  /**
   * Creates an AccountTracker instance.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new account balances.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller messaging system.
   * @param options.getStakedBalanceForChain - The function to get the staked native asset balance for a chain.
   * @param options.includeStakedAssets - Whether to include staked assets in the account balances.
   * @param options.accountsApiChainIds - Array of chainIds that should use Accounts-API strategy (if supported by API).
   * @param options.allowExternalServices - Disable external HTTP calls (privacy / offline mode).
   */
  constructor({
    interval = 10000,
    state,
    messenger,
    getStakedBalanceForChain,
    includeStakedAssets = false,
    accountsApiChainIds = [],
    allowExternalServices = () => true,
  }: {
    interval?: number;
    state?: Partial<AccountTrackerControllerState>;
    messenger: AccountTrackerControllerMessenger;
    getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];
    includeStakedAssets?: boolean;
    accountsApiChainIds?: ChainIdHex[];
    allowExternalServices?: () => boolean;
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
    this.#accountsApiChainIds = [...accountsApiChainIds];

    // Initialize balance fetchers - Strategy order: API first, then RPC fallback
    this.#balanceFetchers = [
      ...(accountsApiChainIds.length > 0 && allowExternalServices()
        ? [this.#createAccountsApiFetcher()]
        : []),
      createAccountTrackerRpcBalanceFetcher(
        this.#getProvider,
        this.#getNetworkClient,
        this.#includeStakedAssets,
      ),
    ];

    this.setIntervalLength(interval);

    this.messagingSystem.subscribe(
      'AccountsController:selectedEvmAccountChange',
      (newAddress, prevAddress) => {
        if (newAddress !== prevAddress) {
          // Making an async call for this new event
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.refresh(this.#getNetworkClientIds());
        }
      },
      (event): string => event.address,
    );

    this.#registerMessageHandlers();
  }

  private syncAccounts(newChainIds: string[]) {
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

    // Initialize new chain IDs if they don't exist
    newChainIds.forEach((newChainId) => {
      if (!accountsByChainId[newChainId]) {
        accountsByChainId[newChainId] = {};
        existing.forEach((address) => {
          accountsByChainId[newChainId][address] = { balance: '0x0' };
        });
      }
    });

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

    if (!isEqual(this.state.accountsByChainId, accountsByChainId)) {
      this.update((state) => {
        state.accountsByChainId = accountsByChainId;
      });
    }
  }

  readonly #getProvider = (chainId: Hex): Web3Provider => {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    const client = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return new Web3Provider(client.provider);
  };

  readonly #getNetworkClient = (chainId: Hex) => {
    const { networkConfigurationsByChainId } = this.messagingSystem.call(
      'NetworkController:getState',
    );
    const cfg = networkConfigurationsByChainId[chainId];
    const { networkClientId } = cfg.rpcEndpoints[cfg.defaultRpcEndpointIndex];
    return this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
  };

  /**
   * Creates an AccountsApiBalanceFetcher that only supports chains in the accountsApiChainIds array
   *
   * @returns A BalanceFetcher that wraps AccountsApiBalanceFetcher with chainId filtering
   */
  readonly #createAccountsApiFetcher = (): BalanceFetcher => {
    const originalFetcher = new AccountsApiBalanceFetcher(
      'extension',
      this.#getProvider,
    );

    return {
      supports: (chainId: ChainIdHex): boolean => {
        // Only support chains that are both:
        // 1. In our specified accountsApiChainIds array
        // 2. Actually supported by the AccountsApi
        return (
          this.#accountsApiChainIds.includes(chainId) &&
          originalFetcher.supports(chainId)
        );
      },
      fetch: originalFetcher.fetch.bind(originalFetcher),
    };
  };

  /**
   * Resolves a networkClientId to a network client config
   * or globally selected network config if not provided
   *
   * @param networkClientId - Optional networkClientId to fetch a network client with
   * @returns network client config
   */
  #getCorrectNetworkClient(networkClientId?: NetworkClientId) {
    const selectedNetworkClientId =
      networkClientId ??
      this.messagingSystem.call('NetworkController:getState')
        .selectedNetworkClientId;
    const {
      configuration: { chainId },
      provider,
      blockTracker,
    } = this.messagingSystem.call(
      'NetworkController:getNetworkClientById',
      selectedNetworkClientId,
    );

    return {
      chainId,
      provider,
      ethQuery: new EthQuery(provider),
      blockTracker,
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
   * @param input.queryAllAccounts - Whether to query all accounts or just the selected account
   */
  async _executePoll({
    networkClientIds,
    queryAllAccounts = false,
  }: AccountTrackerPollingInput): Promise<void> {
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.refresh(networkClientIds, queryAllAccounts);
  }

  /**
   * Refreshes the balances of the accounts depending on the multi-account setting.
   * If multi-account is disabled, only updates the selected account balance.
   * If multi-account is enabled, updates balances for all accounts.
   *
   * @param networkClientIds - Optional network client IDs to fetch a network client with
   * @param queryAllAccounts - Whether to query all accounts or just the selected account
   */
  async refresh(
    networkClientIds: NetworkClientId[],
    queryAllAccounts: boolean = false,
  ) {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    const allAccounts = this.messagingSystem.call(
      'AccountsController:listAccounts',
    );
    const { isMultiAccountBalancesEnabled } = this.messagingSystem.call(
      'PreferencesController:getState',
    );

    const releaseLock = await this.#refreshMutex.acquire();
    try {
      const chainIds = networkClientIds.map((networkClientId) => {
        const { chainId } = this.#getCorrectNetworkClient(networkClientId);
        return chainId;
      });

      this.syncAccounts(chainIds);

      // Use balance fetchers with fallback strategy
      const aggregated: ProcessedBalance[] = [];
      let remainingChains = [...chainIds] as ChainIdHex[];

      // Try each fetcher in order, removing successfully processed chains
      for (const fetcher of this.#balanceFetchers) {
        const supportedChains = remainingChains.filter((c) =>
          fetcher.supports(c),
        );
        if (!supportedChains.length) {
          continue;
        }

        try {
          const balances = await fetcher.fetch({
            chainIds: supportedChains,
            queryAllAccounts: queryAllAccounts ?? isMultiAccountBalancesEnabled,
            selectedAccount: toChecksumHexAddress(
              selectedAccount.address,
            ) as ChecksumAddress,
            allAccounts,
          });

          if (balances && balances.length > 0) {
            aggregated.push(...balances);
            // Remove chains that were successfully processed
            const processedChains = new Set(balances.map((b) => b.chainId));
            remainingChains = remainingChains.filter(
              (chain) => !processedChains.has(chain),
            );
          }
        } catch (error) {
          console.warn(
            `Balance fetcher failed for chains ${supportedChains.join(', ')}: ${String(error)}`,
          );
          // Continue to next fetcher (fallback)
        }

        // If all chains have been processed, break early
        if (remainingChains.length === 0) {
          break;
        }
      }

      // Build a _copy_ of the current state and track whether anything changed
      const nextAccountsByChainId: AccountTrackerControllerState['accountsByChainId'] =
        cloneDeep(this.state.accountsByChainId);
      let hasChanges = false;

      // Process the aggregated balance results
      const stakedBalancesByChainAndAddress: Record<
        string,
        Record<string, string>
      > = {};

      aggregated.forEach(({ success, value, account, token, chainId }) => {
        if (success && value !== undefined) {
          const checksumAddress = toChecksumHexAddress(account);
          const hexValue = `0x${value.toString(16)}`;

          if (token === ZERO_ADDRESS) {
            // Native balance
            // Ensure the account entry exists before accessing it
            if (!nextAccountsByChainId[chainId]) {
              nextAccountsByChainId[chainId] = {};
            }
            if (!nextAccountsByChainId[chainId][checksumAddress]) {
              nextAccountsByChainId[chainId][checksumAddress] = {
                balance: '0x0',
              };
            }

            if (
              nextAccountsByChainId[chainId][checksumAddress].balance !==
              hexValue
            ) {
              nextAccountsByChainId[chainId][checksumAddress].balance =
                hexValue;
              hasChanges = true;
            }
          } else {
            // Staked balance (from staking contract address)
            if (!stakedBalancesByChainAndAddress[chainId]) {
              stakedBalancesByChainAndAddress[chainId] = {};
            }
            stakedBalancesByChainAndAddress[chainId][checksumAddress] =
              hexValue;
          }
        }
      });

      // Apply staked balances
      Object.entries(stakedBalancesByChainAndAddress).forEach(
        ([chainId, balancesByAddress]) => {
          Object.entries(balancesByAddress).forEach(
            ([address, stakedBalance]) => {
              // Ensure account structure exists
              if (!nextAccountsByChainId[chainId]) {
                nextAccountsByChainId[chainId] = {};
              }
              if (!nextAccountsByChainId[chainId][address]) {
                nextAccountsByChainId[chainId][address] = { balance: '0x0' };
              }
              if (
                nextAccountsByChainId[chainId][address].stakedBalance !==
                stakedBalance
              ) {
                nextAccountsByChainId[chainId][address].stakedBalance =
                  stakedBalance;
                hasChanges = true;
              }
            },
          );
        },
      );

      // Only update state if something changed
      if (hasChanges) {
        this.update((state) => {
          state.accountsByChainId = nextAccountsByChainId;
        });
      }
    } finally {
      releaseLock();
    }
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

    // TODO: This should use multicall when enabled by the user.
    return await Promise.all(
      addresses.map(
        (address): Promise<[string, string, StakedBalance] | undefined> => {
          return safelyExecuteWithTimeout(async () => {
            assert(ethQuery, 'Provider not set.');
            const balance = await query(ethQuery, 'getBalance', [address]);

            let stakedBalance: StakedBalance;
            if (this.#includeStakedAssets) {
              stakedBalance = (
                await this.#getStakedBalanceForChain([address], networkClientId)
              )[address];
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

  /**
   * Updates the balances of multiple native tokens in a single batch operation.
   * This is more efficient than calling updateNativeToken multiple times as it
   * triggers only one state update.
   *
   * @param balances - Array of balance updates, each containing address, chainId, and balance.
   */
  updateNativeBalances(
    balances: { address: string; chainId: Hex; balance: Hex }[],
  ) {
    this.update((state) => {
      balances.forEach(({ address, chainId, balance }) => {
        const checksumAddress = toChecksumHexAddress(address);

        // Ensure the chainId exists in the state
        if (!state.accountsByChainId[chainId]) {
          state.accountsByChainId[chainId] = {};
        }

        // Ensure the address exists for this chain
        if (!state.accountsByChainId[chainId][checksumAddress]) {
          state.accountsByChainId[chainId][checksumAddress] = {
            balance: '0x0',
          };
        }

        // Update the balance
        state.accountsByChainId[chainId][checksumAddress].balance = balance;
      });
    });
  }

  /**
   * Updates the staked balances of multiple accounts in a single batch operation.
   * This is more efficient than updating staked balances individually as it
   * triggers only one state update.
   *
   * @param stakedBalances - Array of staked balance updates, each containing address, chainId, and stakedBalance.
   */
  updateStakedBalances(
    stakedBalances: {
      address: string;
      chainId: Hex;
      stakedBalance: StakedBalance;
    }[],
  ) {
    this.update((state) => {
      stakedBalances.forEach(({ address, chainId, stakedBalance }) => {
        const checksumAddress = toChecksumHexAddress(address);

        // Ensure the chainId exists in the state
        if (!state.accountsByChainId[chainId]) {
          state.accountsByChainId[chainId] = {};
        }

        // Ensure the address exists for this chain
        if (!state.accountsByChainId[chainId][checksumAddress]) {
          state.accountsByChainId[chainId][checksumAddress] = {
            balance: '0x0',
          };
        }

        // Update the staked balance
        state.accountsByChainId[chainId][checksumAddress].stakedBalance =
          stakedBalance;
      });
    });
  }

  #registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:updateNativeBalances` as const,
      this.updateNativeBalances.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:updateStakedBalances` as const,
      this.updateStakedBalances.bind(this),
    );
  }
}

export default AccountTrackerController;
