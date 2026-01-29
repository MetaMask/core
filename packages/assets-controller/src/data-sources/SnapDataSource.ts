import type { InternalAccount } from '@metamask/keyring-internal-api';
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
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';

// ============================================================================
// SNAP KEYRING EVENT TYPES
// ============================================================================

/**
 * Payload for AccountsController:accountBalancesUpdated event.
 * Re-published from SnapKeyring:accountBalancesUpdated.
 */
export type AccountBalancesUpdatedEventPayload = {
  balances: {
    [accountId: string]: {
      [assetId: string]: {
        amount: string;
        unit: string;
      };
    };
  };
};

/**
 * Event from AccountsController when snap balances are updated.
 */
export type AccountsControllerAccountBalancesUpdatedEvent = {
  type: 'AccountsController:accountBalancesUpdated';
  payload: [AccountBalancesUpdatedEventPayload];
};

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

export type SnapInfo = {
  snapId: string;
  chainPrefix: string;
  pollInterval: number;
  version: string | null;
  available: boolean;
};

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
 *
 * @param chainId - The CAIP-2 chain ID to check.
 * @returns The snap type for the chain, or null if not supported.
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
 *
 * @param chainId - The CAIP-2 chain ID to check.
 * @returns True if the chain is supported by a snap.
 */
export function isSnapSupportedChain(chainId: ChainId): boolean {
  return getSnapTypeForChain(chainId) !== null;
}

/**
 * Extract chain ID from a CAIP-19 asset ID.
 * e.g., "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501" -> "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
 *
 * @param assetId - The CAIP-19 asset ID to extract chain from.
 * @returns The CAIP-2 chain ID portion of the asset ID.
 */
export function extractChainFromAssetId(assetId: string): ChainId {
  const parts = assetId.split('/');
  return parts[0] as ChainId;
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

export type SnapDataSourceState = {
  /** Snap availability and versions */
  snaps: Record<SnapType, { version: string | null; available: boolean }>;
} & DataSourceState;

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

export type SnapDataSourceGetAssetsMiddlewareAction = {
  type: 'SnapDataSource:getAssetsMiddleware';
  handler: () => Middleware;
};

export type SnapDataSourceGetActiveChainsAction = {
  type: 'SnapDataSource:getActiveChains';
  handler: () => Promise<ChainId[]>;
};

export type SnapDataSourceFetchAction = {
  type: 'SnapDataSource:fetch';
  handler: (request: DataRequest) => Promise<DataResponse>;
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
  | SnapDataSourceGetAssetsMiddlewareAction
  | SnapDataSourceGetActiveChainsAction
  | SnapDataSourceFetchAction
  | SnapDataSourceSubscribeAction
  | SnapDataSourceUnsubscribeAction;

export type SnapDataSourceActiveChainsChangedEvent = {
  type: 'SnapDataSource:activeChainsUpdated';
  payload: [ChainId[]];
};

export type SnapDataSourceAssetsUpdatedEvent = {
  type: 'SnapDataSource:assetsUpdated';
  payload: [DataResponse, string | undefined];
};

export type SnapDataSourceEvents =
  | SnapDataSourceActiveChainsChangedEvent
  | SnapDataSourceAssetsUpdatedEvent;

/**
 * Allowed events that SnapDataSource can subscribe to.
 */
export type SnapDataSourceAllowedEvents =
  AccountsControllerAccountBalancesUpdatedEvent;

// Actions to report to AssetsController
type AssetsControllerActiveChainsUpdateAction = {
  type: 'AssetsController:activeChainsUpdate';
  handler: (dataSourceId: string, activeChains: ChainId[]) => void;
};

type AssetsControllerAssetsUpdateAction = {
  type: 'AssetsController:assetsUpdate';
  handler: (response: DataResponse, sourceId: string) => Promise<void>;
};

export type SnapDataSourceAllowedActions =
  | AssetsControllerActiveChainsUpdateAction
  | AssetsControllerAssetsUpdateAction;

export type SnapDataSourceMessenger = Messenger<
  typeof SNAP_DATA_SOURCE_NAME,
  SnapDataSourceActions | SnapDataSourceAllowedActions,
  SnapDataSourceEvents | SnapDataSourceAllowedEvents
>;

// ============================================================================
// SNAP PROVIDER INTERFACE
// ============================================================================

export type SnapProvider = {
  request<ResponseType>(args: {
    method: string;
    params?: unknown;
  }): Promise<ResponseType>;
};

// ============================================================================
// OPTIONS
// ============================================================================

export type SnapDataSourceOptions = {
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
};

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

    this.#registerActionHandlers();
    this.#subscribeToSnapKeyringEvents();

    // Check availability for all snaps on initialization
    this.#checkAllSnapsAvailability().catch(() => {
      // Silently ignore availability check failures on init
    });
  }

  /**
   * Subscribe to snap keyring events for real-time balance updates.
   * The snaps emit AccountBalancesUpdated events when balances change,
   * which are re-published by AccountsController.
   */
  #subscribeToSnapKeyringEvents(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger = this.#messenger as any;

    try {
      messenger.subscribe(
        'AccountsController:accountBalancesUpdated',
        (payload: AccountBalancesUpdatedEventPayload) => {
          this.#handleSnapBalancesUpdated(payload);
        },
      );
    } catch (error) {
      log('Failed to subscribe to snap keyring events', { error });
    }
  }

  /**
   * Handle snap balance updates from the keyring.
   * Transforms the payload and publishes to AssetsController.
   *
   * @param payload - The balance update payload from AccountsController.
   */
  #handleSnapBalancesUpdated(
    payload: AccountBalancesUpdatedEventPayload,
  ): void {
    // Transform the snap keyring payload to DataResponse format
    const response: DataResponse = {
      assetsBalance: {},
    };

    for (const [accountId, assets] of Object.entries(payload.balances)) {
      if (response.assetsBalance) {
        response.assetsBalance[accountId] = {};

        for (const [assetId, balance] of Object.entries(assets)) {
          // Only include snap-supported assets (solana, bitcoin, tron)
          if (isSnapSupportedChain(extractChainFromAssetId(assetId))) {
            response.assetsBalance[accountId][assetId as Caip19AssetId] = {
              amount: balance.amount,
            };
          }
        }

        // Remove account if no snap assets
        if (Object.keys(response.assetsBalance[accountId]).length === 0) {
          delete response.assetsBalance[accountId];
        }
      }
    }

    // Only report if we have snap-related updates
    if (Object.keys(response.assetsBalance ?? {}).length > 0) {
      this.#messenger
        .call('AssetsController:assetsUpdate', response, SNAP_DATA_SOURCE_NAME)
        .catch(console.error);
    }
  }

  #registerActionHandlers(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger = this.#messenger as any;

    messenger.registerActionHandler(
      'SnapDataSource:getAssetsMiddleware',
      () => this.assetsMiddleware,
    );

    messenger.registerActionHandler(
      'SnapDataSource:getActiveChains',
      async () => this.getActiveChains(),
    );

    messenger.registerActionHandler(
      'SnapDataSource:fetch',
      async (request: DataRequest) => this.fetch(request),
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
   *
   * @returns A map of snap IDs to their versions.
   */
  async #getInstalledSnaps(): Promise<Record<string, { version: string }>> {
    try {
      const snaps = await this.#snapProvider.request<
        Record<string, { version: string }>
      >({
        method: 'wallet_getSnaps',
        params: {},
      });

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
    try {
      const snaps = await this.#getInstalledSnaps();
      const snap = snaps[config.snapId];

      if (snap) {
        // Snap is now available - update state
        this.state.snaps[snapType] = {
          version: snap.version,
          available: true,
        };
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async #checkAllSnapsAvailability(): Promise<void> {
    try {
      const snaps = await this.#getInstalledSnaps();

      for (const [snapType, config] of Object.entries(SNAP_REGISTRY)) {
        const snap = snaps[config.snapId];

        if (snap) {
          this.state.snaps[snapType as SnapType] = {
            version: snap.version,
            available: true,
          };
        } else {
          this.state.snaps[snapType as SnapType] = {
            version: null,
            available: false,
          };
        }
      }
    } catch {
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
   *
   * @returns Record of snap info keyed by snap type.
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
   *
   * @param snapType - The snap type to check (solana, bitcoin, tron).
   * @returns True if the snap is available.
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
      (chain) => !this.state.activeChains.includes(chain),
    );

    if (newChains.length > 0) {
      const updated = [...this.state.activeChains, ...newChains];
      this.updateActiveChains(updated, (updatedChains) =>
        this.#messenger.call(
          'AssetsController:activeChainsUpdate',
          SNAP_DATA_SOURCE_NAME,
          updatedChains,
        ),
      );
    }
  }

  removeNetworks(chainIds: ChainId[]): void {
    const chainSet = new Set(chainIds);
    const updated = this.state.activeChains.filter(
      (chain) => !chainSet.has(chain),
    );
    if (updated.length !== this.state.activeChains.length) {
      this.updateActiveChains(updated, (updatedChains) =>
        this.#messenger.call(
          'AssetsController:activeChainsUpdate',
          SNAP_DATA_SOURCE_NAME,
          updatedChains,
        ),
      );
    }
  }

  // ============================================================================
  // ACCOUNT SCOPE HELPERS
  // ============================================================================

  /**
   * Check if an account supports a specific chain based on its scopes.
   * For snap chains (Solana, Bitcoin, Tron), we check for the appropriate namespace.
   *
   * @param account - The account to check
   * @param chainId - The chain ID to check (e.g., "solana:...", "bip122:...", "tron:...")
   * @returns True if the account supports the chain
   */
  #accountSupportsChain(account: InternalAccount, chainId: ChainId): boolean {
    const scopes = account.scopes ?? [];

    // If no scopes defined, assume it supports the chain (backward compatibility)
    if (scopes.length === 0) {
      return true;
    }

    // Extract namespace and reference from chainId
    const [chainNamespace, chainReference] = chainId.split(':');

    for (const scope of scopes) {
      const [scopeNamespace, scopeReference] = (scope as string).split(':');

      // Check if namespaces match
      if (scopeNamespace !== chainNamespace) {
        continue;
      }

      // Wildcard scope (e.g., "solana:0" means all chains in that namespace)
      if (scopeReference === '0') {
        return true;
      }

      // Exact match check
      if (scopeReference === chainReference) {
        return true;
      }
    }

    return false;
  }

  // ============================================================================
  // FETCH - Routes to appropriate snap(s)
  // ============================================================================

  async fetch(request: DataRequest): Promise<DataResponse> {
    // Guard against undefined request or chainIds
    if (!request?.chainIds) {
      return {};
    }

    // Filter to only snap-supported chains
    const snapChains = request.chainIds.filter(isSnapSupportedChain);

    if (snapChains.length === 0) {
      return {};
    }

    // Group chains by snap type
    const chainsBySnap = this.#groupChainsBySnap(snapChains);

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
      if (result.errors) {
        mergedResponse.errors = { ...mergedResponse.errors, ...result.errors };
      }
    }

    return mergedResponse;
  }

  #groupChainsBySnap(
    chainIds: ChainId[],
  ): Partial<Record<SnapType, ChainId[]>> {
    const groups: Partial<Record<SnapType, ChainId[]>> = {};

    for (const chainId of chainIds) {
      const snapType = getSnapTypeForChain(chainId);
      if (snapType) {
        groups[snapType] ??= [];
        const snapChains = groups[snapType];
        if (snapChains) {
          snapChains.push(chainId);
        }
      }
    }

    return groups;
  }

  async #fetchFromSnap(
    snapType: SnapType,
    request: DataRequest,
  ): Promise<DataResponse> {
    const config = SNAP_REGISTRY[snapType];

    // Check snap availability on-demand - handles timing issues where snap
    // wasn't ready during initialization but is now available
    const isAvailable = await this.#checkSnapAvailabilityOnDemand(snapType);
    if (!isAvailable) {
      log(`${snapType} snap not available, skipping fetch`);
      // Return errors for these chains so they can fallback to other data sources
      const errors: Record<ChainId, string> = {};
      for (const chainId of request.chainIds) {
        errors[chainId] = `${snapType} snap not available`;
      }
      return { errors };
    }

    const results: DataResponse = {
      assetsBalance: {},
      assetsMetadata: {},
    };

    // Fetch balances for each account using Keyring API
    // Important: Must first get account assets, then request balances for those specific assets
    for (const account of request.accounts) {
      // Filter to only process accounts that support the chains being fetched
      const accountSupportedChains = request.chainIds.filter((chainId) =>
        this.#accountSupportsChain(account, chainId),
      );

      // Skip accounts that don't support any of the requested chains
      if (accountSupportedChains.length === 0) {
        continue;
      }

      const accountId = account.id;
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
          Record<string, { amount: string; unit: string; rawAmount?: string }>
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
        if (balances && typeof balances === 'object' && results.assetsBalance) {
          const balanceEntries = Object.entries(balances);
          log(
            `${snapType} snap processing ${balanceEntries.length} balances for account ${accountId}`,
          );

          for (const [assetId, balance] of balanceEntries) {
            // Initialize account balances if not exists
            results.assetsBalance[accountId] ??= {};
            // Store raw balance for this asset
            // Use rawAmount if available (preferred - smallest unit), fall back to amount
            // Note: Snaps should return rawAmount in smallest unit (satoshis, lamports, etc.)
            const accountBalances = results.assetsBalance[accountId];
            if (accountBalances) {
              (accountBalances as Record<string, unknown>)[assetId] = {
                amount: balance.rawAmount ?? balance.amount,
              };
            }
          }
        } else if (!balances) {
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
  // MIDDLEWARE
  // ============================================================================

  /**
   * Get the middleware for fetching balances via Snaps.
   * This middleware:
   * - Supports multiple accounts in a single request
   * - Filters request to only chains this data source supports
   * - Fetches balances for those chains for all accounts
   * - Merges response into context
   * - Removes handled chains from request for next middleware
   *
   * @returns The middleware function for the assets pipeline.
   */
  get assetsMiddleware(): Middleware {
    return async (context, next) => {
      const { request } = context;

      // Filter to chains this data source supports
      const supportedChains = request.chainIds.filter((chainId) =>
        this.state.activeChains.includes(chainId),
      );

      // If no supported chains, skip and pass to next middleware
      if (supportedChains.length === 0) {
        return next(context);
      }

      let successfullyHandledChains: ChainId[] = [];

      try {
        // Fetch for supported chains
        const response = await this.fetch({
          ...request,
          chainIds: supportedChains,
        });

        // Merge response into context
        if (response.assetsBalance) {
          context.response.assetsBalance ??= {};
          for (const [accountId, accountBalances] of Object.entries(
            response.assetsBalance,
          )) {
            context.response.assetsBalance[accountId] = {
              ...context.response.assetsBalance[accountId],
              ...accountBalances,
            };
          }
        }
        if (response.assetsMetadata) {
          context.response.assetsMetadata = {
            ...context.response.assetsMetadata,
            ...response.assetsMetadata,
          };
        }
        if (response.assetsPrice) {
          context.response.assetsPrice = {
            ...context.response.assetsPrice,
            ...response.assetsPrice,
          };
        }

        // Determine successfully handled chains (exclude errors)
        const failedChains = new Set(Object.keys(response.errors ?? {}));
        successfullyHandledChains = supportedChains.filter(
          (chainId) => !failedChains.has(chainId),
        );
      } catch (error) {
        log('Middleware fetch failed', { error });
        successfullyHandledChains = [];
      }

      // Prepare context for next middleware
      let nextContext = context;
      if (successfullyHandledChains.length > 0) {
        const remainingChains = request.chainIds.filter(
          (chainId) => !successfullyHandledChains.includes(chainId),
        );
        nextContext = {
          ...context,
          request: {
            ...request,
            chainIds: remainingChains,
          },
        };
      }

      // Call next middleware
      return next(nextContext);
    };
  }

  // ============================================================================
  // SUBSCRIBE - Routes to appropriate snap(s)
  // ============================================================================

  async subscribe(subscriptionRequest: SubscriptionRequest): Promise<void> {
    const { request, subscriptionId, isUpdate } = subscriptionRequest;

    // Guard against undefined request or chainIds
    if (!request?.chainIds) {
      return;
    }

    // Filter to only snap-supported chains
    const snapChains = request.chainIds.filter(isSnapSupportedChain);

    if (snapChains.length === 0) {
      return;
    }

    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.chains = snapChains;
        // Do a fetch to get latest data on subscription update
        this.fetch({
          ...request,
          chainIds: snapChains,
        })
          .then(async (fetchResponse) => {
            if (Object.keys(fetchResponse.assetsBalance ?? {}).length > 0) {
              await this.#messenger.call(
                'AssetsController:assetsUpdate',
                fetchResponse,
                SNAP_DATA_SOURCE_NAME,
              );
            }
            return fetchResponse;
          })
          .catch((error) => {
            log('Subscription update fetch failed', { subscriptionId, error });
          });
        return;
      }
    }

    await this.unsubscribe(subscriptionId);

    // Snaps provide real-time updates via AccountsController:accountBalancesUpdated
    // We only need to track the subscription and do an initial fetch
    // No polling needed - updates come through #handleSnapBalancesUpdated

    this.activeSubscriptions.set(subscriptionId, {
      cleanup: () => {
        // No timer to clear - we use event-based updates
      },
      chains: snapChains,
    });

    // Initial fetch to get current balances
    try {
      const fetchResponse = await this.fetch({
        ...request,
        chainIds: snapChains,
      });

      if (Object.keys(fetchResponse.assetsBalance ?? {}).length > 0) {
        await this.#messenger.call(
          'AssetsController:assetsUpdate',
          fetchResponse,
          SNAP_DATA_SOURCE_NAME,
        );
      }
    } catch (error) {
      log('Initial fetch failed', { subscriptionId, error });
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    for (const [subscriptionId] of this.activeSubscriptions) {
      this.unsubscribe(subscriptionId).catch(() => {
        // Ignore cleanup errors
      });
    }
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
