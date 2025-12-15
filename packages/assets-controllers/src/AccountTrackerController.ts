import { Web3Provider } from '@ethersproject/providers';
import type {
  AccountsControllerSelectedEvmAccountChangeEvent,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListAccountsAction,
} from '@metamask/accounts-controller';
import type {
  ControllerStateChangeEvent,
  ControllerGetStateAction,
  StateMetadata,
} from '@metamask/base-controller';
import {
  query,
  safelyExecuteWithTimeout,
  toChecksumHexAddress,
} from '@metamask/controller-utils';
import EthQuery from '@metamask/eth-query';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkClient,
  NetworkClientId,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerNetworkAddedEvent,
} from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type {
  TransactionControllerTransactionConfirmedEvent,
  TransactionControllerUnapprovedTransactionAddedEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { assert } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { cloneDeep, isEqual } from 'lodash';

import { STAKING_CONTRACT_ADDRESS_BY_CHAINID } from './AssetsContractController';
import type {
  AssetsContractController,
  StakedBalance,
} from './AssetsContractController';
import { AccountsApiBalanceFetcher } from './multi-chain-accounts-service/api-balance-fetcher';
import type {
  BalanceFetcher,
  BalanceFetchResult,
  ProcessedBalance,
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
  const getEmptyTokensState = (): {
    allTokens: Record<string, never>;
    allDetectedTokens: Record<string, never>;
  } => ({
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

    async fetch(
      params: Parameters<BalanceFetcher['fetch']>[0],
    ): Promise<BalanceFetchResult> {
      const result = await rpcBalanceFetcher.fetch(params);

      if (!includeStakedAssets) {
        // Filter out staked balances from the results
        return {
          balances: result.balances.filter(
            (balance) => balance.token === ZERO_ADDRESS,
          ),
          unprocessedChainIds: result.unprocessedChainIds,
        };
      }

      return result;
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

const accountTrackerMetadata: StateMetadata<AccountTrackerControllerState> = {
  accountsByChainId: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
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
  | {
      type: 'PreferencesController:getState';
      handler: () => { isMultiAccountBalancesEnabled: boolean };
    }
  | AccountsControllerGetSelectedAccountAction
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | KeyringControllerGetStateAction;

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
  | TransactionControllerUnapprovedTransactionAddedEvent
  | TransactionControllerTransactionConfirmedEvent
  | NetworkControllerNetworkAddedEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

/**
 * The messenger of the {@link AccountTrackerController}.
 */
export type AccountTrackerControllerMessenger = Messenger<
  typeof controllerName,
  AccountTrackerControllerActions | AllowedActions,
  AccountTrackerControllerEvents | AllowedEvents
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

  readonly #accountsApiChainIds: () => ChainIdHex[];

  readonly #getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];

  readonly #balanceFetchers: BalanceFetcher[];

  readonly #fetchingEnabled: () => boolean;

  readonly #isOnboarded: () => boolean;

  /** Track if the keyring is locked */
  #isLocked = true;

  /**
   * Creates an AccountTracker instance.
   *
   * @param options - The controller options.
   * @param options.interval - Polling interval used to fetch new account balances.
   * @param options.state - Initial state to set on this controller.
   * @param options.messenger - The controller messenger.
   * @param options.getStakedBalanceForChain - The function to get the staked native asset balance for a chain.
   * @param options.includeStakedAssets - Whether to include staked assets in the account balances.
   * @param options.accountsApiChainIds - Function that returns array of chainIds that should use Accounts-API strategy (if supported by API).
   * @param options.allowExternalServices - Disable external HTTP calls (privacy / offline mode).
   * @param options.fetchingEnabled - Function that returns whether the controller is fetching enabled.
   * @param options.isOnboarded - Whether the user has completed onboarding. If false, balance updates are skipped.
   */
  constructor({
    interval = 10000,
    state,
    messenger,
    getStakedBalanceForChain,
    includeStakedAssets = false,
    accountsApiChainIds = (): ChainIdHex[] => [],
    allowExternalServices = (): boolean => true,
    fetchingEnabled = (): boolean => true,
    isOnboarded = (): boolean => true,
  }: {
    interval?: number;
    state?: Partial<AccountTrackerControllerState>;
    messenger: AccountTrackerControllerMessenger;
    getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];
    includeStakedAssets?: boolean;
    accountsApiChainIds?: () => ChainIdHex[];
    allowExternalServices?: () => boolean;
    fetchingEnabled?: () => boolean;
    isOnboarded?: () => boolean;
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
    this.#accountsApiChainIds = accountsApiChainIds;

    // Initialize balance fetchers - Strategy order: API first, then RPC fallback
    this.#balanceFetchers = [
      ...(accountsApiChainIds().length > 0 && allowExternalServices()
        ? [this.#createAccountsApiFetcher()]
        : []),
      createAccountTrackerRpcBalanceFetcher(
        this.#getProvider,
        this.#getNetworkClient,
        this.#includeStakedAssets,
      ),
    ];

    this.#fetchingEnabled = fetchingEnabled;
    this.#isOnboarded = isOnboarded;

    const { isUnlocked } = this.messenger.call('KeyringController:getState');
    this.#isLocked = !isUnlocked;

    this.setIntervalLength(interval);

    this.messenger.subscribe(
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

    this.messenger.subscribe(
      'NetworkController:networkAdded',
      (networkConfiguration) => {
        const { networkClientId } =
          networkConfiguration.rpcEndpoints[
            networkConfiguration.defaultRpcEndpointIndex
          ];
        this.refresh([networkClientId]).catch(() => {
          // Silently handle refresh errors
        });
      },
    );

    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#isLocked = false;
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isLocked = true;
    });

    this.messenger.subscribe(
      'TransactionController:unapprovedTransactionAdded',
      (transactionMeta: TransactionMeta) => {
        const addresses = [transactionMeta.txParams.from];
        if (transactionMeta.txParams.to) {
          addresses.push(transactionMeta.txParams.to);
        }
        this.refreshAddresses({
          networkClientIds: [transactionMeta.networkClientId],
          addresses,
        }).catch(() => {
          // Silently handle refresh errors
        });
      },
    );

    this.messenger.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta: TransactionMeta) => {
        const addresses = [transactionMeta.txParams.from];
        if (transactionMeta.txParams.to) {
          addresses.push(transactionMeta.txParams.to);
        }
        this.refreshAddresses({
          networkClientIds: [transactionMeta.networkClientId],
          addresses,
        }).catch(() => {
          // Silently handle refresh errors
        });
      },
    );

    this.#registerMessageHandlers();
  }

  /**
   * Whether the controller is active (keyring is unlocked and user is onboarded).
   * When locked or not onboarded, balance updates should be skipped.
   *
   * @returns Whether the controller should perform balance updates.
   */
  get isActive(): boolean {
    return !this.#isLocked && this.#isOnboarded();
  }

  #syncAccounts(newChainIds: string[]): void {
    const accountsByChainId = cloneDeep(this.state.accountsByChainId);
    const { selectedNetworkClientId } = this.messenger.call(
      'NetworkController:getState',
    );
    const {
      configuration: { chainId: currentChainId },
    } = this.messenger.call(
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
      this.messenger
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
    const { networkConfigurationsByChainId } = this.messenger.call(
      'NetworkController:getState',
    );
    const networkConfig = networkConfigurationsByChainId[chainId];
    const { networkClientId } =
      networkConfig.rpcEndpoints[networkConfig.defaultRpcEndpointIndex];
    const client = this.messenger.call(
      'NetworkController:getNetworkClientById',
      networkClientId,
    );
    return new Web3Provider(client.provider);
  };

  readonly #getNetworkClient = (chainId: Hex): NetworkClient => {
    const { networkConfigurationsByChainId } = this.messenger.call(
      'NetworkController:getState',
    );
    const networkConfig = networkConfigurationsByChainId[chainId];
    const { networkClientId } =
      networkConfig.rpcEndpoints[networkConfig.defaultRpcEndpointIndex];
    return this.messenger.call(
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
          this.#accountsApiChainIds().includes(chainId) &&
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
  #getCorrectNetworkClient(networkClientId?: NetworkClientId): {
    chainId: Hex;
    provider: NetworkClient['provider'];
    ethQuery: EthQuery;
    blockTracker: NetworkClient['blockTracker'];
  } {
    const selectedNetworkClientId =
      networkClientId ??
      this.messenger.call('NetworkController:getState').selectedNetworkClientId;
    const {
      configuration: { chainId },
      provider,
      blockTracker,
    } = this.messenger.call(
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
    const { networkConfigurationsByChainId } = this.messenger.call(
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
  ): Promise<void> {
    const selectedAccount = this.messenger.call(
      'AccountsController:getSelectedAccount',
    );
    const allAccounts = this.messenger.call('AccountsController:listAccounts');
    const { isMultiAccountBalancesEnabled } = this.messenger.call(
      'PreferencesController:getState',
    );

    await this.#refreshAccounts({
      networkClientIds,
      queryAllAccounts: queryAllAccounts ?? isMultiAccountBalancesEnabled,
      selectedAccount: toChecksumHexAddress(
        selectedAccount.address,
      ) as ChecksumAddress,
      allAccounts,
    });
  }

  async refreshAddresses({
    networkClientIds,
    addresses,
  }: {
    networkClientIds: NetworkClientId[];
    addresses: string[];
  }): Promise<void> {
    const checksummedAddresses = addresses.map((address) =>
      toChecksumHexAddress(address),
    );

    const accounts = this.messenger
      .call('AccountsController:listAccounts')
      .filter((account) =>
        checksummedAddresses.includes(toChecksumHexAddress(account.address)),
      );

    await this.#refreshAccounts({
      networkClientIds,
      queryAllAccounts: true,
      selectedAccount: '0x0',
      allAccounts: accounts,
    });
  }

  async #refreshAccounts({
    networkClientIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
  }: {
    networkClientIds: NetworkClientId[];
    queryAllAccounts: boolean;
    selectedAccount: ChecksumAddress;
    allAccounts: InternalAccount[];
  }): Promise<void> {
    const releaseLock = await this.#refreshMutex.acquire();
    try {
      const chainIds = networkClientIds.map((networkClientId) => {
        const { chainId } = this.#getCorrectNetworkClient(networkClientId);
        return chainId;
      });

      this.#syncAccounts(chainIds);

      if (!this.#fetchingEnabled() || !this.isActive) {
        return;
      }

      // Use balance fetchers with fallback strategy
      const aggregated: ProcessedBalance[] = [];
      let remainingChains = [...chainIds] as ChainIdHex[];

      // Temporary normalization to lowercase for balance fetching to match TokenBalancesController and enable HTTP caching
      const lowerCaseSelectedAccount =
        selectedAccount.toLowerCase() as ChecksumAddress;
      const lowerCaseAllAccounts = allAccounts.map((account) => ({
        ...account,
        address: account.address.toLowerCase(),
      }));

      // Try each fetcher in order, removing successfully processed chains
      for (const fetcher of this.#balanceFetchers) {
        const supportedChains = remainingChains.filter((chainId) =>
          fetcher.supports(chainId),
        );
        if (!supportedChains.length) {
          continue;
        }

        try {
          const result = await fetcher.fetch({
            chainIds: supportedChains,
            queryAllAccounts,
            selectedAccount: lowerCaseSelectedAccount,
            allAccounts: lowerCaseAllAccounts,
          });

          if (result.balances && result.balances.length > 0) {
            aggregated.push(...result.balances);
            // Remove chains that were successfully processed
            const processedChains = new Set(
              result.balances.map((b) => b.chainId),
            );
            remainingChains = remainingChains.filter(
              (chain) => !processedChains.has(chain),
            );
          }

          // Add unprocessed chains back to remainingChains for next fetcher
          if (
            result.unprocessedChainIds &&
            result.unprocessedChainIds.length > 0
          ) {
            // Only add chains that were originally requested and aren't already in remainingChains
            const currentRemainingChains = remainingChains;
            const chainsToAdd = result.unprocessedChainIds.filter(
              (chainId) =>
                supportedChains.includes(chainId) &&
                !currentRemainingChains.includes(chainId),
            );
            remainingChains.push(...chainsToAdd);
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
          } else if (
            STAKING_CONTRACT_ADDRESS_BY_CHAINID[chainId]?.toLowerCase() ===
            token.toLowerCase()
          ) {
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
    // Skip balance fetching if locked or not onboarded to avoid unnecessary RPC calls
    if (!this.isActive) {
      return {};
    }

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
  ): void {
    const nextAccountsByChainId = cloneDeep(this.state.accountsByChainId);
    let hasChanges = false;

    balances.forEach(({ address, chainId, balance }) => {
      const checksumAddress = toChecksumHexAddress(address);

      // Ensure the chainId exists in the state
      if (!nextAccountsByChainId[chainId]) {
        nextAccountsByChainId[chainId] = {};
        hasChanges = true;
      }

      // Check if the address exists for this chain
      const accountExists = Boolean(
        nextAccountsByChainId[chainId][checksumAddress],
      );

      // Ensure the address exists for this chain
      if (!accountExists) {
        nextAccountsByChainId[chainId][checksumAddress] = {
          balance: '0x0',
        };
        hasChanges = true;
      }

      // Only update the balance if it has changed, or if this is a new account
      const currentBalance =
        nextAccountsByChainId[chainId][checksumAddress].balance;
      if (!accountExists || currentBalance !== balance) {
        nextAccountsByChainId[chainId][checksumAddress].balance = balance;
        hasChanges = true;
      }
    });

    // Only call update if there are actual changes
    if (hasChanges) {
      this.update((state) => {
        state.accountsByChainId = nextAccountsByChainId;
      });
    }
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
  ): void {
    const nextAccountsByChainId = cloneDeep(this.state.accountsByChainId);
    let hasChanges = false;

    stakedBalances.forEach(({ address, chainId, stakedBalance }) => {
      const checksumAddress = toChecksumHexAddress(address);

      // Ensure the chainId exists in the state
      if (!nextAccountsByChainId[chainId]) {
        nextAccountsByChainId[chainId] = {};
        hasChanges = true;
      }

      // Check if the address exists for this chain
      const accountExists = Boolean(
        nextAccountsByChainId[chainId][checksumAddress],
      );

      // Ensure the address exists for this chain
      if (!accountExists) {
        nextAccountsByChainId[chainId][checksumAddress] = {
          balance: '0x0',
        };
        hasChanges = true;
      }

      // Only update the staked balance if it has changed, or if this is a new account
      const currentStakedBalance =
        nextAccountsByChainId[chainId][checksumAddress].stakedBalance;
      if (!accountExists || !isEqual(currentStakedBalance, stakedBalance)) {
        nextAccountsByChainId[chainId][checksumAddress].stakedBalance =
          stakedBalance;
        hasChanges = true;
      }
    });

    // Only call update if there are actual changes
    if (hasChanges) {
      this.update((state) => {
        state.accountsByChainId = nextAccountsByChainId;
      });
    }
  }

  #registerMessageHandlers(): void {
    this.messenger.registerActionHandler(
      `${controllerName}:updateNativeBalances` as const,
      this.updateNativeBalances.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:updateStakedBalances` as const,
      this.updateStakedBalances.bind(this),
    );
  }
}

export default AccountTrackerController;
