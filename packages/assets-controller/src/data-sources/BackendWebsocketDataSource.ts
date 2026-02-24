import type {
  BackendWebSocketServiceActions,
  BackendWebSocketServiceEvents,
  ServerNotificationMessage,
  WebSocketSubscription,
  WebSocketState,
  AccountActivityMessage,
  BalanceUpdate,
} from '@metamask/core-backend';
import type { ApiPlatformClient } from '@metamask/core-backend';
import {
  isCaipChainId,
  KnownCaipNamespace,
  toCaipChainId,
} from '@metamask/utils';
import BigNumberJS from 'bignumber.js';

import { AbstractDataSource } from './AbstractDataSource';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import type { AssetsControllerMessenger } from '../AssetsController';
import { projectLogger, createModuleLogger } from '../logger';
import type {
  ChainId,
  Caip19AssetId,
  AssetMetadata,
  AssetBalance,
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

// Allowed actions that BackendWebsocketDataSource can call
export type BackendWebsocketDataSourceAllowedActions =
  BackendWebSocketServiceActions;

// Allowed events that BackendWebsocketDataSource can subscribe to
export type BackendWebsocketDataSourceAllowedEvents =
  BackendWebSocketServiceEvents;

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
  /** The AssetsController messenger (shared by all data sources). */
  messenger: AssetsControllerMessenger;
  /** ApiPlatformClient for fetching supported networks at init (same as AccountsApiDataSource). */
  queryApiClient: ApiPlatformClient;
  /** Called when active chains are updated. Pass dataSourceName so the controller knows the source. */
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
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

/** Namespaces we always subscribe to for account activity (EVM + Solana). */
const ACCOUNT_ACTIVITY_NAMESPACES = ['eip155', 'solana'] as const;

/**
 * Get unique namespaces for account-activity subscriptions.
 * Always includes eip155 and solana so we subscribe to both EVM and Solana account activity,
 * plus any additional namespaces from the requested chain IDs.
 *
 * @param chainIds - Array of CAIP-2 chain IDs (from the subscription request).
 * @returns Array of unique namespaces (at least eip155 and solana).
 */
function getNamespacesForAccountActivity(chainIds: ChainId[]): string[] {
  const namespaces = new Set<string>(ACCOUNT_ACTIVITY_NAMESPACES);
  for (const chainId of chainIds) {
    namespaces.add(extractNamespace(chainId));
  }
  return Array.from(namespaces);
}

/**
 * Returns the address to use for account-activity subscription in the given namespace.
 * EIP-155 accounts use hex (0x...) address; Solana accounts use base58.
 * Returns null if this account type does not have an address in that namespace.
 *
 * @param account - Internal account (type + address).
 * @param account.type - Account type (e.g. "eip155:eoa", "solana:data-account").
 * @param account.address - Account address (hex for eip155, base58 for solana).
 * @param namespace - The chain namespace (e.g., "eip155", "solana").
 * @returns The address for that namespace, or null if the account does not support the namespace.
 */
function getAddressForAccountActivity(
  account: { type: string; address: string },
  namespace: string,
): string | null {
  if (namespace === 'eip155') {
    return account.type.startsWith('eip155') ? account.address : null;
  }
  if (namespace === 'solana') {
    return account.type.startsWith('solana') ? account.address : null;
  }
  // Other namespaces (e.g. from chainIds): use address if account type matches namespace
  const typePrefix = `${namespace}:`;
  return account.type.startsWith(typePrefix) ? account.address : null;
}

/**
 * Build WebSocket channel name for account activity using CAIP-10 wildcard format.
 * Uses 0 as the chain reference to subscribe to all chains in the namespace.
 * EIP-155 addresses are lowercased (hex); Solana addresses are left as-is (base58).
 *
 * @param namespace - The chain namespace (e.g., "eip155", "solana").
 * @param address - The account address (hex for eip155, base58 for solana).
 * @returns The WebSocket channel name.
 */
function buildAccountActivityChannel(
  namespace: string,
  address: string,
): string {
  const formatted = namespace === 'eip155' ? address.toLowerCase() : address;
  return `${CHANNEL_TYPE}.${namespace}:0:${formatted}`;
}

/**
 * Normalize API chain identifier to CAIP-2 ChainId.
 * Passes through strings already in CAIP-2 form (e.g. eip155:1, solana:5eykt...).
 * Converts bare decimals to eip155:decimal.
 * Uses @metamask/utils for CAIP parsing.
 *
 * @param chainIdOrDecimal - Chain ID string (CAIP-2 or decimal) or decimal number.
 * @returns CAIP-2 ChainId.
 */
function toChainId(chainIdOrDecimal: number | string): ChainId {
  if (typeof chainIdOrDecimal === 'string') {
    if (isCaipChainId(chainIdOrDecimal)) {
      return chainIdOrDecimal;
    }
    return toCaipChainId(KnownCaipNamespace.Eip155, chainIdOrDecimal);
  }
  return toCaipChainId(KnownCaipNamespace.Eip155, String(chainIdOrDecimal));
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
const DEFAULT_CHAINS_REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

export class BackendWebsocketDataSource extends AbstractDataSource<
  typeof CONTROLLER_NAME,
  BackendWebsocketDataSourceState
> {
  readonly #messenger: AssetsControllerMessenger;

  readonly #apiClient: ApiPlatformClient;

  readonly #onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  /** Chains refresh timer */
  #chainsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  /** WebSocket subscriptions by our internal subscription ID */
  readonly #wsSubscriptions: Map<string, WebSocketSubscription> = new Map();

  /** Pending subscription requests to process when WebSocket connects */
  readonly #pendingSubscriptions: Map<string, SubscriptionRequest> = new Map();

  /** Store original subscription requests for reconnection */
  readonly #subscriptionRequests: Map<string, SubscriptionRequest> = new Map();

  constructor(options: BackendWebsocketDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#apiClient = options.queryApiClient;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;

    this.#subscribeToEvents();
    this.#initializeActiveChains().catch(console.error);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async #initializeActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      const previous = [...this.state.activeChains];
      this.updateActiveChains(chains, (updatedChains) =>
        this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
      );

      this.#chainsRefreshTimer = setInterval(() => {
        this.#refreshActiveChains().catch(console.error);
      }, DEFAULT_CHAINS_REFRESH_INTERVAL_MS);
    } catch (error) {
      log('Failed to fetch active chains', error);
    }
  }

  async #refreshActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      const previousChains = new Set(this.state.activeChains);
      const newChains = new Set(chains);

      const added = chains.filter((chain) => !previousChains.has(chain));
      const removed = Array.from(previousChains).filter(
        (chain) => !newChains.has(chain),
      );

      if (added.length > 0 || removed.length > 0) {
        const previous = [...this.state.activeChains];
        this.updateActiveChains(chains, (updatedChains) =>
          this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
        );
      }
    } catch (error) {
      log('Failed to refresh active chains', error);
    }
  }

  async #fetchActiveChains(): Promise<ChainId[]> {
    const response = await this.#apiClient.accounts.fetchV2SupportedNetworks();
    return response.fullSupport.map(toChainId);
  }

  #subscribeToEvents(): void {
    type ConnectionStatePayload = {
      state: WebSocketState;
      [key: string]: unknown;
    };
    // Listen for WebSocket connection state changes (event not in AssetsControllerEvents).
    (
      this.#messenger as unknown as {
        subscribe: (e: string, h: (p: ConnectionStatePayload) => void) => void;
      }
    ).subscribe(
      'BackendWebSocketService:connectionStateChanged',
      (connectionInfo: ConnectionStatePayload) => {
        if (connectionInfo.state === ('connected' as WebSocketState)) {
          this.#processPendingSubscriptions().catch(console.error);
        } else if (
          connectionInfo.state === ('disconnected' as WebSocketState)
        ) {
          this.#handleDisconnect();
        }
      },
    );
  }

  /**
   * Sync active chains from AccountsApiDataSource.
   * Called by AssetsController.handleActiveChainsUpdate when the callback is
   * invoked for BackendWebsocketDataSource (no messenger call; controller already updated).
   *
   * @param chains - Updated active chain IDs from AccountsApiDataSource.
   */
  setActiveChainsFromAccountsApi(chains: ChainId[]): void {
    this.updateActiveChains(chains, () => undefined);
  }

  /**
   * Handle WebSocket disconnection.
   * Moves all active subscriptions to pending for re-subscription on reconnect.
   */
  #handleDisconnect(): void {
    log('WebSocket disconnected, preserving subscriptions for reconnect', {
      activeSubscriptionCount: this.activeSubscriptions.size,
      wsSubscriptionCount: this.#wsSubscriptions.size,
    });

    // Move active subscriptions to pending for re-subscription
    for (const [subscriptionId] of this.activeSubscriptions) {
      const originalRequest = this.#subscriptionRequests.get(subscriptionId);
      if (originalRequest) {
        // Mark as update since it was previously active
        this.#pendingSubscriptions.set(subscriptionId, {
          ...originalRequest,
          isUpdate: false, // Treat as new subscription since server cleared it
        });
      }
    }

    // Clear WebSocket subscriptions (server-side already cleared)
    this.#wsSubscriptions.clear();

    // Clear active subscriptions (they're no longer valid)
    this.activeSubscriptions.clear();
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
    const previous = [...this.state.activeChains];
    this.updateActiveChains(chains, (updatedChains) =>
      this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
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

    const addresses = request.accountsWithSupportedChains.map(
      (a) => a.account.address,
    );

    if (addresses.length === 0) {
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
        // Check if accounts changed - if so, we need to re-subscribe to different channels
        const existingAddresses = existing.addresses ?? [];
        const addressesChanged =
          addresses.length !== existingAddresses.length ||
          addresses.some((addr) => !existingAddresses.includes(addr));

        if (!addressesChanged) {
          // Only chains changed - just update chains and return
          existing.chains = chainsToSubscribe;
          return;
        }
        // Accounts changed - fall through to re-subscribe with new channels
      }
    }

    // Clean up existing subscription if any
    await this.unsubscribe(subscriptionId);

    // Always subscribe to eip155 and solana account activity, plus any namespaces from requested chains
    const namespaces = getNamespacesForAccountActivity(chainsToSubscribe);

    // Build channel names: use namespace-appropriate address per account (eip155 = hex, solana = base58)
    const channels: string[] = [];
    for (const namespace of namespaces) {
      for (const { account } of request.accountsWithSupportedChains) {
        const address = getAddressForAccountActivity(account, namespace);
        if (address) {
          channels.push(buildAccountActivityChannel(namespace, address));
        }
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
            this.#handleNotification(notification, subscriptionId);
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
            wsSub.unsubscribe().catch((unsubErr: unknown) => {
              log('Error unsubscribing', { subscriptionId, error: unsubErr });
            });
            this.#wsSubscriptions.delete(subscriptionId);
          }
          // Also clean up the stored request
          this.#subscriptionRequests.delete(subscriptionId);
        },
        chains: chainsToSubscribe,
        addresses,
        onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
      });

      // Store original request for reconnection
      this.#subscriptionRequests.set(subscriptionId, subscriptionRequest);
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
    subscriptionId: string,
  ): void {
    try {
      const subscription = this.activeSubscriptions.get(subscriptionId);
      const request = this.#subscriptionRequests.get(subscriptionId)?.request;
      if (!request) {
        return;
      }

      const activityMessage =
        notification.data as unknown as AccountActivityMessage;
      const { address, tx, updates } = activityMessage;

      if (!address || !tx || !updates) {
        return;
      }

      // Extract chain ID from transaction (CAIP-2 format, e.g., "eip155:8453")
      const chainId = tx.chain as ChainId;

      // Find matching account in request (eip155: case-insensitive hex; solana: exact base58)
      const account = request.accountsWithSupportedChains
        .map((entry) => entry.account)
        .find((a) =>
          a.address.startsWith('0x')
            ? a.address.toLowerCase() === address.toLowerCase()
            : a.address === address,
        );
      if (!account) {
        return;
      }
      const accountId = account.id;

      // Process all balance updates from the activity message
      const response = this.#processBalanceUpdates(updates, chainId, accountId);

      if (Object.keys(response).length > 0 && subscription) {
        Promise.resolve(subscription.onAssetsUpdate(response)).catch(
          console.error,
        );
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

      // We assume decimals are always present; skip malformed updates
      if (asset.decimals === undefined) {
        continue;
      }

      // Parse raw balance (hex like "0x26f0e5" or decimal string)
      const rawBalanceStr = postBalance.amount.startsWith('0x')
        ? BigInt(postBalance.amount).toString()
        : postBalance.amount;

      // Convert to human-readable using asset decimals (match RpcDataSource / pipeline format)
      const humanReadableAmount = new BigNumberJS(rawBalanceStr)
        .dividedBy(new BigNumberJS(10).pow(asset.decimals))
        .toString();

      assetsBalance[accountId][assetId] = {
        amount: humanReadableAmount,
      };

      assetsMetadata[assetId] = {
        type: tokenType,
        symbol: asset.unit,
        name: asset.unit, // Use unit as name (actual name may not be in the message)
        decimals: asset.decimals,
      };
    }

    const response: DataResponse = { updateMode: 'merge' };
    if (Object.keys(assetsBalance[accountId]).length > 0) {
      response.assetsBalance = assetsBalance;
      response.assetsInfo = assetsMetadata;
    }

    return response;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    if (this.#chainsRefreshTimer) {
      clearInterval(this.#chainsRefreshTimer);
      this.#chainsRefreshTimer = null;
    }

    // Clean up WebSocket subscriptions
    // Convert to array first to avoid modifying map during iteration
    const subscriptions = [...this.#wsSubscriptions.values()];
    for (const wsSub of subscriptions) {
      try {
        // Fire and forget - don't await in destroy
        wsSub.unsubscribe().catch(() => {
          // Ignore errors during cleanup
        });
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.#wsSubscriptions.clear();

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
