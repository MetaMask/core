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

import type { AssetsControllerMessenger } from '../AssetsController.js';
import { projectLogger, createModuleLogger } from '../logger.js';
import type { ChainId, Caip19AssetId, DataResponse } from '../types.js';
import { processAccountActivityBalanceUpdates } from '../utils/processAccountActivityBalanceUpdates.js';
import { AbstractDataSource } from './AbstractDataSource.js';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource.js';

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
  /** Returns the asset type ('native' | 'erc20' | 'spl') for a given CAIP-19 asset ID. */
  getAssetType: (assetId: Caip19AssetId) => 'native' | 'erc20' | 'spl';
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
 * Normalize addresses for stable comparison when detecting account changes.
 *
 * @param address - Account address (hex or base58).
 * @returns Normalized address for comparison.
 */
function normalizeAddressForComparison(address: string): string {
  return address.startsWith('0x') ? address.toLowerCase() : address;
}

/**
 * Check whether subscribed account addresses changed (case-insensitive for EVM).
 *
 * @param nextAddresses - Addresses from the incoming subscribe request.
 * @param existingAddresses - Addresses from the active subscription.
 * @returns True when the address sets differ.
 */
function haveAddressesChanged(
  nextAddresses: string[],
  existingAddresses: string[],
): boolean {
  if (nextAddresses.length !== existingAddresses.length) {
    return true;
  }

  const normalizedNext = nextAddresses
    .map(normalizeAddressForComparison)
    .sort();
  const normalizedExisting = existingAddresses
    .map(normalizeAddressForComparison)
    .sort();

  return normalizedNext.some(
    (address, index) => address !== normalizedExisting[index],
  );
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
 * - BackendWebSocketService:addChannelCallback
 * - BackendWebSocketService:removeChannelCallback
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

  readonly #getAssetType: (
    assetId: Caip19AssetId,
  ) => 'native' | 'erc20' | 'spl';

  /** Chains refresh timer */
  #chainsRefreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Chains the backend API reports as supported (preserved across disconnects). */
  #supportedChains: ChainId[] = [];

  /** Whether the WebSocket is currently connected. Chains are only claimed when true. */
  #isConnected = false;

  /** WebSocket subscriptions by our internal subscription ID */
  readonly #wsSubscriptions: Map<string, WebSocketSubscription> = new Map();

  /** Pending subscription requests to process when WebSocket connects */
  readonly #pendingSubscriptions: Map<string, SubscriptionRequest> = new Map();

  /** Store original subscription requests for reconnection */
  readonly #subscriptionRequests: Map<string, SubscriptionRequest> = new Map();

  /** Channels with registered BackendWebSocketService channel callbacks */
  readonly #registeredChannelCallbacks: Set<string> = new Set();

  /** Serializes subscribe/unsubscribe so account switches cannot interleave. */
  #subscribeLock: Promise<void> = Promise.resolve();

  constructor(options: BackendWebsocketDataSourceOptions) {
    super(CONTROLLER_NAME, {
      ...defaultState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#apiClient = options.queryApiClient;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;
    this.#getAssetType = options.getAssetType;

    this.#subscribeToEvents();
    this.#initializeActiveChains().catch(console.error);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async #initializeActiveChains(): Promise<void> {
    try {
      const chains = await this.#fetchActiveChains();
      this.#supportedChains = chains;

      // Only claim chains if the websocket is already connected.
      // If not connected, chains stay unclaimed so AccountsApiDataSource
      // can pick them up via polling. They'll be claimed on reconnect.
      if (this.#isConnected) {
        const previous = [...this.state.activeChains];
        this.updateActiveChains(chains, (updatedChains) =>
          this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
        );
      }

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
      this.#supportedChains = chains;

      // Only update activeChains if connected; otherwise keep them unclaimed.
      if (!this.#isConnected) {
        return;
      }

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

  /**
   * Re-fetch supported networks and refresh `activeChains` when connected.
   * When disconnected, only `#supportedChains` is updated so reconnect can
   * reclaim chains. Called on EVM network switch from AssetsController.
   *
   * @returns Resolves when supported networks have been re-fetched.
   */
  refreshActiveChains(): Promise<void> {
    return this.#refreshActiveChains();
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
          this.#isConnected = true;
          this.#handleReconnect();
        } else if (
          connectionInfo.state === ('disconnected' as WebSocketState)
        ) {
          this.#isConnected = false;
          this.#handleDisconnect();
        }
      },
    );
  }

  /**
   * Sync active chains from AccountsApiDataSource.
   * When the data source invokes the onActiveChainsUpdated callback, the
   * controller processes the active chains update (no messenger call; controller already updated).
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
    log('WebSocket disconnected, releasing chains for fallback', {
      activeSubscriptionCount: this.activeSubscriptions.size,
      wsSubscriptionCount: this.#wsSubscriptions.size,
      chainCount: this.state.activeChains.length,
    });

    // Move active subscriptions to pending for re-subscription
    for (const [subscriptionId] of this.activeSubscriptions) {
      const originalRequest = this.#subscriptionRequests.get(subscriptionId);
      if (originalRequest) {
        this.#pendingSubscriptions.set(subscriptionId, {
          ...originalRequest,
          isUpdate: false,
        });
      }
    }

    // Clear WebSocket subscriptions (server-side already cleared)
    this.#wsSubscriptions.clear();

    // Clear active subscriptions (they're no longer valid)
    this.activeSubscriptions.clear();

    // Release chains so the chain-claiming loop assigns them to
    // AccountsApiDataSource (polling fallback) on the next #subscribeAssets.
    const previous = [...this.state.activeChains];
    if (previous.length > 0) {
      this.updateActiveChains([], (updatedChains) =>
        this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
      );
    }
  }

  /**
   * Handle WebSocket reconnection.
   * Clears stale pending subscriptions and restores activeChains so the
   * chain-claiming loop re-assigns them to this data source, triggering
   * fresh subscriptions with current accounts and chains.
   */
  #handleReconnect(): void {
    log('WebSocket reconnected, reclaiming chains', {
      supportedChainCount: this.#supportedChains.length,
      pendingSubscriptionCount: this.#pendingSubscriptions.size,
    });

    // Discard stale pending subscriptions captured at disconnect time.
    // The chain reclaim below triggers #onActiveChainsUpdated →
    // #subscribeAssets() in AssetsController, which creates fresh
    // subscriptions with current accounts and chains. Processing the
    // stale pending entries afterwards would overwrite those with
    // outdated request data.
    this.#pendingSubscriptions.clear();

    if (this.#supportedChains.length > 0) {
      const previous = [...this.state.activeChains];
      this.updateActiveChains(this.#supportedChains, (updatedChains) =>
        this.#onActiveChainsUpdated(this.getName(), updatedChains, previous),
      );
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
    const previousLock = this.#subscribeLock;
    let releaseLock: () => void = () => undefined;
    this.#subscribeLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    try {
      await this.#subscribeInternal(subscriptionRequest);
    } finally {
      releaseLock();
    }
  }

  async #subscribeInternal(
    subscriptionRequest: SubscriptionRequest,
  ): Promise<void> {
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
        const addressesChanged = haveAddressesChanged(
          addresses,
          existingAddresses,
        );

        if (!addressesChanged) {
          // Only chains changed - update chains, request, and callback
          existing.chains = chainsToSubscribe;
          existing.onAssetsUpdate = subscriptionRequest.onAssetsUpdate;
          this.#subscriptionRequests.set(subscriptionId, subscriptionRequest);
          return;
        }
        // Accounts changed - fall through to re-subscribe with new channels
      }
    }

    // Clean up existing subscription if any (inline teardown — subscribe holds the lock)
    await this.#teardownSubscription(subscriptionId);

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

    if (channels.length === 0) {
      return;
    }

    try {
      // Register request/callback before awaiting server subscribe so notifications
      // that arrive during the subscribe handshake are not dropped.
      this.#subscriptionRequests.set(subscriptionId, subscriptionRequest);
      this.activeSubscriptions.set(subscriptionId, {
        cleanup: () => {
          this.#teardownSubscription(subscriptionId).catch(() => undefined);
        },
        chains: chainsToSubscribe,
        addresses,
        onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
      });

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

      this.#wsSubscriptions.set(subscriptionId, wsSubscription);

      try {
        this.#registerChannelCallbacks(subscriptionId, channels);
      } catch (channelCallbackError) {
        log(
          'Channel callback registration failed; ws subscription still active',
          { subscriptionId, error: channelCallbackError },
        );
      }
    } catch (error) {
      this.activeSubscriptions.delete(subscriptionId);
      this.#subscriptionRequests.delete(subscriptionId);
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
      const activityMessage =
        notification.data as unknown as AccountActivityMessage;

      const storedSubscription = this.#subscriptionRequests.get(subscriptionId);
      const request = storedSubscription?.request;
      const onAssetsUpdate =
        this.activeSubscriptions.get(subscriptionId)?.onAssetsUpdate ??
        storedSubscription?.onAssetsUpdate;

      if (!request) {
        return;
      }

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

      const balanceEntries = response.assetsBalance?.[accountId] ?? {};
      const hasBalances = Object.keys(balanceEntries).length > 0;

      if (hasBalances && onAssetsUpdate) {
        Promise.resolve(onAssetsUpdate(response, request)).catch((error) => {
          console.error(error);
        });
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
    return processAccountActivityBalanceUpdates(updates, accountId, (assetId) =>
      this.#getAssetType(assetId),
    );
  }

  // ============================================================================
  // UNSUBSCRIBE
  // ============================================================================

  /**
   * Unsubscribe and await server-side teardown so a re-subscribe does not race
   * with stale subscription IDs on incoming notifications.
   *
   * @param subscriptionId - The ID of the subscription to cancel.
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const previousLock = this.#subscribeLock;
    let releaseLock: () => void = () => undefined;
    this.#subscribeLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;
    try {
      await this.#teardownSubscription(subscriptionId);
    } finally {
      releaseLock();
    }
  }

  async #teardownSubscription(subscriptionId: string): Promise<void> {
    const wsSub = this.#wsSubscriptions.get(subscriptionId);

    if (wsSub) {
      const channels = [...wsSub.channels];
      try {
        await wsSub.unsubscribe();
      } catch (unsubErr: unknown) {
        log('Error unsubscribing', { subscriptionId, error: unsubErr });
      }
      this.#wsSubscriptions.delete(subscriptionId);
      this.#removeChannelCallbacks(channels);
    }

    this.#subscriptionRequests.delete(subscriptionId);
    this.activeSubscriptions.delete(subscriptionId);
  }

  #registerChannelCallbacks(subscriptionId: string, channels: string[]): void {
    for (const channel of channels) {
      this.#unregisterChannelCallback(channel);

      try {
        this.#messenger.call('BackendWebSocketService:addChannelCallback', {
          channelName: channel,
          callback: (notification: ServerNotificationMessage) => {
            this.#handleNotification(notification, subscriptionId);
          },
        });
        this.#registeredChannelCallbacks.add(channel);
      } catch {
        // Channel callbacks are optional; ws subscription still works without them.
      }
    }
  }

  #unregisterChannelCallback(channel: string): void {
    if (!this.#registeredChannelCallbacks.has(channel)) {
      return;
    }

    try {
      this.#messenger.call(
        'BackendWebSocketService:removeChannelCallback',
        channel,
      );
    } catch {
      // Best-effort cleanup when the channel callback was never registered.
    }

    this.#registeredChannelCallbacks.delete(channel);
  }

  #removeChannelCallbacks(channels: string[]): void {
    for (const channel of channels) {
      this.#unregisterChannelCallback(channel);
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    if (this.#chainsRefreshTimer) {
      clearInterval(this.#chainsRefreshTimer);
      this.#chainsRefreshTimer = null;
    }

    const subscriptionIds = [
      ...new Set([
        ...this.#wsSubscriptions.keys(),
        ...this.activeSubscriptions.keys(),
      ]),
    ];
    for (const subscriptionId of subscriptionIds) {
      this.#teardownSubscription(subscriptionId).catch(() => undefined);
    }

    // Clean up base class subscriptions (no-op if already torn down)
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
