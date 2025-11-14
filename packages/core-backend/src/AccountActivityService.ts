/**
 * Account Activity Service for monitoring account transactions and balance changes
 *
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the comprehensive AccountActivityMessage format.
 */

import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerSelectedAccountChangeEvent,
} from '@metamask/accounts-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';

import type { AccountActivityServiceMethodActions } from './AccountActivityService-method-action-types';
import type {
  WebSocketConnectionInfo,
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
} from './BackendWebSocketService';
import { WebSocketState } from './BackendWebSocketService';
import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types';
import { projectLogger, createModuleLogger } from './logger';
import type {
  Transaction,
  AccountActivityMessage,
  BalanceUpdate,
} from './types';

// =============================================================================
// Types and Constants
// =============================================================================

/**
 * System notification data for chain status updates
 */
export type SystemNotificationData = {
  /** Array of chain IDs affected (e.g., ['eip155:137', 'eip155:1']) */
  chainIds: string[];
  /** Status of the chains: 'down' or 'up' */
  status: 'down' | 'up';
  /** Timestamp of the notification */
  timestamp?: number;
};

const SERVICE_NAME = 'AccountActivityService';

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = ['subscribe', 'unsubscribe'] as const;

const SUBSCRIPTION_NAMESPACE = 'account-activity.v1';

/**
 * Account subscription options
 */
export type SubscriptionOptions = {
  address: string; // Should be in CAIP-10 format, e.g., "eip155:0:0x1234..." or "solana:0:ABC123..."
};

/**
 * Configuration options for the account activity service
 */
export type AccountActivityServiceOptions = {
  /** Custom subscription namespace (default: 'account-activity.v1') */
  subscriptionNamespace?: string;
  /** Optional callback to trace performance of account activity operations (default: no-op) */
  traceFn?: TraceCallback;
};

// =============================================================================
// Action and Event Types
// =============================================================================

// Action types for the messaging system - using generated method actions
export type AccountActivityServiceActions = AccountActivityServiceMethodActions;

// Allowed actions that AccountActivityService can call on other controllers
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS = [
  'AccountsController:getSelectedAccount',
  'BackendWebSocketService:connect',
  'BackendWebSocketService:forceReconnection',
  'BackendWebSocketService:subscribe',
  'BackendWebSocketService:getConnectionInfo',
  'BackendWebSocketService:channelHasSubscription',
  'BackendWebSocketService:getSubscriptionsByChannel',
  'BackendWebSocketService:findSubscriptionsByChannelPrefix',
  'BackendWebSocketService:addChannelCallback',
  'BackendWebSocketService:removeChannelCallback',
] as const;

// Allowed events that AccountActivityService can listen to
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS = [
  'AccountsController:selectedAccountChange',
  'BackendWebSocketService:connectionStateChanged',
] as const;

export type AllowedActions =
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
      timestamp?: number;
    },
  ];
};

export type AccountActivityServiceEvents =
  | AccountActivityServiceTransactionUpdatedEvent
  | AccountActivityServiceBalanceUpdatedEvent
  | AccountActivityServiceSubscriptionErrorEvent
  | AccountActivityServiceStatusChangedEvent;

export type AllowedEvents =
  | AccountsControllerSelectedAccountChangeEvent
  | BackendWebSocketServiceConnectionStateChangedEvent;

export type AccountActivityServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  AccountActivityServiceActions | AllowedActions,
  AccountActivityServiceEvents | AllowedEvents
>;

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * High-performance service for real-time account activity monitoring using optimized
 * WebSocket subscriptions with direct callback routing. Automatically subscribes to
 * the currently selected account and switches subscriptions when the selected account changes.
 * Receives transactions and balance updates using the comprehensive AccountActivityMessage format.
 *
 * Performance Features:
 * - Direct callback routing (no EventEmitter overhead)
 * - Minimal subscription tracking (no duplication with BackendWebSocketService)
 * - Optimized cleanup for mobile environments
 * - Single-account subscription (only selected account)
 * - Comprehensive balance updates with transfer tracking
 *
 * Architecture:
 * - Uses messenger pattern to communicate with BackendWebSocketService
 * - AccountActivityService tracks channel-to-subscriptionId mappings via messenger calls
 * - Automatically subscribes to selected account on initialization
 * - Switches subscriptions when selected account changes
 * - No direct dependency on BackendWebSocketService (uses messenger instead)
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

  readonly #options: Required<Omit<AccountActivityServiceOptions, 'traceFn'>>;

  readonly #trace: TraceCallback;

  // Track chains that are currently up (based on system notifications)
  readonly #chainsUp: Set<string> = new Set();

  // =============================================================================
  // Constructor and Initialization
  // =============================================================================

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

    // Default to no-op trace function to keep core platform-agnostic
    this.#trace =
      options.traceFn ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (((_request: any, fn?: any) => fn?.()) as TraceCallback);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
    this.#messenger.subscribe(
      'AccountsController:selectedAccountChange',
      // Promise result intentionally not awaited
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (account: InternalAccount) =>
        await this.#handleSelectedAccountChange(account),
    );
    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      // Promise result intentionally not awaited
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (connectionInfo: WebSocketConnectionInfo) =>
        this.#handleWebSocketStateChange(connectionInfo),
    );
    this.#messenger.call('BackendWebSocketService:addChannelCallback', {
      channelName: `system-notifications.v1.${this.#options.subscriptionNamespace}`,
      callback: (notification: ServerNotificationMessage) =>
        this.#handleSystemNotification(notification),
    });
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
  async subscribe(subscription: SubscriptionOptions): Promise<void> {
    try {
      await this.#messenger.call('BackendWebSocketService:connect');

      // Create channel name from address
      const channel = `${this.#options.subscriptionNamespace}.${subscription.address}`;

      // Check if already subscribed
      if (
        this.#messenger.call(
          'BackendWebSocketService:channelHasSubscription',
          channel,
        )
      ) {
        return;
      }

      // Create subscription using the proper subscribe method (this will be stored in WebSocketService's internal tracking)
      await this.#messenger.call('BackendWebSocketService:subscribe', {
        channels: [channel],
        channelType: this.#options.subscriptionNamespace, // e.g., 'account-activity.v1'
        callback: (notification: ServerNotificationMessage) => {
          this.#handleAccountActivityUpdate(
            notification.data as AccountActivityMessage,
          );
        },
      });
    } catch (error) {
      log('Subscription failed, forcing reconnection', { error });
      await this.#forceReconnection();
    }
  }

  /**
   * Unsubscribe from account activity for specified address
   * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
   *
   * @param subscription - Account subscription configuration with address to unsubscribe
   */
  async unsubscribe(subscription: SubscriptionOptions): Promise<void> {
    const { address } = subscription;
    try {
      // Find channel for the specified address
      const channel = `${this.#options.subscriptionNamespace}.${address}`;
      const subscriptions = this.#messenger.call(
        'BackendWebSocketService:getSubscriptionsByChannel',
        channel,
      );

      if (subscriptions.length === 0) {
        return;
      }

      // Fast path: Direct unsubscribe using stored unsubscribe function
      // Unsubscribe from all matching subscriptions
      for (const subscriptionInfo of subscriptions) {
        await subscriptionInfo.unsubscribe();
      }
    } catch (error) {
      log('Unsubscription failed, forcing reconnection', { error });
      await this.#forceReconnection();
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
   *   address: "0xd14b52362b5b777ffa754c666ddec6722aaeee08",
   *   tx: { id: "0x1cde...", chain: "eip155:8453", status: "confirmed", timestamp: 1760099871, ... },
   *   updates: [{
   *     asset: { fungible: true, type: "eip155:8453/erc20:0x833...", unit: "USDC", decimals: 6 },
   *     postBalance: { amount: "0xc350" },
   *     transfers: [{ from: "0x7b07...", to: "0xd14b...", amount: "0x2710" }]
   *   }]
   * }
   * Output: Transaction and balance updates published separately
   */
  #handleAccountActivityUpdate(payload: AccountActivityMessage): void {
    const { address, tx, updates } = payload;

    // Calculate time elapsed between transaction time and message receipt
    const txTimestampMs = tx.timestamp * 1000; // Convert Unix timestamp (seconds) to milliseconds
    const elapsedMs = Date.now() - txTimestampMs;

    log('Handling account activity update', {
      address,
      updateCount: updates.length,
      elapsedMs,
    });

    // Trace message receipt with latency from transaction time to now
    // Promise result intentionally not awaited
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#trace(
      {
        name: `${SERVICE_NAME} Transaction Message`,
        data: {
          chain: tx.chain,
          status: tx.status,
          elapsed_ms: elapsedMs,
        },
        tags: {
          service: SERVICE_NAME,
          notification_type: this.#options.subscriptionNamespace,
        },
      },
      () => {
        // Process transaction update
        this.#messenger.publish(
          `AccountActivityService:transactionUpdated`,
          tx,
        );

        // Publish comprehensive balance updates with transfer details
        this.#messenger.publish(`AccountActivityService:balanceUpdated`, {
          address,
          chain: tx.chain,
          updates,
        });
      },
    );
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
      return;
    }

    try {
      // Convert new account to CAIP-10 format
      const newAddress = this.#convertToCaip10Address(newAccount);

      // First, unsubscribe from all current account activity subscriptions to avoid multiple subscriptions
      await this.#unsubscribeFromAllAccountActivity();

      // Then, subscribe to the new selected account
      await this.subscribe({ address: newAddress });
    } catch (error) {
      log('Account change failed', { error });
    }
  }

  /**
   * Handle system notification for chain status changes
   * Publishes only the status change (delta) for affected chains
   *
   * @param notification - Server notification message containing chain status updates and timestamp
   */
  #handleSystemNotification(notification: ServerNotificationMessage): void {
    const data = notification.data as SystemNotificationData;
    const { timestamp } = notification;

    // Validate required fields
    if (!data.chainIds || !Array.isArray(data.chainIds) || !data.status) {
      throw new Error(
        'Invalid system notification data: missing chainIds or status',
      );
    }

    // Track chain status
    if (data.status === 'up') {
      for (const chainId of data.chainIds) {
        this.#chainsUp.add(chainId);
      }
    } else {
      for (const chainId of data.chainIds) {
        this.#chainsUp.delete(chainId);
      }
    }

    // Publish status change directly (delta update)
    this.#messenger.publish(`AccountActivityService:statusChanged`, {
      chainIds: data.chainIds,
      status: data.status,
      timestamp,
    });
  }

  /**
   * Handle WebSocket connection state changes for fallback polling and resubscription
   *
   * @param connectionInfo - WebSocket connection state information
   */
  async #handleWebSocketStateChange(
    connectionInfo: WebSocketConnectionInfo,
  ): Promise<void> {
    const { state } = connectionInfo;

    if (state === WebSocketState.CONNECTED) {
      // WebSocket connected - resubscribe to selected account
      // The system notification will automatically provide the list of chains that are up
      await this.#subscribeToSelectedAccount();
    } else if (
      state === WebSocketState.DISCONNECTED ||
      state === WebSocketState.ERROR
    ) {
      // On disconnect/error, flush all tracked chains as down
      const chainsToMarkDown = Array.from(this.#chainsUp);

      if (chainsToMarkDown.length > 0) {
        this.#messenger.publish(`AccountActivityService:statusChanged`, {
          chainIds: chainsToMarkDown,
          status: 'down',
          timestamp: Date.now(),
        });

        log(
          'WebSocket error/disconnection - Published tracked chains as down',
          {
            count: chainsToMarkDown.length,
            chains: chainsToMarkDown,
          },
        );

        // Clear the tracking set since all chains are now down
        this.#chainsUp.clear();
      }
    }
  }

  // =============================================================================
  // Private Methods - Subscription Management
  // =============================================================================

  /**
   * Subscribe to the currently selected account only
   */
  async #subscribeToSelectedAccount(): Promise<void> {
    const selectedAccount = this.#messenger.call(
      'AccountsController:getSelectedAccount',
    );

    if (!selectedAccount || !selectedAccount.address) {
      return;
    }

    // Convert to CAIP-10 format and subscribe
    const address = this.#convertToCaip10Address(selectedAccount);
    await this.subscribe({ address });
  }

  /**
   * Unsubscribe from all account activity subscriptions for this service
   * Finds all channels matching the service's namespace and unsubscribes from them
   */
  async #unsubscribeFromAllAccountActivity(): Promise<void> {
    const accountActivitySubscriptions = this.#messenger.call(
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      this.#options.subscriptionNamespace,
    );

    // Unsubscribe from all matching subscriptions
    for (const subscription of accountActivitySubscriptions) {
      await subscription.unsubscribe();
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
    log('Forcing WebSocket reconnection to clean up subscription state');

    // Use the dedicated forceReconnection method which performs a controlled
    // disconnect-then-connect sequence to clean up subscription state
    await this.#messenger.call('BackendWebSocketService:forceReconnection');
  }

  // =============================================================================
  // Public Methods - Cleanup
  // =============================================================================

  /**
   * Destroy the service and clean up all resources
   * Optimized for fast cleanup during service destruction or mobile app termination
   */
  destroy(): void {
    // Clean up system notification callback
    this.#messenger.call(
      'BackendWebSocketService:removeChannelCallback',
      `system-notifications.v1.${this.#options.subscriptionNamespace}`,
    );
  }
}
