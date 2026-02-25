import { toChecksumAddress } from '@ethereumjs/util';
import { Web3Provider } from '@ethersproject/providers';
import type { GetTokenListState } from '@metamask/assets-controllers';
import { toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
  NetworkState,
  NetworkStatus,
} from '@metamask/network-controller';
import type { NetworkEnablementControllerGetStateAction } from '@metamask/network-enablement-controller';
import type {
  TransactionControllerIncomingTransactionsReceivedEvent,
  TransactionControllerTransactionConfirmedEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';
import {
  isStrictHexString,
  isCaipChainId,
  numberToHex,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import BigNumberJS from 'bignumber.js';

import { AbstractDataSource } from './AbstractDataSource';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import {
  BalanceFetcher,
  MulticallClient,
  TokenDetector,
  StakedBalanceFetcher,
  getStakingContractAddress,
} from './evm-rpc-services';
import type {
  BalancePollingInput,
  DetectionPollingInput,
  StakedBalancePollingInput,
  StakedBalanceFetchResult,
} from './evm-rpc-services';
import type {
  Address,
  Provider as RpcProvider,
  TokenListState,
  BalanceFetchResult,
  TokenDetectionResult,
} from './evm-rpc-services';
import type {
  AssetsControllerGetStateAction,
  AssetsControllerMessenger,
} from '../AssetsController';
import { projectLogger, createModuleLogger } from '../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetBalance,
  AssetMetadata,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';

const CONTROLLER_NAME = 'RpcDataSource';
const DEFAULT_BALANCE_INTERVAL = 30_000; // 30 seconds
const DEFAULT_DETECTION_INTERVAL = 180_000; // 3 minutes
const DEFAULT_STAKED_BALANCE_INTERVAL = 180_000; // 3 minutes

/** Metadata for staked ETH (same symbol and decimals as native ETH). */
const STAKED_ETH_METADATA: AssetMetadata = {
  type: 'erc20',
  name: 'staked ethereum',
  symbol: 'ETH',
  decimals: 18,
};

function stakedAssetId(
  chainId: ChainId,
  contractAddress: string,
): Caip19AssetId {
  const checksummed = toChecksumAddress(contractAddress);
  return `${chainId}/erc20:${checksummed}` as Caip19AssetId;
}

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// Allowed actions that RpcDataSource can call
export type RpcDataSourceAllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | AssetsControllerGetStateAction
  | GetTokenListState
  | NetworkEnablementControllerGetStateAction;

// Allowed events that RpcDataSource can subscribe to
export type RpcDataSourceAllowedEvents =
  | NetworkControllerStateChangeEvent
  | TransactionControllerTransactionConfirmedEvent
  | TransactionControllerIncomingTransactionsReceivedEvent;

/** Network status for each chain */
export type ChainStatus = {
  chainId: ChainId;
  status: NetworkStatus;
  name: string;
  nativeCurrency: string;
  /** Network client ID for getting the provider */
  networkClientId: string;
};

/** RpcDataSource is stateless */
export type RpcDataSourceState = Record<never, never>;

/** Optional configuration for RpcDataSource when the controller instantiates it. */
export type RpcDataSourceConfig = {
  balanceInterval?: number;
  detectionInterval?: number;
  /** Function returning whether token detection is enabled (avoids stale value) */
  tokenDetectionEnabled?: () => boolean;
  /** Function returning whether external services are allowed (avoids stale value; default: () => true) */
  useExternalService?: () => boolean;
  timeout?: number;
};

export type RpcDataSourceOptions = {
  /** The AssetsController messenger (shared by all data sources). */
  messenger: AssetsControllerMessenger;
  /** Called when active chains are updated. Pass dataSourceName so the controller knows the source. */
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
  /** Request timeout in ms */
  timeout?: number;
  /** Balance polling interval in ms (default: 30s) */
  balanceInterval?: number;
  /** Token detection polling interval in ms (default: 180s / 3 min) */
  detectionInterval?: number;
  /** Function returning whether token detection is enabled (avoids stale value) */
  tokenDetectionEnabled?: () => boolean;
  /** Function returning whether external services are allowed (avoids stale value; default: () => true) */
  useExternalService?: () => boolean;
};

/**
 * Subscription data stored for each active subscription.
 */
type SubscriptionData = {
  /** Polling tokens from BalanceFetcher */
  balancePollingTokens: string[];
  /** Polling tokens from TokenDetector */
  detectionPollingTokens: string[];
  /** Polling tokens from StakedBalanceFetcher */
  stakedBalancePollingTokens: string[];
  /** Chain IDs being polled */
  chains: ChainId[];
  /** Accounts being polled */
  accounts: InternalAccount[];
  /** Callback to report asset updates to the controller */
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
export const caipChainIdToHex = (chainId: string): Hex => {
  if (isStrictHexString(chainId)) {
    return chainId;
  }

  if (isCaipChainId(chainId)) {
    return toHex(parseCaipChainId(chainId).reference);
  }

  throw new Error('caipChainIdToHex - Failed to provide CAIP-2 or Hex chainId');
};

/**
 * Data source for fetching balances via RPC calls.
 *
 * Orchestrates polling through BalanceFetcher and TokenDetector,
 * each of which handle their own polling intervals.
 *
 * Communicates with AssetsController via Messenger:
 *
 * Actions:
 * - RpcDataSource:getActiveChains
 * - RpcDataSource:fetch
 * - RpcDataSource:subscribe
 * - RpcDataSource:unsubscribe
 *
 * Events:
 * - RpcDataSource:activeChainsUpdated
 * - RpcDataSource:assetsUpdated
 */
export class RpcDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  DataSourceState
> {
  readonly #messenger: AssetsControllerMessenger;

  readonly #onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  readonly #timeout: number;

  readonly #tokenDetectionEnabled: () => boolean;

  readonly #useExternalService: () => boolean;

  /** Currently active chains */
  #activeChains: ChainId[] = [];

  /** Network status for each active chain */
  #chainStatuses: Record<ChainId, ChainStatus> = {};

  /** Cache of Web3Provider instances by chainId */
  readonly #providerCache: Map<ChainId, Web3Provider> = new Map();

  /** Active subscriptions by ID */
  readonly #activeSubscriptions: Map<string, SubscriptionData> = new Map();

  #unsubscribeTransactionConfirmed: (() => void) | undefined = undefined;

  #unsubscribeIncomingTransactions: (() => void) | undefined = undefined;

  // Rpc-datasource components
  readonly #multicallClient: MulticallClient;

  readonly #balanceFetcher: BalanceFetcher;

  readonly #tokenDetector: TokenDetector;

  readonly #stakedBalanceFetcher: StakedBalanceFetcher;

  constructor(options: RpcDataSourceOptions) {
    super(CONTROLLER_NAME, { activeChains: [] });
    this.#messenger = options.messenger;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#timeout = options.timeout ?? 10_000;
    this.#tokenDetectionEnabled =
      options.tokenDetectionEnabled ?? ((): boolean => true);
    this.#useExternalService =
      options.useExternalService ?? ((): boolean => true);

    const balanceInterval = options.balanceInterval ?? DEFAULT_BALANCE_INTERVAL;
    const detectionInterval =
      options.detectionInterval ?? DEFAULT_DETECTION_INTERVAL;

    log('Initializing RpcDataSource', {
      timeout: this.#timeout,
      balanceInterval,
      detectionInterval,
      tokenDetectionEnabled: this.#tokenDetectionEnabled(),
      useExternalService: this.#useExternalService(),
    });

    // Initialize MulticallClient with a provider getter
    this.#multicallClient = new MulticallClient((hexChainId: string) => {
      return this.#getMulticallProvider(hexChainId);
    });

    // Create messenger adapters for BalanceFetcher and TokenDetector
    const balanceFetcherMessenger = {
      call: (
        _action: 'AssetsController:getState',
      ): {
        assetsBalance: Record<string, Record<string, { amount: string }>>;
      } => {
        const state = this.#messenger.call('AssetsController:getState');
        return {
          assetsBalance: (state.assetsBalance ?? {}) as Record<
            string,
            Record<string, { amount: string }>
          >,
        };
      },
    };

    const tokenDetectorMessenger = {
      call: (_action: 'TokenListController:getState'): TokenListState => {
        return this.#messenger.call('TokenListController:getState');
      },
    };

    // Initialize BalanceFetcher with polling interval
    this.#balanceFetcher = new BalanceFetcher(
      this.#multicallClient,
      balanceFetcherMessenger,
      { pollingInterval: balanceInterval },
    );
    this.#balanceFetcher.setOnBalanceUpdate(
      this.#handleBalanceUpdate.bind(this),
    );

    // Initialize TokenDetector with polling interval
    this.#tokenDetector = new TokenDetector(
      this.#multicallClient,
      tokenDetectorMessenger,
      {
        pollingInterval: detectionInterval,
        tokenDetectionEnabled: this.#tokenDetectionEnabled,
        useExternalService: this.#useExternalService,
      },
    );
    this.#tokenDetector.setOnDetectionUpdate(
      this.#handleDetectionUpdate.bind(this),
    );

    this.#stakedBalanceFetcher = new StakedBalanceFetcher({
      getNetworkProvider: (hexChainId: string): Web3Provider | undefined => {
        const caipChainId = `eip155:${parseInt(hexChainId, 16)}` as ChainId;
        return this.#getProvider(caipChainId);
      },
      pollingInterval: DEFAULT_STAKED_BALANCE_INTERVAL,
    });
    this.#stakedBalanceFetcher.setOnStakedBalanceUpdate(
      this.#handleStakedBalanceUpdate.bind(this),
    );

    this.#subscribeToNetworkController();
    this.#subscribeToTransactionEvents();
    this.#initializeFromNetworkController();
  }

  /**
   * Convert a raw balance to human-readable format using decimals.
   *
   * @param rawBalance - The raw balance string.
   * @param decimals - The number of decimals for the token.
   * @returns The human-readable balance string.
   */
  #convertToHumanReadable(rawBalance: string, decimals: number): string {
    const rawAmount = new BigNumberJS(rawBalance);
    const divisor = new BigNumberJS(10).pow(decimals);
    return rawAmount.dividedBy(divisor).toString();
  }

  /**
   * Collect metadata for a list of balance entries.
   * For native tokens, generates metadata from chain status.
   * For ERC20 tokens, looks up from existing state or token list.
   *
   * @param balances - Array of balance entries with assetId.
   * @param chainId - The CAIP-2 chain ID.
   * @returns Record of asset metadata keyed by asset ID.
   */
  #collectMetadataForBalances(
    balances: { assetId: Caip19AssetId }[],
    chainId: ChainId,
  ): Record<Caip19AssetId, AssetMetadata> {
    const assetsInfo: Record<Caip19AssetId, AssetMetadata> = {};
    const existingMetadata = this.#getExistingAssetsMetadata();

    for (const balance of balances) {
      const isNative = balance.assetId.includes('/slip44:');
      if (isNative) {
        const chainStatus = this.#chainStatuses[chainId];

        if (chainStatus) {
          assetsInfo[balance.assetId] = {
            type: 'native',
            symbol: chainStatus.nativeCurrency,
            name: chainStatus.nativeCurrency,
            decimals: 18,
          };
        }
      } else {
        // For ERC20 tokens, try existing metadata from state first
        const existingMeta = existingMetadata[balance.assetId];

        if (existingMeta) {
          assetsInfo[balance.assetId] = existingMeta;
        } else {
          // Fallback to token list if not in state
          const tokenListMeta = this.#getTokenMetadataFromTokenList(
            balance.assetId,
          );
          if (tokenListMeta) {
            assetsInfo[balance.assetId] = tokenListMeta;
          } else {
            // Default metadata for unknown ERC20 tokens.
            // Use 18 decimals (the standard for most ERC20 tokens)
            // to ensure consistent human-readable balance format.
            assetsInfo[balance.assetId] = {
              type: 'erc20',
              symbol: '',
              name: '',
              decimals: 18,
            };
          }
        }
      }
    }

    return assetsInfo;
  }

  /**
   * Handle balance update from BalanceFetcher.
   *
   * @param result - The balance fetch result.
   */
  #handleBalanceUpdate(result: BalanceFetchResult): void {
    const newBalances: Record<string, { amount: string }> = {};

    // Convert hex chain ID to CAIP-2 format
    const chainIdDecimal = parseInt(result.chainId, 16);
    const caipChainId = `eip155:${chainIdDecimal}` as ChainId;

    // Collect metadata for all balances
    const assetsInfo = this.#collectMetadataForBalances(
      result.balances,
      caipChainId,
    );

    // Convert balances to human-readable format using metadata
    for (const balance of result.balances) {
      const metadata = assetsInfo[balance.assetId];
      // Default to 18 decimals (ERC20 standard) for consistent human-readable format
      const decimals = metadata?.decimals ?? 18;
      const humanReadableAmount = this.#convertToHumanReadable(
        balance.balance,
        decimals,
      );

      newBalances[balance.assetId] = {
        amount: humanReadableAmount,
      };
    }

    // Only send new data to AssetsController - it handles merging atomically
    // to avoid race conditions when concurrent updates occur for the same account
    const response: DataResponse = {
      assetsBalance: {
        [result.accountId]: newBalances,
      },
      assetsInfo,
      updateMode: 'merge',
    };

    const request: DataRequest = {
      accountsWithSupportedChains: [],
      chainIds: [caipChainId],
      dataTypes: ['balance'],
    };

    log('Balance update response', {
      accountId: result.accountId,
      newBalanceCount: Object.keys(newBalances).length,
    });

    for (const subscription of this.#activeSubscriptions.values()) {
      subscription.onAssetsUpdate(response, request)?.catch((error) => {
        log('Failed to update assets', { error });
      });
    }
  }

  /**
   * Handle detection update from TokenDetector.
   *
   * @param result - The token detection result.
   */
  #handleDetectionUpdate(result: TokenDetectionResult): void {
    log('Detected new tokens', {
      count: result.detectedAssets.length,
    });

    // Build new metadata from detected assets
    const newMetadata: Record<Caip19AssetId, AssetMetadata> = {};
    if (result.detectedAssets.length > 0) {
      for (const asset of result.detectedAssets) {
        // Only include if we have metadata (symbol and decimals at minimum)
        if (asset.symbol && asset.decimals !== undefined) {
          newMetadata[asset.assetId] = {
            type: 'erc20',
            symbol: asset.symbol,
            name: asset.name ?? asset.symbol,
            decimals: asset.decimals,
            image: asset.image,
          };
        }
      }
    }

    // Build new balances from detected tokens
    const newBalances: Record<string, { amount: string }> = {};
    if (result.detectedBalances.length > 0) {
      for (const balance of result.detectedBalances) {
        // Get decimals from the detected asset metadata
        const detectedAsset = result.detectedAssets.find(
          (asset) => asset.assetId === balance.assetId,
        );
        // Default to 18 decimals (ERC20 standard) for consistent human-readable format
        const decimals = detectedAsset?.decimals ?? 18;
        const humanReadableAmount = this.#convertToHumanReadable(
          balance.balance,
          decimals,
        );

        newBalances[balance.assetId] = {
          amount: humanReadableAmount,
        };
      }
    }

    // Only send new data to AssetsController - it handles merging atomically
    // to avoid race conditions when concurrent updates occur for the same account
    const response: DataResponse = {
      detectedAssets: {
        [result.accountId]: result.detectedAssets.map((asset) => asset.assetId),
      },
      assetsInfo: newMetadata,
      assetsBalance: {
        [result.accountId]: newBalances,
      },
      updateMode: 'merge',
    };

    const chainIdDecimal = parseInt(result.chainId, 16);
    const caipChainId = `eip155:${chainIdDecimal}` as ChainId;
    const request: DataRequest = {
      accountsWithSupportedChains: [],
      chainIds: [caipChainId],
      dataTypes: ['balance', 'metadata', 'price'],
    };

    for (const subscription of this.#activeSubscriptions.values()) {
      subscription.onAssetsUpdate(response, request)?.catch((error) => {
        log('Failed to update detected assets', { error });
      });
    }
  }

  /**
   * Handle staked balance update from StakedBalanceFetcher.
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

    const response: DataResponse = {
      assetsInfo: { [assetId]: STAKED_ETH_METADATA },
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

    for (const subscription of this.#activeSubscriptions.values()) {
      subscription.onAssetsUpdate(response, request)?.catch((error) => {
        log('Failed to report staked balance update', { error });
      });
    }
  }

  #subscribeToNetworkController(): void {
    this.#messenger.subscribe(
      'NetworkController:stateChange',
      (networkState: NetworkState) => {
        log('NetworkController state changed');
        this.#clearProviderCache();
        this.#updateFromNetworkState(networkState);
      },
    );
  }

  #subscribeToTransactionEvents(): void {
    const unsubConfirmed = this.#messenger.subscribe(
      'TransactionController:transactionConfirmed',
      this.#onTransactionConfirmed.bind(this),
    );
    this.#unsubscribeTransactionConfirmed =
      typeof unsubConfirmed === 'function' ? unsubConfirmed : undefined;

    const unsubIncoming = this.#messenger.subscribe(
      'TransactionController:incomingTransactionsReceived',
      this.#onIncomingTransactions.bind(this),
    );
    this.#unsubscribeIncomingTransactions =
      typeof unsubIncoming === 'function' ? unsubIncoming : undefined;
  }

  #onTransactionConfirmed(payload: TransactionMeta): void {
    const hexChainId = payload?.chainId;
    if (!hexChainId) {
      return;
    }
    const caipChainId = `eip155:${parseInt(hexChainId, 16)}` as ChainId;
    this.#refreshBalanceForChains([caipChainId]).catch((error) => {
      log('Failed to refresh balance after transaction confirmed', { error });
    });
  }

  #onIncomingTransactions(payload: TransactionMeta[]): void {
    const chainIds = Array.from(
      new Set(
        (payload ?? [])
          .map((item) => item?.chainId)
          .filter((id): id is Hex => Boolean(id)),
      ),
    );
    const caipChainIds = chainIds.map(
      (hexChainId) => `eip155:${parseInt(hexChainId, 16)}` as ChainId,
    );
    const toRefresh =
      caipChainIds.length > 0 ? caipChainIds : [...this.#activeChains];
    this.#refreshBalanceForChains(toRefresh).catch((error) => {
      log('Failed to refresh balance after incoming transactions', { error });
    });
  }

  /**
   * Fetch balances for the given chains across all active subscriptions and
   * push updates to the controller.
   *
   * @param chainIds - CAIP-2 chain IDs to refresh.
   */
  async #refreshBalanceForChains(chainIds: ChainId[]): Promise<void> {
    const chainIdsSet = new Set(chainIds);
    const chainsToFetch = chainIds.filter((chainId) =>
      this.#activeChains.includes(chainId),
    );
    if (chainsToFetch.length === 0) {
      return;
    }

    for (const subscription of this.#activeSubscriptions.values()) {
      const subscriptionChains = subscription.chains.filter((chainId) =>
        chainIdsSet.has(chainId),
      );
      if (subscriptionChains.length === 0) {
        continue;
      }

      const request: DataRequest = {
        accountsWithSupportedChains: subscription.accounts.map((account) => ({
          account,
          supportedChains: subscriptionChains,
        })),
        chainIds: subscriptionChains,
        dataTypes: ['balance'],
      };

      try {
        const response = await this.fetch(request);
        if (
          response.assetsBalance &&
          Object.keys(response.assetsBalance).length > 0
        ) {
          subscription.onAssetsUpdate(response)?.catch((error) => {
            log('Failed to report balance update after transaction', {
              error,
            });
          });
        }
      } catch (error) {
        log('Failed to fetch balance after transaction', {
          chains: subscriptionChains,
          error,
        });
      }
    }
  }

  #initializeFromNetworkController(): void {
    log('Initializing from NetworkController');
    try {
      const networkState = this.#messenger.call('NetworkController:getState');
      this.#updateFromNetworkState(networkState);
    } catch (error) {
      log('Failed to initialize from NetworkController', error);
    }
  }

  #updateFromNetworkState(networkState: NetworkState): void {
    const { networkConfigurationsByChainId, networksMetadata } = networkState;

    const chainStatuses: Record<ChainId, ChainStatus> = {};
    const activeChains: ChainId[] = [];

    for (const [hexChainId, config] of Object.entries(
      networkConfigurationsByChainId,
    )) {
      const decimalChainId = parseInt(hexChainId, 16);
      const caip2ChainId = `eip155:${decimalChainId}` as ChainId;

      const defaultRpcEndpoint =
        config.rpcEndpoints[config.defaultRpcEndpointIndex];
      if (!defaultRpcEndpoint) {
        continue;
      }

      const { networkClientId } = defaultRpcEndpoint;
      const metadata = networksMetadata[networkClientId];

      const status: NetworkStatus =
        metadata?.status ?? ('unknown' as NetworkStatus);

      chainStatuses[caip2ChainId] = {
        chainId: caip2ChainId,
        status,
        name: config.name,
        nativeCurrency: config.nativeCurrency,
        networkClientId,
      };

      if (status === 'available' || status === 'unknown') {
        activeChains.push(caip2ChainId);
      }
    }

    log('Network state updated', {
      configuredChains: Object.keys(chainStatuses),
      activeChains,
    });

    // Check if chains changed
    const previousChains = [...this.#activeChains];
    const previousSet = new Set(previousChains);
    const hasChanges =
      previousChains.length !== activeChains.length ||
      activeChains.some((chain) => !previousSet.has(chain));

    // Update internal state and data source state before notifying, so that
    // when the controller handles the callback and calls getActiveChainsSync(),
    // it receives the updated chains (same order as AbstractDataSource.updateActiveChains).
    this.#chainStatuses = chainStatuses;
    this.#activeChains = activeChains;
    this.state.activeChains = activeChains;

    if (hasChanges) {
      this.#onActiveChainsUpdated(this.getName(), activeChains, previousChains);
    }
  }

  #getProvider(chainId: ChainId): Web3Provider | undefined {
    const cached = this.#providerCache.get(chainId);
    if (cached) {
      return cached;
    }

    const chainStatus = this.#chainStatuses[chainId];
    if (!chainStatus) {
      return undefined;
    }

    try {
      const networkClient = this.#messenger.call(
        'NetworkController:getNetworkClientById',
        chainStatus.networkClientId,
      );
      if (!networkClient?.provider) {
        return undefined;
      }
      const web3Provider = new Web3Provider(networkClient.provider);
      this.#providerCache.set(chainId, web3Provider);

      return web3Provider;
    } catch (error) {
      log('Failed to get provider for chain', { chainId, error });
      return undefined;
    }
  }

  /**
   * Get provider for MulticallClient using a hex chainId.
   *
   * @param hexChainId - The hex string representation of the chain id.
   * @returns An RpcProvider instance for the specified chain.
   */
  #getMulticallProvider(hexChainId: string): RpcProvider {
    const decimalChainId = parseInt(hexChainId, 16);
    const caip2ChainId = `eip155:${decimalChainId}` as ChainId;

    const web3Provider = this.#getProvider(caip2ChainId);

    if (!web3Provider) {
      throw new Error(`No provider available for chain ${hexChainId}`);
    }

    return {
      call: async (params: { to: string; data: string }): Promise<string> => {
        return web3Provider.call({
          to: params.to,
          data: params.data,
        });
      },
      getBalance: async (address: string): Promise<{ toString(): string }> => {
        const balance = await web3Provider.getBalance(address);
        return balance;
      },
    };
  }

  #clearProviderCache(): void {
    this.#providerCache.clear();
  }

  /**
   * Get the data source name.
   *
   * @returns The name of this data source.
   */
  /**
   * Get the status of all configured chains.
   *
   * @returns Record of chain statuses keyed by chain ID.
   */
  getChainStatuses(): Record<ChainId, ChainStatus> {
    return { ...this.#chainStatuses };
  }

  /**
   * Get the status of a specific chain.
   *
   * @param chainId - The chain ID to get status for.
   * @returns The chain status or undefined if not found.
   */
  getChainStatus(chainId: ChainId): ChainStatus | undefined {
    return this.#chainStatuses[chainId];
  }

  /**
   * Set the balance polling interval.
   *
   * @param interval - The polling interval in milliseconds.
   */
  setBalancePollingInterval(interval: number): void {
    log('Setting balance polling interval', { interval });
    this.#balanceFetcher.setIntervalLength(interval);
  }

  /**
   * Get the current balance polling interval.
   *
   * @returns The polling interval in milliseconds, or undefined if not set.
   */
  getBalancePollingInterval(): number | undefined {
    return this.#balanceFetcher.getIntervalLength();
  }

  /**
   * Set the token detection polling interval.
   *
   * @param interval - The polling interval in milliseconds.
   */
  setDetectionPollingInterval(interval: number): void {
    log('Setting detection polling interval', { interval });
    this.#tokenDetector.setIntervalLength(interval);
  }

  /**
   * Get the current token detection polling interval.
   *
   * @returns The polling interval in milliseconds, or undefined if not set.
   */
  getDetectionPollingInterval(): number | undefined {
    return this.#tokenDetector.getIntervalLength();
  }

  async fetch(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    const chainsToFetch = request.chainIds.filter((chainId) =>
      this.#activeChains.includes(chainId),
    );

    log('Fetch requested', {
      accounts: request.accountsWithSupportedChains.map((a) => a.account.id),
      requestedChains: request.chainIds,
      chainsToFetch,
    });

    if (chainsToFetch.length === 0) {
      log('No active chains to fetch');
      return response;
    }

    const assetsBalance: Record<
      string,
      Record<Caip19AssetId, AssetBalance>
    > = {};
    const assetsInfo: Record<Caip19AssetId, AssetMetadata> = {};
    const failedChains: ChainId[] = [];

    // Fetch balances for each account and its supported chains (pre-computed in request)
    for (const {
      account,
      supportedChains,
    } of request.accountsWithSupportedChains) {
      const chainsForAccount = chainsToFetch.filter((chain) =>
        supportedChains.includes(chain),
      );
      if (chainsForAccount.length === 0) {
        continue;
      }

      const { address, id: accountId } = account;

      for (const chainId of chainsForAccount) {
        const hexChainId = caipChainIdToHex(chainId);

        try {
          // Use BalanceFetcher for batched balance fetching
          const result = await this.#balanceFetcher.fetchBalancesForTokens(
            hexChainId,
            accountId,
            address as Address,
            [], // Empty array means just native token
            { includeNative: true },
          );

          if (!assetsBalance[accountId]) {
            assetsBalance[accountId] = {};
          }

          // Collect metadata for all balances
          const balanceMetadata = this.#collectMetadataForBalances(
            result.balances,
            chainId,
          );
          Object.assign(assetsInfo, balanceMetadata);

          // Convert balances to human-readable format
          for (const balance of result.balances) {
            const metadata = assetsInfo[balance.assetId];
            // Default to 18 decimals (ERC20 standard) for consistent human-readable format
            const decimals = metadata?.decimals ?? 18;
            const humanReadableAmount = this.#convertToHumanReadable(
              balance.balance,
              decimals,
            );

            assetsBalance[accountId][balance.assetId] = {
              amount: humanReadableAmount,
            };
          }
        } catch (error) {
          log('Failed to fetch balance', { address, chainId, error });

          if (!assetsBalance[accountId]) {
            assetsBalance[accountId] = {};
          }
          const nativeAssetId = this.#buildNativeAssetId(chainId);
          assetsBalance[accountId][nativeAssetId] = { amount: '0' };

          // Even on error, include native token metadata
          const chainStatus = this.#chainStatuses[chainId];
          if (chainStatus) {
            assetsInfo[nativeAssetId] = {
              type: 'native',
              symbol: chainStatus.nativeCurrency,
              name: chainStatus.nativeCurrency,
              decimals: 18,
            };
          }

          if (!failedChains.includes(chainId)) {
            failedChains.push(chainId);
          }
        }
      }
    }

    if (failedChains.length > 0) {
      log('Fetch PARTIAL - some chains failed', {
        successChains: chainsToFetch.filter(
          (chain) => !failedChains.includes(chain),
        ),
        failedChains,
      });

      response.errors = {};
      for (const chainId of failedChains) {
        response.errors[chainId] = 'RPC fetch failed';
      }
    } else {
      log('Fetch SUCCESS', {
        chains: chainsToFetch,
        accountCount: Object.keys(assetsBalance).length,
      });
    }

    response.assetsBalance = assetsBalance;

    // Include metadata for native tokens if we have any
    if (Object.keys(assetsInfo).length > 0) {
      response.assetsInfo = assetsInfo;
    }

    return response;
  }

  /**
   * Run token detection for an account on a chain.
   *
   * @param chainId - The chain ID to detect tokens on.
   * @param account - The account to detect tokens for.
   * @returns Promise resolving to a DataResponse with detected assets.
   */
  async detectTokens(
    chainId: ChainId,
    account: InternalAccount,
  ): Promise<DataResponse> {
    if (!this.#tokenDetectionEnabled() || !this.#useExternalService()) {
      return {};
    }

    const hexChainId = caipChainIdToHex(chainId);
    const { address, id: accountId } = account;

    log('Running token detection', { chainId, accountId });

    try {
      const result = await this.#tokenDetector.detectTokens(
        hexChainId,
        accountId,
        address as Address,
        {
          tokenDetectionEnabled: this.#tokenDetectionEnabled(),
          useExternalService: this.#useExternalService(),
        },
      );

      if (result.detectedAssets.length === 0) {
        log('No new tokens detected');
        return {};
      }

      log('Detected new tokens', {
        count: result.detectedAssets.length,
        chainId,
        accountId,
      });

      // Convert detected assets to DataResponse format
      const balances: Record<Caip19AssetId, AssetBalance> = {};
      const assetsInfo: Record<Caip19AssetId, AssetMetadata> = {};

      // Build metadata from detected assets
      for (const asset of result.detectedAssets) {
        if (asset.symbol && asset.decimals !== undefined) {
          assetsInfo[asset.assetId] = {
            type: 'erc20',
            symbol: asset.symbol,
            name: asset.name ?? asset.symbol,
            decimals: asset.decimals,
            image: asset.image,
          };
        }
      }

      // Add balances for detected tokens (converted to human-readable format)
      for (const balance of result.detectedBalances) {
        const detectedAsset = result.detectedAssets.find(
          (asset) => asset.assetId === balance.assetId,
        );
        // Default to 18 decimals (ERC20 standard) for consistent human-readable format
        const decimals = detectedAsset?.decimals ?? 18;
        const humanReadableAmount = this.#convertToHumanReadable(
          balance.balance,
          decimals,
        );

        balances[balance.assetId] = {
          amount: humanReadableAmount,
        };
      }

      const response: DataResponse = {
        detectedAssets: {
          [accountId]: result.detectedAssets.map((asset) => asset.assetId),
        },
        assetsBalance: {
          [accountId]: balances,
        },
      };

      // Include metadata if we have any
      if (Object.keys(assetsInfo).length > 0) {
        response.assetsInfo = assetsInfo;
      }

      return response;
    } catch (error) {
      log('Token detection failed', { chainId, accountId, error });
      return {};
    }
  }

  get assetsMiddleware(): Middleware {
    return async (context, next) => {
      const { request } = context;

      const supportedChains = request.chainIds.filter((chainId) =>
        this.#activeChains.includes(chainId),
      );

      if (supportedChains.length === 0) {
        return next(context);
      }

      let successfullyHandledChains: ChainId[] = [];

      log('Middleware fetching', {
        chains: supportedChains,
        accounts: request.accountsWithSupportedChains.map((a) => a.account.id),
      });

      const response = await this.fetch({
        ...request,
        chainIds: supportedChains,
      });

      if (response.assetsBalance) {
        context.response.assetsBalance ??= {};
        for (const [accountId, accountBalances] of Object.entries(
          response.assetsBalance,
        )) {
          context.response.assetsBalance[accountId] ??= {};
          context.response.assetsBalance[accountId] = {
            ...context.response.assetsBalance[accountId],
            ...accountBalances,
          };
        }
      }

      if (response.assetsInfo) {
        context.response.assetsInfo ??= {};
        context.response.assetsInfo = {
          ...context.response.assetsInfo,
          ...response.assetsInfo,
        };
      }

      const failedChains = new Set(Object.keys(response.errors ?? {}));
      successfullyHandledChains = supportedChains.filter(
        (chainId) => !failedChains.has(chainId),
      );

      if (successfullyHandledChains.length > 0) {
        const remainingChains = request.chainIds.filter(
          (chainId) => !successfullyHandledChains.includes(chainId),
        );

        return next({
          ...context,
          request: {
            ...request,
            chainIds: remainingChains,
          },
        });
      }

      return next(context);
    };
  }

  /**
   * Subscribe to updates for the given request.
   * Starts polling through BalanceFetcher and TokenDetector.
   *
   * @param subscriptionRequest - The subscription request details.
   */
  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    // Use request.chainIds when activeChains is not yet populated (e.g. before
    // NetworkController state has been applied) so polling can start.
    const chainsToSubscribe =
      this.#activeChains.length > 0
        ? request.chainIds.filter((chainId) =>
            this.#activeChains.includes(chainId),
          )
        : request.chainIds;

    log('Subscribe requested', {
      subscriptionId,
      isUpdate,
      accounts: request.accountsWithSupportedChains.map((a) => a.account.id),
      chainsToSubscribe,
      activeChainsFallback: this.#activeChains.length === 0,
    });

    if (chainsToSubscribe.length === 0) {
      log('No active chains to subscribe');
      return;
    }

    // Handle subscription update - restart polling for new chains
    if (isUpdate) {
      const existing = this.#activeSubscriptions.get(subscriptionId);
      if (existing) {
        log('Updating existing subscription - restarting polling', {
          subscriptionId,
          existingChains: existing.chains,
          newChains: chainsToSubscribe,
        });
        // Don't return early - continue to unsubscribe and restart polling
      }
    }

    // Clean up existing subscription (stops old polling)
    await this.unsubscribe(subscriptionId);
    // Start polling through BalanceFetcher, TokenDetector, and StakedBalanceFetcher
    const balancePollingTokens: string[] = [];
    const detectionPollingTokens: string[] = [];
    const stakedBalancePollingTokens: string[] = [];

    for (const {
      account,
      supportedChains,
    } of request.accountsWithSupportedChains) {
      const chainsForAccount = chainsToSubscribe.filter((chain) =>
        supportedChains.includes(chain),
      );
      if (chainsForAccount.length === 0) {
        continue;
      }

      const { address, id: accountId } = account;

      for (const chainId of chainsForAccount) {
        const hexChainId = caipChainIdToHex(chainId);

        // Start balance polling
        const balanceInput: BalancePollingInput = {
          chainId: hexChainId,
          accountId,
          accountAddress: address as Address,
        };
        const balanceToken = this.#balanceFetcher.startPolling(balanceInput);
        balancePollingTokens.push(balanceToken);

        // Start detection polling if enabled and external services allowed
        if (this.#tokenDetectionEnabled() && this.#useExternalService()) {
          const detectionInput: DetectionPollingInput = {
            chainId: hexChainId,
            accountId,
            accountAddress: address as Address,
          };
          const detectionToken =
            this.#tokenDetector.startPolling(detectionInput);
          detectionPollingTokens.push(detectionToken);
        }

        // Start staked balance polling only for chains with a known staking contract (e.g. mainnet, Hoodi)
        const stakingContractAddress = getStakingContractAddress(hexChainId);
        if (stakingContractAddress) {
          const stakedInput: StakedBalancePollingInput = {
            chainId: hexChainId,
            accountId,
            accountAddress: address as Address,
          };
          const stakedToken =
            this.#stakedBalanceFetcher.startPolling(stakedInput);
          stakedBalancePollingTokens.push(stakedToken);
          log('Started staked balance polling', {
            chainId,
            accountId,
          });
        }
      }
    }

    // Store subscription data
    const accounts = request.accountsWithSupportedChains.map(
      (entry) => entry.account,
    );
    this.#activeSubscriptions.set(subscriptionId, {
      balancePollingTokens,
      detectionPollingTokens,
      stakedBalancePollingTokens,
      chains: chainsToSubscribe,
      accounts,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
    });

    log('Subscription SUCCESS', {
      subscriptionId,
      chains: chainsToSubscribe,
      balancePollingCount: balancePollingTokens.length,
      detectionPollingCount: detectionPollingTokens.length,
      stakedBalancePollingCount: stakedBalancePollingTokens.length,
    });
  }

  /**
   * Unsubscribe from updates and stop polling.
   *
   * @param subscriptionId - The subscription ID to unsubscribe.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.#activeSubscriptions.get(subscriptionId);
    if (subscription) {
      // Stop balance polling
      for (const token of subscription.balancePollingTokens) {
        this.#balanceFetcher.stopPollingByPollingToken(token);
      }

      // Stop detection polling
      for (const token of subscription.detectionPollingTokens) {
        this.#tokenDetector.stopPollingByPollingToken(token);
      }

      // Stop staked balance polling
      for (const token of subscription.stakedBalancePollingTokens) {
        this.#stakedBalanceFetcher.stopPollingByPollingToken(token);
      }

      this.#activeSubscriptions.delete(subscriptionId);
      log('Unsubscribed and stopped polling', { subscriptionId });
    }
  }

  /**
   * Build the native asset ID for a given chain using NetworkEnablementController state.
   *
   * @param chainId - The CAIP-2 chain ID (e.g., "eip155:1")
   * @returns The CAIP-19 native asset ID (e.g., "eip155:1/slip44:60")
   */
  #buildNativeAssetId(chainId: ChainId): Caip19AssetId {
    const { nativeAssetIdentifiers } = this.#messenger.call(
      'NetworkEnablementController:getState',
    );

    return nativeAssetIdentifiers[chainId] ?? `${chainId}/slip44:60`;
  }

  /**
   * Get existing assets metadata from AssetsController state.
   * Used to include metadata for ERC20 tokens when returning balance updates.
   *
   * @returns Record of asset IDs to their metadata.
   */
  #getExistingAssetsMetadata(): Record<Caip19AssetId, AssetMetadata> {
    try {
      const state = this.#messenger.call('AssetsController:getState');
      return state.assetsInfo ?? {};
    } catch {
      // If AssetsController:getState fails, return empty metadata
      return {};
    }
  }

  /**
   * Get token metadata from TokenListController for an ERC20 token.
   * Used as a fallback when metadata is not in AssetsController state.
   *
   * @param assetId - The CAIP-19 asset ID (e.g., "eip155:1/erc20:0x...")
   * @returns Token metadata if found in token list, undefined otherwise.
   */
  #getTokenMetadataFromTokenList(
    assetId: Caip19AssetId,
  ): AssetMetadata | undefined {
    try {
      const parsed = parseCaipAssetType(assetId);
      if (parsed.assetNamespace !== 'erc20') {
        return undefined;
      }
      const tokenAddress = parsed.assetReference;
      const { reference } = parseCaipChainId(parsed.chainId);
      const hexChainId = numberToHex(parseInt(reference, 10));

      const tokenListState = this.#messenger.call(
        'TokenListController:getState',
      );
      const chainCacheEntry = tokenListState?.tokensChainsCache?.[hexChainId];
      const chainTokenList = chainCacheEntry?.data;

      if (!chainTokenList) {
        return undefined;
      }

      // Look up token by address (case-insensitive)
      const lowerAddress = tokenAddress.toLowerCase();
      for (const [address, tokenData] of Object.entries(chainTokenList)) {
        if (address.toLowerCase() === lowerAddress) {
          const token = tokenData;
          if (token.symbol && token.decimals !== undefined) {
            return {
              type: 'erc20',
              symbol: token.symbol,
              name: token.name ?? token.symbol,
              decimals: token.decimals,
              image: token.iconUrl,
            };
          }
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Destroy the data source and clean up resources.
   */
  destroy(): void {
    log('Destroying RpcDataSource');

    this.#unsubscribeTransactionConfirmed?.();
    this.#unsubscribeIncomingTransactions?.();

    // Stop all polling
    this.#balanceFetcher.stopAllPolling();
    this.#tokenDetector.stopAllPolling();
    this.#stakedBalanceFetcher.stopAllPolling();

    // Clear subscriptions
    this.#activeSubscriptions.clear();

    // Clear caches
    this.#providerCache.clear();
  }
}

export function createRpcDataSource(
  options: RpcDataSourceOptions,
): RpcDataSource {
  return new RpcDataSource(options);
}
