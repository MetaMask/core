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
  
  /** Ping interval in milliseconds for keep-alive (default: 30000) */
  pingInterval?: number;
  
  /** Pong timeout in milliseconds (default: 5000) */
  pongTimeout?: number;
  
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
 * WebSocket message structure
 */
export type WebSocketMessage = {
  id?: string;
  type: string;
  payload?: unknown;
  timestamp?: number;
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
  lastPingAt?: number;
  lastPongAt?: number;
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
 *   type: 'subscribe',
 *   payload: { channel: 'prices' }
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

  #ws: WebSocket | null = null;
  #state: WebSocketState = WebSocketState.DISCONNECTED;
  #reconnectAttempts = 0;
  #reconnectTimer: NodeJS.Timeout | null = null;
  #pingTimer: NodeJS.Timeout | null = null;
  #pongTimer: NodeJS.Timeout | null = null;
  #pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  #messageQueue: WebSocketMessage[] = [];
  #lastError: string | null = null;
  #connectedAt: number | null = null;
  #lastPingAt: number | null = null;
  #lastPongAt: number | null = null;

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
   * @param options.pingInterval - Ping interval for keep-alive
   * @param options.pongTimeout - Pong response timeout
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
      pingInterval: options.pingInterval ?? 30000,
      pongTimeout: options.pongTimeout ?? 5000,
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

    if (this.#ws) {
      this.#ws.close(1000, 'Normal closure');
      this.#ws = null;
    }

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
  async sendMessage(message: WebSocketMessage): Promise<void> {
    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot send message: WebSocket is ${this.#state}`);
    }

    if (!this.#ws) {
      throw new Error('WebSocket connection not available');
    }

    const messageWithTimestamp = {
      ...message,
      timestamp: Date.now(),
    };

    try {
      this.#ws.send(JSON.stringify(messageWithTimestamp));
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
  async sendRequest<T = unknown>(message: Omit<WebSocketMessage, 'id'>): Promise<T> {
    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot send request: WebSocket is ${this.#state}`);
    }

    const requestId = this.#generateMessageId();
    const requestMessage: WebSocketMessage = {
      ...message,
      id: requestId,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${this.#options.requestTimeout}ms`));
      }, this.#options.requestTimeout);

      this.#pendingRequests.set(requestId, {
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
      lastPingAt: this.#lastPingAt ?? undefined,
      lastPongAt: this.#lastPongAt ?? undefined,
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
        this.#startPingTimer();
        this.#processQueuedMessages();
        
        this.emit(WebSocketEventType.CONNECTED);
        
        if (this.#reconnectAttempts > 0) {
          this.emit(WebSocketEventType.RECONNECTED);
        }
        
        resolve();
      };

      ws.onerror = (event) => {
        clearTimeout(connectTimeout);
        const error = new Error(`WebSocket connection error: ${event}`);
        reject(error);
      };

      ws.onclose = (event) => {
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
    if (!this.#ws) {
      return;
    }

    this.#ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        this.#handleMessage(message);
      } catch (error) {
        this.emit(WebSocketEventType.ERROR, new Error(`Failed to parse message: ${error}`));
      }
    };

    this.#ws.onclose = (event) => {
      this.#handleClose(event);
    };

    this.#ws.onerror = (event) => {
      this.#handleError(new Error(`WebSocket error: ${event}`));
    };
  }

  /**
   * Handles incoming WebSocket messages
   * 
   * @param message - Received message
   * @private
   */
  #handleMessage(message: WebSocketMessage): void {
    // Handle pong responses
    if (message.type === 'pong') {
      this.#lastPongAt = Date.now();
      this.#clearPongTimer();
      return;
    }

    // Handle correlated responses
    if (message.id && this.#pendingRequests.has(message.id)) {
      const request = this.#pendingRequests.get(message.id)!;
      this.#pendingRequests.delete(message.id);
      clearTimeout(request.timeout);
      
      if (message.type === 'error') {
        request.reject(new Error(message.payload as string));
      } else {
        request.resolve(message.payload);
      }
      return;
    }

    // Emit regular messages
    this.emit(WebSocketEventType.MESSAGE, message);
  }

  /**
   * Handles WebSocket close events
   * 
   * @param event - Close event
   * @private
   */
  #handleClose(event: CloseEvent): void {
    this.#ws = null;
    this.#clearTimers();
    this.#connectedAt = null;

    if (this.#state === WebSocketState.DISCONNECTING) {
      this.#setState(WebSocketState.DISCONNECTED);
      this.emit(WebSocketEventType.DISCONNECTED);
      return;
    }

    // Attempt reconnection for unexpected closures
    if (this.#reconnectAttempts < this.#options.maxReconnectAttempts) {
      this.#scheduleReconnect();
    } else {
      this.#setState(WebSocketState.ERROR);
      this.#lastError = `Max reconnection attempts reached. Last close code: ${event.code}`;
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
   * Starts the ping timer for keep-alive
   * 
   * @private
   */
  #startPingTimer(): void {
    this.#pingTimer = setInterval(() => {
      if (this.#state === WebSocketState.CONNECTED && this.#ws) {
        this.#lastPingAt = Date.now();
        
        // Set up pong timeout
        this.#pongTimer = setTimeout(() => {
          this.#handleError(new Error('Pong timeout - connection may be stale'));
          this.#ws?.close();
        }, this.#options.pongTimeout);

        this.sendMessage({ type: 'ping' }).catch((error) => {
          console.error('Failed to send ping:', error);
        });
      }
    }, this.#options.pingInterval);
  }

  /**
   * Clears the pong timeout timer
   * 
   * @private
   */
  #clearPongTimer(): void {
    if (this.#pongTimer) {
      clearTimeout(this.#pongTimer);
      this.#pongTimer = null;
    }
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

    if (this.#pingTimer) {
      clearInterval(this.#pingTimer);
      this.#pingTimer = null;
    }

    this.#clearPongTimer();
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
} 