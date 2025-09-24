import type { RestrictedMessenger } from '@metamask/base-controller';

const SERVICE_NAME = 'BackendWebSocketService';

/**
 * WebSocket connection states
 */
export enum WebSocketState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

/**
 * WebSocket event types
 */
export enum WebSocketEventType {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  MESSAGE = 'message',
  ERROR = 'error',
  RECONNECTING = 'reconnecting',
  RECONNECTED = 'reconnected',
}

/**
 * Configuration options for the WebSocket service
 */
export type WebSocketServiceOptions = {
  /** The WebSocket URL to connect to */
  url: string;

  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Initial reconnection delay in milliseconds (default: 500) */
  reconnectDelay?: number;

  /** Maximum reconnection delay in milliseconds (default: 5000) */
  maxReconnectDelay?: number;

  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
};

/**
 * Client Request message
 * Used when client sends a request to the server
 */
export type ClientRequestMessage = {
  event: string;
  data: {
    requestId: string;
    channels?: string[];
    [key: string]: unknown;
  };
};

/**
 * Server Response message
 * Used when server responds to a client request
 */
export type ServerResponseMessage = {
  event: string;
  data: {
    requestId: string;
    subscriptionId?: string;
    succeeded?: string[];
    failed?: string[];
    [key: string]: unknown;
  };
};

/**
 * Server Notification message
 * Used when server sends unsolicited data to client
 */
export type ServerNotificationMessage = {
  event: string;
  subscriptionId: string;
  channel: string;
  data: Record<string, unknown>;
};

/**
 * Union type for all WebSocket messages
 */
export type WebSocketMessage =
  | ClientRequestMessage
  | ServerResponseMessage
  | ServerNotificationMessage;

/**
 * Internal subscription storage with full details including callback
 */
export type InternalSubscription = {
  /** Channel names for this subscription */
  channels: string[];
  /** Callback function for handling notifications */
  callback: (notification: ServerNotificationMessage) => void;
  /** Function to unsubscribe and clean up */
  unsubscribe: () => Promise<void>;
};

/**
 * External subscription info with subscription ID (for API responses)
 */
export type SubscriptionInfo = {
  /** The subscription ID from the server */
  subscriptionId: string;
  /** Channel names for this subscription */
  channels: string[];
  /** Function to unsubscribe and clean up */
  unsubscribe: () => Promise<void>;
};

/**
 * Public WebSocket subscription object returned by the subscribe method
 */
export type WebSocketSubscription = {
  /** The subscription ID from the server */
  subscriptionId: string;
  /** Function to unsubscribe and clean up */
  unsubscribe: () => Promise<void>;
};

/**
 * WebSocket connection info
 */
export type WebSocketConnectionInfo = {
  state: WebSocketState;
  url: string;
  reconnectAttempts: number;
  lastError?: string;
  connectedAt?: number;
};

// Action types for the messaging system
export type WebSocketServiceInitAction = {
  type: `BackendWebSocketService:init`;
  handler: WebSocketService['init'];
};

export type WebSocketServiceConnectAction = {
  type: `BackendWebSocketService:connect`;
  handler: WebSocketService['connect'];
};

export type WebSocketServiceDisconnectAction = {
  type: `BackendWebSocketService:disconnect`;
  handler: WebSocketService['disconnect'];
};

export type WebSocketServiceSendMessageAction = {
  type: `BackendWebSocketService:sendMessage`;
  handler: WebSocketService['sendMessage'];
};

export type WebSocketServiceSendRequestAction = {
  type: `BackendWebSocketService:sendRequest`;
  handler: WebSocketService['sendRequest'];
};

export type WebSocketServiceGetConnectionInfoAction = {
  type: `BackendWebSocketService:getConnectionInfo`;
  handler: WebSocketService['getConnectionInfo'];
};

export type WebSocketServiceGetSubscriptionByChannelAction = {
  type: `BackendWebSocketService:getSubscriptionByChannel`;
  handler: WebSocketService['getSubscriptionByChannel'];
};

export type WebSocketServiceIsChannelSubscribedAction = {
  type: `BackendWebSocketService:isChannelSubscribed`;
  handler: WebSocketService['isChannelSubscribed'];
};

export type WebSocketServiceActions =
  | WebSocketServiceInitAction
  | WebSocketServiceConnectAction
  | WebSocketServiceDisconnectAction
  | WebSocketServiceSendMessageAction
  | WebSocketServiceSendRequestAction
  | WebSocketServiceGetConnectionInfoAction
  | WebSocketServiceGetSubscriptionByChannelAction
  | WebSocketServiceIsChannelSubscribedAction;

// Event types for WebSocket connection state changes
export type WebSocketServiceConnectionStateChangedEvent = {
  type: 'BackendWebSocketService:connectionStateChanged';
  payload: [WebSocketConnectionInfo];
};

export type WebSocketServiceEvents = 
  | WebSocketServiceConnectionStateChangedEvent;

export type WebSocketServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  WebSocketServiceActions,
  WebSocketServiceEvents,
  never,
  WebSocketServiceEvents['type']
>;

/**
 * WebSocket Service with automatic reconnection, session management and direct callback routing
 *
 * Real-Time Performance Optimizations:
 * - Fast path message routing (zero allocations)
 * - Production mode removes try-catch overhead
 * - Optimized JSON parsing with fail-fast
 * - Direct callback routing bypasses event emitters
 * - Memory cleanup and resource management
 *
 * Mobile Integration:
 * Mobile apps should handle lifecycle events (background/foreground) by:
 * 1. Calling disconnect() when app goes to background
 * 2. Calling connect() when app returns to foreground
 * 3. Calling cleanup() on app termination
 */
export class WebSocketService {
  readonly #messenger: WebSocketServiceMessenger;

  readonly #options: Required<WebSocketServiceOptions>;

  #ws!: WebSocket;

  #state: WebSocketState = WebSocketState.DISCONNECTED;

  #reconnectAttempts = 0;

  #reconnectTimer: NodeJS.Timeout | null = null;

  // Track the current connection promise to handle concurrent connection attempts
  #connectionPromise: Promise<void> | null = null;

  readonly #pendingRequests = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  #lastError: string | null = null;

  #connectedAt: number | null = null;

  // Simplified subscription storage (single flat map)
  // Key: subscription ID string (e.g., 'sub_abc123def456')
  // Value: InternalSubscription object with channels, callback and metadata
  readonly #subscriptions = new Map<string, InternalSubscription>();

  /**
   * Creates a new WebSocket service instance
   *
   * @param options - Configuration options including messenger
   */
  constructor(
    options: WebSocketServiceOptions & { messenger: WebSocketServiceMessenger },
  ) {
    this.#messenger = options.messenger;

    this.#options = {
      url: options.url,
      timeout: options.timeout ?? 10000,
      reconnectDelay: options.reconnectDelay ?? 500,
      maxReconnectDelay: options.maxReconnectDelay ?? 5000,
      requestTimeout: options.requestTimeout ?? 30000,
    };

    // Register action handlers
    this.#messenger.registerActionHandler(
      `BackendWebSocketService:init`,
      this.init.bind(this),
    );

    this.#messenger.registerActionHandler(
      `BackendWebSocketService:connect`,
      this.connect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `BackendWebSocketService:disconnect`,
      this.disconnect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `BackendWebSocketService:sendMessage`,
      this.sendMessage.bind(this),
    );

    this.#messenger.registerActionHandler(
      `BackendWebSocketService:sendRequest`,
      this.sendRequest.bind(this),
    );

    this.#messenger.registerActionHandler(
      `BackendWebSocketService:getConnectionInfo`,
      this.getConnectionInfo.bind(this),
    );

    this.#messenger.registerActionHandler(
      `BackendWebSocketService:getSubscriptionByChannel`,
      this.getSubscriptionByChannel.bind(this),
    );

    this.#messenger.registerActionHandler(
      `BackendWebSocketService:isChannelSubscribed`,
      this.isChannelSubscribed.bind(this),
    );

    void this.init();
  }

  /**
   * Initializes and connects the WebSocket service
   *
   * @returns Promise that resolves when initialization is complete
   */
  async init(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown initialization error';

      throw new Error(
        `WebSocket service initialization failed: ${errorMessage}`,
      );
    }
  }

  /**
   * Establishes WebSocket connection
   *
   * @returns Promise that resolves when connection is established
   */
  async connect(): Promise<void> {
    // If already connected, return immediately
    if (this.#state === WebSocketState.CONNECTED) {
      return;
    }

    // If already connecting, wait for the existing connection attempt to complete
    if (this.#state === WebSocketState.CONNECTING && this.#connectionPromise) {
      return this.#connectionPromise;
    }

    console.log(`🔄 Starting connection attempt to ${this.#options.url}`);
    this.#setState(WebSocketState.CONNECTING);
    this.#lastError = null;

    // Create and store the connection promise
    this.#connectionPromise = this.#doConnect();

    try {
      await this.#connectionPromise;
      console.log(`✅ Connection attempt succeeded`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown connection error';
      console.error(`❌ Connection attempt failed: ${errorMessage}`);
      this.#lastError = errorMessage;
      this.#setState(WebSocketState.ERROR);

      throw new Error(`Failed to connect to WebSocket: ${errorMessage}`);
    } finally {
      // Clear the connection promise when done (success or failure)
      this.#connectionPromise = null;
    }
  }

  /**
   * Internal method to perform the actual connection
   *
   * @returns Promise that resolves when connection is established
   */
  async #doConnect(): Promise<void> {
    await this.#establishConnection();
  }

  /**
   * Closes WebSocket connection
   *
   * @returns Promise that resolves when disconnection is complete
   */
  async disconnect(): Promise<void> {
    if (
      this.#state === WebSocketState.DISCONNECTED ||
      this.#state === WebSocketState.DISCONNECTING
    ) {
      console.log(`Disconnect called but already in state: ${this.#state}`);
      return;
    }

    console.log(`Manual disconnect initiated - closing WebSocket connection`);

    this.#setState(WebSocketState.DISCONNECTING);
    this.#clearTimers();
    this.#rejectPendingRequests(new Error('WebSocket disconnected'));

    // Clear any pending connection promise
    this.#connectionPromise = null;

    this.#ws.close(1000, 'Normal closure');

    this.#setState(WebSocketState.DISCONNECTED);
    console.log(`WebSocket manually disconnected`);
  }

  /**
   * Sends a message through the WebSocket
   *
   * @param message - The message to send
   * @returns Promise that resolves when message is sent
   */
  async sendMessage(message: ClientRequestMessage): Promise<void> {
    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot send message: WebSocket is ${this.#state}`);
    }

    try {
      this.#ws.send(JSON.stringify(message));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to send message';
      this.#handleError(new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Sends a request and waits for a correlated response
   *
   * @param message - The request message
   * @returns Promise that resolves with the response data
   */
  async sendRequest<T = ServerResponseMessage['data']>(
    message: Omit<ClientRequestMessage, 'data'> & {
      data?: Omit<ClientRequestMessage['data'], 'requestId'>;
    },
  ): Promise<T> {
    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot send request: WebSocket is ${this.#state}`);
    }

    const requestId = this.#generateMessageId();
    const requestMessage: ClientRequestMessage = {
      event: message.event,
      data: {
        requestId,
        ...message.data,
      },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(requestId);
        console.warn(`🔴 Request timeout after ${this.#options.requestTimeout}ms - triggering reconnection`);
        
        // Trigger reconnection on request timeout as it may indicate stale connection
        this.#handleRequestTimeout();
        
        reject(
          new Error(`Request timeout after ${this.#options.requestTimeout}ms`),
        );
      }, this.#options.requestTimeout);

      // Store in pending requests for response correlation
      this.#pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      // Send the request
      this.sendMessage(requestMessage).catch((error) => {
        this.#pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(
          new Error(error instanceof Error ? error.message : 'Unknown error'),
        );
      });
    });
  }

  /**
   * Gets current connection information
   *
   * @returns Current connection status and details
   */
  getConnectionInfo(): WebSocketConnectionInfo {
    return {
      state: this.#state,
      url: this.#options.url,
      reconnectAttempts: this.#reconnectAttempts,
      lastError: this.#lastError ?? undefined,
      connectedAt: this.#connectedAt ?? undefined,
    };
  }

  /**
   * Gets subscription information for a specific channel
   *
   * @param channel - The channel name to look up
   * @returns Subscription details or undefined if not found
   */
  getSubscriptionByChannel(channel: string): SubscriptionInfo | undefined {
    for (const [subscriptionId, subscription] of this.#subscriptions) {
      if (subscription.channels.includes(channel)) {
        return {
          subscriptionId,
          channels: subscription.channels,
          unsubscribe: subscription.unsubscribe,
        };
      }
    }
    return undefined;
  }

  /**
   * Checks if a channel is currently subscribed
   *
   * @param channel - The channel name to check
   * @returns True if the channel is subscribed, false otherwise
   */
  isChannelSubscribed(channel: string): boolean {
    for (const subscription of this.#subscriptions.values()) {
      if (subscription.channels.includes(channel)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clean up resources and close connections
   * Called when service is being destroyed or app is terminating
   */
  cleanup(): void {
    this.#clearTimers();
    this.#subscriptions.clear();

    // Clear any pending connection promise
    this.#connectionPromise = null;

    // Clear all pending requests
    this.#rejectPendingRequests(new Error('Service cleanup'));

    if (this.#ws && this.#ws.readyState === WebSocket.OPEN) {
      this.#ws.close(1000, 'Service cleanup');
    }
  }

  /**
   * Create and manage a subscription with direct callback routing
   *
   * This is the recommended subscription API for high-level services.
   * Uses efficient direct callback routing instead of EventEmitter overhead.
   * The WebSocketService handles all subscription lifecycle management.
   *
   * @param options - Subscription configuration
   * @param options.channels - Array of channel names to subscribe to
   * @param options.callback - Callback function for handling notifications
   * @returns Subscription object with unsubscribe method
   *
   * @example
   * ```typescript
   * // AccountActivityService usage
   * const subscription = await webSocketService.subscribe({
   *   channels: ['account-activity.v1.eip155:0:0x1234...'],
   *   callback: (notification) => {
   *     this.handleAccountActivity(notification.data);
   *   }
   * });
   *
   * // Later, clean up
   * await subscription.unsubscribe();
   * ```
   */
  async subscribe(options: {
    /** Channel names to subscribe to */
    channels: string[];
    /** Handler for incoming notifications */
    callback: (notification: ServerNotificationMessage) => void;
  }): Promise<WebSocketSubscription> {
    const { channels, callback } = options;

    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(
        `Cannot create subscription(s) ${channels.join(', ')}: WebSocket is ${this.#state}`,
      );
    }

    // Send subscription request and wait for response
    const subscriptionResponse = await this.sendRequest<{
      subscriptionId: string;
      succeeded?: string[];
      failed?: string[];
    }>({
      event: 'subscribe',
      data: { channels },
    });

    if (!subscriptionResponse?.subscriptionId) {
      throw new Error('Invalid subscription response: missing subscription ID');
    }

    const { subscriptionId } = subscriptionResponse;

    // Check for failures
    if (subscriptionResponse.failed && subscriptionResponse.failed.length > 0) {
      throw new Error(
        `Subscription failed for channels: ${subscriptionResponse.failed.join(', ')}`,
      );
    }

    // Create unsubscribe function
    const unsubscribe = async (): Promise<void> => {
      try {
        // Send unsubscribe request first
        await this.sendRequest({
          event: 'unsubscribe',
          data: {
            subscription: subscriptionId,
            channels,
          },
        });

        // Clean up subscription mapping
        this.#subscriptions.delete(subscriptionId);
      } catch (error) {
        console.error('Failed to unsubscribe:', error);
        throw error;
      }
    };

    const subscription = {
      subscriptionId,
      unsubscribe,
    };

    // Store subscription with subscription ID as key
    this.#subscriptions.set(subscriptionId, {
      channels: [...channels], // Store copy of channels
      callback,
      unsubscribe,
    });

    return subscription;
  }


  /**
   * Establishes the actual WebSocket connection
   *
   * @returns Promise that resolves when connection is established
   */
  async #establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.#options.url;
      const ws = new WebSocket(wsUrl);
      const connectTimeout = setTimeout(() => {
        console.log(
          `🔴 WebSocket connection timeout after ${this.#options.timeout}ms - forcing close`,
        );
        ws.close();
        reject(
          new Error(`Connection timeout after ${this.#options.timeout}ms`),
        );
      }, this.#options.timeout);

      ws.onopen = () => {
        console.log(`✅ WebSocket connection opened successfully`);
        clearTimeout(connectTimeout);
        this.#ws = ws;
        this.#setState(WebSocketState.CONNECTED);
        this.#connectedAt = Date.now();

        // Reset reconnect attempts on successful connection
        this.#reconnectAttempts = 0;

        this.#setupEventHandlers();

        resolve();
      };

      ws.onerror = (event: Event) => {
        clearTimeout(connectTimeout);
        console.error(`❌ WebSocket error during connection attempt:`, {
          type: event.type,
          target: event.target,
          url: wsUrl,
          readyState: ws.readyState,
          readyStateName: {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSING',
            3: 'CLOSED',
          }[ws.readyState],
        });
        const error = new Error(
          `WebSocket connection error to ${wsUrl}: readyState=${ws.readyState}`,
        );
        reject(error);
      };

      ws.onclose = (event: CloseEvent) => {
        clearTimeout(connectTimeout);
        console.log(
          `WebSocket closed during connection setup - code: ${event.code} - ${this.#getCloseReason(event.code)}, reason: ${event.reason || 'none'}, state: ${this.#state}`,
        );
        if (this.#state === WebSocketState.CONNECTING) {
          console.log(
            `Connection attempt failed due to close event during CONNECTING state`,
          );
          reject(
            new Error(
              `WebSocket connection closed during connection: ${event.code} ${event.reason}`,
            ),
          );
        } else {
          // If we're not connecting, handle it as a normal close event
          console.log(`Handling close event as normal disconnection`);
          this.#handleClose(event);
        }
      };
    });
  }

  /**
   * Sets up WebSocket event handlers
   */
  #setupEventHandlers(): void {
    console.log('Setting up WebSocket event handlers for operational phase');

    this.#ws.onmessage = (event: MessageEvent) => {
      // Fast path: Optimized parsing for mobile real-time performance
      const message = this.#parseMessage(event.data);
      if (message) {
        this.#handleMessage(message);
      }
      // Note: Parse errors are silently ignored for mobile performance
    };

    this.#ws.onclose = (event: CloseEvent) => {
      console.log(
        `WebSocket onclose event triggered - code: ${event.code}, reason: ${event.reason || 'none'}, wasClean: ${event.wasClean}`,
      );
      this.#handleClose(event);
    };

    this.#ws.onerror = (event: Event) => {
      console.log(`WebSocket onerror event triggered:`, event);
      this.#handleError(new Error(`WebSocket error: ${event.type}`));
    };
  }

  /**
   * Handles incoming WebSocket messages (optimized for mobile real-time performance)
   *
   * @param message - The WebSocket message to handle
   */
  #handleMessage(message: WebSocketMessage): void {
    // Fast path: Check message type using property existence (mobile optimization)
    const hasEvent = 'event' in message;
    const hasSubscriptionId = 'subscriptionId' in message;
    const hasData = 'data' in message;

    // Handle server responses (correlated with requests)
    if (
      'data' in message &&
      message.data &&
      typeof message.data === 'object' &&
      'requestId' in message.data
    ) {
      const responseMessage = message as ServerResponseMessage;
      const { requestId } = responseMessage.data;

      if (this.#pendingRequests.has(requestId)) {
        const request = this.#pendingRequests.get(requestId);
        if (!request) {
          return;
        }
        this.#pendingRequests.delete(requestId);
        clearTimeout(request.timeout);

        // Check if the response indicates failure
        if (
          responseMessage.data.failed &&
          responseMessage.data.failed.length > 0
        ) {
          request.reject(
            new Error(
              `Request failed: ${responseMessage.data.failed.join(', ')}`,
            ),
          );
        } else {
          request.resolve(responseMessage.data);
        }
        return;
      }
    }


    // Handle server notifications (optimized for real-time mobile performance)
    if (
      hasSubscriptionId &&
      !(
        hasData &&
        (message as ServerNotificationMessage).data &&
        typeof (message as ServerNotificationMessage).data === 'object' &&
        'requestId' in (message as ServerNotificationMessage).data
      )
    ) {
      const notificationMessage = message as ServerNotificationMessage;
      const { subscriptionId } = notificationMessage;

      // Fast path: Direct callback routing by subscription ID
      const subscription = this.#subscriptions.get(subscriptionId);
      if (subscription) {
        const { callback } = subscription;
        // Development: Full error handling
        if (process.env.NODE_ENV === 'development') {
          try {
            callback(notificationMessage);
          } catch (error) {
            console.error(
              `Error in subscription callback for ${subscriptionId}:`,
              error,
            );
          }
        } else {
          // Production: Direct call for maximum speed
          callback(notificationMessage);
        }
      } else if (process.env.NODE_ENV === 'development') {
        console.warn(
          `No subscription found for subscriptionId: ${subscriptionId}`,
        );
      }
    }
  }

  /**
   * Optimized message parsing for mobile (reduces JSON.parse overhead)
   *
   * @param data - The raw message data to parse
   * @returns Parsed message or null if parsing fails
   */
  #parseMessage(data: string): WebSocketMessage | null {
    try {
      return JSON.parse(data);
    } catch {
      // Fail fast on parse errors (mobile optimization)
      return null;
    }
  }

  /**
   * Handles WebSocket close events (mobile optimized)
   *
   * @param event - The WebSocket close event
   */
  #handleClose(event: CloseEvent): void {
    this.#clearTimers();
    this.#connectedAt = null;

    // Clear any pending connection promise
    this.#connectionPromise = null;

    // Log close reason for debugging
    const closeReason = this.#getCloseReason(event.code);
    console.log(
      `WebSocket closed: ${event.code} - ${closeReason} (reason: ${event.reason || 'none'}) - current state: ${this.#state}`,
    );

    if (this.#state === WebSocketState.DISCONNECTING) {
      // Manual disconnect
      this.#setState(WebSocketState.DISCONNECTED);
      return;
    }

    // For unexpected disconnects, update the state to reflect that we're disconnected
    this.#setState(WebSocketState.DISCONNECTED);

    // Check if we should attempt reconnection based on close code
    const shouldReconnect = this.#shouldReconnectOnClose(event.code);

    if (shouldReconnect) {
      console.log(`Connection lost unexpectedly, will attempt reconnection`);
      this.#scheduleReconnect();
    } else {
      // Non-recoverable error - set error state
      console.log(`Non-recoverable error - close code: ${event.code} - ${closeReason}`);
      this.#setState(WebSocketState.ERROR);
      this.#lastError = `Non-recoverable close code: ${event.code} - ${closeReason}`;
    }
  }

  /**
   * Handles WebSocket errors
   *
   * @param error - Error that occurred
   */
  #handleError(error: Error): void {
    this.#lastError = error.message;
  }

  /**
   * Handles request timeout by forcing reconnection
   * Request timeouts often indicate a stale or broken connection
   */
  #handleRequestTimeout(): void {
    console.log('🔄 Request timeout detected - forcing WebSocket reconnection');
    
    // Only trigger reconnection if we're currently connected
    if (this.#state === WebSocketState.CONNECTED) {
      // Force close the current connection to trigger reconnection logic
      this.#ws.close(1001, 'Request timeout - forcing reconnect');
    } else {
      console.log(`⚠️ Request timeout but WebSocket is ${this.#state} - not forcing reconnection`);
    }
  }

  /**
   * Schedules a reconnection attempt with exponential backoff
   */
  #scheduleReconnect(): void {
    this.#reconnectAttempts += 1;

    const rawDelay =
      this.#options.reconnectDelay * Math.pow(1.5, this.#reconnectAttempts - 1);
    const delay = Math.min(rawDelay, this.#options.maxReconnectDelay);

    console.log(
      `⏱️ Scheduling reconnection attempt #${this.#reconnectAttempts} in ${delay}ms (${(delay / 1000).toFixed(1)}s)`,
    );

    this.#reconnectTimer = setTimeout(() => {
      console.log(
        `🔄 ${delay}ms delay elapsed - starting reconnection attempt #${this.#reconnectAttempts}...`,
      );

      this.connect().catch((error) => {
        console.error(
          `❌ Reconnection attempt #${this.#reconnectAttempts} failed:`,
          error,
        );

        // Always schedule another reconnection attempt
        console.log(
          `Scheduling next reconnection attempt (attempt #${this.#reconnectAttempts})`,
        );
        this.#scheduleReconnect();
      });
    }, delay);
  }

  /**
   * Clears all active timers
   */
  #clearTimers(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }


  /**
   * Rejects all pending requests with the given error
   *
   * @param error - Error to reject with
   */
  #rejectPendingRequests(error: Error): void {
    for (const [, request] of this.#pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.#pendingRequests.clear();

    // Clear subscription callbacks on disconnect
    this.#subscriptions.clear();
  }

  /**
   * Sets the connection state and emits state change events
   *
   * @param newState - The new WebSocket state
   */
  #setState(newState: WebSocketState): void {
    const oldState = this.#state;
    this.#state = newState;

    if (oldState !== newState) {
      console.log(`WebSocket state changed: ${oldState} → ${newState}`);

      // Log disconnection-related state changes
      if (
        newState === WebSocketState.DISCONNECTED ||
        newState === WebSocketState.DISCONNECTING ||
        newState === WebSocketState.ERROR
      ) {
        console.log(
          `🔴 WebSocket disconnection detected - state: ${oldState} → ${newState}`,
        );
      }

      // Publish connection state change event
      try {
        this.#messenger.publish('BackendWebSocketService:connectionStateChanged', this.getConnectionInfo());
      } catch (error) {
        console.error('Failed to publish WebSocket connection state change:', error);
      }
    }
  }

  /**
   * Generates a unique message ID
   *
   * @returns Unique message identifier
   */
  #generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Gets human-readable close reason from RFC 6455 close code
   *
   * @param code - WebSocket close code
   * @returns Human-readable close reason
   */
  #getCloseReason(code: number): string {
    switch (code) {
      case 1000:
        return 'Normal Closure';
      case 1001:
        return 'Going Away';
      case 1002:
        return 'Protocol Error';
      case 1003:
        return 'Unsupported Data';
      case 1004:
        return 'Reserved';
      case 1005:
        return 'No Status Received';
      case 1006:
        return 'Abnormal Closure';
      case 1007:
        return 'Invalid frame payload data';
      case 1008:
        return 'Policy Violation';
      case 1009:
        return 'Message Too Big';
      case 1010:
        return 'Mandatory Extension';
      case 1011:
        return 'Internal Server Error';
      case 1012:
        return 'Service Restart';
      case 1013:
        return 'Try Again Later';
      case 1014:
        return 'Bad Gateway';
      case 1015:
        return 'TLS Handshake';
      default:
        if (code >= 3000 && code <= 3999) {
          return 'Library/Framework Error';
        }
        if (code >= 4000 && code <= 4999) {
          return 'Application Error';
        }
        return 'Unknown';
    }
  }

  /**
   * Determines if reconnection should be attempted based on close code
   *
   * @param code - WebSocket close code
   * @returns True if reconnection should be attempted
   */
  #shouldReconnectOnClose(code: number): boolean {
    console.log(
      `Evaluating if reconnection should be attempted for close code: ${code} - ${this.#getCloseReason(code)}`,
    );

    // Don't reconnect only on normal closure (manual disconnect)
    if (code === 1000) {
      console.log(`Not reconnecting - normal closure (manual disconnect)`);
      return false;
    }

    // For "Going Away" (1001), check the reason to distinguish between client vs server initiated
    if (code === 1001) {
      // If it's a server shutdown, we should retry
      console.log(
        `"Going Away" detected - will reconnect as this may be a temporary server shutdown`,
      );
      return true;
    }

    // Don't reconnect on client-side errors (4000-4999)
    if (code >= 4000 && code <= 4999) {
      console.log(`Not reconnecting - client-side error (${code})`);
      return false;
    }

    // Don't reconnect on certain protocol errors
    if (code === 1002 || code === 1003 || code === 1007 || code === 1008) {
      console.log(`Not reconnecting - protocol error (${code})`);
      return false;
    }

    // Reconnect on server errors and temporary issues
    console.log(`Will reconnect - treating as temporary server issue`);
    return true;
  }
}