/**
 * Account Activity Service for monitoring account transactions and balance changes
 *
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the comprehensive AccountActivityMessage format.
 */

import type { RestrictedMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  Transaction,
  AccountActivityMessage,
  BalanceUpdate,
} from './types';
import type {
  WebSocketService,
  WebSocketConnectionInfo,
  WebSocketServiceConnectionStateChangedEvent,
} from './WebsocketService';
import { WebSocketState } from './WebsocketService';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const SERVICE_NAME = 'AccountActivityService' as const;

// Temporary list of supported chains for fallback polling - this hardcoded list will be replaced with a dynamic logic
const SUPPORTED_CHAINS = [
  '0x1', // 1
  '0x89', // 137
  '0x38', // 56
  '0xe728', // 59144
  '0x2105', // 8453
  '0xa', // 10
  '0xa4b1', // 42161
  '0x82750', // 534352
  '0x531', // 1329
] as const;
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
  /** Custom subscription namespace (default: 'account-activity.v1') */
  subscriptionNamespace?: string;
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
  | AccountActivityServiceUnsubscribeAccountsAction;

// Allowed actions that AccountActivityService can call on other controllers
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS = [
  'AccountsController:getAccountByAddress',
  'AccountsController:getSelectedAccount',
] as const;

// Allowed events that AccountActivityService can listen to
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS = [
  'AccountsController:selectedAccountChange',
  'BackendWebSocketService:connectionStateChanged',
] as const;

export type AccountActivityServiceAllowedActions =
  | {
      type: 'AccountsController:getAccountByAddress';
      handler: (address: string) => InternalAccount | undefined;
    }
  | {
      type: 'AccountsController:getSelectedAccount';
      handler: () => InternalAccount;
    };

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
  payload: [{ address: string; chain: string; updates: BalanceUpdate[] }];
};

export type AccountActivityServiceSubscriptionErrorEvent = {
  type: `AccountActivityService:subscriptionError`;
  payload: [{ addresses: string[]; error: string; operation: string }];
};

export type AccountActivityServiceWebSocketConnectedEvent = {
  type: `AccountActivityService:websocketConnected`;
  payload: [{ supportedChains: readonly string[]; backupPollingInterval: number }];
};

export type AccountActivityServiceWebSocketDisconnectedEvent = {
  type: `AccountActivityService:websocketDisconnected`;
  payload: [{ supportedChains: readonly string[] }];
};

export type AccountActivityServiceEvents =
  | AccountActivityServiceAccountSubscribedEvent
  | AccountActivityServiceAccountUnsubscribedEvent
  | AccountActivityServiceTransactionUpdatedEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceSubscriptionErrorEvent
  | AccountActivityServiceWebSocketConnectedEvent
  | AccountActivityServiceWebSocketDisconnectedEvent;

export type AccountActivityServiceAllowedEvents =
  | {
      type: 'AccountsController:selectedAccountChange';
      payload: [InternalAccount];
    }
  | WebSocketServiceConnectionStateChangedEvent;

export type AccountActivityServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  AccountActivityServiceActions | AccountActivityServiceAllowedActions,
  AccountActivityServiceEvents | AccountActivityServiceAllowedEvents,
  AccountActivityServiceAllowedActions['type'],
  AccountActivityServiceAllowedEvents['type']
>;

/**
 * Account Activity Service
 *
 * High-performance service for real-time account activity monitoring using optimized
 * WebSocket subscriptions with direct callback routing. Automatically subscribes to
 * the currently selected account and switches subscriptions when the selected account changes.
 * Receives transactions and balance updates using the comprehensive AccountActivityMessage format.
 *
 * Performance Features:
 * - Direct callback routing (no EventEmitter overhead)
 * - Minimal subscription tracking (no duplication with WebSocketService)
 * - Optimized cleanup for mobile environments
 * - Single-account subscription (only selected account)
 * - Comprehensive balance updates with transfer tracking
 *
 * Architecture:
 * - WebSocketService manages the actual WebSocket subscriptions and callbacks
 * - AccountActivityService only tracks channel-to-subscriptionId mappings
 * - Automatically subscribes to selected account on initialization
 * - Switches subscriptions when selected account changes
 * - No duplication of subscription state between services
 *
 * @example
 * ```typescript
 * const service = new AccountActivityService({
 *   messenger: activityMessenger,
 *   webSocketService: wsService,
 * });
 *
 * // Service automatically subscribes to the currently selected account
 * // When user switches accounts, service automatically resubscribes
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

  // Track the currently subscribed account address (in CAIP-10 format)
  #currentSubscribedAddress: string | null = null;

  // Note: Subscription tracking is now centralized in WebSocketService

  /**
   * Creates a new Account Activity service instance
   *
   * @param options - Configuration options including messenger and WebSocket service
   */
  constructor(
    options: AccountActivityServiceOptions & {
      messenger: AccountActivityServiceMessenger;
      webSocketService: WebSocketService;
    },
  ) {
    this.#messenger = options.messenger;
    this.#webSocketService = options.webSocketService;

    // Set configuration with defaults
    this.#options = {
      subscriptionNamespace:
        options.subscriptionNamespace ?? SUBSCRIPTION_NAMESPACE,
    };

    this.#registerActionHandlers();
    this.#setupAccountEventHandlers();
    this.#setupWebSocketEventHandlers();
  }

  // =============================================================================
  // Account Subscription Methods
  // =============================================================================

  /**
   * Get the currently subscribed account address
   *
   * @returns The CAIP-10 formatted address of the currently subscribed account, or null if none
   */
  getCurrentSubscribedAccount(): string | null {
    return this.#currentSubscribedAddress;
  }

  /**
   * Subscribe to account activity (transactions and balance updates)
   * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
   *
   * @param subscription - Account subscription configuration with address
   */
  async subscribeAccounts(subscription: AccountSubscription): Promise<void> {
    try {
      await this.#webSocketService.connect();

      // Create channel name from address
      const channel = `${this.#options.subscriptionNamespace}.${subscription.address}`;

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
            notification.data as AccountActivityMessage,
          );
        },
      });

      // Track the subscribed address
      this.#currentSubscribedAddress = subscription.address;

      // Publish success event
      this.#messenger.publish(`AccountActivityService:accountSubscribed`, {
        addresses: [subscription.address],
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown subscription error';

      this.#messenger.publish(`AccountActivityService:subscriptionError`, {
        addresses: [subscription.address],
        error: errorMessage,
        operation: 'subscribe',
      });

      throw new Error(
        `Failed to subscribe to account activity: ${errorMessage}`,
      );
    }
  }

  /**
   * Unsubscribe from account activity for specified address
   * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
   *
   * @param subscription - Account subscription configuration with address to unsubscribe
   */
  async unsubscribeAccounts(subscription: AccountSubscription): Promise<void> {
    const { address } = subscription;
    try {
      // Find channel for the specified address
      const channel = `${this.#options.subscriptionNamespace}.${address}`;
      const subscriptionInfo =
        this.#webSocketService.getSubscriptionByChannel(channel);

      if (!subscriptionInfo) {
        console.log(`No subscription found for address: ${address}`);
        return;
      }

      // Fast path: Direct unsubscribe using stored unsubscribe function
      await subscriptionInfo.unsubscribe();

      // Clear the tracked address if this was the subscribed account
      if (this.#currentSubscribedAddress === address) {
        this.#currentSubscribedAddress = null;
      }

      // Subscription cleanup is handled centrally in WebSocketService

      this.#messenger.publish(`AccountActivityService:accountUnsubscribed`, {
        addresses: [address],
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown unsubscription error';

      this.#messenger.publish(`AccountActivityService:subscriptionError`, {
        addresses: [address],
        error: errorMessage,
        operation: 'unsubscribe',
      });

      throw new Error(
        `Failed to unsubscribe from account activity: ${errorMessage}`,
      );
    }
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Convert an InternalAccount address to CAIP-10 format or raw address
   *
   * @param account - The internal account to convert
   * @returns The CAIP-10 formatted address or raw address
   */
  #convertToCaip10Address(account: InternalAccount): string {
    // Check if account has EVM scopes
    if (account.scopes.some((scope) => scope.startsWith('eip155:'))) {
      // CAIP-10 format: eip155:0:address (subscribe to all EVM chains)
      return `eip155:0:${account.address}`;
    }

    // Check if account has Solana scopes
    if (account.scopes.some((scope) => scope.startsWith('solana:'))) {
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
   * Processes the comprehensive AccountActivityMessage format with detailed balance updates and transfers
   *
   * @param payload - The account activity message containing transaction and balance updates
   * @example AccountActivityMessage format handling:
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
  #handleAccountActivityUpdate(payload: AccountActivityMessage): void {
    try {
      const { address, tx, updates } = payload;

      console.log(
        `AccountActivityService: Handling account activity update for ${address} with ${updates.length} balance updates`,
      );

      // Process transaction update
      this.#messenger.publish(`AccountActivityService:transactionUpdated`, tx);

      // Publish comprehensive balance updates with transfer details
      console.log('AccountActivityService: Publishing balance update event...');
      this.#messenger.publish(`AccountActivityService:balanceUpdated`, {
        address,
        chain: tx.chain,
        updates,
      });
      console.log(
        'AccountActivityService: Balance update event published successfully',
      );
    } catch (error) {
      console.error('Error handling account activity update:', error);
      console.error('Payload that caused error:', payload);
    }
  }

  /**
   * Set up account event handlers for selected account changes
   */
  #setupAccountEventHandlers(): void {
    try {
      // Subscribe to selected account change events
      this.#messenger.subscribe(
        'AccountsController:selectedAccountChange',
        (account: InternalAccount) =>
          this.#handleSelectedAccountChange(account),
      );
    } catch (error) {
      // AccountsController events might not be available in all environments
      console.log(
        'AccountsController events not available for account management:',
        error,
      );
    }
  }

  /**
   * Set up WebSocket connection event handlers for fallback polling
   */
  #setupWebSocketEventHandlers(): void {
    try {
      this.#messenger.subscribe(
        'BackendWebSocketService:connectionStateChanged',
        (connectionInfo) => this.#handleWebSocketStateChange(connectionInfo),
      );
    } catch (error) {
      console.log('WebSocketService connection events not available:', error);
    }
  }

  /**
   * Handle selected account change event
   *
   * @param newAccount - The newly selected account
   */
  async #handleSelectedAccountChange(
    newAccount: InternalAccount,
  ): Promise<void> {
    console.log(`Selected account changed to: ${newAccount.address}`);

    try {
      // Convert new account to CAIP-10 format
      const newAddress = this.#convertToCaip10Address(newAccount);

      // If already subscribed to this account, no need to change
      if (this.#currentSubscribedAddress === newAddress) {
        console.log(`Already subscribed to account: ${newAddress}`);
        return;
      }

      // First, unsubscribe from the currently subscribed account if any
      if (this.#currentSubscribedAddress) {
        console.log(
          `Unsubscribing from previous account: ${this.#currentSubscribedAddress}`,
        );
        try {
          await this.unsubscribeAccounts({
            address: this.#currentSubscribedAddress,
          });
        } catch (unsubscribeError) {
          console.warn(
            `Failed to unsubscribe from previous account ${this.#currentSubscribedAddress}:`,
            unsubscribeError,
          );
          // Continue with subscription to new account even if unsubscribe failed
        }
      }

      // Subscribe to the new selected account
      await this.subscribeAccounts({ address: newAddress });
      console.log(`Subscribed to new selected account: ${newAddress}`);
    } catch (error) {
      console.error(
        `Failed to subscribe to new selected account ${newAccount.address}:`,
        error,
      );
    }
  }

  /**
   * Handle WebSocket connection state changes for fallback polling and resubscription
   *
   * @param connectionInfo - WebSocket connection state information
   */
  #handleWebSocketStateChange(connectionInfo: WebSocketConnectionInfo): void {
    const { state } = connectionInfo;
    console.log(`AccountActivityService: WebSocket state changed to ${state}`);

    if (state === WebSocketState.CONNECTED) {
      // WebSocket connected - use backup polling and resubscribe
      try {
        // Publish event for TokenBalancesController to use backup polling (10min intervals)
        this.#messenger.publish(`AccountActivityService:websocketConnected`, {
          supportedChains: SUPPORTED_CHAINS,
          backupPollingInterval: 600000, // 10 minutes
        });

        this.#subscribeSelectedAccount().catch((error) => {
          console.error('Failed to resubscribe to selected account:', error);
        });
      } catch (error) {
        console.error('Failed to handle WebSocket connected state:', error);
      }
    } else if (
      state === WebSocketState.DISCONNECTED ||
      state === WebSocketState.ERROR
    ) {
      // WebSocket disconnected - clear subscription and signal active polling needed
      this.#currentSubscribedAddress = null;
      try {
        // Publish event for TokenBalancesController to switch to active polling
        this.#messenger.publish(`AccountActivityService:websocketDisconnected`, {
          supportedChains: SUPPORTED_CHAINS,
        });
      } catch (error) {
        console.error('Failed to handle WebSocket disconnected state:', error);
      }
    }
  }

  /**
   * Subscribe to the currently selected account only
   */
  async #subscribeSelectedAccount(): Promise<void> {
    console.log('📋 Subscribing to selected account');

    try {
      // Get the currently selected account
      const selectedAccount = this.#messenger.call(
        'AccountsController:getSelectedAccount',
      );

      if (!selectedAccount || !selectedAccount.address) {
        console.log('No selected account found to subscribe');
        return;
      }

      console.log(
        `Subscribing to selected account: ${selectedAccount.address}`,
      );

      // Convert to CAIP-10 format and subscribe
      const address = this.#convertToCaip10Address(selectedAccount);

      // Only subscribe if we're not already subscribed to this account
      if (this.#currentSubscribedAddress !== address) {
        await this.subscribeAccounts({ address });
        console.log(`Successfully subscribed to selected account: ${address}`);
      } else {
        console.log(`Already subscribed to selected account: ${address}`);
      }
    } catch (error) {
      console.error('Failed to subscribe to selected account:', error);
    }
  }

  /**
   * Destroy the service and clean up all resources
   * Optimized for fast cleanup during service destruction or mobile app termination
   */
  destroy(): void {
    try {
      // Clear tracked subscription
      this.#currentSubscribedAddress = null;

      // Unregister action handlers to prevent stale references
      this.#messenger.unregisterActionHandler(
        'AccountActivityService:subscribeAccounts',
      );
      this.#messenger.unregisterActionHandler(
        'AccountActivityService:unsubscribeAccounts',
      );

      // Clear our own event subscriptions (events we publish)
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:accountSubscribed',
      );
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:accountUnsubscribed',
      );
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:transactionUpdated',
      );
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:balanceUpdated',
      );
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:subscriptionError',
      );
    } catch (error) {
      console.error('AccountActivityService: Error during cleanup:', error);
      // Continue cleanup even if some parts fail
    }
  }
}
