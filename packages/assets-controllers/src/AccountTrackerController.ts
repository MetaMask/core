import type { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
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
import { assert, hasProperty, type Hex } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import BN from 'bn.js';
import { cloneDeep, isEqual } from 'lodash';
import abiSingleCallBalancesContract from 'single-call-balance-checker-abi';

import {
  SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID,
  STAKING_CONTRACT_ADDRESS_BY_CHAINID,
  type AssetsContractController,
  type StakedBalance,
} from './AssetsContractController';
import { reduceInBatchesSerially, TOKEN_PRICES_BATCH_SIZE } from './assetsUtil';
import {
  AccountsApiBalanceFetcher,
  type BalanceFetcher,
  type ProcessedBalance,
} from './multi-chain-accounts-service/api-balance-fetcher';

/**
 * The name of the {@link AccountTrackerController}.
 */
const controllerName = 'AccountTrackerController';

export type ChainIdHex = Hex;
export type ChecksumAddress = Hex;

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000' as ChecksumAddress;

/**
 * RPC-based balance fetcher for AccountTrackerController.
 * Fetches only native balances and staked balances (no token balances).
 */
class AccountTrackerRpcBalanceFetcher implements BalanceFetcher {
  readonly #getProvider: (chainId: Hex) => Web3Provider;

  readonly #getNetworkClient: (chainId: Hex) => NetworkClient;

  readonly #includeStakedAssets: boolean;

  readonly #getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];

  constructor(
    getProvider: (chainId: Hex) => Web3Provider,
    getNetworkClient: (chainId: Hex) => NetworkClient,
    includeStakedAssets: boolean,
    getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'],
  ) {
    this.#getProvider = getProvider;
    this.#getNetworkClient = getNetworkClient;
    this.#includeStakedAssets = includeStakedAssets;
    this.#getStakedBalanceForChain = getStakedBalanceForChain;
  }

  supports(): boolean {
    return true; // fallback – supports every chain
  }

  async fetch({
    chainIds,
    queryAllAccounts,
    selectedAccount,
    allAccounts,
  }: Parameters<BalanceFetcher['fetch']>[0]): Promise<ProcessedBalance[]> {
    // Process all chains in parallel for better performance
    const chainProcessingPromises = chainIds.map(async (chainId) => {
      const accountsToUpdate = queryAllAccounts
        ? Object.values(allAccounts).map(
            (account) =>
              toChecksumHexAddress(account.address) as ChecksumAddress,
          )
        : [selectedAccount];

      const { provider, blockTracker } = this.#getNetworkClient(chainId);
      const ethQuery = new EthQuery(provider);
      const chainResults: ProcessedBalance[] = [];

      // Force fresh block data before multicall
      await safelyExecuteWithTimeout(() =>
        blockTracker?.checkForLatestBlock?.(),
      );

      // Fetch native balances
      if (hasProperty(SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID, chainId)) {
        const contractAddress = SINGLE_CALL_BALANCES_ADDRESS_BY_CHAINID[
          chainId
        ] as string;

        const contract = new Contract(
          contractAddress,
          abiSingleCallBalancesContract,
          this.#getProvider(chainId),
        );

        const nativeBalances = await safelyExecuteWithTimeout(
          () =>
            contract.balances(accountsToUpdate, [ZERO_ADDRESS]) as Promise<
              BigNumber[]
            >,
          false,
          3_000, // 3s max call for multicall contract call
        );

        if (nativeBalances) {
          accountsToUpdate.forEach((address, index) => {
            chainResults.push({
              success: true,
              value: new BN(nativeBalances[index].toString()),
              account: address,
              token: ZERO_ADDRESS,
              chainId,
            });
          });
        }
      } else {
        // Process accounts in batches using reduceInBatchesSerially
        await reduceInBatchesSerially<string, void>({
          values: accountsToUpdate,
          batchSize: TOKEN_PRICES_BATCH_SIZE,
          initialResult: undefined,
          eachBatch: async (workingResult: void, batch: string[]) => {
            const balancePromises = batch.map(async (address: string) => {
              const balanceResult = await this.#getBalanceFromChain(
                address,
                ethQuery,
              ).catch(() => null);

              if (balanceResult) {
                chainResults.push({
                  success: true,
                  value: new BN(balanceResult.replace('0x', ''), 16),
                  account: address as ChecksumAddress,
                  token: ZERO_ADDRESS,
                  chainId,
                });
              } else {
                chainResults.push({
                  success: false,
                  account: address as ChecksumAddress,
                  token: ZERO_ADDRESS,
                  chainId,
                });
              }
            });

            await Promise.allSettled(balancePromises);
            return workingResult;
          },
        });
      }

      // Fetch staked balances if enabled
      if (this.#includeStakedAssets) {
        const stakedBalancesPromise = this.#getStakedBalanceForChain(
          accountsToUpdate,
          chainId,
        );

        const stakedBalanceResult = await safelyExecuteWithTimeout(
          async () =>
            (await stakedBalancesPromise) as Record<string, StakedBalance>,
        );

        if (stakedBalanceResult) {
          // Find the staking contract address for this chain
          const stakingContractAddress =
            STAKING_CONTRACT_ADDRESS_BY_CHAINID[
              chainId as keyof typeof STAKING_CONTRACT_ADDRESS_BY_CHAINID
            ];

          if (stakingContractAddress) {
            Object.entries(stakedBalanceResult).forEach(
              ([address, balance]) => {
                chainResults.push({
                  success: true,
                  value: balance
                    ? new BN(balance.replace('0x', ''), 16)
                    : new BN('0'),
                  account: address as ChecksumAddress,
                  token: toChecksumHexAddress(
                    stakingContractAddress,
                  ) as ChecksumAddress,
                  chainId,
                });
              },
            );
          }
        }
      }

      return chainResults;
    });

    // Wait for all chains to complete (or fail) and collect results
    const chainResultsArray = await Promise.allSettled(chainProcessingPromises);
    const results: ProcessedBalance[] = [];

    chainResultsArray.forEach((chainResult) => {
      if (chainResult.status === 'fulfilled') {
        results.push(...chainResult.value);
      } else {
        // Log error but continue with other chains
        console.warn('Chain processing failed:', chainResult.reason);
      }
    });

    return results;
  }

  /**
   * Fetches the balance of a given address from the blockchain.
   *
   * @param address - The account address to fetch the balance for.
   * @param ethQuery - The EthQuery instance to query getBalance with.
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
   * @param options.useAccountsAPI - Enable Accounts‑API strategy (if supported chain).
   * @param options.allowExternalServices - Disable external HTTP calls (privacy / offline mode).
   */
  constructor({
    interval = 10000,
    state,
    messenger,
    getStakedBalanceForChain,
    includeStakedAssets = false,
    useAccountsAPI = false,
    allowExternalServices = () => true,
  }: {
    interval?: number;
    state?: Partial<AccountTrackerControllerState>;
    messenger: AccountTrackerControllerMessenger;
    getStakedBalanceForChain: AssetsContractController['getStakedBalanceForChain'];
    includeStakedAssets?: boolean;
    useAccountsAPI?: boolean;
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

    // Initialize balance fetchers - Strategy order: API first, then RPC fallback
    this.#balanceFetchers = [
      ...(useAccountsAPI && allowExternalServices()
        ? [new AccountsApiBalanceFetcher('extension', this.#getProvider)]
        : []),
      new AccountTrackerRpcBalanceFetcher(
        this.#getProvider,
        this.#getNetworkClient,
        includeStakedAssets,
        getStakedBalanceForChain,
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
            queryAllAccounts: isMultiAccountBalancesEnabled,
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
