import type { Messenger } from '@metamask/messenger';

import { projectLogger, createModuleLogger } from '../../logger';
import type { ChainId, DataFetchRequest, DataResponse } from '../types';
import {
  AbstractDataSource,
  type DataSourceState,
  type SubscriptionRequest,
} from './AbstractDataSource';

const log = createModuleLogger(projectLogger, 'SnapDataSource');

// ============================================================================
// CONSTANTS
// ============================================================================

export const SNAP_DATA_SOURCE_NAME = 'SnapDataSource';

// Snap IDs
export const SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap';
export const BITCOIN_SNAP_ID = 'npm:@metamask/bitcoin-wallet-snap';
export const TRON_SNAP_ID = 'npm:@metamask/tron-wallet-snap';

// Chain prefixes for detection
export const SOLANA_CHAIN_PREFIX = 'solana:';
export const BITCOIN_CHAIN_PREFIX = 'bip122:';
export const TRON_CHAIN_PREFIX = 'tron:';

// Default networks
export const SOLANA_MAINNET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
export const SOLANA_DEVNET =
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1' as ChainId;
export const SOLANA_TESTNET =
  'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z' as ChainId;

export const BITCOIN_MAINNET =
  'bip122:000000000019d6689c085ae165831e93' as ChainId;
export const BITCOIN_TESTNET =
  'bip122:000000000933ea01ad0ee984209779ba' as ChainId;

export const TRON_MAINNET = 'tron:728126428' as ChainId;
export const TRON_SHASTA = 'tron:2494104990' as ChainId;
export const TRON_NILE = 'tron:3448148188' as ChainId;
// Hex format alternatives for Tron
export const TRON_MAINNET_HEX = 'tron:0x2b6653dc' as ChainId;
export const TRON_SHASTA_HEX = 'tron:0x94a9059e' as ChainId;
export const TRON_NILE_HEX = 'tron:0xcd8690dc' as ChainId;

// Default poll intervals
export const DEFAULT_SOLANA_POLL_INTERVAL = 30_000; // 30 seconds
export const DEFAULT_BITCOIN_POLL_INTERVAL = 60_000; // 1 minute
export const DEFAULT_TRON_POLL_INTERVAL = 30_000; // 30 seconds
export const DEFAULT_SNAP_POLL_INTERVAL = 30_000; // Default for unknown snaps

// All default networks
export const ALL_DEFAULT_NETWORKS: ChainId[] = [
  SOLANA_MAINNET,
  SOLANA_DEVNET,
  SOLANA_TESTNET,
  BITCOIN_MAINNET,
  BITCOIN_TESTNET,
  TRON_MAINNET,
  TRON_SHASTA,
  TRON_NILE,
  TRON_MAINNET_HEX,
  TRON_SHASTA_HEX,
  TRON_NILE_HEX,
];

// ============================================================================
// SNAP ROUTING
// ============================================================================

export type SnapType = 'solana' | 'bitcoin' | 'tron';

export interface SnapInfo {
  snapId: string;
  chainPrefix: string;
  pollInterval: number;
  version: string | null;
  available: boolean;
}

export const SNAP_REGISTRY: Record<
  SnapType,
  Omit<SnapInfo, 'version' | 'available'>
> = {
  solana: {
    snapId: SOLANA_SNAP_ID,
    chainPrefix: SOLANA_CHAIN_PREFIX,
    pollInterval: DEFAULT_SOLANA_POLL_INTERVAL,
  },
  bitcoin: {
    snapId: BITCOIN_SNAP_ID,
    chainPrefix: BITCOIN_CHAIN_PREFIX,
    pollInterval: DEFAULT_BITCOIN_POLL_INTERVAL,
  },
  tron: {
    snapId: TRON_SNAP_ID,
    chainPrefix: TRON_CHAIN_PREFIX,
    pollInterval: DEFAULT_TRON_POLL_INTERVAL,
  },
};

/**
 * Get the snap type for a chain ID based on its prefix.
 */
export function getSnapTypeForChain(chainId: ChainId): SnapType | null {
  if (chainId.startsWith(SOLANA_CHAIN_PREFIX)) {
    return 'solana';
  }
  if (chainId.startsWith(BITCOIN_CHAIN_PREFIX)) {
    return 'bitcoin';
  }
  if (chainId.startsWith(TRON_CHAIN_PREFIX)) {
    return 'tron';
  }
  return null;
}

/**
 * Check if a chain ID is supported by a snap.
 */
export function isSnapSupportedChain(chainId: ChainId): boolean {
  return getSnapTypeForChain(chainId) !== null;
}

// Helper functions for specific chain types
export function isSolanaChain(chainId: ChainId): boolean {
  return chainId.startsWith(SOLANA_CHAIN_PREFIX);
}

export function isBitcoinChain(chainId: ChainId): boolean {
  return chainId.startsWith(BITCOIN_CHAIN_PREFIX);
}

export function isTronChain(chainId: ChainId): boolean {
  return chainId.startsWith(TRON_CHAIN_PREFIX);
}

// ============================================================================
// STATE
// ============================================================================

export interface SnapDataSourceState extends DataSourceState {
  /** Snap availability and versions */
  snaps: Record<SnapType, { version: string | null; available: boolean }>;
}

const defaultSnapState: SnapDataSourceState = {
  activeChains: ALL_DEFAULT_NETWORKS,
  snaps: {
    solana: { version: null, available: false },
    bitcoin: { version: null, available: false },
    tron: { version: null, available: false },
  },
};

// ============================================================================
// MESSENGER TYPES
// ============================================================================

export type SnapDataSourceGetActiveChainsAction = {
  type: 'SnapDataSource:getActiveChains';
  handler: () => Promise<ChainId[]>;
};

export type SnapDataSourceFetchAction = {
  type: 'SnapDataSource:fetch';
  handler: (request: DataFetchRequest) => Promise<DataResponse>;
};

export type SnapDataSourceSubscribeAction = {
  type: 'SnapDataSource:subscribe';
  handler: (request: SubscriptionRequest) => Promise<void>;
};

export type SnapDataSourceUnsubscribeAction = {
  type: 'SnapDataSource:unsubscribe';
  handler: (subscriptionId: string) => Promise<void>;
};

export type SnapDataSourceActions =
  | SnapDataSourceGetActiveChainsAction
  | SnapDataSourceFetchAction
  | SnapDataSourceSubscribeAction
  | SnapDataSourceUnsubscribeAction;

export type SnapDataSourceActiveChainsChangedEvent = {
  type: 'SnapDataSource:activeChainsChanged';
  payload: [ChainId[]];
};

export type SnapDataSourceAssetsUpdatedEvent = {
  type: 'SnapDataSource:assetsUpdated';
  payload: [DataResponse, string | undefined];
};

export type SnapDataSourceEvents =
  | SnapDataSourceActiveChainsChangedEvent
  | SnapDataSourceAssetsUpdatedEvent;

export type SnapDataSourceMessenger = Messenger<
  typeof SNAP_DATA_SOURCE_NAME,
  SnapDataSourceActions,
  SnapDataSourceEvents
>;

// ============================================================================
// SNAP PROVIDER INTERFACE
// ============================================================================

export interface SnapProvider {
  request<T>(args: { method: string; params?: unknown }): Promise<T>;
}

// ============================================================================
// OPTIONS
// ============================================================================

export interface SnapDataSourceOptions {
  /** Messenger for this data source */
  messenger: SnapDataSourceMessenger;
  /**
   * Snap provider for communicating with snaps.
   */
  snapProvider: SnapProvider;
  /** Configured networks to support (defaults to all snap networks) */
  configuredNetworks?: ChainId[];
  /** Default polling interval in ms for subscriptions */
  pollInterval?: number;
  /** Initial state */
  state?: Partial<SnapDataSourceState>;
}

// ============================================================================
// SNAP DATA SOURCE
// ============================================================================

/**
 * Unified Snap data source that routes requests to the appropriate wallet snap
 * based on the chain ID prefix.
 *
 * Supports:
 * - Solana chains (solana:*) → @metamask/solana-wallet-snap
 * - Bitcoin chains (bip122:*) → @metamask/bitcoin-wallet-snap
 * - Tron chains (tron:*) → @metamask/tron-wallet-snap
 *
 * @example
 * ```typescript
 * const snapDataSource = new SnapDataSource({
 *   messenger,
 *   snapProvider: metamaskProvider,
 * });
 *
 * // Fetch will automatically route to the correct snap
 * await snapDataSource.fetch({
 *   chainIds: ['solana:mainnet', 'bip122:000000000019d6689c085ae165831e93'],
 *   accountIds: ['account1'],
 * });
 * ```
 */
export class SnapDataSource extends AbstractDataSource<
  typeof SNAP_DATA_SOURCE_NAME,
  SnapDataSourceState
> {
  readonly #messenger: SnapDataSourceMessenger;

  readonly #snapProvider: SnapProvider;

  readonly #defaultPollInterval: number;

  constructor(options: SnapDataSourceOptions) {
    const configuredNetworks =
      options.configuredNetworks ?? ALL_DEFAULT_NETWORKS;

    super(SNAP_DATA_SOURCE_NAME, {
      ...defaultSnapState,
      ...options.state,
      activeChains: configuredNetworks,
    });

    this.#messenger = options.messenger;
    this.#snapProvider = options.snapProvider;
    this.#defaultPollInterval =
      options.pollInterval ?? DEFAULT_SNAP_POLL_INTERVAL;

    log('Initializing SnapDataSource', {
      configuredNetworks: configuredNetworks.length,
      defaultPollInterval: this.#defaultPollInterval,
    });

    this.#registerActionHandlers();

    // Check availability for all snaps on initialization
    this.#checkAllSnapsAvailability().catch((error) => {
      log('Failed to check snaps availability on init', error);
    });
  }

  #registerActionHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger = this.#messenger as any;

    messenger.registerActionHandler(
      'SnapDataSource:getActiveChains',
      async () => this.getActiveChains(),
    );

    messenger.registerActionHandler(
      'SnapDataSource:fetch',
      async (request: DataFetchRequest) => this.fetch(request),
    );

    messenger.registerActionHandler(
      'SnapDataSource:subscribe',
      async (request: SubscriptionRequest) => this.subscribe(request),
    );

    messenger.registerActionHandler(
      'SnapDataSource:unsubscribe',
      async (subscriptionId: string) => this.unsubscribe(subscriptionId),
    );
  }

  // ============================================================================
  // SNAP AVAILABILITY
  // ============================================================================

  /**
   * Get all installed snaps from the snap provider.
   * Returns a map of snap IDs to their versions.
   */
  async #getInstalledSnaps(): Promise<Record<string, { version: string }>> {
    try {
      const snaps = await this.#snapProvider.request<
        Record<string, { version: string }>
      >({
        method: 'wallet_getSnaps',
        params: {},
      });

      // Log all installed snaps for debugging
      log('wallet_getSnaps returned', {
        snapIds: Object.keys(snaps),
        snapDetails: Object.entries(snaps).map(([id, data]) => ({
          id,
          version: data.version,
        })),
      });

      // Check which expected snaps are missing
      const expectedSnaps = Object.values(SNAP_REGISTRY).map((s) => s.snapId);
      const missingSnaps = expectedSnaps.filter((id) => !snaps[id]);
      if (missingSnaps.length > 0) {
        log('Missing expected snaps (not installed or disabled/blocked)', {
          missingSnaps,
        });
      }

      return snaps;
    } catch (error) {
      log('Failed to get installed snaps', error);
      return {};
    }
  }

  /**
   * Check availability for a single snap type on-demand.
   * This is called before each fetch to ensure we have the latest availability status.
   *
   * @param snapType - The snap type to check (solana, bitcoin, tron)
   * @returns True if the snap is available, false otherwise
   */
  async #checkSnapAvailabilityOnDemand(snapType: SnapType): Promise<boolean> {
    const config = SNAP_REGISTRY[snapType];
    const currentState = this.state.snaps[snapType];

    // If already marked as available, return true (snap was found previously)
    if (currentState.available) {
      return true;
    }

    // Check if snap is now available (handles timing issues where snap wasn't ready at init)
    log(`On-demand availability check for ${snapType} snap`);

    try {
      const snaps = await this.#getInstalledSnaps();
      const snap = snaps[config.snapId];

      if (snap) {
        // Snap is now available - update state
        this.state.snaps[snapType] = {
          version: snap.version,
          available: true,
        };
        log(`${snapType} snap now available (on-demand check)`, {
          version: snap.version,
        });
        return true;
      }

      log(`${snapType} snap still not available`);
      return false;
    } catch (error) {
      log(`On-demand availability check failed for ${snapType}`, error);
      return false;
    }
  }

  async #checkAllSnapsAvailability(): Promise<void> {
    log('Checking all snaps availability');

    try {
      const snaps = await this.#getInstalledSnaps();

      // Log what snaps were returned
      const installedSnapIds = Object.keys(snaps);
      log('Installed snaps found', {
        count: installedSnapIds.length,
        snapIds: installedSnapIds,
      });

      for (const [snapType, config] of Object.entries(SNAP_REGISTRY)) {
        const snap = snaps[config.snapId];
        log(`Checking ${snapType} snap`, {
          expectedSnapId: config.snapId,
          found: !!snap,
          version: snap?.version,
        });

        if (snap) {
          this.state.snaps[snapType as SnapType] = {
            version: snap.version,
            available: true,
          };
          log(`${snapType} snap available`, { version: snap.version });
        } else {
          this.state.snaps[snapType as SnapType] = {
            version: null,
            available: false,
          };
          log(`${snapType} snap not installed`);
        }
      }
    } catch (error) {
      log('Failed to check snaps availability', error);
      // Mark all snaps as unavailable on error
      for (const snapType of Object.keys(SNAP_REGISTRY)) {
        this.state.snaps[snapType as SnapType] = {
          version: null,
          available: false,
        };
      }
    }
  }

  /**
   * Get info about all snaps.
   */
  getSnapsInfo(): Record<SnapType, SnapInfo> {
    const result: Record<SnapType, SnapInfo> = {} as Record<SnapType, SnapInfo>;

    for (const [snapType, config] of Object.entries(SNAP_REGISTRY)) {
      const state = this.state.snaps[snapType as SnapType];
      result[snapType as SnapType] = {
        ...config,
        version: state.version,
        available: state.available,
      };
    }

    return result;
  }

  /**
   * Check if a specific snap is available.
   */
  isSnapAvailable(snapType: SnapType): boolean {
    return this.state.snaps[snapType]?.available ?? false;
  }

  /**
   * Force refresh snap availability check.
   */
  async refreshSnapsStatus(): Promise<void> {
    await this.#checkAllSnapsAvailability();
  }

  // ============================================================================
  // CHAIN MANAGEMENT
  // ============================================================================

  addNetworks(chainIds: ChainId[]): void {
    const snapChains = chainIds.filter(isSnapSupportedChain);
    const newChains = snapChains.filter(
      (c) => !this.state.activeChains.includes(c),
    );

    if (newChains.length > 0) {
      const updated = [...this.state.activeChains, ...newChains];
      this.updateActiveChains(updated, (c) =>
        this.#messenger.publish('SnapDataSource:activeChainsChanged', c),
      );
      log('Networks added', { newChains, total: updated.length });
    }
  }

  removeNetworks(chainIds: ChainId[]): void {
    const chainSet = new Set(chainIds);
    const updated = this.state.activeChains.filter((c) => !chainSet.has(c));
    if (updated.length !== this.state.activeChains.length) {
      this.updateActiveChains(updated, (c) =>
        this.#messenger.publish('SnapDataSource:activeChainsChanged', c),
      );
      log('Networks removed', {
        removed: chainIds.length,
        remaining: updated.length,
      });
    }
  }

  // ============================================================================
  // FETCH - Routes to appropriate snap(s)
  // ============================================================================

  async fetch(request: DataFetchRequest): Promise<DataResponse> {
    // Guard against undefined request or chainIds
    if (!request?.chainIds) {
      log('Fetch called with undefined request or chainIds', { request });
      return {};
    }

    // Filter to only snap-supported chains
    const snapChains = request.chainIds.filter(isSnapSupportedChain);

    if (snapChains.length === 0) {
      log('No snap-supported chains to fetch');
      return {};
    }

    // Group chains by snap type
    const chainsBySnap = this.#groupChainsBySnap(snapChains);

    log('Fetch requested', {
      accountIds: request.accountIds,
      requestedChains: request.chainIds.length,
      snapChains: snapChains.length,
      snapsToCall: Object.keys(chainsBySnap),
    });

    // Fetch from each snap in parallel
    const results = await Promise.all(
      Object.entries(chainsBySnap).map(async ([snapType, chains]) => {
        return this.#fetchFromSnap(snapType as SnapType, {
          ...request,
          chainIds: chains,
        });
      }),
    );

    // Merge all results
    const mergedResponse: DataResponse = {};

    for (const result of results) {
      if (result.assetsBalance) {
        mergedResponse.assetsBalance = {
          ...mergedResponse.assetsBalance,
          ...result.assetsBalance,
        };
      }
      if (result.assetsMetadata) {
        mergedResponse.assetsMetadata = {
          ...mergedResponse.assetsMetadata,
          ...result.assetsMetadata,
        };
      }
      if (result.assetsPrice) {
        mergedResponse.assetsPrice = {
          ...mergedResponse.assetsPrice,
          ...result.assetsPrice,
        };
      }
    }

    log('Fetch completed', {
      accountCount: Object.keys(mergedResponse.assetsBalance ?? {}).length,
      assetCount: Object.keys(mergedResponse.assetsMetadata ?? {}).length,
    });

    return mergedResponse;
  }

  #groupChainsBySnap(
    chainIds: ChainId[],
  ): Partial<Record<SnapType, ChainId[]>> {
    const groups: Partial<Record<SnapType, ChainId[]>> = {};

    for (const chainId of chainIds) {
      const snapType = getSnapTypeForChain(chainId);
      if (snapType) {
        if (!groups[snapType]) {
          groups[snapType] = [];
        }
        groups[snapType]!.push(chainId);
      }
    }

    return groups;
  }

  async #fetchFromSnap(
    snapType: SnapType,
    request: DataFetchRequest,
  ): Promise<DataResponse> {
    const config = SNAP_REGISTRY[snapType];

    // Check snap availability on-demand - handles timing issues where snap
    // wasn't ready during initialization but is now available
    const isAvailable = await this.#checkSnapAvailabilityOnDemand(snapType);
    if (!isAvailable) {
      log(`${snapType} snap not available, skipping fetch`);
      return {};
    }

    const results: DataResponse = {
      assetsBalance: {},
      assetsMetadata: {},
    };

    // Fetch balances for each account using Keyring API
    // Important: Must first get account assets, then request balances for those specific assets
    for (const accountId of request.accountIds ?? []) {
      try {
        // Step 1: Get the list of assets for this account
        log(`${snapType} snap calling keyring_listAccountAssets`, {
          snapId: config.snapId,
          accountId,
        });

        const accountAssets = await this.#snapProvider.request<string[]>({
          method: 'wallet_invokeSnap',
          params: {
            snapId: config.snapId,
            request: {
              method: 'keyring_listAccountAssets',
              params: {
                id: accountId, // Account UUID
              },
            },
          },
        });

        log(`${snapType} snap keyring_listAccountAssets response`, {
          accountId,
          assetCount: accountAssets?.length ?? 0,
          assets: accountAssets,
        });

        // If no assets, skip to next account
        if (!accountAssets || accountAssets.length === 0) {
          log(
            `${snapType} snap: account has no assets, skipping balance fetch`,
            {
              accountId,
            },
          );
          continue;
        }

        // Step 2: Get balances for those specific assets
        log(`${snapType} snap calling keyring_getAccountBalances`, {
          snapId: config.snapId,
          accountId,
          requestedAssets: accountAssets.length,
        });

        const balances = await this.#snapProvider.request<
          Record<string, { amount: string; unit: string }>
        >({
          method: 'wallet_invokeSnap',
          params: {
            snapId: config.snapId,
            request: {
              method: 'keyring_getAccountBalances',
              params: {
                id: accountId, // Account UUID (the keyring API uses 'id' not 'accountId')
                assets: accountAssets, // Must pass specific asset types from listAccountAssets
              },
            },
          },
        });

        log(`${snapType} snap keyring_getAccountBalances response`, {
          accountId,
          balances,
          balancesType: typeof balances,
          isNull: balances === null,
          isUndefined: balances === undefined,
          assetCount: balances ? Object.keys(balances).length : 0,
        });

        // Transform keyring response to DataResponse format
        // Note: snap may return null/undefined if account doesn't belong to this snap
        if (balances && typeof balances === 'object') {
          const balanceEntries = Object.entries(balances);
          log(
            `${snapType} snap processing ${balanceEntries.length} balances for account ${accountId}`,
          );

          for (const [assetId, balance] of balanceEntries) {
            // Initialize account balances if not exists
            if (!results.assetsBalance![accountId]) {
              results.assetsBalance![accountId] = {};
            }
            // Store balance for this asset - only amount is needed
            // Unit can be derived from the CAIP-19 asset ID
            (results.assetsBalance![accountId] as Record<string, unknown>)[
              assetId
            ] = {
              amount: balance.amount,
            };
          }
        } else {
          log(
            `${snapType} snap returned empty/null for account (account may not belong to this snap)`,
            {
              accountId,
              balances,
            },
          );
        }
      } catch (error) {
        // This is expected when querying a snap with an account it doesn't manage
        log(`${snapType} snap fetch FAILED for account`, {
          accountId,
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
      }
    }

    log(`${snapType} snap fetch completed`, {
      chains: request.chainIds.length,
      accountsWithBalances: Object.keys(results.assetsBalance ?? {}).length,
    });

    return results;
  }

  // ============================================================================
  // SUBSCRIBE - Routes to appropriate snap(s)
  // ============================================================================

  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    // Guard against undefined request or chainIds
    if (!request?.chainIds) {
      log('Subscribe called with undefined request or chainIds', {
        subscriptionRequest,
      });
      return;
    }

    // Filter to only snap-supported chains
    const snapChains = request.chainIds.filter(isSnapSupportedChain);

    if (snapChains.length === 0) {
      log('No snap-supported chains to subscribe');
      return;
    }

    log('Subscribe requested', {
      subscriptionId,
      isUpdate,
      accountIds: request.accountIds,
      snapChains: snapChains.length,
    });

    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.chains = snapChains;
        return;
      }
    }

    await this.unsubscribe(subscriptionId);

    // Use the default poll interval (snaps don't support real subscriptions)
    const pollInterval = request.updateInterval ?? this.#defaultPollInterval;

    const pollFn = async () => {
      try {
        const subscription = this.activeSubscriptions.get(subscriptionId);
        if (!subscription) {
          return;
        }

        const fetchResponse = await this.fetch({
          ...request,
          chainIds: subscription.chains,
        });

        this.#messenger.publish(
          'SnapDataSource:assetsUpdated',
          fetchResponse,
          SNAP_DATA_SOURCE_NAME,
        );
      } catch (error) {
        log('Subscription poll failed', { subscriptionId, error });
      }
    };

    const timer = setInterval(pollFn, pollInterval);

    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        log('Cleaning up subscription', { subscriptionId });
        clearInterval(timer);
      },
      chains: snapChains,
    });

    log('Subscription SUCCESS', {
      subscriptionId,
      chains: snapChains.length,
      pollInterval,
    });

    // Initial fetch
    await pollFn();
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    log('Destroying SnapDataSource');

    for (const [subscriptionId] of this.activeSubscriptions) {
      this.unsubscribe(subscriptionId).catch((error) => {
        log('Error cleaning up subscription', { subscriptionId, error });
      });
    }

    log('SnapDataSource destroyed');
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createSnapDataSource(
  options: SnapDataSourceOptions,
): SnapDataSource {
  return new SnapDataSource(options);
}
