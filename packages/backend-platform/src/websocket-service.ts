import { EventEmitter } from 'events';
import type { RestrictedMessenger } from '@metamask/base-controller';
import { createServicePolicy } from '@metamask/controller-utils';
import type { ServicePolicy } from '@metamask/controller-utils';

const SERVICE_NAME = 'WebSocketService';

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
  POLICY_BREAK = 'policyBreak',
  POLICY_DEGRADED = 'policyDegraded',
}

/**
 * Configuration options for the WebSocket service
 */
export type WebSocketServiceOptions = {
  /** The WebSocket URL to connect to */
  url: string;
  
  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;
  
  /** Maximum number of reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
  
  /** Initial reconnection delay in milliseconds (default: 1000) */
  reconnectDelay?: number;
  
  /** Maximum reconnection delay in milliseconds (default: 30000) */
  maxReconnectDelay?: number;
  
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
  
  /** Service policy options */
  policy?: {
    /** Maximum number of failures before breaking (default: 5) */
    maxFailures?: number;
    
    /** Failure threshold time window in milliseconds (default: 60000) */
    failureThreshold?: number;
    
    /** Circuit breaker reset timeout in milliseconds (default: 300000) */
    resetTimeout?: number;
  };

  // Deprecated callback options (for backward compatibility)
  /** @deprecated Use messenger action handlers instead */
  onBreak?: () => void;
  
  /** @deprecated Use messenger action handlers instead */
  onDegraded?: () => void;
  
  /** @deprecated Use messenger action handlers instead */
  onRetry?: () => void;
};

/**
 * JSON-RPC 2.0 Error object
 */
export type JsonRpcError = {
  code: number;
  message: string;
  data?: unknown;
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
 * WebSocket subscription object returned by the subscribe method
 */
export type WebSocketSubscription = {
  /** The subscription ID from the server */
  subscriptionId: string;
  /** Function to unsubscribe and clean up */
  unsubscribe: () => Promise<void>;
  /** Check if the subscription is still active */
  isActive: () => boolean;
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
  sessionId?: string;
};



// Action types for the messaging system
export type WebSocketServiceInitAction = {
  type: `WebSocketService:init`;
  handler: WebSocketService['init'];
};

export type WebSocketServiceConnectAction = {
  type: `WebSocketService:connect`;
  handler: WebSocketService['connect'];
};

export type WebSocketServiceDisconnectAction = {
  type: `WebSocketService:disconnect`;
  handler: WebSocketService['disconnect'];
};

export type WebSocketServiceSendMessageAction = {
  type: `WebSocketService:sendMessage`;
  handler: WebSocketService['sendMessage'];
};

export type WebSocketServiceSendRequestAction = {
  type: `WebSocketService:sendRequest`;
  handler: WebSocketService['sendRequest'];
};

export type WebSocketServiceGetConnectionInfoAction = {
  type: `WebSocketService:getConnectionInfo`;
  handler: WebSocketService['getConnectionInfo'];
};

export type WebSocketServiceClearSessionAction = {
  type: `WebSocketService:clearSession`;
  handler: WebSocketService['clearSession'];
};

export type WebSocketServiceGetSessionIdAction = {
  type: `WebSocketService:getSessionId`;
  handler: WebSocketService['getSessionId'];
};

export type WebSocketServiceGetRequestQueueStatusAction = {
  type: `WebSocketService:getRequestQueueStatus`;
  handler: WebSocketService['getRequestQueueStatus'];
};

export type WebSocketServiceClearRequestQueueAction = {
  type: `WebSocketService:clearRequestQueue`;
  handler: WebSocketService['clearRequestQueue'];
};

export type WebSocketServiceActions = 
  | WebSocketServiceInitAction
  | WebSocketServiceConnectAction
  | WebSocketServiceDisconnectAction
  | WebSocketServiceSendMessageAction
  | WebSocketServiceSendRequestAction
  | WebSocketServiceGetConnectionInfoAction
  | WebSocketServiceClearSessionAction
  | WebSocketServiceGetSessionIdAction
  | WebSocketServiceGetRequestQueueStatusAction
  | WebSocketServiceClearRequestQueueAction;

type AllowedActions = never;

export type WebSocketServiceEvents = never;

type AllowedEvents = never;

export type WebSocketServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  WebSocketServiceActions | AllowedActions,
  WebSocketServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * WebSocket Service following MetaMask's Data Services pattern
 * 
 * This service provides WebSocket connectivity with automatic reconnection,
 * circuit breaker pattern, message correlation, and comprehensive error handling.
 * 
 * Cross-Platform Support:
 * - Uses 'ws' package for Node.js environments
 * - Automatically uses native WebSocket in browsers via bundler polyfills
 * - No runtime environment detection needed - bundlers handle this automatically
 * 
 * RFC 6455 Compliance:
 * - Implements proper PING/PONG control frame handling for keep-alive
 * - Uses only native WebSocket PING/PONG frames (no custom JSON messages)
 * - Automatically responds to server-initiated PING frames with PONG
 * - Monitors connection health with configurable PONG timeouts
 * - Uses appropriate close codes (1002 for protocol errors)
 * 
 * @example
 * ```typescript
 * const messenger = globalMessenger.getRestricted({
 *   name: 'WebSocketService',
 *   allowedActions: ['WebSocketService:init', 'WebSocketService:sendMessage'],
 *   allowedEvents: [],
 * });
 * 
 * const service = new WebSocketService({
 *   messenger,
 *   url: 'wss://api.example.com/ws',
 *   timeout: 10000,
 *   maxReconnectAttempts: 5,
 * });
 * 
 * // Initialize and connect via messenger action
 * await messenger.call('WebSocketService:init');
 * 
 * // Send message via messenger action
 * await messenger.call('WebSocketService:sendMessage', {
 *   method: 'subscribe',
 *   params: { channel: 'prices' }
 * });
 * ```
 */
export class WebSocketService extends EventEmitter {
  readonly #messenger: WebSocketServiceMessenger;
  readonly #options: Required<Omit<WebSocketServiceOptions, 'onBreak' | 'onDegraded' | 'onRetry'>> & {
    onBreak?: () => void;
    onDegraded?: () => void;
    onRetry?: () => void;
  };
  readonly #policy: ServicePolicy;

  #ws!: WebSocket;
  #state: WebSocketState = WebSocketState.DISCONNECTED;
  #reconnectAttempts = 0;
  #reconnectTimer: NodeJS.Timeout | null = null;

  #pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  #requestQueue: Array<{
    message: ClientRequestMessage;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  #lastError: string | null = null;
  #connectedAt: number | null = null;
  #sessionId: string | null = null;

  /**
   * Creates a new WebSocket service instance
   * 
   * @param options - Configuration options
   * @param options.messenger - The restricted messenger for this service
   * @param options.url - WebSocket URL to connect to
   * @param options.timeout - Connection timeout in milliseconds
   * @param options.maxReconnectAttempts - Maximum reconnection attempts
   * @param options.reconnectDelay - Initial reconnection delay
   * @param options.maxReconnectDelay - Maximum reconnection delay
   * @param options.requestTimeout - Request timeout for request/response pattern
   * @param options.policy - Service policy configuration
   * @param options.onBreak - Deprecated: Circuit breaker callback
   * @param options.onDegraded - Deprecated: Service degradation callback
   * @param options.onRetry - Deprecated: Retry callback
   */
  constructor(options: WebSocketServiceOptions & { messenger: WebSocketServiceMessenger }) {
    super();

    this.#messenger = options.messenger;
    
    this.#options = {
      url: options.url,
      timeout: options.timeout ?? 10000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,

      requestTimeout: options.requestTimeout ?? 30000,
      policy: {
        maxFailures: options.policy?.maxFailures ?? 5,
        failureThreshold: options.policy?.failureThreshold ?? 60000,
        resetTimeout: options.policy?.resetTimeout ?? 300000,
      },
      // Deprecated callback support
      onBreak: options.onBreak,
      onDegraded: options.onDegraded,
      onRetry: options.onRetry,
    };

    // Create service policy
    this.#policy = createServicePolicy({
      maxRetries: this.#options.maxReconnectAttempts,
      maxConsecutiveFailures: this.#options.policy.maxFailures,
      circuitBreakDuration: this.#options.policy.resetTimeout,
      degradedThreshold: this.#options.policy.failureThreshold,
    });

    // Register action handlers
    this.#messenger.registerActionHandler(
      `WebSocketService:init`,
      this.init.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:connect`,
      this.connect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:disconnect`,
      this.disconnect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:sendMessage`,
      this.sendMessage.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:sendRequest`,
      this.sendRequest.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getConnectionInfo`,
      this.getConnectionInfo.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:clearSession`,
      this.clearSession.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getSessionId`,
      this.getSessionId.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getRequestQueueStatus`,
      this.getRequestQueueStatus.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:clearRequestQueue`,
      this.clearRequestQueue.bind(this),
    );

    this.init();
  }

  /**
   * Service policy callback registration for circuit breaker events
   * 
   * @param listener - Callback function to execute when circuit breaks
   * @returns Cleanup function to remove the listener
   */
  onBreak(listener: Parameters<ServicePolicy['onBreak']>[0]) {
    return this.#policy.onBreak(listener);
  }

  /**
   * Service policy callback registration for service degradation events
   * 
   * @param listener - Callback function to execute when service is degraded
   * @returns Cleanup function to remove the listener
   */
  onDegraded(listener: Parameters<ServicePolicy['onDegraded']>[0]) {
    return this.#policy.onDegraded(listener);
  }

  /**
   * Service policy callback registration for retry events
   * 
   * @param listener - Callback function to execute on retry attempts
   * @returns Cleanup function to remove the listener
   */
  onRetry(listener: Parameters<ServicePolicy['onRetry']>[0]) {
    return this.#policy.onRetry(listener);
  }

  /**
   * Initializes the WebSocket service and establishes connection
   * 
   * This is a convenience method that connects to the server automatically.
   * Use this method for initial setup instead of calling connect() manually.
   * 
   * @returns Promise that resolves when initialized and connected
   * @throws {Error} When initialization or connection fails
   * 
   * @example
   * ```typescript
   * const service = new WebSocketService({
   *   messenger,
   *   url: 'wss://api.example.com/ws'
   * });
   * 
   * // Initialize and connect in one step
   * await service.init();
   * ```
   */
  async init(): Promise<void> {
    try {
      console.log(`Initializing WebSocket service for ${this.#options.url}`);
      await this.connect();
      console.log('WebSocket service initialized and connected successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      console.error('Failed to initialize WebSocket service:', errorMessage);
      throw new Error(`WebSocket service initialization failed: ${errorMessage}`);
    }
  }

  /**
   * Establishes WebSocket connection
   * 
   * @returns Promise that resolves when connected
   * @throws {Error} When connection fails
   */
  async connect(): Promise<void> {
    if (this.#state === WebSocketState.CONNECTED || this.#state === WebSocketState.CONNECTING) {
      return;
    }

    this.#setState(WebSocketState.CONNECTING);
    this.#lastError = null;

    try {
      await this.#policy.execute(async () => {
        await this.#establishConnection();
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
      this.#lastError = errorMessage;
      this.#setState(WebSocketState.ERROR);
      
      // Trigger deprecated callback if provided
      if (this.#options.onBreak) {
        this.#options.onBreak();
      }
      
      throw new Error(`Failed to connect to WebSocket: ${errorMessage}`);
    }
  }

  /**
   * Closes WebSocket connection
   * 
   * @returns Promise that resolves when disconnected
   */
  async disconnect(): Promise<void> {
    if (this.#state === WebSocketState.DISCONNECTED || this.#state === WebSocketState.DISCONNECTING) {
      return;
    }

    this.#setState(WebSocketState.DISCONNECTING);
    this.#clearTimers();
    this.#rejectPendingRequests(new Error('WebSocket disconnected'));


    this.#ws.close(1000, 'Normal closure');

    this.#setState(WebSocketState.DISCONNECTED);
    this.#sessionId = null;
    this.emit(WebSocketEventType.DISCONNECTED);
  }

  /**
   * Sends a message through the WebSocket
   * 
   * @param message - Message to send
   * @returns Promise that resolves when message is sent
   * @throws {Error} When not connected or message fails to send
   */
  async sendMessage(message: ClientRequestMessage): Promise<void> {
    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot send message: WebSocket is ${this.#state}`);
    }

    try {
      this.#ws.send(JSON.stringify(message));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      this.#handleError(new Error(errorMessage));
      throw error;
    }
  }

  /**
   * Sends a request and waits for a correlated response
   * 
   * @param message - Request message
   * @param queueIfDisconnected - Whether to queue the request if not connected (default: false)
   * @returns Promise that resolves with the response
   * @throws {Error} When request fails or times out
   */
  async sendRequest<T = ServerResponseMessage['data']>(
    message: Omit<ClientRequestMessage, 'data'> & { data?: Omit<ClientRequestMessage['data'], 'requestId'> },
    queueIfDisconnected: boolean = false
  ): Promise<T> {
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
        // Remove from pending requests
        this.#pendingRequests.delete(requestId);
        
        // Remove from request queue if still there
        const queueIndex = this.#requestQueue.findIndex(req => req.message.data.requestId === requestId);
        if (queueIndex !== -1) {
          this.#requestQueue.splice(queueIndex, 1);
        }
        
        reject(new Error(`Request timeout after ${this.#options.requestTimeout}ms`));
      }, this.#options.requestTimeout);

      // If not connected, queue the request if requested
      if (this.#state !== WebSocketState.CONNECTED) {
        if (queueIfDisconnected) {
          this.#requestQueue.push({
            message: requestMessage,
            resolve: resolve as (value: unknown) => void,
            reject,
            timeout,
          });
          console.log(`Request queued (${this.#requestQueue.length} total): ${requestMessage.event}`);
          return;
        } else {
          clearTimeout(timeout);
          reject(new Error(`Cannot send request: WebSocket is ${this.#state}`));
          return;
        }
      }

      // Store in pending requests for response correlation
      this.#pendingRequests.set(String(requestId), {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      // Send the request
      this.sendMessage(requestMessage).catch((error) => {
        this.#pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Gets current connection information
   * 
   * @returns Current connection state and metadata
   */
  getConnectionInfo(): WebSocketConnectionInfo {
    return {
      state: this.#state,
      url: this.#options.url,
      reconnectAttempts: this.#reconnectAttempts,
      lastError: this.#lastError ?? undefined,
      connectedAt: this.#connectedAt ?? undefined,
      sessionId: this.#sessionId ?? undefined,
    };
  }

  /**
   * Gets the current session ID
   * 
   * @returns Current session ID or null if no session
   */
  getSessionId(): string | null {
    return this.#sessionId;
  }

  /**
   * Manually clears the session ID
   * 
   * This will force the next connection to start with a fresh session
   * instead of attempting to restore the previous session.
   * 
   * @example
   * ```typescript
   * // Clear session to start fresh on next connection
   * webSocketService.clearSession();
   * await webSocketService.disconnect();
   * await webSocketService.connect(); // Will start with new session
   * ```
   */
  clearSession(): void {
    const previousSessionId = this.#sessionId;
    this.#sessionId = null;
    
    if (previousSessionId) {
      console.log(`Cleared session: ${previousSessionId}`);
    }
  }

  /**
   * Gets the current request queue status
   * 
   * @returns Information about queued requests
   */
  getRequestQueueStatus(): { 
    requestCount: number;
    requests: Array<{ message: ClientRequestMessage; event: string; }>;
  } {
    return {
      requestCount: this.#requestQueue.length,
      requests: this.#requestQueue.map(req => ({ 
        message: req.message, 
        event: req.message.event 
      })), // Return copy without resolve/reject functions
    };
  }

  /**
   * Clears all queued requests
   * 
   * @returns Number of requests that were cleared
   */
  clearRequestQueue(): number {
    const requestCount = this.#requestQueue.length;
    
    // Clear request queue and clean up timeouts
    this.#requestQueue.forEach(req => {
      clearTimeout(req.timeout);
      req.reject(new Error('Request queue cleared'));
    });
    this.#requestQueue.length = 0;
    
    if (requestCount > 0) {
      console.log(`Cleared ${requestCount} queued requests`);
    }
    
    return requestCount;
  }



  /**
   * Watch for server notifications with a specific subscription ID
   * 
   * @param subscriptionId - The subscription ID to watch for
   * @param callback - Function to call when a notification for this subscription is received
   * @returns Cleanup function to remove the listener
   * 
   * @example
   * ```typescript
   * // Watch for notifications from a specific subscription
   * const unsubscribe = webSocketService.watchSubscription('sub_12345', (notification) => {
   *   console.log('Subscription notification:', notification.params);
   * });
   * 
   * // Later, stop watching
   * unsubscribe();
   * ```
   */
  watchSubscription(subscriptionId: string, callback: (notification: ServerNotificationMessage) => void): () => void {
    // Add the listener for the specific subscription ID
    const eventName = `subscription:${subscriptionId}`;
    this.on(eventName, callback);
    
    // Return cleanup function
    return () => {
      this.off(eventName, callback);
    };
  }

  /**
   * Create a subscription with automatic handling of subscribe/unsubscribe lifecycle
   * 
   * @param options - Subscription configuration
   * @returns Subscription object with unsubscribe method
   * 
   * @example
   * ```typescript
   * // Subscribe to account activity
   * const subscription = await webSocketService.subscribe({
   *   method: 'account_activity',
   *   params: { address: '0x1234...' },
   *   onNotification: (notification) => {
   *     console.log('Account activity:', notification.params);
   *   }
   * });
   * 
   * // Later, unsubscribe
   * await subscription.unsubscribe();
   * ```
   */
  async subscribe(options: {
    /** The subscription method name */
    method: string;
    /** Parameters for the subscription request */
    params?: unknown;
    /** Handler for incoming notifications */
    onNotification: (notification: ServerNotificationMessage) => void;
  }): Promise<WebSocketSubscription> {
    const {
      method,
      params,
      onNotification,
    } = options;

    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot create subscription: WebSocket is ${this.#state}`);
    }

    // Send subscription request and wait for response
    const subscriptionResponse = await this.sendRequest<{ subscriptionId: string; succeeded?: string[]; failed?: string[]; }>({
      event: method,
      data: params ? { ...params } : {},
    });

    if (!subscriptionResponse?.subscriptionId) {
      throw new Error('Invalid subscription response: missing subscription ID');
    }

    const subscriptionId = subscriptionResponse.subscriptionId;

    // Watch for notifications specifically for this subscription ID
    const subscriptionCleanup = this.watchSubscription(subscriptionId, onNotification);

        // Create unsubscribe function
    const unsubscribe = async (): Promise<void> => {
      try {
        // Stop watching for notifications
        subscriptionCleanup();

        // Send unsubscribe request
        await this.sendRequest({
          event: 'unsubscribe',
          data: {
            subscription: subscriptionId,
            ...(params && typeof params === 'object' ? params : {}), // Include original params in case server needs them
          },
        });
      } catch (error) {
        console.error('Failed to unsubscribe:', error);
        throw error;
    }
    };

    return {
      subscriptionId,
      unsubscribe,
      isActive: () => this.#state === WebSocketState.CONNECTED,
    };
  }

  /**
   * Establishes the actual WebSocket connection
   * 
   * @private
   */
  async #establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build WebSocket URL with query parameters
      const url = new URL(this.#options.url);
      
      // Add sessionId for reconnection if we have one
      if (this.#sessionId) {
        url.searchParams.set('sessionId', this.#sessionId);
        console.log(`Reconnecting with existing session: ${this.#sessionId}`);
      }

      const wsUrl = url.toString();
      const ws = new WebSocket(wsUrl);
      const connectTimeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection timeout after ${this.#options.timeout}ms`));
      }, this.#options.timeout);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        this.#ws = ws;
        this.#setState(WebSocketState.CONNECTED);
        this.#connectedAt = Date.now();
        
        const wasReconnecting = this.#reconnectAttempts > 0;
        const hadExistingSession = this.#sessionId !== null;
        
        // Reset reconnect attempts on successful connection
        this.#reconnectAttempts = 0;
        
        this.#setupEventHandlers();
        this.#processQueuedRequests();
        
        this.emit(WebSocketEventType.CONNECTED);
        
        if (wasReconnecting) {
          this.emit(WebSocketEventType.RECONNECTED);
          
          if (hadExistingSession) {
            console.log(`Successfully reconnected with existing session: ${this.#sessionId}`);
          } else {
            console.log('Successfully reconnected with new session');
          }
        }
        
        resolve();
      };

      ws.onerror = (event: Event) => {
        clearTimeout(connectTimeout);
        const error = new Error(`WebSocket connection error: ${event}`);
        reject(error);
      };

      ws.onclose = (event: CloseEvent) => {
        clearTimeout(connectTimeout);
        if (this.#state === WebSocketState.CONNECTING) {
          reject(new Error(`WebSocket connection closed during connection: ${event.code} ${event.reason}`));
        }
      };
    });
  }

  /**
   * Sets up WebSocket event handlers
   * 
   * @private
   */
  #setupEventHandlers(): void {

    this.#ws.onmessage = (event: any) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        this.#handleMessage(message);
      } catch (error) {
        this.emit(WebSocketEventType.ERROR, new Error(`Failed to parse message: ${error}`));
      }
    };

    this.#ws.onclose = (event: any) => {
      this.#handleClose(event);
    };

    this.#ws.onerror = (event: any) => {
      this.#handleError(new Error(`WebSocket error: ${event}`));
    };

    // Note: Native WebSocket API automatically handles PING/PONG frames
    // for keep-alive without exposing them to JavaScript


  }

  /**
   * Handles incoming WebSocket messages
   * 
   * @param message - Received message
   * @private
   */
  #handleMessage(message: WebSocketMessage): void {
    // Handle session-created event
    if ('event' in message && message.event === 'session-created' && 'data' in message && message.data && typeof message.data === 'object' && 'sessionId' in message.data) {
      this.#sessionId = message.data.sessionId as string;
      console.log(`WebSocket session created: ${this.#sessionId}`);
      this.emit('session-created', { sessionId: this.#sessionId });
      return;
    }

    // Handle server responses (correlated with requests)
    if ('data' in message && message.data && typeof message.data === 'object' && 'requestId' in message.data) {
      const responseMessage = message as ServerResponseMessage;
      const requestId = responseMessage.data.requestId;
      
      if (this.#pendingRequests.has(requestId)) {
        const request = this.#pendingRequests.get(requestId)!;
        this.#pendingRequests.delete(requestId);
        clearTimeout(request.timeout);
        
        // Check if the response indicates failure
        if (responseMessage.data.failed && responseMessage.data.failed.length > 0) {
          request.reject(new Error(`Request failed: ${responseMessage.data.failed.join(', ')}`));
        } else {
          request.resolve(responseMessage.data);
        }
        return;
      }
    }

    // Handle server notifications (unsolicited messages)
    if ('subscriptionId' in message && !('data' in message && message.data && typeof message.data === 'object' && 'requestId' in message.data)) {
      const notificationMessage = message as ServerNotificationMessage;
      
      // Route by subscription ID
      const subscriptionId = notificationMessage.subscriptionId;
      if (subscriptionId) {
        this.emit(`subscription:${subscriptionId}`, notificationMessage);
      }      
      return;
    }

    // Emit all other messages
    this.emit(WebSocketEventType.MESSAGE, message);
  }



  /**
   * Handles WebSocket close events (RFC 6455 compliant)
   * 
   * @param event - Close event
   * @private
   */
  #handleClose(event: CloseEvent): void {
    this.#clearTimers();
    this.#connectedAt = null;

    // Log close reason for debugging
    const closeReason = this.#getCloseReason(event.code);
    console.debug(`WebSocket closed: ${event.code} - ${closeReason}`, event.reason);

    if (this.#state === WebSocketState.DISCONNECTING) {
      // Manual disconnect - sessionId was already cleared in disconnect()
      this.#setState(WebSocketState.DISCONNECTED);
      this.emit(WebSocketEventType.DISCONNECTED);
      return;
    }

    // For unexpected disconnects, keep sessionId for reconnection
    // Check if we should attempt reconnection based on close code
    const shouldReconnect = this.#shouldReconnectOnClose(event.code);
    
    if (shouldReconnect && this.#reconnectAttempts < this.#options.maxReconnectAttempts) {
      console.log(`Connection lost unexpectedly, will attempt reconnection with session: ${this.#sessionId || 'none'}`);
      this.#scheduleReconnect();
    } else {
      // Max attempts reached or non-recoverable error - clear session
      this.#sessionId = null;
      this.#setState(WebSocketState.ERROR);
      this.#lastError = `${shouldReconnect ? 'Max reconnection attempts reached' : 'Non-recoverable close code'}. Close code: ${event.code} - ${closeReason}`;
      this.emit(WebSocketEventType.ERROR, new Error(this.#lastError));
      
      // Trigger deprecated callback if provided
      if (this.#options.onBreak) {
        this.#options.onBreak();
      }
    }
  }

  /**
   * Handles WebSocket errors
   * 
   * @param error - Error that occurred
   * @private
   */
  #handleError(error: Error): void {
    this.#lastError = error.message;
    this.emit(WebSocketEventType.ERROR, error);
    
    // Trigger deprecated callback if provided
    if (this.#options.onDegraded) {
      this.#options.onDegraded();
    }
  }

  /**
   * Schedules a reconnection attempt
   * 
   * @private
   */
  #scheduleReconnect(): void {
    this.#reconnectAttempts++;
    
    const delay = Math.min(
      this.#options.reconnectDelay * Math.pow(2, this.#reconnectAttempts - 1),
      this.#options.maxReconnectDelay
    );

    this.emit(WebSocketEventType.RECONNECTING, {
      attempt: this.#reconnectAttempts,
      maxAttempts: this.#options.maxReconnectAttempts,
      delay,
    });

    // Trigger deprecated callback if provided
    if (this.#options.onRetry) {
      this.#options.onRetry();
    }

    this.#reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Clears all active timers
   * 
   * @private
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
   * @private
   */
  #rejectPendingRequests(error: Error): void {
    // Reject all pending requests
    for (const [id, request] of this.#pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.#pendingRequests.clear();
    
    // Also reject queued requests if connection is being terminated
    this.#requestQueue.forEach(req => {
      clearTimeout(req.timeout);
      req.reject(error);
    });
    this.#requestQueue.length = 0;
  }

  /**
   * Processes any requests that were queued while disconnected
   * 
   * @private
   */
  #processQueuedRequests(): void {
    const queuedRequestCount = this.#requestQueue.length;
    
    if (queuedRequestCount > 0) {
      console.log(`Processing ${queuedRequestCount} queued requests`);
    }
    
    // Process queued requests
    while (this.#requestQueue.length > 0) {
      const queuedRequest = this.#requestQueue.shift()!;
      const requestId = queuedRequest.message.data.requestId;
      
      // Move to pending requests for response correlation
      this.#pendingRequests.set(requestId, {
        resolve: queuedRequest.resolve,
        reject: queuedRequest.reject,
        timeout: queuedRequest.timeout,
      });
      
      // Send the request
      this.sendMessage(queuedRequest.message).catch((error) => {
        this.#pendingRequests.delete(requestId);
        clearTimeout(queuedRequest.timeout);
        queuedRequest.reject(error);
      });
    }
    
    if (queuedRequestCount > 0) {
      console.log(`Finished processing ${queuedRequestCount} queued requests`);
    }
  }

  /**
   * Sets the connection state and emits state change events
   * 
   * @param newState - New connection state
   * @private
   */
  #setState(newState: WebSocketState): void {
    const oldState = this.#state;
    this.#state = newState;
    
    if (oldState !== newState) {
      this.emit('stateChange', { from: oldState, to: newState });
    }
  }

  /**
   * Generates a unique message ID
   * 
   * @returns Unique message identifier
   * @private
   */
  #generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Gets human-readable close reason from RFC 6455 close code
   * 
   * @param code - WebSocket close code
   * @returns Human-readable close reason
   * @private
   */
  #getCloseReason(code: number): string {
    switch (code) {
      case 1000: return 'Normal Closure';
      case 1001: return 'Going Away';
      case 1002: return 'Protocol Error';
      case 1003: return 'Unsupported Data';
      case 1004: return 'Reserved';
      case 1005: return 'No Status Received';
      case 1006: return 'Abnormal Closure';
      case 1007: return 'Invalid frame payload data';
      case 1008: return 'Policy Violation';
      case 1009: return 'Message Too Big';
      case 1010: return 'Mandatory Extension';
      case 1011: return 'Internal Server Error';
      case 1012: return 'Service Restart';
      case 1013: return 'Try Again Later';
      case 1014: return 'Bad Gateway';
      case 1015: return 'TLS Handshake';
      default: 
        if (code >= 3000 && code <= 3999) return 'Library/Framework Error';
        if (code >= 4000 && code <= 4999) return 'Application Error';
        return 'Unknown';
    }
  }

  /**
   * Determines if reconnection should be attempted based on close code
   * 
   * @param code - WebSocket close code
   * @returns True if reconnection should be attempted
   * @private
   */
  #shouldReconnectOnClose(code: number): boolean {
    // Don't reconnect on normal closure or going away
    if (code === 1000 || code === 1001) {
      return false;
    }

    // Don't reconnect on client-side errors (4000-4999)
    if (code >= 4000 && code <= 4999) {
      return false;
    }

    // Don't reconnect on certain protocol errors
    if (code === 1002 || code === 1003 || code === 1007 || code === 1008) {
      return false;
    }

    // Reconnect on server errors and temporary issues
    return true;
  }


} 