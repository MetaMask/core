/**
 * Account Activity Service for monitoring account transactions and balance changes
 * 
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the unified
 * TransactionWithKeyringBalanceUpdate message format.
 */


import type { RestrictedMessenger } from '@metamask/base-controller';
import type { 
  WebSocketService, 
} from './websocket-service';
import { WebSocketEventType } from './websocket-service';
import type { 
  TransactionWithKeyringBalanceUpdate,
  Transaction,
  AccountBalancesUpdatedEventPayload,
} from './types';

const SERVICE_NAME = 'AccountActivityService';

/**
 * Account subscription options
 */
export type AccountSubscription = {
  addresses: string[];
};

/**
 * Configuration options for the account activity service
 */
export type AccountActivityServiceOptions = {
  // Account monitoring options
  maxAddressesPerSubscription?: number;
  maxActiveSubscriptions?: number;
  
  // Transaction processing options
  processAllTransactions?: boolean;
};

// Action types for the messaging system
export type AccountActivityServiceSubscribeAccountsAction = {
  type: `${typeof SERVICE_NAME}:subscribeAccounts`;
  handler: AccountActivityService['subscribeAccounts'];
};

export type AccountActivityServiceUnsubscribeAccountsAction = {
  type: `${typeof SERVICE_NAME}:unsubscribeAccounts`;
  handler: AccountActivityService['unsubscribeAccounts'];
};



export type AccountActivityServiceGetActiveSubscriptionsAction = {
  type: `${typeof SERVICE_NAME}:getActiveSubscriptions`;
  handler: AccountActivityService['getActiveSubscriptions'];
};

export type AccountActivityServiceGetSubscriptionIdsAction = {
  type: `${typeof SERVICE_NAME}:getSubscriptionIds`;
  handler: AccountActivityService['getSubscriptionIds'];
};

export type AccountActivityServiceActions = 
  | AccountActivityServiceSubscribeAccountsAction
  | AccountActivityServiceUnsubscribeAccountsAction
  | AccountActivityServiceGetActiveSubscriptionsAction
  | AccountActivityServiceGetSubscriptionIdsAction;

type AllowedActions = never;

// Event types for the messaging system
export type AccountActivityServiceAccountSubscribedEvent = {
  type: `${typeof SERVICE_NAME}:accountSubscribed`;
  payload: [{ addresses: string[] }];
};

export type AccountActivityServiceAccountUnsubscribedEvent = {
  type: `${typeof SERVICE_NAME}:accountUnsubscribed`;
  payload: [{ addresses: string[] }];
};

export type AccountActivityServiceTransactionUpdatedEvent = {
  type: `${typeof SERVICE_NAME}:transactionUpdated`;
  payload: [Transaction];
};

export type AccountActivityServiceBalanceUpdatedEvent = {
  type: `${typeof SERVICE_NAME}:balanceUpdated`;
  payload: [AccountBalancesUpdatedEventPayload];
};

export type AccountActivityServiceSubscriptionErrorEvent = {
  type: `${typeof SERVICE_NAME}:subscriptionError`;
  payload: [{ addresses: string[]; error: string; operation: string }];
};

export type AccountActivityServiceEvents = 
  | AccountActivityServiceAccountSubscribedEvent
  | AccountActivityServiceAccountUnsubscribedEvent
  | AccountActivityServiceTransactionUpdatedEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceSubscriptionErrorEvent;

type AllowedEvents = never;

export type AccountActivityServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  AccountActivityServiceActions | AllowedActions,
  AccountActivityServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Account Activity Service
 * 
 * Subscribes to account activity and receives all transactions and balance updates
 * for those accounts using the unified TransactionWithKeyringBalanceUpdate message
 * format from keyring-api.
 * 
 * @example
 * ```typescript
 * const service = new AccountActivityService({
 *   messenger: activityMessenger,
 *   webSocketService: wsService,
 *   maxAddressesPerSubscription: 50,
 *   processAllTransactions: true,
 * });
 * 
 * // Subscribe to account activity
 * await service.subscribeAccounts({
 *   addresses: ['0x1234...', '0x5678...'],
 *   chainId: '1',
 *   includeTokens: true,
 *   includeTransactions: true,
 * });
 * 
 * // All transactions and balance updates for these accounts
 * // will now be received via WebSocket and processed automatically
 * ```
 */
export class AccountActivityService {
  readonly #messenger: AccountActivityServiceMessenger;
  readonly #webSocketService: WebSocketService;
  readonly #options: Required<AccountActivityServiceOptions>;

  // Account subscription state
  #subscriptionIds = new Map<string, any>(); // Key: address, Value: WebSocket subscription object
  
  // WebSocket method watchers cleanup functions
  #watcherCleanups: (() => void)[] = [];

  /**
   * Creates a new Account Activity service instance
   */
  constructor(options: AccountActivityServiceOptions & { 
    messenger: AccountActivityServiceMessenger;
    webSocketService: WebSocketService;
  }) {
    this.#messenger = options.messenger;
    this.#webSocketService = options.webSocketService;
    
    this.#options = {
      maxAddressesPerSubscription: options.maxAddressesPerSubscription ?? 50,
      maxActiveSubscriptions: options.maxActiveSubscriptions ?? 20,
      processAllTransactions: options.processAllTransactions ?? true,
    };

    this.#setupWebSocketHandlers();
    this.#registerActionHandlers();
  }

  // =============================================================================
  // Account Subscription Methods
  // =============================================================================

  /**
   * Subscribe to account activity (transactions and balance updates)
   */
  async subscribeAccounts(subscription: AccountSubscription): Promise<void> {
    if (subscription.addresses.length > this.#options.maxAddressesPerSubscription) {
      throw new Error(`Cannot subscribe to more than ${this.#options.maxAddressesPerSubscription} addresses`);
    }

    if (this.#subscriptionIds.size >= this.#options.maxActiveSubscriptions) {
      throw new Error(`Cannot have more than ${this.#options.maxActiveSubscriptions} active subscriptions`);
    }

    try {
      await this.#webSocketService.connect();

      // Subscribe to each address individually using the high-level subscribe method
      for (const address of subscription.addresses) {
        const addressKey = address.toLowerCase(); // Use address as key since we're subscribing to all chains
        
        // Skip if already subscribed to this address
        if (this.#subscriptionIds.has(addressKey)) {
          continue;
        }
        
        const wsSubscription = await this.#webSocketService.subscribe({
          method: 'account_activity',
          params: {
            address,
          },
          onNotification: (notification) => {
            this.#handleAccountActivityUpdate(notification.params as TransactionWithKeyringBalanceUpdate);
          },
        });
        
        // Store the subscription object
        this.#subscriptionIds.set(addressKey, wsSubscription);

        this.#messenger.publish(`${SERVICE_NAME}:accountSubscribed`, {
          addresses: [address],
        });
      }

      

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown subscription error';
      
      this.#messenger.publish(`${SERVICE_NAME}:subscriptionError`, {
        addresses: subscription.addresses,
        error: errorMessage,
        operation: 'subscribe',
      });

      throw new Error(`Failed to subscribe to account activity: ${errorMessage}`);
    }
  }

  /**
   * Unsubscribe from account activity for specified addresses
   */
  async unsubscribeAccounts(addresses: string[]): Promise<void> {
    try {
      // Unsubscribe each address individually
      for (const address of addresses) {
        const addressKey = address.toLowerCase();
        const wsSubscription = this.#subscriptionIds.get(addressKey);
        
        if (wsSubscription) {
          // Call unsubscribe on the WebSocket subscription object
          await wsSubscription.unsubscribe();
          
          // Clean up our tracking
          this.#subscriptionIds.delete(addressKey);
        }
        
      }

      this.#messenger.publish(`${SERVICE_NAME}:accountUnsubscribed`, {
        addresses,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown unsubscription error';
      
      this.#messenger.publish(`${SERVICE_NAME}:subscriptionError`, {
        addresses,
        error: errorMessage,
        operation: 'unsubscribe',
      });

      throw new Error(`Failed to unsubscribe from account activity: ${errorMessage}`);
    }
  }

  // =============================================================================
  // Data Access Methods
  // =============================================================================

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): Record<string, string> {
    const result: Record<string, string> = {};
    
    this.#subscriptionIds.forEach((subscription, address) => {
      result[address] = subscription.subscriptionId;
    });

    return result;
  }

  /**
   * Get subscription IDs for all subscribed addresses
   */
  getSubscriptionIds(): Record<string, string> {
    const result: Record<string, string> = {};
    
    this.#subscriptionIds.forEach((subscription, address) => {
      result[address] = subscription.subscriptionId;
    });

    return result;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Register all action handlers
   */
  #registerActionHandlers(): void {
    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:subscribeAccounts`,
      this.subscribeAccounts.bind(this),
    );

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:unsubscribeAccounts`,
      this.unsubscribeAccounts.bind(this),
    );



    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getActiveSubscriptions`,
      this.getActiveSubscriptions.bind(this),
    );

    this.#messenger.registerActionHandler(
      `${SERVICE_NAME}:getSubscriptionIds`,
      this.getSubscriptionIds.bind(this),
    );
  }

  /**
   * Set up WebSocket message handlers
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
    this.#resubscribeAllAccounts();
  };



  /**
   * Handle account activity updates (transactions + balance changes)
   */
  #handleAccountActivityUpdate(payload: TransactionWithKeyringBalanceUpdate): void {
    const { tx, balances } = payload;
    
    // Process transaction update
    this.#messenger.publish(`${SERVICE_NAME}:transactionUpdated`, tx);
    
    // Process balance updates
    this.#messenger.publish(`${SERVICE_NAME}:balanceUpdated`, balances)
  }



  /**
   * Resubscribe to all accounts after reconnection
   */
  async #resubscribeAllAccounts(): Promise<void> {
    const addresses = Array.from(this.#subscriptionIds.keys());
    
    // Clear existing subscription tracking since we're reconnecting
    this.#subscriptionIds.clear();
    
    // Resubscribe to all addresses
    if (addresses.length > 0) {
      try {
        await this.subscribeAccounts({addresses});
      } catch (error) {
        console.error('Failed to resubscribe to account activity:', error);
      }
    }
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
  }
} 