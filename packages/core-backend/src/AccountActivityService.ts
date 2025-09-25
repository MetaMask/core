/**
 * Account Activity Service for monitoring account transactions and balance changes
 *
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the comprehensive AccountActivityMessage format.
 */

import type {
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerGetSelectedAccountAction,
} from '@metamask/accounts-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountActivityServiceMethodActions } from './AccountActivityService-method-action-types';
import type {
  WebSocketConnectionInfo,
  BackendWebSocketServiceConnectionStateChangedEvent,
  SubscriptionInfo,
  ServerNotificationMessage,
} from './BackendWebSocketService';
import { WebSocketState } from './BackendWebSocketService';
import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types';
import type {
  Transaction,
  AccountActivityMessage,
  BalanceUpdate,
} from './types';

/**
 * System notification data for chain status updates
 */
export type SystemNotificationData = {
  /** Array of chain IDs affected (e.g., ['eip155:137', 'eip155:1']) */
  chainIds: string[];
  /** Status of the chains: 'down' or 'up' */
  status: 'down' | 'up';
};

const SERVICE_NAME = 'AccountActivityService' as const;

const MESSENGER_EXPOSED_METHODS = [
  'subscribeAccounts',
  'unsubscribeAccounts',
] as const;

// Temporary list of supported chains for fallback polling - this hardcoded list will be replaced with a dynamic logic
const SUPPORTED_CHAINS = [
  'eip155:1', // Ethereum Mainnet
  'eip155:137', // Polygon
  'eip155:56', // BSC
  'eip155:59144', // Linea
  'eip155:8453', // Base
  'eip155:10', // Optimism
  'eip155:42161', // Arbitrum One
  'eip155:534352', // Scroll
  'eip155:1329', // Sei
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

// Action types for the messaging system - using generated method actions
export type AccountActivityServiceActions = AccountActivityServiceMethodActions;

// Allowed actions that AccountActivityService can call on other controllers
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS = [
  'AccountsController:getAccountByAddress',
  'AccountsController:getSelectedAccount',
  'BackendWebSocketService:connect',
  'BackendWebSocketService:disconnect',
  'BackendWebSocketService:subscribe',
  'BackendWebSocketService:isChannelSubscribed',
  'BackendWebSocketService:getSubscriptionByChannel',
  'BackendWebSocketService:findSubscriptionsByChannelPrefix',
  'BackendWebSocketService:addChannelCallback',
  'BackendWebSocketService:removeChannelCallback',
  'BackendWebSocketService:sendRequest',
] as const;

// Allowed events that AccountActivityService can listen to
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS = [
  'AccountsController:selectedAccountChange',
  'BackendWebSocketService:connectionStateChanged',
] as const;

export type AccountActivityServiceAllowedActions =
  | AccountsControllerGetAccountByAddressAction
  | AccountsControllerGetSelectedAccountAction
  | BackendWebSocketServiceMethodActions;

// Event types for the messaging system

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

export type AccountActivityServiceStatusChangedEvent = {
  type: `AccountActivityService:statusChanged`;
  payload: [
    {
      chainIds: string[];
      status: 'up' | 'down';
    },
  ];
};

export type AccountActivityServiceEvents =
  | AccountActivityServiceTransactionUpdatedEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceSubscriptionErrorEvent
  | AccountActivityServiceStatusChangedEvent;

export type AccountActivityServiceAllowedEvents =
  | {
      type: 'AccountsController:selectedAccountChange';
      payload: [InternalAccount];
    }
  | BackendWebSocketServiceConnectionStateChangedEvent;

export type AccountActivityServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  AccountActivityServiceActions | AccountActivityServiceAllowedActions,
  AccountActivityServiceEvents | AccountActivityServiceAllowedEvents,
  AccountActivityServiceAllowedActions['type'],
  AccountActivityServiceAllowedEvents['type']
>;

/**
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
 * - Uses messenger pattern to communicate with BackendWebSocketService
 * - AccountActivityService tracks channel-to-subscriptionId mappings via messenger calls
 * - Automatically subscribes to selected account on initialization
 * - Switches subscriptions when selected account changes
 * - No direct dependency on WebSocketService (uses messenger instead)
 *
 * @example
 * ```typescript
 * const service = new AccountActivityService({
 *   messenger: activityMessenger,
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
  /**
   * The name of the service.
   */
  readonly name = SERVICE_NAME;

  readonly #messenger: AccountActivityServiceMessenger;

  readonly #options: Required<AccountActivityServiceOptions>;

  // BackendWebSocketService is the source of truth for subscription state
  // Using BackendWebSocketService:findSubscriptionsByChannelPrefix() for cleanup

  /**
   * Creates a new Account Activity service instance
   *
   * @param options - Configuration options including messenger
   */
  constructor(
    options: AccountActivityServiceOptions & {
      messenger: AccountActivityServiceMessenger;
    },
  ) {
    this.#messenger = options.messenger;

    // Set configuration with defaults
    this.#options = {
      subscriptionNamespace:
        options.subscriptionNamespace ?? SUBSCRIPTION_NAMESPACE,
    };

    this.#registerActionHandlers();
    this.#setupAccountEventHandlers();
    this.#setupWebSocketEventHandlers();
    this.#setupSystemNotificationCallback();
  }

  // =============================================================================
  // Account Subscription Methods
  // =============================================================================

  /**
   * Subscribe to account activity (transactions and balance updates)
   * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
   *
   * @param subscription - Account subscription configuration with address
   */
  async subscribeAccounts(subscription: AccountSubscription): Promise<void> {
    try {
      await this.#messenger.call('BackendWebSocketService:connect');

      // Create channel name from address
      const channel = `${this.#options.subscriptionNamespace}.${subscription.address}`;

      // Check if already subscribed
      if (
        this.#messenger.call(
          'BackendWebSocketService:isChannelSubscribed',
          channel,
        )
      ) {
        console.log(
          `[${SERVICE_NAME}] Already subscribed to channel: ${channel}`,
        );
        return;
      }

      // Create subscription using the proper subscribe method (this will be stored in WebSocketService's internal tracking)
      await this.#messenger.call('BackendWebSocketService:subscribe', {
        channels: [channel],
        callback: (notification: ServerNotificationMessage) => {
          // Fast path: Direct processing of account activity updates
          this.#handleAccountActivityUpdate(
            notification.data as AccountActivityMessage,
          );
        },
      });
    } catch (error) {
      console.warn(
        `[${SERVICE_NAME}] Subscription failed, forcing reconnection:`,
        error,
      );
      await this.#forceReconnection();
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
      const subscriptionInfo = this.#messenger.call(
        'BackendWebSocketService:getSubscriptionByChannel',
        channel,
      ) as SubscriptionInfo | undefined;

      if (!subscriptionInfo) {
        console.log(
          `[${SERVICE_NAME}] No subscription found for address: ${address}`,
        );
        return;
      }

      // Fast path: Direct unsubscribe using stored unsubscribe function
      await subscriptionInfo.unsubscribe();
    } catch (error) {
      console.warn(
        `[${SERVICE_NAME}] Unsubscription failed, forcing reconnection:`,
        error,
      );
      await this.#forceReconnection();
    }
  }

  // =============================================================================
  // Private Methods - Initialization & Setup
  // =============================================================================

  /**
   * Register all action handlers using the new method actions pattern
   */
  #registerActionHandlers(): void {
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
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
        `[${SERVICE_NAME}] AccountsController events not available for account management:`,
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
        (connectionInfo: WebSocketConnectionInfo) =>
          this.#handleWebSocketStateChange(connectionInfo),
      );
    } catch (error) {
      console.log(
        `[${SERVICE_NAME}] WebSocketService connection events not available:`,
        error,
      );
    }
  }

  /**
   * Set up system notification callback for chain status updates
   */
  #setupSystemNotificationCallback(): void {
    try {
      const systemChannelName = `system-notifications.v1.${this.#options.subscriptionNamespace}`;
      console.log(
        `[${SERVICE_NAME}] Adding channel callback for '${systemChannelName}'`,
      );
      this.#messenger.call('BackendWebSocketService:addChannelCallback', {
        channelName: systemChannelName,
        callback: (notification: ServerNotificationMessage) => {
          try {
            // Parse the notification data as a system notification
            const systemData = notification.data as SystemNotificationData;
            this.#handleSystemNotification(systemData);
          } catch (error) {
            console.error(
              `[${SERVICE_NAME}] Error processing system notification:`,
              error,
            );
          }
        },
      });
    } catch (error) {
      console.warn(
        `[${SERVICE_NAME}] Failed to setup system notification callback:`,
        error,
      );
    }
  }

  // =============================================================================
  // Private Methods - Event Handlers
  // =============================================================================

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
        `[${SERVICE_NAME}] Handling account activity update for ${address} with ${updates.length} balance updates`,
      );

      // Process transaction update
      this.#messenger.publish(`AccountActivityService:transactionUpdated`, tx);

      // Publish comprehensive balance updates with transfer details
      console.log(`[${SERVICE_NAME}] Publishing balance update event...`);
      this.#messenger.publish(`AccountActivityService:balanceUpdated`, {
        address,
        chain: tx.chain,
        updates,
      });
      console.log(
        `[${SERVICE_NAME}] Balance update event published successfully`,
      );
    } catch (error) {
      console.error(
        `[${SERVICE_NAME}] Error handling account activity update:`,
        error,
      );
      console.error(`[${SERVICE_NAME}] Payload that caused error:`, payload);
    }
  }

  /**
   * Handle selected account change event
   *
   * @param newAccount - The newly selected account
   */
  async #handleSelectedAccountChange(
    newAccount: InternalAccount | null,
  ): Promise<void> {
    if (!newAccount?.address) {
      console.log(`[${SERVICE_NAME}] No valid account selected`);
      throw new Error('Account address is required');
    }

    console.log(
      `[${SERVICE_NAME}] Selected account changed to: ${newAccount.address}`,
    );

    try {
      // Convert new account to CAIP-10 format
      const newAddress = this.#convertToCaip10Address(newAccount);
      const newChannel = `${this.#options.subscriptionNamespace}.${newAddress}`;

      // If already subscribed to this account, no need to change
      if (
        this.#messenger.call(
          'BackendWebSocketService:isChannelSubscribed',
          newChannel,
        )
      ) {
        console.log(
          `[${SERVICE_NAME}] Already subscribed to account: ${newAddress}`,
        );
        return;
      }

      // First, unsubscribe from all current account activity subscriptions to avoid multiple subscriptions
      await this.#unsubscribeFromAllAccountActivity();

      // Then, subscribe to the new selected account
      await this.subscribeAccounts({ address: newAddress });
      console.log(
        `[${SERVICE_NAME}] Subscribed to new selected account: ${newAddress}`,
      );

      // TokenBalancesController handles its own polling - no need to manually trigger updates
    } catch (error) {
      console.warn(
        `[${SERVICE_NAME}] Account change failed, forcing reconnection:`,
        error,
      );
      await this.#forceReconnection();
    }
  }

  /**
   * Handle system notification for chain status changes
   * Publishes only the status change (delta) for affected chains
   *
   * @param data - System notification data containing chain status updates
   */
  #handleSystemNotification(data: SystemNotificationData): void {
    // Validate required fields
    if (!data.chainIds || !Array.isArray(data.chainIds) || !data.status) {
      throw new Error(
        'Invalid system notification data: missing chainIds or status',
      );
    }

    console.log(
      `[${SERVICE_NAME}] Received system notification - Chains: ${data.chainIds.join(', ')}, Status: ${data.status}`,
    );

    // Publish status change directly (delta update)
    try {
      this.#messenger.publish(`AccountActivityService:statusChanged`, {
        chainIds: data.chainIds,
        status: data.status,
      });

      console.log(
        `[${SERVICE_NAME}] Published status change - Chains: [${data.chainIds.join(', ')}], Status: ${data.status}`,
      );
    } catch (error) {
      console.error(
        `[${SERVICE_NAME}] Failed to publish status change event:`,
        error,
      );
    }
  }

  // =============================================================================
  // Private Methods - Subscription Management
  // =============================================================================

  /**
   * Subscribe to the currently selected account only
   */
  async #subscribeSelectedAccount(): Promise<void> {
    console.log(`[${SERVICE_NAME}] 📋 Subscribing to selected account`);

    try {
      // Get the currently selected account
      const selectedAccount = this.#messenger.call(
        'AccountsController:getSelectedAccount',
      ) as InternalAccount;

      if (!selectedAccount || !selectedAccount.address) {
        console.log(`[${SERVICE_NAME}] No selected account found to subscribe`);
        return;
      }

      console.log(
        `[${SERVICE_NAME}] Subscribing to selected account: ${selectedAccount.address}`,
      );

      // Convert to CAIP-10 format and subscribe
      const address = this.#convertToCaip10Address(selectedAccount);
      const channel = `${this.#options.subscriptionNamespace}.${address}`;

      // Only subscribe if we're not already subscribed to this account
      if (
        !this.#messenger.call(
          'BackendWebSocketService:isChannelSubscribed',
          channel,
        )
      ) {
        await this.subscribeAccounts({ address });
        console.log(
          `[${SERVICE_NAME}] Successfully subscribed to selected account: ${address}`,
        );
      } else {
        console.log(
          `[${SERVICE_NAME}] Already subscribed to selected account: ${address}`,
        );
      }
    } catch (error) {
      console.error(
        `[${SERVICE_NAME}] Failed to subscribe to selected account:`,
        error,
      );
    }
  }

  /**
   * Unsubscribe from all account activity subscriptions for this service
   * Finds all channels matching the service's namespace and unsubscribes from them
   */
  async #unsubscribeFromAllAccountActivity(): Promise<void> {
    try {
      console.log(
        `[${SERVICE_NAME}] Unsubscribing from all account activity subscriptions...`,
      );

      // Use WebSocketService to find all subscriptions with our namespace prefix
      const accountActivitySubscriptions = this.#messenger.call(
        'BackendWebSocketService:findSubscriptionsByChannelPrefix',
        this.#options.subscriptionNamespace,
      ) as SubscriptionInfo[];

      console.log(
        `[${SERVICE_NAME}] Found ${accountActivitySubscriptions.length} account activity subscriptions to unsubscribe from`,
      );

      // Unsubscribe from all matching subscriptions
      for (const subscription of accountActivitySubscriptions) {
        try {
          await subscription.unsubscribe();
          console.log(
            `[${SERVICE_NAME}] Successfully unsubscribed from subscription: ${subscription.subscriptionId} (channels: ${subscription.channels.join(', ')})`,
          );
        } catch (error) {
          console.error(
            `[${SERVICE_NAME}] Failed to unsubscribe from subscription ${subscription.subscriptionId}:`,
            error,
          );
        }
      }

      console.log(
        `[${SERVICE_NAME}] Finished unsubscribing from all account activity subscriptions`,
      );
    } catch (error) {
      console.error(
        `[${SERVICE_NAME}] Failed to unsubscribe from all account activity:`,
        error,
      );
    }
  }

  // =============================================================================
  // Private Methods - Utility Functions
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
   * Force WebSocket reconnection to clean up subscription state
   */
  async #forceReconnection(): Promise<void> {
    try {
      console.log(
        `[${SERVICE_NAME}] Forcing WebSocket reconnection to clean up subscription state`,
      );

      // All subscriptions will be cleaned up automatically on WebSocket disconnect

      await this.#messenger.call('BackendWebSocketService:disconnect');
      await this.#messenger.call('BackendWebSocketService:connect');
    } catch (error) {
      console.error(
        `[${SERVICE_NAME}] Failed to force WebSocket reconnection:`,
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
    console.log(`[${SERVICE_NAME}] WebSocket state changed to ${state}`);

    if (state === WebSocketState.CONNECTED) {
      // WebSocket connected - resubscribe and set all chains as up
      try {
        this.#subscribeSelectedAccount().catch((error) => {
          console.error(
            `[${SERVICE_NAME}] Failed to resubscribe to selected account:`,
            error,
          );
        });

        // Publish initial status - all supported chains are up when WebSocket connects
        this.#messenger.publish(`AccountActivityService:statusChanged`, {
          chainIds: Array.from(SUPPORTED_CHAINS),
          status: 'up' as const,
        });

        console.log(
          `[${SERVICE_NAME}] WebSocket connected - Published all chains as up: [${SUPPORTED_CHAINS.join(', ')}]`,
        );
      } catch (error) {
        console.error(
          `[${SERVICE_NAME}] Failed to handle WebSocket connected state:`,
          error,
        );
      }
    } else if (
      state === WebSocketState.DISCONNECTED ||
      state === WebSocketState.ERROR
    ) {
      // WebSocket disconnected - subscriptions are automatically cleaned up by WebSocketService
      console.log(
        `[${SERVICE_NAME}] WebSocket disconnected/error - subscriptions cleaned up automatically`,
      );
    }
  }

  // =============================================================================
  // Private Methods - Cleanup
  // =============================================================================

  /**
   * Destroy the service and clean up all resources
   * Optimized for fast cleanup during service destruction or mobile app termination
   */
  destroy(): void {
    try {
      // Clean up all account activity subscriptions
      this.#unsubscribeFromAllAccountActivity().catch((error) => {
        console.error(
          `[${SERVICE_NAME}] Failed to clean up subscriptions during destroy:`,
          error,
        );
      });

      // Clean up system notification callback
      this.#messenger.call(
        'BackendWebSocketService:removeChannelCallback',
        `system-notifications.v1.${this.#options.subscriptionNamespace}`,
      );

      // Unregister action handlers to prevent stale references
      this.#messenger.unregisterActionHandler(
        'AccountActivityService:subscribeAccounts',
      );
      this.#messenger.unregisterActionHandler(
        'AccountActivityService:unsubscribeAccounts',
      );

      // Clear our own event subscriptions (events we publish)
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:transactionUpdated',
      );
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:balanceUpdated',
      );
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:subscriptionError',
      );
      this.#messenger.clearEventSubscriptions(
        'AccountActivityService:statusChanged',
      );
    } catch (error) {
      console.error(`[${SERVICE_NAME}] Error during cleanup:`, error);
      // Continue cleanup even if some parts fail
    }
  }
}
