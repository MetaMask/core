/**
 * Price Service for handling real-time price feeds
 * 
 * This service manages price subscriptions, updates, and notifications
 * using the WebSocketService as the underlying transport layer.
 */


import type { RestrictedMessenger } from '@metamask/base-controller';
import type { WebSocketService, ServerNotificationMessage } from './websocket-service';
import { WebSocketEventType } from './websocket-service';

const SERVICE_NAME = 'PriceService';

/**
 * Price data structure
 */
export type PriceData = {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  timestamp: number;
  source: string;
};

/**
 * Price subscription options
 */
export type PriceSubscription = {
  symbols: string[];
  interval?: number; // Update interval in milliseconds
  includeMarketCap?: boolean;
  includeVolume?: boolean;
};

/**
 * Configuration options for the Price service
 */
export type PriceServiceOptions = {
  /** Default update interval in milliseconds */
  defaultInterval?: number;
  
  /** Maximum number of symbols per subscription */
  maxSymbolsPerSubscription?: number;
  
  /** Price change threshold for notifications (percentage) */
  changeThreshold?: number;
};

// Action types for the messaging system
export type PriceServiceSubscribeAction = {
  type: `PriceService:subscribe`;
  handler: PriceService['subscribe'];
};

export type PriceServiceUnsubscribeAction = {
  type: `PriceService:unsubscribe`;
  handler: PriceService['unsubscribe'];
};

export type PriceServiceGetPricesAction = {
  type: `PriceService:getPrices`;
  handler: PriceService['getPrices'];
};

export type PriceServiceActions = 
  | PriceServiceSubscribeAction
  | PriceServiceUnsubscribeAction
  | PriceServiceGetPricesAction;

type AllowedActions = never;

// Event types for the messaging system
export type PriceServicePriceUpdatedEvent = {
  type: `PriceService:priceUpdated`;
  payload: [PriceData];
};

export type PriceServiceSubscriptionConfirmedEvent = {
  type: `PriceService:subscriptionConfirmed`;
  payload: [{ subscriptionId: string; symbols: string[] }];
};

export type PriceServiceSubscriptionErrorEvent = {
  type: `PriceService:subscriptionError`;
  payload: [{ symbols: string[]; error: string }];
};

export type PriceServiceEvents = 
  | PriceServicePriceUpdatedEvent
  | PriceServiceSubscriptionConfirmedEvent
  | PriceServiceSubscriptionErrorEvent;

type AllowedEvents = never;

export type PriceServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  PriceServiceActions | AllowedActions,
  PriceServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Price Service
 * 
 * Handles real-time price feed subscriptions and updates using WebSocketService
 * as the underlying transport mechanism.
 * 
 * @example
 * ```typescript
 * const service = new PriceService({
 *   messenger: priceMessenger,
 *   webSocketService: wsService,
 *   defaultInterval: 5000,
 *   maxSymbolsPerSubscription: 100,
 * });
 * 
 * // Subscribe to price updates
 * await service.subscribe({
 *   symbols: ['BTC', 'ETH', 'SOL'],
 *   interval: 1000,
 *   includeMarketCap: true,
 * });
 * ```
 */
export class PriceService {
  readonly #messenger: PriceServiceMessenger;
  readonly #webSocketService: WebSocketService;
  readonly #options: Required<PriceServiceOptions>;

  #subscriptionIds = new Map<string, any>(); // Key: symbol list, Value: WebSocket subscription object
  #priceCache = new Map<string, PriceData>();
  
  // WebSocket method watchers cleanup functions
  #watcherCleanups: (() => void)[] = [];

  /**
   * Creates a new Price service instance
   * 
   * @param options - Configuration options
   * @param options.messenger - The restricted messenger for this service
   * @param options.webSocketService - WebSocket service instance for transport
   * @param options.defaultInterval - Default price update interval
   * @param options.maxSymbolsPerSubscription - Maximum symbols per subscription
   * @param options.changeThreshold - Price change threshold for notifications
   */
  constructor(options: PriceServiceOptions & { 
    messenger: PriceServiceMessenger;
    webSocketService: WebSocketService;
  }) {
    this.#messenger = options.messenger;
    this.#webSocketService = options.webSocketService;
    
    this.#options = {
      defaultInterval: options.defaultInterval ?? 5000,
      maxSymbolsPerSubscription: options.maxSymbolsPerSubscription ?? 100,
      changeThreshold: options.changeThreshold ?? 5.0,
    };

    this.#setupWebSocketHandlers();

    // Register action handlers
    this.#messenger.registerActionHandler(
      `PriceService:subscribe`,
      this.subscribe.bind(this),
    );

    this.#messenger.registerActionHandler(
      `PriceService:unsubscribe`,
      this.unsubscribe.bind(this),
    );

    this.#messenger.registerActionHandler(
      `PriceService:getPrices`,
      this.getPrices.bind(this),
    );
  }

  /**
   * Subscribe to price updates for specified symbols
   * 
   * @param subscription - Subscription configuration
   * @returns Promise that resolves when subscription is confirmed
   * @throws {Error} When subscription fails
   */
  async subscribe(subscription: PriceSubscription): Promise<void> {
    if (subscription.symbols.length > this.#options.maxSymbolsPerSubscription) {
      throw new Error(`Cannot subscribe to more than ${this.#options.maxSymbolsPerSubscription} symbols`);
    }

    const symbolKey = this.#generateSubscriptionId(subscription.symbols);
    
    // Skip if already subscribed to these symbols
    if (this.#subscriptionIds.has(symbolKey)) {
      return;
    }
    
    try {
      // Ensure WebSocket is connected
      await this.#webSocketService.connect();

      // Use high-level subscribe method
      const wsSubscription = await this.#webSocketService.subscribe({
        method: 'price_subscribe',
        params: {
          symbols: subscription.symbols,
          interval: subscription.interval ?? this.#options.defaultInterval,
          includeMarketCap: subscription.includeMarketCap ?? false,
          includeVolume: subscription.includeVolume ?? true,
        },
        onNotification: (notification) => {
          this.#handlePriceNotification(notification);
        },
      });

      // Store the subscription object
      this.#subscriptionIds.set(symbolKey, wsSubscription);

      this.#messenger.publish(`PriceService:subscriptionConfirmed`, {
        subscriptionId: wsSubscription.subscriptionId,
        symbols: subscription.symbols,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown subscription error';
      
      this.#messenger.publish(`PriceService:subscriptionError`, {
        symbols: subscription.symbols,
        error: errorMessage,
      });

      throw new Error(`Failed to subscribe to price updates: ${errorMessage}`);
    }
  }

  /**
   * Unsubscribe from price updates for specified symbols
   * 
   * @param symbols - Symbols to unsubscribe from
   * @returns Promise that resolves when unsubscribed
   */
  async unsubscribe(symbols: string[]): Promise<void> {
    const symbolKey = this.#generateSubscriptionId(symbols);
    const wsSubscription = this.#subscriptionIds.get(symbolKey);
    
    if (!wsSubscription) {
      return; // Already unsubscribed
    }

    try {
      // Call unsubscribe on the WebSocket subscription object
      await wsSubscription.unsubscribe();
      
      // Clean up our tracking
      this.#subscriptionIds.delete(symbolKey);

      // Clean up price cache for these symbols
      symbols.forEach(symbol => this.#priceCache.delete(symbol));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown unsubscription error';
      throw new Error(`Failed to unsubscribe from price updates: ${errorMessage}`);
    }
  }

  /**
   * Get current cached prices for specified symbols
   * 
   * @param symbols - Symbols to get prices for (optional, returns all if not specified)
   * @returns Current price data
   */
  getPrices(symbols?: string[]): Record<string, PriceData> {
    const result: Record<string, PriceData> = {};
    
    if (symbols) {
      symbols.forEach(symbol => {
        const priceData = this.#priceCache.get(symbol);
        if (priceData) {
          result[symbol] = priceData;
        }
      });
    } else {
      // Return all cached prices
      this.#priceCache.forEach((priceData, symbol) => {
        result[symbol] = priceData;
      });
    }

    return result;
  }

  /**
   * Handle price notifications from WebSocket subscriptions
   * 
   * @private
   */
  #handlePriceNotification(payload: ServerNotificationMessage): void {
    if (payload.event === 'price_update') {
      this.#handlePriceUpdate(payload.data as PriceData);
    } else if (payload.event === 'price_subscription_confirmed') {
      this.#handleSubscriptionConfirmed(payload.data);
    } else if (payload.event === 'price_subscription_error') {
      this.#handleSubscriptionError(payload.data);
    }
  }

  /**
   * Set up WebSocket connection event handlers
   * 
   * @private
   */
  #setupWebSocketHandlers(): void {
    // Handle connection events for resubscription
    const disconnectedHandlerCleanup = () => {
      this.#webSocketService.off(WebSocketEventType.DISCONNECTED, this.#handleDisconnected);
    };
    this.#webSocketService.on(WebSocketEventType.DISCONNECTED, this.#handleDisconnected);
    this.#watcherCleanups.push(disconnectedHandlerCleanup);

    const reconnectedHandlerCleanup = () => {
      this.#webSocketService.off(WebSocketEventType.RECONNECTED, this.#handleReconnected);
    };
    this.#webSocketService.on(WebSocketEventType.RECONNECTED, this.#handleReconnected);
    this.#watcherCleanups.push(reconnectedHandlerCleanup);
  }

  /**
   * Handle WebSocket disconnection
   */
  #handleDisconnected = (): void => {
    // Connection lost - subscriptions will be restored on reconnection
  };

  /**
   * Handle WebSocket reconnection
   */
  #handleReconnected = (): void => {
    this.#resubscribeAll();
  };

  /**
   * Handle incoming price update messages
   * 
   * @param priceData - Updated price data
   * @private
   */
  #handlePriceUpdate(priceData: PriceData): void {
    const previousPrice = this.#priceCache.get(priceData.symbol);
    
    // Update cache
    this.#priceCache.set(priceData.symbol, priceData);

    // Always emit the price update
    this.#messenger.publish(`PriceService:priceUpdated`, priceData);
  }

  /**
   * Handle subscription confirmation messages
   * 
   * @param payload - Confirmation payload
   * @private
   */
  #handleSubscriptionConfirmed(payload: any): void {
    this.#messenger.publish(`PriceService:subscriptionConfirmed`, payload);
  }

  /**
   * Handle subscription error messages
   * 
   * @param payload - Error payload
   * @private
   */
  #handleSubscriptionError(payload: any): void {
    this.#messenger.publish(`PriceService:subscriptionError`, payload);
  }

  /**
   * Resubscribe to all active subscriptions (used after reconnection)
   * 
   * @private
   */
  async #resubscribeAll(): Promise<void> {
    const symbolKeys = Array.from(this.#subscriptionIds.keys());
    
    // Clear existing subscription tracking since we're reconnecting
    this.#subscriptionIds.clear();
    
    // Resubscribe to all symbol combinations
    for (const symbolKey of symbolKeys) {
      try {
        const symbols = symbolKey.split(',');
        await this.subscribe({
          symbols,
          // Use default options for resubscription
          interval: this.#options.defaultInterval,
          includeMarketCap: false,
          includeVolume: true,
        });
      } catch (error) {
        console.error('Failed to resubscribe to price updates:', error);
      }
    }
  }

  /**
   * Generate a unique subscription ID from symbols
   * 
   * @param symbols - Array of symbols
   * @returns Subscription ID
   * @private
   */
  #generateSubscriptionId(symbols: string[]): string {
    return symbols.sort().join(',');
  }

  /**
   * Clean up all WebSocket watchers and event handlers
   * Call this when the service is being destroyed
   */
  cleanup(): void {
    // Clean up all watchers
    this.#watcherCleanups.forEach(cleanup => cleanup());
    this.#watcherCleanups = [];
    
    // Clear all cached data
    this.#subscriptionIds.clear();
    this.#priceCache.clear();
  }
} 