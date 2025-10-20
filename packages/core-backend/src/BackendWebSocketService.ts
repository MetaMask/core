import type { RestrictedMessenger } from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
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

  /** Optional callback to trace performance of WebSocket operations (default: no-op) */
  traceFn?: TraceCallback;
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
  timestamp: number;
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
  /** Channel type with version (e.g., 'account-activity.v1') extracted from first channel */
  channelType: string;
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
  timeout: number;
  reconnectDelay: number;
  maxReconnectDelay: number;
  requestTimeout: number;
  connectedAt?: number;
};

// Action types for the messaging system - using generated method actions
export type BackendWebSocketServiceActions =
  BackendWebSocketServiceMethodActions;

export type BackendWebSocketServiceAllowedActions =
  AuthenticationController.AuthenticationControllerGetBearerToken;

export type BackendWebSocketServiceAllowedEvents =
  | AuthenticationController.AuthenticationControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

// Event types for WebSocket connection state changes
export type BackendWebSocketServiceConnectionStateChangedEvent = {
  type: 'BackendWebSocketService:connectionStateChanged';
  payload: [WebSocketConnectionInfo];
};

export type BackendWebSocketServiceEvents =
  BackendWebSocketServiceConnectionStateChangedEvent;

export type BackendWebSocketServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  BackendWebSocketServiceActions | BackendWebSocketServiceAllowedActions,
  BackendWebSocketServiceEvents | BackendWebSocketServiceAllowedEvents,
  BackendWebSocketServiceAllowedActions['type'],
  BackendWebSocketServiceAllowedEvents['type']
>;

/**
 * WebSocket Service with automatic reconnection, session management and direct callback routing
 *
 * Connection Management:
 * - Automatically subscribes to AuthenticationController:stateChange (sign in/out)
 * - Automatically subscribes to KeyringController:lock/unlock events
 * - Idempotent connect() function safe for multiple rapid calls
 * - Auto-reconnects on unexpected disconnects (manualDisconnect = false)
 *
 * Platform Responsibilities:
 * - Call connect() when app opens/foregrounds
 * - Call disconnect() when app closes/backgrounds
 * - Provide isEnabled() callback (feature flag)
 * - Call destroy() on app termination
 *
 * Real-Time Performance Optimizations:
 * - Fast path message routing (zero allocations)
 * - Production mode removes try-catch overhead
 * - Optimized JSON parsing with fail-fast
 * - Direct callback routing bypasses event emitters
 * - Memory cleanup and resource management
 */
export class BackendWebSocketService {
  /**
   * The name of the service.
   */
  readonly name = SERVICE_NAME;

  readonly #messenger: BackendWebSocketServiceMessenger;

  readonly #options: Required<
    Omit<BackendWebSocketServiceOptions, 'messenger' | 'isEnabled' | 'traceFn'>
  >;

  readonly #isEnabled: (() => boolean) | undefined;

  readonly #trace: TraceCallback;

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

  #connectedAt: number = 0;

  // Track manual disconnects to prevent automatic reconnection
  #manualDisconnect = false;

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
    // Default to no-op trace function to keep core platform-agnostic
    this.#trace =
      options.traceFn ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (((_request: any, fn?: any) => fn?.()) as TraceCallback);

    this.#options = {
      url: options.url,
      timeout: options.timeout ?? 10000,
      reconnectDelay: options.reconnectDelay ?? 500,
      maxReconnectDelay: options.maxReconnectDelay ?? 5000,
      requestTimeout: options.requestTimeout ?? 30000,
    };

    // Subscribe to authentication and keyring controller events
    this.#subscribeEvents();

    // Register action handlers using the method actions pattern
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Setup event handling for authentication and wallet lock state
   *
   * Three event sources trigger connection/disconnection:
   * 1. AuthenticationController:stateChange (sign in/out)
   * 2. KeyringController:unlock (wallet unlocked)
   * 3. KeyringController:lock (wallet locked)
   *
   * All connect() calls are idempotent and validate all requirements.
   */
  #subscribeEvents(): void {
    // Subscribe to authentication state changes (sign in/out)
    this.#messenger.subscribe(
      'AuthenticationController:stateChange',
      (state: AuthenticationController.AuthenticationControllerState) => {
        if (state.isSignedIn) {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.connect();
        } else {
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          this.disconnect();
        }
      },
      (state) => ({ isSignedIn: state.isSignedIn }),
    );

    // Subscribe to wallet unlock event
    this.#messenger.subscribe('KeyringController:unlock', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.connect();
    });

    // Subscribe to wallet lock event
    this.#messenger.subscribe('KeyringController:lock', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.disconnect();
    });
  }

  // =============================================================================
  // 2. PUBLIC API METHODS
  // =============================================================================

  /**
   * Establishes WebSocket connection with smart reconnection behavior
   *
   * Connection Requirements (all must be true):
   * 1. Feature enabled (isEnabled() = true)
   * 2. Wallet unlocked (checked by getBearerToken)
   * 3. User signed in (checked by getBearerToken)
   *
   * Platform code should call this when app opens/foregrounds.
   * Automatically called on KeyringController:unlock event.
   *
   * @returns Promise that resolves when connection is established
   */
  async connect(): Promise<void> {
    // Reset manual disconnect flag when explicitly connecting
    this.#manualDisconnect = false;

    // Priority 1: Check if feature is enabled via callback (feature flag check)
    // If feature is disabled, stop all connection attempts
    if (this.#isEnabled && !this.#isEnabled()) {
      // Clear any pending reconnection attempts since feature is disabled
      this.#clearTimers();
      this.#reconnectAttempts = 0;
      return;
    }

    // If already connected, return immediately
    if (this.#state === WebSocketState.CONNECTED) {
      return;
    }

    // If already connecting, wait for the existing connection attempt to complete
    if (this.#connectionPromise) {
      await this.#connectionPromise;
      return;
    }

    // Create and store the connection promise IMMEDIATELY (before any async operations)
    // This ensures subsequent connect() calls will wait for this promise instead of creating new connections
    this.#connectionPromise = (async () => {
      // Priority 2: Check authentication requirements (signed in)
      let bearerToken: string;
      try {
        const token = await this.#messenger.call(
          'AuthenticationController:getBearerToken',
        );
        if (!token) {
          this.#scheduleReconnect();
          throw new Error('Authentication required: user not signed in');
        }
        bearerToken = token;
      } catch (error) {
        log('Failed to check authentication requirements', { error });

        // Can't connect - schedule retry
        this.#scheduleReconnect();
        throw error;
      }

      this.#setState(WebSocketState.CONNECTING);

      // Establish the actual WebSocket connection
      try {
        await this.#establishConnection(bearerToken);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        log('Connection attempt failed', { errorMessage, error });
        this.#setState(WebSocketState.ERROR);

        // Rethrow to propagate error to caller
        throw error;
      }
    })();

    try {
      await this.#connectionPromise;
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

    // Mark this as a manual disconnect to prevent automatic reconnection
    this.#manualDisconnect = true;

    this.#setState(WebSocketState.DISCONNECTING);
    this.#clearTimers();
    this.#clearPendingRequests(new Error('WebSocket disconnected'));

    // Clear any pending connection promise
    this.#connectionPromise = null;

    if (this.#ws) {
      this.#ws.close(1000, 'Normal closure');
    }

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
      timeout: this.#options.timeout,
      reconnectDelay: this.#options.reconnectDelay,
      maxReconnectDelay: this.#options.maxReconnectDelay,
      requestTimeout: this.#options.requestTimeout,
      reconnectAttempts: this.#reconnectAttempts,
      connectedAt: this.#connectedAt,
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
          channelType: subscription.channelType,
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
          channelType: subscription.channelType,
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

    // Set state to disconnected immediately
    this.#setState(WebSocketState.DISCONNECTED);
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
   * @param options.channelType - Channel type identifier
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
    /** Channel type with version (e.g., 'account-activity.v1') for tracing and monitoring */
    channelType: string;
    /** Handler for incoming notifications */
    callback: (notification: ServerNotificationMessage) => void;
    /** Optional request ID for testing (will generate UUID if not provided) */
    requestId?: string;
  }): Promise<WebSocketSubscription> {
    const { channels, channelType, callback, requestId } = options;

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
      channelType,
      unsubscribe,
    };

    // Store subscription with subscription ID as key
    this.#subscriptions.set(subscriptionId, {
      subscriptionId,
      channels: [...channels], // Store copy of channels
      channelType,
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
    const connectionStartTime = Date.now();

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      this.#connectionTimeout = setTimeout(() => {
        log('WebSocket connection timeout - forcing close', {
          timeout: this.#options.timeout,
        });
        ws.close();
        reject(
          new Error(
            `Failed to connect to WebSocket: Connection timeout after ${this.#options.timeout}ms`,
          ),
        );
      }, this.#options.timeout);

      ws.onopen = () => {
        if (this.#connectionTimeout) {
          clearTimeout(this.#connectionTimeout);
          this.#connectionTimeout = null;
        }

        // Calculate connection latency
        const connectionLatency = Date.now() - connectionStartTime;

        // Trace successful connection with latency
        this.#trace(
          {
            name: `${SERVICE_NAME} Connection`,
            data: {
              reconnectAttempt: this.#reconnectAttempts,
              latency_ms: connectionLatency,
            },
            tags: {
              service: SERVICE_NAME,
            },
          },
          () => {
            this.#ws = ws;
            this.#setState(WebSocketState.CONNECTED);
            this.#connectedAt = Date.now();

            // Reset reconnect attempts on successful connection
            this.#reconnectAttempts = 0;

            resolve();
          },
        );
      };

      ws.onerror = (event: Event) => {
        log('WebSocket onerror event triggered', { event });
        if (this.#connectionTimeout) {
          clearTimeout(this.#connectionTimeout);
          this.#connectionTimeout = null;
        }
        const error = new Error(`WebSocket connection error to ${wsUrl}`);
        reject(error);
      };

      ws.onclose = (event: CloseEvent) => {
        log('WebSocket onclose event triggered', {
          code: event.code,
          reason: event.reason,
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
      const notificationMsg = message as ServerNotificationMessage;
      const handled = this.#handleSubscriptionNotification(notificationMsg);
      // If subscription notification wasn't handled (falsy subscriptionId), fall through to channel handling
      if (handled) {
        return;
      }
    }

    // Trigger channel callbacks for any message with a channel property
    if (this.#isChannelMessage(message)) {
      const channelMsg = message as ServerNotificationMessage;
      this.#handleChannelMessage(channelMsg);
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

    // Calculate notification latency: time from server sent to client received
    const receivedAt = Date.now();
    const latency = receivedAt - message.timestamp;

    // Trace channel message processing with latency data
    this.#trace(
      {
        name: `${SERVICE_NAME} Channel Message`,
        data: {
          latency_ms: latency,
          event: message.event,
        },
        tags: {
          service: SERVICE_NAME,
        },
      },
      () => {
        // Direct lookup for exact channel match
        this.#channelCallbacks.get(message.channel)?.callback(message);
      },
    );
  }

  /**
   * Handles server notifications with subscription IDs
   *
   * @param message - The server notification message to handle
   * @returns True if the message was handled, false if it should fall through to channel handling
   */
  #handleSubscriptionNotification(message: ServerNotificationMessage): boolean {
    const { subscriptionId, timestamp, channel } = message;

    // Only handle if subscriptionId is defined and not null (allows "0" as valid ID)
    if (subscriptionId !== null && subscriptionId !== undefined) {
      const subscription = this.#subscriptions.get(subscriptionId);
      if (!subscription) {
        return false;
      }

      // Calculate notification latency: time from server sent to client received
      const receivedAt = Date.now();
      const latency = receivedAt - timestamp;

      // Trace notification processing wi th latency data
      // Use stored channelType instead of parsing each time
      this.#trace(
        {
          name: `${SERVICE_NAME} Notification`,
          data: {
            channel,
            latency_ms: latency,
            subscriptionId,
          },
          tags: {
            service: SERVICE_NAME,
            notification_type: subscription.channelType,
          },
        },
        () => {
          subscription.callback?.(message);
        },
      );
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
    // Calculate connection duration before we clear state
    const connectionDuration = Date.now() - this.#connectedAt;

    this.#clearTimers();
    this.#connectedAt = 0;

    // Clear any pending connection promise
    this.#connectionPromise = null;

    // Clear subscriptions and pending requests on any disconnect
    // This ensures clean state for reconnection
    this.#clearPendingRequests(new Error('WebSocket connection closed'));
    this.#clearSubscriptions();

    // Update state to disconnected
    this.#setState(WebSocketState.DISCONNECTED);

    // Check if this was a manual disconnect
    if (this.#manualDisconnect) {
      // Manual disconnect - don't reconnect
      return;
    }

    // Trace unexpected disconnect with details
    this.#trace(
      {
        name: `${SERVICE_NAME} Disconnect`,
        data: {
          code: event.code,
          reason: event.reason || getCloseReason(event.code),
          connectionDuration_ms: connectionDuration,
        },
        tags: {
          service: SERVICE_NAME,
          disconnect_type: 'unexpected',
        },
      },
      () => {
        // Empty trace callback - just measuring the event
      },
    );

    // For any unexpected disconnects, attempt reconnection
    // The manualDisconnect flag is the only gate - if it's false, we reconnect
    this.#scheduleReconnect();
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

    this.#reconnectTimer = setTimeout(() => {
      // Clear timer reference first
      this.#reconnectTimer = null;

      // Check if connection is still enabled before reconnecting
      if (this.#isEnabled && !this.#isEnabled()) {
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
      // Publish connection state change event
      // Messenger handles listener errors internally, no need for try-catch
      this.#messenger.publish(
        'BackendWebSocketService:connectionStateChanged',
        this.getConnectionInfo(),
      );
    }
  }
}
