import type {
  SupportedCurrency,
  V3SpotPricesResponse,
} from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import { parseCaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../logger.js';
import { forDataTypes } from '../types.js';
import type {
  Caip19AssetId,
  DataRequest,
  DataResponse,
  FungibleAssetPrice,
  Middleware,
  AssetsControllerStateInternal,
} from '../types.js';
import { DedupingBatchFetcher } from '../utils/dedupingBatchFetcher.js';
import { fetchWithTimeout, normalizeAssetId } from '../utils/index.js';
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
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Asset reference patterns that should NOT be sent to the Price API.
 * These are internal resource tracking values without market prices.
 */
const NON_PRICEABLE_ASSET_PATTERNS = [
  // Synthetic slip44 staking-position assets: the Price API only knows about
  // pure numeric coin-type references (e.g. slip44:195). Any suffix after the
  // number (e.g. slip44:195-ready-for-withdrawal, slip44:195-in-lock-period,
  // slip44:195-staking-rewards, slip44:195-staked-for-…) is a MetaMask-internal
  // synthetic asset that has no market price.
  /\/slip44:\d+-/u,
  // Tron non-price resource assets (bandwidth, energy)
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
export function isPriceableAsset(assetId: Caip19AssetId): boolean {
  return !NON_PRICEABLE_ASSET_PATTERNS.some((pattern) => pattern.test(assetId));
}

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

  readonly #fetchTimeoutMs: number;

  /**
   * Deduplicates price fetches by asset ID: skips assets fetched within the
   * freshness TTL and joins concurrent in-flight fetches for the same asset so
   * overlapping triggers (middleware + subscription poll) don't issue duplicate
   * API requests.
   */
  readonly #deduper: DedupingBatchFetcher<Caip19AssetId, FungibleAssetPrice>;

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
    this.#fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
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

      const statePrices = (ctx.getAssetsState()?.assetsPrice ?? {}) as Record<
        string,
        FungibleAssetPrice
      >;

      const assetIds = new Set<Caip19AssetId>();

      for (const assetId of request.assetsForPriceUpdate ?? []) {
        assetIds.add(assetId);
      }

      // Detected assets only need a price fetch when state has none yet.
      // Explicit assetsForPriceUpdate (e.g. currency change) are always fetched.
      for (const detectedAccountAssets of Object.values(
        response.detectedAssets ?? {},
      )) {
        for (const assetId of detectedAccountAssets) {
          const normalizedAssetId = normalizeAssetId(assetId);
          const alreadyQueued = request.assetsForPriceUpdate?.some(
            (queuedId) =>
              queuedId === assetId || queuedId === normalizedAssetId,
          );
          if (
            statePrices[assetId] === undefined &&
            statePrices[normalizedAssetId] === undefined &&
            !alreadyQueued
          ) {
            assetIds.add(normalizedAssetId);
          }
        }
      }

      if (assetIds.size === 0) {
        return next(ctx);
      }

      // Filter to only priceable assets
      const priceableAssetIds = [...assetIds].filter(isPriceableAsset);

      if (priceableAssetIds.length === 0) {
        return next(ctx);
      }

      if (request.forceUpdate) {
        this.#deduper.invalidateKeys(priceableAssetIds);
      }

      try {
        const spotPrices = await this.#fetchSpotPrices(priceableAssetIds);
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
      const spotPrices = await this.#fetchSpotPrices([...assetIds]);

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
        existing.getAssetsState = subscriptionRequest.getAssetsState;

        try {
          const fetchResponse = await this.fetch(
            request,
            subscriptionRequest.getAssetsState,
          );
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

    // Create poll function - fetches prices using getAssetsState from subscription.
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
