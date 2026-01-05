import type {
  PricesGetV3SpotPricesAction,
  MarketDataDetails,
  SupportedCurrency,
} from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';

import { projectLogger, createModuleLogger } from '../../logger';
import type { SubscriptionRequest } from './AbstractDataSource';
import {
  forDataTypes,
  type Caip19AssetId,
  type AssetPrice,
  type AssetBalance,
  type AccountId,
  type ChainId,
  type DataRequest,
  type DataResponse,
  type Middleware,
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
 */
export type PriceDataSourceAllowedActions =
  | PricesGetV3SpotPricesAction
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

export interface PriceDataSourceOptions {
  messenger: PriceDataSourceMessenger;
  /** Currency to fetch prices in (default: 'usd') */
  currency?: SupportedCurrency;
  /** Polling interval in ms (default: 60000) */
  pollInterval?: number;
}

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
 */
function isPriceableAsset(assetId: Caip19AssetId): boolean {
  return !NON_PRICEABLE_ASSET_PATTERNS.some((pattern) => pattern.test(assetId));
}

function transformMarketDataToAssetPrice(
  marketData: MarketDataDetails,
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

  /** Active subscriptions by ID */
  readonly #activeSubscriptions: Map<
    string,
    { cleanup: () => void; request: DataRequest }
  > = new Map();

  constructor(options: PriceDataSourceOptions) {
    this.#messenger = options.messenger;
    this.#currency = options.currency ?? 'usd';
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#registerActionHandlers();

    log('Initialized', {
      currency: this.#currency,
      pollInterval: this.#pollInterval,
    });
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
   * This middleware ONLY fetches prices for newly detected assets.
   * For fetching prices for all assets, use the subscription mechanism
   * which polls prices for all assets in the balance state.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['price'], async (ctx, next) => {
      const result = await next(ctx);
      const { response } = result;

      // Only fetch prices for detected assets (newly discovered)
      // The subscription handles fetching prices for all existing assets
      if (!response.detectedAssets) {
        return result;
      }

      const detectedAssetIds = new Set<Caip19AssetId>();
      for (const detectedIds of Object.values(response.detectedAssets)) {
        for (const assetId of detectedIds) {
          detectedAssetIds.add(assetId);
        }
      }

      if (detectedAssetIds.size === 0) {
        return result;
      }

      // Filter to only priceable assets
      const priceableAssetIds = [...detectedAssetIds].filter(isPriceableAsset);

      if (priceableAssetIds.length === 0) {
        return result;
      }

      log('Fetching prices for detected assets via middleware', {
        count: priceableAssetIds.length,
        assetIds: priceableAssetIds.slice(0, 10),
      });

      try {
        const priceResponse = await this.#messenger.call(
          'BackendApiClient:Prices:getV3SpotPrices',
          priceableAssetIds,
          this.#currency,
          true, // includeMarketData
        );

        if (!response.assetsPrice) {
          response.assetsPrice = {};
        }

        let fetchedCount = 0;
        for (const [assetId, marketData] of Object.entries(priceResponse)) {
          if (marketData === null || marketData === undefined) {
            continue;
          }

          const caipAssetId = assetId as Caip19AssetId;
          response.assetsPrice[caipAssetId] = transformMarketDataToAssetPrice(marketData);
          fetchedCount += 1;
        }

        log('Enriched response with prices for detected assets', {
          requested: priceableAssetIds.length,
          received: fetchedCount,
        });
      } catch (error) {
        log('Failed to fetch prices via middleware', { error });
      }

      return result;
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get unique asset IDs from the assetsBalance state.
   * Filters by accounts and chains from the request.
   *
   * @param request - Data request with accounts and chainIds filters
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
   */
  async fetch(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    // Get asset IDs from balance state, filtered by accounts and chains
    const rawAssetIds = this.#getAssetIdsFromBalanceState(request);

    // Filter out non-priceable assets (e.g., Tron bandwidth/energy resources)
    const assetIds = rawAssetIds.filter(isPriceableAsset);

    if (assetIds.length === 0) {
      log('No asset IDs to fetch prices for');
      return response;
    }

    try {
      const priceResponse = await this.#messenger.call(
        'BackendApiClient:Prices:getV3SpotPrices',
        [...assetIds],
        this.#currency,
        true, // includeMarketData
      );

      response.assetsPrice = {};

      let nullCount = 0;
      for (const [assetId, marketData] of Object.entries(priceResponse)) {
        // Skip assets with null market data (API doesn't have price for this asset)
        if (marketData === null || marketData === undefined) {
          nullCount += 1;
          continue;
        }

        const caipAssetId = assetId as Caip19AssetId;
        response.assetsPrice[caipAssetId] =
          transformMarketDataToAssetPrice(marketData);
      }

      log('Fetched prices', {
        requested: assetIds.length,
        received: Object.keys(response.assetsPrice).length,
        nullResponses: nullCount,
      });
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
   */
  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    log('Subscribe requested', {
      subscriptionId,
      isUpdate,
    });

    // Handle subscription update - just update the request
    if (isUpdate) {
      const existing = this.#activeSubscriptions.get(subscriptionId);
      if (existing) {
        log('Updating existing subscription', { subscriptionId });
        existing.request = request;
        return;
      }
    }

    // Clean up existing subscription
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;
    log('Setting up polling subscription', { subscriptionId, pollInterval });

    // Create poll function - fetches prices for all assets in balance state
    const pollFn = async () => {
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
          this.#messenger.call(
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
    const timer = setInterval(pollFn, pollInterval);

    // Store subscription
    this.#activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        log('Cleaning up subscription', { subscriptionId });
        clearInterval(timer);
      },
      request,
    });

    log('Subscription SUCCESS', { subscriptionId, pollInterval });

    // Initial fetch
    await pollFn();
  }

  /**
   * Unsubscribe from price updates.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.#activeSubscriptions.get(subscriptionId);
    if (subscription) {
      subscription.cleanup();
      this.#activeSubscriptions.delete(subscriptionId);
      log('Unsubscribed', { subscriptionId });
    }
  }

  /**
   * Destroy the data source and clean up all subscriptions.
   */
  destroy(): void {
    log('Destroying PriceDataSource', {
      subscriptionCount: this.#activeSubscriptions.size,
    });

    for (const subscription of this.#activeSubscriptions.values()) {
      subscription.cleanup();
    }
    this.#activeSubscriptions.clear();
  }
}
