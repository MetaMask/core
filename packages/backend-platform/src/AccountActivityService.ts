/**
 * Account Activity Service for monitoring account transactions and balance changes
 * 
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the comprehensive Message format.
 */


import type { RestrictedMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { 
  WebSocketService,
} from './WebsocketService';
import type { 
  Transaction,
  Message,
  BalanceUpdate,
} from './types';

const SERVICE_NAME = 'AccountActivityService';
const SUBSCRIPTION_NAMESPACE = 'account-activity.v1';

/**
 * Account subscription options
 */
export type AccountSubscription = {
  address: string; // Should be in CAIP-10 format, e.g., "eip155:0:0x1234..." or "solana:0:ABC123..."
};

/**
 * Configuration options for the account activity service
 */
export type AccountActivityServiceOptions = {
  // Account monitoring options
  maxActiveSubscriptions?: number;
  
  // Transaction processing options
  processAllTransactions?: boolean;
};




// Action types for the messaging system
export type AccountActivityServiceSubscribeAccountsAction = {
  type: `AccountActivityService:subscribeAccounts`;
  handler: AccountActivityService['subscribeAccounts'];
};

export type AccountActivityServiceUnsubscribeAccountsAction = {
  type: `AccountActivityService:unsubscribeAccounts`;
  handler: AccountActivityService['unsubscribeAccounts'];
};


export type AccountActivityServiceActions = 
  | AccountActivityServiceSubscribeAccountsAction
  | AccountActivityServiceUnsubscribeAccountsAction

type AllowedActions = 
  | { type: 'AccountsController:listMultichainAccounts'; handler: (chainId?: string) => InternalAccount[] }
  | { type: 'AccountsController:getAccountByAddress'; handler: (address: string) => InternalAccount | undefined };

// Event types for the messaging system
export type AccountActivityServiceAccountSubscribedEvent = {
  type: `AccountActivityService:accountSubscribed`;
  payload: [{ addresses: string[] }];
};

export type AccountActivityServiceAccountUnsubscribedEvent = {
  type: `AccountActivityService:accountUnsubscribed`;
  payload: [{ addresses: string[] }];
};

export type AccountActivityServiceTransactionUpdatedEvent = {
  type: `AccountActivityService:transactionUpdated`;
  payload: [Transaction];
};

export type AccountActivityServiceBalanceUpdatedEvent = {
  type: `AccountActivityService:balanceUpdated`;
  payload: [BalanceUpdate[]];
};

export type AccountActivityServiceSubscriptionErrorEvent = {
  type: `AccountActivityService:subscriptionError`;
  payload: [{ addresses: string[]; error: string; operation: string }];
};

export type AccountActivityServiceEvents = 
  | AccountActivityServiceAccountSubscribedEvent
  | AccountActivityServiceAccountUnsubscribedEvent
  | AccountActivityServiceTransactionUpdatedEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceSubscriptionErrorEvent;

type AllowedEvents = 
  | { type: 'AccountsController:accountAdded'; payload: [InternalAccount] }
  | { type: 'AccountsController:accountRemoved'; payload: [string] }
  | { type: 'AccountsController:listMultichainAccounts'; payload: [string] }
  | AccountActivityServiceAccountSubscribedEvent
  | AccountActivityServiceAccountUnsubscribedEvent
  | AccountActivityServiceTransactionUpdatedEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceSubscriptionErrorEvent;

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
 * High-performance service for real-time account activity monitoring using optimized
 * WebSocket subscriptions with direct callback routing. Receives transactions and 
 * balance updates using the comprehensive Message format with detailed transfer information.
 * 
 * Performance Features:
 * - Direct callback routing (no EventEmitter overhead)
 * - Minimal subscription tracking (no duplication with WebSocketService)
 * - Optimized cleanup for mobile environments  
 * - Comprehensive balance updates with transfer tracking
 * 
 * Architecture:
 * - WebSocketService manages the actual WebSocket subscriptions and callbacks
 * - AccountActivityService only tracks channel-to-subscriptionId mappings
 * - No duplication of subscription state between services
 * 
 * @example
 * ```typescript
 * const service = new AccountActivityService({
 *   messenger: activityMessenger,
 *   webSocketService: wsService,
 *   maxActiveSubscriptions: 20,
 *   maxActiveSubscriptions: 20,
 *   processAllTransactions: true,
 * });
 * 
 * // Subscribe to account activity with CAIP-10 formatted address
 * await service.subscribeAccounts({
 *   address: 'eip155:0:0x1234567890123456789012345678901234567890'
 * });
 * 
 * // Subscribe to another account
 * await service.subscribeAccounts({
 *   address: 'solana:0:ABC123DEF456GHI789JKL012MNO345PQR678STU901VWX'
 * });
 * 
 * // All transactions and balance updates are received via optimized
 * // WebSocket callbacks and processed with zero-allocation routing
 * // Balance updates include comprehensive transfer details and post-transaction balances
 * ```
 */
export class AccountActivityService {
  readonly #messenger: AccountActivityServiceMessenger;
  readonly #webSocketService: WebSocketService;
  readonly #options: Required<AccountActivityServiceOptions>;

  // Note: Subscription tracking is now centralized in WebSocketService

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
      maxActiveSubscriptions: options.maxActiveSubscriptions ?? 20,
      processAllTransactions: options.processAllTransactions ?? true,
    };

    this.#registerActionHandlers();
    this.#setupAccountEventHandlers();
    
    // Subscribe all existing accounts on initialization
    this.#subscribeAllExistingAccounts().catch((error: unknown) => {
      console.error('Failed to subscribe existing accounts during initialization:', error);
    });
  }

  // =============================================================================
  // Account Subscription Methods
  // =============================================================================

  /**
   * Subscribe to account activity (transactions and balance updates)
   * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
   */
  async subscribeAccounts(subscription: AccountSubscription): Promise<void> {
    try {
      await this.#webSocketService.connect();

      // Create channel name from address
      const channel = `${SUBSCRIPTION_NAMESPACE}.${subscription.address}`;

      // Check if already subscribed
      if (this.#webSocketService.isChannelSubscribed(channel)) {
        return;
      }

      // Create subscription with optimized callback routing
      await this.#webSocketService.subscribe({
        channels: [channel],
        callback: (notification) => {
          // Fast path: Direct processing of account activity updates
          this.#handleAccountActivityUpdate(
            notification.data as Message
          );
        },
      });


      // Publish success event
      this.#messenger.publish(`AccountActivityService:accountSubscribed`, {
        addresses: [subscription.address],
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown subscription error';
      
      this.#messenger.publish(`AccountActivityService:subscriptionError`, {
        addresses: [subscription.address],
        error: errorMessage,
        operation: 'subscribe',
      });

      throw new Error(`Failed to subscribe to account activity: ${errorMessage}`);
    }
  }

  /**
   * Unsubscribe from account activity for specified address
   * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
   */
  async unsubscribeAccounts(address: string): Promise<void> {
    try {
      // Find channel for the specified address
      const channel = `${SUBSCRIPTION_NAMESPACE}.${address}`;
      const subscriptionInfo = this.#webSocketService.getSubscriptionByChannel(channel);
      
      if (!subscriptionInfo) {
        console.log(`No subscription found for address: ${address}`);
        return;
      }

      // Fast path: Direct unsubscribe using stored unsubscribe function
      await subscriptionInfo.unsubscribe();

      // Subscription cleanup is handled centrally in WebSocketService

      this.#messenger.publish(`AccountActivityService:accountUnsubscribed`, {
        addresses: [address],
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown unsubscription error';
      
      this.#messenger.publish(`AccountActivityService:subscriptionError`, {
        addresses: [address],
        error: errorMessage,
        operation: 'unsubscribe',
      });

      throw new Error(`Failed to unsubscribe from account activity: ${errorMessage}`);
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Convert an InternalAccount address to CAIP-10 format or raw address
   */
  #convertToCaip10Address(account: InternalAccount): string {
    // Check if account has EVM scopes
    if (account.scopes.some(scope => scope.startsWith('eip155:'))) {
      // CAIP-10 format: eip155:0:address (subscribe to all EVM chains)
      return `eip155:0:${account.address}`;
    }
    
    // Check if account has Solana scopes
    if (account.scopes.some(scope => scope.startsWith('solana:'))) {
      // CAIP-10 format: solana:0:address (subscribe to all Solana chains)
      return `solana:0:${account.address}`;
    }
    
    // For other chains or unknown scopes, return raw address
    return account.address;
  }

  /**
   * Register all action handlers
   */
  #registerActionHandlers(): void {
    this.#messenger.registerActionHandler(
      `AccountActivityService:subscribeAccounts`,
      this.subscribeAccounts.bind(this),
    );

    this.#messenger.registerActionHandler(
      `AccountActivityService:unsubscribeAccounts`,
      this.unsubscribeAccounts.bind(this),
    );
  }



  /**
   * Handle account activity updates (transactions + balance changes)
   * Processes the comprehensive Message format with detailed balance updates and transfers
   * 
   * @example Message format handling:
   * Input: { 
   *   address: "0x123", 
   *   tx: { hash: "0x...", chain: "eip155:1", status: "completed", ... },
   *   updates: [{ 
   *     asset: { fungible: true, type: "eip155:1/erc20:0x...", unit: "USDT" },
   *     postBalance: { amount: "1254.75" },
   *     transfers: [{ from: "0x...", to: "0x...", amount: "500.00" }]
   *   }]
   * }
   * Output: Transaction and balance updates published separately
   */
  #handleAccountActivityUpdate(payload: Message): void {
    try {
      const { address, tx, updates } = payload;
      
      console.log(`AccountActivityService: Handling account activity update for ${address} with ${updates.length} balance updates`);
      
      // Process transaction update
      this.#messenger.publish(`AccountActivityService:transactionUpdated`, tx);
      
      // Publish comprehensive balance updates with transfer details
      console.log('AccountActivityService: Publishing balance update event...');
      this.#messenger.publish(`AccountActivityService:balanceUpdated`, updates);
      console.log('AccountActivityService: Balance update event published successfully');
    } catch (error) {
      console.error('Error handling account activity update:', error);
      console.error('Payload that caused error:', payload);
    }
  }

  /**
   * Set up account event handlers
   */
  #setupAccountEventHandlers(): void {
    try {
      // Subscribe to account added events
      this.#messenger.subscribe(
        'AccountsController:accountAdded',
        (account: InternalAccount) => this.#handleAccountAdded(account),
      );

      // Subscribe to account removed events  
      this.#messenger.subscribe(
        'AccountsController:accountRemoved',
        (accountId: string) => this.#handleAccountRemoved(accountId),
      );
    } catch (error) {
      // AccountsController events might not be available in all environments
      console.log('AccountsController events not available for account management:', error);
    }
  }

  /**
   * Subscribe all existing accounts on initialization
   */
  async #subscribeAllExistingAccounts(): Promise<void> {
    try {
      // Get all existing accounts (both EVM and non-EVM)
      const accounts = this.#messenger.call('AccountsController:listMultichainAccounts');

      if (accounts.length === 0) {
        console.log('No accounts found to subscribe to activity service');
        return;
      }

      // Convert addresses to CAIP-10 format and subscribe all in parallel
      const subscriptionPromises = accounts.map(async (account: InternalAccount) => {
        const address = this.#convertToCaip10Address(account);
        return this.subscribeAccounts({ address });
      });

      // Wait for all subscriptions to complete
      await Promise.all(subscriptionPromises);

      console.log(`Successfully subscribed ${accounts.length} existing accounts to activity service during initialization`);
    } catch (error) {
      console.error('Failed to subscribe existing accounts to activity service:', error);
      throw error;
    }
  }

  /**
   * Handle account added event
   */
  async #handleAccountAdded(account: InternalAccount): Promise<void> {
    try {
      // Only handle accounts with valid addresses
      if (!account.address || typeof account.address !== 'string') {
        return;
      }

      // Convert to CAIP-10 format and subscribe
      const address = this.#convertToCaip10Address(account);
      await this.subscribeAccounts({ address });
      console.log(`Automatically subscribed new account ${account.address} with CAIP-10 address: ${address}`);
    } catch (error) {
      console.error(`Failed to subscribe new account ${account.address} to activity service:`, error);
    }
  }

  /**
   * Handle account removed event
   */
  async #handleAccountRemoved(accountId: string): Promise<void> {
    try {
      // Find the account by ID to get its address
      const accounts = this.#messenger.call('AccountsController:listMultichainAccounts');
      const removedAccount = accounts.find((account: InternalAccount) => account.id === accountId);
      
      if (removedAccount && removedAccount.address) {
        // Convert to CAIP-10 format and unsubscribe
        const address = this.#convertToCaip10Address(removedAccount);
        await this.unsubscribeAccounts(address);
        console.log(`Automatically unsubscribed removed account ${removedAccount.address} with CAIP-10 address: ${address}`);
      }
    } catch (error) {
      console.error(`Failed to unsubscribe removed account ${accountId} from activity service:`, error);
    }
  }

  /**
   * Clean up all subscriptions and resources
   * Optimized for fast cleanup during service destruction or mobile app termination
   */
  cleanup(): void {
    // Fast path: Only unsubscribe from account activity subscriptions
    // Note: Since WebSocketService doesn't have namespace-based cleanup, we'll rely on
    // the service's internal cleanup when it's destroyed
    console.log('Account activity subscriptions will be cleaned up by WebSocketService');
  }
} 