/**
 * AggregatedPerpsProvider - Multi-provider aggregation wrapper
 *
 * Implements PerpsProvider interface to enable seamless multi-provider support.
 * Aggregates read operations from all providers, routes write operations to specific
 * providers based on params.providerId or default provider.
 *
 * Phase 1 Implementation:
 * - Read operations: Aggregate from all providers using Promise.allSettled()
 * - Write operations: Route to params.providerId ?? defaultProvider
 * - Subscriptions: Multiplex via SubscriptionMultiplexer
 * - Lifecycle: Delegate to default provider
 *
 * All returned data includes providerId field for UI differentiation.
 */

import type { CaipAccountId } from '@metamask/utils';

import { SubscriptionMultiplexer } from '../aggregation/SubscriptionMultiplexer.js';
import { PERPS_CONSTANTS } from '../constants/perpsConfig.js';
import { createTpslLegReplaceUnsupportedError } from '../errors.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import { ProviderRouter } from '../routing/ProviderRouter.js';
import { isProviderOnTestnet } from '../services/providerNetwork.js';
import { WebSocketConnectionState } from '../types/index.js';
import type {
  AccountState,
  AggregatedProviderConfig,
  AggregationMode,
  AssetRoute,
  BatchCancelOrdersParams,
  CancelOrderParams,
  CancelOrderResult,
  CancelOrdersResult,
  ChaseOrder,
  GetChaseOrderOwnershipParams,
  ReconcileChaseOrderCancellationParams,
  ReconcileChaseOrderCancellationResult,
  PerpsChaseOrderOwnership,
  ClosePositionParams,
  ClosePositionsParams,
  ClosePositionsResult,
  DepositParams,
  DisconnectResult,
  EditOrderParams,
  FeeCalculationParams,
  FeeCalculationResult,
  Funding,
  GetAccountStateParams,
  GetAccountSupportParams,
  GetAvailableDexsParams,
  GetFundingParams,
  GetHistoricalPortfolioParams,
  GetMarketsParams,
  GetOrderCapabilitiesParams,
  GetMarginModeLockParams,
  GetScalePriceLadderParams,
  GetOrderFillsParams,
  GetPublicTradesParams,
  GetOrdersParams,
  GetOrFetchFillsParams,
  GetPositionsParams,
  GetSupportedPathsParams,
  HistoricalPortfolioResult,
  InitializeResult,
  PerpsPlatformDependencies,
  PerpsProvider,
  PerpsProviderAccountStateEntry,
  LiquidationPriceParams,
  LiveDataConfig,
  MaintenanceMarginParams,
  PositionModifyPreviewParams,
  PositionModifyPreviewResult,
  MarginResult,
  MarketInfo,
  Order,
  OrderFill,
  PublicTrade,
  OrderParams,
  OrderResult,
  PerpsMarketData,
  PerpsAccountSupport,
  PerpsOrderCapabilities,
  PerpsMarginModeLock,
  PerpsScalePriceLadder,
  PerpsPendingManualRecovery,
  PerpsRecoveredDispatch,
  AttachedOrderGroup,
  PerpsRecoveryVenueReview,
  ScaleOrderGroup,
  ResolveRecoveryProtectionParams,
  PerpsRecoveryProtectionResult,
  PerpsProviderType,
  Position,
  ReadyToTradeResult,
  SubscribeAccountParams,
  SubscribeCandlesParams,
  SubscribeOICapsParams,
  SubscribeAvailableToTradeParams,
  SubscribeOrderBookParams,
  SubscribeOrderFillsParams,
  SubscribeOrdersParams,
  SubscribeTwapOrdersParams,
  SubscribePositionsParams,
  SubscribePricesParams,
  SubscribePublicTradesParams,
  ToggleTestnetResult,
  TwapOrder,
  UpdateMarginParams,
  UpdatePositionTPSLParams,
  ReplacePositionTPSLLegParams,
  UserHistoryItem,
  WithdrawParams,
  WithdrawResult,
  RawLedgerUpdate,
  PerpsReadOptions,
  PerpsFeeResolution,
} from '../types/index.js';
import { buildAggregatedAccountState } from '../utils/accountAggregation.js';
import { ensureError } from '../utils/errorUtils.js';

/** Error returned when only some providers suspend their Chase orders. */
export class ChaseOrderSuspensionError extends Error {
  readonly suspendedOrders: ChaseOrder[];

  readonly failures: { providerId: PerpsProviderType; reason: unknown }[];

  constructor(options: {
    suspendedOrders: ChaseOrder[];
    failures: { providerId: PerpsProviderType; reason: unknown }[];
  }) {
    const failedProviderIds = options.failures
      .map(({ providerId }) => providerId)
      .join(', ');
    super(`Failed to suspend Chase orders for: ${failedProviderIds}`);
    this.name = 'ChaseOrderSuspensionError';
    this.suspendedOrders = options.suspendedOrders;
    this.failures = options.failures;
  }
}

/**
 * A stream whose venue is chosen by the aggregated default.
 *
 * `setDefaultProvider` re-opens these on the new venue, so a stream started
 * before a default change does not keep feeding the previous venue's data.
 */
type DefaultRoutedSubscription = {
  /** Opens the stream on the given provider, returning its cleanup. */
  open: (provider: PerpsProvider) => () => void;
  /** Cleanup for the stream currently open. */
  unsubscribe: () => void;
  /** Invalidate a consumer's cached value before the stream moves. */
  onInvalidate?: () => void;
  /** Venue the stream is currently open on; undefined when not open. */
  providerId: PerpsProviderType | undefined;
  /** True when the last open attempt threw. */
  failed: boolean;
};

/**
 * AggregatedPerpsProvider implements PerpsProvider by coordinating
 * multiple backend providers.
 *
 * Design principles:
 * 1. Read operations aggregate from all providers (parallel)
 * 2. Write operations route to specific provider (explicit > default)
 * 3. Lifecycle operations delegate to default provider
 * 4. All returned data includes providerId for UI differentiation
 *
 * @example
 * ```typescript
 * const aggregated = new AggregatedPerpsProvider({
 *   providers: new Map([
 *     ['hyperliquid', hlProvider],
 *     ['lighter', lighterProvider],
 *   ]),
 *   defaultProvider: 'hyperliquid',
 *   infrastructure: deps,
 * });
 *
 * // Read: returns positions from all providers
 * const positions = await aggregated.getPositions();
 *
 * // Write: routes to specific or default provider
 * await aggregated.placeOrder({ symbol: 'BTC', providerId: 'lighter', ... });
 * ```
 */
export class AggregatedPerpsProvider implements PerpsProvider {
  readonly protocolId = 'aggregated';

  readonly routesOrdersByProviderId = true;

  readonly #providers: Map<PerpsProviderType, PerpsProvider>;

  /** Default provider used when an operation does not name a venue. */
  #defaultProvider: PerpsProviderType;

  readonly #aggregationMode: AggregationMode;

  readonly #deps: PerpsPlatformDependencies;

  readonly #isTestnet: boolean | undefined;

  readonly #router: ProviderRouter;

  readonly #subscriptionMux: SubscriptionMultiplexer;

  /** Streams that follow the routing default and must move with it. */
  readonly #defaultRoutedSubscriptions = new Set<DefaultRoutedSubscription>();

  constructor(config: AggregatedProviderConfig) {
    this.#providers = config.providers;
    this.#defaultProvider = config.defaultProvider;
    this.#aggregationMode = config.aggregationMode ?? 'all';
    this.#deps = config.infrastructure;
    this.#isTestnet = config.isTestnet;

    // Initialize router with default provider
    this.#router = new ProviderRouter({
      defaultProvider: this.#defaultProvider,
    });

    // Initialize subscription multiplexer with logger for error reporting
    this.#subscriptionMux = new SubscriptionMultiplexer({
      logger: this.#deps.logger,
    });

    this.#deps.debugLogger.log('[AggregatedPerpsProvider] Initialized', {
      providers: Array.from(this.#providers.keys()),
      defaultProvider: this.#defaultProvider,
      aggregationMode: this.#aggregationMode,
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get list of active providers as tuples for iteration.
   * Returns array of [providerId, provider] pairs.
   *
   * @returns The result of the operation.
   */
  #getActiveProviders(): [PerpsProviderType, PerpsProvider][] {
    return Array.from(this.#providers.entries());
  }

  /**
   * Get the default provider instance.
   * Throws if default provider is not available.
   *
   * @returns The result of the operation.
   */
  #getDefaultProvider(): PerpsProvider {
    const provider = this.#providers.get(this.#defaultProvider);
    if (!provider) {
      throw new Error(
        `[AggregatedPerpsProvider] Default provider '${this.#defaultProvider}' not available`,
      );
    }
    return provider;
  }

  /**
   * Which provider a write with this route actually reaches.
   *
   * `protocolId` is `aggregated` and `getPositions` spans every active
   * provider, so a caller that needs to reason about one write — pricing the
   * positions a close can actually touch, for instance — cannot infer the route
   * from either. This reports it explicitly.
   *
   * @param providerId - Explicit route, or undefined for the default.
   * @returns The provider id the write will be submitted through.
   */
  getWriteProviderId(providerId?: PerpsProviderType): PerpsProviderType {
    return providerId ?? this.#defaultProvider;
  }

  /**
   * Change the default provider used when an operation does not name a venue.
   *
   * Only the routing default changes: no provider is re-initialized and no
   * stream is reconnected, so the call is synchronous.
   *
   * @param providerId - New default provider. Must be registered.
   * @throws If the provider is not registered.
   */
  setDefaultProvider(providerId: PerpsProviderType): void {
    if (!this.#providers.has(providerId)) {
      throw new Error(
        `[AggregatedPerpsProvider] Default provider '${providerId}' not available`,
      );
    }
    const changed = providerId !== this.#defaultProvider;
    if (changed) {
      this.#defaultProvider = providerId;
      this.#router.setDefaultProvider(providerId);
    }

    // Runs even when the default is unchanged so a stream that failed to
    // re-open earlier is retried instead of staying detached.
    this.#rerouteDefaultSubscriptions();

    if (changed) {
      this.#deps.debugLogger.log(
        '[AggregatedPerpsProvider] Default provider changed',
        { defaultProvider: providerId },
      );
    }
  }

  /**
   * Register a stream that follows the routing default.
   *
   * The returned cleanup detaches the stream from whichever venue it is
   * currently open on, so it stays valid across a default change.
   *
   * @param options - Stream options.
   * @param options.open - Opens the stream on a given provider.
   * @param options.onInvalidate - Invalidates a consumer's cached value before
   * the stream moves (for example, emits an unavailable account snapshot).
   * @returns A cleanup function that closes the stream.
   */
  #trackDefaultRoutedSubscription(options: {
    open: (provider: PerpsProvider) => () => void;
    onInvalidate?: () => void;
  }): () => void {
    const subscription: DefaultRoutedSubscription = {
      open: options.open,
      onInvalidate: options.onInvalidate,
      unsubscribe: () => undefined,
      providerId: this.#defaultProvider,
      failed: false,
    };
    // Initial open failures propagate to the caller, matching the previous
    // contract for these subscribe methods.
    subscription.unsubscribe = options.open(this.#getDefaultProvider());
    this.#defaultRoutedSubscriptions.add(subscription);

    return () => {
      if (!this.#defaultRoutedSubscriptions.delete(subscription)) {
        return;
      }
      subscription.unsubscribe();
    };
  }

  /**
   * Move every default-routed stream to the current default venue.
   *
   * Only the stream's subscription is torn down and re-opened; the venue
   * transports stay connected. The caller's cleanup function keeps working.
   */
  #rerouteDefaultSubscriptions(): void {
    if (this.#defaultRoutedSubscriptions.size === 0) {
      return;
    }
    const target = this.#defaultProvider;
    for (const subscription of this.#defaultRoutedSubscriptions) {
      if (!subscription.failed && subscription.providerId === target) {
        continue;
      }
      this.#rerouteSubscription(subscription);
    }
  }

  /**
   * Re-open one stream on the current default, isolating its failure from the
   * other subscriptions. A stream that throws is marked failed and retried on
   * the next `setDefaultProvider` call.
   *
   * @param subscription - The stream to move.
   */
  #rerouteSubscription(subscription: DefaultRoutedSubscription): void {
    const providerId = this.#defaultProvider;
    const { unsubscribe } = subscription;
    subscription.unsubscribe = (): void => undefined;
    try {
      unsubscribe();
    } catch (caughtError) {
      this.#logSubscriptionRerouteError(caughtError, 'unsubscribe', providerId);
    }
    subscription.providerId = undefined;

    if (subscription.onInvalidate) {
      try {
        subscription.onInvalidate();
      } catch (caughtError) {
        this.#logSubscriptionRerouteError(
          caughtError,
          'onInvalidate',
          providerId,
        );
      }
    }

    try {
      subscription.unsubscribe = subscription.open(this.#getDefaultProvider());
      subscription.providerId = providerId;
      subscription.failed = false;
    } catch (caughtError) {
      subscription.failed = true;
      this.#logSubscriptionRerouteError(caughtError, 'open', providerId);
    }
  }

  /**
   * Report a default-routed subscription that could not be moved.
   *
   * @param caughtError - The thrown error.
   * @param method - Which step failed.
   * @param providerId - The venue the stream was moving to.
   */
  #logSubscriptionRerouteError(
    caughtError: unknown,
    method: string,
    providerId: PerpsProviderType,
  ): void {
    this.#deps.logger.error(
      ensureError(caughtError, 'AggregatedPerpsProvider.rerouteSubscription'),
      {
        tags: {
          feature: PERPS_CONSTANTS.FeatureName,
          provider: providerId,
        },
        context: {
          name: 'AggregatedPerpsProvider',
          data: { method: `subscription.${method}`, providerId },
        },
      },
    );
  }

  /**
   * Get the explicit provider, or the default when no route was supplied.
   *
   * @param providerId - The provider id value.
   * @returns The selected provider id and instance.
   * @throws If an explicit provider is not registered.
   */
  #getProviderOrDefault(
    providerId?: PerpsProviderType,
  ): [PerpsProviderType, PerpsProvider] {
    if (providerId === undefined) {
      return [this.#defaultProvider, this.#getDefaultProvider()];
    }

    const provider = this.#providers.get(providerId);
    if (!provider) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
    }
    return [providerId, provider];
  }

  /**
   * Extract successful results from Promise.allSettled.
   * Logs errors for failed promises.
   *
   * @param results - Results from Promise.allSettled
   * @param context - Context string for logging
   * @returns Array of successful values
   */
  #extractSuccessfulResults<TResult>(
    results: PromiseSettledResult<TResult>[],
    context: string,
  ): TResult[] {
    const successful: TResult[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        this.#deps.debugLogger.log(
          `[AggregatedPerpsProvider] ${context} failed for provider ${index}`,
          { error: result.reason },
        );
      }
    });
    return successful;
  }

  // ============================================================================
  // Asset Routes (Synchronous - delegate to default provider)
  // ============================================================================

  getDepositRoutes(params?: GetSupportedPathsParams): AssetRoute[] {
    // Routes name the venue that actually settles the movement: identical
    // asset/chain routes from different venues are distinct entries and are
    // never collapsed.
    return this.#getActiveProviders().flatMap(([providerId, provider]) =>
      provider
        .getDepositRoutes(params)
        .map((route) => ({ ...route, providerId })),
    );
  }

  getWithdrawalRoutes(params?: GetSupportedPathsParams): AssetRoute[] {
    return this.#getActiveProviders().flatMap(([providerId, provider]) =>
      provider
        .getWithdrawalRoutes(params)
        .map((route) => ({ ...route, providerId })),
    );
  }

  /**
   * Route account support through the same explicit-provider/default-provider
   * selection used by writes.
   *
   * @param params - Optional provider route.
   * @returns The selected provider's account support result.
   */
  async getAccountSupport(
    params?: GetAccountSupportParams,
  ): Promise<PerpsAccountSupport> {
    const [, provider] = this.#getProviderOrDefault(params?.providerId);
    return provider.getAccountSupport
      ? provider.getAccountSupport(params)
      : { isSupported: true };
  }

  /**
   * Resolve capabilities with the same explicit-provider/default-provider
   * selection used by order placement. Unknown routes return a typed
   * unavailable result instead of throwing a placement error.
   *
   * @param params - Market and optional provider route.
   * @returns Capabilities from the selected provider.
   */
  async getOrderCapabilities(
    params: GetOrderCapabilitiesParams,
  ): Promise<PerpsOrderCapabilities> {
    const providerId = params.providerId ?? this.#defaultProvider;
    const provider = this.#providers.get(providerId);
    if (!provider) {
      return {
        status: 'unavailable',
        providerId,
        reason: 'provider_not_found',
      };
    }
    if (!provider.getOrderCapabilities) {
      return { status: 'unavailable', providerId, reason: 'not_implemented' };
    }
    try {
      const capabilities = await provider.getOrderCapabilities({
        ...params,
        providerId,
      });
      if (
        capabilities.providerId !== undefined &&
        capabilities.providerId !== providerId
      ) {
        return {
          status: 'unavailable',
          providerId,
          reason: 'provider_not_routable',
        };
      }
      return { ...capabilities, providerId };
    } catch (error) {
      this.#deps.debugLogger.log(
        '[AggregatedPerpsProvider] Order capabilities unavailable',
        {
          providerId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {
        status: 'unavailable',
        providerId,
        reason: 'provider_unavailable',
      };
    }
  }

  /**
   * Resolve the margin-mode lock with the same explicit-provider/default-
   * provider selection used by order placement.
   *
   * @param params - Market and optional provider route.
   * @returns The lock reported by the selected provider.
   */
  async getMarginModeLock(
    params: GetMarginModeLockParams,
  ): Promise<PerpsMarginModeLock> {
    const providerId = params.providerId ?? this.#defaultProvider;
    const provider = this.#providers.get(providerId);
    if (!provider) {
      return {
        status: 'unavailable',
        providerId,
        reason: 'provider_not_found',
      };
    }
    if (!provider.getMarginModeLock) {
      return { status: 'unavailable', providerId, reason: 'not_implemented' };
    }
    try {
      const lock = await provider.getMarginModeLock({ ...params, providerId });
      if (lock.providerId !== undefined && lock.providerId !== providerId) {
        return {
          status: 'unavailable',
          providerId,
          reason: 'provider_not_routable',
        };
      }
      return { ...lock, providerId };
    } catch (error) {
      this.#deps.debugLogger.log(
        '[AggregatedPerpsProvider] Margin mode lock unavailable',
        {
          providerId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return {
        status: 'unavailable',
        providerId,
        reason: 'provider_unavailable',
      };
    }
  }

  /**
   * Normalize a Scale price ladder through the selected provider route.
   *
   * @param params - Market, ladder bounds, count, optional sizing and explicit route.
   * @returns Provider-normalized prices with sizingPreview when supported, or a typed unavailable result.
   * @throws When bounds or sizing violate the provider's venue rules.
   */
  async getScalePriceLadder(
    params: GetScalePriceLadderParams,
  ): Promise<PerpsScalePriceLadder> {
    const providerId = params.providerId ?? this.#defaultProvider;
    const provider = this.#providers.get(providerId);
    if (!provider) {
      return {
        status: 'unavailable',
        providerId,
        reason: 'provider_not_found',
      };
    }
    if (!provider.getScalePriceLadder) {
      return { status: 'unavailable', providerId, reason: 'not_implemented' };
    }
    const result = await provider.getScalePriceLadder({
      ...params,
      providerId,
    });
    if (result.providerId !== undefined && result.providerId !== providerId) {
      return {
        status: 'unavailable',
        providerId,
        reason: 'provider_not_routable',
      };
    }
    return { ...result, providerId };
  }

  // ============================================================================
  // Read Operations (Aggregate from all providers)
  // ============================================================================

  async getPositions(params?: GetPositionsParams): Promise<Position[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const positions = await provider.getPositions(params);
        return positions.map((pos) => ({ ...pos, providerId: id }));
      }),
    );

    return this.#extractSuccessfulResults(results, 'getPositions').flat();
  }

  async getAccountState(params?: GetAccountStateParams): Promise<AccountState> {
    // Single-venue aggregation (for example a fallback when one venue failed
    // to load) keeps the direct result shape: there is nothing to combine and
    // no completeness question to answer.
    if (this.#providers.size === 1) {
      const [[providerId, provider]] = this.#getActiveProviders();
      const state = await provider.getAccountState(params);
      return { ...state, providerId };
    }

    // Capture each entry's venue before awaiting: `setDefaultProvider` and
    // `addProvider` can run while requests are in flight, and a response must
    // stay attributed to the provider that actually served it.
    const activeProviders = this.#getActiveProviders();
    const results = await Promise.allSettled(
      activeProviders.map(async ([providerId, provider]) => {
        const state = await provider.getAccountState(params);
        const entry: PerpsProviderAccountStateEntry = {
          status: 'available',
          state: { ...state, providerId },
          providerId,
        };
        return entry;
      }),
    );

    const entries: PerpsProviderAccountStateEntry[] = [];
    const failures: { providerId: PerpsProviderType; reason: unknown }[] = [];
    results.forEach((result, index) => {
      const [providerId] = activeProviders[index];
      if (result.status === 'fulfilled') {
        entries.push(result.value);
      } else {
        failures.push({ providerId, reason: result.reason });
        entries.push({
          status: 'unavailable',
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          providerId,
        });
      }
    });

    if (failures.length > 0) {
      this.#deps.debugLogger.log(
        '[AggregatedPerpsProvider] getAccountState partial failure',
        {
          failedProviders: failures.map((failure) => failure.providerId),
        },
      );
    }

    // No venue reported usable data: refuse to manufacture an all-zero
    // successful total. The first failure is the most specific cause.
    if (entries.every((entry) => entry.status === 'unavailable')) {
      const firstFailure = failures[0]?.reason;
      throw firstFailure instanceof Error
        ? firstFailure
        : new Error(
            failures
              .map(
                (failure) => `${failure.providerId}: ${String(failure.reason)}`,
              )
              .join('; ') || 'No perps provider reported an account state',
          );
    }

    return buildAggregatedAccountState({ entries }) as AccountState;
  }

  async getMarkets(params?: GetMarketsParams): Promise<MarketInfo[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const markets = await provider.getMarkets(params);
        return markets.map((market) => ({ ...market, providerId: id }));
      }),
    );

    const allMarkets = this.#extractSuccessfulResults(
      results,
      'getMarkets',
    ).flat();

    // Deduplicate markets by name (keep first occurrence)
    const seen = new Set<string>();
    return allMarkets.filter((market) => {
      // Use providerId:name as unique key to allow same market from different providers
      const key = `${market.providerId}:${market.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  async getMarketDataWithPrices(): Promise<PerpsMarketData[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const data = await provider.getMarketDataWithPrices();
        return data.map((item) => ({ ...item, providerId: id }));
      }),
    );

    return this.#extractSuccessfulResults(
      results,
      'getMarketDataWithPrices',
    ).flat();
  }

  async getOrderFills(
    params?: GetOrderFillsParams,
    options?: PerpsReadOptions,
  ): Promise<OrderFill[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const fills = await provider.getOrderFills(params, options);
        return fills.map((fill) => ({ ...fill, providerId: id }));
      }),
    );

    return this.#extractSuccessfulResults(results, 'getOrderFills').flat();
  }

  async getOrFetchFills(params?: GetOrFetchFillsParams): Promise<OrderFill[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const fills = await provider.getOrFetchFills(params);
        return fills.map((fill) => ({ ...fill, providerId: id }));
      }),
    );

    return this.#extractSuccessfulResults(results, 'getOrFetchFills').flat();
  }

  async getOrders(
    params?: GetOrdersParams,
    options?: PerpsReadOptions,
  ): Promise<Order[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const orders = await provider.getOrders(params, options);
        return orders.map((order) => ({ ...order, providerId: id }));
      }),
    );

    return this.#extractSuccessfulResults(results, 'getOrders').flat();
  }

  async getOpenOrders(params?: GetOrdersParams): Promise<Order[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const orders = await provider.getOpenOrders(params);
        return orders.map((order) => ({ ...order, providerId: id }));
      }),
    );

    return this.#extractSuccessfulResults(results, 'getOpenOrders').flat();
  }

  async getFunding(
    params?: GetFundingParams,
    options?: PerpsReadOptions,
  ): Promise<Funding[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([_providerId, provider]) => {
        const funding = await provider.getFunding(params, options);
        // Funding type doesn't have providerId - we could add it if needed
        return funding;
      }),
    );

    return this.#extractSuccessfulResults(results, 'getFunding').flat();
  }

  async getHistoricalPortfolio(
    params?: GetHistoricalPortfolioParams,
  ): Promise<HistoricalPortfolioResult> {
    // Delegate to default provider
    return this.#getDefaultProvider().getHistoricalPortfolio(params);
  }

  /**
   * Get user non-funding ledger updates from default provider.
   *
   * @param params - Optional parameters
   * @param params.accountId - Account ID to filter by
   * @param params.startTime - Start time filter
   * @param params.endTime - End time filter
   * @returns Raw ledger updates
   */
  async getUserNonFundingLedgerUpdates(params?: {
    accountId?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<RawLedgerUpdate[]> {
    // Delegate to default provider (protocol-specific)
    return this.#getDefaultProvider().getUserNonFundingLedgerUpdates(params);
  }

  /**
   * Resolve the currently selected CAIP account identifier. Accounts are
   * shared across sub-providers (same InternalAccountController), so the
   * default provider's view is authoritative.
   *
   * @returns Resolved CAIP account id from the default sub-provider.
   */
  async getCurrentAccountId(): Promise<CaipAccountId> {
    return this.#getDefaultProvider().getCurrentAccountId();
  }

  /**
   * Get user history from all providers.
   *
   * @param params - Optional parameters
   * @param params.accountId - Account ID to filter by
   * @param params.startTime - Start time filter
   * @param params.endTime - End time filter
   * @returns Aggregated user history with providerId
   */
  async getUserHistory(params?: {
    accountId?: CaipAccountId;
    startTime?: number;
    endTime?: number;
  }): Promise<UserHistoryItem[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([id, provider]) => {
        const history = await provider.getUserHistory(params);
        return history.map((item) => ({ ...item, providerId: id }));
      }),
    );

    return this.#extractSuccessfulResults(results, 'getUserHistory').flat();
  }

  // ============================================================================
  // Write Operations (Route to specific provider)
  // ============================================================================

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    const [providerId, provider] = this.#getProviderOrDefault(
      params.providerId,
    );

    this.#deps.debugLogger.log('[AggregatedPerpsProvider] placeOrder routing', {
      requestedProvider: params.providerId,
      actualProvider: providerId,
      symbol: params.symbol,
    });

    const result = await provider.placeOrder(params);
    return { ...result, providerId };
  }

  /**
   * Read TWAP lifecycle records from every active provider.
   *
   * @returns TWAP records with their provider route attached.
   */
  async getTwapOrders(): Promise<TwapOrder[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([providerId, provider]) =>
        provider.getTwapOrders
          ? (await provider.getTwapOrders()).map((order) => ({
              ...order,
              providerId,
            }))
          : [],
      ),
    );

    return this.#extractSuccessfulResults(results, 'getTwapOrders').flat();
  }

  /**
   * Read all available snapshots, retaining successful providers on a partial failure.
   *
   * @returns Chase snapshots from every provider that responded successfully.
   */
  async getChaseOrders(): Promise<ChaseOrder[]> {
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(async ([providerId, provider]) =>
        provider.getChaseOrders
          ? (await provider.getChaseOrders()).map((order) => ({
              ...order,
              providerId,
            }))
          : [],
      ),
    );

    return this.#extractSuccessfulResults(results, 'getChaseOrders').flat();
  }

  /**
   * Route a strict local ownership read once, without aggregating partial inventories.
   *
   * @param input - Exact stable handle and explicit provider route.
   * @returns That provider's durable history or an explicit unsupported result.
   */
  async getChaseOrderOwnership(
    input: GetChaseOrderOwnershipParams,
  ): Promise<PerpsChaseOrderOwnership> {
    const params = {
      ...input,
      owner: input.owner ? { ...input.owner } : undefined,
    };
    if (!params.providerId || !params.handle) {
      throw new Error(
        'Chase ownership requires an exact handle and explicit provider',
      );
    }
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    const ownership: PerpsChaseOrderOwnership = provider.getChaseOrderOwnership
      ? await provider.getChaseOrderOwnership(params)
      : {
          status: 'unsupported',
          providerId: params.providerId,
          handle: params.handle,
          reason: 'Durable Chase ownership is unavailable for this provider',
        };
    if (this.#providers.get(params.providerId) !== provider) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE);
    }
    return ownership;
  }

  /**
   * Route observation-only reconciliation to exactly one named provider.
   *
   * @param input - Original handle, owner, child and cancellation identity.
   * @returns Exact owning-provider settlement or unsupported, never ordinary cancel.
   */
  async reconcileChaseOrderCancellation(
    input: ReconcileChaseOrderCancellationParams,
  ): Promise<ReconcileChaseOrderCancellationResult> {
    const params = {
      ...input,
      owner: { ...input.owner },
      cancellation: { ...input.cancellation },
    };
    if (
      !params.providerId ||
      !params.handle ||
      !params.clientOrderId ||
      params.owner.providerId !== params.providerId
    ) {
      throw new Error(
        'Chase cancellation reconciliation requires an exact handle, child and matching owner/provider',
      );
    }
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    const ownership: ReconcileChaseOrderCancellationResult =
      provider.reconcileChaseOrderCancellation
        ? await provider.reconcileChaseOrderCancellation(params)
        : {
            status: 'unsupported',
            providerId: params.providerId,
            handle: params.handle,
            reason:
              'Chase cancellation reconciliation is unavailable for this provider',
          };
    if (this.#providers.get(params.providerId) !== provider) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE);
    }
    return ownership;
  }

  /**
   * Attempt to suspend every provider and reject after all attempts settle if
   * any provider could not suspend safely. Successful providers remain
   * suspended, so callers may retry to reconcile a partial failure.
   *
   * @returns Chase snapshots after every provider suspends successfully.
   * @throws ChaseOrderSuspensionError if any active provider fails. The error
   * includes successful snapshots and each failed provider ID.
   */
  async suspendChaseOrders(): Promise<ChaseOrder[]> {
    const providers = this.#getActiveProviders();
    const results = await Promise.allSettled(
      providers.map(async ([providerId, provider]) =>
        provider.suspendChaseOrders
          ? (await provider.suspendChaseOrders()).map((order) => ({
              ...order,
              providerId,
            }))
          : [],
      ),
    );

    const snapshots: ChaseOrder[] = [];
    const failures: {
      providerId: PerpsProviderType;
      reason: unknown;
    }[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        snapshots.push(...result.value);
      } else {
        failures.push({
          providerId: providers[index][0],
          reason: result.reason,
        });
      }
    });
    if (failures.length > 0) {
      throw new ChaseOrderSuspensionError({
        suspendedOrders: snapshots,
        failures,
      });
    }
    return snapshots;
  }

  async editOrder(params: EditOrderParams): Promise<OrderResult> {
    // EditOrderParams contains OrderParams in newOrder which may have providerId
    const [providerId, provider] = this.#getProviderOrDefault(
      params.newOrder.providerId,
    );
    const result = await provider.editOrder(params);
    return { ...result, providerId };
  }

  async cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
    const [providerId, provider] = this.#getProviderOrDefault(
      params.providerId,
    );
    const result = await provider.cancelOrder(params);
    return { ...result, providerId };
  }

  async cancelOrders(
    params: BatchCancelOrdersParams,
  ): Promise<CancelOrdersResult> {
    // Single-venue aggregation keeps the direct passthrough: there is no
    // cross-venue ambiguity to resolve.
    if (this.#providers.size <= 1) {
      const [, provider] = this.#getProviderOrDefault(
        params.find((param) => param.providerId)?.providerId,
      );
      if (!provider.cancelOrders) {
        return {
          success: false,
          successCount: 0,
          failureCount: params.length,
          results: params.map((param) => ({
            orderId: param.orderId,
            symbol: param.symbol,
            success: false,
            error: 'Batch cancel not supported',
          })),
        };
      }
      return provider.cancelOrders(params);
    }

    // Venue identity is execution identity: a target without one is ambiguous
    // the moment two venues are registered, and is refused rather than
    // resolved against the default provider.
    if (params.some((param) => !param.providerId)) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED);
    }

    // Group targets by venue and run each venue's own batch.
    const byProvider = new Map<PerpsProviderType, BatchCancelOrdersParams>();
    for (const param of params) {
      const venue = param.providerId as PerpsProviderType;
      const group = byProvider.get(venue);
      if (group) {
        group.push(param);
      } else {
        byProvider.set(venue, [param]);
      }
    }

    const grouped = Array.from(byProvider.entries());
    const results = await Promise.allSettled(
      grouped.map(async ([providerId, targets]) => {
        const provider = this.#providers.get(providerId);
        if (!provider?.cancelOrders) {
          throw new Error('Batch cancel not supported');
        }
        const result = await provider.cancelOrders(targets);
        // Attach venue identity to every per-order outcome.
        return {
          ...result,
          results: result.results.map((item) => ({
            ...item,
            providerId,
          })),
        };
      }),
    );

    const merged: CancelOrdersResult = {
      success: false,
      successCount: 0,
      failureCount: 0,
      results: [],
    };
    results.forEach((result, index) => {
      const [providerId, targets] = grouped[index];
      if (result.status === 'fulfilled') {
        merged.successCount += result.value.successCount;
        merged.failureCount += result.value.failureCount;
        merged.results.push(...result.value.results);
        if (result.value.error !== undefined) {
          merged.error ??= result.value.error;
        }
      } else {
        // The venue's batch threw (or its batch API is missing): its targets
        // fail explicitly instead of silently disappearing from the outcome.
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        merged.failureCount += targets.length;
        merged.results.push(
          ...targets.map((target) => ({
            orderId: target.orderId,
            symbol: target.symbol,
            success: false,
            error: message,
            providerId,
          })),
        );
      }
    });
    merged.success = merged.successCount > 0;
    return merged;
  }

  async closePosition(params: ClosePositionParams): Promise<OrderResult> {
    const [providerId, provider] = this.#getProviderOrDefault(
      params.providerId,
    );
    const result = await provider.closePosition(params);
    return { ...result, providerId };
  }

  async closePositions(
    params: ClosePositionsParams,
  ): Promise<ClosePositionsResult> {
    // Single-venue aggregation keeps the direct passthrough: there is no
    // cross-venue ambiguity to resolve.
    if (this.#providers.size <= 1) {
      const [, provider] = this.#getProviderOrDefault(
        params.targets?.[0]?.providerId,
      );
      if (!provider.closePositions) {
        return {
          success: false,
          successCount: 0,
          failureCount: 0,
          results: [],
        };
      }
      return provider.closePositions(params);
    }

    // Group explicit targets by venue. Identical symbols on different venues
    // are independent closes; each result keeps its venue identity.
    if (params.targets && params.targets.length > 0) {
      const byProvider = new Map<PerpsProviderType, string[]>();
      for (const target of params.targets) {
        const group = byProvider.get(target.providerId);
        if (group) {
          group.push(target.symbol);
        } else {
          byProvider.set(target.providerId, [target.symbol]);
        }
      }
      return this.#mergeCloseResults(
        await Promise.allSettled(
          Array.from(byProvider.entries()).map(
            async ([providerId, symbols]) => {
              const provider = this.#providers.get(providerId);
              if (!provider) {
                throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
              }
              const result = await this.#closePositionsOnProvider(provider, {
                symbols,
              });
              return {
                ...result,
                results: result.results.map((item) => ({
                  ...item,
                  providerId,
                })),
              };
            },
          ),
        ),
        Array.from(byProvider.keys()),
      );
    }

    // A legacy symbols-only close is ambiguous once two venues are
    // registered: it is refused rather than resolved against the default.
    if (params.symbols && params.symbols.length > 0) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED);
    }

    // closeAll (or an empty request) fans out to every enabled venue.
    return this.#mergeCloseResults(
      await Promise.allSettled(
        this.#getActiveProviders().map(async ([providerId, provider]) => {
          const result = await this.#closePositionsOnProvider(provider, {
            closeAll: true,
          });
          return {
            ...result,
            results: result.results.map((item) => ({
              ...item,
              providerId,
            })),
          };
        }),
      ),
      this.#getActiveProviders().map(([providerId]) => providerId),
    );
  }

  /**
   * Run one venue's optional batch close, falling back to that same venue's
   * per-position close when it has no batch method. Never invents an
   * execution strategy the venue does not expose.
   *
   * @param provider - The venue to close on.
   * @param params - Venue-local close parameters (symbols or closeAll).
   * @returns The venue's close result.
   */
  async #closePositionsOnProvider(
    provider: PerpsProvider,
    params: ClosePositionsParams,
  ): Promise<ClosePositionsResult> {
    if (provider.closePositions) {
      return provider.closePositions(params);
    }
    const symbols =
      params.closeAll === true
        ? (await provider.getPositions()).map((position) => position.symbol)
        : (params.symbols ?? []);
    if (symbols.length === 0) {
      return { success: false, successCount: 0, failureCount: 0, results: [] };
    }
    const settled = await Promise.allSettled(
      symbols.map((symbol) => provider.closePosition({ symbol })),
    );
    const results = settled.map((result, index) => {
      const failed = result.status === 'rejected';
      let success: boolean;
      let error: string | undefined;
      if (failed) {
        success = false;
        error =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
      } else {
        success = result.value.success === true;
        error = result.value.error;
      }
      return {
        symbol: symbols[index],
        success,
        error,
      };
    });
    const successCount = results.filter((item) => item.success).length;
    return {
      success: successCount > 0,
      successCount,
      failureCount: results.length - successCount,
      results,
    };
  }

  /**
   * Merge per-venue close results into one batch outcome. Successful work on
   * one venue is never hidden by another venue's rejection: a thrown venue
   * batch contributes an explicit venue-attributed batch-level error, and
   * `success` stays true when at least one close landed.
   *
   * @param results - Settled per-venue results.
   * @param providerIds - The venues, in the same order as the settled
   * results, for attributing thrown batches.
   * @returns The merged close result.
   */
  #mergeCloseResults(
    results: PromiseSettledResult<ClosePositionsResult>[],
    providerIds: PerpsProviderType[],
  ): ClosePositionsResult {
    const merged: ClosePositionsResult = {
      success: false,
      successCount: 0,
      failureCount: 0,
      results: [],
    };
    const batchErrors: string[] = [];
    results.forEach((result, index) => {
      const providerId = providerIds[index];
      if (result.status === 'fulfilled') {
        merged.successCount += result.value.successCount;
        merged.failureCount += result.value.failureCount;
        merged.results.push(...result.value.results);
        if (result.value.error !== undefined) {
          batchErrors.push(`${providerId}: ${result.value.error}`);
        }
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        batchErrors.push(`${providerId}: ${message}`);
      }
    });
    if (batchErrors.length > 0) {
      merged.error = batchErrors.join('; ');
    }
    merged.success = merged.successCount > 0;
    return merged;
  }

  async updatePositionTPSL(
    params: UpdatePositionTPSLParams,
  ): Promise<OrderResult> {
    const [providerId, provider] = this.#getProviderOrDefault(
      params.providerId,
    );
    const result = await provider.updatePositionTPSL(params);
    return { ...result, providerId };
  }

  async replacePositionTPSLLeg(
    params: ReplacePositionTPSLLegParams,
  ): Promise<OrderResult> {
    const [providerId, provider] = this.#getProviderOrDefault(
      params.providerId,
    );
    if (!provider.replacePositionTPSLLeg) {
      throw createTpslLegReplaceUnsupportedError();
    }
    const result = await provider.replacePositionTPSLLeg(params);
    return { ...result, providerId };
  }

  async updateMargin(params: UpdateMarginParams): Promise<MarginResult> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.updateMargin(params);
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.withdraw(params);
  }

  /**
   * Aggregate parked manual TP/SL recoveries from every underlying
   * provider implementing the durable-settlement contract. Storage
   * errors PROPAGATE — a corrupt store degrading to "nothing pending"
   * would hide an under-protected position.
   *
   * @returns Pending manual-recovery entries across providers.
   */
  async getPendingManualRecoveries(): Promise<PerpsPendingManualRecovery[]> {
    const results = await Promise.all(
      this.#getActiveProviders().map(async ([providerId, provider]) =>
        provider.getPendingManualRecoveries
          ? (await provider.getPendingManualRecoveries()).map((row) => ({
              ...row,
              providerId,
            }))
          : [],
      ),
    );
    return results.flat();
  }

  /**
   * Review native attached groups on providers implementing that capability.
   *
   * @returns Provider-labelled venue observations without financial actions.
   */
  async reviewAttachedOrderGroups(): Promise<AttachedOrderGroup[]> {
    const results = await Promise.all(
      this.#getActiveProviders().map(async ([providerId, provider]) =>
        ((await provider.reviewAttachedOrderGroups?.()) ?? []).map((group) => ({
          ...group,
          providerId,
        })),
      ),
    );
    return results.flat();
  }

  /**
   * List stored attached identities across active providers.
   *
   * @returns Provider-labelled groups without financial actions.
   */
  async getAttachedOrderGroups(): Promise<AttachedOrderGroup[]> {
    const results = await Promise.all(
      this.#getActiveProviders().map(async ([providerId, provider]) =>
        ((await provider.getAttachedOrderGroups?.()) ?? []).map((group) => ({
          ...group,
          providerId,
        })),
      ),
    );
    return results.flat();
  }

  /**
   * Aggregate recovered-dispatch outcomes from every underlying provider
   * implementing the durable-settlement contract.
   *
   * @returns Pending recovered-dispatch outcomes across providers.
   */
  async getRecoveredDispatches(): Promise<PerpsRecoveredDispatch[]> {
    const results = await Promise.all(
      this.#getActiveProviders().map(async ([providerId, provider]) =>
        provider.getRecoveredDispatches
          ? (await provider.getRecoveredDispatches()).map((row) => ({
              ...row,
              providerId,
            }))
          : [],
      ),
    );
    return results.flat();
  }

  /**
   * List durable Scale groups from providers that expose group ownership.
   * @returns Owned groups with their provider routes.
   */
  async getScaleOrderGroups(): Promise<ScaleOrderGroup[]> {
    const groups = await Promise.all(
      this.#getActiveProviders().map(async ([providerId, provider]) =>
        ((await provider.getScaleOrderGroups?.()) ?? []).map((group) => ({
          ...group,
          providerId,
        })),
      ),
    );
    return groups.flat();
  }

  /**
   * Review one selected provider's Scale groups without replaying placement.
   * @param params - Explicit provider route.
   * @param params.providerId - Owning provider.
   * @returns Reconciled durable groups.
   */
  async reviewScaleOrderGroups(
    params: { providerId?: PerpsProviderType } = {},
  ): Promise<ScaleOrderGroup[]> {
    if (!params.providerId) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
    }
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    if (!provider.reviewScaleOrderGroups) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
    }
    return provider.reviewScaleOrderGroups(params);
  }

  /**
   * Execute an explicit successor for one selected durable protection obligation.
   *
   * @param params - Owning provider, opaque source ID and new protection intent.
   * @returns Settled, unresolved or unsupported recovery result.
   */
  async resolveRecoveryProtection(
    params: ResolveRecoveryProtectionParams,
  ): Promise<PerpsRecoveryProtectionResult> {
    if (!params.providerId) {
      throw new Error('Protection recovery requires an explicit provider');
    }
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return (
      provider.resolveRecoveryProtection?.(params) ?? {
        status: 'unsupported',
        providerId: params.providerId,
        success: false,
        error: 'Selected protection recovery is unavailable for this provider',
      }
    );
  }

  /**
   * Review only the selected recovery owner, never an aggregated account snapshot.
   *
   * @param params - Explicit owning-provider route.
   * @param params.providerId - Provider to review.
   * @returns That provider's strict snapshot or unsupported capability.
   */
  async reviewRecoveryVenue(
    params: { providerId?: PerpsProviderType } = {},
  ): Promise<PerpsRecoveryVenueReview> {
    if (!params.providerId) {
      throw new Error('Recovery review requires an explicit provider');
    }
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return (
      provider.reviewRecoveryVenue?.(params) ?? {
        status: 'unsupported',
        providerId: params.providerId,
        reason:
          'Authoritative recovery review is unavailable for this provider',
      }
    );
  }

  /**
   * Reconcile every active provider without financial writes. Unsupported
   * providers contribute their local listing, or an empty list. Any failure
   * rejects the entire result, so partial evidence is never reported as complete.
   *
   * @returns Newly scoped pending and recovered dispatches across providers.
   */
  async reconcileRecoveredDispatches(): Promise<PerpsRecoveredDispatch[]> {
    const results = await Promise.all(
      this.#getActiveProviders().map(async ([providerId, provider]) => {
        const rows = provider.reconcileRecoveredDispatches
          ? await provider.reconcileRecoveredDispatches()
          : ((await provider.getRecoveredDispatches?.()) ?? []);
        return rows.map((row) => ({ ...row, providerId }));
      }),
    );
    return results.flat();
  }

  /**
   * Acknowledge ONE recovered-dispatch outcome by its stable id on
   * whichever underlying provider owns it.
   *
   * @param recoveryId - Stable id from {@link getRecoveredDispatches}.
   */
  async acknowledgeRecoveredDispatch(recoveryId: string): Promise<void> {
    const capable = this.#getActiveProviders().filter(
      ([, provider]) =>
        typeof provider.acknowledgeRecoveredDispatch === 'function',
    );
    if (capable.length === 0) {
      throw new Error(
        'No perps provider has recovered dispatches to acknowledge',
      );
    }
    let lastError: Error | null = null;
    for (const [, provider] of capable) {
      try {
        await provider.acknowledgeRecoveredDispatch?.(recoveryId);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError as Error;
  }

  // ============================================================================
  // Validation (Route to specific provider)
  // ============================================================================

  async validateDeposit(
    params: DepositParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    return this.#getDefaultProvider().validateDeposit(params);
  }

  async validateOrder(
    params: OrderParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.validateOrder(params);
  }

  async validateClosePosition(
    params: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.validateClosePosition(params);
  }

  async validateWithdrawal(
    params: WithdrawParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.validateWithdrawal(params);
  }

  // ============================================================================
  // Protocol Calculations (Delegate to default or route)
  // ============================================================================

  async calculateLiquidationPrice(
    params: LiquidationPriceParams,
  ): Promise<string> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.calculateLiquidationPrice(params);
  }

  async calculateMaintenanceMargin(
    params: MaintenanceMarginParams,
  ): Promise<number> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.calculateMaintenanceMargin(params);
  }

  async getMaxLeverage(
    asset: string,
    providerId?: PerpsProviderType,
  ): Promise<number> {
    const [, provider] = this.#getProviderOrDefault(providerId);
    return provider.getMaxLeverage(asset);
  }

  async calculateFees(
    params: FeeCalculationParams,
  ): Promise<FeeCalculationResult> {
    const [, provider] = this.#getProviderOrDefault(params.providerId);
    return provider.calculateFees(params);
  }

  async previewPositionModify(
    params: PositionModifyPreviewParams,
  ): Promise<PositionModifyPreviewResult> {
    const [, provider] = this.#getProviderOrDefault(
      params.providerId ?? params.position.providerId,
    );
    return provider.previewPositionModify(params);
  }

  // ============================================================================
  // Subscriptions (Multiplex via SubscriptionMultiplexer)
  // ============================================================================

  subscribeToPrices(params: SubscribePricesParams): () => void {
    return this.#subscriptionMux.subscribeToPrices({
      ...params,
      providers: this.#getActiveProviders(),
      aggregationMode: 'merge',
    });
  }

  subscribeToPositions(params: SubscribePositionsParams): () => void {
    return this.#subscriptionMux.subscribeToPositions({
      ...params,
      providers: this.#getActiveProviders(),
    });
  }

  subscribeToOrderFills(params: SubscribeOrderFillsParams): () => void {
    return this.#subscriptionMux.subscribeToOrderFills({
      ...params,
      providers: this.#getActiveProviders(),
    });
  }

  subscribeToOrders(params: SubscribeOrdersParams): () => void {
    return this.#subscriptionMux.subscribeToOrders({
      ...params,
      providers: this.#getActiveProviders(),
    });
  }

  /**
   * Stream TWAP updates from the default provider only.
   *
   * Unlike `getTwapOrders`, this does not fan out: HyperLiquid is the sole
   * venue with a native TWAP push channel today, so a mux would add
   * multi-provider merge semantics with nothing to merge. Callers needing the
   * aggregated view across providers keep using `getTwapOrders`.
   *
   * @param params - Subscription parameters including callback and account ID.
   * @returns A cleanup function; a no-op when the default provider has no
   * native TWAP push channel.
   */
  subscribeToTwapOrders(params: SubscribeTwapOrdersParams): () => void {
    return this.#trackDefaultRoutedSubscription({
      // A full empty snapshot replaces the previous venue's cached schedules,
      // including when the new venue exposes no native TWAP stream.
      onInvalidate: () => params.callback([], true),
      open: (provider) => {
        if (!provider.subscribeToTwapOrders) {
          return () => {
            // No-op: default provider exposes no native TWAP push channel
          };
        }
        // Capture each stream's route so late batches from the old venue keep
        // their source identity during teardown or after a default change.
        const providerId = this.#defaultProvider;
        return provider.subscribeToTwapOrders({
          ...params,
          // Stamp the same way getTwapOrders does, so swapping a poll for this
          // subscription does not silently drop providerId from every schedule.
          callback: (twapOrders, isSnapshot) =>
            params.callback(
              twapOrders.map((order) => ({
                ...order,
                providerId,
              })),
              isSnapshot,
            ),
        });
      },
    });
  }

  /**
   * Stream account updates from every enabled venue.
   *
   * Each venue is subscribed through the multiplexer, and every emission
   * carries the same contract as a REST read: combined totals over the
   * venues with data, one `providerStates` entry per enabled venue
   * (available or explicitly unavailable), and `aggregate` completeness
   * metadata. A venue's `null` update marks that venue unavailable instead
   * of keeping its previous value as current; when no venue has data, the
   * consumer gets `null` — never an all-zero total.
   *
   * This is venue fan-out, not default routing: changing the routing default
   * neither re-subscribes these streams nor invalidates the still-valid
   * all-venue total.
   *
   * @param params - Subscription parameters including callback and account ID.
   * @returns A cleanup function covering every venue subscription.
   */
  subscribeToAccount(params: SubscribeAccountParams): () => void {
    return this.#subscriptionMux.subscribeToAccount({
      ...(params.accountId !== undefined && { accountId: params.accountId }),
      providers: this.#getActiveProviders(),
      callback: (accounts) => {
        const entries: PerpsProviderAccountStateEntry[] =
          this.#getActiveProviders().map(([providerId]) => {
            const state = accounts.find(
              (account) => account.providerId === providerId,
            );
            if (state) {
              return { status: 'available', state, providerId };
            }
            // Not yet reported, or its latest update was null: no current
            // balance is known for this venue.
            return { status: 'unavailable', providerId };
          });
        params.callback(buildAggregatedAccountState({ entries }));
      },
    });
  }

  subscribeToOICaps(params: SubscribeOICapsParams): () => void {
    // Explicit route: pinned to that venue. A venue without the stream never
    // silently falls back to a different venue's data.
    if (params.providerId !== undefined) {
      return this.#resolveExplicitStreamRoute(
        params.providerId,
        params,
      ).subscribeToOICaps(params);
    }
    return this.#trackDefaultRoutedSubscription({
      open: (provider) => provider.subscribeToOICaps(params),
    });
  }

  subscribeToCandles(params: SubscribeCandlesParams): () => void {
    // Explicit route: pinned to that venue — required when both venues list
    // the same symbol and the data must come from a specific one. A pinned
    // stream does not follow the routing default.
    if (params.providerId !== undefined) {
      return this.#resolveExplicitStreamRoute(
        params.providerId,
        params,
      ).subscribeToCandles(params);
    }
    return this.#trackDefaultRoutedSubscription({
      open: (provider) => provider.subscribeToCandles(params),
    });
  }

  subscribeToOrderBook(params: SubscribeOrderBookParams): () => void {
    if (params.providerId !== undefined) {
      return this.#resolveExplicitStreamRoute(
        params.providerId,
        params,
      ).subscribeToOrderBook(params);
    }
    return this.#trackDefaultRoutedSubscription({
      open: (provider) => provider.subscribeToOrderBook(params),
    });
  }

  /**
   * Read public trades from the explicit route, else the default provider.
   * An unrouted read resolves to an empty list if the default changes before
   * the venue answers.
   *
   * @param params - Market, optional limit and route.
   * @returns The route's trades, newest first.
   * @throws If the route is not registered or has no public trade feed.
   */
  async getPublicTrades(params: GetPublicTradesParams): Promise<PublicTrade[]> {
    const [providerId, provider] = this.#getProviderOrDefault(
      params.providerId,
    );
    if (!provider.getPublicTrades) {
      throw new Error(`Public trades not supported by provider ${providerId}`);
    }
    const trades = await provider.getPublicTrades({ ...params, providerId });
    if (
      params.providerId === undefined &&
      providerId !== this.#defaultProvider
    ) {
      return [];
    }
    return trades;
  }

  /**
   * Stream public trades from the explicit route, else the default provider.
   * An unrouted stream follows the default and moves with it. A missing
   * route or one without a public trade feed returns a no-op cleanup and
   * never calls back.
   *
   * @param params - Market, optional route, callback and error handler.
   * @returns A cleanup function to unsubscribe.
   */
  subscribeToPublicTrades(params: SubscribePublicTradesParams): () => void {
    if (params.providerId === undefined) {
      return this.#trackDefaultRoutedSubscription({
        open: (defaultProvider) =>
          defaultProvider.subscribeToPublicTrades?.({
            ...params,
            providerId: this.#defaultProvider,
          }) ?? (() => undefined),
      });
    }
    const provider = this.#providers.get(params.providerId);
    if (!provider?.subscribeToPublicTrades) {
      return () => {
        // No-op: route missing or without a public trade feed
      };
    }
    return provider.subscribeToPublicTrades(params);
  }

  /**
   * Resolve an explicitly named stream venue.
   *
   * A route that is not registered is reported through the params' `onError`
   * (or thrown when the params have none) and never silently subscribes to a
   * different venue: no callback, no data, no fallback.
   *
   * @param providerId - The venue the caller named.
   * @param params - The subscription params carrying the route and error handler.
   * @returns The provider to open the stream on.
   */
  #resolveExplicitStreamRoute(
    providerId: PerpsProviderType,
    params: { onError?: (error: Error) => void } | SubscribeOICapsParams,
  ): PerpsProvider {
    const { onError } = params as { onError?: (error: Error) => void };
    const provider = this.#providers.get(providerId);
    if (!provider) {
      const error = new Error(
        `${PERPS_ERROR_CODES.PROVIDER_NOT_FOUND}: '${providerId}'`,
      );
      if (onError) {
        onError(error);
        return {
          subscribeToCandles: () => () => undefined,
          subscribeToOICaps: () => () => undefined,
          subscribeToOrderBook: () => () => undefined,
        } as unknown as PerpsProvider;
      }
      throw error;
    }
    return provider;
  }

  /**
   * Stream available to trade from the explicit route, else the default
   * provider, as order placement routes. A route without support returns a
   * no-op cleanup and never calls back, so the value stays unknown.
   *
   * @param params - Market, optional route/account, callback and error handler.
   * @returns A cleanup function to unsubscribe.
   */
  subscribeToAvailableToTrade(
    params: SubscribeAvailableToTradeParams,
  ): () => void {
    if (params.providerId === undefined) {
      return this.#trackDefaultRoutedSubscription({
        open: (provider) =>
          provider.subscribeToAvailableToTrade?.({
            ...params,
            providerId: this.#defaultProvider,
          }) ?? (() => undefined),
        // As with a stopped stream, the old venue's value is now unknown.
        // Notify before opening the new stream, which may emit immediately.
        onInvalidate: () =>
          params.onError?.(
            new Error('Available-to-trade provider changed; value is unknown'),
          ),
      });
    }

    const { providerId } = params;
    // Read the map directly: #getProviderOrDefault throws when the route is
    // unavailable, and this method's contract is a no-op cleanup.
    const provider = this.#providers.get(providerId);
    if (!provider?.subscribeToAvailableToTrade) {
      return () => {
        // No-op: route missing or without a venue value
      };
    }
    return provider.subscribeToAvailableToTrade({ ...params, providerId });
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  setLiveDataConfig(config: Partial<LiveDataConfig>): void {
    // Apply config to all providers
    this.#providers.forEach((provider) => {
      provider.setLiveDataConfig(config);
    });
  }

  setUserFeeDiscount(discountBips: number | undefined): void {
    // Apply to all providers that support it
    this.#providers.forEach((provider) => {
      if (provider.setUserFeeDiscount) {
        provider.setUserFeeDiscount(discountBips);
      }
    });
  }

  setUserFeeResolution(resolution: PerpsFeeResolution | undefined): void {
    this.#providers.forEach((provider) => {
      if (provider.setUserFeeResolution) {
        provider.setUserFeeResolution(resolution);
      } else if (provider.setUserFeeDiscount) {
        provider.setUserFeeDiscount(resolution?.discountBips);
      }
    });
  }

  /**
   * Approve the dedicated subscription builder on the HyperLiquid provider.
   *
   * @deprecated ADR 0064 replaced the dedicated subscription builder with cloid
   * marking on the standard builder; nothing on the order path reads this.
   * @returns Whether the builder is approved.
   */
  async approveSubscriptionBuilderFee(): Promise<boolean> {
    const provider =
      this.#providers.get('hyperliquid') ?? this.#getDefaultProvider();
    return provider.approveSubscriptionBuilderFee
      ? provider.approveSubscriptionBuilderFee()
      : false;
  }

  // ============================================================================
  // Lifecycle (Delegate to default provider)
  // ============================================================================

  async toggleTestnet(): Promise<ToggleTestnetResult> {
    return this.#getDefaultProvider().toggleTestnet();
  }

  async initialize(): Promise<InitializeResult> {
    // Initialize default provider
    const result = await this.#getDefaultProvider().initialize();

    // Optionally initialize other providers in background
    // For Phase 1, we only initialize default provider
    return result;
  }

  async isReadyToTrade(): Promise<ReadyToTradeResult> {
    return this.#getDefaultProvider().isReadyToTrade();
  }

  /**
   * Prepare every provider in turn, so a hardware wallet sees one prompt at a
   * time. A provider that throws is logged with its provider ID and counts as
   * not ready.
   *
   * @returns The not-ready result of the first provider, in registration
   * order, that is not ready; else ready.
   */
  async prepareTradingWallet(): Promise<ReadyToTradeResult> {
    let notReady: ReadyToTradeResult | undefined;
    for (const [providerId, provider] of this.#getActiveProviders()) {
      let result: ReadyToTradeResult | undefined;
      try {
        result = await provider.prepareTradingWallet?.();
      } catch (caughtError) {
        // Providers report their own failures, so a throw here is unexpected.
        const error = ensureError(
          caughtError,
          'AggregatedPerpsProvider.prepareTradingWallet',
        );
        // The provider's own network: Lighter can be pinned to testnet.
        const isProviderTestnet = isProviderOnTestnet(
          providerId,
          this.#isTestnet,
        );
        this.#deps.logger.error(error, {
          tags: {
            feature: PERPS_CONSTANTS.FeatureName,
            provider: providerId,
            ...(isProviderTestnet !== undefined && {
              network: isProviderTestnet ? 'testnet' : 'mainnet',
            }),
          },
          context: {
            name: 'AggregatedPerpsProvider',
            data: { method: 'prepareTradingWallet', providerId },
          },
        });
        result = { ready: false, error: error.message };
      }
      if (result && !result.ready) {
        notReady ??= result;
      }
    }
    return notReady ?? { ready: true };
  }

  async disconnect(): Promise<DisconnectResult> {
    // Disconnect all providers
    const results = await Promise.allSettled(
      this.#getActiveProviders().map(([, provider]) => provider.disconnect()),
    );

    // Clear subscription cache
    this.#subscriptionMux.clearCache();

    // Return success if at least one succeeded
    const successCount = results.filter(
      (res) => res.status === 'fulfilled' && res.value.success,
    ).length;

    return {
      success: successCount > 0,
    };
  }

  async ping(timeoutMs?: number): Promise<void> {
    return this.#getDefaultProvider().ping(timeoutMs);
  }

  getWebSocketConnectionState(): WebSocketConnectionState {
    const provider = this.#getDefaultProvider();
    if (provider.getWebSocketConnectionState) {
      return provider.getWebSocketConnectionState();
    }
    return WebSocketConnectionState.Disconnected;
  }

  subscribeToConnectionState(
    listener: (
      state: WebSocketConnectionState,
      reconnectionAttempt: number,
    ) => void,
  ): () => void {
    return this.#trackDefaultRoutedSubscription({
      open: (provider) => {
        if (provider.subscribeToConnectionState) {
          // Providers deliver their current state immediately on subscribe, so
          // a re-route notifies the listener of the new venue's state.
          return provider.subscribeToConnectionState(listener);
        }
        listener(WebSocketConnectionState.Disconnected, 0);
        return () => {
          /* noop */
        };
      },
    });
  }

  async reconnect(): Promise<void> {
    const provider = this.#getDefaultProvider();
    if (provider.reconnect) {
      await provider.reconnect();
    }
  }

  // ============================================================================
  // Block Explorer
  // ============================================================================

  getBlockExplorerUrl(address?: string): string {
    return this.#getDefaultProvider().getBlockExplorerUrl(address);
  }

  // ============================================================================
  // HIP-3 (Optional)
  // ============================================================================

  async getAvailableDexs(params?: GetAvailableDexsParams): Promise<string[]> {
    const provider = this.#getDefaultProvider();
    if (!provider.getAvailableDexs) {
      return [];
    }
    return provider.getAvailableDexs(params);
  }

  // ============================================================================
  // Provider Management
  // ============================================================================

  /**
   * Add a new provider to the aggregated provider.
   *
   * @param providerId - Unique identifier for the provider
   * @param provider - Provider instance
   */
  addProvider(providerId: PerpsProviderType, provider: PerpsProvider): void {
    this.#providers.set(providerId, provider);
    this.#deps.debugLogger.log('[AggregatedPerpsProvider] Provider added', {
      providerId,
    });
  }

  /**
   * Remove a provider from the aggregated provider.
   *
   * @param providerId - Provider to remove
   * @returns true if removed, false if not found
   */
  removeProvider(providerId: PerpsProviderType): boolean {
    const removed = this.#providers.delete(providerId);
    if (removed) {
      this.#deps.debugLogger.log('[AggregatedPerpsProvider] Provider removed', {
        providerId,
      });
    }
    return removed;
  }

  /**
   * Get list of all registered provider IDs.
   *
   * @returns The result of the operation.
   */
  getProviderIds(): PerpsProviderType[] {
    return Array.from(this.#providers.keys());
  }

  /**
   * Check if a provider is registered.
   *
   * @param providerId - The provider id value.
   * @returns True if the condition is met.
   */
  hasProvider(providerId: PerpsProviderType): boolean {
    return this.#providers.has(providerId);
  }

  /**
   * Get the router instance for external configuration.
   *
   * @returns The result of the operation.
   */
  getRouter(): ProviderRouter {
    return this.#router;
  }
}
