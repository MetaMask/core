import type { Messenger } from '@metamask/messenger';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import { getErrorMessage } from '@metamask/utils';
import { v4 as uuidV4 } from 'uuid';

import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types';
import { projectLogger, createModuleLogger } from './logger';

const SERVICE_NAME = 'BackendWebSocketService' as const;

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = [
  'connect',
  'disconnect',
  'sendMessage',
  'sendRequest',
  'subscribe',
  'getConnectionInfo',
  'getSubscriptionsByChannel',
  'channelHasSubscription',
  'findSubscriptionsByChannelPrefix',
  'addChannelCallback',
  'removeChannelCallback',
  'getChannelCallbacks',
] as const;

/**
 * Gets human-readable close reason from RFC 6455 close code
 *
 * @param code - WebSocket close code
 * @returns Human-readable close reason
 */
export function getCloseReason(code: number): string {
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
export type BackendWebSocketServiceOptions = {
  /** The WebSocket URL to connect to */
  url: string;

  /** The messenger for inter-service communication */
  messenger: BackendWebSocketServiceMessenger;

  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Initial reconnection delay in milliseconds (default: 500) */
  reconnectDelay?: number;

  /** Maximum reconnection delay in milliseconds (default: 5000) */
  maxReconnectDelay?: number;

  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;

  /** Optional callback to determine if connection should be enabled (default: always enabled) */
  isEnabled?: () => boolean;
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
 * Channel-based callback configuration
 */
export type ChannelCallback = {
  /** Channel name to match (also serves as the unique identifier) */
  channelName: string;
  /** Callback function */
  callback: (notification: ServerNotificationMessage) => void;
};

/**
 * Unified WebSocket subscription object used for both internal storage and external API
 */
export type WebSocketSubscription = {
  /** The subscription ID from the server */
  subscriptionId: string;
  /** Channel names for this subscription */
  channels: string[];
  /** Callback function for handling notifications (optional for external use) */
  callback?: (notification: ServerNotificationMessage) => void;
  /** Function to unsubscribe and clean up */
  unsubscribe: (requestId?: string) => Promise<void>;
};

/**
 * WebSocket connection info
 */
export type WebSocketConnectionInfo = {
  state: WebSocketState;
  url: string;
  reconnectAttempts: number;
  connectedAt?: number;
};

// Action types for the messaging system - using generated method actions
export type BackendWebSocketServiceActions =
  BackendWebSocketServiceMethodActions;

type AllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerToken;

type AllowedEvents =
  AuthenticationController.AuthenticationControllerStateChangeEvent;

// Event types for WebSocket connection state changes
export type BackendWebSocketServiceConnectionStateChangedEvent = {
  type: 'BackendWebSocketService:connectionStateChanged';
  payload: [WebSocketConnectionInfo];
};

export type BackendWebSocketServiceEvents =
  BackendWebSocketServiceConnectionStateChangedEvent;

export type BackendWebSocketServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  BackendWebSocketServiceActions | AllowedActions,
  BackendWebSocketServiceEvents | AllowedEvents
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
export class BackendWebSocketService {
  /**
   * The name of the service.
   */
  readonly name = SERVICE_NAME;

  readonly #messenger: BackendWebSocketServiceMessenger;

  readonly #options: Required<
    Omit<BackendWebSocketServiceOptions, 'messenger' | 'isEnabled'>
  >;

  readonly #isEnabled: (() => boolean) | undefined;

  #ws: WebSocket | undefined;

  #state: WebSocketState = WebSocketState.DISCONNECTED;

  #reconnectAttempts = 0;

  #reconnectTimer: NodeJS.Timeout | null = null;

  #connectionTimeout: NodeJS.Timeout | null = null;

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

  #connectedAt: number | null = null;

  // Simplified subscription storage (single flat map)
  // Key: subscription ID string (e.g., 'sub_abc123def456')
  // Value: WebSocketSubscription object with channels, callback and metadata
  readonly #subscriptions = new Map<string, WebSocketSubscription>();

  // Channel-based callback storage
  // Key: channel name (serves as unique identifier)
  // Value: ChannelCallback configuration
  readonly #channelCallbacks = new Map<string, ChannelCallback>();

  // =============================================================================
  // 1. CONSTRUCTOR & INITIALIZATION
  // =============================================================================

  /**
   * Creates a new WebSocket service instance
   *
   * @param options - Configuration options for the WebSocket service
   */
  constructor(options: BackendWebSocketServiceOptions) {
    this.#messenger = options.messenger;
    this.#isEnabled = options.isEnabled;

    this.#options = {
      url: options.url,
      timeout: options.timeout ?? 10000,
      reconnectDelay: options.reconnectDelay ?? 500,
      maxReconnectDelay: options.maxReconnectDelay ?? 5000,
      requestTimeout: options.requestTimeout ?? 30000,
    };

    // Setup authentication (always enabled)
    this.#setupAuthentication();

    // Register action handlers using the method actions pattern
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Setup authentication event handling - simplified approach using AuthenticationController
   * AuthenticationController.isSignedIn includes both wallet unlock AND identity provider auth.
   * App lifecycle (AppStateWebSocketManager) handles WHEN to connect/disconnect for resources.
   *
   */
  #setupAuthentication(): void {
    try {
      // Subscribe to authentication state changes - this includes wallet unlock state
      // AuthenticationController can only be signed in if wallet is unlocked
      // Using selector to only listen for isSignedIn property changes for better performance
      this.#messenger.subscribe(
        'AuthenticationController:stateChange',
        (isSignedIn: boolean) => {
          if (isSignedIn) {
            // User signed in (wallet unlocked + authenticated) - try to connect
            // Clear any pending reconnection timer since we're attempting connection
            this.#clearTimers();
            this.connect().catch((error) => {
              log('Failed to connect after sign-in', { error });
            });
          } else {
            // User signed out (wallet locked OR signed out) - disconnect and stop reconnection attempts
            this.#clearTimers();
            this.#reconnectAttempts = 0;
            this.disconnect().catch((error) => {
              log('Failed to disconnect after sign-out', { error });
            });
          }
        },
        (state: AuthenticationController.AuthenticationControllerState) =>
          state.isSignedIn,
      );
    } catch (error) {
      throw new Error(`Authentication setup failed: ${getErrorMessage(error)}`);
    }
  }

  // =============================================================================
  // 2. PUBLIC API METHODS
  // =============================================================================

  /**
   * Establishes WebSocket connection with smart reconnection behavior
   *
   * Simplified Priority System (using AuthenticationController):
   * 1. App closed/backgrounded → Stop all attempts (save resources)
   * 2. User not signed in (wallet locked OR not authenticated) → Keep retrying
   * 3. User signed in (wallet unlocked + authenticated) → Connect successfully
   *
   * @returns Promise that resolves when connection is established
   */
  async connect(): Promise<void> {
    // Priority 1: Check if connection is enabled via callback (app lifecycle check)
    // If app is closed/backgrounded, stop all connection attempts to save resources
    if (this.#isEnabled && !this.#isEnabled()) {
      // Clear any pending reconnection attempts since app is disabled
      this.#clearTimers();
      this.#reconnectAttempts = 0;
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

    // Priority 2: Check authentication requirements (simplified - just check if signed in)
    let bearerToken: string;
    try {
      // AuthenticationController.getBearerToken() handles wallet unlock checks internally
      const token = await this.#messenger.call(
        'AuthenticationController:getBearerToken',
      );
      if (!token) {
        this.#scheduleReconnect();
        return;
      }
      bearerToken = token;
    } catch (error) {
      log('Failed to check authentication requirements', { error });

      // If we can't connect for ANY reason, schedule a retry
      this.#scheduleReconnect();
      return;
    }

    this.#setState(WebSocketState.CONNECTING);

    // Create and store the connection promise
    this.#connectionPromise = this.#establishConnection(bearerToken);

    try {
      await this.#connectionPromise;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      log('Connection attempt failed', { errorMessage, error });
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
      return;
    }

    this.#setState(WebSocketState.DISCONNECTING);
    this.#clearTimers();
    this.#clearPendingRequests(new Error('WebSocket disconnected'));

    // Clear any pending connection promise
    this.#connectionPromise = null;

    if (this.#ws) {
      this.#ws.close(1000, 'Normal closure');
    }

    this.#setState(WebSocketState.DISCONNECTED);
    log('WebSocket manually disconnected');
  }

  /**
   * Sends a message through the WebSocket (fire-and-forget, no response expected)
   *
   * This is a low-level method for sending messages without waiting for a response.
   * Most consumers should use `sendRequest()` instead, which handles request-response
   * correlation and provides proper error handling with timeouts.
   *
   * Use this method only when:
   * - You don't need a response from the server
   * - You're implementing custom message protocols
   * - You need fine-grained control over message timing
   *
   * @param message - The message to send
   * @throws Error if WebSocket is not connected or send fails
   *
   * @see sendRequest for request-response pattern with automatic correlation
   */
  sendMessage(message: ClientRequestMessage): void {
    if (this.#state !== WebSocketState.CONNECTED || !this.#ws) {
      throw new Error(`Cannot send message: WebSocket is ${this.#state}`);
    }

    try {
      this.#ws.send(JSON.stringify(message));
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.#handleError(new Error(errorMessage));
      throw new Error(errorMessage);
    }
  }

  /**
   * Sends a request and waits for a correlated response (recommended for most use cases)
   *
   * This is the recommended high-level method for request-response communication.
   * It automatically handles:
   * - Request ID generation and correlation
   * - Response matching with timeout protection
   * - Automatic reconnection on timeout
   * - Proper cleanup of pending requests
   *
   * @param message - The request message (can include optional requestId for testing)
   * @returns Promise that resolves with the response data
   * @throws Error if WebSocket is not connected, request times out, or response indicates failure
   *
   * @see sendMessage for fire-and-forget messaging without response handling
   */
  async sendRequest<T = ServerResponseMessage['data']>(
    message: Omit<ClientRequestMessage, 'data'> & {
      data?: Omit<ClientRequestMessage['data'], 'requestId'> & {
        requestId?: string;
      };
    },
  ): Promise<T> {
    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot send request: WebSocket is ${this.#state}`);
    }

    // Use provided requestId if available, otherwise generate a new one
    const requestId = message.data?.requestId ?? uuidV4();
    const requestMessage: ClientRequestMessage = {
      event: message.event,
      data: {
        ...message.data,
        requestId, // Set after spread to ensure it's not overwritten by undefined
      },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(requestId);
        log('Request timeout - triggering reconnection', {
          timeout: this.#options.requestTimeout,
        });

        // Trigger reconnection on request timeout as it may indicate stale connection
        if (this.#state === WebSocketState.CONNECTED && this.#ws) {
          // Force close the current connection to trigger reconnection logic
          this.#ws.close(3000, 'Request timeout - forcing reconnect');
        }

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
      try {
        this.sendMessage(requestMessage);
      } catch (error) {
        this.#pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
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
      connectedAt: this.#connectedAt ?? undefined,
    };
  }

  /**
   * Gets all subscription information for a specific channel
   *
   * @param channel - The channel name to look up
   * @returns Array of subscription details for all subscriptions containing the channel
   */
  getSubscriptionsByChannel(channel: string): WebSocketSubscription[] {
    const matchingSubscriptions: WebSocketSubscription[] = [];
    for (const [subscriptionId, subscription] of this.#subscriptions) {
      if (subscription.channels.includes(channel)) {
        matchingSubscriptions.push({
          subscriptionId,
          channels: subscription.channels,
          unsubscribe: subscription.unsubscribe,
        });
      }
    }
    return matchingSubscriptions;
  }

  /**
   * Checks if a channel has a subscription
   *
   * @param channel - The channel name to check
   * @returns True if the channel has a subscription, false otherwise
   */
  channelHasSubscription(channel: string): boolean {
    for (const subscription of this.#subscriptions.values()) {
      if (subscription.channels.includes(channel)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds all subscriptions that have channels starting with the specified prefix
   *
   * @param channelPrefix - The channel prefix to search for (e.g., "account-activity.v1")
   * @returns Array of subscription info for matching subscriptions
   */
  findSubscriptionsByChannelPrefix(
    channelPrefix: string,
  ): WebSocketSubscription[] {
    const matchingSubscriptions: WebSocketSubscription[] = [];

    for (const [subscriptionId, subscription] of this.#subscriptions) {
      // Check if any channel in this subscription starts with the prefix
      const hasMatchingChannel = subscription.channels.some((channel) =>
        channel.startsWith(channelPrefix),
      );

      if (hasMatchingChannel) {
        matchingSubscriptions.push({
          subscriptionId,
          channels: subscription.channels,
          unsubscribe: subscription.unsubscribe,
        });
      }
    }

    return matchingSubscriptions;
  }

  /**
   * Register a callback for specific channels (local callback only, no server subscription)
   *
   * **Key Difference from `subscribe()`:**
   * - `addChannelCallback()`: Registers a local callback without creating a server-side subscription.
   * The callback triggers on ANY message matching the channel name, regardless of subscriptionId.
   * Useful for system-wide notifications or when you don't control the subscription lifecycle.
   *
   * - `subscribe()`: Creates a proper server-side subscription with a subscriptionId.
   * The callback only triggers for messages with the matching subscriptionId.
   * Includes proper lifecycle management (unsubscribe, automatic cleanup on disconnect).
   *
   * **When to use `addChannelCallback()`:**
   * - Listening to system-wide notifications (e.g., 'system-notifications.v1')
   * - Monitoring channels where subscriptions are managed elsewhere
   * - Debug/logging scenarios where you want to observe all channel messages
   *
   * **When to use `subscribe()` instead:**
   * - Creating new subscriptions that need server-side registration
   * - When you need proper cleanup via unsubscribe
   * - Most application use cases (recommended approach)
   *
   * @param options - Channel callback configuration
   * @param options.channelName - Channel name to match exactly
   * @param options.callback - Function to call when channel matches
   *
   * @example
   * ```typescript
   * // Listen to system notifications (no server subscription needed)
   * webSocketService.addChannelCallback({
   *   channelName: 'system-notifications.v1',
   *   callback: (notification) => {
   *     console.log('System notification:', notification.data);
   *   }
   * });
   *
   * // For account-specific subscriptions, use subscribe() instead:
   * // const sub = await webSocketService.subscribe({
   * //   channels: ['account-activity.v1.eip155:0:0x1234...'],
   * //   callback: (notification) => { ... }
   * // });
   * ```
   *
   * @see subscribe for creating proper server-side subscriptions with lifecycle management
   */
  addChannelCallback(options: {
    channelName: string;
    callback: (notification: ServerNotificationMessage) => void;
  }): void {
    const channelCallback: ChannelCallback = {
      channelName: options.channelName,
      callback: options.callback,
    };

    // Check if callback already exists for this channel
    if (this.#channelCallbacks.has(options.channelName)) {
      return;
    }

    this.#channelCallbacks.set(options.channelName, channelCallback);
  }

  /**
   * Remove a channel callback
   *
   * @param channelName - The channel name returned from addChannelCallback
   * @returns True if callback was found and removed, false otherwise
   */
  removeChannelCallback(channelName: string): boolean {
    return this.#channelCallbacks.delete(channelName);
  }

  /**
   * Get all registered channel callbacks (for debugging)
   *
   * @returns Array of all registered channel callbacks
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
   * Create and manage a subscription with server-side registration (recommended for most use cases)
   *
   * This is the recommended subscription API for high-level services. It creates a proper
   * server-side subscription and routes notifications based on subscriptionId.
   *
   * **Key Features:**
   * - Creates server-side subscription with unique subscriptionId
   * - Callback triggered only for messages with matching subscriptionId
   * - Automatic lifecycle management (cleanup on disconnect)
   * - Includes unsubscribe method for proper cleanup
   * - Request-response pattern with error handling
   *
   * **When to use `subscribe()`:**
   * - Creating new subscriptions (account activity, price updates, etc.)
   * - When you need proper cleanup/unsubscribe functionality
   * - Most application use cases
   *
   * **When to use `addChannelCallback()` instead:**
   * - System-wide notifications without server-side subscription
   * - Observing channels managed elsewhere
   * - Debug/logging scenarios
   *
   * @param options - Subscription configuration
   * @param options.channels - Array of channel names to subscribe to
   * @param options.callback - Callback function for handling notifications
   * @param options.requestId - Optional request ID for testing (will generate UUID if not provided)
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
   *
   * @see addChannelCallback for local callbacks without server-side subscription
   */
  async subscribe(options: {
    /** Channel names to subscribe to */
    channels: string[];
    /** Handler for incoming notifications */
    callback: (notification: ServerNotificationMessage) => void;
    /** Optional request ID for testing (will generate UUID if not provided) */
    requestId?: string;
  }): Promise<WebSocketSubscription> {
    const { channels, callback, requestId } = options;

    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(
        `Cannot create subscription(s) ${channels.join(', ')}: WebSocket is ${this.#state}`,
      );
    }

    // Send subscription request and wait for response
    const subscriptionResponse = await this.sendRequest({
      event: 'subscribe',
      data: { channels, requestId },
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
    const unsubscribe = async (unsubRequestId?: string): Promise<void> => {
      // Send unsubscribe request first
      await this.sendRequest({
        event: 'unsubscribe',
        data: {
          subscription: subscriptionId,
          channels,
          requestId: unsubRequestId,
        },
      });

      // Clean up subscription mapping
      this.#subscriptions.delete(subscriptionId);
    };

    const subscription = {
      subscriptionId,
      channels: [...channels],
      unsubscribe,
    };

    // Store subscription with subscription ID as key
    this.#subscriptions.set(subscriptionId, {
      subscriptionId,
      channels: [...channels], // Store copy of channels
      callback,
      unsubscribe,
    });

    return subscription;
  }

  // =============================================================================
  // 3. CONNECTION MANAGEMENT (PRIVATE)
  // =============================================================================

  /**
   * Builds an authenticated WebSocket URL with bearer token as query parameter.
   * Uses query parameter for WebSocket authentication since native WebSocket
   * doesn't support custom headers during handshake.
   *
   * @param bearerToken - The bearer token to use for authentication
   * @returns The authenticated WebSocket URL
   */
  #buildAuthenticatedUrl(bearerToken: string): string {
    const baseUrl = this.#options.url;

    // Add token as query parameter to the WebSocket URL
    const url = new URL(baseUrl);
    url.searchParams.set('token', bearerToken);

    return url.toString();
  }

  /**
   * Establishes the actual WebSocket connection
   *
   * @param bearerToken - The bearer token to use for authentication
   * @returns Promise that resolves when connection is established
   */
  async #establishConnection(bearerToken: string): Promise<void> {
    const wsUrl = this.#buildAuthenticatedUrl(bearerToken);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.#connectionTimeout = setTimeout(() => {
        log('WebSocket connection timeout - forcing close', {
          timeout: this.#options.timeout,
        });
        ws.close();
        reject(
          new Error(`Connection timeout after ${this.#options.timeout}ms`),
        );
      }, this.#options.timeout);

      ws.onopen = () => {
        if (this.#connectionTimeout) {
          clearTimeout(this.#connectionTimeout);
          this.#connectionTimeout = null;
        }
        this.#ws = ws;
        this.#setState(WebSocketState.CONNECTED);
        this.#connectedAt = Date.now();

        // Reset reconnect attempts on successful connection
        this.#reconnectAttempts = 0;

        resolve();
      };

      ws.onerror = (event: Event) => {
        log('WebSocket onerror event triggered', { event });
        if (this.#state === WebSocketState.CONNECTING) {
          // Handle connection-phase errors
          if (this.#connectionTimeout) {
            clearTimeout(this.#connectionTimeout);
            this.#connectionTimeout = null;
          }
          const error = new Error(`WebSocket connection error to ${wsUrl}`);
          reject(error);
        } else {
          // Handle runtime errors
          this.#handleError(new Error(`WebSocket error: ${event.type}`));
        }
      };

      ws.onclose = (event: CloseEvent) => {
        log('WebSocket onclose event triggered', {
          code: event.code,
          reason: event.reason || 'none',
          wasClean: event.wasClean,
        });
        if (this.#state === WebSocketState.CONNECTING) {
          // Handle connection-phase close events
          if (this.#connectionTimeout) {
            clearTimeout(this.#connectionTimeout);
            this.#connectionTimeout = null;
          }
          reject(
            new Error(
              `WebSocket connection closed during connection: ${event.code} ${event.reason}`,
            ),
          );
        } else {
          this.#handleClose(event);
        }
      };

      // Set up message handler immediately - no need to wait for connection
      ws.onmessage = (event: MessageEvent) => {
        try {
          const message = this.#parseMessage(event.data);
          this.#handleMessage(message);
        } catch {
          // Silently ignore invalid JSON messages
        }
      };
    });
  }

  // =============================================================================
  // 4. MESSAGE HANDLING (PRIVATE)
  // =============================================================================

  /**
   * Handles incoming WebSocket messages
   *
   * @param message - The WebSocket message to handle
   */
  #handleMessage(message: WebSocketMessage): void {
    // Handle server responses (correlated with requests) first
    if (this.#isServerResponse(message)) {
      this.#handleServerResponse(message);
      return;
    }

    // Handle subscription notifications with valid subscriptionId
    if (this.#isSubscriptionNotification(message)) {
      const handled = this.#handleSubscriptionNotification(
        message as ServerNotificationMessage,
      );
      // If subscription notification wasn't handled (falsy subscriptionId), fall through to channel handling
      if (handled) {
        return;
      }
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
  #isServerResponse(
    message: WebSocketMessage,
  ): message is ServerResponseMessage {
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
    return 'subscriptionId' in message && !this.#isServerResponse(message);
  }

  /**
   * Checks if a message has a channel property (system or subscription notification)
   *
   * @param message - The message to check
   * @returns True if the message has a channel property
   */
  #isChannelMessage(
    message: WebSocketMessage,
  ): message is ServerNotificationMessage {
    return 'channel' in message;
  }

  /**
   * Handles server response messages (correlated with client requests)
   *
   * @param message - The server response message to handle
   */
  #handleServerResponse(message: ServerResponseMessage): void {
    const { requestId } = message.data;

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
    if (this.#channelCallbacks.size === 0) {
      return;
    }

    // Direct lookup for exact channel match
    this.#channelCallbacks.get(message.channel)?.callback(message);
  }

  /**
   * Handles server notifications with subscription IDs
   *
   * @param message - The server notification message to handle
   * @returns True if the message was handled, false if it should fall through to channel handling
   */
  #handleSubscriptionNotification(message: ServerNotificationMessage): boolean {
    const { subscriptionId } = message;

    // Only handle if subscriptionId is defined and not null (allows "0" as valid ID)
    if (subscriptionId !== null && subscriptionId !== undefined) {
      this.#subscriptions.get(subscriptionId)?.callback?.(message);
      return true;
    }

    return false;
  }

  /**
   * Parse WebSocket message data
   *
   * @param data - The raw message data to parse
   * @returns Parsed message
   */
  #parseMessage(data: string): WebSocketMessage {
    return JSON.parse(data);
  }

  // =============================================================================
  // 5. EVENT HANDLERS (PRIVATE)
  // =============================================================================

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
      log('Connection lost unexpectedly, will attempt reconnection', {
        code: event.code,
      });
      this.#scheduleReconnect();
    }
  }

  /**
   * Handles WebSocket errors
   *
   * @param _error - Error that occurred (unused)
   */
  #handleError(_error: Error): void {
    // Placeholder for future error handling logic
  }

  // =============================================================================
  // 6. STATE MANAGEMENT (PRIVATE)
  // =============================================================================

  /**
   * Schedules a reconnection attempt with exponential backoff
   */
  #scheduleReconnect(): void {
    this.#reconnectAttempts += 1;

    const rawDelay =
      this.#options.reconnectDelay * Math.pow(1.5, this.#reconnectAttempts - 1);
    const delay = Math.min(rawDelay, this.#options.maxReconnectDelay);

    log('Scheduling reconnection attempt', {
      attempt: this.#reconnectAttempts,
      delayMs: delay,
    });

    this.#reconnectTimer = setTimeout(() => {
      // Clear timer reference first
      this.#reconnectTimer = null;

      // Check if connection is still enabled before reconnecting
      if (this.#isEnabled && !this.#isEnabled()) {
        log('Reconnection disabled by isEnabled - stopping all attempts');
        this.#reconnectAttempts = 0;
        return;
      }

      // Attempt to reconnect - if it fails, schedule another attempt
      this.connect().catch(() => {
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
    if (this.#connectionTimeout) {
      clearTimeout(this.#connectionTimeout);
      this.#connectionTimeout = null;
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
      log('WebSocket state changed', { oldState, newState });

      // Publish connection state change event
      // Messenger handles listener errors internally, no need for try-catch
      this.#messenger.publish(
        'BackendWebSocketService:connectionStateChanged',
        this.getConnectionInfo(),
      );
    }
  }

  // =============================================================================
  // 7. UTILITY METHODS (PRIVATE)
  // =============================================================================

  /**
   * Determines if reconnection should be attempted based on close code
   *
   * @param code - WebSocket close code
   * @returns True if reconnection should be attempted
   */
  #shouldReconnectOnClose(code: number): boolean {
    // Don't reconnect only on normal closure (manual disconnect)
    return code !== 1000;
  }
}
