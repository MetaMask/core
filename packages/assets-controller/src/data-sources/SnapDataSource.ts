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
import { parseCaipAssetType } from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import type { AssetsControllerMessenger } from '../AssetsController.js';
import { projectLogger, createModuleLogger } from '../logger.js';
import type {
  AssetBalance,
  AssetsControllerState,
  ChainId,
  Caip19AssetId,
  DataRequest,
  DataResponse,
  Middleware,
} from '../types.js';
import type { GetAssetVisibility } from '../utils/assetVisibility.js';
import { getZeroAssetBalance } from '../utils/getZeroAssetBalance.js';
import { AbstractDataSource } from './AbstractDataSource.js';
import type {
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource.js';

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
        metadata?: Record<string, Json>;
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
  /**
   * Called directly with snap-sourced balance updates (from
   * AccountsController:accountBalancesUpdated), independent of whether the
   * controller currently has an active subscription for the chain.
   */
  onAssetsUpdate: (response: DataResponse) => void | Promise<void>;
  /** Whether authoritative v6 balance snapshots are enabled. */
  isBalanceV6Enabled: () => boolean;
  /** Resolves native, pinned, default, and hidden assets for a request scope. */
  getAssetVisibility: GetAssetVisibility;
  /**
   * Current AssetsController state. Used to keep the last-known amount when
   * a v6 snap snapshot omits a visible asset.
   */
  getAssetsState: () => AssetsControllerState;
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

  readonly #onAssetsUpdate: (response: DataResponse) => void | Promise<void>;

  readonly #isBalanceV6Enabled: () => boolean;

  readonly #getAssetVisibility: GetAssetVisibility;

  readonly #getAssetsState: () => AssetsControllerState;

  /** Bound handler for snap keyring balance updates, stored for cleanup */
  readonly #handleSnapBalancesUpdatedBound: (
    payload: AccountBalancesUpdatedEventPayload,
  ) => void;

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
    this.#onAssetsUpdate = options.onAssetsUpdate;
    this.#isBalanceV6Enabled = options.isBalanceV6Enabled;
    this.#getAssetVisibility = options.getAssetVisibility;
    this.#getAssetsState = options.getAssetsState;

    // Bind handlers for cleanup in destroy()
    this.#handleSnapBalancesUpdatedBound = this.#handleSnapBalancesUpdated.bind(
      this,
    ) as (payload: AccountBalancesUpdatedEventPayload) => void;
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
  #handleSnapBalancesUpdated(
    payload: AccountBalancesUpdatedEventPayload,
  ): void {
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
            ...(balance.metadata ? { metadata: balance.metadata } : {}),
          };
        }
      }

      if (accountAssets) {
        assetsBalance ??= {};
        assetsBalance[accountId] = accountAssets;
      }
    }

    // Only report if we have snap-related updates
    if (assetsBalance) {
      const response: DataResponse = { assetsBalance, updateMode: 'merge' };
      Promise.resolve(this.#onAssetsUpdate(response)).catch(console.error);
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

    if (this.#isBalanceV6Enabled()) {
      return this.#fetchV6(request);
    }

    return this.#fetchV5(request);
  }

  /**
   * v5 fetch. Unchanged from the pre-v6 handler; delete the v6 sibling first
   * if `assetsAccountsApiV6` is rolled back.
   *
   * @param request - The data request.
   * @returns Overlay (`merge`) balances from the snap keyring.
   */
  async #fetchV5(request: DataRequest): Promise<DataResponse> {
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
                ...(balance.metadata ? { metadata: balance.metadata } : {}),
              };
            }
          }
        }
      } catch {
        // Expected when account doesn't belong to this snap
      }
    }

    return results;
  }

  /**
   * v6 fetch: a complete snapshot of the requested account-chain slices.
   * Listed holdings and expected visible assets (native, pin, default
   * tracked) are requested together. Hidden assets are left out entirely.
   * Delete with the rest of the v6 path if `assetsAccountsApiV6` is rolled
   * back.
   *
   * @param request - The data request.
   * @returns Authoritative (`full`) balances for the requested slices.
   */
  async #fetchV6(request: DataRequest): Promise<DataResponse> {
    if (!request?.accountsWithSupportedChains?.length) {
      return { assetsBalance: {}, assetsInfo: {}, updateMode: 'full' };
    }

    const results: DataResponse = {
      assetsBalance: {},
      assetsInfo: {},
      updateMode: 'full',
    };

    // Fetch balances for each account using its snap ID from metadata
    for (const { account } of request.accountsWithSupportedChains) {
      // Skip accounts without snap metadata (non-snap accounts)
      const snapId = account.metadata.snap?.id;
      if (!snapId) {
        continue;
      }

      // Skip accounts whose snap doesn't support any of the requested chains
      const supportedChainIds = request.chainIds.filter(
        (chainId) => this.state.chainToSnap[chainId] === snapId,
      );
      if (supportedChainIds.length === 0) {
        continue;
      }

      const accountId = account.id;
      try {
        const client = this.#getKeyringClient(snapId);
        const { visibleAssetIds, hiddenAssetIds } = this.#getAssetVisibility(
          [accountId],
          supportedChainIds,
        );

        // Step 1: Get the list of assets for this account
        const accountAssets = await client.listAccountAssets(accountId);
        const assetsToFetch = this.#selectAssetsToFetchV6(
          accountAssets ?? [],
          visibleAssetIds,
          supportedChainIds,
          hiddenAssetIds,
        );

        // Step 2: Get balances for those specific assets. An empty map is a
        // failed fetch (or nothing to ask for), not a zero snapshot. Leave
        // this account out so `full` cannot replace last-known amounts with 0.
        const balances: Record<CaipAssetType, Balance> = assetsToFetch.length
          ? await client.getAccountBalances(accountId, assetsToFetch)
          : {};
        if (
          !balances ||
          typeof balances !== 'object' ||
          Object.keys(balances).length === 0
        ) {
          continue;
        }

        // Transform keyring response to DataResponse format
        const accountBalances: Record<string, AssetBalance> = {};
        for (const [assetId, balance] of Object.entries(balances)) {
          accountBalances[assetId] = {
            amount: balance.amount,
            ...(balance.metadata ? { metadata: balance.metadata } : {}),
          };
        }

        // Step 3: Guard against an incomplete snap response. A `full` replace
        // would drop any expected visible asset that was requested but omitted.
        // Keep the last-known amount when we have one; otherwise seed 0.
        this.#fillOmittedVisibleAssets(
          accountId,
          visibleAssetIds,
          accountBalances,
        );

        if (results.assetsBalance) {
          results.assetsBalance[accountId] = accountBalances;
        }
      } catch {
        // Snap failed or the account does not belong to this snap. Contribute
        // nothing so previous balances stay in state.
      }
    }

    return results;
  }

  /**
   * Put every omitted visible asset on the snapshot so `full` cannot drop it.
   * Reuse the amount already in state when one exists; otherwise seed `0`.
   *
   * @param accountId - Account whose balances were fetched.
   * @param visibleAssetIds - Native, pin, and default tracked IDs for this scope.
   * @param accountBalances - Snapshot being built, mutated in place.
   */
  #fillOmittedVisibleAssets(
    accountId: string,
    visibleAssetIds: Caip19AssetId[],
    accountBalances: Record<string, AssetBalance>,
  ): void {
    const previousByKey = new Map(
      Object.entries(this.#getAssetsState().assetsBalance[accountId] ?? {}).map(
        ([assetId, balance]) => [assetId.toLowerCase(), balance],
      ),
    );
    const presentKeys = new Set(
      Object.keys(accountBalances).map((assetId) => assetId.toLowerCase()),
    );

    for (const assetId of visibleAssetIds) {
      if (presentKeys.has(assetId.toLowerCase())) {
        continue;
      }

      const previous = previousByKey.get(assetId.toLowerCase());
      if (previous) {
        accountBalances[assetId] = { ...previous };
        continue;
      }

      accountBalances[assetId] = getZeroAssetBalance(assetId as Caip19AssetId);
    }
  }

  /**
   * Union the snap's listed holdings with expected visible assets (native,
   * pin, default tracked), limited to the requested chains. Hidden assets
   * are dropped so they are neither fetched nor written back to state.
   *
   * @param accountAssets - Asset IDs the snap listed for the account.
   * @param visibleAssetIds - Native, pin, and default tracked IDs for this scope.
   * @param supportedChainIds - Chains this snap was asked about.
   * @param hiddenAssetIds - Asset IDs the user hid in this scope.
   * @returns Asset IDs to request balances for.
   */
  #selectAssetsToFetchV6(
    accountAssets: string[],
    visibleAssetIds: Caip19AssetId[],
    supportedChainIds: ChainId[],
    hiddenAssetIds: Caip19AssetId[],
  ): CaipAssetType[] {
    const supportedChains = new Set(supportedChainIds);
    const hidden = new Set(
      hiddenAssetIds.map((assetId) => assetId.toLowerCase()),
    );
    const assetsToFetch = new Map<string, CaipAssetType>();

    for (const assetId of [...accountAssets, ...visibleAssetIds]) {
      const normalizedAssetId = assetId.toLowerCase();
      if (
        assetsToFetch.has(normalizedAssetId) ||
        hidden.has(normalizedAssetId)
      ) {
        continue;
      }

      try {
        if (!supportedChains.has(extractChainFromAssetId(assetId))) {
          continue;
        }
      } catch {
        // Skip unparseable asset IDs
        continue;
      }

      assetsToFetch.set(normalizedAssetId, assetId as CaipAssetType);
    }

    return Array.from(assetsToFetch.values());
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
        if (response.updateMode) {
          context.response = {
            ...context.response,
            updateMode: response.updateMode,
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
    const { request, subscriptionId } = subscriptionRequest;

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

    try {
      const fetchResponse = await this.fetch({
        ...request,
        chainIds: supportedChains,
      });

      if (Object.keys(fetchResponse.assetsBalance ?? {}).length > 0) {
        await this.#onAssetsUpdate(fetchResponse);
      }
    } catch (error) {
      log('Initial fetch failed', { subscriptionId, error });
    }
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
