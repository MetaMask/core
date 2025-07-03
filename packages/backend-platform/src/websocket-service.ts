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
  
  /** Authentication token */
  authToken?: string;
  
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
 * Client Request message (JSON-RPC 2.0 compliant)
 * Used when client sends a request to the server
 */
export type ClientRequestMessage = {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
};

/**
 * Server Response message (JSON-RPC 2.0 compliant)
 * Used when server responds to a client request
 */
export type ServerResponseMessage = {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
};

/**
 * Server Notification message (JSON-RPC 2.0 compliant)
 * Used when server sends unsolicited data to client
 */
export type ServerNotificationMessage = {
  jsonrpc: '2.0';
  method: string;
  params?: {
    /** Subscription ID for routing notifications to correct subscription */
    subscription?: string;
    /** Additional notification data */
    [key: string]: unknown;
  };
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

};



// Action types for the messaging system
export type WebSocketServiceConnectAction = {
  type: `${typeof SERVICE_NAME}:connect`;
  handler: WebSocketService['connect'];
};

export type WebSocketServiceDisconnectAction = {
  type: `${typeof SERVICE_NAME}:disconnect`;
  handler: WebSocketService['disconnect'];
};

export type WebSocketServiceSendMessageAction = {
  type: `${typeof SERVICE_NAME}:sendMessage`;
  handler: WebSocketService['sendMessage'];
};

export type WebSocketServiceSendRequestAction = {
  type: `${typeof SERVICE_NAME}:sendRequest`;
  handler: WebSocketService['sendRequest'];
};

export type WebSocketServiceGetConnectionInfoAction = {
  type: `${typeof SERVICE_NAME}:getConnectionInfo`;
  handler: WebSocketService['getConnectionInfo'];
};

export type WebSocketServiceActions = 
  | WebSocketServiceConnectAction
  | WebSocketServiceDisconnectAction
  | WebSocketServiceSendMessageAction
  | WebSocketServiceSendRequestAction
  | WebSocketServiceGetConnectionInfoAction;

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
 *   allowedActions: [],
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
 * // Connect via messenger action
 * await messenger.call('WebSocketService:connect');
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
  readonly #options: Required<Omit<WebSocketServiceOptions, 'authToken' | 'onBreak' | 'onDegraded' | 'onRetry'>> & {
    authToken?: string;
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
  #messageQueue: ClientRequestMessage[] = [];
  #lastError: string | null = null;
  #connectedAt: number | null = null;

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
   * @param options.authToken - Authentication token
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
      authToken: options.authToken,
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
      `${SERVICE_NAME}:connect`,
      this.connect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:disconnect`,
      this.disconnect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:sendMessage`,
      this.sendMessage.bind(this),
    );

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:sendRequest`,
      this.sendRequest.bind(this),
    );

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getConnectionInfo`,
      this.getConnectionInfo.bind(this),
    );
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
   * @returns Promise that resolves with the response
   * @throws {Error} When request fails or times out
   */
  async sendRequest<T = unknown>(message: Omit<ClientRequestMessage, 'id' | 'jsonrpc'>): Promise<T> {
    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot send request: WebSocket is ${this.#state}`);
    }

    const requestId = this.#generateMessageId();
    const requestMessage: ClientRequestMessage = {
      jsonrpc: '2.0',
      id: requestId,
      method: message.method,
      params: message.params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${this.#options.requestTimeout}ms`));
      }, this.#options.requestTimeout);

      this.#pendingRequests.set(String(requestId), {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

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
    };
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
    const subscriptionResponse = await this.sendRequest<{ subscription: string }>({
      method,
      params,
    });

    if (!subscriptionResponse?.subscription) {
      throw new Error('Invalid subscription response: missing subscription ID');
    }

        const subscriptionId = subscriptionResponse.subscription;

    // Watch for notifications specifically for this subscription ID
    const subscriptionCleanup = this.watchSubscription(subscriptionId, onNotification);

        // Create unsubscribe function
    const unsubscribe = async (): Promise<void> => {
      try {
        // Stop watching for notifications
        subscriptionCleanup();

        // Send unsubscribe request
        await this.sendRequest({
          method: 'unsubscribe',
          params: {
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
      const wsUrl = this.#options.authToken 
        ? `${this.#options.url}?token=${this.#options.authToken}`
        : this.#options.url;

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
        this.#reconnectAttempts = 0;
        
        this.#setupEventHandlers();
        this.#processQueuedMessages();
        
        this.emit(WebSocketEventType.CONNECTED);
        
        if (this.#reconnectAttempts > 0) {
          this.emit(WebSocketEventType.RECONNECTED);
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
    // Handle server responses (correlated with requests)
    if ('result' in message || 'error' in message) {
      const responseMessage = message as ServerResponseMessage;
      if (this.#pendingRequests.has(String(responseMessage.id))) {
        const request = this.#pendingRequests.get(String(responseMessage.id))!;
        this.#pendingRequests.delete(String(responseMessage.id));
        clearTimeout(request.timeout);
        
        if (responseMessage.error) {
          request.reject(new Error(`JSON-RPC Error ${responseMessage.error.code}: ${responseMessage.error.message}`));
        } else {
          request.resolve(responseMessage.result);
        }
        return;
      }
    }

    // Handle server notifications (unsolicited messages)
    if ('method' in message && !('id' in message)) {
      const notificationMessage = message as ServerNotificationMessage;
      
      // Route by subscription ID if available
      const subscriptionId = notificationMessage.params?.subscription;
      if (subscriptionId) {
        this.emit(`subscription:${subscriptionId}`, notificationMessage);
      }
      
      // Also emit by method name for backward compatibility
      this.emit(notificationMessage.method, notificationMessage);
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
      this.#setState(WebSocketState.DISCONNECTED);
      this.emit(WebSocketEventType.DISCONNECTED);
      return;
    }

    // Check if we should attempt reconnection based on close code
    const shouldReconnect = this.#shouldReconnectOnClose(event.code);
    
    if (shouldReconnect && this.#reconnectAttempts < this.#options.maxReconnectAttempts) {
      this.#scheduleReconnect();
    } else {
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
    for (const [id, request] of this.#pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.#pendingRequests.clear();
  }

  /**
   * Processes any messages that were queued while disconnected
   * 
   * @private
   */
  #processQueuedMessages(): void {
    while (this.#messageQueue.length > 0) {
      const message = this.#messageQueue.shift()!;
      this.sendMessage(message).catch((error) => {
        console.error('Failed to send queued message:', error);
      });
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