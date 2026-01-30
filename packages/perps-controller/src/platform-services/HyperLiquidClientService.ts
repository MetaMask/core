import type { Hex } from '@metamask/utils';
import {
  ExchangeClient,
  HttpTransport,
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from '@nktkas/hyperliquid';

import { HYPERLIQUID_TRANSPORT_CONFIG } from '../constants/hyperLiquidConfig';
import type { HyperLiquidNetwork } from '../constants/hyperLiquidConfig';
import { PERPS_CONSTANTS } from '../constants/perpsConfig';
import { PERPS_ERROR_CODES } from '../constants/perpsErrorCodes';
import type {
  SubscribeCandlesParams,
  PerpsPlatformDependencies,
} from '../types';
import type { CandleData, CandlePeriod } from '../types/chart';
import { calculateCandleCount } from '../utils/chartUtils';

/**
 * Ensures we have a proper Error object for logging.
 * Converts unknown/string errors to proper Error instances.
 *
 * @param error - The caught error (could be Error, string, or unknown)
 * @returns A proper Error instance
 */
function ensureError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

/**
 * Valid time intervals for historical candle data
 * Uses CandlePeriod enum for type safety
 */
export type ValidCandleInterval = CandlePeriod;

/**
 * Connection states for WebSocket management
 */
export enum WebSocketConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnecting = 'disconnecting',
}

/**
 * Maximum number of reconnection attempts before giving up
 */
const MAX_RECONNECTION_ATTEMPTS = 10;

/**
 * Service for managing HyperLiquid SDK clients
 * Handles initialization, transport creation, and client lifecycle
 */
export class HyperLiquidClientService {
  #exchangeClient?: ExchangeClient;

  #infoClient?: InfoClient; // WebSocket transport (default)

  #infoClientHttp?: InfoClient; // HTTP transport (fallback)

  #subscriptionClient?: SubscriptionClient<{
    transport: WebSocketTransport;
  }>;

  #wsTransport?: WebSocketTransport;

  #httpTransport?: HttpTransport;

  #isTestnet: boolean;

  #connectionState: WebSocketConnectionState =
    WebSocketConnectionState.Disconnected;

  #disconnectionPromise: Promise<void> | null = null;

  // Callback for SDK terminate event (fired when all reconnection attempts exhausted)
  #onTerminateCallback: ((error: Error) => void) | null = null;

  #onReconnectCallback?: () => Promise<void>;

  // Reconnection attempt counter
  #reconnectionAttempt = 0;

  // Connection state change listeners for event-based notifications
  readonly #connectionStateListeners: Set<
    (state: WebSocketConnectionState, reconnectionAttempt: number) => void
  > = new Set();

  // Timeout reference for reconnection retry, tracked to enable cancellation on disconnect
  #reconnectionRetryTimeout: ReturnType<typeof setTimeout> | null = null;

  // Platform dependencies for logging
  readonly #deps: PerpsPlatformDependencies;

  // Flag to prevent concurrent reconnection attempts
  #isReconnecting = false;

  /**
   * Creates a new HyperLiquidClientService instance.
   *
   * @param deps - Platform dependencies for logging
   * @param options - Configuration options
   * @param options.isTestnet - Whether to use testnet mode
   */
  constructor(
    deps: PerpsPlatformDependencies,
    options: { isTestnet?: boolean } = {},
  ) {
    this.#deps = deps;
    this.#isTestnet = options.isTestnet ?? false;
  }

  /**
   * Initialize all HyperLiquid SDK clients
   *
   * IMPORTANT: This method awaits transport.ready() to ensure the WebSocket is
   * in OPEN state before marking initialization complete. This prevents race
   * conditions where subscriptions are attempted before the WebSocket handshake
   * completes (which would cause "subscribe error: undefined" errors).
   *
   * @param wallet - Wallet adapter with signTypedData capability
   * @param wallet.address - The wallet address
   * @param wallet.signTypedData - Function to sign typed data
   * @param wallet.getChainId - Optional function to get chain ID
   */
  public async initialize(wallet: {
    address?: Hex;
    signTypedData: (params: {
      domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Hex;
      };
      types: {
        [key: string]: { name: string; type: string }[];
      };
      primaryType: string;
      message: Record<string, unknown>;
    }) => Promise<Hex>;
    getChainId?: () => Promise<number>;
  }): Promise<void> {
    try {
      this.#updateConnectionState(WebSocketConnectionState.Connecting);
      this.#createTransports();

      // Ensure transports are created
      if (!this.#httpTransport || !this.#wsTransport) {
        throw new Error('Failed to create transports');
      }

      // Wallet adapter implements AbstractViemJsonRpcAccount interface with signTypedData method
      // ExchangeClient uses HTTP transport for write operations (orders, approvals, etc.)

      this.#exchangeClient = new ExchangeClient({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        wallet: wallet as any,
        transport: this.#httpTransport,
      });

      // InfoClient with WebSocket transport (default) - multiplexed requests over single connection
      this.#infoClient = new InfoClient({ transport: this.#wsTransport });

      // InfoClient with HTTP transport (fallback) - for specific calls if WebSocket has issues
      this.#infoClientHttp = new InfoClient({ transport: this.#httpTransport });

      // SubscriptionClient uses WebSocket transport for real-time pub/sub (price feeds, position updates)
      this.#subscriptionClient = new SubscriptionClient({
        transport: this.#wsTransport,
      });

      // Wait for WebSocket to actually be ready before setting CONNECTED
      // This ensures we have a real connection, not just client objects
      await this.#wsTransport.ready();

      this.#updateConnectionState(WebSocketConnectionState.Connected);

      this.#deps.debugLogger.log('HyperLiquid SDK clients initialized', {
        testnet: this.#isTestnet,
        timestamp: new Date().toISOString(),
        connectionState: this.#connectionState,
        note: 'Using WebSocket for InfoClient (default), HTTP fallback available',
      });
    } catch (error) {
      // Cleanup on failure to prevent leaks and ensure isInitialized() returns false
      // Clear clients first, then transports
      this.#subscriptionClient = undefined;
      this.#infoClient = undefined;
      this.#infoClientHttp = undefined;
      this.#exchangeClient = undefined;

      // Close WebSocket transport to release resources and event listeners
      if (this.#wsTransport) {
        try {
          await this.#wsTransport.close();
        } catch {
          // Ignore cleanup errors
        }
        this.#wsTransport = undefined;
      }
      this.#httpTransport = undefined;

      const errorInstance = ensureError(error);
      this.#updateConnectionState(WebSocketConnectionState.Disconnected);

      // Log to Sentry: initialization failure blocks all Perps functionality
      this.#deps.logger.error(errorInstance, {
        tags: {
          feature: PERPS_CONSTANTS.FeatureName,
          service: 'HyperLiquidClientService',
          network: this.#isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: 'sdk_initialization',
          data: {
            operation: 'initialize',
            isTestnet: this.#isTestnet,
          },
        },
      });

      throw error;
    }
  }

  /**
   * Create HTTP and WebSocket transports
   * - HTTP for InfoClient and ExchangeClient (request/response operations)
   * - WebSocket for SubscriptionClient (real-time pub/sub)
   *
   * Both transports use SDK's built-in endpoint resolution via isTestnet flag
   *
   * @returns The created WebSocket transport
   */
  #createTransports(): WebSocketTransport {
    // Prevent duplicate transport creation and listener accumulation
    // This guards against re-entry if initialize() is called multiple times
    // (e.g., after a failed initialization attempt that didn't properly clean up)
    if (this.#wsTransport && this.#httpTransport) {
      this.#deps.debugLogger.log(
        'HyperLiquid: Transports already exist, skipping creation',
      );
      return this.#wsTransport;
    }

    this.#deps.debugLogger.log('HyperLiquid: Creating transports', {
      isTestnet: this.#isTestnet,
      timestamp: new Date().toISOString(),
      note: 'SDK will auto-select endpoints based on isTestnet flag',
    });

    // HTTP transport for request/response operations (InfoClient, ExchangeClient)
    // SDK automatically selects: mainnet (https://api.hyperliquid.xyz) or testnet (https://api.hyperliquid-testnet.xyz)
    this.#httpTransport = new HttpTransport({
      isTestnet: this.#isTestnet,
      timeout: HYPERLIQUID_TRANSPORT_CONFIG.timeout,
    });

    // WebSocket transport for real-time subscriptions (SubscriptionClient)
    // SDK automatically selects: mainnet (wss://api.hyperliquid.xyz/ws) or testnet (wss://api.hyperliquid-testnet.xyz/ws)
    this.#wsTransport = new WebSocketTransport({
      isTestnet: this.#isTestnet,
      ...HYPERLIQUID_TRANSPORT_CONFIG,
      reconnect: {
        ...HYPERLIQUID_TRANSPORT_CONFIG.reconnect,
        // Use globalThis.WebSocket for cross-platform compatibility (Node.js and browser)

        WebSocket: globalThis.WebSocket,
      },
    });

    // Listen for WebSocket termination (fired when SDK exhausts all reconnection attempts)
    this.#wsTransport.socket.addEventListener('terminate', (event: Event) => {
      const customEvent = event as CustomEvent;
      this.#deps.debugLogger.log('HyperLiquid: WebSocket terminated', {
        reason: customEvent.detail?.code,
        timestamp: new Date().toISOString(),
      });

      this.#updateConnectionState(WebSocketConnectionState.Disconnected);

      if (this.#onTerminateCallback) {
        const terminateError =
          customEvent.detail instanceof Error
            ? customEvent.detail
            : new Error(
                `WebSocket terminated: ${customEvent.detail?.code ?? 'unknown'}`,
              );
        this.#onTerminateCallback(terminateError);
      }
    });

    return this.#wsTransport;
  }

  /**
   * Toggle testnet mode and reinitialize clients
   *
   * @param wallet - Wallet adapter with signTypedData capability
   * @param wallet.address - The wallet address
   * @param wallet.signTypedData - Function to sign typed data
   * @param wallet.getChainId - Optional function to get chain ID
   * @returns The new network mode
   */
  public async toggleTestnet(wallet: {
    address?: Hex;
    signTypedData: (params: {
      domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Hex;
      };
      types: {
        [key: string]: { name: string; type: string }[];
      };
      primaryType: string;
      message: Record<string, unknown>;
    }) => Promise<Hex>;
    getChainId?: () => Promise<number>;
  }): Promise<HyperLiquidNetwork> {
    this.#isTestnet = !this.#isTestnet;
    await this.initialize(wallet);
    return this.#isTestnet ? 'testnet' : 'mainnet';
  }

  /**
   * Check if clients are properly initialized
   *
   * @returns True if all clients are initialized
   */
  public isInitialized(): boolean {
    return Boolean(
      this.#exchangeClient &&
        this.#infoClient &&
        this.#infoClientHttp &&
        this.#subscriptionClient,
    );
  }

  /**
   * Ensure clients are initialized, throw if not
   */
  public ensureInitialized(): void {
    if (!this.isInitialized()) {
      throw new Error(PERPS_ERROR_CODES.CLIENT_NOT_INITIALIZED);
    }
  }

  /**
   * Recreate subscription client if needed (for reconnection scenarios)
   *
   * @param wallet - Wallet adapter with signTypedData capability
   * @param wallet.address - The wallet address
   * @param wallet.signTypedData - Function to sign typed data
   * @param wallet.getChainId - Optional function to get chain ID
   */
  public async ensureSubscriptionClient(wallet: {
    address?: Hex;
    signTypedData: (params: {
      domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: Hex;
      };
      types: {
        [key: string]: { name: string; type: string }[];
      };
      primaryType: string;
      message: Record<string, unknown>;
    }) => Promise<Hex>;
    getChainId?: () => Promise<number>;
  }): Promise<void> {
    if (!this.#subscriptionClient) {
      this.#deps.debugLogger.log(
        'HyperLiquid: Recreating subscription client after disconnect',
      );
      await this.initialize(wallet);
    }
  }

  /**
   * Get the exchange client
   *
   * @returns The exchange client
   */
  public getExchangeClient(): ExchangeClient {
    this.ensureInitialized();
    if (!this.#exchangeClient) {
      throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
    }
    return this.#exchangeClient;
  }

  /**
   * Get the info client
   *
   * @param options - Options for client selection
   * @param options.useHttp - Force HTTP transport instead of WebSocket (default: false)
   * @returns InfoClient instance with the selected transport
   */
  public getInfoClient(options?: { useHttp?: boolean }): InfoClient {
    this.ensureInitialized();

    if (options?.useHttp) {
      if (!this.#infoClientHttp) {
        throw new Error(PERPS_ERROR_CODES.INFO_CLIENT_NOT_AVAILABLE);
      }
      return this.#infoClientHttp;
    }

    if (!this.#infoClient) {
      throw new Error(PERPS_ERROR_CODES.INFO_CLIENT_NOT_AVAILABLE);
    }
    return this.#infoClient;
  }

  /**
   * Get the subscription client
   *
   * @returns The subscription client or undefined if not initialized
   */
  public getSubscriptionClient():
    | SubscriptionClient<{ transport: WebSocketTransport }>
    | undefined {
    if (!this.#subscriptionClient) {
      this.#deps.debugLogger.log('SubscriptionClient not initialized');
      return undefined;
    }
    return this.#subscriptionClient;
  }

  /**
   * Ensures the WebSocket transport is in OPEN state and ready for subscriptions.
   * This MUST be called before any subscription operations to prevent race conditions.
   *
   * The SDK's `transport.ready()` method:
   * - Returns immediately if WebSocket is already in OPEN state
   * - Waits for the "open" event if WebSocket is in CONNECTING state
   * - Supports AbortSignal for timeout/cancellation
   *
   * @param timeoutMs - Maximum time to wait for transport ready (default 5000ms)
   * @throws Error if transport not ready within timeout or subscription client unavailable
   */
  public async ensureTransportReady(timeoutMs: number = 5000): Promise<void> {
    const subscriptionClient = this.getSubscriptionClient();
    if (!subscriptionClient) {
      throw new Error('Subscription client not initialized');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      await subscriptionClient.config_.transport.ready(controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `WebSocket transport ready timeout after ${timeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get current network state
   *
   * @returns The current network ('mainnet' or 'testnet')
   */
  public getNetwork(): HyperLiquidNetwork {
    return this.#isTestnet ? 'testnet' : 'mainnet';
  }

  /**
   * Check if running on testnet
   *
   * @returns True if running on testnet
   */
  public isTestnetMode(): boolean {
    return this.#isTestnet;
  }

  /**
   * Update testnet mode
   *
   * @param testnet - Whether to use testnet
   */
  public setTestnetMode(testnet: boolean): void {
    this.#isTestnet = testnet;
  }

  /**
   * Fetch historical candle data using the HyperLiquid SDK
   *
   * @param symbol - The asset symbol (e.g., "BTC", "ETH")
   * @param interval - The interval (e.g., "1m", "5m", "15m", "30m", "1h", "2h", "4h", "8h", "12h", "1d", "3d", "1w", "1M")
   * @param limit - Number of candles to fetch (default: 100)
   * @param endTime - End timestamp in milliseconds (default: now). Used for fetching historical data before a specific time.
   * @returns Promise resolving to CandleData or null
   */
  public async fetchHistoricalCandles(
    symbol: string,
    interval: ValidCandleInterval,
    limit: number = 100,
    endTime?: number,
  ): Promise<CandleData | null> {
    this.ensureInitialized();

    try {
      // Calculate start and end times based on interval and limit
      const now = endTime ?? Date.now();
      const intervalMs = this.#getIntervalMilliseconds(interval);
      const startTime = now - limit * intervalMs;

      // Use the SDK's InfoClient to fetch candle data
      // HyperLiquid SDK uses 'coin' terminology
      const infoClient = this.getInfoClient();
      const data = await infoClient.candleSnapshot({
        coin: symbol, // Map to HyperLiquid SDK's 'coin' parameter
        interval,
        startTime,
        endTime: now,
      });

      // Transform API response to match expected format
      if (Array.isArray(data) && data.length > 0) {
        const candles = data.map((candle) => ({
          time: candle.t, // open time
          open: candle.o.toString(),
          high: candle.h.toString(),
          low: candle.l.toString(),
          close: candle.c.toString(),
          volume: candle.v.toString(),
        }));

        return {
          symbol,
          interval,
          candles,
        };
      }

      return {
        symbol,
        interval,
        candles: [],
      };
    } catch (error) {
      const errorInstance = ensureError(error);

      // Log to Sentry: prevents initial chart data load
      this.#deps.logger.error(errorInstance, {
        tags: {
          feature: PERPS_CONSTANTS.FeatureName,
          service: 'HyperLiquidClientService',
          network: this.#isTestnet ? 'testnet' : 'mainnet',
        },
        context: {
          name: 'historical_candles_api',
          data: {
            operation: 'fetchHistoricalCandles',
            symbol,
            interval,
            limit,
            hasEndTime: endTime !== undefined,
          },
        },
      });

      throw error;
    }
  }

  /**
   * Subscribe to candle updates via WebSocket
   *
   * @param params - Subscription parameters
   * @param params.symbol - The asset symbol (e.g., "BTC", "ETH")
   * @param params.interval - The interval (e.g., "1m", "5m", "15m", etc.)
   * @param params.duration - Optional time duration for calculating initial fetch size
   * @param params.callback - Function called with updated candle data
   * @param params.onError - Optional function called if subscription initialization fails
   * @returns Cleanup function to unsubscribe
   */
  public subscribeToCandles({
    symbol,
    interval,
    duration,
    callback,
    onError,
  }: SubscribeCandlesParams): () => void {
    this.ensureInitialized();

    const subscriptionClient = this.getSubscriptionClient();
    if (!subscriptionClient) {
      throw new Error(PERPS_ERROR_CODES.SUBSCRIPTION_CLIENT_NOT_AVAILABLE);
    }

    let currentCandleData: CandleData | null = null;
    let wsUnsubscribe: (() => void) | null = null;
    let isUnsubscribed = false;

    // Calculate initial fetch size dynamically based on duration and interval
    // Match main branch behavior: up to 500 candles initially
    const initialLimit = duration
      ? Math.min(calculateCandleCount(duration, interval), 500)
      : 100; // Default to 100 if no duration provided

    // Helper to handle candle event updates
    const handleCandleEvent = (candleEvent: {
      t: number;
      o: string;
      h: string;
      l: string;
      c: string;
      v: string;
    }): void => {
      // Don't process events if already unsubscribed
      if (isUnsubscribed) {
        return;
      }

      // Transform SDK CandleEvent to our Candle format
      const newCandle = {
        time: candleEvent.t,
        open: candleEvent.o.toString(),
        high: candleEvent.h.toString(),
        low: candleEvent.l.toString(),
        close: candleEvent.c.toString(),
        volume: candleEvent.v.toString(),
      };

      if (currentCandleData) {
        // Check if this is an update to the last candle or a new candle
        const { candles } = currentCandleData;
        const lastCandle = candles[candles.length - 1];

        if (lastCandle && lastCandle.time === newCandle.time) {
          // Update existing candle (live candle update)
          currentCandleData = {
            ...currentCandleData,
            candles: [...candles.slice(0, -1), newCandle],
          };
        } else {
          // New candle (completed candle)
          currentCandleData = {
            ...currentCandleData,
            candles: [...candles, newCandle],
          };
        }
      } else {
        currentCandleData = {
          symbol,
          interval,
          candles: [newCandle],
        };
      }

      callback(currentCandleData);
    };

    // Helper to handle subscription setup
    const setupSubscription = async (): Promise<void> => {
      try {
        // 1. Fetch initial historical data
        const initialData = await this.fetchHistoricalCandles(
          symbol,
          interval,
          initialLimit,
        );

        // Don't proceed if already unsubscribed
        if (isUnsubscribed) {
          return;
        }

        currentCandleData = initialData;
        if (currentCandleData) {
          callback(currentCandleData);
        }

        // 2. Subscribe to WebSocket for new candles
        const sub = await subscriptionClient.candle(
          { coin: symbol, interval },
          handleCandleEvent,
        );

        wsUnsubscribe = (): void => {
          sub.unsubscribe().catch(() => {
            // Ignore unsubscribe errors
          });
        };

        // If already unsubscribed while waiting, clean up immediately
        if (isUnsubscribed && wsUnsubscribe) {
          wsUnsubscribe();
          wsUnsubscribe = null;
        }
      } catch (error) {
        const errorInstance = ensureError(error);

        // Log to Sentry
        this.#deps.logger.error(errorInstance, {
          tags: {
            feature: PERPS_CONSTANTS.FeatureName,
            service: 'HyperLiquidClientService',
            network: this.#isTestnet ? 'testnet' : 'mainnet',
          },
          context: {
            name: 'candle_subscription',
            data: {
              operation: 'subscribeToCandles',
              symbol,
              interval,
              initialLimit,
            },
          },
        });

        // Notify caller of error
        onError?.(errorInstance);
      }
    };

    // Start the subscription setup (fire and forget with proper error handling)
    setupSubscription().catch(() => {
      // Errors are already handled in setupSubscription
    });

    // Return cleanup function
    return () => {
      isUnsubscribed = true;
      if (wsUnsubscribe) {
        wsUnsubscribe();
        wsUnsubscribe = null;
      }
    };
  }

  /**
   * Convert interval string to milliseconds
   *
   * @param interval - The candle period
   * @returns Interval duration in milliseconds
   */
  #getIntervalMilliseconds(interval: CandlePeriod): number {
    const intervalMap: Record<string, number> = {
      '1m': 1 * 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '8h': 8 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000, // Approximate
    };

    return intervalMap[interval] ?? 60 * 60 * 1000; // Default to 1 hour
  }

  /**
   * Disconnect and cleanup all clients
   *
   * @returns Promise that resolves when disconnection is complete
   */
  public async disconnect(): Promise<void> {
    // Return existing promise if already disconnecting
    if (this.#disconnectionPromise) {
      await this.#disconnectionPromise;
      return;
    }

    // If already disconnected, return immediately
    if (this.#connectionState === WebSocketConnectionState.Disconnected) {
      return;
    }

    // Create and store the disconnection promise
    this.#disconnectionPromise = this.#performDisconnection();

    try {
      await this.#disconnectionPromise;
    } finally {
      this.#disconnectionPromise = null;
    }
  }

  /**
   * Perform the actual disconnection
   */
  async #performDisconnection(): Promise<void> {
    try {
      this.#updateConnectionState(WebSocketConnectionState.Disconnecting);

      this.#deps.debugLogger.log('HyperLiquid: Disconnecting SDK clients', {
        isTestnet: this.#isTestnet,
        timestamp: new Date().toISOString(),
        connectionState: this.#connectionState,
      });

      // Clear callbacks
      this.#onReconnectCallback = undefined;
      this.#onTerminateCallback = null;

      // Cancel any pending reconnection retry timeout
      if (this.#reconnectionRetryTimeout) {
        clearTimeout(this.#reconnectionRetryTimeout);
        this.#reconnectionRetryTimeout = null;
      }

      // Clear connection state listeners to prevent stale callbacks
      this.#connectionStateListeners.clear();

      // Reset reconnection flag to allow future manual retries
      // This prevents a race condition where disconnecting during an active
      // reconnection attempt could leave the flag stuck, blocking subsequent retries
      this.#isReconnecting = false;

      // Close WebSocket transport only (HTTP is stateless)
      if (this.#wsTransport) {
        try {
          await this.#wsTransport.close();
          this.#deps.debugLogger.log(
            'HyperLiquid: Closed WebSocket transport',
            {
              timestamp: new Date().toISOString(),
            },
          );
        } catch (error) {
          this.#deps.logger.error(ensureError(error), {
            context: {
              name: 'HyperLiquidClientService.performDisconnection',
              data: { action: 'close_transport' },
            },
          });
        }
      }

      // Clear client references
      this.#subscriptionClient = undefined;
      this.#exchangeClient = undefined;
      this.#infoClient = undefined;
      this.#infoClientHttp = undefined;
      this.#wsTransport = undefined;
      this.#httpTransport = undefined;

      this.#updateConnectionState(WebSocketConnectionState.Disconnected);

      this.#deps.debugLogger.log(
        'HyperLiquid: SDK clients fully disconnected',
        {
          timestamp: new Date().toISOString(),
          connectionState: this.#connectionState,
        },
      );
    } catch (error) {
      this.#updateConnectionState(WebSocketConnectionState.Disconnected);
      this.#deps.logger.error(ensureError(error), {
        context: {
          name: 'HyperLiquidClientService.performDisconnection',
          data: { action: 'outer_catch' },
        },
      });
      throw error;
    }
  }

  /**
   * Get current WebSocket connection state
   *
   * @returns The current connection state
   */
  public getConnectionState(): WebSocketConnectionState {
    return this.#connectionState;
  }

  /**
   * Check if WebSocket is fully disconnected
   *
   * @returns True if disconnected
   */
  public isDisconnected(): boolean {
    return this.#connectionState === WebSocketConnectionState.Disconnected;
  }

  /**
   * Set callback to be invoked when reconnection is needed
   * This allows the service to notify external components (like PerpsConnectionManager)
   * when a connection drop is detected
   *
   * @param callback - Callback to invoke on reconnection
   */
  public setOnReconnectCallback(callback: () => Promise<void>): void {
    this.#onReconnectCallback = callback;
  }

  /**
   * Set callback for WebSocket termination events
   * Called when the SDK exhausts all reconnection attempts
   *
   * @param callback - Callback to invoke on termination
   */
  public setOnTerminateCallback(
    callback: ((error: Error) => void) | null,
  ): void {
    this.#onTerminateCallback = callback;
  }

  /**
   * Subscribe to connection state changes.
   * The listener will be called immediately with the current state and whenever the state changes.
   *
   * @param listener - Callback function that receives the new connection state and reconnection attempt
   * @returns Unsubscribe function to remove the listener
   */
  public subscribeToConnectionState(
    listener: (
      state: WebSocketConnectionState,
      reconnectionAttempt: number,
    ) => void,
  ): () => void {
    this.#connectionStateListeners.add(listener);

    // Immediately notify with current state
    // Wrap in try-catch to match notifyConnectionStateListeners behavior
    // This ensures the unsubscribe function is always returned even if listener throws
    try {
      listener(this.#connectionState, this.#reconnectionAttempt);
    } catch {
      // Ignore errors in listeners to prevent breaking subscription mechanism
      // If listener throws, it will be removed when unsubscribe is called
    }

    // Return unsubscribe function
    return () => {
      this.#connectionStateListeners.delete(listener);
    };
  }

  /**
   * Update connection state and notify all listeners
   * Always notifies if state changes OR if we're in CONNECTING state (to update attempt count)
   *
   * @param newState - The new connection state
   */
  #updateConnectionState(newState: WebSocketConnectionState): void {
    const previousState = this.#connectionState;
    const stateChanged = previousState !== newState;
    const isReconnectionAttempt =
      newState === WebSocketConnectionState.Connecting &&
      this.#reconnectionAttempt > 0;

    this.#connectionState = newState;

    // Reset reconnection attempt counter when successfully connected
    if (newState === WebSocketConnectionState.Connected) {
      this.#reconnectionAttempt = 0;
    }

    // Notify if state changed OR if this is a reconnection attempt (to update attempt count)
    if (stateChanged || isReconnectionAttempt) {
      this.#notifyConnectionStateListeners();
    }
  }

  /**
   * Notify all connection state listeners of the current state
   */
  #notifyConnectionStateListeners(): void {
    this.#connectionStateListeners.forEach((listener) => {
      try {
        listener(this.#connectionState, this.#reconnectionAttempt);
      } catch {
        // Ignore errors in listeners to prevent breaking other listeners
      }
    });
  }

  /**
   * Manually trigger a reconnection attempt.
   * This is exposed for UI retry buttons when user wants to force reconnection.
   * Resets the reconnection attempt counter to allow retrying after max attempts.
   *
   * @returns Promise that resolves when reconnection attempt is complete
   */
  public async reconnect(): Promise<void> {
    this.#deps.debugLogger.log(
      '[HyperLiquidClientService] reconnect() called',
      {
        previousAttempt: this.#reconnectionAttempt,
        currentState: this.#connectionState,
      },
    );
    // Reset attempt counter when user manually triggers retry
    this.#reconnectionAttempt = 0;
    await this.#handleConnectionDrop();
    this.#deps.debugLogger.log(
      '[HyperLiquidClientService] reconnect() completed',
      {
        newState: this.#connectionState,
      },
    );
  }

  /**
   * Handle detected connection drop
   * Recreates WebSocket transport and notifies callback to restore subscriptions
   * Will give up after MAX_RECONNECTION_ATTEMPTS and mark status as disconnected
   */
  async #handleConnectionDrop(): Promise<void> {
    // Prevent multiple simultaneous reconnection attempts
    if (this.#isReconnecting) {
      return;
    }

    this.#isReconnecting = true;

    // Increment reconnection attempt counter
    this.#reconnectionAttempt += 1;

    // Check if we've exceeded max retry attempts
    if (this.#reconnectionAttempt > MAX_RECONNECTION_ATTEMPTS) {
      this.#isReconnecting = false;
      this.#updateConnectionState(WebSocketConnectionState.Disconnected);
      return;
    }

    try {
      this.#updateConnectionState(WebSocketConnectionState.Connecting);

      // Close existing WebSocket transport and clear references
      // so createTransports() will create fresh ones
      if (this.#wsTransport) {
        try {
          await this.#wsTransport.close();
        } catch {
          // Ignore errors during close - transport may already be dead
        }
      }
      this.#wsTransport = undefined;
      this.#httpTransport = undefined;

      // Recreate WebSocket transport - returns the new transport for type safety
      const newWsTransport = this.#createTransports();

      // Recreate clients that use WebSocket transport
      this.#infoClient = new InfoClient({ transport: newWsTransport });
      this.#subscriptionClient = new SubscriptionClient({
        transport: newWsTransport,
      });

      await newWsTransport.ready();

      this.#deps.debugLogger.log(
        'HyperLiquid: Transport ready, restoring subscriptions',
        { timestamp: new Date().toISOString() },
      );

      // NOW safe to restore subscriptions
      if (this.#onReconnectCallback) {
        await this.#onReconnectCallback();
      }

      // Cancel any pending retry timeout from previous failed attempts
      if (this.#reconnectionRetryTimeout) {
        clearTimeout(this.#reconnectionRetryTimeout);
        this.#reconnectionRetryTimeout = null;
      }

      this.#updateConnectionState(WebSocketConnectionState.Connected);
      this.#isReconnecting = false;
    } catch {
      // Reset flag before scheduling retry so the next attempt can proceed
      this.#isReconnecting = false;

      // Check if we've exceeded max retry attempts
      if (this.#reconnectionAttempt >= MAX_RECONNECTION_ATTEMPTS) {
        this.#updateConnectionState(WebSocketConnectionState.Disconnected);
        return;
      }

      // Reconnection failed - schedule a retry after a delay
      // Store timeout reference so it can be cancelled on intentional disconnect
      this.#reconnectionRetryTimeout = setTimeout(() => {
        this.#reconnectionRetryTimeout = null; // Clear reference after execution
        // Only retry if we haven't been intentionally disconnected
        // and no manual reconnect() is already in progress
        // Note: State may be CONNECTING or DISCONNECTED (if terminate event fired during reconnect)
        if (
          (this.#connectionState === WebSocketConnectionState.Connecting ||
            this.#connectionState === WebSocketConnectionState.Disconnected) &&
          !this.#disconnectionPromise &&
          !this.#isReconnecting
        ) {
          this.#handleConnectionDrop().catch(() => {
            // Errors are handled internally in handleConnectionDrop
          });
        }
      }, PERPS_CONSTANTS.ReconnectionRetryDelayMs);
    }
  }
}
