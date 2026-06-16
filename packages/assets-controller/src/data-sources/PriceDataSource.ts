import type {
  SupportedCurrency,
  V3SpotPricesResponse,
} from '@metamask/core-backend';
import { ApiPlatformClient } from '@metamask/core-backend';
import { StaticIntervalPollingControllerOnly } from '@metamask/polling-controller';
import { parseCaipAssetType } from '@metamask/utils';

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
import { fetchWithTimeout } from '../utils';
import type { SubscriptionRequest } from './AbstractDataSource';
import { reduceInBatchesSerially } from './evm-rpc-services';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'PriceDataSource';
const DEFAULT_POLL_INTERVAL = 60_000; // 1 minute for price updates
const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/** Maximum number of asset IDs per Price API request. */
const PRICE_API_BATCH_SIZE = 100;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// TYPES
// ============================================================================

/** Input key for a single polling subscription. */
type PricePollingInput = {
  subscriptionId: string;
};

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
function isPriceableAsset(assetId: Caip19AssetId): boolean {
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
 * Extends StaticIntervalPollingControllerOnly — this is the single polling
 * instance driving all price updates. _executePoll is called on every tick
 * and is the only code path that fetches prices.
 *
 * The assetsMiddleware is a no-op pass-through; it no longer fetches prices
 * inline or schedules extra refreshes. All pricing comes from the poll.
 */
export class PriceDataSource extends StaticIntervalPollingControllerOnly<PricePollingInput>() {
  static readonly controllerName = CONTROLLER_NAME;

  getName(): string {
    return PriceDataSource.controllerName;
  }

  readonly #getSelectedCurrency: () => SupportedCurrency;

  /** ApiPlatformClient for cached API calls */
  readonly #apiClient: ApiPlatformClient;

  readonly #fetchTimeoutMs: number;

  /** Non-serialisable subscription state, keyed by subscriptionId. */
  readonly #activeSubscriptions: Map<
    string,
    {
      request: DataRequest;
      onAssetsUpdate: (response: DataResponse) => void | Promise<void>;
      getAssetsState?: () => AssetsControllerStateInternal;
    }
  > = new Map();

  /** Polling tokens issued by StaticIntervalPollingControllerOnly, for cleanup. */
  readonly #pollingTokens: Map<string, string> = new Map();

  constructor(options: PriceDataSourceOptions) {
    super();
    this.#getSelectedCurrency = options.getSelectedCurrency;
    this.#apiClient = options.queryApiClient;
    this.#fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.setIntervalLength(options.pollInterval ?? DEFAULT_POLL_INTERVAL);
  }

  // ============================================================================
  // POLLING
  // ============================================================================

  /**
   * Called by StaticIntervalPollingControllerOnly on every tick.
   * Fetches prices for all assets currently held by the subscription's accounts.
   *
   * @param input - Polling input containing the subscription ID.
   */
  async _executePoll(input: PricePollingInput): Promise<void> {
    const { subscriptionId } = input;
    const subscription = this.#activeSubscriptions.get(subscriptionId);
    if (!subscription) {
      return;
    }

    try {
      const fetchResponse = await this.fetch(
        subscription.request,
        subscription.getAssetsState,
      );

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
  }

  // ============================================================================
  // MIDDLEWARE
  // ============================================================================

  /**
   * Pass-through middleware — price fetching is handled entirely by the
   * StaticIntervalPollingControllerOnly poll (_executePoll). No inline fetches
   * or extra scheduling happen here; the pipeline simply continues.
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return forDataTypes(['price'], async (ctx, next) => next(ctx));
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
   * Fetch spot prices for all provided asset IDs, splitting into batches of
   * PRICE_API_BATCH_SIZE to respect API limits.
   *
   * @param assetIds - Array of CAIP-19 asset IDs
   * @returns Spot prices response
   */
  async #fetchSpotPrices(
    assetIds: string[],
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

        const caipAssetId = assetId as Caip19AssetId;
        prices[caipAssetId] = {
          ...marketData,
          assetPriceType: 'fungible',
          usdPrice: usdMarketData.price,
          lastUpdated: Date.now(),
        };
      }
    }

    return prices;
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
          if (accountFilter && !accountFilter.has(accountId)) {
            continue;
          }

          for (const assetId of Object.keys(
            accountBalances as Record<string, unknown>,
          )) {
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

    const rawAssetIds = this.#getAssetIdsFromBalanceState(
      request,
      getAssetsState,
    );

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
  // SUBSCRIBE / UNSUBSCRIBE
  // ============================================================================

  /**
   * Subscribe to price updates.
   * Stores subscription state and delegates polling to
   * StaticIntervalPollingControllerOnly via startPolling.
   *
   * @param subscriptionRequest - The subscription request configuration.
   */
  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    if (isUpdate) {
      const existing = this.#activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.request = request;
        return;
      }
    }

    await this.unsubscribe(subscriptionId);

    this.#activeSubscriptions.set(subscriptionId, {
      request,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
      getAssetsState: subscriptionRequest.getAssetsState,
    });

    // Allow the request to override the polling interval.
    if (request.updateInterval) {
      this.setIntervalLength(request.updateInterval);
    }

    // startPolling fires _executePoll immediately (setTimeout 0) then repeats
    // at the interval set by setIntervalLength in the constructor.
    const pollingToken = this.startPolling({ subscriptionId });
    this.#pollingTokens.set(subscriptionId, pollingToken);
  }

  /**
   * Unsubscribe from price updates.
   *
   * @param subscriptionId - The ID of the subscription to cancel.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const pollingToken = this.#pollingTokens.get(subscriptionId);
    if (pollingToken) {
      this.stopPollingByPollingToken(pollingToken);
      this.#pollingTokens.delete(subscriptionId);
    }
    this.#activeSubscriptions.delete(subscriptionId);
  }

  /**
   * Destroy the data source and clean up all subscriptions.
   */
  destroy(): void {
    this.stopAllPolling();
    this.#activeSubscriptions.clear();
    this.#pollingTokens.clear();
  }
}
