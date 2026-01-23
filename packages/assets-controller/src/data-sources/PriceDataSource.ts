import type {
  SupportedCurrency,
  V3SpotPricesResponse,
} from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';

import type { SubscriptionRequest } from './AbstractDataSource';
import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type {
  Caip19AssetId,
  AssetPrice,
  AssetBalance,
  AccountId,
  ChainId,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'PriceDataSource';
const DEFAULT_POLL_INTERVAL = 60_000; // 1 minute for price updates

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

/**
 * Action to get balance state (used to determine which assets need prices).
 */
type GetAssetsBalanceStateAction = {
  type: 'AssetsController:getState';
  handler: () => {
    assetsBalance: Record<AccountId, Record<Caip19AssetId, AssetBalance>>;
  };
};

/**
 * Action to get the PriceDataSource middleware.
 */
export type PriceDataSourceGetAssetsMiddlewareAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetsMiddleware`;
  handler: () => Middleware;
};

/**
 * Action to fetch prices for assets.
 */
export type PriceDataSourceFetchAction = {
  type: `${typeof CONTROLLER_NAME}:fetch`;
  handler: (request: DataRequest) => Promise<DataResponse>;
};

/**
 * Action to subscribe to price updates.
 */
export type PriceDataSourceSubscribeAction = {
  type: `${typeof CONTROLLER_NAME}:subscribe`;
  handler: (request: SubscriptionRequest) => Promise<void>;
};

/**
 * Action to unsubscribe from price updates.
 */
export type PriceDataSourceUnsubscribeAction = {
  type: `${typeof CONTROLLER_NAME}:unsubscribe`;
  handler: (subscriptionId: string) => Promise<void>;
};

/**
 * All actions exposed by PriceDataSource.
 */
export type PriceDataSourceActions =
  | PriceDataSourceGetAssetsMiddlewareAction
  | PriceDataSourceFetchAction
  | PriceDataSourceSubscribeAction
  | PriceDataSourceUnsubscribeAction;

/**
 * Event emitted when prices are updated.
 */
export type PriceDataSourceAssetsUpdatedEvent = {
  type: `${typeof CONTROLLER_NAME}:assetsUpdated`;
  payload: [DataResponse, string];
};

/**
 * All events exposed by PriceDataSource.
 */
export type PriceDataSourceEvents = PriceDataSourceAssetsUpdatedEvent;

// Action to report assets updated to AssetsController
type AssetsControllerAssetsUpdateAction = {
  type: 'AssetsController:assetsUpdate';
  handler: (response: DataResponse, sourceId: string) => Promise<void>;
};

/**
 * External actions that PriceDataSource needs to call.
 * Note: Uses ApiPlatformClient directly, so no BackendApiClient actions needed.
 */
export type PriceDataSourceAllowedActions =
  | GetAssetsBalanceStateAction
  | AssetsControllerAssetsUpdateAction;

export type PriceDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  PriceDataSourceAllowedActions | PriceDataSourceActions,
  PriceDataSourceEvents
>;

// ============================================================================
// OPTIONS
// ============================================================================

export type PriceDataSourceOptions = {
  messenger: PriceDataSourceMessenger;
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  /** Currency to fetch prices in (default: 'usd') */
  currency?: SupportedCurrency;
  /** Polling interval in ms (default: 60000) */
  pollInterval?: number;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Asset reference patterns that should NOT be sent to the Price API.
 * These are internal resource tracking values without market prices.
 */
const NON_PRICEABLE_ASSET_PATTERNS = [
  // Tron resource assets (bandwidth, energy, staking states)
  /\/slip44:\d+-staked-for-/u,
  /\/slip44:bandwidth$/u,
  /\/slip44:energy$/u,
  /\/slip44:maximum-bandwidth$/u,
  /\/slip44:maximum-energy$/u,
];

/**
 * Check if an asset ID represents a priceable asset.
 * Filters out internal resource tracking values that don't have market prices.
 *
 * @param assetId - The CAIP-19 asset ID to check.
 * @returns True if the asset has market price data.
 */
function isPriceableAsset(assetId: Caip19AssetId): boolean {
  return !NON_PRICEABLE_ASSET_PATTERNS.some((pattern) => pattern.test(assetId));
}

/** Market data item from spot prices response */
type SpotPriceMarketData = {
  price: number;
  pricePercentChange1d?: number;
  marketCap?: number;
  totalVolume?: number;
};

/**
 * Type guard to check if market data has a valid price
 *
 * @param data - The data to check.
 * @returns True if data is valid SpotPriceMarketData.
 */
function isValidMarketData(data: unknown): data is SpotPriceMarketData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'price' in data &&
    typeof (data as SpotPriceMarketData).price === 'number'
  );
}

function transformMarketDataToAssetPrice(
  marketData: SpotPriceMarketData,
): AssetPrice {
  return {
    price: marketData.price,
    priceChange24h: marketData.pricePercentChange1d,
    lastUpdated: Date.now(),
    // Extended market data
    marketCap: marketData.marketCap,
    volume24h: marketData.totalVolume,
  };
}

// ============================================================================
// PRICE DATA SOURCE
// ============================================================================

/**
 * PriceDataSource fetches asset prices from the Price API.
 *
 * This data source:
 * - Fetches prices from Price API v3 spot-prices endpoint
 * - Supports one-time fetch and subscription-based polling
 * - In subscribe mode, automatically fetches prices for all assets in assetsBalance state
 * - Publishes price updates via messenger events
 *
 * Usage:
 * ```typescript
 * // Create and initialize (registers messenger actions)
 * const priceDataSource = new PriceDataSource({ messenger });
 *
 * // One-time fetch for specific assets
 * const response = await messenger.call('PriceDataSource:fetch', {
 *   customAssets: ['eip155:1/erc20:0x...'],
 * });
 *
 * // Subscribe to price updates (polls all assets in balance state)
 * await messenger.call('PriceDataSource:subscribe', { request, subscriptionId });
 *
 * // Listen for updates
 * messenger.subscribe('PriceDataSource:assetsUpdated', (response) => {
 *   // Handle price updates
 * });
 * ```
 */
export class PriceDataSource {
  readonly name = CONTROLLER_NAME;

  readonly #messenger: PriceDataSourceMessenger;

  readonly #currency: SupportedCurrency;

  readonly #pollInterval: number;

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  /** Active subscriptions by ID */
  readonly #activeSubscriptions: Map<
    string,
    { cleanup: () => void; request: DataRequest }
  > = new Map();

  constructor(options: PriceDataSourceOptions) {
    this.#messenger = options.messenger;
    this.#currency = options.currency ?? 'usd';
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#apiClient = options.queryApiClient;

    this.#registerActionHandlers();
  }

  #registerActionHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger = this.#messenger as any;

    messenger.registerActionHandler(
      'PriceDataSource:getAssetsMiddleware',
      () => this.assetsMiddleware,
    );

    messenger.registerActionHandler(
      'PriceDataSource:fetch',
      (request: DataRequest) => this.fetch(request),
    );

    messenger.registerActionHandler(
      'PriceDataSource:subscribe',
      (subscriptionRequest: SubscriptionRequest) =>
        this.subscribe(subscriptionRequest),
    );

    messenger.registerActionHandler(
      'PriceDataSource:unsubscribe',
      (subscriptionId: string) => this.unsubscribe(subscriptionId),
    );
  }

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Get the middleware for enriching responses with price data.
   *
   * This middleware:
   * 1. Extracts the response from context
   * 2. Fetches prices for detected assets (assets without metadata)
   * 3. Enriches the response with fetched prices
   * 4. Calls next() at the end to continue the middleware chain
   *
   * Note: This middleware ONLY fetches prices for detected assets.
   * For fetching prices for all assets, use the subscription mechanism
   * which polls prices for all assets in the balance state.
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['price'], async (ctx, next) => {
      // Extract response from context
      const { response } = ctx;

      // Only fetch prices for detected assets (assets without metadata)
      // The subscription handles fetching prices for all existing assets
      if (!response.detectedAssets) {
        return next(ctx);
      }

      const detectedAssetIds = new Set<Caip19AssetId>();
      for (const detectedIds of Object.values(response.detectedAssets)) {
        for (const assetId of detectedIds) {
          detectedAssetIds.add(assetId);
        }
      }

      if (detectedAssetIds.size === 0) {
        return next(ctx);
      }

      // Filter to only priceable assets
      const priceableAssetIds = [...detectedAssetIds].filter(isPriceableAsset);

      if (priceableAssetIds.length === 0) {
        return next(ctx);
      }

      try {
        const priceResponse = await this.#fetchSpotPrices(
          priceableAssetIds,
          true, // includeMarketData
        );

        response.assetsPrice ??= {};

        for (const [assetId, marketData] of Object.entries(priceResponse)) {
          if (!isValidMarketData(marketData)) {
            continue;
          }

          const caipAssetId = assetId as Caip19AssetId;
          response.assetsPrice[caipAssetId] =
            transformMarketDataToAssetPrice(marketData);
        }
      } catch (error) {
        log('Failed to fetch prices via middleware', { error });
      }

      // Call next() at the end to continue the middleware chain
      return next(ctx);
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Fetch spot prices with caching and deduplication via query service.
   *
   * @param assetIds - Array of CAIP-19 asset IDs
   * @param includeMarketData - Whether to include market data
   * @returns Spot prices response
   */
  async #fetchSpotPrices(
    assetIds: string[],
    includeMarketData: boolean,
  ): Promise<V3SpotPricesResponse> {
    return this.#apiClient.prices.fetchV3SpotPrices(assetIds, {
      currency: this.#currency,
      includeMarketData,
    });
  }

  /**
   * Get unique asset IDs from the assetsBalance state.
   * Filters by accounts and chains from the request.
   *
   * @param request - Data request with accounts and chainIds filters.
   * @returns Array of CAIP-19 asset IDs from balance state.
   */
  #getAssetIdsFromBalanceState(request: DataRequest): Caip19AssetId[] {
    try {
      const state = this.#messenger.call('AssetsController:getState');
      const assetIds = new Set<Caip19AssetId>();

      const accountIds = request.accounts.map((a) => a.id);
      const accountFilter =
        accountIds.length > 0 ? new Set(accountIds) : undefined;
      const chainFilter =
        request.chainIds.length > 0 ? new Set(request.chainIds) : undefined;

      if (state?.assetsBalance) {
        for (const [accountId, accountBalances] of Object.entries(
          state.assetsBalance,
        )) {
          // Filter by account if specified
          if (accountFilter && !accountFilter.has(accountId)) {
            continue;
          }

          for (const assetId of Object.keys(
            accountBalances as Record<string, unknown>,
          )) {
            // Filter by chain if specified
            if (chainFilter) {
              const chainId = assetId.split('/')[0] as ChainId;
              if (!chainFilter.has(chainId)) {
                continue;
              }
            }
            assetIds.add(assetId as Caip19AssetId);
          }
        }
      }

      return [...assetIds];
    } catch (error) {
      log('Failed to get asset IDs from balance state', { error });
      return [];
    }
  }

  // ============================================================================
  // FETCH
  // ============================================================================

  /**
   * Fetch prices for assets held by the accounts and chains in the request.
   * Gets asset IDs from balance state, filtered by request.accounts and request.chainIds.
   *
   * @param request - The data request specifying accounts and chains.
   * @returns DataResponse containing asset prices.
   */
  async fetch(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    // Get asset IDs from balance state, filtered by accounts and chains
    const rawAssetIds = this.#getAssetIdsFromBalanceState(request);

    // Filter out non-priceable assets (e.g., Tron bandwidth/energy resources)
    const assetIds = rawAssetIds.filter(isPriceableAsset);

    if (assetIds.length === 0) {
      return response;
    }

    try {
      const priceResponse = await this.#fetchSpotPrices(
        [...assetIds],
        true, // includeMarketData
      );

      response.assetsPrice = {};

      for (const [assetId, marketData] of Object.entries(priceResponse)) {
        // Skip assets with invalid market data (API doesn't have price for this asset)
        if (!isValidMarketData(marketData)) {
          continue;
        }

        const caipAssetId = assetId as Caip19AssetId;
        response.assetsPrice[caipAssetId] =
          transformMarketDataToAssetPrice(marketData);
      }
    } catch (error) {
      log('Failed to fetch prices', { error });
    }

    return response;
  }

  // ============================================================================
  // SUBSCRIBE
  // ============================================================================

  /**
   * Subscribe to price updates.
   * Sets up polling that fetches prices for all assets in assetsBalance state.
   *
   * @param subscriptionRequest - The subscription request configuration.
   */
  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    // Handle subscription update - just update the request
    if (isUpdate) {
      const existing = this.#activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.request = request;
        return;
      }
    }

    // Clean up existing subscription
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;

    // Create poll function - fetches prices for all assets in balance state
    const pollFn = async (): Promise<void> => {
      try {
        const subscription = this.#activeSubscriptions.get(subscriptionId);
        if (!subscription) {
          return;
        }

        // Fetch prices for all assets currently in balance state
        const fetchResponse = await this.fetch(subscription.request);

        // Only report if we got prices
        if (
          fetchResponse.assetsPrice &&
          Object.keys(fetchResponse.assetsPrice).length > 0
        ) {
          await this.#messenger.call(
            'AssetsController:assetsUpdate',
            fetchResponse,
            CONTROLLER_NAME,
          );
        }
      } catch (error) {
        log('Subscription poll failed', { subscriptionId, error });
      }
    };

    // Set up polling
    const timer = setInterval(() => {
      pollFn().catch(console.error);
    }, pollInterval);

    // Store subscription
    this.#activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        clearInterval(timer);
      },
      request,
    });

    // Initial fetch
    await pollFn();
  }

  /**
   * Unsubscribe from price updates.
   *
   * @param subscriptionId - The ID of the subscription to cancel.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.#activeSubscriptions.get(subscriptionId);
    if (subscription) {
      subscription.cleanup();
      this.#activeSubscriptions.delete(subscriptionId);
    }
  }

  /**
   * Destroy the data source and clean up all subscriptions.
   */
  destroy(): void {
    for (const subscription of this.#activeSubscriptions.values()) {
      subscription.cleanup();
    }
    this.#activeSubscriptions.clear();
  }
}
