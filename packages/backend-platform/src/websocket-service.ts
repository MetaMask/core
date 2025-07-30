import type { RestrictedMessenger } from '@metamask/base-controller';

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
}

/**
 * Configuration options for the WebSocket service
 */
export type WebSocketServiceOptions = {
  /** The WebSocket URL to connect to */
  url: string;
  
  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;
  
  /** Maximum number of reconnection attempts (default: Infinity for unlimited retries) */
  maxReconnectAttempts?: number;
  
  /** Initial reconnection delay in milliseconds (default: 500) */
  reconnectDelay?: number;
  
  /** Maximum reconnection delay in milliseconds (default: 5000) */
  maxReconnectDelay?: number;
  
  /** Request timeout in milliseconds (default: 30000) */
  requestTimeout?: number;
  
  /** Session ID retention time in milliseconds after disconnect/error (default: 600000 = 10 minutes) */
  sessionIdRetention?: number;


};



/**
 * Client Request message
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
  event: string;
  data: {
    requestId: string;
    channels?: string[];
    [key: string]: unknown;
  };
};

/**
 * Server Response message
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
 * Server Notification message
 * Used when server sends unsolicited data to client
 */
export type ServerNotificationMessage = {
  event: string;
  subscriptionId: string;
  channel: string;
  data: Record<string, unknown>;
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
  /** Check if the subscription is still active */
  isActive: () => boolean;
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
  /** Check if the subscription is still active */
  isActive: () => boolean;
};

/**
 * Public WebSocket subscription object returned by the subscribe method
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
  sessionId?: string;
};



// Action types for the messaging system
export type WebSocketServiceInitAction = {
  type: `WebSocketService:init`;
  handler: WebSocketService['init'];
};

export type WebSocketServiceInitAction = {
  type: `WebSocketService:init`;
  handler: WebSocketService['init'];
};

export type WebSocketServiceConnectAction = {
  type: `WebSocketService:connect`;
  type: `WebSocketService:connect`;
  handler: WebSocketService['connect'];
};

export type WebSocketServiceDisconnectAction = {
  type: `WebSocketService:disconnect`;
  type: `WebSocketService:disconnect`;
  handler: WebSocketService['disconnect'];
};

export type WebSocketServiceSendMessageAction = {
  type: `WebSocketService:sendMessage`;
  type: `WebSocketService:sendMessage`;
  handler: WebSocketService['sendMessage'];
};

export type WebSocketServiceSendRequestAction = {
  type: `WebSocketService:sendRequest`;
  type: `WebSocketService:sendRequest`;
  handler: WebSocketService['sendRequest'];
};

export type WebSocketServiceGetConnectionInfoAction = {
  type: `WebSocketService:getConnectionInfo`;
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

export type WebSocketServiceReconnectWithFreshSessionAction = {
  type: `WebSocketService:reconnectWithFreshSession`;
  handler: WebSocketService['reconnectWithFreshSession'];
};

export type WebSocketServiceGetSessionRetentionInfoAction = {
  type: `WebSocketService:getSessionRetentionInfo`;
  handler: WebSocketService['getSessionRetentionInfo'];
};

export type WebSocketServiceCleanupAction = {
  type: `WebSocketService:cleanup`;
  handler: WebSocketService['cleanup'];
};

export type WebSocketServiceGetSubscriptionsByNamespaceAction = {
  type: `WebSocketService:getSubscriptionsByNamespace`;
  handler: WebSocketService['getSubscriptionsByNamespace'];
};

export type WebSocketServiceGetSubscriptionByChannelAction = {
  type: `WebSocketService:getSubscriptionByChannel`;
  handler: WebSocketService['getSubscriptionByChannel'];
};

export type WebSocketServiceIsChannelSubscribedAction = {
  type: `WebSocketService:isChannelSubscribed`;
  handler: WebSocketService['isChannelSubscribed'];
};



export type WebSocketServiceGetChannelSubscriptionMappingAction = {
  type: `WebSocketService:getChannelSubscriptionMapping`;
  handler: WebSocketService['getChannelSubscriptionMapping'];
};

export type WebSocketServiceActions = 
  | WebSocketServiceInitAction
  | WebSocketServiceInitAction
  | WebSocketServiceConnectAction
  | WebSocketServiceDisconnectAction
  | WebSocketServiceSendMessageAction
  | WebSocketServiceSendRequestAction
  | WebSocketServiceGetConnectionInfoAction
  | WebSocketServiceClearSessionAction
  | WebSocketServiceGetSessionIdAction
  | WebSocketServiceGetRequestQueueStatusAction
  | WebSocketServiceClearRequestQueueAction
  | WebSocketServiceReconnectWithFreshSessionAction
  | WebSocketServiceGetSessionRetentionInfoAction
  | WebSocketServiceCleanupAction
  | WebSocketServiceGetSubscriptionsByNamespaceAction
  | WebSocketServiceGetSubscriptionByChannelAction
  | WebSocketServiceIsChannelSubscribedAction
  | WebSocketServiceGetChannelSubscriptionMappingAction;

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
  #lastDisconnectTime: number | null = null;
  #manualDisconnectPreserveSession: boolean = false; // Track if manual disconnect should preserve session

  // Track the current connection promise to handle concurrent connection attempts
  #connectionPromise: Promise<void> | null = null;

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
  #requestQueue: Array<{
    message: ClientRequestMessage;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = [];
  #lastError: string | null = null;
  #connectedAt: number | null = null;
  #sessionId: string | null = null;

  // Namespace-organized subscription storage (prevents cross-service interference)
  #subscriptions = new Map<string, Map<string, InternalSubscription>>();
  
  // Channel to subscription ID mapping for fast O(1) channel lookups
  #channelToSubscriptionId = new Map<string, string>();
  

  
  // Connection monitoring for mobile optimizations
  #lastActivityTime = Date.now();



  /**
   * Creates a new WebSocket service instance
   */
  constructor(options: WebSocketServiceOptions & { messenger: WebSocketServiceMessenger }) {
    this.#messenger = options.messenger;
    
    this.#options = {
      url: options.url,
      timeout: options.timeout ?? 10000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
      reconnectDelay: options.reconnectDelay ?? 500,
      maxReconnectDelay: options.maxReconnectDelay ?? 5000,

      requestTimeout: options.requestTimeout ?? 30000,
      sessionIdRetention: options.sessionIdRetention ?? 600000, // 10 minutes default
    };



    // Register action handlers
    this.#messenger.registerActionHandler(
      `WebSocketService:init`,
      this.init.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:connect`,
      `WebSocketService:init`,
      this.init.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:connect`,
      this.connect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:disconnect`,
      `WebSocketService:disconnect`,
      this.disconnect.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:sendMessage`,
      `WebSocketService:sendMessage`,
      this.sendMessage.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:sendRequest`,
      `WebSocketService:sendRequest`,
      this.sendRequest.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getConnectionInfo`,
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

    this.#messenger.registerActionHandler(
      `WebSocketService:reconnectWithFreshSession`,
      this.reconnectWithFreshSession.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getSessionRetentionInfo`,
      this.getSessionRetentionInfo.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:cleanup`,
      this.cleanup.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getSubscriptionsByNamespace`,
      this.getSubscriptionsByNamespace.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getSubscriptionByChannel`,
      this.getSubscriptionByChannel.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:isChannelSubscribed`,
      this.isChannelSubscribed.bind(this),
    );

    this.#messenger.registerActionHandler(
      `WebSocketService:getChannelSubscriptionMapping`,
      this.getChannelSubscriptionMapping.bind(this),
    );

    this.init();
  }





  /**
   * Initializes and connects the WebSocket service
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
   */
  async connect(): Promise<void> {
    console.log('🔥 WebSocket connect() called, current state:', this.#state);
    // Reset any manual disconnect flags
    this.#manualDisconnectPreserveSession = false;
    
    // If already connected, return immediately
    if (this.#state === WebSocketState.CONNECTED) {
      console.log(`Connect called but already connected - skipping`);
      return;
    }

    // If already connecting, wait for the existing connection attempt to complete
    if (this.#state === WebSocketState.CONNECTING && this.#connectionPromise) {
      console.log(`Connect called but already connecting - waiting for existing attempt`);
      return this.#connectionPromise;
    }

    console.log(`🔄 Starting connection attempt to ${this.#options.url}${this.#sessionId ? ' with session: ' + this.#sessionId : ' (new session)'}`);
    this.#setState(WebSocketState.CONNECTING);
    this.#lastError = null;

    // Create and store the connection promise
    this.#connectionPromise = this.#doConnect();
    
    try {
      await this.#connectionPromise;
      console.log(`✅ Connection attempt succeeded`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
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
   */
  async #doConnect(): Promise<void> {
    await this.#establishConnection();
  }

  /**
   * Closes WebSocket connection
   */
  async disconnect(clearSession: boolean = false): Promise<void> {
    if (this.#state === WebSocketState.DISCONNECTED || this.#state === WebSocketState.DISCONNECTING) {
      console.log(`Disconnect called but already in state: ${this.#state}`);
      return;
    }

    console.log(`Manual disconnect initiated - closing WebSocket connection`);
    
    // Track if this manual disconnect should preserve session
    this.#manualDisconnectPreserveSession = !clearSession;
    
    this.#setState(WebSocketState.DISCONNECTING);
    this.#clearTimers();
    this.#rejectPendingRequests(new Error('WebSocket disconnected'));

    // Clear any pending connection promise
    this.#connectionPromise = null;

    this.#ws.close(1000, 'Normal closure');

    this.#setState(WebSocketState.DISCONNECTED);
    
    if (clearSession) {
      const clearedSessionId = this.#sessionId;
      this.#sessionId = null;
      console.log(`WebSocket manually disconnected and session cleared: ${clearedSessionId || 'none'}`);
    } else {
      console.log(`WebSocket manually disconnected - keeping session: ${this.#sessionId || 'none'} (use disconnect(true) to clear session)`);
      if (this.#sessionId) {
        // Record disconnect time for manual disconnects too
        this.#recordDisconnectTime();
      }
    }
    
    // Note: Event system removed - use direct service integration
  }

  /**
   * Sends a message through the WebSocket
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
      event: message.event,
      data: {
        requestId,
        ...message.data,
      },
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from pending requests
        // Remove from pending requests
        this.#pendingRequests.delete(requestId);
        
        // Remove from request queue if still there
        const queueIndex = this.#requestQueue.findIndex(req => req.message.data.requestId === requestId);
        if (queueIndex !== -1) {
          this.#requestQueue.splice(queueIndex, 1);
        }
        
        
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
   * Gets session retention information
   */
  getSessionRetentionInfo(): {
    sessionId: string | null;
    lastDisconnectTime: number | null;
    timeSinceDisconnectMs: number | null;
    retentionDurationMs: number;
    retentionDurationMinutes: number;
    sessionExpired: boolean;
  } {
    const retentionMs = this.#options.sessionIdRetention;
    const timeSinceDisconnect = this.#lastDisconnectTime ? Date.now() - this.#lastDisconnectTime : null;
    const sessionExpired = timeSinceDisconnect !== null && timeSinceDisconnect >= retentionMs;
    
    return {
      sessionId: this.#sessionId,
      lastDisconnectTime: this.#lastDisconnectTime,
      timeSinceDisconnectMs: timeSinceDisconnect,
      retentionDurationMs: retentionMs,
      retentionDurationMinutes: Math.round(retentionMs / 60000),
      sessionExpired,
    };
  }



  /**
   * Gets all subscriptions for a specific namespace
   * Provides complete isolation between services
   * 
   * @param namespace - The namespace to get subscriptions for
   * @returns Map of subscription IDs to subscription details for the namespace
   */
  getSubscriptionsByNamespace(namespace: string): Map<string, InternalSubscription> {
    const namespaceSubscriptions = this.#subscriptions.get(namespace);
    if (!namespaceSubscriptions) {
      return new Map();
    }
    return new Map(namespaceSubscriptions);
  }

  /**
   * Gets subscription information for a specific channel
   * 
   * @param channel - The channel name to look up
   * @returns Subscription details or undefined if not found
   */
  getSubscriptionByChannel(namespace: string, channel: string): SubscriptionInfo | undefined {
    const subscriptionId = this.#channelToSubscriptionId.get(channel);
    if (!subscriptionId) {
      return undefined;
    }
    const namespaceSubscriptions = this.#subscriptions.get(namespace);
    if (!namespaceSubscriptions) {
      return undefined;
    }
    const subscription = namespaceSubscriptions.get(subscriptionId);
    if (!subscription) {
      return undefined;
    }
    return {
      subscriptionId,
      channels: subscription.channels,
      unsubscribe: subscription.unsubscribe,
      isActive: subscription.isActive,
    };
  }



  /**
   * Checks if a channel is currently subscribed
   * 
   * @param channel - The channel name to check
   * @returns True if the channel is subscribed, false otherwise
   */
  isChannelSubscribed(channel: string): boolean {
    return this.#channelToSubscriptionId.has(channel);
  }



  /**
   * Gets channel-to-subscription-ID mapping
   * 
   * @returns Record mapping channel names to subscription IDs
   */
  getChannelSubscriptionMapping(): Record<string, string> {
    const result: Record<string, string> = {};
    this.#subscriptions.forEach(namespaceSubscriptions => {
      namespaceSubscriptions.forEach((sub, subscriptionId) => {
        sub.channels.forEach(channel => {
          result[channel] = subscriptionId;
        });
      });
    });
    return result;
  }

  /**
   * Manually clears the session ID
   */
  clearSession(): void {
    const previousSessionId = this.#sessionId;
    this.#sessionId = null;
    
    // Clear disconnect time tracking
    this.#lastDisconnectTime = null;
    
    if (previousSessionId) {
      console.log(`🔄 MANUALLY cleared session: ${previousSessionId} - next connection will create new session`);
    } else {
      console.log(`🔄 Session already cleared`);
    }
  }

  /**
   * Force reconnection with a fresh session
   */
  async reconnectWithFreshSession(): Promise<void> {
    console.log(`🔄 Forcing reconnection with fresh session...`);
    this.clearSession();
    
    if (this.#state !== WebSocketState.DISCONNECTED) {
      await this.disconnect(false); // Don't double-clear the session
    }
    
    return this.connect();
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
   * Clean up resources and close connections
   * Called when service is being destroyed or app is terminating
   */
  cleanup(): void {
    this.#clearTimers();
    this.#subscriptions.clear();
    this.#channelToSubscriptionId.clear();
    
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
   * @returns Subscription object with unsubscribe method
   * 
   * @example
   * ```typescript
   * // AccountActivityService usage
   * const subscription = await webSocketService.subscribe({
   *   channels: ['account-activity.v1.eip155:0:0x1234...'],
   *   onNotification: (notification) => {
   *     this.handleAccountActivity(notification.data);
   *   }
   * });
   * 
   * // Later, clean up
   * await subscription.unsubscribe();
   * ```
   */
  async subscribe(options: {
    /** Namespace for the subscription (e.g., 'account-activity.v1') */
    namespace: string;
    /** Channel names to subscribe to */
    channels: string[];
    /** Handler for incoming notifications */
    callback: (notification: ServerNotificationMessage) => void;
  }): Promise<WebSocketSubscription> {
    const { channels, callback } = options;

    if (this.#state !== WebSocketState.CONNECTED) {
      throw new Error(`Cannot create subscription: WebSocket is ${this.#state}`);
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
    if (!subscriptionResponse?.subscriptionId) {
      throw new Error('Invalid subscription response: missing subscription ID');
    }

    const subscriptionId = subscriptionResponse.subscriptionId;
    const subscriptionId = subscriptionResponse.subscriptionId;

    // Check for failures
    if (subscriptionResponse.failed && subscriptionResponse.failed.length > 0) {
      throw new Error(`Subscription failed for channels: ${subscriptionResponse.failed.join(', ')}`);
    }

    // Create unsubscribe function
    const unsubscribe = async (): Promise<void> => {
      try {
        // Send unsubscribe request first
        await this.sendRequest({
          event: 'unsubscribe',
          data: {
          event: 'unsubscribe',
          data: {
            subscription: subscriptionId,
            channels, // Include original channels in case server needs them
          },
        });

        // Only clean up mappings after successful server response
        this.#subscriptions.forEach(namespaceSubscriptions => namespaceSubscriptions.delete(subscriptionId));
        channels.forEach(channel => this.#channelToSubscriptionId.delete(channel));
      } catch (error) {
        console.error('Failed to unsubscribe:', error);
        throw error;
      }
    };

    const subscription = {
      subscriptionId,
      unsubscribe,
      isActive: () => this.#state === WebSocketState.CONNECTED,
    };

    // Store in consolidated subscription tracking (callback + metadata)
    const { namespace } = options;
    if (!this.#subscriptions.has(namespace)) {
      this.#subscriptions.set(namespace, new Map());
    }
    this.#subscriptions.get(namespace)!.set(subscriptionId, {
      channels: [...channels], // Store copy of channels
      callback, // Store callback for efficient routing
      unsubscribe,
      isActive: subscription.isActive,
    });

    // Update channel-to-subscription mapping
    channels.forEach(channel => this.#channelToSubscriptionId.set(channel, subscriptionId));

    return subscription;
  }





  /**
   * Establishes the actual WebSocket connection
   */
  async #establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Build WebSocket URL with query parameters
      const url = new URL(this.#options.url);
      
      // Ensure the path includes /v1 and add sessionId for reconnection if we have one
      if (this.#sessionId) {
        // Ensure path ends with /v1 for API versioning
        if (!url.pathname.endsWith('/v1')) {
          url.pathname = url.pathname.replace(/\/$/, '') + '/v1';
        }
        url.searchParams.set('sessionId', this.#sessionId);
        console.log(`🔄 Reconnecting with existing session: ${this.#sessionId}`);
      } else {
        // For initial connection, also ensure /v1 path
        if (!url.pathname.endsWith('/v1')) {
          url.pathname = url.pathname.replace(/\/$/, '') + '/v1';
        }
        console.log(`🆕 Creating new connection`);
      }

      const wsUrl = url.toString();
      const ws = new WebSocket(wsUrl);
      const connectTimeout = setTimeout(() => {
        console.log(`🔴 WebSocket connection timeout after ${this.#options.timeout}ms - forcing close`);
        ws.close();
        reject(new Error(`Connection timeout after ${this.#options.timeout}ms`));
      }, this.#options.timeout);

      ws.onopen = () => {
        console.log(`✅ WebSocket connection opened successfully`);
        clearTimeout(connectTimeout);
        this.#ws = ws;
        this.#setState(WebSocketState.CONNECTED);
        this.#connectedAt = Date.now();
        
        const wasReconnecting = this.#reconnectAttempts > 0;
        const hadExistingSession = this.#sessionId !== null;
        
        // Reset reconnect attempts on successful connection
        
        const wasReconnecting = this.#reconnectAttempts > 0;
        const hadExistingSession = this.#sessionId !== null;
        
        // Reset reconnect attempts on successful connection
        this.#reconnectAttempts = 0;
        
        // Clear disconnect time since we're successfully connected
        this.#lastDisconnectTime = null;
        
        this.#setupEventHandlers();
        this.#processQueuedRequests();
        
        // Note: Event system removed - use direct service integration
        
        if (wasReconnecting) {
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
        console.error(`❌ WebSocket error during connection attempt:`, {
          type: event.type,
          target: event.target,
          url: wsUrl,
          sessionId: this.#sessionId,
          readyState: ws.readyState,
          readyStateName: { 0: 'CONNECTING', 1: 'OPEN', 2: 'CLOSING', 3: 'CLOSED' }[ws.readyState]
        });
        const error = new Error(`WebSocket connection error to ${wsUrl}: readyState=${ws.readyState}`);
        reject(error);
      };

      ws.onclose = (event: CloseEvent) => {
        clearTimeout(connectTimeout);
        console.log(`WebSocket closed during connection setup - code: ${event.code} - ${this.#getCloseReason(event.code)}, reason: ${event.reason || 'none'}, state: ${this.#state}`);
        if (this.#state === WebSocketState.CONNECTING) {
          console.log(`Connection attempt failed due to close event during CONNECTING state`);
          reject(new Error(`WebSocket connection closed during connection: ${event.code} ${event.reason}`));
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

    this.#ws.onmessage = (event: any) => {
      console.log('🔥 WebSocket onmessage received:', event.data);
      // Fast path: Optimized parsing for mobile real-time performance
      const message = this.#parseMessage(event.data);
      console.log('🔥 WebSocket parsed message:', message);
      if (message) {
        console.log('🔥 WebSocket calling handleMessage with:', message);
        this.#handleMessage(message);
      } else {
        console.log('🔥 WebSocket message parsing failed for:', event.data);
      }
      // Note: Parse errors are silently ignored for mobile performance
    };

    this.#ws.onclose = (event: any) => {
      console.log(`WebSocket onclose event triggered - code: ${event.code}, reason: ${event.reason || 'none'}, wasClean: ${event.wasClean}`);
      this.#handleClose(event);
    };

    this.#ws.onerror = (event: any) => {
      console.log(`WebSocket onerror event triggered:`, event);
      this.#handleError(new Error(`WebSocket error: ${event}`));
    };




  }



  /**
   * Handles incoming WebSocket messages (optimized for mobile real-time performance)
   */
  #handleMessage(message: WebSocketMessage): void {
    // Fast path: Check message type using property existence (mobile optimization)
    const hasEvent = 'event' in message;
    const hasSubscriptionId = 'subscriptionId' in message;
    const hasData = 'data' in message;
    
    // Handle session-created event (optimized for mobile)
    if (hasEvent && (message as any).event === 'session-created' && hasData) {
      const messageData = (message as any).data;
      if (messageData && typeof messageData === 'object' && 'sessionId' in messageData) {
        const newSessionId = messageData.sessionId as string;
        const previousSessionId = this.#sessionId;
        
        // Determine the type of session event
        if (previousSessionId === null) {
          // Initial connection - new session created
          this.#sessionId = newSessionId;
          console.log(`WebSocket session created: ${this.#sessionId}`);
        } else if (previousSessionId === newSessionId) {
          // Successful reconnection - same session restored
          console.log(`WebSocket session restored: ${this.#sessionId} - expecting server to send subscribed messages for resumed channels`);
        } else {
          // Failed reconnection - old session expired, new session created
          console.log(`WebSocket session expired, new session created. Old: ${previousSessionId}, New: ${newSessionId}`);
          this.#sessionId = newSessionId;
        }
        return;
      }
    }

    // Handle server responses (correlated with requests)
    if ('data' in message && message.data && typeof message.data === 'object' && 'requestId' in message.data) {
    if ('data' in message && message.data && typeof message.data === 'object' && 'requestId' in message.data) {
      const responseMessage = message as ServerResponseMessage;
      const requestId = responseMessage.data.requestId;
      
      if (this.#pendingRequests.has(requestId)) {
        const request = this.#pendingRequests.get(requestId)!;
        this.#pendingRequests.delete(requestId);
      const requestId = responseMessage.data.requestId;
      
      if (this.#pendingRequests.has(requestId)) {
        const request = this.#pendingRequests.get(requestId)!;
        this.#pendingRequests.delete(requestId);
        clearTimeout(request.timeout);
        
        // Check if the response indicates failure
        if (responseMessage.data.failed && responseMessage.data.failed.length > 0) {
          request.reject(new Error(`Request failed: ${responseMessage.data.failed.join(', ')}`));
        // Check if the response indicates failure
        if (responseMessage.data.failed && responseMessage.data.failed.length > 0) {
          request.reject(new Error(`Request failed: ${responseMessage.data.failed.join(', ')}`));
        } else {
          request.resolve(responseMessage.data);
          request.resolve(responseMessage.data);
        }
        return;
      }
    }



    // Handle server-generated subscription restoration messages (no requestId)
    if ('event' in message && message.event === 'subscribed' && 'data' in message && message.data && typeof message.data === 'object' && !('requestId' in message.data)) {
      console.log(`Server restored subscription: ${JSON.stringify(message.data)}`);
      // These are server-generated subscription confirmations during session restoration
      // No action needed - just log for debugging
      return;
    }

        // Handle server notifications (optimized for real-time mobile performance)
    if (hasSubscriptionId && !(hasData && (message as any).data && typeof (message as any).data === 'object' && 'requestId' in (message as any).data)) {
      const notificationMessage = message as ServerNotificationMessage;
      const subscriptionId = notificationMessage.subscriptionId;
      
      console.log('🔥 WebSocket handling server notification:', {
        subscriptionId,
        channel: notificationMessage.channel,
        hasData: hasData,
        subscriptionsCount: this.#subscriptions.size
      });
      
      // Fast path: Direct callback routing (zero-allocation lookup)
      let callbackFound = false;
      this.#subscriptions.forEach((namespaceSubscriptions, namespace) => {
        console.log(`🔥 WebSocket checking namespace '${namespace}' with ${namespaceSubscriptions.size} subscriptions`);
        const subscription = namespaceSubscriptions.get(subscriptionId);
        if (subscription) {
          callbackFound = true;
          console.log('🔥 WebSocket found subscription callback, executing...');
          const callback = subscription.callback;
          // Development: Full error handling
          if (process.env.NODE_ENV === 'development') {
            try {
              callback(notificationMessage);
            } catch (error) {
              console.error(`Error in subscription callback for ${subscriptionId}:`, error);
            }
          } else {
            // Production: Direct call for maximum speed
            callback(notificationMessage);
          }
        }
      });
      
      if (!callbackFound) {
        console.log(`🔥 WebSocket no subscription callback found for subscriptionId: ${subscriptionId}`);
      }
      
      return;
    }
  }



  /**
   * Optimized message parsing for mobile (reduces JSON.parse overhead)
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
   */
  #handleClose(event: CloseEvent): void {
    this.#clearTimers();
    this.#connectedAt = null;

    // Clear any pending connection promise
    this.#connectionPromise = null;

    // Log close reason for debugging
    const closeReason = this.#getCloseReason(event.code);
    console.log(`WebSocket closed: ${event.code} - ${closeReason} (reason: ${event.reason || 'none'}) - current state: ${this.#state}`);

    if (this.#state === WebSocketState.DISCONNECTING) {
      // Manual disconnect - sessionId was already cleared in disconnect() if clearSession=true
      this.#setState(WebSocketState.DISCONNECTED);
      this.#manualDisconnectPreserveSession = false; // Reset flag
      // Note: Event system removed - use direct service integration
      return;
    }

    // For unexpected disconnects, keep sessionId for reconnection
    // First, always update the state to reflect that we're disconnected
    this.#setState(WebSocketState.DISCONNECTED);
    
    // Check if this was a manual disconnect that should preserve session
    if (this.#manualDisconnectPreserveSession && event.code === 1000) {
      console.log(`🌙 Manual disconnect with session preservation - keeping session: ${this.#sessionId || 'none'}`);
      this.#manualDisconnectPreserveSession = false; // Reset flag
      return;
    }
    
    // Check if we should attempt reconnection based on close code
    const shouldReconnect = this.#shouldReconnectOnClose(event.code);
    
    if (shouldReconnect) {
      console.log(`Connection lost unexpectedly, will attempt reconnection with session: ${this.#sessionId || 'none'}`);
      if (!this.#sessionId) {
        console.log(`⚠️  WARNING: No sessionId available for reconnection - will create new session`);
      } else {
        // Record disconnect time for session retention
        this.#recordDisconnectTime();
      }
      this.#scheduleReconnect();
    } else {
      // Non-recoverable error - clear session immediately and set error state
      const clearedSessionId = this.#sessionId;
      this.#sessionId = null;
      console.log(`🔄 Clearing session due to non-recoverable error: ${clearedSessionId || 'none'}`);
      this.#setState(WebSocketState.ERROR);
      this.#lastError = `Non-recoverable close code: ${event.code} - ${closeReason}`;
      // Note: Event system removed - use direct service integration
    }
    
    // Reset the manual disconnect flag in all cases
    this.#manualDisconnectPreserveSession = false;
  }

  /**
   * Handles WebSocket errors
   * 
   * @param error - Error that occurred
   * @private
   */
  #handleError(error: Error): void {
    this.#lastError = error.message;
    // Note: Event system removed - use direct service integration
  }

  /**
   * Schedules a reconnection attempt with exponential backoff
   */
  #scheduleReconnect(): void {
    this.#reconnectAttempts++;
    
    const rawDelay = this.#options.reconnectDelay * Math.pow(1.5, this.#reconnectAttempts - 1);
    const delay = Math.min(rawDelay, this.#options.maxReconnectDelay);

    console.log(`⏱️ Scheduling reconnection attempt #${this.#reconnectAttempts} in ${delay}ms (${(delay/1000).toFixed(1)}s)`);

    this.#reconnectTimer = setTimeout(() => {
      console.log(`🔄 ${delay}ms delay elapsed - starting reconnection attempt #${this.#reconnectAttempts}...`);
      
      // Check if session has expired before attempting reconnection
      this.#checkAndClearExpiredSession();
      
      this.connect().catch((error) => {
        console.error(`❌ Reconnection attempt #${this.#reconnectAttempts} failed:`, error);
        
        // Always schedule another reconnection attempt (unlimited retries)
        console.log(`Scheduling next reconnection attempt (attempt #${this.#reconnectAttempts})`);
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
   * Checks if the session has expired and clears it if needed
   */
  #checkAndClearExpiredSession(): void {
    if (!this.#sessionId || !this.#lastDisconnectTime) {
      return;
    }

    const now = Date.now();
    const timeSinceDisconnect = now - this.#lastDisconnectTime;
    const retentionMs = this.#options.sessionIdRetention;
    const retentionMinutes = Math.round(retentionMs / 60000);

    if (timeSinceDisconnect >= retentionMs) {
      const expiredSessionId = this.#sessionId;
      this.#sessionId = null;
      this.#lastDisconnectTime = null;
      console.log(`⏰ Session expired after ${retentionMinutes} minutes - cleared sessionId: ${expiredSessionId} (disconnected ${Math.round(timeSinceDisconnect / 60000)} minutes ago)`);
    } else {
      const remainingMs = retentionMs - timeSinceDisconnect;
      const remainingMinutes = Math.round(remainingMs / 60000);
      console.log(`⏰ Session still valid: ${this.#sessionId} - expires in ${remainingMinutes} minutes`);
    }
  }

  /**
   * Records the disconnect time for session retention tracking
   */
  #recordDisconnectTime(): void {
    this.#lastDisconnectTime = Date.now();
    const retentionMinutes = Math.round(this.#options.sessionIdRetention / 60000);
    console.log(`⏰ Recorded disconnect time for session: ${this.#sessionId} - will expire in ${retentionMinutes} minutes`);
  }

  /**
   * Rejects all pending requests with the given error
   * 
   * @param error - Error to reject with
   * @private
   */
  #rejectPendingRequests(error: Error): void {
    // Reject all pending requests
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
    
    // Clear subscription callbacks and centralized tracking on disconnect
    this.#subscriptions.clear();
    this.#channelToSubscriptionId.clear();
  }

  /**
   * Processes any requests that were queued while disconnected
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
    
    if (queuedRequestCount > 0) {
      console.log(`Finished processing ${queuedRequestCount} queued requests`);
    }
  }

  /**
   * Sets the connection state and emits state change events
   */
  #setState(newState: WebSocketState): void {
    const oldState = this.#state;
    this.#state = newState;
    
    if (oldState !== newState) {
      console.log(`WebSocket state changed: ${oldState} → ${newState}`);
      
      // Log disconnection-related state changes
      if (newState === WebSocketState.DISCONNECTED || newState === WebSocketState.DISCONNECTING || newState === WebSocketState.ERROR) {
        console.log(`🔴 WebSocket disconnection detected - state: ${oldState} → ${newState}`);
      }
      
      // Note: Event system removed - use direct service integration
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
    console.log(`Evaluating if reconnection should be attempted for close code: ${code} - ${this.#getCloseReason(code)}`);
    
    // Don't reconnect only on normal closure (manual disconnect)
    if (code === 1000) {
      console.log(`Not reconnecting - normal closure (manual disconnect)`);
      return false;
    }
    
    // For "Going Away" (1001), check the reason to distinguish between client vs server initiated
    if (code === 1001) {
      // If it's a server shutdown, we should retry
      console.log(`"Going Away" detected - will reconnect as this may be a temporary server shutdown`);
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