import { toChecksumAddress } from '@ethereumjs/util';
import { Web3Provider } from '@ethersproject/providers';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkEnablementControllerState } from '@metamask/network-enablement-controller';
import {
  isStrictHexString,
  isCaipChainId,
  numberToHex,
  parseCaipChainId,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import { AbstractDataSource } from './AbstractDataSource';
import type {
  StakedBalancePollingInput,
  StakedBalanceFetchResult,
} from './evm-rpc-services';
import {
  StakedBalanceFetcher,
  getStakingContractAddress,
  getSupportedStakingChainIds,
} from './evm-rpc-services';
import type { AssetsControllerMessenger } from '../AssetsController';
import { projectLogger, createModuleLogger } from '../logger';
import type {
  AccountId,
  ChainId,
  Caip19AssetId,
  AssetBalance,
  AssetMetadata,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';

const CONTROLLER_NAME = 'StakedBalanceDataSource';
const DEFAULT_POLL_INTERVAL = 180_000; // 3 minutes

/** Metadata for staked ETH (same symbol and decimals as native ETH). */
const STAKED_ETH_METADATA: AssetMetadata = {
  type: 'erc20',
  name: 'staked ethereum',
  symbol: 'ETH',
  decimals: 18,
};

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

/** Optional configuration for StakedBalanceDataSource. */
export type StakedBalanceDataSourceConfig = {
  /** Whether staked balance fetching is enabled (default: true). */
  enabled?: boolean;
  /** Polling interval in ms (default: 180s / 3 min). */
  pollInterval?: number;
};

export type StakedBalanceDataSourceOptions = StakedBalanceDataSourceConfig & {
  /** The AssetsController messenger (for accessing NetworkController). */
  messenger: AssetsControllerMessenger;
  /** Called when active chains are updated. */
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
};

/** Per-account supported chains (same shape as in DataRequest). */
type AccountWithSupportedChains = {
  account: InternalAccount;
  supportedChains: ChainId[];
};

/**
 * Subscription data stored for each active subscription.
 * Stores accountsWithSupportedChains so refresh paths use the same per-account
 * scope as normal subscription setup (avoids querying unsupported chains/accounts).
 */
type SubscriptionData = {
  /** Polling tokens from StakedBalanceFetcher. */
  pollingTokens: string[];
  /** Chain IDs being polled (union of all account chains). */
  chains: ChainId[];
  /** Accounts being polled. */
  accounts: InternalAccount[];
  /** Per-account supported chains; used by refreshStakedBalance and transaction handlers. */
  accountsWithSupportedChains: AccountWithSupportedChains[];
  /** Callback to report asset updates. */
  onAssetsUpdate: (
    response: DataResponse,
    request?: DataRequest,
  ) => void | Promise<void>;
};

/**
 * Convert CAIP chain ID or hex chain ID to hex chain ID.
 *
 * @param chainId - CAIP chain ID or hex chain ID.
 * @returns Hex chain ID.
 */
function caipChainIdToHex(chainId: string): Hex {
  if (isStrictHexString(chainId)) {
    return chainId;
  }

  if (isCaipChainId(chainId)) {
    const ref = parseCaipChainId(chainId).reference;
    return numberToHex(parseInt(ref, 10));
  }

  throw new Error('caipChainIdToHex - Failed to provide CAIP-2 or Hex chainId');
}

/**
 * Build the CAIP-19 asset ID for staked balance (same format as ERC20).
 * Uses the staking contract address (checksummed) so it is consistent with
 * other token assets.
 * Example: "eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df"
 *
 * @param chainId - CAIP-2 chain ID (e.g. "eip155:1").
 * @param contractAddress - Staking contract address (hex).
 * @returns The staked asset CAIP-19 ID with checksummed address.
 */
function stakedAssetId(
  chainId: ChainId,
  contractAddress: string,
): Caip19AssetId {
  const checksummed = toChecksumAddress(contractAddress);
  return `${chainId}/erc20:${checksummed}` as Caip19AssetId;
}

/**
 * Data source for fetching staked ETH balances via on-chain staking contracts.
 *
 * Delegates to {@link StakedBalanceFetcher} for the actual RPC calls
 * (getShares + convertToAssets on ERC-4626-style staking contracts).
 * Reports balances as CAIP-19 asset IDs using the ERC20 format with the
 * staking contract address (e.g. "eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df").
 *
 * Only supports chains with known staking contracts (mainnet, Hoodi).
 * Polling is managed by StakedBalanceFetcher via startPolling/stopPollingByPollingToken.
 */
export class StakedBalanceDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  DataSourceState
> {
  readonly #messenger: AssetsControllerMessenger;

  readonly #onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  readonly #pollInterval: number;

  readonly #enabled: boolean;

  /** The StakedBalanceFetcher that handles polling and RPC calls. */
  readonly #stakedBalanceFetcher: StakedBalanceFetcher;

  /** Active subscriptions by ID. */
  readonly #activeSubscriptions: Map<string, SubscriptionData> = new Map();

  /** Cache of Web3Provider instances by hex chain ID. */
  readonly #providerCache: Map<Hex, Web3Provider> = new Map();

  /** CAIP-2 chain IDs that have known staking contracts. */
  readonly #supportedChainIds: ChainId[];

  constructor(options: StakedBalanceDataSourceOptions) {
    super(CONTROLLER_NAME, { activeChains: [] });
    this.#messenger = options.messenger;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#enabled = options.enabled !== false;
    this.#supportedChainIds = getSupportedStakingChainIds() as ChainId[];

    log('Initializing StakedBalanceDataSource', {
      enabled: this.#enabled,
      pollInterval: this.#pollInterval,
    });

    // Create StakedBalanceFetcher with provider getter
    this.#stakedBalanceFetcher = new StakedBalanceFetcher({
      pollingInterval: this.#pollInterval,
      getNetworkProvider: (hexChainId): Web3Provider | undefined =>
        this.#getProvider(hexChainId),
    });

    // Wire the callback so polling results flow back to subscriptions
    this.#stakedBalanceFetcher.setOnStakedBalanceUpdate(
      this.#handleStakedBalanceUpdate.bind(this),
    );

    this.#messenger.subscribe(
      'TransactionController:transactionConfirmed',
      this.#onTransactionConfirmed.bind(this),
    );

    this.#messenger.subscribe(
      'TransactionController:incomingTransactionsReceived',
      this.#onIncomingTransactions.bind(this),
    );

    this.#messenger.subscribe(
      'NetworkController:stateChange',
      this.#onNetworkStateChange.bind(this),
    );

    this.#messenger.subscribe(
      'NetworkEnablementController:stateChange',
      this.#onNetworkEnablementControllerStateChange.bind(this),
    );

    this.#initializeActiveChains();
  }

  /**
   * When NetworkController state changes (e.g. RPC endpoints or network clients
   * reconfigured), clear the provider cache so subsequent fetches use fresh
   * providers.
   */
  #onNetworkStateChange(): void {
    this.#providerCache.clear();
    log('Provider cache cleared after network state change');
  }

  /**
   * When NetworkEnablementController state changes (user enables/disables
   * networks), recompute active chains so we only fetch for enabled staking chains.
   *
   * @param state - The new NetworkEnablementController state.
   */
  #onNetworkEnablementControllerStateChange(
    state: NetworkEnablementControllerState,
  ): void {
    const { enabledNetworkMap } = state ?? {};
    if (!enabledNetworkMap) {
      return;
    }
    this.#initializeActiveChainsFromEnabledMap(enabledNetworkMap);
  }

  /**
   * Returns true if the transaction involves the staking contract (from or to)
   * for the payload's chain, so we only refresh staked balance when relevant.
   *
   * @param payload - Transaction payload.
   * @param payload.chainId - Hex chain ID.
   * @param payload.txParams - Optional transaction params.
   * @param payload.txParams.from - Sender address.
   * @param payload.txParams.to - Recipient address.
   * @returns True if txParams.from or txParams.to matches the staking contract address.
   */
  #isTransactionInvolvingStakingContract(payload: {
    chainId?: string;
    txParams?: { from?: string; to?: string };
  }): boolean {
    const hexChainId = payload?.chainId;
    if (!hexChainId) {
      return false;
    }
    const contractAddress = getStakingContractAddress(hexChainId);
    if (!contractAddress) {
      return false;
    }
    const contractLower = contractAddress.toLowerCase();
    const from = payload.txParams?.from?.toLowerCase();
    const to = payload.txParams?.to?.toLowerCase();
    return from === contractLower || to === contractLower;
  }

  /**
   * When a transaction is confirmed, refresh staked balance only if the
   * transaction is from or to the staking contract for that chain.
   *
   * @param payload - From TransactionController:transactionConfirmed.
   * @param payload.chainId - Hex chain ID of the transaction.
   * @param payload.txParams - Optional transaction params.
   * @param payload.txParams.from - Sender address.
   * @param payload.txParams.to - Recipient address.
   */
  #onTransactionConfirmed(payload: {
    chainId?: string;
    txParams?: { from?: string; to?: string };
  }): void {
    if (!this.#enabled) {
      return;
    }
    if (!this.#isTransactionInvolvingStakingContract(payload)) {
      return;
    }
    const hexChainId = payload?.chainId;
    if (!hexChainId) {
      return;
    }
    const caipChainId = `eip155:${parseInt(hexChainId, 16)}` as ChainId;
    const toRefresh = this.#getToRefreshForChains([caipChainId]);
    if (toRefresh.length > 0) {
      this.#refreshStakedBalanceAfterTransaction(toRefresh).catch((error) => {
        log('Failed to refresh staked balance after transaction', { error });
      });
    }
  }

  /**
   * When incoming transactions are received, refresh staked balance only for
   * chains where at least one transaction is from or to the staking contract.
   *
   * @param payload - From TransactionController:incomingTransactionsReceived (array of { chainId?, txParams? }).
   */
  #onIncomingTransactions(
    payload: { chainId?: string; txParams?: { from?: string; to?: string } }[],
  ): void {
    if (!this.#enabled) {
      return;
    }
    const chainIdsToRefresh = new Set<string>();
    for (const item of payload ?? []) {
      if (!item?.chainId) {
        continue;
      }
      if (this.#isTransactionInvolvingStakingContract(item)) {
        chainIdsToRefresh.add(item.chainId);
      }
    }
    const caipChainIds = [...chainIdsToRefresh].map(
      (hexChainId) => `eip155:${parseInt(hexChainId, 16)}` as ChainId,
    );
    if (caipChainIds.length === 0) {
      return;
    }
    const toRefresh = this.#getToRefreshForChains(caipChainIds);
    if (toRefresh.length > 0) {
      this.#refreshStakedBalanceAfterTransaction(toRefresh).catch((error) => {
        log('Failed to refresh staked balance after incoming transactions', {
          error,
        });
      });
    }
  }

  /**
   * Build toRefresh list for subscribed (account, chainId) pairs for the given chains.
   *
   * @param chainIds - CAIP-2 chain IDs to target.
   * @returns Pairs of account and chainId to refresh.
   */
  #getToRefreshForChains(
    chainIds: ChainId[],
  ): { account: InternalAccount; chainId: ChainId }[] {
    const toRefresh: { account: InternalAccount; chainId: ChainId }[] = [];
    const chainSet = new Set(chainIds);
    for (const subscription of this.#activeSubscriptions.values()) {
      for (const {
        account,
        supportedChains,
      } of subscription.accountsWithSupportedChains) {
        for (const chainId of supportedChains) {
          if (chainSet.has(chainId)) {
            toRefresh.push({ account, chainId });
          }
        }
      }
    }
    return toRefresh;
  }

  /**
   * Build toRefresh list for all subscribed (account, chainId) pairs.
   *
   * @returns Pairs of account and chainId to refresh.
   */
  #getToRefreshAll(): { account: InternalAccount; chainId: ChainId }[] {
    const toRefresh: { account: InternalAccount; chainId: ChainId }[] = [];
    for (const subscription of this.#activeSubscriptions.values()) {
      for (const {
        account,
        supportedChains,
      } of subscription.accountsWithSupportedChains) {
        for (const chainId of supportedChains) {
          toRefresh.push({ account, chainId });
        }
      }
    }
    return toRefresh;
  }

  /**
   * Refresh staked balance for all currently subscribed accounts and chains, then
   * push updates to the controller. Can be called from UI or after transaction events.
   */
  async refreshStakedBalance(): Promise<void> {
    if (!this.#enabled) {
      return;
    }
    const toRefresh = this.#getToRefreshAll();
    if (toRefresh.length > 0) {
      await this.#refreshStakedBalanceAfterTransaction(toRefresh);
    }
  }

  /**
   * Fetch staked balance for the given account/chain pairs and push a single
   * DataResponse to all active subscriptions.
   *
   * @param toRefresh - List of { account, chainId } to refresh.
   */
  async #refreshStakedBalanceAfterTransaction(
    toRefresh: { account: InternalAccount; chainId: ChainId }[],
  ): Promise<void> {
    const assetsInfo: Record<Caip19AssetId, AssetMetadata> = {};
    const assetsBalance: Record<
      AccountId,
      Record<Caip19AssetId, AssetBalance>
    > = {};

    for (const { account, chainId } of toRefresh) {
      try {
        const hexChainId = caipChainIdToHex(chainId);
        const contractAddress = getStakingContractAddress(hexChainId);
        if (!contractAddress) {
          continue;
        }

        const input: StakedBalancePollingInput = {
          chainId: hexChainId,
          accountId: account.id,
          accountAddress: account.address as Hex,
        };

        const result =
          await this.#stakedBalanceFetcher.fetchStakedBalance(input);
        const assetId = stakedAssetId(chainId, contractAddress);

        assetsInfo[assetId] = STAKED_ETH_METADATA;
        const existing = assetsBalance[account.id];
        assetsBalance[account.id] = {
          ...existing,
          [assetId]: { amount: result.amount },
        };
      } catch (error) {
        log('Failed to fetch staked balance in transaction refresh', {
          chainId,
          accountId: account.id,
          error,
        });
      }
    }

    const chainIds = [...new Set(toRefresh.map(({ chainId }) => chainId))];
    const chainsByAccountId = new Map<AccountId, ChainId[]>();
    for (const { account, chainId } of toRefresh) {
      const list = chainsByAccountId.get(account.id) ?? [];
      if (!list.includes(chainId)) {
        list.push(chainId);
      }
      chainsByAccountId.set(account.id, list);
    }
    const accountById = new Map<AccountId, InternalAccount>();
    for (const { account } of toRefresh) {
      if (!accountById.has(account.id)) {
        accountById.set(account.id, account);
      }
    }
    const request: DataRequest = {
      accountsWithSupportedChains: [...accountById.entries()].map(
        ([accountId, account]) => ({
          account,
          supportedChains: chainsByAccountId.get(accountId) ?? [],
        }),
      ),
      chainIds,
      dataTypes: ['balance'],
    };

    if (Object.keys(assetsBalance).length > 0) {
      const response: DataResponse = {
        assetsInfo,
        assetsBalance,
        updateMode: 'merge',
      };
      for (const subscription of this.#activeSubscriptions.values()) {
        subscription
          .onAssetsUpdate(response, request)
          ?.catch((error: unknown) => {
            log('Failed to report staked balance update after transaction', {
              error,
            });
          });
      }
    }
  }

  /**
   * Set active chains from NetworkEnablementController state.
   * Only staking-supported chains that are enabled in the network enablement map
   * are active (e.g. if mainnet is not selected we do not fetch).
   */
  #initializeActiveChains(): void {
    try {
      const state = this.#messenger.call(
        'NetworkEnablementController:getState',
      );
      this.#initializeActiveChainsFromEnabledMap(
        state?.enabledNetworkMap ?? {},
      );
    } catch (error) {
      log('Failed to get NetworkEnablementController state', { error });
      this.#initializeActiveChainsFromEnabledMap({});
    }
  }

  /**
   * Compute active chains as the intersection of supported staking chains and
   * enabled networks, then update state. Uses the same EIP-155 storage key
   * convention as NetworkEnablementController (hex for eip155).
   *
   * @param enabledNetworkMap - The enabled network map from NetworkEnablementController.
   */
  #initializeActiveChainsFromEnabledMap(
    enabledNetworkMap: Record<string, Record<string, boolean>>,
  ): void {
    if (!this.#enabled) {
      const previous = [...this.state.activeChains];
      this.updateActiveChains([], (updatedChains) =>
        this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
      );
      return;
    }

    const activeChains: ChainId[] = [];
    const eip155Map = enabledNetworkMap.eip155;
    if (eip155Map) {
      for (const caip2 of this.#supportedChainIds) {
        if (!isCaipChainId(caip2)) {
          continue;
        }
        const { reference } = parseCaipChainId(caip2);
        const storageKey = numberToHex(parseInt(reference, 10));
        if (eip155Map[storageKey]) {
          activeChains.push(caip2);
        }
      }
    }

    const previous = [...this.state.activeChains];
    this.updateActiveChains(activeChains, (updatedChains) =>
      this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
    );
  }

  /**
   * Get or create a Web3Provider for the given hex chain ID.
   * Uses the same messenger-cast pattern as RpcDataSource.
   *
   * @param hexChainId - The hex chain ID.
   * @returns Web3Provider instance, or undefined if not available.
   */
  #getProvider(hexChainId: Hex): Web3Provider | undefined {
    const cached = this.#providerCache.get(hexChainId);
    if (cached) {
      return cached;
    }

    try {
      const networkState = this.#messenger.call('NetworkController:getState');

      const { networkConfigurationsByChainId } = networkState;
      if (!networkConfigurationsByChainId) {
        return undefined;
      }

      const chainConfig = networkConfigurationsByChainId[hexChainId];
      if (!chainConfig) {
        return undefined;
      }

      // Use the network's configured default RPC endpoint (same as RpcDataSource).
      const { rpcEndpoints, defaultRpcEndpointIndex } = chainConfig;
      if (!rpcEndpoints || rpcEndpoints.length === 0) {
        return undefined;
      }

      const index =
        typeof defaultRpcEndpointIndex === 'number' &&
        defaultRpcEndpointIndex >= 0 &&
        defaultRpcEndpointIndex < rpcEndpoints.length
          ? defaultRpcEndpointIndex
          : 0;
      const defaultEndpoint = rpcEndpoints[index] as {
        networkClientId?: string;
      };
      const networkClientId = defaultEndpoint?.networkClientId;
      if (!networkClientId) {
        return undefined;
      }

      const networkClient = this.#messenger.call(
        'NetworkController:getNetworkClientById',
        networkClientId,
      );

      if (!networkClient?.provider) {
        return undefined;
      }

      const provider = new Web3Provider(networkClient.provider);
      this.#providerCache.set(hexChainId, provider);
      return provider;
    } catch (error) {
      log('Failed to get provider for chain', { hexChainId, error });
      return undefined;
    }
  }

  /**
   * Handle a staked balance update from StakedBalanceFetcher.
   * Converts the result into a DataResponse and forwards it to all active
   * subscriptions.
   *
   * @param result - The staked balance fetch result.
   */
  #handleStakedBalanceUpdate(result: StakedBalanceFetchResult): void {
    const contractAddress = getStakingContractAddress(result.chainId);
    if (!contractAddress) {
      return;
    }
    const chainIdDecimal = parseInt(result.chainId, 16);
    const caipChainId = `eip155:${chainIdDecimal}` as ChainId;
    const assetId = stakedAssetId(caipChainId, contractAddress);

    // request.dataTypes: ['balance'] so controller skips Token/Price enrichment.
    const response: DataResponse = {
      assetsInfo: {
        [assetId]: STAKED_ETH_METADATA,
      },
      assetsBalance: {
        [result.accountId]: {
          [assetId]: { amount: result.balance.amount },
        },
      },
      updateMode: 'merge',
    };

    const request: DataRequest = {
      accountsWithSupportedChains: [],
      chainIds: [caipChainId],
      dataTypes: ['balance'],
    };

    log('Staked balance update', {
      accountId: result.accountId,
      chainId: caipChainId,
      amount: result.balance.amount,
    });

    for (const subscription of this.#activeSubscriptions.values()) {
      subscription
        .onAssetsUpdate(response, request)
        ?.catch((error: unknown) => {
          log('Failed to report staked balance update', { error });
        });
    }
  }

  /**
   * Fetch staked balances for all accounts on supported chains.
   *
   * @param request - The data request with accounts and chains.
   * @returns DataResponse with staked balance data.
   */
  async fetch(request: DataRequest): Promise<DataResponse> {
    if (!this.#enabled) {
      return {};
    }
    const response: DataResponse = {};
    const activeChainsSet = new Set(this.state.activeChains);

    const chainsToFetch = request.chainIds.filter((chainId) =>
      activeChainsSet.has(chainId),
    );

    if (chainsToFetch.length === 0) {
      return response;
    }

    const balances: Record<AccountId, Record<Caip19AssetId, AssetBalance>> = {};

    for (const {
      account,
      supportedChains: accountChains,
    } of request.accountsWithSupportedChains) {
      const chains = chainsToFetch.filter((chain) =>
        accountChains.includes(chain),
      );

      for (const chainId of chains) {
        try {
          const hexChainId = caipChainIdToHex(chainId);
          const contractAddress = getStakingContractAddress(hexChainId);
          if (!contractAddress) {
            continue;
          }

          const input: StakedBalancePollingInput = {
            chainId: hexChainId,
            accountId: account.id,
            accountAddress: account.address as Hex,
          };

          const result =
            await this.#stakedBalanceFetcher.fetchStakedBalance(input);

          // Include zero amounts so merged updates clear prior non-zero state.
          balances[account.id] ??= {};
          const assetId = stakedAssetId(chainId, contractAddress);
          balances[account.id][assetId] = { amount: result.amount };
        } catch (error) {
          log('Failed to fetch staked balance', {
            chainId,
            accountId: account.id,
            error,
          });
        }
      }
    }

    if (Object.keys(balances).length > 0) {
      response.assetsBalance = balances;
      // Add metadata for each staked asset ID present in balances
      const assetIds = new Set<Caip19AssetId>();
      for (const accountBalances of Object.values(balances)) {
        for (const assetId of Object.keys(accountBalances)) {
          assetIds.add(assetId as Caip19AssetId);
        }
      }
      response.assetsInfo = {};
      for (const assetId of assetIds) {
        response.assetsInfo[assetId] = STAKED_ETH_METADATA;
      }
    }

    return response;
  }

  /**
   * Assets middleware for the fetch pipeline.
   * Fetches staked balances and merges them into the response, then passes
   * all chains to the next middleware (staked balance doesn't claim chains).
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return async (context, next) => {
      if (!this.#enabled) {
        return next(context);
      }
      const { request } = context;

      if (!request.dataTypes.includes('balance')) {
        return next(context);
      }

      if (request.chainIds.length === 0) {
        return next(context);
      }

      try {
        const fetchResponse = await this.fetch(request);

        if (fetchResponse.assetsInfo) {
          context.response.assetsInfo ??= {};
          Object.assign(context.response.assetsInfo, fetchResponse.assetsInfo);
        }
        if (fetchResponse.assetsBalance) {
          context.response.assetsBalance ??= {};
          for (const [accountId, accountBalances] of Object.entries(
            fetchResponse.assetsBalance,
          )) {
            context.response.assetsBalance[accountId] = {
              ...context.response.assetsBalance[accountId],
              ...accountBalances,
            };
          }
        }
      } catch (error) {
        log('Middleware fetch failed', { error });
      }

      // Pass all chains through (staked balance doesn't claim chains)
      return next(context);
    };
  }

  /**
   * Subscribe to staked balance updates with polling.
   * Starts polling via StakedBalanceFetcher for each account/chain combination.
   *
   * @param subscriptionRequest - The subscription request details.
   */
  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    const activeChainsSet = new Set(this.state.activeChains);
    const chainsToSubscribe = request.chainIds.filter((chainId) =>
      activeChainsSet.has(chainId),
    );

    log('Subscribe requested', {
      subscriptionId,
      isUpdate,
      chainsToSubscribe,
    });

    if (chainsToSubscribe.length === 0) {
      log('No staking chains to subscribe');
      return;
    }

    // Handle subscription update - restart polling for new chains
    if (isUpdate) {
      const existing = this.#activeSubscriptions.get(subscriptionId);
      if (existing) {
        log('Updating existing subscription - restarting polling', {
          subscriptionId,
        });
      }
    }

    // Clean up existing subscription (stops old polling)
    await this.unsubscribe(subscriptionId);

    // Build subscription data first so it is available when the first poll runs
    const accountsWithSupportedChains: AccountWithSupportedChains[] =
      request.accountsWithSupportedChains
        .map(({ account, supportedChains }) => ({
          account,
          supportedChains: chainsToSubscribe.filter((chain) =>
            supportedChains.includes(chain),
          ),
        }))
        .filter(({ supportedChains }) => supportedChains.length > 0);

    const accounts = accountsWithSupportedChains.map((entry) => entry.account);
    const pollingTokens: string[] = [];

    // Store subscription before startPolling so first poll (setTimeout 0) has the callback
    this.#activeSubscriptions.set(subscriptionId, {
      pollingTokens,
      chains: chainsToSubscribe,
      accounts,
      accountsWithSupportedChains,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
    });

    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        for (const token of pollingTokens) {
          this.#stakedBalanceFetcher.stopPollingByPollingToken(token);
        }
        this.#activeSubscriptions.delete(subscriptionId);
      },
      chains: chainsToSubscribe,
      request,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
    });

    // Start polling for each account/chain (first poll runs on next tick)
    for (const {
      account,
      supportedChains: accountChains,
    } of request.accountsWithSupportedChains) {
      const chainsForAccount = chainsToSubscribe.filter((chain) =>
        accountChains.includes(chain),
      );

      for (const chainId of chainsForAccount) {
        const hexChainId = caipChainIdToHex(chainId);

        const input: StakedBalancePollingInput = {
          chainId: hexChainId,
          accountId: account.id,
          accountAddress: account.address as Hex,
        };

        const pollingToken = this.#stakedBalanceFetcher.startPolling(input);
        pollingTokens.push(pollingToken);
      }
    }

    // Immediate initial fetch so state is updated without waiting for first poll
    try {
      const initialRequest: DataRequest = {
        accountsWithSupportedChains,
        chainIds: chainsToSubscribe,
        dataTypes: ['balance'],
      };
      const initialResponse = await this.fetch(initialRequest);
      if (
        initialResponse.assetsBalance &&
        Object.keys(initialResponse.assetsBalance).length > 0
      ) {
        subscriptionRequest
          .onAssetsUpdate?.(initialResponse)
          ?.catch((error) => {
            log('Initial staked balance update failed', { error });
          });
      }
    } catch (error) {
      log('Initial staked balance fetch failed', { error });
    }

    log('Subscription SUCCESS', {
      subscriptionId,
      chains: chainsToSubscribe,
      pollingCount: pollingTokens.length,
    });
  }

  /**
   * Unsubscribe from staked balance updates and stop polling.
   *
   * @param subscriptionId - The subscription ID to unsubscribe.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.#activeSubscriptions.get(subscriptionId);
    if (subscription) {
      for (const token of subscription.pollingTokens) {
        this.#stakedBalanceFetcher.stopPollingByPollingToken(token);
      }
      this.#activeSubscriptions.delete(subscriptionId);
    }

    await super.unsubscribe(subscriptionId);
  }

  /**
   * Destroy the data source and clean up all resources.
   */
  destroy(): void {
    for (const subscription of this.#activeSubscriptions.values()) {
      for (const token of subscription.pollingTokens) {
        this.#stakedBalanceFetcher.stopPollingByPollingToken(token);
      }
    }
    this.#activeSubscriptions.clear();
    this.#providerCache.clear();
    super.destroy();
  }
}
