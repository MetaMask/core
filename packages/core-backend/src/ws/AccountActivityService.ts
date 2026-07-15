/**
 * Account Activity Service for monitoring account transactions and balance changes
 *
 * This service subscribes to account activity and receives all transactions
 * and balance updates for those accounts via the comprehensive AccountActivityMessage format.
 */

import type {
  AccountTreeControllerSelectedAccountGroupChangeEvent,
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
} from '@metamask/account-tree-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import type {
  FeatureFlags,
  RemoteFeatureFlagControllerGetStateAction,
  RemoteFeatureFlagControllerStateChangeEvent,
} from '@metamask/remote-feature-flag-controller';
import { isObject } from '@metamask/utils';

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

const MESSENGER_EXPOSED_METHODS = ['subscribe', 'unsubscribe'] as const;

const SUBSCRIPTION_NAMESPACE = 'account-activity.v1';

// EVM subscriptions are always enabled.
const ALWAYS_SUPPORTED_CHAIN_PREFIXES = ['eip155'] as const;

// Non-EVM chains are gated behind the
// per-network snaps-migration remote feature flags: a chain is
// enabled when its flag payload has `stage >= 1`.
const CHAIN_PREFIX_FEATURE_FLAGS = {
  solana: 'networkAssetsSnapsMigrationSolana',
  tron: 'networkAssetsSnapsMigrationTron',
  stellar: 'networkAssetsSnapsMigrationStellar',
} as const;

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
  'RemoteFeatureFlagController:getState',
] as const;

// Allowed events that AccountActivityService can listen to
export const ACCOUNT_ACTIVITY_SERVICE_ALLOWED_EVENTS = [
  'AccountTreeController:selectedAccountGroupChange',
  'BackendWebSocketService:connectionStateChanged',
  'RemoteFeatureFlagController:stateChange',
] as const;

export type AllowedActions =
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  | BackendWebSocketServiceMethodActions
  | RemoteFeatureFlagControllerGetStateAction;

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
  | BackendWebSocketServiceConnectionStateChangedEvent
  | RemoteFeatureFlagControllerStateChangeEvent;

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
      'AccountTreeController:selectedAccountGroupChange',
      // Promise result intentionally not awaited
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => await this.#handleSelectedAccountChange(),
    );
    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      // Promise result intentionally not awaited
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (connectionInfo: WebSocketConnectionInfo) =>
        this.#handleWebSocketStateChange(connectionInfo),
    );
    this.#messenger.subscribe(
      // eslint-disable-next-line no-restricted-syntax
      'RemoteFeatureFlagController:stateChange',
      // Promise result intentionally not awaited
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => await this.#handleFeatureFlagsStateChange(),
      // Only react to changes in the set of enabled chain prefixes. The
      // messenger compares selector results with strict equality, so the
      // selector must return a primitive rather than a fresh object.
      (state) =>
        this.#getSupportedChainPrefixes(state.remoteFeatureFlags).join(','),
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
   */
  async #handleSelectedAccountChange(): Promise<void> {
    const selectedAccounts = this.#messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );

    try {
      // First, unsubscribe from all current account activity subscriptions to avoid multiple subscriptions
      await this.#unsubscribeFromAllAccountActivity();

      for (const address of this.#convertToCaip10Addresses(selectedAccounts)) {
        // Subscribe to the new selected account in CAIP-10 format
        await this.subscribe({ address });
      }
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
      // WebSocket connected - resubscribe to selected account
      // The system notification will automatically provide the list of chains that are up
      await this.#subscribeToSelectedAccount();
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
   * Subscribe to the currently selected account only
   */
  async #subscribeToSelectedAccount(): Promise<void> {
    const selectedAccounts = this.#messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );

    for (const address of this.#convertToCaip10Addresses(selectedAccounts)) {
      await this.subscribe({ address });
    }
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
   * Convert a list of InternalAccount addresses to CAIP-10 format, using the first
   * supported chain prefix matching the account's scopes
   *
   * @param accounts - The internal accounts to convert
   * @returns The CAIP-10 formatted addresses (e.g. [`eip155:0:address`], meaning
   * all chains of that namespace), or an empty array if none of the account's
   * scopes are supported
   */
  #convertToCaip10Addresses(accounts: InternalAccount[]): string[] {
    const supportedChainPrefixes = this.#getSupportedChainPrefixes();
    return accounts.reduce<string[]>((result, account) => {
      const accountPrefix = supportedChainPrefixes.find((prefix) =>
        account.scopes.some((scope) => scope.startsWith(`${prefix}:`)),
      );

      if (!accountPrefix) {
        // Skip unsupported accounts
        return result;
      }

      result.push(`${accountPrefix}:0:${account.address}`);
      return result;
    }, []);
  }

  /**
   * Get the chain prefixes currently enabled for subscriptions: EVM is always
   * enabled, while other chains are gated behind their per-network remote
   * feature flag (enabled when the flag payload has `stage >= 1`).
   *
   * @param remoteFeatureFlags - The remote feature flags state to check for enabled chains.
   * @returns An array of enabled CAIP-2 namespace prefixes (e.g. `['eip155', 'solana']`)
   */
  #getSupportedChainPrefixes(
    remoteFeatureFlags: FeatureFlags = this.#messenger.call(
      'RemoteFeatureFlagController:getState',
    ).remoteFeatureFlags,
  ): string[] {
    const prefixes: string[] = [...ALWAYS_SUPPORTED_CHAIN_PREFIXES];
    for (const [prefix, flagName] of Object.entries(
      CHAIN_PREFIX_FEATURE_FLAGS,
    )) {
      const flagValue = remoteFeatureFlags[flagName];
      if (
        isObject(flagValue) &&
        typeof flagValue.stage === 'number' &&
        flagValue.stage >= 1
      ) {
        prefixes.push(prefix);
      }
    }
    return prefixes;
  }

  /**
   * Handle remote feature flag changes: if the set of enabled chain prefixes
   * changed while connected, resubscribe the selected account so new chains
   * are picked up and disabled ones are dropped.
   */
  async #handleFeatureFlagsStateChange(): Promise<void> {
    try {
      const { state } = this.#messenger.call(
        'BackendWebSocketService:getConnectionInfo',
      );
      if (state !== WebSocketState.CONNECTED) {
        // Not connected: the next connection will subscribe with fresh flags
        return;
      }

      await this.#unsubscribeFromAllAccountActivity();
      await this.#subscribeToSelectedAccount();
    } catch (error) {
      log('Feature flag change handling failed', { error });
    }
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
