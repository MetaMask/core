/**
 * Account Activity Service for monitoring account transactions and balance changes
 * 
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the unified
 * TransactionWithKeyringBalanceUpdate message format.
 */


import type { RestrictedMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { hexToBytes } from '@metamask/utils';
import { sha256 } from 'ethereum-cryptography/sha256';
import { v4 as uuid } from 'uuid';
import type { 
  WebSocketService,
} from './websocket-service';
import type { 
  TransactionWithKeyringBalanceUpdate,
  Transaction,
  AccountBalancesUpdatedEventPayload,
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

/**
 * Incoming balance update format that doesn't match keyring-api format
 */
type IncomingBalanceUpdate = {
  address: string;
  asset: {
    fungible: boolean;
    type: string; // CAIP format like "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    unit: string;
    amount: string;
  };
};

/**
 * Transaction with balance update in the incoming format
 */
type IncomingTransactionWithBalanceUpdate = {
  tx: Transaction;
  postBalances: IncomingBalanceUpdate[];
};

/**
 * Generates a deterministic UUID from an Ethereum address.
 * This matches the AccountsController's getUUIDFromAddressOfNormalAccount function.
 * 
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The generated UUID.
 */
function getAccountIdFromAddress(address: string): string {
  const v4Options = {
    random: sha256(hexToBytes(address)).slice(0, 16),
  };
  return uuid(v4Options);
}

// Action types for the messaging system
export type AccountActivityServiceSubscribeAccountsAction = {
  type: `AccountActivityService:subscribeAccounts`;
  handler: AccountActivityService['subscribeAccounts'];
};

export type AccountActivityServiceUnsubscribeAccountsAction = {
  type: `AccountActivityService:unsubscribeAccounts`;
  handler: AccountActivityService['unsubscribeAccounts'];
};



export type AccountActivityServiceGetActiveSubscriptionsAction = {
  type: `AccountActivityService:getActiveSubscriptions`;
  handler: AccountActivityService['getActiveSubscriptions'];
};

export type AccountActivityServiceGetSubscriptionIdsAction = {
  type: `AccountActivityService:getSubscriptionIds`;
  handler: AccountActivityService['getSubscriptionIds'];
};

export type AccountActivityServiceActions = 
  | AccountActivityServiceSubscribeAccountsAction
  | AccountActivityServiceUnsubscribeAccountsAction
  | AccountActivityServiceGetActiveSubscriptionsAction
  | AccountActivityServiceGetSubscriptionIdsAction

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
  payload: [AccountBalancesUpdatedEventPayload];
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
 * Subscribes to account activity and receives all transactions and balance updates
 * for those accounts using the unified TransactionWithKeyringBalanceUpdate message
 * format from keyring-api.
 * 
 * @example
 * ```typescript
 * const service = new AccountActivityService({
 *   messenger: activityMessenger,
 *   webSocketService: wsService,
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
 * // All transactions and balance updates for these accounts
 * // will now be received via WebSocket and processed automatically
 * // Balance updates are automatically transformed to keyring-api format
 * ```
 */
export class AccountActivityService {
  readonly #messenger: AccountActivityServiceMessenger;
  readonly #webSocketService: WebSocketService;
  readonly #options: Required<AccountActivityServiceOptions>;

  // Account subscription state
  #subscriptionIds = new Map<string, { subscriptionId: string; channel: string }>(); // Key: channel, Value: subscription info

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
      if (this.#subscriptionIds.has(channel)) {
        return;
      }

      // Subscribe to the channel
      const response = await this.#webSocketService.sendRequest<{ 
        subscriptionId: string; 
        succeeded?: string[]; 
        failed?: string[]; 
      }>({
        event: 'subscribe',
        data: {
          channels: [channel],
        },
      }, true); // Queue if disconnected
      
      const subscriptionId = response.subscriptionId;

      if (response.succeeded && response.succeeded.length > 0) {
        // Store subscription
        this.#subscriptionIds.set(channel, {
          subscriptionId: subscriptionId!,
          channel,
        });

        // Set up notification handler for this subscription
        this.#webSocketService.watchSubscription(subscriptionId!, (notification) => {
          this.#handleAccountActivityUpdate(notification.data as TransactionWithKeyringBalanceUpdate);
        });

        // Publish success event
        this.#messenger.publish(`AccountActivityService:accountSubscribed`, {
          addresses: [subscription.address],
        });
      } else if (response.failed && response.failed.length > 0) {
        this.#messenger.publish(`AccountActivityService:subscriptionError`, {
          addresses: [subscription.address],
          error: 'Server rejected subscription',
          operation: 'subscribe',
        });
      }

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
      const subscription = this.#subscriptionIds.get(channel);
      
      if (!subscription) {
        console.log(`No subscription found for address: ${address}`);
        return;
      }

      // Unsubscribe from channel
      await this.#webSocketService.sendRequest({
        event: 'unsubscribe',
        data: {
          subscription: subscription.subscriptionId,
          channels: [channel],
        },
      });

      // Clean up our tracking for this channel
      this.#subscriptionIds.delete(channel);

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
  // Data Access Methods
  // =============================================================================

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): Record<string, string> {
    const result: Record<string, string> = {};
    
    this.#subscriptionIds.forEach((subscription, channel) => {
      result[channel] = subscription.subscriptionId;
    });

    return result;
  }

  /**
   * Get subscription IDs for all subscribed channels
   */
  getSubscriptionIds(): Record<string, string> {
    const result: Record<string, string> = {};
    
    this.#subscriptionIds.forEach((subscription, channel) => {
      result[channel] = subscription.subscriptionId;
    });

    return result;
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



    this.#messenger.registerActionHandler(
      `AccountActivityService:getActiveSubscriptions`,
      this.getActiveSubscriptions.bind(this),
    );

    this.#messenger.registerActionHandler(
      `AccountActivityService:getSubscriptionIds`,
      this.getSubscriptionIds.bind(this),
    );
  }

  /**
   * Transform incoming balance updates to AccountBalancesUpdatedEventPayload format
   * 
   * Converts from array format:
   * [{ address: "0x123...", asset: { type: "eip155:8453/erc20:0x...", unit: "USDC", amount: "1000" } }]
   * 
   * To keyring-api format:
   * { balances: { "account-uuid": { "eip155:8453/erc20:0x...": { unit: "USDC", amount: "1000" } } } }
   */
  #transformBalancesToKeyringFormat(incomingBalances: IncomingBalanceUpdate[]): AccountBalancesUpdatedEventPayload {
    const balances: Record<string, Record<string, { unit: string; amount: string }>> = {};
    
    // Group balance updates by account ID (not address)
    for (const balance of incomingBalances) {
      // Validate required fields
      if (!balance.address || !balance.asset?.type || !balance.asset?.unit || balance.asset?.amount === undefined) {
        console.warn('Skipping invalid balance update:', balance);
        continue;
      }
      
      // Get the proper account ID from the AccountsController
      let accountId: string;
      try {
        const account = this.#messenger.call('AccountsController:getAccountByAddress', balance.address);
        if (account) {
          // Use the actual account ID from the AccountsController
          accountId = account.id;
        } else {
          // Fall back to generating UUID from address (for accounts not yet in controller)
          accountId = getAccountIdFromAddress(balance.address);
          console.warn(`Account not found in AccountsController for address ${balance.address}, using generated UUID: ${accountId}`);
        }
      } catch (error) {
        // Fall back to generating UUID from address if AccountsController is not available
        accountId = getAccountIdFromAddress(balance.address);
        console.warn(`Failed to get account from AccountsController for address ${balance.address}, using generated UUID: ${accountId}`, error);
      }
      
      const assetType = balance.asset.type as `${string}:${string}/${string}:${string}`;
      
      // Initialize account balances if not exists
      if (!balances[accountId]) {
        balances[accountId] = {};
      }
      
      // Add the balance for this asset
      balances[accountId][assetType] = {
        unit: balance.asset.unit,
        amount: balance.asset.amount,
      };
    }
    
    return { balances };
  }

  /**
   * Handle account activity updates (transactions + balance changes)
   * Supports both keyring-api format and incoming array format
   * 
   * @example Incoming array format transformation:
   * Input: { tx: {...}, postBalances: [{ address: "0x123", asset: { type: "eip155:8453/erc20:0x...", unit: "USDC", amount: "1000" } }] }
   * Output: { balances: { "account-uuid": { "eip155:8453/erc20:0x...": { unit: "USDC", amount: "1000" } } } }
   * 
   * Note: Addresses are converted to proper account UUIDs using AccountsController or deterministic generation.
   */
  #handleAccountActivityUpdate(payload: TransactionWithKeyringBalanceUpdate | IncomingTransactionWithBalanceUpdate): void {
    try {
      const { tx, postBalances } = payload;
      
      // Process transaction update
      this.#messenger.publish(`AccountActivityService:transactionUpdated`, tx);
      
      // Transform balance updates if needed
      let keyringBalances: AccountBalancesUpdatedEventPayload;
      
      if (Array.isArray(postBalances)) {
        // Handle incoming array format - transform to keyring format
        keyringBalances = this.#transformBalancesToKeyringFormat(postBalances);
      } else {
        // Already in keyring format
        keyringBalances = postBalances;
      }
      
      // Process balance updates
      this.#messenger.publish(`AccountActivityService:balanceUpdated`, keyringBalances);
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
   * Clean up all subscription data
   * Call this when the service is being destroyed
   */
  cleanup(): void {
    // Clear all cached data
    this.#subscriptionIds.clear();
  }
} 