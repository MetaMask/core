import type {
  PriceV2SupportedNetworksResponse,
  SupportedCurrency,
  V3SpotPricesResponse,
} from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';

import { projectLogger, createModuleLogger } from '../logger.js';
import { forDataTypes } from '../types.js';
import type {
  Caip19AssetId,
  DataRequest,
  DataResponse,
  FungibleAssetPrice,
  Middleware,
  AssetsControllerState,
} from '../types.js';
import { DedupingBatchFetcher } from '../utils/dedupingBatchFetcher.js';
import {
  filterAssetsBySupportedNetworks,
  getAssetIdsForPriceFetch,
  getUnpricedResponseAssetIds,
  isPriceableAsset,
} from '../utils/getAssetIdsForPriceFetch.js';
import { fetchWithTimeout } from '../utils/index.js';
import type { SubscriptionRequest } from './AbstractDataSource.js';
import { reduceInBatchesSerially } from './evm-rpc-services/index.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'PriceDataSource';
const DEFAULT_POLL_INTERVAL = 60_000; // 1 minute for price updates
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Fraction of the poll interval used to cap the freshness TTL. Kept strictly
 * below 1 so an asset fetched on one poll is reliably stale by the next poll;
 * the margin absorbs network latency and timer jitter (see the cap in
 * `subscribe`).
 */
const FRESHNESS_TTL_POLL_RATIO = 0.9;

/** Maximum number of asset IDs per Price API request. */
const PRICE_API_BATCH_SIZE = 50;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extracts the CAIP-2 chain IDs the Price API v3 spot-prices endpoint
 * supports from a `/v2/supportedNetworks` response.
 *
 * The endpoint returns `partialSupport` as an object keyed by spot-price
 * endpoint (`{ spotPricesV2, spotPricesV3 }`). Since this data source only
 * calls `/v3/spot-prices`, only `spotPricesV3` is relevant. A legacy
 * array-shaped `partialSupport` is still accepted so a transient schema
 * change does not disable price fetching.
 *
 * @param response - The supported networks response.
 * @param response.fullSupport - Chains supported by every endpoint.
 * @param response.partialSupport - Chains supported by specific endpoints.
 * @returns Unique CAIP-2 chain IDs supported by v3 spot prices.
 */
function getV3SpotPriceSupportedChainIds(response: {
  fullSupport?: string[];
  partialSupport?:
    | string[]
    | Partial<PriceV2SupportedNetworksResponse['partialSupport']>;
}): Set<string> {
  const { fullSupport, partialSupport } = response;
  const partial = Array.isArray(partialSupport)
    ? partialSupport
    : (partialSupport?.spotPricesV3 ?? []);
  return new Set([...(fullSupport ?? []), ...partial]);
}

// ============================================================================
// OPTIONS
// ============================================================================

/** Optional configuration for PriceDataSource. */
export type PriceDataSourceConfig = {
  /** Polling interval in ms (default: 60000) */
  pollInterval?: number;
  /**
   * Timeout in ms for a single Price API call (default: 15000). When it fires,
   * the batch rejects so the caller can proceed without prices.
   */
  fetchTimeoutMs?: number;
  /**
   * Minimum age (ms) before a price is considered stale and re-fetched.
   * Assets fetched more recently than this are skipped to avoid redundant
   * API calls from overlapping middleware / subscription / manual triggers.
   * Defaults to pollInterval (60 000 ms).
   */
  priceFreshnessTtlMs?: number;
};

export type PriceDataSourceOptions = PriceDataSourceConfig & {
  /** ApiPlatformClient for API calls with caching */
  queryApiClient: ApiPlatformClient;
  /** Function returning the currently-active ISO 4217 currency code */
  getSelectedCurrency: () => SupportedCurrency;
  /** Current AssetsController state. Used for balance-based pricing and freshness checks. */
  getAssetsState: () => AssetsControllerState;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Asset reference patterns that should NOT be sent to the Price API.
 * These are internal resource tracking values without market prices.
 */
export { isPriceableAsset } from '../utils/getAssetIdsForPriceFetch.js';

/** Market data item from spot prices response (same as FungibleAssetPrice without lastUpdated) */
type SpotPriceMarketData = Omit<
  FungibleAssetPrice,
  'lastUpdated' | 'assetPriceType'
>;

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
    typeof (data as Record<string, unknown>).price === 'number'
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
 * - In subscribe mode, uses constructor `getAssetsState` to read assetsBalance and fetch prices
 *
 * Usage: Create with queryApiClient and getAssetsState; subscribe() polls prices for held assets.
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

  readonly #fetchTimeoutMs: number;

  /**
   * Deduplicates price fetches by asset ID: skips assets fetched within the
   * freshness TTL and joins concurrent in-flight fetches for the same asset so
   * overlapping triggers (middleware + subscription poll) don't issue duplicate
   * API requests.
   */
  readonly #deduper: DedupingBatchFetcher<Caip19AssetId, FungibleAssetPrice>;

  readonly #getAssetsState: () => AssetsControllerState;

  /** Active subscriptions by ID */
  readonly #activeSubscriptions: Map<
    string,
    {
      cleanup: () => void;
      request: DataRequest;
      onAssetsUpdate: (response: DataResponse) => void | Promise<void>;
    }
  > = new Map();

  constructor(options: PriceDataSourceOptions) {
    this.#getSelectedCurrency = options.getSelectedCurrency;
    this.#pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.#apiClient = options.queryApiClient;
    this.#fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.#getAssetsState = options.getAssetsState;
    this.#deduper = new DedupingBatchFetcher({
      fetchBatch: (
        assetIds,
      ): Promise<Record<Caip19AssetId, FungibleAssetPrice>> =>
        this.#executeBatchFetch(assetIds),
      freshnessTtlMs: options.priceFreshnessTtlMs ?? this.#pollInterval,
    });
  }

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Get the middleware for enriching responses with price data.
   *
   * This middleware:
   * 1. Selects response balances that still need a price.
   *    {@link getUnpricedResponseAssetIds} skips hidden, non-priceable, and
   *    already-priced assets, and assets on chains the Price API does not support
   * 2. Fetches those prices. A price asked for within the freshness window is
   *    skipped, unless the request forces an update
   * 3. Merges fetched prices into the response and continues the chain. A
   *    failed fetch leaves the response balances unchanged
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['price'], async (ctx, next) => {
      const { response, request } = ctx;
      const unpricedAssetIds = await getUnpricedResponseAssetIds({
        state: this.#getAssetsState(),
        response,
        getSupportedNetworks: () => this.#getSupportedNetworks(),
      });
      if (unpricedAssetIds.length === 0) {
        return next(ctx);
      }

      if (request.forceUpdate) {
        this.#deduper.invalidateKeys(unpricedAssetIds);
      }

      try {
        const spotPrices = await this.#fetchSpotPrices(unpricedAssetIds);
        response.assetsPrice = {
          ...(response.assetsPrice ?? {}),
          ...spotPrices,
        };
      } catch (error) {
        log('Failed to fetch prices via middleware', { error });
      }

      // Call next() at the end to continue the middleware chain
      return next(ctx);
    });
  }

  /**
   * Fetch spot prices for an explicit asset list, bypassing the freshness cache.
   *
   * @param assetIds - CAIP-19 asset IDs to price.
   * @returns Prices keyed by asset ID. Empty when none are priceable or supported.
   */
  async fetchAssetPrices(
    assetIds: Caip19AssetId[],
  ): Promise<Record<Caip19AssetId, FungibleAssetPrice>> {
    const supportedAssetIds =
      await this.#filterToSupportedPriceableAssets(assetIds);
    if (supportedAssetIds.length === 0) {
      return {};
    }

    this.#deduper.invalidateKeys(supportedAssetIds);
    return this.#fetchSpotPrices(supportedAssetIds);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Fetch spot prices for a single batch of asset IDs (must be ≤ PRICE_API_BATCH_SIZE).
   *
   * @param assetIds - Array of CAIP-19 asset IDs (already within batch size limit).
   * @param selectedCurrency - The user's selected display currency.
   * @returns Raw spot-prices responses for the selected currency and USD.
   */
  async #fetchSpotPricesBatch(
    assetIds: string[],
    selectedCurrency: SupportedCurrency,
  ): Promise<{
    selectedCurrencyPrices: V3SpotPricesResponse;
    usdPrices: V3SpotPricesResponse;
  }> {
    if (selectedCurrency === 'usd') {
      const selectedCurrencyPrices = await fetchWithTimeout(
        () =>
          this.#apiClient.prices.fetchV3SpotPrices(assetIds, {
            currency: selectedCurrency,
            includeMarketData: true,
          }),
        this.#fetchTimeoutMs,
      );
      return { selectedCurrencyPrices, usdPrices: selectedCurrencyPrices };
    }

    const [selectedCurrencyPrices, usdPrices] = await Promise.all([
      fetchWithTimeout(
        () =>
          this.#apiClient.prices.fetchV3SpotPrices(assetIds, {
            currency: selectedCurrency,
            includeMarketData: true,
          }),
        this.#fetchTimeoutMs,
      ),
      fetchWithTimeout(
        () =>
          this.#apiClient.prices.fetchV3SpotPrices(assetIds, {
            currency: 'usd',
            includeMarketData: true,
          }),
        this.#fetchTimeoutMs,
      ),
    ]);

    return { selectedCurrencyPrices, usdPrices };
  }

  /**
   * Execute the actual batched API call for a set of asset IDs and return
   * parsed price results. Used as the `fetchBatch` callback for the deduper,
   * so it does NOT check freshness or inflight state — that is handled by
   * {@link DedupingBatchFetcher}.
   *
   * @param assetIds - Asset IDs to fetch (already filtered/deduplicated).
   * @returns Parsed prices keyed by CAIP-19 asset ID.
   */
  async #executeBatchFetch(
    assetIds: Caip19AssetId[],
  ): Promise<Record<Caip19AssetId, FungibleAssetPrice>> {
    const selectedCurrency = this.#getSelectedCurrency();

    type BatchResult = {
      selectedCurrencyPrices: V3SpotPricesResponse;
      usdPrices: V3SpotPricesResponse;
    };

    const batchResults = await reduceInBatchesSerially<string, BatchResult[]>({
      values: assetIds,
      batchSize: PRICE_API_BATCH_SIZE,
      eachBatch: async (workingResult, batch) => {
        const result = await this.#fetchSpotPricesBatch(
          batch,
          selectedCurrency,
        );
        return [...(workingResult as BatchResult[]), result];
      },
      initialResult: [],
    });

    const fetchedAt = Date.now();
    const prices: Record<Caip19AssetId, FungibleAssetPrice> = {};

    for (const { selectedCurrencyPrices, usdPrices } of batchResults) {
      for (const [assetId, marketData] of Object.entries(
        selectedCurrencyPrices,
      )) {
        const usdMarketData = usdPrices[assetId];

        if (
          !isValidMarketData(marketData) ||
          !isValidMarketData(usdMarketData)
        ) {
          continue;
        }

        prices[assetId as Caip19AssetId] = {
          ...marketData,
          assetPriceType: 'fungible',
          usdPrice: usdMarketData.price,
          lastUpdated: fetchedAt,
        };
      }
    }

    return prices;
  }

  /**
   * Fetch spot prices for all provided asset IDs, deduplicating via the
   * deduper (freshness TTL + per-asset inflight coalescing).
   *
   * @param assetIds - Array of CAIP-19 asset IDs.
   * @returns Spot prices response (only contains entries for assets that were
   * actually fetched or joined from inflight).
   */
  async #fetchSpotPrices(
    assetIds: Caip19AssetId[],
  ): Promise<Record<Caip19AssetId, FungibleAssetPrice>> {
    return this.#deduper.fetch(assetIds);
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
      return [
        ...getAssetIdsForPriceFetch({
          state: this.#getAssetsState(),
          request,
        }),
      ];
    } catch (error) {
      log('Failed to get asset IDs from balance state', { error });
      return [];
    }
  }

  /**
   * Drop non-priceable assets, then assets on chains the price API does not
   * support. An empty supported-network set keeps every priceable asset.
   *
   * @param assetIds - Candidate CAIP-19 asset IDs.
   * @returns Priceable IDs on a supported chain.
   */
  async #filterToSupportedPriceableAssets(
    assetIds: Caip19AssetId[],
  ): Promise<Caip19AssetId[]> {
    const priceableAssetIds = assetIds.filter(isPriceableAsset);
    if (priceableAssetIds.length === 0) {
      return [];
    }

    const supportedNetworks = await this.#getSupportedNetworks();
    return this.#filterAssetsByNetwork(priceableAssetIds, supportedNetworks);
  }

  /**
   * Price API networks supported by the v3 spot-prices endpoint
   * (`fullSupport` plus `partialSupport.spotPricesV3`).
   *
   * @returns CAIP-2 chain IDs; empty on error.
   */
  async #getSupportedNetworks(): Promise<Set<string>> {
    try {
      const response = await fetchWithTimeout(
        (): Promise<PriceV2SupportedNetworksResponse> =>
          this.#apiClient.prices.fetchPriceV2SupportedNetworks(),
        this.#fetchTimeoutMs,
      );

      return getV3SpotPriceSupportedChainIds(response);
    } catch (error) {
      log('Failed to fetch price supported networks', { error });
      return new Set();
    }
  }

  /**
   * Keeps asset IDs whose chain is in `supportedNetworks`.
   *
   * @param assetIds - CAIP-19 asset IDs.
   * @param supportedNetworks - Supported CAIP-2 chain IDs.
   * @returns Matching IDs, or all IDs if the set is empty.
   */
  #filterAssetsByNetwork(
    assetIds: Caip19AssetId[],
    supportedNetworks: Set<string>,
  ): Caip19AssetId[] {
    return filterAssetsBySupportedNetworks(assetIds, supportedNetworks);
  }

  // ============================================================================
  // FETCH
  // ============================================================================

  /**
   * Fetch prices for visible assets on the accounts and chains in the request:
   * saved balances and custom assets. Metadata with no balance is skipped.
   * Unlike the middleware, this includes assets that already have a stored
   * price so the poll can refresh them. The freshness cache skips recent ones.
   *
   * @param request - The data request specifying accounts and chains.
   * @returns DataResponse containing asset prices.
   */
  async fetch(request: DataRequest): Promise<DataResponse> {
    const response: DataResponse = {};

    const assetIds = await this.#filterToSupportedPriceableAssets(
      this.#getAssetIdsFromBalanceState(request),
    );
    if (assetIds.length === 0) {
      return response;
    }

    try {
      const spotPrices = await this.#fetchSpotPrices(assetIds);

      response.assetsPrice = {
        ...(response.assetsPrice ?? {}),
        ...spotPrices,
      };
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

    // Handle subscription update: refresh request and fetch immediately so
    // newly held / still-unpriced assets (e.g. seeded natives) do not wait
    // for the next poll tick. Deduper freshness TTL skips recently priced IDs.
    if (isUpdate) {
      const existing = this.#activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.request = request;
        existing.onAssetsUpdate = subscriptionRequest.onAssetsUpdate;

        try {
          const fetchResponse = await this.fetch(request);
          if (
            fetchResponse.assetsPrice &&
            Object.keys(fetchResponse.assetsPrice).length > 0
          ) {
            await existing.onAssetsUpdate({
              ...fetchResponse,
              updateMode: 'merge',
            });
          }
        } catch (error) {
          log('Subscription update fetch failed', { subscriptionId, error });
        }
        return;
      }
    }

    // Clean up existing subscription
    await this.unsubscribe(subscriptionId);

    const pollInterval = request.updateInterval ?? this.#pollInterval;

    // Cap the freshness TTL strictly below the effective poll interval.
    // `fetchedAt` is stamped when a fetch completes (slightly after the tick
    // that triggered it), so a TTL equal to the poll interval would leave the
    // asset still "fresh" at the next tick, making the subscription re-fetch
    // only every other poll. The margin also absorbs network latency / jitter.
    this.#deduper.freshnessTtlMs = Math.min(
      this.#deduper.freshnessTtlMs,
      Math.floor(pollInterval * FRESHNESS_TTL_POLL_RATIO),
    );

    // Create poll function - fetches prices using constructor getAssetsState.
    // The freshness TTL naturally gates re-fetches: assets fetched less than
    // `priceFreshnessTtlMs` ago are skipped, preventing duplicates when middleware
    // or other triggers already fetched the same assets between polls.
    // Concurrent middleware calls will join the inflight promise rather than
    // issuing duplicate requests.
    const pollFn = async (): Promise<void> => {
      try {
        const subscription = this.#activeSubscriptions.get(subscriptionId);
        if (!subscription) {
          return;
        }

        const fetchResponse = await this.fetch(subscription.request);

        // Only report if we got prices
        if (
          fetchResponse.assetsPrice &&
          Object.keys(fetchResponse.assetsPrice).length > 0
        ) {
          await subscription.onAssetsUpdate({
            ...fetchResponse,
            // merge overwrites existing spot prices on each poll; update would
            // seed-only and leave the first price forever.
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

    // Store subscription
    this.#activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        clearInterval(timer);
      },
      request,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
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
   * Invalidate the price freshness cache, forcing the next fetch to call the
   * API regardless of TTL. Use when external state changes (e.g. selected
   * currency) require a full refresh.
   */
  invalidatePriceCache(): void {
    this.#deduper.invalidate();
  }

  /**
   * Destroy the data source and clean up all subscriptions.
   */
  destroy(): void {
    for (const subscription of this.#activeSubscriptions.values()) {
      subscription.cleanup();
    }
    this.#activeSubscriptions.clear();
    this.#deduper.destroy();
  }
}
