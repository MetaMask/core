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
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

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
// Utility Functions
// =============================================================================

/**
 * Fetches supported networks from the v2 API endpoint.
 * Returns chain IDs already in CAIP-2 format.
 *
 * Note: This directly calls the Account API v2 endpoint. In the future, this should
 * be moved to a dedicated data layer service for better separation of concerns.
 *
 * @returns Array of supported chain IDs in CAIP-2 format (e.g., "eip155:1")
 */
async function fetchSupportedChainsInCaipFormat(): Promise<string[]> {
  const url = 'https://accounts.api.cx.metamask.io/v2/supportedNetworks';
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch supported networks: ${response.status} ${response.statusText}`,
    );
  }

  const data: {
    fullSupport: string[];
    partialSupport: { balances: string[] };
  } = await response.json();

  // v2 endpoint already returns data in CAIP-2 format
  return data.fullSupport;
}

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
};

const SERVICE_NAME = 'AccountActivityService';

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = [
  'subscribeAccounts',
  'unsubscribeAccounts',
] as const;

// Default supported chains used as fallback when API is unavailable
// This list should match the expected chains from the accounts API v2/supportedNetworks endpoint
const DEFAULT_SUPPORTED_CHAINS = [
  'eip155:1', // Ethereum Mainnet
  'eip155:137', // Polygon
  'eip155:56', // BSC
  'eip155:59144', // Linea
  'eip155:8453', // Base
  'eip155:10', // Optimism
  'eip155:42161', // Arbitrum One
  'eip155:534352', // Scroll
  'eip155:1329', // Sei
];
const SUBSCRIPTION_NAMESPACE = 'account-activity.v1';

// Cache TTL for supported chains (5 hours in milliseconds)
const SUPPORTED_CHAINS_CACHE_TTL = 5 * 60 * 60 * 1000;

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

// =============================================================================
// Action and Event Types
// =============================================================================

// Action types for the messaging system - using generated method actions
export type AccountActivityServiceActions = AccountActivityServiceMethodActions;

// Allowed actions that AccountActivityService can call on other controllers
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_ACTIONS = [
  'AccountsController:getSelectedAccount',
  'BackendWebSocketService:connect',
  'BackendWebSocketService:disconnect',
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

export type AccountActivityServiceAllowedActions =
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
  | AccountsControllerSelectedAccountChangeEvent
  | BackendWebSocketServiceConnectionStateChangedEvent;

export type AccountActivityServiceMessenger = RestrictedMessenger<
  typeof SERVICE_NAME,
  AccountActivityServiceActions | AccountActivityServiceAllowedActions,
  AccountActivityServiceEvents | AccountActivityServiceAllowedEvents,
  AccountActivityServiceAllowedActions['type'],
  AccountActivityServiceAllowedEvents['type']
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

  readonly #options: Required<AccountActivityServiceOptions>;

  #supportedChains: string[] | null = null;

  #supportedChainsExpiresAt: number = 0;

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

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
    this.#messenger.subscribe(
      'AccountsController:selectedAccountChange',
      async (account: InternalAccount) =>
        await this.#handleSelectedAccountChange(account),
    );
    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      (connectionInfo: WebSocketConnectionInfo) =>
        this.#handleWebSocketStateChange(connectionInfo),
    );
    this.#messenger.call('BackendWebSocketService:addChannelCallback', {
      channelName: `system-notifications.v1.${this.#options.subscriptionNamespace}`,
      callback: (notification: ServerNotificationMessage) =>
        this.#handleSystemNotification(
          notification.data as SystemNotificationData,
        ),
    });
  }

  // =============================================================================
  // Public Methods - Chain Management
  // =============================================================================

  /**
   * Fetch supported chains from API with fallback to hardcoded list.
   * Uses expiry-based caching with TTL to prevent stale data.
   *
   * @returns Array of supported chain IDs in CAIP-2 format
   */
  async getSupportedChains(): Promise<string[]> {
    // Return cached result if available and not expired
    if (
      this.#supportedChains !== null &&
      Date.now() < this.#supportedChainsExpiresAt
    ) {
      return this.#supportedChains;
    }

    try {
      // Try to fetch from API
      this.#supportedChains = await fetchSupportedChainsInCaipFormat();
    } catch {
      // Fallback to hardcoded list and cache it with timestamp
      this.#supportedChains = Array.from(DEFAULT_SUPPORTED_CHAINS);
    }

    this.#supportedChainsExpiresAt = Date.now() + SUPPORTED_CHAINS_CACHE_TTL;

    return this.#supportedChains;
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
          'BackendWebSocketService:channelHasSubscription',
          channel,
        )
      ) {
        return;
      }

      // Create subscription using the proper subscribe method (this will be stored in WebSocketService's internal tracking)
      await this.#messenger.call('BackendWebSocketService:subscribe', {
        channels: [channel],
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
  async unsubscribeAccounts(subscription: AccountSubscription): Promise<void> {
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
    const { address, tx, updates } = payload;

    log('Handling account activity update', {
      address,
      updateCount: updates.length,
    });

    // Process transaction update
    this.#messenger.publish(`AccountActivityService:transactionUpdated`, tx);

    // Publish comprehensive balance updates with transfer details
    this.#messenger.publish(`AccountActivityService:balanceUpdated`, {
      address,
      chain: tx.chain,
      updates,
    });
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
      await this.subscribeAccounts({ address: newAddress });
    } catch (error) {
      log('Account change failed', { error });
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

    // Publish status change directly (delta update)
    this.#messenger.publish(`AccountActivityService:statusChanged`, {
      chainIds: data.chainIds,
      status: data.status,
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
    const supportedChains = await this.getSupportedChains();

    if (state === WebSocketState.CONNECTED) {
      // WebSocket connected - resubscribe and set all chains as up
      await this.#subscribeSelectedAccount();

      // Publish initial status - all supported chains are up when WebSocket connects
      this.#messenger.publish(`AccountActivityService:statusChanged`, {
        chainIds: supportedChains,
        status: 'up',
      });

      log('WebSocket connected - Published all chains as up', {
        count: supportedChains.length,
        chains: supportedChains,
      });
    } else if (
      state === WebSocketState.DISCONNECTED ||
      state === WebSocketState.ERROR
    ) {
      this.#messenger.publish(`AccountActivityService:statusChanged`, {
        chainIds: supportedChains,
        status: 'down',
      });

      log('WebSocket error/disconnection - Published all chains as down', {
        count: supportedChains.length,
        chains: supportedChains,
      });
    }
  }

  // =============================================================================
  // Private Methods - Subscription Management
  // =============================================================================

  /**
   * Subscribe to the currently selected account only
   */
  async #subscribeSelectedAccount(): Promise<void> {
    const selectedAccount = this.#messenger.call(
      'AccountsController:getSelectedAccount',
    );

    if (!selectedAccount || !selectedAccount.address) {
      return;
    }

    // Convert to CAIP-10 format and subscribe
    const address = this.#convertToCaip10Address(selectedAccount);
    await this.subscribeAccounts({ address });
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
    try {
      log('Forcing WebSocket reconnection to clean up subscription state');

      // All subscriptions will be cleaned up automatically on WebSocket disconnect

      await this.#messenger.call('BackendWebSocketService:disconnect');
      await this.#messenger.call('BackendWebSocketService:connect');
    } catch (error) {
      log('Failed to force WebSocket reconnection', { error });
    }
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
