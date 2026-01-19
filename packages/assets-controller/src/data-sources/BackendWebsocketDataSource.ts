import type {
  BackendWebSocketServiceActions,
  BackendWebSocketServiceEvents,
  ServerNotificationMessage,
  WebSocketSubscription,
  WebSocketState,
  AccountActivityMessage,
  BalanceUpdate,
} from '@metamask/core-backend';
import type { Messenger } from '@metamask/messenger';

import { AbstractDataSource } from './AbstractDataSource';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import { projectLogger, createModuleLogger } from '../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetMetadata,
  AssetBalance,
  DataRequest,
  DataResponse,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'BackendWebsocketDataSource';
const CHANNEL_TYPE = 'account-activity.v1';

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// MESSENGER TYPES
// ============================================================================

// Action types that BackendWebsocketDataSource exposes
export type BackendWebsocketDataSourceGetActiveChainsAction = {
  type: 'BackendWebsocketDataSource:getActiveChains';
  handler: () => Promise<ChainId[]>;
};

export type BackendWebsocketDataSourceSubscribeAction = {
  type: 'BackendWebsocketDataSource:subscribe';
  handler: (request: SubscriptionRequest) => Promise<void>;
};

export type BackendWebsocketDataSourceUnsubscribeAction = {
  type: 'BackendWebsocketDataSource:unsubscribe';
  handler: (subscriptionId: string) => Promise<void>;
};

export type BackendWebsocketDataSourceActions =
  | BackendWebsocketDataSourceGetActiveChainsAction
  | BackendWebsocketDataSourceSubscribeAction
  | BackendWebsocketDataSourceUnsubscribeAction;

// Event types that BackendWebsocketDataSource publishes
export type BackendWebsocketDataSourceActiveChainsChangedEvent = {
  type: 'BackendWebsocketDataSource:activeChainsUpdated';
  payload: [ChainId[]];
};

export type BackendWebsocketDataSourceAssetsUpdatedEvent = {
  type: 'BackendWebsocketDataSource:assetsUpdated';
  payload: [DataResponse, string | undefined];
};

export type BackendWebsocketDataSourceEvents =
  | BackendWebsocketDataSourceActiveChainsChangedEvent
  | BackendWebsocketDataSourceAssetsUpdatedEvent;

// Actions to report to AssetsController
type AssetsControllerActiveChainsUpdateAction = {
  type: 'AssetsController:activeChainsUpdate';
  handler: (dataSourceId: string, activeChains: ChainId[]) => void;
};

type AssetsControllerAssetsUpdateAction = {
  type: 'AssetsController:assetsUpdate';
  handler: (response: DataResponse, sourceId: string) => Promise<void>;
};

// Allowed actions that BackendWebsocketDataSource can call
export type BackendWebsocketDataSourceAllowedActions =
  | BackendWebSocketServiceActions
  | AssetsControllerActiveChainsUpdateAction
  | AssetsControllerAssetsUpdateAction;

// Event type from AccountsApiDataSource that we subscribe to
export type AccountsApiDataSourceActiveChainsChangedEvent = {
  type: 'AccountsApiDataSource:activeChainsUpdated';
  payload: [ChainId[]];
};

// Allowed events that BackendWebsocketDataSource can subscribe to
export type BackendWebsocketDataSourceAllowedEvents =
  | BackendWebSocketServiceEvents
  | AccountsApiDataSourceActiveChainsChangedEvent;

export type BackendWebsocketDataSourceMessenger = Messenger<
  typeof CONTROLLER_NAME,
  BackendWebsocketDataSourceActions | BackendWebsocketDataSourceAllowedActions,
  BackendWebsocketDataSourceEvents | BackendWebsocketDataSourceAllowedEvents
>;

// ============================================================================
// STATE
// ============================================================================

export type BackendWebsocketDataSourceState = DataSourceState;

const defaultState: BackendWebsocketDataSourceState = {
  activeChains: [],
};

// ============================================================================
// OPTIONS
// ============================================================================

export type BackendWebsocketDataSourceOptions = {
  messenger: BackendWebsocketDataSourceMessenger;
  state?: Partial<BackendWebsocketDataSourceState>;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract namespace from a CAIP-2 chain ID.
 * E.g., "eip155:1" -> "eip155", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" -> "solana"
 *
 * @param chainId - The CAIP-2 chain ID to extract namespace from.
 * @returns The namespace portion of the chain ID.
 */
function extractNamespace(chainId: ChainId): string {
  const [namespace] = chainId.split(':');
  return namespace;
}

/**
 * Get unique namespaces from chain IDs.
 *
 * @param chainIds - Array of CAIP-2 chain IDs.
 * @returns Array of unique namespaces.
 */
function getUniqueNamespaces(chainIds: ChainId[]): string[] {
  const namespaces = new Set<string>();
  for (const chainId of chainIds) {
    namespaces.add(extractNamespace(chainId));
  }
  return Array.from(namespaces);
}

/**
 * Build WebSocket channel name for account activity using CAIP-10 wildcard format.
 * Uses 0 as the chain reference to subscribe to all chains in the namespace.
 * Format: account-activity.v1.eip155:0:0x1234... (all EVM chains)
 * Format: account-activity.v1.solana:0:ABC123... (all Solana chains)
 *
 * @param namespace - The chain namespace (e.g., "eip155", "solana").
 * @param address - The account address.
 * @returns The WebSocket channel name.
 */
function buildAccountActivityChannel(
  namespace: string,
  address: string,
): string {
  return `${CHANNEL_TYPE}.${namespace}:0:${address.toLowerCase()}`;
}

// Note: AccountActivityMessage and BalanceUpdate types are imported from @metamask/core-backend

// ============================================================================
// BACKEND WEBSOCKET DATA SOURCE
// ============================================================================

/**
 * Data source for receiving real-time balance updates via WebSocket.
 *
 * This data source connects directly to BackendWebSocketService to receive
 * push notifications for account balance changes. Unlike AccountsApiDataSource
 * which polls for data, this provides instant updates.
 *
 * Uses Messenger pattern for all interactions:
 * - Calls BackendWebSocketService methods via messenger actions
 * - Exposes its own actions for AssetsController to call
 * - Publishes events for AssetsController to subscribe to
 *
 * Actions exposed:
 * - BackendWebsocketDataSource:getActiveChains
 * - BackendWebsocketDataSource:subscribe
 * - BackendWebsocketDataSource:unsubscribe
 *
 * Events published:
 * - BackendWebsocketDataSource:activeChainsUpdated
 * - BackendWebsocketDataSource:assetsUpdated
 *
 * Actions called (from BackendWebSocketService):
 * - BackendWebSocketService:subscribe
 * - BackendWebSocketService:getConnectionInfo
 * - BackendWebSocketService:findSubscriptionsByChannelPrefix
 */
export class BackendWebsocketDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  BackendWebsocketDataSourceState
> {
  readonly #messenger: BackendWebsocketDataSourceMessenger;

  /** WebSocket subscriptions by our internal subscription ID */
  readonly #wsSubscriptions: Map<string, WebSocketSubscription> = new Map();

  /** Pending subscription requests to process when WebSocket connects */
  readonly #pendingSubscriptions: Map<string, SubscriptionRequest> = new Map();

  constructor(options: BackendWebsocketDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;

    this.#registerActionHandlers();
    this.#subscribeToEvents();
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  #registerActionHandlers(): void {
    const getActiveChainsHandler: BackendWebsocketDataSourceGetActiveChainsAction['handler'] =
      async () => this.getActiveChains();

    const subscribeHandler: BackendWebsocketDataSourceSubscribeAction['handler'] =
      async (request) => this.subscribe(request);

    const unsubscribeHandler: BackendWebsocketDataSourceUnsubscribeAction['handler'] =
      async (subscriptionId) => this.unsubscribe(subscriptionId);

    this.#messenger.registerActionHandler(
      'BackendWebsocketDataSource:getActiveChains',
      getActiveChainsHandler,
    );

    this.#messenger.registerActionHandler(
      'BackendWebsocketDataSource:subscribe',
      subscribeHandler,
    );

    this.#messenger.registerActionHandler(
      'BackendWebsocketDataSource:unsubscribe',
      unsubscribeHandler,
    );
  }

  #subscribeToEvents(): void {
    // Listen for WebSocket connection state changes
    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      (connectionInfo) => {
        if (connectionInfo.state === ('connected' as WebSocketState)) {
          // WebSocket connected - process any pending subscriptions
          this.#processPendingSubscriptions().catch(console.error);
        } else if (
          connectionInfo.state === ('disconnected' as WebSocketState)
        ) {
          // When disconnected, all subscriptions are cleared server-side
          // We need to clear our local tracking
          this.#wsSubscriptions.clear();
        }
      },
    );

    // Listen for AccountsApiDataSource active chains changes
    // This keeps BackendWebsocketDataSource in sync with the supported chains
    // since both use the same backend infrastructure
    this.#messenger.subscribe(
      'AccountsApiDataSource:activeChainsUpdated',
      (chains: ChainId[]) => {
        this.updateActiveChains(chains, (updatedChains) =>
          this.#messenger.call(
            'AssetsController:activeChainsUpdate',
            CONTROLLER_NAME,
            updatedChains,
          ),
        );
      },
    );
  }

  /**
   * Process any pending subscriptions that were queued while WebSocket was disconnected.
   */
  async #processPendingSubscriptions(): Promise<void> {
    if (this.#pendingSubscriptions.size === 0) {
      return;
    }

    // Process all pending subscriptions
    const pendingEntries = Array.from(this.#pendingSubscriptions.entries());

    for (const [subscriptionId, request] of pendingEntries) {
      try {
        // Remove from pending before processing to avoid infinite loop
        this.#pendingSubscriptions.delete(subscriptionId);
        await this.subscribe(request);
      } catch (error) {
        log('Failed to process pending subscription', {
          subscriptionId,
          error,
        });
      }
    }
  }

  // ============================================================================
  // ACTIVE CHAINS
  // ============================================================================

  /**
   * Update active chains when AccountsApiDataSource reports new supported chains.
   *
   * @param chains - Array of supported chain IDs.
   */
  updateSupportedChains(chains: ChainId[]): void {
    this.updateActiveChains(chains, (updatedChains) =>
      this.#messenger.call(
        'AssetsController:activeChainsUpdate',
        CONTROLLER_NAME,
        updatedChains,
      ),
    );
  }

  // ============================================================================
  // SUBSCRIBE
  // ============================================================================

  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    // Filter to active chains only
    const chainsToSubscribe = request.chainIds.filter((chainId) =>
      this.state.activeChains.includes(chainId),
    );

    const addresses = request.accounts.map((a) => a.address);

    if (chainsToSubscribe.length === 0) {
      return;
    }

    // Check WebSocket connection status
    try {
      const connectionInfo = this.#messenger.call(
        'BackendWebSocketService:getConnectionInfo',
      );
      if (connectionInfo.state !== ('connected' as WebSocketState)) {
        // Store the subscription request to process when WebSocket connects
        this.#pendingSubscriptions.set(subscriptionId, subscriptionRequest);
        return;
      }
    } catch {
      // Store anyway - will be processed when we can connect
      this.#pendingSubscriptions.set(subscriptionId, subscriptionRequest);
      return;
    }

    // Remove from pending if it was there (we're processing it now)
    this.#pendingSubscriptions.delete(subscriptionId);

    // Handle subscription update
    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.chains = chainsToSubscribe;
        return;
      }
    }

    // Clean up existing subscription if any
    await this.unsubscribe(subscriptionId);

    // Extract unique namespaces from chains (e.g., eip155, solana)
    const namespaces = getUniqueNamespaces(chainsToSubscribe);

    // Build channel names using CAIP-10 wildcard format
    const channels: string[] = [];
    for (const namespace of namespaces) {
      for (const address of addresses) {
        channels.push(buildAccountActivityChannel(namespace, address));
      }
    }

    try {
      // Create WebSocket subscription
      const wsSubscription = await this.#messenger.call(
        'BackendWebSocketService:subscribe',
        {
          channels,
          channelType: CHANNEL_TYPE,
          callback: (notification: ServerNotificationMessage) => {
            this.#handleNotification(notification, request);
          },
        },
      );

      // Store WebSocket subscription
      this.#wsSubscriptions.set(subscriptionId, wsSubscription);

      // Store in abstract class tracking
      this.activeSubscriptions.set(subscriptionId, {
        cleanup: () => {
          const wsSub = this.#wsSubscriptions.get(subscriptionId);
          if (wsSub) {
            wsSub.unsubscribe().catch((unsubErr) => {
              log('Error unsubscribing', { subscriptionId, error: unsubErr });
            });
            this.#wsSubscriptions.delete(subscriptionId);
          }
        },
        chains: chainsToSubscribe,
      });
    } catch (error) {
      log('WebSocket subscription FAILED', {
        subscriptionId,
        error,
        chains: chainsToSubscribe,
      });
    }
  }

  // ============================================================================
  // NOTIFICATION HANDLING
  // ============================================================================

  #handleNotification(
    notification: ServerNotificationMessage,
    request: DataRequest,
  ): void {
    try {
      const activityMessage =
        notification.data as unknown as AccountActivityMessage;
      const { address, tx, updates } = activityMessage;

      if (!address || !tx || !updates) {
        return;
      }

      // Extract chain ID from transaction (CAIP-2 format, e.g., "eip155:8453")
      const chainId = tx.chain as ChainId;

      // Find matching account in request
      const account = request.accounts.find(
        (a) => a.address.toLowerCase() === address.toLowerCase(),
      );
      if (!account) {
        return;
      }
      const accountId = account.id;

      // Process all balance updates from the activity message
      const response = this.#processBalanceUpdates(updates, chainId, accountId);

      if (Object.keys(response).length > 0) {
        // Report update to AssetsController
        this.#messenger
          .call('AssetsController:assetsUpdate', response, CONTROLLER_NAME)
          .catch(console.error);
      }
    } catch (error) {
      log('Error handling notification', error);
    }
  }

  /**
   * Process balance updates from AccountActivityMessage.
   * Each update contains asset info, post-transaction balance, and transfer details.
   *
   * @param updates - Array of balance updates from the activity message.
   * @param _chainId - The chain ID (unused but kept for context).
   * @param accountId - The account ID to process updates for.
   * @returns DataResponse containing processed balance and metadata.
   */
  #processBalanceUpdates(
    updates: BalanceUpdate[],
    _chainId: ChainId,
    accountId: string,
  ): DataResponse {
    const assetsBalance: Record<string, Record<Caip19AssetId, AssetBalance>> = {
      [accountId]: {},
    };
    const assetsMetadata: Record<Caip19AssetId, AssetMetadata> = {};

    for (const update of updates) {
      const { asset, postBalance } = update;

      if (!asset || !postBalance) {
        continue;
      }

      // Asset type is in CAIP format: "eip155:1/erc20:0x..." or "eip155:1/slip44:60"
      // We can use it directly as the asset ID
      const assetId = asset.type as Caip19AssetId;

      // Determine token type from asset type string
      const isNative = asset.type.includes('/slip44:');
      const tokenType = isNative ? 'native' : 'erc20';

      // Parse balance amount (already in hex format like "0xc350")
      const balanceAmount = postBalance.amount.startsWith('0x')
        ? BigInt(postBalance.amount).toString()
        : postBalance.amount;

      assetsBalance[accountId][assetId] = {
        amount: balanceAmount,
      };

      assetsMetadata[assetId] = {
        type: tokenType,
        symbol: asset.unit,
        name: asset.unit, // Use unit as name (actual name may not be in the message)
        decimals: asset.decimals,
      };
    }

    const response: DataResponse = {};
    if (Object.keys(assetsBalance[accountId]).length > 0) {
      response.assetsBalance = assetsBalance;
      response.assetsMetadata = assetsMetadata;
    }

    return response;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    // Clean up WebSocket subscriptions
    for (const [subscriptionId, wsSub] of this.#wsSubscriptions) {
      try {
        // Fire and forget - don't await in destroy
        wsSub.unsubscribe().catch(() => {
          // Ignore errors during cleanup
        });
      } catch {
        // Ignore errors during cleanup
      }
      this.#wsSubscriptions.delete(subscriptionId);
    }

    // Clean up base class subscriptions
    super.destroy();
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Creates a BackendWebsocketDataSource instance.
 *
 * @param options - Configuration options for the data source.
 * @returns A new BackendWebsocketDataSource instance.
 */
export function createBackendWebsocketDataSource(
  options: BackendWebsocketDataSourceOptions,
): BackendWebsocketDataSource {
  return new BackendWebsocketDataSource(options);
}
