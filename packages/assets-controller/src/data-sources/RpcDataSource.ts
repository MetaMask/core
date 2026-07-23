import { Web3Provider } from '@ethersproject/providers';
import { toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
  NetworkState,
  NetworkStatus,
} from '@metamask/network-controller';
import type {
  TransactionControllerTransactionConfirmedEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';
import {
  isStrictHexString,
  isCaipChainId,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import BigNumberJS from 'bignumber.js';

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
import { normalizeAssetId } from '../utils';
import { ZERO_ADDRESS } from '../utils/constants';
import { AbstractDataSource } from './AbstractDataSource';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import {
  BalanceFetcher,
  MulticallClient,
  TokenDetector,
  TokensApiClient,
} from './evm-rpc-services';
import type {
  BalancePollingInput,
  DetectionPollingInput,
  TokenListQueryClient,
} from './evm-rpc-services';
import type {
  Address,
  AssetFetchEntry,
  Provider as RpcProvider,
  BalanceFetchResult,
  TokenDetectionResult,
} from './evm-rpc-services/types';
import { shouldSkipNativeForCaipChainId } from './evm-rpc-services/utils/assets';

const CONTROLLER_NAME = 'RpcDataSource';
const DEFAULT_BALANCE_INTERVAL = 30_000; // 30 seconds
const DEFAULT_DETECTION_INTERVAL = 180_000; // 3 minutes

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// Allowed actions that RpcDataSource can call
export type RpcDataSourceAllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | AssetsControllerGetStateAction;

// Allowed events that RpcDataSource can subscribe to
export type RpcDataSourceAllowedEvents =
  | NetworkControllerStateChangeEvent
  | TransactionControllerTransactionConfirmedEvent;

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
  /** Function returning whether onboarding is complete. When false, fetch and subscribe are no-ops. Defaults to () => true. */
  isOnboarded?: () => boolean;
  timeout?: number;
  /**
   * Optional shared TanStack Query client used by `TokensApiClient` to cache
   * token-list responses across detector polls. Pass `apiPlatformClient.queryClient`
   * to share the cache with other API clients in the host app.
   */
  queryClient?: TokenListQueryClient;
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
  /** Resolves CAIP-2 chain ID to CAIP-19 native asset ID from the cached native asset map. */
  getNativeAssetForChain: (chainId: ChainId) => Caip19AssetId;
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
  /** Function returning whether onboarding is complete. When false, fetch and subscribe are no-ops. Defaults to () => true. */
  isOnboarded?: () => boolean;
  /**
   * Optional shared TanStack Query client used by `TokensApiClient` to cache
   * token-list responses across detector polls.
   */
  queryClient?: TokenListQueryClient;

  /** Returns the asset type ('native' | 'erc20' | 'spl') for the given CAIP-19 asset ID */
  getAssetType: (assetId: Caip19AssetId) => 'native' | 'erc20' | 'spl';
};

/**
 * Subscription data stored for each active subscription.
 */
type SubscriptionData = {
  /** Polling tokens from BalanceFetcher */
  balancePollingTokens: string[];
  /** Polling tokens from TokenDetector */
  detectionPollingTokens: string[];
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

  readonly #getNativeAssetForChain: (chainId: ChainId) => Caip19AssetId;

  readonly #timeout: number;

  readonly #tokenDetectionEnabled: () => boolean;

  readonly #useExternalService: () => boolean;

  readonly #isOnboarded: () => boolean;

  /** Currently active chains */
  #activeChains: ChainId[] = [];

  /** Network status for each active chain */
  #chainStatuses: Record<ChainId, ChainStatus> = {};

  /** Cache of Web3Provider instances by chainId */
  readonly #providerCache: Map<ChainId, Web3Provider> = new Map();

  /** Active subscriptions by ID */
  readonly #activeSubscriptions: Map<string, SubscriptionData> = new Map();

  #unsubscribeTransactionConfirmed: (() => void) | undefined = undefined;

  // Rpc-datasource components
  readonly #multicallClient: MulticallClient;

  readonly #balanceFetcher: BalanceFetcher;

  readonly #tokenDetector: TokenDetector;

  readonly #getAssetType: (
    assetId: Caip19AssetId,
  ) => 'native' | 'erc20' | 'spl';

  constructor(options: RpcDataSourceOptions) {
    super(CONTROLLER_NAME, { activeChains: [] });
    this.#messenger = options.messenger;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#getNativeAssetForChain = options.getNativeAssetForChain;
    this.#getAssetType = options.getAssetType;
    this.#timeout = options.timeout ?? 10_000;
    this.#tokenDetectionEnabled =
      options.tokenDetectionEnabled ?? ((): boolean => true);
    this.#useExternalService =
      options.useExternalService ?? ((): boolean => true);
    this.#isOnboarded = options.isOnboarded ?? ((): boolean => true);

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
        customAssets?: Record<string, string[]>;
      } => {
        const state = this.#messenger.call('AssetsController:getState');
        return {
          assetsBalance: (state.assetsBalance ?? {}) as Record<
            string,
            Record<string, { amount: string }>
          >,
          customAssets: (state.customAssets ?? {}) as Record<string, string[]>,
        };
      },
    };

    // Initialize BalanceFetcher with polling interval
    this.#balanceFetcher = new BalanceFetcher(
      this.#multicallClient,
      balanceFetcherMessenger,
      {
        pollingInterval: balanceInterval,
        isNativeAsset: (assetId: Caip19AssetId): boolean => {
          const { chainId } = parseCaipAssetType(assetId);
          const nativeId = this.#getNativeAssetForChain(chainId);
          return nativeId?.toLowerCase() === assetId.toLowerCase();
        },
      },
    );
    // Polling controller awaits this callback; rejections must not become unhandled.
    this.#balanceFetcher.setOnBalanceUpdate(async (result) => {
      try {
        await this.#handleBalanceUpdate(result);
      } catch (error) {
        log('Balance update handler failed', { error });
      }
    });

    // Initialize TokenDetector with polling interval. The TokensApiClient is
    // configured with the shared TanStack Query client (when the controller
    // provides one) so concurrent detector polls/accounts/instances share a
    // single in-flight request and cached result per chain.
    const tokensApiClient = new TokensApiClient({
      queryClient: options.queryClient,
    });
    this.#tokenDetector = new TokenDetector(
      this.#multicallClient,
      tokensApiClient,
      {
        pollingInterval: detectionInterval,
        tokenDetectionEnabled: this.#tokenDetectionEnabled,
        useExternalService: this.#useExternalService,
      },
    );
    // Sync throw in the detector would reject the poll tick if uncaught.
    this.#tokenDetector.setOnDetectionUpdate((result) => {
      try {
        this.#handleDetectionUpdate(result);
      } catch (error) {
        log('Detection update handler failed', { error });
      }
    });

    this.#subscribeToNetworkController();
    this.#subscribeToTransactionEvents();
    this.#initializeFromNetworkController();
  }

  /**
   * Convert a raw balance to human-readable format using decimals.
   *
   * Returns `'0'` when either input is invalid (e.g. `decimals` is `null`,
   * `NaN`, negative or non-finite, or `rawBalance` cannot be parsed as a
   * number). Defaulting to a fixed decimals value would silently produce
   * wrong amounts; `'0'` keeps state safe and never lets `NaN` leak in.
   *
   * @param rawBalance - The raw balance string.
   * @param decimals - The number of decimals for the token.
   * @returns The human-readable balance string, or `'0'` when inputs are invalid.
   */
  #convertToHumanReadable(rawBalance: string, decimals: number): string {
    if (!Number.isFinite(decimals) || decimals < 0) {
      log('Invalid decimals — defaulting balance to "0"', {
        rawBalance,
        decimals,
      });
      return '0';
    }

    const rawAmount = new BigNumberJS(rawBalance);
    if (!rawAmount.isFinite()) {
      log('Invalid raw balance — defaulting to "0"', { rawBalance, decimals });
      return '0';
    }

    const divisor = new BigNumberJS(10).pow(decimals);
    return rawAmount.dividedBy(divisor).toFixed();
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

    const nativeAssetId = this.#getNativeAssetForChain(chainId);
    for (const balance of balances) {
      const existingMeta = existingMetadata[balance.assetId];
      const isNative =
        existingMeta?.type === 'native' ||
        balance.assetId.toLowerCase() === nativeAssetId?.toLowerCase() ||
        this.#getAssetType(balance.assetId) === 'native';

      if (isNative && !this.#hasValidDecimals(existingMeta)) {
        // Only emit a stub when no valid metadata exists in state yet.
        // Re-emitting existing metadata into the response would overwrite
        // richer entries (e.g. image/description added by AccountsAPI) with
        // a simpler stub on every balance poll cycle.
        const chainStatus = this.#chainStatuses[chainId];
        if (chainStatus) {
          assetsInfo[balance.assetId] = {
            type: 'native',
            symbol: chainStatus.nativeCurrency,
            name: chainStatus.nativeCurrency,
            decimals: 18,
          };
        }
      }
      // For ERC-20 tokens and native tokens with existing valid metadata:
      // do not re-emit — the existing state entry is already correct.
      // Decimals for balance conversion are resolved via stateMetadata in
      // the callers (pickValidDecimals(stateMetadata, pipelineMetadata)).
    }

    return assetsInfo;
  }

  /**
   * Type guard for metadata whose `decimals` is safe to use for balance
   * conversion.
   *
   * Mirrors the validity rules in `#convertToHumanReadable` (finite and
   * non-negative). Keeping these in sync ensures that whenever the metadata
   * guard accepts a value, the balance guard will also accept it — so we
   * never end up emitting metadata with `decimals: -1` while silently
   * defaulting the balance to `'0'`.
   *
   * @param metadata - The metadata to check.
   * @returns `true` if `decimals` is a finite, non-negative number.
   */
  #hasValidDecimals(
    metadata: AssetMetadata | undefined,
  ): metadata is AssetMetadata {
    return Boolean(
      metadata && Number.isFinite(metadata.decimals) && metadata.decimals >= 0,
    );
  }

  /**
   * Pick the first valid `decimals` value from a list of metadata sources.
   *
   * `??` only short-circuits on `null`/`undefined`, so a stale state entry
   * with `decimals: NaN` would otherwise win over a later source that holds
   * a correct value (e.g. the chain-status stub produced by
   * `#collectMetadataForBalances`). This helper treats `NaN`, negative, and
   * non-finite values as missing so the next source can supply a usable one.
   *
   * @param metadatas - Metadata candidates in priority order.
   * @returns The first finite `decimals` value, or `undefined` if none are valid.
   */
  #pickValidDecimals(
    ...metadatas: (AssetMetadata | undefined)[]
  ): number | undefined {
    for (const metadata of metadatas) {
      if (this.#hasValidDecimals(metadata)) {
        return metadata.decimals;
      }
    }
    return undefined;
  }

  /**
   * Handle balance update from BalanceFetcher.
   *
   * @param result - The balance fetch result.
   */
  async #handleBalanceUpdate(result: BalanceFetchResult): Promise<void> {
    const newBalances: Record<string, { amount: string }> = {};

    // Convert hex chain ID to CAIP-2 format
    const chainIdDecimal = parseInt(result.chainId, 16);
    const caipChainId = `eip155:${chainIdDecimal}` as ChainId;

    // Normalize asset IDs from BalanceFetcher (lowercase) to checksummed form
    const normalizedBalances = result.balances.map((b) => ({
      ...b,
      assetId: normalizeAssetId(b.assetId),
    }));

    // Collect metadata for all balances
    const assetsInfo = this.#collectMetadataForBalances(
      normalizedBalances,
      caipChainId,
    );

    // Convert balances to human-readable format.
    // Resolution: state metadata → pipeline metadata; skip if decimals unknown.
    const existingMetadata = this.#getExistingAssetsMetadata();
    for (const balance of normalizedBalances) {
      const stateMetadata = existingMetadata[balance.assetId];
      const pipelineMetadata = assetsInfo[balance.assetId];
      const decimals = this.#pickValidDecimals(stateMetadata, pipelineMetadata);

      if (decimals === undefined) {
        continue;
      }

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
            type: this.#getAssetType(asset.assetId),
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
        if (detectedAsset?.decimals === undefined) {
          continue;
        }
        const humanReadableAmount = this.#convertToHumanReadable(
          balance.balance,
          detectedAsset.decimals,
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
  }

  #onTransactionConfirmed(payload: TransactionMeta): void {
    const hexChainId = payload?.chainId;
    if (!hexChainId) {
      return;
    }
    const caipChainId = `eip155:${parseInt(hexChainId, 16)}` as ChainId;
    this.#refreshBalanceForChains([caipChainId], 'transactionConfirmed').catch(
      (error) => {
        log('Failed to refresh balance after transaction confirmed', { error });
      },
    );
  }

  /**
   * Fetch balances for the given chains across all active subscriptions and
   * push updates to the controller.
   *
   * @param chainIds - CAIP-2 chain IDs to refresh.
   * @param context - Why the refresh was triggered (for logging).
   */
  async #refreshBalanceForChains(
    chainIds: ChainId[],
    context: 'transactionConfirmed' | 'polling' = 'polling',
  ): Promise<void> {
    const chainIdsSet = new Set(chainIds);
    const chainsToFetch = chainIds.filter((chainId) =>
      this.#activeChains.includes(chainId),
    );

    if (chainsToFetch.length === 0) {
      return;
    }

    let appliedCount = 0;

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
        const balanceCount = response.assetsBalance
          ? Object.values(response.assetsBalance).reduce(
              (sum, accountBalances) =>
                sum + Object.keys(accountBalances).length,
              0,
            )
          : 0;

        if (balanceCount === 0) {
          continue;
        }

        const responseWithMode: DataResponse = {
          ...response,
          updateMode: response.updateMode ?? 'merge',
        };

        await subscription.onAssetsUpdate(responseWithMode, request);
        appliedCount += 1;
      } catch (error) {
        log('Failed to fetch balance after transaction', {
          context,
          chains: subscriptionChains,
          error,
        });
      }
    }

    if (appliedCount === 0 && context === 'transactionConfirmed') {
      log('No RpcDataSource subscription covers chain after transaction', {
        chainsToFetch,
      });
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

  /**
   * Re-read NetworkController state and refresh Rpc `activeChains` (e.g. when
   * network availability metadata changes after an EVM network switch).
   */
  refreshActiveChainsFromNetworkState(): void {
    this.#initializeFromNetworkController();
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
   * Fetch the `decimals()` value from an ERC20 contract via RPC.
   *
   * @param chainId - CAIP-2 chain ID.
   * @param tokenAddress - The token contract address.
   * @returns The decimals value, or undefined if the call fails.
   */
  async #fetchDecimalsViaRpc(
    chainId: ChainId,
    tokenAddress: string,
  ): Promise<number | undefined> {
    try {
      const provider = this.#getProvider(chainId);
      if (!provider) {
        return undefined;
      }
      // ERC20 decimals() selector: keccak256("decimals()") = 0x313ce567
      const result = await provider.call({
        to: tokenAddress,
        data: '0x313ce567',
      });
      if (!result || result === '0x') {
        return undefined;
      }
      const parsed = parseInt(result, 16);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 255) {
        return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
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
    if (!this.#isOnboarded()) {
      log('Skipping fetch - onboarding not complete');
      return {};
    }

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
        const nativeAssetId = this.#getNativeAssetForChain(chainId);

        const shouldSkipNative = shouldSkipNativeForCaipChainId(chainId);
        const assetsToFetch: AssetFetchEntry[] = [];
        if (!shouldSkipNative) {
          // Build a single AssetFetchEntry[] for native + custom ERC-20s
          assetsToFetch.push({ assetId: nativeAssetId, address: ZERO_ADDRESS });
        }

        if (request.customAssets) {
          const existingMetadata = this.#getExistingAssetsMetadata();

          for (const assetId of request.customAssets) {
            try {
              const parsed = parseCaipAssetType(assetId);
              const assetChainId = `${parsed.chain.namespace}:${parsed.chain.reference}`;
              if (
                assetChainId === chainId &&
                this.#getAssetType(assetId) === 'erc20'
              ) {
                const tokenAddress =
                  parsed.assetReference.toLowerCase() as Address;
                const normalizedId = normalizeAssetId(assetId);
                const decimals = existingMetadata[normalizedId]?.decimals;

                assetsToFetch.push({
                  assetId,
                  address: tokenAddress,
                  decimals,
                });
              }
            } catch {
              // Skip unparseable asset IDs
            }
          }
        }

        try {
          const result = await this.#balanceFetcher.fetchBalancesForAssets(
            hexChainId,
            accountId,
            address as Address,
            assetsToFetch,
          );

          if (!assetsBalance[accountId]) {
            assetsBalance[accountId] = {};
          }

          // Normalize asset IDs from BalanceFetcher (which uses lowercase
          // addresses) to checksummed form so they match assetsInfo state keys.
          const normalizedBalances = result.balances.map((b) => ({
            ...b,
            assetId: normalizeAssetId(b.assetId),
          }));

          // Collect metadata for all balances
          const balanceMetadata = this.#collectMetadataForBalances(
            normalizedBalances,
            chainId,
          );
          Object.assign(assetsInfo, balanceMetadata);

          // Convert balances to human-readable format using decimals from
          // assetsInfo state (which includes pendingMetadata from addCustomAsset).
          // Resolution: state → pipeline metadata → RPC `decimals()`; omit balance if still unknown.
          const existingMetadata = this.#getExistingAssetsMetadata();
          for (const balance of normalizedBalances) {
            const stateMetadata = existingMetadata[balance.assetId];
            const pipelineMetadata = assetsInfo[balance.assetId];
            let decimals: number | undefined = this.#pickValidDecimals(
              stateMetadata,
              pipelineMetadata,
            );

            if (decimals === undefined) {
              const parsed = parseCaipAssetType(balance.assetId);
              if (this.#getAssetType(balance.assetId) === 'erc20') {
                decimals = await this.#fetchDecimalsViaRpc(
                  chainId,
                  parsed.assetReference,
                );
              }
            }

            if (decimals === undefined) {
              continue;
            }

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

          if (!shouldSkipNative) {
            assetsBalance[accountId][nativeAssetId] = { amount: '0' };
          }
          // On error, emit a stub only when no valid metadata exists in state
          // yet. Re-emitting existing metadata would overwrite richer entries
          // (e.g. image/description added by AccountsAPI) with a simpler stub.
          const existingNativeMeta =
            this.#getExistingAssetsMetadata()[nativeAssetId];
          if (!this.#hasValidDecimals(existingNativeMeta)) {
            const chainStatus = this.#chainStatuses[chainId];
            if (chainStatus) {
              assetsInfo[nativeAssetId] = {
                type: 'native',
                symbol: chainStatus.nativeCurrency,
                name: chainStatus.nativeCurrency,
                decimals: 18,
              };
            }
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

    response.updateMode = 'merge';

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
            type: this.#getAssetType(asset.assetId),
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
        if (detectedAsset?.decimals === undefined) {
          continue;
        }
        const humanReadableAmount = this.#convertToHumanReadable(
          balance.balance,
          detectedAsset.decimals,
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
    if (!this.#isOnboarded()) {
      log('Skipping subscribe - onboarding not complete');
      return;
    }

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
    // Start polling through BalanceFetcher and TokenDetector
    const balancePollingTokens: string[] = [];
    const detectionPollingTokens: string[] = [];

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
      }
    }

    // Store subscription data
    const accounts = request.accountsWithSupportedChains.map(
      (entry) => entry.account,
    );
    this.#activeSubscriptions.set(subscriptionId, {
      balancePollingTokens,
      detectionPollingTokens,
      chains: chainsToSubscribe,
      accounts,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
    });

    log('Subscription SUCCESS', {
      subscriptionId,
      chains: chainsToSubscribe,
      balancePollingCount: balancePollingTokens.length,
      detectionPollingCount: detectionPollingTokens.length,
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

      this.#activeSubscriptions.delete(subscriptionId);
      log('Unsubscribed and stopped polling', { subscriptionId });
    }
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
    } catch (error) {
      log('Failed to get existing assets metadata', { error });
      return {};
    }
  }

  /**
   * Destroy the data source and clean up resources.
   */
  destroy(): void {
    log('Destroying RpcDataSource');

    this.#unsubscribeTransactionConfirmed?.();

    // Stop all polling
    this.#balanceFetcher.stopAllPolling();
    this.#tokenDetector.stopAllPolling();

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
