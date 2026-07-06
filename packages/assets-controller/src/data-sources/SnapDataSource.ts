import type { Balance, CaipAssetType } from '@metamask/keyring-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type {
  Caveat,
  GetPermissions,
  PermissionConstraint,
  PermissionControllerStateChange,
  SubjectPermissions,
} from '@metamask/permission-controller';
import type {
  SnapControllerGetRunnableSnapsAction,
  SnapControllerHandleRequestAction,
  SnapControllerSnapInstalledEvent,
} from '@metamask/snaps-controllers';
import type { Snap, SnapId } from '@metamask/snaps-sdk';
import { HandlerType, SnapCaveatType } from '@metamask/snaps-utils';
import type { CaipChainId, Json, JsonRpcRequest } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';

import type { AssetsControllerMessenger } from '../AssetsController';
import { projectLogger, createModuleLogger } from '../logger';
import type {
  AssetBalance,
  ChainId,
  Caip19AssetId,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types';
import {
  fetchAccountAssetInfoFromSnap,
  isAccountAssetInfoEnrichmentAvailable,
  ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE,
} from '../utils/account-asset-enrichment';
import { AbstractDataSource } from './AbstractDataSource';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';

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

/** The permission name for snap keyring endowment */
export const KEYRING_PERMISSION = 'endowment:keyring';

/** The permission name for snap assets endowment (contains chainIds) */
export const ASSETS_PERMISSION = 'endowment:assets';

// ============================================================================
// PERMISSION UTILITIES
// ============================================================================

/**
 * Getter function to get the chainIds caveat from a permission.
 *
 * This does basic validation of the caveat, but does not validate the type or
 * value of the namespaces object itself, as this is handled by the
 * `PermissionsController` when the permission is requested.
 *
 * @param permission - The permission to get the `chainIds` caveat from.
 * @returns An array of `chainIds` that the snap supports, or null if none.
 */
export function getChainIdsCaveat(
  permission?: PermissionConstraint,
): ChainId[] | null {
  if (!permission?.caveats) {
    return null;
  }

  const caveat = permission.caveats.find(
    (permCaveat) => permCaveat.type === SnapCaveatType.ChainIds,
  ) as Caveat<string, string[]> | undefined;

  return caveat ? (caveat.value as ChainId[]) : null;
}

/**
 * Extracts the CAIP-2 chain ID from a CAIP-19 asset ID.
 * e.g., "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501" -> "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
 * Uses @metamask/utils parseCaipAssetType for CAIP parsing.
 *
 * @param assetId - The CAIP-19 asset ID to extract chain from.
 * @returns The CAIP-2 chain ID portion of the asset ID.
 */
export function extractChainFromAssetId(assetId: string): ChainId {
  const parsed = parseCaipAssetType(assetId as CaipAssetType);
  return parsed.chainId;
}

// ============================================================================
// STATE
// ============================================================================

/**
 * State for the SnapDataSource.
 * Uses dynamic snap discovery - chains are populated from PermissionController.
 */
export type SnapDataSourceState = {
  /**
   * Mapping of chain IDs to snap IDs that support them.
   * Used to filter which accounts to process for a given chain request.
   */
  chainToSnap: Record<ChainId, string>;
} & DataSourceState;

const defaultSnapState: SnapDataSourceState = {
  activeChains: [],
  chainToSnap: {},
};

// ============================================================================
// MESSENGER TYPES
// ============================================================================

/**
 * Allowed events that SnapDataSource can subscribe to.
 */
export type SnapDataSourceAllowedEvents =
  | AccountsControllerAccountBalancesUpdatedEvent
  | PermissionControllerStateChange
  | SnapControllerSnapInstalledEvent;

export type SnapDataSourceAllowedActions =
  | SnapControllerGetRunnableSnapsAction
  | SnapControllerHandleRequestAction
  | GetPermissions;

// ============================================================================
// OPTIONS
// ============================================================================

export type SnapDataSourceOptions = {
  /** The AssetsController messenger (shared by all data sources). */
  messenger: AssetsControllerMessenger;
  /** Called when this data source's active chains change. Pass dataSourceName so the controller knows the source. */
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
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
 * @example
 * ```typescript
 * const snapDataSource = new SnapDataSource({
 *   messenger,
 *   onActiveChainsUpdated: (chains) => { /* ... *\/ },
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
  readonly #messenger: AssetsControllerMessenger;

  readonly #onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  /** Bound handler for snap keyring balance updates, stored for cleanup */
  readonly #handleSnapBalancesUpdatedBound: (
    payload: AccountBalancesUpdatedEventPayload,
  ) => Promise<void>;

  readonly #handlePermissionStateChangeBound: () => void;

  /** Cache of KeyringClient instances per snap ID to avoid re-instantiation */
  readonly #keyringClientCache: Map<string, KeyringClient> = new Map();

  constructor(options: SnapDataSourceOptions) {
    super(SNAP_DATA_SOURCE_NAME, {
      ...defaultSnapState,
      ...options.state,
    });

    this.#messenger = options.messenger;
    this.#onActiveChainsUpdated = options.onActiveChainsUpdated;

    // Bind handlers for cleanup in destroy()
    this.#handleSnapBalancesUpdatedBound =
      this.#handleSnapBalancesUpdated.bind(this);
    this.#handlePermissionStateChangeBound =
      this.#discoverKeyringSnaps.bind(this);

    this.#subscribeToEvents();

    // Discover keyring-capable snaps and populate activeChains dynamically
    this.#discoverKeyringSnaps();
  }

  /**
   * Subscribe to all events needed by SnapDataSource.
   * Groups snap keyring events and permission change events.
   */
  #subscribeToEvents(): void {
    // Subscribe to snap keyring events and permission changes (not in AssetsControllerEvents).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger = this.#messenger as any;
    messenger.subscribe(
      'AccountsController:accountBalancesUpdated',
      this.#handleSnapBalancesUpdatedBound,
    );
    messenger.subscribe(
      'PermissionController:stateChange',
      this.#handlePermissionStateChangeBound,
    );
    // Rediscover keyring snaps when any snap gets installed
    messenger.subscribe('SnapController:snapInstalled', () => {
      this.#discoverKeyringSnaps();
    });
  }

  /**
   * Handle snap balance updates from the keyring.
   * Transforms the payload and publishes to AssetsController.
   *
   * @param payload - The balance update payload from AccountsController.
   */
  async #handleSnapBalancesUpdated(
    payload: AccountBalancesUpdatedEventPayload,
  ): Promise<void> {
    // Transform the snap keyring payload to DataResponse format
    let assetsBalance: NonNullable<DataResponse['assetsBalance']> | undefined;

    for (const [accountId, assets] of Object.entries(payload.balances)) {
      let accountAssets: Record<Caip19AssetId, AssetBalance> | undefined;

      for (const [assetId, balance] of Object.entries(assets)) {
        let chainId: ChainId;
        try {
          chainId = extractChainFromAssetId(assetId);
        } catch (error) {
          log('Skipping snap balance for malformed asset ID', {
            assetId,
            error,
          });
          continue;
        }
        if (this.#isChainSupportedBySnap(chainId)) {
          accountAssets ??= {};
          accountAssets[assetId as Caip19AssetId] = {
            amount: balance.amount,
          };
        }
      }

      if (accountAssets) {
        assetsBalance ??= {};
        assetsBalance[accountId] = accountAssets;
      }
    }

    // Only report if we have snap-related updates
    if (!assetsBalance) {
      return;
    }

    // Enrich account-asset info inline for eligible chains (e.g. Stellar trustlines),
    // same pattern as fetch(). This ensures push updates carry fresh enrichment.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleSnapRequest = (params: any): Promise<unknown> =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.#messenger as any).call(
        'SnapController:handleRequest',
        params,
      ) as Promise<unknown>;

    for (const [accountId, accountAssets] of Object.entries(assetsBalance)) {
      const allAssetIds = Object.keys(accountAssets) as Caip19AssetId[];
      const byChain = new Map<CaipChainId, Caip19AssetId[]>();
      for (const assetId of allAssetIds) {
        const slash = assetId.indexOf('/');
        if (slash < 0) {
          continue;
        }
        const chainId = assetId.slice(0, slash) as CaipChainId;
        if (!isAccountAssetInfoEnrichmentAvailable(chainId)) {
          continue;
        }
        const list = byChain.get(chainId) ?? [];
        list.push(assetId);
        byChain.set(chainId, list);
      }

      for (const [chainId, assetIds] of byChain) {
        const snapId = this.getSnapIdForChain(chainId);
        if (!snapId) {
          continue;
        }
        for (
          let i = 0;
          i < assetIds.length;
          i += ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE
        ) {
          const batch = assetIds.slice(
            i,
            i + ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE,
          );

          const info = await fetchAccountAssetInfoFromSnap(handleSnapRequest, {
            accountId,
            snapId,
            chainId,
            assets: batch,
          });
          if (info) {
            for (const [assetId, assetInfo] of Object.entries(info)) {
              const row = (
                accountAssets as Record<string, AssetBalance | undefined>
              )[assetId];
              if (row) {
                (accountAssets as Record<string, unknown>)[assetId] = {
                  ...row,
                  accountAssetInfo: assetInfo,
                };
              }
            }
          }
        }
      }
    }

    const response: DataResponse = { assetsBalance, updateMode: 'merge' };
    for (const subscription of this.activeSubscriptions.values()) {
      subscription.onAssetsUpdate(response)?.catch(console.error);
    }
  }

  /**
   * Check if a chain ID is supported by any discovered snap.
   *
   * @param chainId - The CAIP-2 chain ID to check.
   * @returns True if we have a snap that supports this chain.
   */
  #isChainSupportedBySnap(chainId: ChainId): boolean {
    return this.state.activeChains.includes(chainId);
  }

  // ============================================================================
  // SNAP DISCOVERY (Dynamic via PermissionController)
  // ============================================================================

  /**
   * Get all runnable snaps from SnapController.
   * Runnable snaps are enabled and not blocked.
   *
   * @returns Array of runnable snaps.
   */
  #getRunnableSnaps(): Snap[] {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.#messenger as any).call(
        'SnapController:getRunnableSnaps',
      ) as Snap[];
    } catch (error) {
      log('Failed to get runnable snaps', error);
      return [];
    }
  }

  /**
   * Get permissions for a snap from PermissionController.
   *
   * @param snapId - The snap ID to get permissions for.
   * @returns The snap's permissions, or undefined if none.
   */
  #getSnapPermissions(
    snapId: string,
  ): SubjectPermissions<PermissionConstraint> | undefined {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (this.#messenger as any).call(
        'PermissionController:getPermissions',
        snapId,
      ) as SubjectPermissions<PermissionConstraint>;
    } catch (error) {
      log('Failed to get permissions for snap', { snapId, error });
      return undefined;
    }
  }

  /**
   * Discover all snaps with keyring capabilities and their supported chains.
   * Uses PermissionController to find snaps with endowment:keyring permission.
   * Updates chainToSnap mapping and activeChains.
   *
   * Called on initialization and whenever PermissionController state changes
   * (e.g., new snaps installed, permissions granted/revoked).
   *
   * @remarks
   * **Known limitation:** If discovery fails (e.g., SnapController not ready),
   * the data source continues with empty chainToSnap. This means no snap
   * chains will be supported until a re-discovery is triggered by a permission
   * change. Callers should be aware that initialization may complete with no
   * active chains.
   */
  #discoverKeyringSnaps(): void {
    try {
      const runnableSnaps = this.#getRunnableSnaps();
      const chainToSnap: Record<ChainId, string> = {};
      const supportedChains: ChainId[] = [];

      for (const snap of runnableSnaps) {
        const permissions = this.#getSnapPermissions(snap.id);
        // Must have endowment:keyring permission to be a keyring snap
        if (!permissions?.[KEYRING_PERMISSION]) {
          continue;
        }

        // Get chainIds caveat from the assets permission (not keyring permission)
        // The chainIds are stored in endowment:assets
        const assetsPermission = permissions[ASSETS_PERMISSION];
        const chainIds = getChainIdsCaveat(assetsPermission);

        // Map each chain to this snap (first snap wins if multiple support same chain)
        if (chainIds) {
          for (const chainId of chainIds) {
            if (!(chainId in chainToSnap)) {
              chainToSnap[chainId] = snap.id;
              supportedChains.push(chainId);
            }
          }
        }
      }

      // Update chainToSnap mapping
      this.state.chainToSnap = chainToSnap;

      // Notify if chains changed
      try {
        const previous = [...this.state.activeChains];
        this.updateActiveChains(supportedChains, (updatedChains) => {
          this.#onActiveChainsUpdated(this.getName(), updatedChains, previous);
        });
      } catch {
        // AssetsController not ready yet - expected during initialization
      }
    } catch (error) {
      log('Keyring snap discovery failed', { error });
      this.state.chainToSnap = {};
      try {
        const previous = [...this.state.activeChains];
        this.updateActiveChains([], (updatedChains) => {
          this.#onActiveChainsUpdated(this.getName(), updatedChains, previous);
        });
      } catch {
        // AssetsController not ready yet - expected during initialization
      }
    }
  }

  // ============================================================================
  // FETCH
  // ============================================================================

  async fetch(request: DataRequest): Promise<DataResponse> {
    // Guard against undefined request
    // Note: chainIds filtering is done by middleware/subscribe before calling fetch
    if (!request?.chainIds?.length) {
      return {};
    }
    if (!request?.accountsWithSupportedChains?.length) {
      return { assetsBalance: {}, assetsInfo: {}, updateMode: 'merge' };
    }

    const results: DataResponse = {
      assetsBalance: {},
      assetsInfo: {},
      updateMode: 'merge',
    };

    // Fetch balances for each account using its snap ID from metadata
    for (const { account } of request.accountsWithSupportedChains) {
      // Skip accounts without snap metadata (non-snap accounts)
      const snapId = account.metadata.snap?.id;
      if (!snapId) {
        continue;
      }

      // Skip accounts whose snap doesn't support any of the requested chains
      const snapSupportsRequestedChains = request.chainIds.some(
        (chainId) => this.state.chainToSnap[chainId] === snapId,
      );
      if (!snapSupportsRequestedChains) {
        continue;
      }

      const accountId = account.id;
      try {
        const client = this.#getKeyringClient(snapId);

        // Step 1: Get the list of assets for this account
        const accountAssets = await client.listAccountAssets(accountId);

        // If no assets, skip to next account
        if (!accountAssets || accountAssets.length === 0) {
          continue;
        }

        // Step 2: Get balances for those specific assets
        const balances: Record<CaipAssetType, Balance> =
          await client.getAccountBalances(
            accountId,
            accountAssets as CaipAssetType[],
          );

        // Transform keyring response to DataResponse format
        if (balances && typeof balances === 'object' && results.assetsBalance) {
          for (const [assetId, balance] of Object.entries(balances)) {
            results.assetsBalance[accountId] ??= {};
            const accountBalances = results.assetsBalance[accountId];
            if (accountBalances) {
              (accountBalances as Record<string, unknown>)[assetId] = {
                amount: balance.amount,
              };
            }
          }
        }
      } catch {
        // Expected when account doesn't belong to this snap
      }
    }

    // Step 3: Enrich account-asset info for assets on eligible chains (e.g. Stellar trustlines)
    for (const { account } of request.accountsWithSupportedChains) {
      const accountId = account.id;
      const accountBalancesAfterFetch = results.assetsBalance?.[accountId];
      if (!accountBalancesAfterFetch) {
        continue;
      }

      const allAssetIds = Object.keys(
        accountBalancesAfterFetch,
      ) as Caip19AssetId[];
      const byChain = new Map<CaipChainId, Caip19AssetId[]>();
      for (const assetId of allAssetIds) {
        const slash = assetId.indexOf('/');
        if (slash < 0) {
          continue;
        }
        const chainId = assetId.slice(0, slash) as CaipChainId;
        if (!isAccountAssetInfoEnrichmentAvailable(chainId)) {
          continue;
        }
        const list = byChain.get(chainId) ?? [];
        list.push(assetId);
        byChain.set(chainId, list);
      }

      const snapId = account.metadata.snap?.id;
      if (!snapId) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleSnapRequest = (params: any): Promise<unknown> =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.#messenger as any).call(
          'SnapController:handleRequest',
          params,
        ) as Promise<unknown>;

      for (const [chainId, assetIds] of byChain) {
        for (
          let i = 0;
          i < assetIds.length;
          i += ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE
        ) {
          const batch = assetIds.slice(
            i,
            i + ACCOUNT_ASSET_INFO_SNAP_BATCH_SIZE,
          );

          const info = await fetchAccountAssetInfoFromSnap(handleSnapRequest, {
            accountId,
            snapId: snapId as SnapId,
            chainId,
            assets: batch,
          });
          if (info) {
            for (const [assetId, assetInfo] of Object.entries(info)) {
              const row = (
                accountBalancesAfterFetch as Record<
                  string,
                  AssetBalance | undefined
                >
              )[assetId];
              if (row) {
                (accountBalancesAfterFetch as Record<string, unknown>)[
                  assetId
                ] = {
                  ...row,
                  accountAssetInfo: assetInfo,
                };
              }
            }
          }
        }
      }
    }

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
        if (response.assetsInfo) {
          context.response.assetsInfo = {
            ...context.response.assetsInfo,
            ...response.assetsInfo,
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

    // Filter to chains we have a snap for
    const supportedChains = request.chainIds.filter((chainId) =>
      this.#isChainSupportedBySnap(chainId),
    );

    if (supportedChains.length === 0) {
      return;
    }

    if (isUpdate) {
      const existing = this.activeSubscriptions.get(subscriptionId);
      if (existing) {
        existing.chains = supportedChains;
        // Do a fetch to get latest data on subscription update
        this.fetch({
          ...request,
          chainIds: supportedChains,
        })
          .then(async (fetchResponse) => {
            if (Object.keys(fetchResponse.assetsBalance ?? {}).length > 0) {
              await existing.onAssetsUpdate(fetchResponse);
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
      chains: supportedChains,
      onAssetsUpdate: subscriptionRequest.onAssetsUpdate,
    });

    // Initial fetch to get current balances
    try {
      const fetchResponse = await this.fetch({
        ...request,
        chainIds: supportedChains,
      });

      const subscription = this.activeSubscriptions.get(subscriptionId);
      if (
        Object.keys(fetchResponse.assetsBalance ?? {}).length > 0 &&
        subscription
      ) {
        await subscription.onAssetsUpdate(fetchResponse);
      }
    } catch (error) {
      log('Initial fetch failed', { subscriptionId, error });
    }
  }

  /**
   * Returns the snap id responsible for a given chain, if any.
   *
   * @param chainId - CAIP-2 chain id.
   * @returns Snap id when a keyring snap supports the chain.
   */
  getSnapIdForChain(chainId: ChainId): SnapId | undefined {
    const snapId = this.state.chainToSnap[chainId];
    return snapId ? (snapId as SnapId) : undefined;
  }

  // ============================================================================
  // KEYRING CLIENT
  // ============================================================================

  /**
   * Gets a `KeyringClient` for a Snap.
   * Caches clients per snap ID to avoid re-instantiation across multiple calls.
   *
   * @param snapId - ID of the Snap to get the client for.
   * @returns A `KeyringClient` for the Snap.
   */
  #getKeyringClient(snapId: string): KeyringClient {
    const cachedClient = this.#keyringClientCache.get(snapId);
    if (cachedClient) {
      return cachedClient;
    }

    const client = new KeyringClient({
      send: async (request: JsonRpcRequest): Promise<Json> =>
        await (
          this.#messenger as unknown as {
            call: (action: string, ...args: unknown[]) => Promise<Json> | Json;
          }
        ).call('SnapController:handleRequest', {
          snapId: snapId as SnapId,
          origin: 'metamask',
          handler: HandlerType.OnKeyringRequest,
          request,
        }),
    });

    this.#keyringClientCache.set(snapId, client);
    return client;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger = this.#messenger as any;

    // Unsubscribe from snap keyring events
    try {
      messenger.unsubscribe(
        'AccountsController:accountBalancesUpdated',
        this.#handleSnapBalancesUpdatedBound,
      );
    } catch (error) {
      log('Failed to unsubscribe from snap keyring events', { error });
    }

    // Unsubscribe from permission changes
    try {
      messenger.unsubscribe(
        'PermissionController:stateChange',
        this.#handlePermissionStateChangeBound,
      );
    } catch (error) {
      log('Failed to unsubscribe from permission changes', { error });
    }

    // Clean up active subscriptions
    for (const [subscriptionId] of this.activeSubscriptions) {
      this.unsubscribe(subscriptionId).catch(() => {
        // Ignore cleanup errors
      });
    }

    // Clear keyring client cache
    this.#keyringClientCache.clear();
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
