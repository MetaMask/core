import type {
  SupportedCurrency,
  V3SpotPricesResponse,
} from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import { parseCaipAssetType } from '@metamask/utils';

import type { SubscriptionRequest } from './AbstractDataSource';
import { projectLogger, createModuleLogger } from '../logger';
import { forDataTypes } from '../types';
import type {
  Caip19AssetId,
  DataRequest,
  DataResponse,
  FungibleAssetPrice,
  Middleware,
  AssetsControllerStateInternal,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'PriceDataSource';
const DEFAULT_POLL_INTERVAL = 60_000; // 1 minute for price updates

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// OPTIONS
// ============================================================================

/** Optional configuration for PriceDataSource. */
export type PriceDataSourceConfig = {
  /** Polling interval in ms (default: 60000) */
  pollInterval?: number;
};

export type PriceDataSourceOptions = PriceDataSourceConfig & {
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  /** Function returning the currently-active ISO 4217 currency code */
  getSelectedCurrency: () => SupportedCurrency;
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

/** Market data item from spot prices response (same as FungibleAssetPrice without lastUpdated) */
type SpotPriceMarketData = Omit<FungibleAssetPrice, 'lastUpdated'>;

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

// ============================================================================
// PRICE DATA SOURCE
// ============================================================================

/**
 * PriceDataSource fetches asset prices from the Price API.
 *
 * This data source:
 * - Fetches prices from Price API v3 spot-prices endpoint
 * - Supports one-time fetch and subscription-based polling
 * - In subscribe mode, uses getAssetsState from SubscriptionRequest to read assetsBalance and fetch prices
 *
 * Usage: Create with queryApiClient; subscribe() requires getAssetsState in the request for balance-based pricing.
 */
export class PriceDataSource {
  static readonly controllerName = CONTROLLER_NAME;

  getName(): string {
    return PriceDataSource.controllerName;
  }

  readonly #getSelectedCurrency: () => SupportedCurrency;

  readonly #pollInterval: number;

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  /** Active subscriptions by ID */
  readonly #activeSubscriptions: Map<
    string,
    {
      cleanup: () => void;
      request: DataRequest;
      onAssetsUpdate: (response: DataResponse) => void | Promise<void>;
      getAssetsState?: () => AssetsControllerStateInternal;
    }
  > = new Map();

  constructor(options: PriceDataSourceOptions) {
    this.#getSelectedCurrency = options.getSelectedCurrency;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#apiClient = options.queryApiClient;
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
      const { response, request } = ctx;

      // Only fetch prices for detected assets (assets without metadata)
      // The subscription handles fetching prices for all existing assets
      if (!response.detectedAssets && !request.assetsForPriceUpdate?.length) {
        return next(ctx);
      }

      const assetIds = new Set<Caip19AssetId>();
      for (const detectedAccountAssets of Object.values(
        response.detectedAssets ?? {},
      )) {
        for (const assetId of detectedAccountAssets) {
          assetIds.add(assetId);
        }
      }

      for (const assetId of request.assetsForPriceUpdate ?? []) {
        assetIds.add(assetId);
      }

      if (assetIds.size === 0) {
        return next(ctx);
      }

      // Filter to only priceable assets
      const priceableAssetIds = [...assetIds].filter(isPriceableAsset);

      if (priceableAssetIds.length === 0) {
        return next(ctx);
      }

      try {
        const priceResponse = await this.#fetchSpotPrices(priceableAssetIds);

        response.assetsPrice ??= {};

        for (const [assetId, marketData] of Object.entries(priceResponse)) {
          if (!isValidMarketData(marketData)) {
            continue;
          }

          const caipAssetId = assetId as Caip19AssetId;
          response.assetsPrice[caipAssetId] = {
            ...marketData,
            lastUpdated: Date.now(),
          };
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
   * @returns Spot prices response
   */
  async #fetchSpotPrices(assetIds: string[]): Promise<V3SpotPricesResponse> {
    return this.#apiClient.prices.fetchV3SpotPrices(assetIds, {
      currency: this.#getSelectedCurrency(),
      includeMarketData: true,
    });
  }

  /**
   * Get unique asset IDs from the assetsBalance state.
   * Filters by accounts and chains from the request.
   *
   * @param request - Data request with accounts and chainIds filters.
   * @param getAssetsState - State access; when omitted, returns [].
   * @returns Array of CAIP-19 asset IDs from balance state.
   */
  #getAssetIdsFromBalanceState(
    request: DataRequest,
    getAssetsState?: () => AssetsControllerStateInternal,
  ): Caip19AssetId[] {
    if (!getAssetsState) {
      return [];
    }
    try {
      const state = getAssetsState();
      const assetIds = new Set<Caip19AssetId>();

      const accountIds = request.accountsWithSupportedChains.map(
        (a) => a.account.id,
      );
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
            // Filter by chain if specified; skip malformed asset IDs for this entry only
            if (chainFilter) {
              try {
                const { chainId } = parseCaipAssetType(
                  assetId as Caip19AssetId,
                );
                if (!chainFilter.has(chainId)) {
                  continue;
                }
              } catch (error) {
                log('Skipping malformed asset ID in balance state', {
                  assetId,
                  error,
                });
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
   * When getAssetsState is provided, gets asset IDs from balance state; otherwise returns empty.
   *
   * @param request - The data request specifying accounts and chains.
   * @param getAssetsState - Optional state access (e.g. from SubscriptionRequest).
   * @returns DataResponse containing asset prices.
   */
  async fetch(
    request: DataRequest,
    getAssetsState?: () => AssetsControllerStateInternal,
  ): Promise<DataResponse> {
    const response: DataResponse = {};

    // Get asset IDs from balance state when state access is provided
    const rawAssetIds = this.#getAssetIdsFromBalanceState(
      request,
      getAssetsState,
    );

    // Filter out non-priceable assets (e.g., Tron bandwidth/energy resources)
    const assetIds = rawAssetIds.filter(isPriceableAsset);

    if (assetIds.length === 0) {
      return response;
    }

    try {
      const priceResponse = await this.#fetchSpotPrices([...assetIds]);

      response.assetsPrice = {};

      for (const [assetId, marketData] of Object.entries(priceResponse)) {
        // Skip assets with invalid market data (API doesn't have price for this asset)
        if (!isValidMarketData(marketData)) {
          continue;
        }

        const caipAssetId = assetId as Caip19AssetId;
        response.assetsPrice[caipAssetId] = {
          ...marketData,
          lastUpdated: Date.now(),
        };
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

    // Create poll function - fetches prices using getAssetsState from subscription
    const pollFn = async (): Promise<void> => {
      try {
        const subscription = this.#activeSubscriptions.get(subscriptionId);
        if (!subscription) {
          return;
        }

        // Fetch prices for all assets in balance state (uses subscription's getAssetsState)
        const fetchResponse = await this.fetch(
          subscription.request,
          subscription.getAssetsState,
        );

        // Only report if we got prices
        if (
          fetchResponse.assetsPrice &&
          Object.keys(fetchResponse.assetsPrice).length > 0
        ) {
          await subscription.onAssetsUpdate({
            ...fetchResponse,
            updateMode: 'merge',
          });
        }
      } catch (error) {
        log('Subscription poll failed', { subscriptionId, error });
      }
    };

    // Set up polling
    const timer = setInterval(() => {
      pollFn().catch(console.error);
    }, pollInterval);

    // Store subscription (getAssetsState from request for balance-based pricing)
    this.#activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        clearInterval(timer);
      },
      request,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
      getAssetsState: subscriptionRequest.getAssetsState,
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
