/**
 * SubscriptionMultiplexer - Manages WebSocket subscriptions across multiple providers
 *
 * Responsibilities:
 * - Manage subscriptions to multiple providers simultaneously
 * - Tag all updates with providerId so UI can differentiate sources
 * - Support aggregation modes: 'merge' (all prices) or 'best_price' (best price per symbol)
 * - Cache latest updates per provider per symbol for aggregation
 */

import { PERPS_CONSTANTS } from '../constants/perpsConfig.js';
import { StreamChannelManager } from '../services/StreamChannelManager.js';
import type {
  PerpsProviderType,
  PerpsProvider,
  PerpsLogger,
  PriceUpdate,
  Position,
  Order,
  OrderFill,
  AccountState,
  SubscribeOrderFillsParams,
  SubscribeOrdersParams,
  SubscribeAccountParams,
} from '../types/index.js';
import { ensureError } from '../utils/errorUtils.js';

/**
 * Options for constructing SubscriptionMultiplexer
 */
export type SubscriptionMultiplexerOptions = {
  /** Optional logger for error reporting (e.g., Sentry) */
  logger?: PerpsLogger;
};

/**
 * Aggregation mode for price subscriptions
 */
export type PriceAggregationMode = 'merge' | 'best_price';

/**
 * Parameters for multiplexed price subscriptions
 */
export type MultiplexedPricesParams = {
  /** Symbols to subscribe to */
  symbols: string[];
  /** Provider instances to subscribe through */
  providers: [PerpsProviderType, PerpsProvider][];
  /** Callback to receive aggregated price updates */
  callback: (prices: PriceUpdate[]) => void;
  /** Aggregation mode: 'merge' returns all prices, 'best_price' returns best per symbol */
  aggregationMode?: PriceAggregationMode;
  /** Optional throttle in milliseconds */
  throttleMs?: number;
  /** Include order book data */
  includeOrderBook?: boolean;
  /** Include market data (funding, OI, volume) */
  includeMarketData?: boolean;
  /** Receives one venue's failure; the other venues keep streaming. */
  onError?: (error: Error, providerId: PerpsProviderType) => void;
};

/**
 * Parameters for multiplexed position subscriptions
 */
export type MultiplexedPositionsParams = {
  /** Provider instances to subscribe through */
  providers: [PerpsProviderType, PerpsProvider][];
  /** Callback to receive aggregated position updates */
  callback: (positions: Position[]) => void;
  /** Receives one venue's failure; the other venues keep streaming. */
  onError?: (error: Error, providerId: PerpsProviderType) => void;
};

/**
 * Parameters for multiplexed order fill subscriptions
 */
export type MultiplexedOrderFillsParams = {
  /** Report provider errors without emitting a fabricated empty snapshot. */
  onError?: SubscribeOrderFillsParams['onError'];
  /** Provider instances to subscribe through */
  providers: [PerpsProviderType, PerpsProvider][];
  /** Callback to receive aggregated order fill updates */
  callback: SubscribeOrderFillsParams['callback'];
};

/**
 * Parameters for multiplexed order subscriptions
 */
export type MultiplexedOrdersParams = {
  /** Report provider errors without emitting a fabricated empty snapshot. */
  onError?: SubscribeOrdersParams['onError'];
  /** Provider instances to subscribe through */
  providers: [PerpsProviderType, PerpsProvider][];
  /** Callback to receive aggregated order updates */
  callback: SubscribeOrdersParams['callback'];
};

/**
 * Parameters for multiplexed account subscriptions
 */
export type MultiplexedAccountParams = {
  /** Keep healthy venue streams when setup fails; the next emission excludes the failed venue. */
  onError?: (error: Error, providerId: PerpsProviderType) => void;
  /** Optional account identity forwarded to every provider. */
  accountId?: SubscribeAccountParams['accountId'];
  /** Ask every provider for a complete account or `null`, never a partial one. */
  requireCompleteAccount?: boolean;
  /** Provider instances to subscribe through */
  providers: [PerpsProviderType, PerpsProvider][];
  /** Callback to receive account updates (one entry per provider with data) */
  callback: (accounts: AccountState[]) => void;
};
/**
 * SubscriptionMultiplexer manages real-time data subscriptions across
 * multiple perps providers.
 *
 * Key features:
 * - Subscribes to all providers simultaneously
 * - Tags all updates with source providerId
 * - Caches latest values for aggregation
 * - Supports different aggregation modes for prices
 *
 * @example
 * ```typescript
 * const mux = new SubscriptionMultiplexer();
 *
 * const unsubscribe = mux.subscribeToPrices({
 *   symbols: ['BTC', 'ETH'],
 *   providers: [
 *     ['hyperliquid', hlProvider],
 *     ['lighter', lighterProvider],
 *   ],
 *   callback: (prices) => {
 *     // prices have providerId injected
 *     prices.forEach(p => console.log(`${p.providerId}: ${p.symbol} = ${p.price}`));
 *   },
 *   aggregationMode: 'merge',
 * });
 *
 * // Later: clean up
 * unsubscribe();
 * ```
 */
export class SubscriptionMultiplexer {
  /**
   * Optional logger for error reporting
   */
  readonly #logger?: PerpsLogger;

  /**
   * Cache of latest prices per symbol per provider
   * Map<symbol, Map<providerId, PriceUpdate>>
   */
  readonly #priceCache: Map<string, Map<PerpsProviderType, PriceUpdate>> =
    new Map();

  /**
   * Cache of latest positions per provider
   * Map<providerId, Position[]>
   */
  readonly #positionCache: Map<PerpsProviderType, Position[]> = new Map();

  /**
   * Cache of latest orders per provider
   * Map<providerId, Order[]>
   */
  readonly #orderCache: Map<PerpsProviderType, Order[]> = new Map();

  /**
   * One stream manager per venue. A venue's stream that fails is reopened with
   * the manager's backoff, and when that venue reconnects, without touching
   * the other venues.
   */
  readonly #venues = new WeakMap<PerpsProvider, StreamChannelManager>();

  #nextVenueStreamId = 0;

  /**
   * Create a new SubscriptionMultiplexer.
   *
   * @param options - Optional configuration including logger for error reporting
   */
  constructor(options?: SubscriptionMultiplexerOptions) {
    this.#logger = options?.logger;
  }

  /**
   * Open one venue's part of a subscription. A failure reopens it with the
   * venue's own stream manager and leaves the other venues alone.
   *
   * @param params - What to open.
   * @param params.method - Name for error reports.
   * @param params.providerId - The venue.
   * @param params.provider - Its provider.
   * @param params.open - Opens the venue stream.
   * @param params.callback - Receives each update.
   * @param params.onError - Receives each failure.
   * @returns A function that closes it.
   */
  openVenue<Args extends unknown[]>(params: {
    method: string;
    providerId: PerpsProviderType;
    provider: PerpsProvider;
    open: (
      emit: (...args: Args) => void,
      fail: (error: Error) => void,
    ) => () => void;
    callback: (...args: Args) => void;
    onError?: (error: Error, providerId: PerpsProviderType) => void;
  }): () => void {
    const { method, providerId, provider, open, callback, onError } = params;
    let venue = this.#venues.get(provider);
    if (!venue) {
      venue = new StreamChannelManager({
        subscribeToConnectionState: (listener): (() => void) =>
          provider.subscribeToConnectionState?.(listener) ??
          ((): void => undefined),
        // Tagged with the stream that failed; one manager serves them all.
        onError: (error, key): void =>
          this.#logError(
            error,
            key?.stream ?? 'subscribeToConnectionState',
            providerId,
          ),
      });
      this.#venues.set(provider, venue);
    }
    this.#nextVenueStreamId += 1;
    return venue.subscribe<Args>(
      {
        stream: method,
        providerId,
        options: { id: this.#nextVenueStreamId },
      },
      {
        replay: false,
        open: (emit, fail) => {
          try {
            return open(emit, fail);
          } catch (error) {
            // A venue that refuses at once is known as failed at once.
            fail(ensureError(error, `SubscriptionMultiplexer.${method}`));
            return () => undefined;
          }
        },
      },
      {
        callback,
        onError: (error: Error) => {
          this.#logError(error, method, providerId);
          onError?.(error, providerId);
        },
      },
    );
  }

  #logError(
    error: unknown,
    method: string,
    providerId: PerpsProviderType,
  ): void {
    this.#logger?.error(
      ensureError(error, `SubscriptionMultiplexer.${method}`),
      {
        tags: {
          feature: PERPS_CONSTANTS.FeatureName,
          provider: providerId,
          method,
        },
        context: { name: 'SubscriptionMultiplexer', data: {} },
      },
    );
  }

  /**
   * Subscribe to price updates from multiple providers.
   *
   * @param params - Subscription parameters
   * @returns Unsubscribe function
   */
  subscribeToPrices(params: MultiplexedPricesParams): () => void {
    const {
      symbols,
      providers,
      callback,
      aggregationMode = 'merge',
      throttleMs,
      includeOrderBook,
      includeMarketData,
    } = params;

    const unsubscribers: (() => void)[] = [];

    for (const [providerId, provider] of providers) {
      unsubscribers.push(
        this.openVenue<[PriceUpdate[]]>({
          method: 'subscribeToPrices',
          providerId,
          provider,
          onError: params.onError,
          open: (emit, fail) =>
            provider.subscribeToPrices({
              symbols,
              callback: emit,
              onError: fail,
              throttleMs,
              includeOrderBook,
              includeMarketData,
            }),
          callback: (updates) => {
            // Tag and cache each update
            updates.forEach((update) => {
              const taggedUpdate: PriceUpdate = { ...update, providerId };

              // Initialize symbol cache if needed
              if (!this.#priceCache.has(update.symbol)) {
                this.#priceCache.set(update.symbol, new Map());
              }
              const symbolCache = this.#priceCache.get(update.symbol);
              if (symbolCache) {
                symbolCache.set(providerId, taggedUpdate);
              }
            });

            // Aggregate and emit based on mode
            callback(this.#aggregatePrices(symbols, aggregationMode));
          },
        }),
      );
    }

    // Return combined unsubscribe function
    return () => {
      unsubscribers.forEach((unsub) => unsub());
      // Optionally clear cache for these symbols
      symbols.forEach((symbol) => {
        this.#priceCache.delete(symbol);
      });
    };
  }

  /**
   * Subscribe to position updates from multiple providers.
   *
   * @param params - Subscription parameters
   * @returns Unsubscribe function
   */
  subscribeToPositions(params: MultiplexedPositionsParams): () => void {
    const { providers, callback } = params;
    const unsubscribers: (() => void)[] = [];

    for (const [providerId, provider] of providers) {
      unsubscribers.push(
        this.openVenue<[Position[]]>({
          method: 'subscribeToPositions',
          providerId,
          provider,
          onError: params.onError,
          open: (emit, fail) =>
            provider.subscribeToPositions({
              callback: (positions) => emit(positions),
              onError: fail,
            }),
          callback: (positions) => {
            // Tag positions with providerId and cache
            this.#positionCache.set(
              providerId,
              positions.map((position) => ({ ...position, providerId })),
            );
            // Emit aggregated positions from all providers
            callback(this.#aggregatePositions());
          },
        }),
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      // Clear position cache for these providers
      providers.forEach(([providerId]) => {
        this.#positionCache.delete(providerId);
      });
    };
  }

  /**
   * Subscribe to order fill updates from multiple providers.
   *
   * @param params - Subscription parameters
   * @returns Unsubscribe function
   */
  subscribeToOrderFills(params: MultiplexedOrderFillsParams): () => void {
    const { providers, callback } = params;
    const unsubscribers: (() => void)[] = [];

    for (const [providerId, provider] of providers) {
      unsubscribers.push(
        this.openVenue<[OrderFill[], boolean?]>({
          method: 'subscribeToOrderFills',
          providerId,
          provider,
          onError: params.onError,
          open: (emit, fail) =>
            provider.subscribeToOrderFills({
              onError: fail,
              callback: (fills, isSnapshot) => emit(fills, isSnapshot),
            }),
          // For fills, we don't aggregate - emit immediately with tags
          callback: (fills, isSnapshot) =>
            callback(
              fills.map((fill) => ({ ...fill, providerId })),
              isSnapshot,
              providerId,
            ),
        }),
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Subscribe to order updates from multiple providers.
   *
   * @param params - Subscription parameters
   * @returns Unsubscribe function
   */
  subscribeToOrders(params: MultiplexedOrdersParams): () => void {
    const { providers, callback } = params;
    const unsubscribers: (() => void)[] = [];

    for (const [providerId, provider] of providers) {
      unsubscribers.push(
        this.openVenue<[Order[]]>({
          method: 'subscribeToOrders',
          providerId,
          provider,
          onError: (error) => {
            // Another venue can emit while this one is unauthenticated.
            this.#orderCache.delete(providerId);
            params.onError?.(error, providerId);
          },
          open: (emit, fail) =>
            provider.subscribeToOrders({
              onError: fail,
              callback: (orders) => emit(orders),
            }),
          callback: (orders) => {
            // Tag orders with providerId and cache
            this.#orderCache.set(
              providerId,
              orders.map((order) => ({ ...order, providerId })),
            );
            // Emit aggregated orders from all providers
            callback(this.#aggregateOrders(), providerId);
          },
        }),
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      providers.forEach(([providerId]) => {
        this.#orderCache.delete(providerId);
      });
    };
  }

  /**
   * Subscribe to account updates from multiple providers.
   *
   * Each subscription owns its cache: a venue's latest state is visible only
   * to that subscription, so one subscription's cleanup never erases another
   * subscription's venue data, and a subscription starts empty regardless of
   * other live account streams.
   *
   * @param params - Subscription parameters
   * @returns Unsubscribe function
   */
  subscribeToAccount(params: MultiplexedAccountParams): () => void {
    const { providers, callback } = params;
    const unsubscribers: (() => void)[] = [];
    // Per-subscription cache: latest state per venue for THIS subscription.
    const accountCache: Map<PerpsProviderType, AccountState> = new Map();

    for (const [providerId, provider] of providers) {
      unsubscribers.push(
        this.openVenue<[AccountState | null]>({
          method: 'subscribeToAccount',
          providerId,
          provider,
          onError: (error) => {
            // The failed venue's balance is not known until it recovers.
            accountCache.delete(providerId);
            params.onError?.(error, providerId);
            callback(Array.from(accountCache.values()));
          },
          open: (emit, fail) =>
            provider.subscribeToAccount({
              ...(params.accountId !== undefined && {
                accountId: params.accountId,
              }),
              ...(params.requireCompleteAccount === true && {
                requireCompleteAccount: true,
              }),
              onError: fail,
              callback: (account) => emit(account),
            }),
          callback: (account) => {
            if (account === null) {
              // The venue's balance is no longer known. Drop its previous
              // value: it must not stay in the aggregate as current, and it
              // must not become a zero.
              accountCache.delete(providerId);
            } else {
              // Tag account with providerId and cache
              accountCache.set(providerId, { ...account, providerId });
            }

            // Emit this subscription's cached account states
            callback(Array.from(accountCache.values()));
          },
        }),
      );
    }

    return () => {
      unsubscribers.forEach((unsub) => unsub());
      // The cache is per-subscription: nothing shared to clear.
    };
  }

  /**
   * Aggregate cached prices based on mode.
   *
   * @param symbols - Symbols to include in result
   * @param mode - Aggregation mode
   * @returns Aggregated price updates
   */
  #aggregatePrices(
    symbols: string[],
    mode: PriceAggregationMode,
  ): PriceUpdate[] {
    const result: PriceUpdate[] = [];

    symbols.forEach((symbol) => {
      const providerPrices = this.#priceCache.get(symbol);
      if (!providerPrices || providerPrices.size === 0) {
        return;
      }

      if (mode === 'merge') {
        // Return all prices (one per provider)
        providerPrices.forEach((price) => {
          result.push(price);
        });
      } else {
        // 'best_price': Return the best price across providers
        const best = this.#findBestPrice(providerPrices);
        if (best) {
          result.push(best);
        }
      }
    });

    return result;
  }

  /**
   * Find the best price from multiple provider prices.
   * "Best" is defined as the price with the smallest spread.
   *
   * @param providerPrices - Map of provider prices for a symbol
   * @returns Best price update or undefined
   */
  #findBestPrice(
    providerPrices: Map<PerpsProviderType, PriceUpdate>,
  ): PriceUpdate | undefined {
    let bestPrice: PriceUpdate | undefined;
    let smallestSpread = Infinity;

    providerPrices.forEach((price) => {
      if (price.spread === undefined) {
        // No spread info - just use the first one
        bestPrice ??= price;
      } else {
        // If spread is available, use it to determine best
        const spreadValue = parseFloat(price.spread);
        if (!isNaN(spreadValue) && spreadValue < smallestSpread) {
          smallestSpread = spreadValue;
          bestPrice = price;
        }
      }
    });

    return bestPrice;
  }

  /**
   * Aggregate positions from all providers.
   *
   * @returns All cached positions
   */
  #aggregatePositions(): Position[] {
    const allPositions: Position[] = [];
    this.#positionCache.forEach((positions) => {
      allPositions.push(...positions);
    });
    return allPositions;
  }

  /**
   * Aggregate orders from all providers.
   *
   * @returns All cached orders
   */
  #aggregateOrders(): Order[] {
    const allOrders: Order[] = [];
    this.#orderCache.forEach((orders) => {
      allOrders.push(...orders);
    });
    return allOrders;
  }

  /**
   * Clear all cached data.
   */
  clearCache(): void {
    this.#priceCache.clear();
    this.#positionCache.clear();
    this.#orderCache.clear();
  }

  /**
   * Get cached price for a symbol from a specific provider.
   *
   * @param symbol - Market symbol
   * @param providerId - Provider ID
   * @returns Cached price update or undefined
   */
  getCachedPrice(
    symbol: string,
    providerId: PerpsProviderType,
  ): PriceUpdate | undefined {
    return this.#priceCache.get(symbol)?.get(providerId);
  }

  /**
   * Get all cached prices for a symbol.
   *
   * @param symbol - Market symbol
   * @returns Map of provider ID to price update
   */
  getAllCachedPricesForSymbol(
    symbol: string,
  ): Map<PerpsProviderType, PriceUpdate> | undefined {
    return this.#priceCache.get(symbol);
  }
}
