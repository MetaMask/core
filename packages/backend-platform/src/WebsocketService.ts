import type { RestrictedMessenger } from '@metamask/base-controller';
import { v4 as uuidV4 } from 'uuid';
import type { WebSocketServiceMethodActions } from './WebsocketService-method-action-types';

const SERVICE_NAME = 'BackendWebSocketService' as const;

const MESSENGER_EXPOSED_METHODS = [
  'connect',
  'disconnect', 
  'sendMessage',
  'sendRequest',
  'getConnectionInfo',
  'getSubscriptionByChannel',
  'isChannelSubscribed',
  'addChannelCallback',
  'removeChannelCallback',
  'getChannelCallbacks',
] as const;

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

  /** The messenger for inter-service communication */
  messenger: WebSocketServiceMessenger;

  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Initial reconnection delay in milliseconds (default: 500) */
  reconnectDelay?: number;

  /** Maximum reconnection delay in milliseconds (default: 5000) */
  maxReconnectDelay?: number;

  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;

  /** Optional callback to determine if connection should be enabled (default: always enabled) */
  enabledCallback?: () => boolean;
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
 * subscriptionId is optional for system-wide notifications
 */
export type ServerNotificationMessage = {
  event: string;
  subscriptionId?: string;
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
 * Channel-based callback configuration
 */
export type ChannelCallback = {
  /** Channel name to match (also serves as the unique identifier) */
  channelName: string;
  /** Callback function */
  callback: (notification: ServerNotificationMessage) => void;
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

// Action types for the messaging system - using generated method actions
export type WebSocketServiceActions = WebSocketServiceMethodActions;

export type WebSocketServiceAllowedActions = never;

export type WebSocketServiceAllowedEvents = never;

// Event types for WebSocket connection state changes
export type WebSocketServiceConnectionStateChangedEvent = {
  type: 'BackendWebSocketService:connectionStateChanged';
  payload: [WebSocketConnectionInfo];
};

export type WebSocketServiceEvents =
  WebSocketServiceConnectionStateChangedEvent;

export type WebSocketServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  WebSocketServiceActions | WebSocketServiceAllowedActions,
  WebSocketServiceEvents | WebSocketServiceAllowedEvents,
  WebSocketServiceAllowedActions['type'],
  WebSocketServiceAllowedEvents['type']
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
 * 3. Calling destroy() on app termination
 */
export class WebSocketService {
  /**
   * The name of the service.
   */
  readonly name = SERVICE_NAME;

  readonly #messenger: WebSocketServiceMessenger;

  readonly #options: Required<Omit<WebSocketServiceOptions, 'messenger' | 'enabledCallback'>>;

  readonly #enabledCallback: (() => boolean) | undefined;

  #ws: WebSocket | undefined;

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

  // Channel-based callback storage
  // Key: channel name (serves as unique identifier)
  // Value: ChannelCallback configuration
  readonly #channelCallbacks = new Map<string, ChannelCallback>();

  /**
   * Extracts error message from unknown error type
   *
   * @param error - Error of unknown type
   * @returns Error message string
   */
  #getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Creates a new WebSocket service instance
   *
   * @param options - Configuration options for the WebSocket service
   */
  constructor(options: WebSocketServiceOptions) {
    this.#messenger = options.messenger;
    this.#enabledCallback = options.enabledCallback;

    this.#options = {
      url: options.url,
      timeout: options.timeout ?? 10000,
      reconnectDelay: options.reconnectDelay ?? 500,
      maxReconnectDelay: options.maxReconnectDelay ?? 5000,
      requestTimeout: options.requestTimeout ?? 30000,
    };

    // Register action handlers using the method actions pattern
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Establishes WebSocket connection
   *
   * @returns Promise that resolves when connection is established
   */
  async connect(): Promise<void> {
    // Check if connection is enabled via callback
    if (this.#enabledCallback && !this.#enabledCallback()) {
      console.log(`[${SERVICE_NAME}] Connection disabled by enabledCallback - skipping connect`);
      return;
    }

    // If already connected, return immediately
    if (this.#state === WebSocketState.CONNECTED) {
      return;
    }

    // If already connecting, wait for the existing connection attempt to complete
    if (this.#state === WebSocketState.CONNECTING && this.#connectionPromise) {
      await this.#connectionPromise;
      return;
    }

    console.log(`[${SERVICE_NAME}] 🔄 Starting connection attempt to ${this.#options.url}`);
    this.#setState(WebSocketState.CONNECTING);
    this.#lastError = null;

    // Create and store the connection promise
    this.#connectionPromise = this.#establishConnection();

    try {
      await this.#connectionPromise;
      console.log(`[${SERVICE_NAME}] ✅ Connection attempt succeeded`);
    } catch (error) {
      const errorMessage = this.#getErrorMessage(error);
      console.error(`[${SERVICE_NAME}] ❌ Connection attempt failed: ${errorMessage}`);
      this.#lastError = errorMessage;
      this.#setState(WebSocketState.ERROR);

      throw new Error(`Failed to connect to WebSocket: ${errorMessage}`);
    } finally {
      // Clear the connection promise when done (success or failure)
      this.#connectionPromise = null;
    }
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
      console.log(`[${SERVICE_NAME}] Disconnect called but already in state: ${this.#state}`);
      return;
    }

    console.log(`[${SERVICE_NAME}] Manual disconnect initiated - closing WebSocket connection`);

    this.#setState(WebSocketState.DISCONNECTING);
    this.#clearTimers();
    this.#clearPendingRequests(new Error('WebSocket disconnected'));

    // Clear any pending connection promise
    this.#connectionPromise = null;

    if (this.#ws) {
      this.#ws.close(1000, 'Normal closure');
    }

    this.#setState(WebSocketState.DISCONNECTED);
    console.log(`[${SERVICE_NAME}] WebSocket manually disconnected`);
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

    if (!this.#ws) {
      throw new Error('WebSocket not initialized');
    }

    try {
      this.#ws.send(JSON.stringify(message));
    } catch (error) {
      const errorMessage = this.#getErrorMessage(error);
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

    const requestId = uuidV4();
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
        console.warn(
          `[${SERVICE_NAME}] 🔴 Request timeout after ${this.#options.requestTimeout}ms - triggering reconnection`,
        );

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
          new Error(this.#getErrorMessage(error)),
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
   * Register a callback for specific channels
   *
   * @param options - Channel callback configuration
   * @param options.channelName - Channel name to match exactly
   * @param options.callback - Function to call when channel matches
   *
   * @example
   * ```typescript
   * // Listen to specific account activity channel
   * webSocketService.addChannelCallback({
   *   channelName: 'account-activity.v1.eip155:0:0x1234...',
   *   callback: (notification) => {
   *     console.log('Account activity:', notification.data);
   *   }
   * });
   *
   * // Listen to system notifications channel
   * webSocketService.addChannelCallback({
   *   channelName: 'system-notifications.v1',
   *   callback: (notification) => {
   *     console.log('System notification:', notification.data);
   *   }
   * });
   * ```
   */
  addChannelCallback(options: {
    channelName: string;
    callback: (notification: ServerNotificationMessage) => void;
  }): void {
    // Check if callback already exists for this channel
    if (this.#channelCallbacks.has(options.channelName)) {
      console.log(`[${SERVICE_NAME}] Channel callback already exists for '${options.channelName}', skipping`);
      return;
    }

    const channelCallback: ChannelCallback = {
      channelName: options.channelName,
      callback: options.callback,
    };

    this.#channelCallbacks.set(options.channelName, channelCallback);
  }


  /**
   * Remove a channel callback
   *
   * @param channelName - The channel name returned from addChannelCallback
   * @returns True if callback was found and removed, false otherwise
   */
  removeChannelCallback(channelName: string): boolean {
    const removed = this.#channelCallbacks.delete(channelName);
    if (removed) {
      console.log(`[${SERVICE_NAME}] Removed channel callback for '${channelName}'`);
    }
    return removed;
  }


  /**
   * Get all registered channel callbacks (for debugging)
   */
  getChannelCallbacks(): ChannelCallback[] {
    return Array.from(this.#channelCallbacks.values());
  }

  /**
   * Destroy the service and clean up resources
   * Called when service is being destroyed or app is terminating
   */
  destroy(): void {
    this.#clearTimers();
    this.#clearSubscriptions();

    // Clear any pending connection promise
    this.#connectionPromise = null;

    // Clear all pending requests
    this.#clearPendingRequests(new Error('Service cleanup'));

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
    const subscriptionResponse = await this.sendRequest({
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
        console.error(`[${SERVICE_NAME}] Failed to unsubscribe:`, error);
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
          `[${SERVICE_NAME}] 🔴 WebSocket connection timeout after ${this.#options.timeout}ms - forcing close`,
        );
        ws.close();
        reject(
          new Error(`Connection timeout after ${this.#options.timeout}ms`),
        );
      }, this.#options.timeout);

      ws.onopen = () => {
        console.log(`[${SERVICE_NAME}] ✅ WebSocket connection opened successfully`);
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
        console.error(`[${SERVICE_NAME}] ❌ WebSocket error during connection attempt:`, {
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
          `[${SERVICE_NAME}] WebSocket closed during connection setup - code: ${event.code} - ${this.#getCloseReason(event.code)}, reason: ${event.reason || 'none'}, state: ${this.#state}`,
        );
        if (this.#state === WebSocketState.CONNECTING) {
          console.log(
            `[${SERVICE_NAME}] Connection attempt failed due to close event during CONNECTING state`,
          );
          reject(
            new Error(
              `WebSocket connection closed during connection: ${event.code} ${event.reason}`,
            ),
          );
        } else {
          // If we're not connecting, handle it as a normal close event
          console.log(`[${SERVICE_NAME}] Handling close event as normal disconnection`);
          this.#handleClose(event);
        }
      };
    });
  }

  /**
   * Sets up WebSocket event handlers
   */
  #setupEventHandlers(): void {
    console.log(`[${SERVICE_NAME}] Setting up WebSocket event handlers for operational phase`);

    if (!this.#ws) {
      throw new Error('WebSocket not initialized for event handler setup');
    }

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
        `[${SERVICE_NAME}] WebSocket onclose event triggered - code: ${event.code}, reason: ${event.reason || 'none'}, wasClean: ${event.wasClean}`,
      );
      this.#handleClose(event);
    };

    this.#ws.onerror = (event: Event) => {
      console.log(`[${SERVICE_NAME}] WebSocket onerror event triggered:`, event);
      this.#handleError(new Error(`WebSocket error: ${event.type}`));
    };
  }

  /**
   * Handles incoming WebSocket messages (optimized for mobile real-time performance)
   *
   * @param message - The WebSocket message to handle
   */
  #handleMessage(message: WebSocketMessage): void {
    // Handle server responses (correlated with requests) first
    if (this.#isServerResponse(message)) {
      this.#handleServerResponse(message as ServerResponseMessage);
      return;
    }

    // Handle subscription notifications
    if (this.#isSubscriptionNotification(message)) {
      this.#handleSubscriptionNotification(message as ServerNotificationMessage);
    }

    // Trigger channel callbacks for any message with a channel property
    if (this.#isChannelMessage(message)) {
      this.#handleChannelMessage(message);
    }
  }

  /**
   * Checks if a message is a server response (correlated with client requests)
   *
   * @param message - The message to check
   * @returns True if the message is a server response
   */
  #isServerResponse(message: WebSocketMessage): boolean {
    return (
      'data' in message &&
      message.data &&
      typeof message.data === 'object' &&
      'requestId' in message.data
    );
  }

  /**
   * Checks if a message is a subscription notification (has subscriptionId)
   *
   * @param message - The message to check
   * @returns True if the message is a subscription notification with subscriptionId
   */
  #isSubscriptionNotification(message: WebSocketMessage): boolean {
    return (
      'subscriptionId' in message &&
      (message as ServerNotificationMessage).subscriptionId !== undefined &&
      !this.#isServerResponse(message)
    );
  }

  /**
   * Checks if a message has a channel property (system or subscription notification)
   *
   * @param message - The message to check
   * @returns True if the message has a channel property
   */
  #isChannelMessage(message: WebSocketMessage): message is ServerNotificationMessage {
    return 'channel' in message;
  }

  /**
   * Handles server response messages (correlated with client requests)
   *
   * @param message - The server response message to handle
   */
  #handleServerResponse(message: ServerResponseMessage): void {
    const { requestId } = message.data;

    if (!this.#pendingRequests.has(requestId)) {
      return;
    }

    const request = this.#pendingRequests.get(requestId);
    if (!request) {
      return;
    }

    this.#pendingRequests.delete(requestId);
    clearTimeout(request.timeout);

    // Check if the response indicates failure
    if (message.data.failed && message.data.failed.length > 0) {
      request.reject(
        new Error(`Request failed: ${message.data.failed.join(', ')}`),
      );
    } else {
      request.resolve(message.data);
    }
  }

  /**
   * Handles messages with channel properties by triggering channel callbacks
   *
   * @param message - The message with channel property to handle
   */
  #handleChannelMessage(message: ServerNotificationMessage): void {
    this.#triggerChannelCallbacks(message);
  }

  /**
   * Handles server notifications with subscription IDs
   *
   * @param message - The server notification message to handle
   */
  #handleSubscriptionNotification(message: ServerNotificationMessage): void {
    const { subscriptionId } = message;

    // Guard: Only handle if subscriptionId exists
    if (!subscriptionId) {
      return;
    }

    // Fast path: Direct callback routing by subscription ID
    const subscription = this.#subscriptions.get(subscriptionId);
    if (subscription) {
      const { callback } = subscription;
      // Development: Full error handling
      if (process.env.NODE_ENV === 'development') {
        try {
          callback(message);
        } catch (error) {
          console.error(
            `[${SERVICE_NAME}] Error in subscription callback for ${subscriptionId}:`,
            error,
          );
        }
      } else {
        // Production: Direct call for maximum speed
        callback(message);
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[${SERVICE_NAME}] No subscription found for subscriptionId: ${subscriptionId}`,
      );
    }
  }


  /**
   * Triggers channel-based callbacks for incoming notifications
   *
   * @param notification - The notification message to check against channel callbacks
   */
  #triggerChannelCallbacks(notification: ServerNotificationMessage): void {
    if (this.#channelCallbacks.size === 0) {
      return;
    }

    // Use the channel name directly from the notification
    const channelName = notification.channel;
    
    // Direct lookup for exact channel match
    const channelCallback = this.#channelCallbacks.get(channelName);
    if (channelCallback) {
      try {
        channelCallback.callback(notification);
      } catch (error) {
        console.error(`[${SERVICE_NAME}] Error in channel callback for '${channelCallback.channelName}':`, error);
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

    // Clear subscriptions and pending requests on any disconnect
    // This ensures clean state for reconnection
    this.#clearPendingRequests(new Error('WebSocket connection closed'));
    this.#clearSubscriptions();

    // Log close reason for debugging
    const closeReason = this.#getCloseReason(event.code);
    console.log(
      `[${SERVICE_NAME}] WebSocket closed: ${event.code} - ${closeReason} (reason: ${event.reason || 'none'}) - current state: ${this.#state}`,
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
      console.log(`[${SERVICE_NAME}] Connection lost unexpectedly, will attempt reconnection`);
      this.#scheduleReconnect();
    } else {
      // Non-recoverable error - set error state
      console.log(
        `[${SERVICE_NAME}] Non-recoverable error - close code: ${event.code} - ${closeReason}`,
      );
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
    console.log(`[${SERVICE_NAME}] 🔄 Request timeout detected - forcing WebSocket reconnection`);

    // Only trigger reconnection if we're currently connected
    if (this.#state === WebSocketState.CONNECTED && this.#ws) {
      // Force close the current connection to trigger reconnection logic
      this.#ws.close(1001, 'Request timeout - forcing reconnect');
    } else {
      console.log(
        `[${SERVICE_NAME}] ⚠️ Request timeout but WebSocket is ${this.#state} - not forcing reconnection`,
      );
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
      // Check if connection is still enabled before reconnecting
      if (this.#enabledCallback && !this.#enabledCallback()) {
        console.log(`[${SERVICE_NAME}] Reconnection disabled by enabledCallback - skipping attempt #${this.#reconnectAttempts}`);
        return;
      }

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
   * Clears all pending requests and rejects them with the given error
   *
   * @param error - Error to reject with
   */
  #clearPendingRequests(error: Error): void {
    for (const [, request] of this.#pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.#pendingRequests.clear();
  }

  /**
   * Clears all active subscriptions
   */
  #clearSubscriptions(): void {
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
        this.#messenger.publish(
          'BackendWebSocketService:connectionStateChanged',
          this.getConnectionInfo(),
        );
      } catch (error) {
        console.error(
          'Failed to publish WebSocket connection state change:',
          error,
        );
      }
    }
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
    // Don't reconnect only on normal closure (manual disconnect)
    if (code === 1000) {
      console.log(`Not reconnecting - normal closure (manual disconnect)`);
      return false;
    }

    // Reconnect on server errors and temporary issues
    console.log(`Will reconnect - treating as temporary server issue`);
    return true;
  }
}
