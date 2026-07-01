/**
 * Account Activity Service for monitoring account transactions and balance changes
 *
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the comprehensive AccountActivityMessage format.
 */

import type {
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from '@metamask/account-tree-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';

import { projectLogger, createModuleLogger } from '../logger';
import type {
  Transaction,
  AccountActivityMessage,
  BalanceUpdate,
} from '../types';
import type { AccountActivityServiceMethodActions } from './AccountActivityService-method-action-types';
import type {
  WebSocketConnectionInfo,
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
} from './BackendWebSocketService';
import { WebSocketState } from './BackendWebSocketService';
import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types';

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

const MESSENGER_EXPOSED_METHODS = [
  'subscribe',
  'subscribeMany',
  'unsubscribe',
  'unsubscribeMany',
] as const;

const SUBSCRIPTION_NAMESPACE = 'account-activity.v1';

/**
 * Account subscription options for a single account.
 */
export type SubscriptionOptions = {
  // Address should be in CAIP-10 format, e.g., "eip155:0:0x1234..." or "solana:0:ABC123..."
  address: string;
};

/**
 * Account subscription options for multiple accounts.
 */
export type SubscriptionManyOptions = {
  // Each address should be in CAIP-10 format, e.g., "eip155:0:0x1234..." or "solana:0:ABC123..."
  addresses: string[];
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
  'AccountTreeController:getAccountsFromSelectedAccountGroup',
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
  'AccountTreeController:selectedAccountGroupChange',
  'BackendWebSocketService:connectionStateChanged',
] as const;

export type AllowedActions =
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
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
  | AccountTreeControllerSelectedAccountGroupChangeEvent
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
 * every account in the currently selected account group (EVM, Solana, Tron, etc.) and
 * switches subscriptions when the selected account group changes. Also exposes an
 * idempotent, multi-address `subscribe`/`subscribeMany` API so other consumers
 * (e.g. data sources) can subscribe to additional accounts. Receives transactions and
 * balance updates using the comprehensive AccountActivityMessage format.
 *
 * Performance Features:
 * - Direct callback routing (no EventEmitter overhead)
 * - Minimal subscription tracking (no duplication with BackendWebSocketService)
 * - Optimized cleanup for mobile environments
 * - Multi-address, multichain subscriptions
 * - Comprehensive balance updates with transfer tracking
 *
 * Architecture:
 * - Uses messenger pattern to communicate with BackendWebSocketService
 * - Automatically subscribes to the selected account group on group change and on reconnect
 * - Idempotent: `subscribe` skips channels that already have a subscription, so multiple
 *   callers (auto-subscription and explicit consumers) can call it safely
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
 * // Consumers can also subscribe to additional accounts (CAIP-10 addresses)
 * await service.subscribeMany({ addresses: ['eip155:0:0x1234...', 'solana:0:ABC123...'] });
 *
 * // All transactions and balance updates are received via optimized
 * // WebSocket callbacks and published as messenger events
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
      'AccountTreeController:selectedAccountGroupChange',
      // Promise result intentionally not awaited
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => await this.#handleSelectedAccountGroupChange(),
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
   * Subscribe to account activity (transactions and balance updates) for a single
   * account. Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or
   * "solana:0:ABC123...").
   *
   * The call is idempotent: if the address already has an active subscription it
   * is skipped, so multiple callers can use it safely.
   *
   * @param subscription - Account subscription configuration with address
   */
  async subscribe(subscription: SubscriptionOptions): Promise<void> {
    await this.subscribeMany({ addresses: [subscription.address] });
  }

  /**
   * Subscribe to account activity (transactions and balance updates) for one or
   * more accounts. Each address should be in CAIP-10 format (e.g.,
   * "eip155:0:0x1234..." or "solana:0:ABC123...").
   *
   * The call is idempotent: addresses that already have an active subscription are
   * skipped, so multiple consumers (e.g. data sources and the auto-subscription)
   * can call this safely.
   *
   * @param subscription - Account subscription configuration with addresses
   */
  async subscribeMany(subscription: SubscriptionManyOptions): Promise<void> {
    const { addresses } = subscription;

    if (addresses.length === 0) {
      return;
    }

    try {
      await this.#messenger.call('BackendWebSocketService:connect');

      // Build channels for addresses that are not already subscribed (idempotency)
      const channels = addresses
        .map((address) => `${this.#options.subscriptionNamespace}.${address}`)
        .filter(
          (channel) =>
            !this.#messenger.call(
              'BackendWebSocketService:channelHasSubscription',
              channel,
            ),
        );

      if (channels.length === 0) {
        return;
      }

      // Create subscription using the proper subscribe method (this will be stored in WebSocketService's internal tracking)
      await this.#messenger.call('BackendWebSocketService:subscribe', {
        channels,
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
   * Unsubscribe from account activity for the specified account.
   * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or
   * "solana:0:ABC123...").
   *
   * @param subscription - Account subscription configuration with address to unsubscribe
   */
  async unsubscribe(subscription: SubscriptionOptions): Promise<void> {
    await this.unsubscribeMany({ addresses: [subscription.address] });
  }

  /**
   * Unsubscribe from account activity for the specified accounts.
   * Each address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or
   * "solana:0:ABC123...").
   *
   * @param subscription - Account subscription configuration with addresses to unsubscribe
   */
  async unsubscribeMany(subscription: SubscriptionManyOptions): Promise<void> {
    const { addresses } = subscription;

    try {
      for (const address of addresses) {
        // Find channel for the specified address
        const channel = `${this.#options.subscriptionNamespace}.${address}`;
        const subscriptions = this.#messenger.call(
          'BackendWebSocketService:getSubscriptionsByChannel',
          channel,
        );

        // Unsubscribe from all matching subscriptions
        for (const subscriptionInfo of subscriptions) {
          await subscriptionInfo.unsubscribe();
        }
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
   * Handle selected account group change event by switching the
   * auto-subscription to all accounts in the newly selected account group
   * (EVM, Solana, Tron, etc.).
   */
  async #handleSelectedAccountGroupChange(): Promise<void> {
    try {
      // First, unsubscribe from all current account activity subscriptions to avoid multiple subscriptions
      await this.#unsubscribeFromAllAccountActivity();

      // Then, subscribe to all accounts in the newly selected group
      await this.#subscribeToSelectedAccountGroup();
    } catch (error) {
      log('Account group change failed', { error });
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

    log(
      `WebSocket status change - Published tracked chains as ${data.status}`,
      {
        count: data.chainIds.length,
        chains: data.chainIds,
        status: data.status,
      },
    );
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
      // WebSocket connected - resubscribe to the selected account group
      await this.#subscribeToSelectedAccountGroup();
    } else if (state === WebSocketState.DISCONNECTED) {
      // On disconnect, flush all tracked chains as down
      const chainsToMarkDown = Array.from(this.#chainsUp);

      if (chainsToMarkDown.length > 0) {
        this.#messenger.publish(`AccountActivityService:statusChanged`, {
          chainIds: chainsToMarkDown,
          status: 'down',
          timestamp: Date.now(),
        });

        log('WebSocket disconnection - Published tracked chains as down', {
          count: chainsToMarkDown.length,
          chains: chainsToMarkDown,
        });

        // Clear the tracking set since all chains are now down
        this.#chainsUp.clear();
      }
    }
  }

  // =============================================================================
  // Private Methods - Subscription Management
  // =============================================================================

  /**
   * Subscribe to all accounts in the currently selected account group
   * (EVM, Solana, Tron, etc.).
   */
  async #subscribeToSelectedAccountGroup(): Promise<void> {
    const accounts =
      this.#messenger.call(
        'AccountTreeController:getAccountsFromSelectedAccountGroup',
      ) ?? [];

    // Convert each account to its namespace-appropriate CAIP-10 address
    const addresses = accounts
      .filter((account) => account?.address)
      .map((account) => this.#convertToCaip10Address(account))
      // TODO: Solana, Tron and Bitcoin account activity are not yet supported in
      // production. Restrict the auto-subscription to EVM accounts for now;
      // remove this filter once the other namespaces are supported by the backend.
      .filter((address) => address.startsWith('eip155:'));

    if (addresses.length === 0) {
      return;
    }

    await this.subscribeMany({ addresses });
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
   * Convert an InternalAccount to a CAIP-10 account-activity address using the
   * wildcard chain reference (`0`) so we subscribe to all chains in the
   * account's namespace (e.g. `eip155:0:0x...`, `solana:0:ABC...`,
   * `tron:0:T...`). EVM addresses are lowercased so the channel matches the
   * one produced by other consumers (idempotency).
   *
   * @param account - The internal account to convert
   * @returns The CAIP-10 formatted account-activity address
   */
  #convertToCaip10Address(account: InternalAccount): string {
    // Derive the namespace from the account's scopes (e.g. "eip155:0" ->
    // "eip155"), falling back to the account type prefix (e.g. "solana:data-account").
    const reference = account.scopes?.[0] ?? account.type;
    const [namespace] = reference.split(':');

    const address =
      namespace === 'eip155' ? account.address.toLowerCase() : account.address;

    return `${namespace}:0:${address}`;
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
