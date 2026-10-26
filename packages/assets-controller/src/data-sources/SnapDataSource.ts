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
  AccountWithSupportedChains,
  AssetBalance,
  AssetsBalanceFetchError,
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

/** First automatic retry delay after a failed snap balance fetch. */
export const SNAP_BALANCE_RETRY_INITIAL_DELAY_MS = 30_000;

/** Maximum automatic retry delay after repeated snap balance fetch failures. */
export const SNAP_BALANCE_RETRY_MAX_DELAY_MS = 5 * 60_000;

/**
 * How long a subscribed snap account may go without a confirmed balance (a
 * successful fetch or a balance pushed by the snap) before the data source
 * asks the snap again. Snaps push balances only after a successful sync, so a
 * snap whose syncs keep failing goes quiet: without this revalidation the
 * client would keep showing the cached balance until something else fetches
 * it. Healthy snaps push every 30-60 s, so they are not asked again.
 */
export const SNAP_BALANCE_REVALIDATE_AFTER_MS = 90_000;

/** How often subscribed snap accounts are checked for revalidation. */
export const SNAP_BALANCE_REVALIDATE_CHECK_INTERVAL_MS = 15_000;

/** Error recorded when a snap returns no balance for the requested assets. */
export const SNAP_EMPTY_BALANCES_ERROR =
  'Snap returned no balances for the requested assets';

/**
 * Exponential backoff for automatic snap balance retries.
 *
 * @param attempts - 1-based index of the upcoming automatic retry (1 for the
 * retry scheduled right after the first failure, 2 after one failed retry...).
 * @param initialDelayMs - Delay after the first failure.
 * @param maxDelayMs - Upper bound.
 * @returns The delay before the next retry, in ms.
 */
export function getSnapBalanceRetryDelay(
  attempts: number,
  initialDelayMs: number = SNAP_BALANCE_RETRY_INITIAL_DELAY_MS,
  maxDelayMs: number = SNAP_BALANCE_RETRY_MAX_DELAY_MS,
): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(maxDelayMs, initialDelayMs * 2 ** Math.min(exponent, 20));
}

/**
 * Per-account balance fetch status change reported by the SnapDataSource.
 * `error: null` means the balance is available again.
 */
export type SnapBalanceFetchStatusUpdate = {
  accountId: string;
  chainIds: ChainId[];
  error: AssetsBalanceFetchError | null;
};

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
  /**
   * Called when a snap account's balance becomes unavailable (a fetch failed)
   * or available again (a fetch succeeded or the snap pushed balances).
   */
  onBalanceFetchStatusChange?: (update: SnapBalanceFetchStatusUpdate) => void;
  /** Automatic retry backoff for failed per-account fetches. */
  retryBackoff?: { initialDelayMs?: number; maxDelayMs?: number };
  /**
   * Revalidation of subscribed accounts whose balance was not confirmed
   * recently (see `SNAP_BALANCE_REVALIDATE_AFTER_MS`). `false` disables it.
   */
  revalidation?: { afterMs?: number; checkIntervalMs?: number } | false;
  /** Initial state */
  state?: Partial<SnapDataSourceState>;
};

// ============================================================================
// SNAP DATA SOURCE
// ============================================================================

/**
 * Balance fetch failure tracked per account.
 */
type FailedAccountEntry = {
  /**
   * Retries made so far (scheduled automatic retries only; a manual retry
   * resets the backoff). Ordinary fetches (polling, subscriptions, other
   * controllers) that fail do not count: they never advance the backoff.
   */
  attempts: number;
  chainIds: ChainId[];
  /** Narrowed request used to retry the account. */
  request: DataRequest;
  timer: ReturnType<typeof setTimeout> | null;
  /** Message of the last failure. */
  error: string;
  failedAt: number;
  nextRetryAt: number | null;
  /** Kind of retry whose fetch is in progress, if any. */
  retryInProgress: 'scheduled' | 'manual' | null;
};

/**
 * A subscribed snap account, with the narrowed request used to revalidate it.
 */
type WatchedAccountEntry = {
  request: DataRequest;
};

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

  readonly #onBalanceFetchStatusChange?: (
    update: SnapBalanceFetchStatusUpdate,
  ) => void;

  readonly #retryInitialDelayMs: number;

  readonly #retryMaxDelayMs: number;

  /**
   * Accounts whose last balance fetch failed, with the narrowed request used
   * to retry them and the pending retry timer.
   */
  readonly #failedAccounts: Map<string, FailedAccountEntry> = new Map();

  /** Subscribed snap accounts per subscription ID. */
  readonly #watchedAccounts: Map<string, Map<string, WatchedAccountEntry>> =
    new Map();

  /**
   * Last time each account's balance was confirmed: a successful fetch or a
   * balance pushed by its snap.
   */
  readonly #lastConfirmedAt: Map<string, number> = new Map();

  /** Accounts whose revalidation fetch is in progress. */
  readonly #revalidating: Set<string> = new Set();

  readonly #revalidateAfterMs: number | null;

  readonly #revalidateCheckIntervalMs: number;

  #revalidationTimer: ReturnType<typeof setInterval> | null = null;

  #destroyed = false;

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
    this.#onBalanceFetchStatusChange = options.onBalanceFetchStatusChange;
    this.#retryInitialDelayMs =
      options.retryBackoff?.initialDelayMs ??
      SNAP_BALANCE_RETRY_INITIAL_DELAY_MS;
    this.#retryMaxDelayMs =
      options.retryBackoff?.maxDelayMs ?? SNAP_BALANCE_RETRY_MAX_DELAY_MS;
    this.#revalidateAfterMs =
      options.revalidation === false
        ? null
        : (options.revalidation?.afterMs ?? SNAP_BALANCE_REVALIDATE_AFTER_MS);
    this.#revalidateCheckIntervalMs =
      (options.revalidation === false
        ? undefined
        : options.revalidation?.checkIntervalMs) ??
      SNAP_BALANCE_REVALIDATE_CHECK_INTERVAL_MS;

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
        // The snap pushed balances for this account: it is synchronized again.
        this.#markAccountSucceeded(accountId);
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
    for (const entry of request.accountsWithSupportedChains) {
      const { account } = entry;
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

        // Step 1: Get the list of assets for this account
        const accountAssets = await client.listAccountAssets(accountId);

        // If no assets, skip to next account
        if (!accountAssets || accountAssets.length === 0) {
          this.#markAccountSucceeded(accountId);
          continue;
        }

        // Step 2: Get balances for those specific assets
        const balances: Record<CaipAssetType, Balance> =
          await client.getAccountBalances(accountId, accountAssets);

        // The snap listed assets but returned no balance for any of them:
        // that is a failed fetch (snaps that swallow network errors answer
        // with an empty map), not a confirmed balance.
        if (
          !balances ||
          typeof balances !== 'object' ||
          Object.keys(balances).length === 0
        ) {
          throw new Error(
            `${SNAP_EMPTY_BALANCES_ERROR}: ${accountAssets.length} asset(s) requested`,
          );
        }

        // Transform keyring response to DataResponse format
        if (results.assetsBalance) {
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
        this.#markAccountSucceeded(accountId);
      } catch (error) {
        // The account's snap was resolved from its own metadata, so this is a
        // real failure (e.g. the snap has not synchronized the account yet, or
        // its network calls fail), not a foreign account. Keep the previous
        // balance, but record the failure and retry with backoff.
        this.#markAccountFailed(entry, supportedChainIds, request, error);
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
    for (const entry of request.accountsWithSupportedChains) {
      const { account } = entry;
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
          if (assetsToFetch.length > 0) {
            // Assets were requested but none came back: the snap swallowed
            // a failed fetch. Record it so the cached balance is flagged
            // unavailable instead of being shown as current.
            throw new Error(
              `${SNAP_EMPTY_BALANCES_ERROR}: ${assetsToFetch.length} asset(s) requested`,
            );
          }
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
        this.#markAccountSucceeded(accountId);
      } catch (error) {
        // Snap failed. Contribute nothing so previous balances stay in state,
        // but record the failure (the balance is unavailable, not 0) and retry
        // with backoff.
        this.#markAccountFailed(entry, supportedChainIds, request, error);
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

      accountBalances[assetId] = getZeroAssetBalance(assetId);
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
      this.#unwatchSubscription(subscriptionId);
      return;
    }

    this.#watchSubscription(subscriptionId, {
      ...request,
      chainIds: supportedChains,
    });

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
  // PER-ACCOUNT FAILURES AND RETRY
  // ============================================================================

  /**
   * Accounts whose last balance fetch failed, keyed by account ID.
   *
   * @returns The current failures.
   */
  getAccountBalanceErrors(): Record<
    string,
    { chainIds: ChainId[]; attempts: number }
  > {
    const errors: Record<string, { chainIds: ChainId[]; attempts: number }> =
      {};
    for (const [accountId, failure] of this.#failedAccounts) {
      errors[accountId] = {
        chainIds: [...failure.chainIds],
        attempts: failure.attempts,
      };
    }
    return errors;
  }

  /**
   * Retry failed balance fetches now, instead of waiting for the backoff.
   * A manual retry resets the backoff: if it fails, the next automatic retry
   * comes after the initial delay again.
   *
   * @param accountIds - Accounts to retry; all failed accounts when omitted.
   */
  async retryFailedAccounts(accountIds?: string[]): Promise<void> {
    const targets = accountIds
      ? accountIds.filter((accountId) => this.#failedAccounts.has(accountId))
      : Array.from(this.#failedAccounts.keys());
    await Promise.all(
      targets.map(async (accountId) => this.#retryAccount(accountId, 'manual')),
    );
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    this.#unwatchSubscription(subscriptionId);
    await super.unsubscribe(subscriptionId);
  }

  // ============================================================================
  // REVALIDATION OF SUBSCRIBED ACCOUNTS
  // ============================================================================

  /**
   * Remember the snap accounts of a subscription, so that their balance is
   * revalidated when it is not confirmed for a while.
   *
   * @param subscriptionId - The subscription ID.
   * @param request - The subscription request, narrowed to snap chains.
   */
  #watchSubscription(subscriptionId: string, request: DataRequest): void {
    if (this.#revalidateAfterMs === null || this.#destroyed) {
      return;
    }
    const now = Date.now();
    const watched = new Map<string, WatchedAccountEntry>();
    for (const entry of request.accountsWithSupportedChains ?? []) {
      const snapId = entry.account.metadata.snap?.id;
      if (!snapId) {
        continue;
      }
      const chainIds = request.chainIds.filter(
        (chainId) => this.state.chainToSnap[chainId] === snapId,
      );
      if (chainIds.length === 0) {
        continue;
      }
      const accountId = entry.account.id;
      watched.set(accountId, {
        request: {
          ...request,
          chainIds,
          accountsWithSupportedChains: [entry],
          forceUpdate: true,
        },
      });
      // The subscription fetches it right away: start the clock now.
      if (!this.#lastConfirmedAt.has(accountId)) {
        this.#lastConfirmedAt.set(accountId, now);
      }
    }
    if (watched.size === 0) {
      this.#unwatchSubscription(subscriptionId);
      return;
    }
    this.#watchedAccounts.set(subscriptionId, watched);
    if (!this.#revalidationTimer) {
      this.#revalidationTimer = setInterval(() => {
        this.revalidateStaleAccounts().catch((error) =>
          log('Snap balance revalidation failed', { error }),
        );
      }, this.#revalidateCheckIntervalMs);
      // Do not keep a Node process (tests, scripts) alive for revalidation.
      (this.#revalidationTimer as { unref?: () => void }).unref?.();
    }
  }

  #unwatchSubscription(subscriptionId: string): void {
    this.#watchedAccounts.delete(subscriptionId);
    if (this.#watchedAccounts.size === 0 && this.#revalidationTimer) {
      clearInterval(this.#revalidationTimer);
      this.#revalidationTimer = null;
    }
  }

  /**
   * Ask the snaps again for subscribed accounts whose balance was not
   * confirmed (fetched or pushed) within the revalidation window. A failure
   * flags the balance unavailable and starts the retry backoff; accounts that
   * are already failing are left to their scheduled retries.
   *
   * @param now - Current time (for tests).
   */
  async revalidateStaleAccounts(now: number = Date.now()): Promise<void> {
    if (this.#revalidateAfterMs === null || this.#destroyed) {
      return;
    }
    const due = new Map<string, WatchedAccountEntry>();
    for (const watched of this.#watchedAccounts.values()) {
      for (const [accountId, entry] of watched) {
        if (
          due.has(accountId) ||
          this.#failedAccounts.has(accountId) ||
          this.#revalidating.has(accountId)
        ) {
          continue;
        }
        const confirmedAt = this.#lastConfirmedAt.get(accountId) ?? 0;
        if (now - confirmedAt >= this.#revalidateAfterMs) {
          due.set(accountId, entry);
        }
      }
    }

    await Promise.all(
      Array.from(due.entries()).map(async ([accountId, entry]) => {
        this.#revalidating.add(accountId);
        try {
          log('Revalidating snap balance', { accountId });
          // `fetch` records the outcome: success confirms the balance, a
          // failure flags it unavailable and schedules a retry.
          const response = await this.fetch(entry.request);
          if (Object.keys(response.assetsBalance ?? {}).length > 0) {
            await this.#onAssetsUpdate(response);
          }
        } finally {
          this.#revalidating.delete(accountId);
        }
      }),
    );
  }

  #markAccountSucceeded(accountId: string): void {
    this.#lastConfirmedAt.set(accountId, Date.now());
    const failure = this.#failedAccounts.get(accountId);
    if (!failure) {
      return;
    }
    if (failure.timer) {
      clearTimeout(failure.timer);
    }
    this.#failedAccounts.delete(accountId);
    this.#notifyStatus({ accountId, chainIds: failure.chainIds, error: null });
  }

  /**
   * Records a failed balance fetch for an account.
   *
   * Only retries drive the backoff: the first failure schedules the first
   * retry after the initial delay; a failed scheduled retry schedules the next
   * one with a doubled delay (capped); a failed manual retry starts over at
   * the initial delay. Any other failing fetch of an account that is already
   * failing (polling, subscriptions, the legacy controller...) keeps the
   * pending retry and its counter, and only refreshes the error.
   *
   * @param entry - The account and its supported chains.
   * @param chainIds - The chains whose balance could not be fetched.
   * @param request - The originating request.
   * @param error - The failure.
   */
  #markAccountFailed(
    entry: AccountWithSupportedChains,
    chainIds: ChainId[],
    request: DataRequest,
    error: unknown,
  ): void {
    const accountId = entry.account.id;
    const previous = this.#failedAccounts.get(accountId);
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    const retryRequest: DataRequest = {
      ...request,
      chainIds,
      accountsWithSupportedChains: [entry],
      forceUpdate: true,
    };

    const isRetryResult = Boolean(previous?.retryInProgress);
    if (previous && !isRetryResult && (previous.timer || this.#destroyed)) {
      // Not a retry: keep the scheduled retry and the backoff step.
      const changed =
        previous.error !== message ||
        previous.chainIds.length !== chainIds.length ||
        previous.chainIds.some((chainId) => !chainIds.includes(chainId));
      previous.error = message;
      previous.failedAt = now;
      previous.chainIds = chainIds;
      previous.request = retryRequest;
      log('Snap balance fetch failed (retry already scheduled)', {
        accountId,
        chainIds,
        attempts: previous.attempts,
        error,
      });
      if (changed) {
        this.#notifyFailure(accountId, previous);
      }
      return;
    }

    if (previous?.timer) {
      clearTimeout(previous.timer);
    }
    // `attempts` was already advanced by `#retryAccount` for a scheduled
    // retry and reset for a manual one; a first failure starts at 0.
    const attempts = previous?.attempts ?? 0;
    const delay = getSnapBalanceRetryDelay(
      attempts + 1,
      this.#retryInitialDelayMs,
      this.#retryMaxDelayMs,
    );
    log('Snap balance fetch failed', {
      accountId,
      chainIds,
      attempts,
      nextRetryInMs: delay,
      error,
    });

    const failure: FailedAccountEntry = {
      attempts,
      chainIds,
      request: retryRequest,
      timer: null,
      error: message,
      failedAt: now,
      nextRetryAt: null,
      retryInProgress: previous?.retryInProgress ?? null,
    };
    if (!this.#destroyed) {
      failure.timer = setTimeout(() => {
        failure.timer = null;
        this.#retryAccount(accountId, 'scheduled').catch((retryError) =>
          log('Snap balance retry failed', { accountId, error: retryError }),
        );
      }, delay);
      // Do not keep a Node process (tests, scripts) alive for a retry.
      (failure.timer as { unref?: () => void }).unref?.();
      failure.nextRetryAt = now + delay;
    }
    this.#failedAccounts.set(accountId, failure);
    this.#notifyFailure(accountId, failure);
  }

  #notifyFailure(accountId: string, failure: FailedAccountEntry): void {
    this.#notifyStatus({
      accountId,
      chainIds: failure.chainIds,
      error: {
        status: 'unavailable',
        error: failure.error,
        attempts: failure.attempts,
        failedAt: failure.failedAt,
        nextRetryAt: failure.nextRetryAt,
      },
    });
  }

  /**
   * Retries the balance fetch of a failed account. The snap is asked for the
   * balance again, which also lets snaps that answer from local state start a
   * sync of the account (the Bitcoin and Stellar snaps kick off a
   * deduplicated sync / full scan when asked for an unknown balance).
   *
   * @param accountId - The account ID.
   * @param kind - `scheduled` (automatic, advances the backoff) or `manual`
   * (user-initiated, resets the backoff).
   */
  async #retryAccount(
    accountId: string,
    kind: 'scheduled' | 'manual',
  ): Promise<void> {
    const failure = this.#failedAccounts.get(accountId);
    if (!failure || this.#destroyed) {
      return;
    }
    if (failure.timer) {
      clearTimeout(failure.timer);
      failure.timer = null;
    }
    failure.attempts = kind === 'scheduled' ? failure.attempts + 1 : 0;
    failure.retryInProgress = kind;
    try {
      // `fetch` records the outcome (success clears the failure, another
      // failure reschedules the next retry).
      const response = await this.fetch(failure.request);
      if (Object.keys(response.assetsBalance ?? {}).length > 0) {
        await this.#onAssetsUpdate(response);
      }
    } finally {
      const current = this.#failedAccounts.get(accountId);
      if (current) {
        current.retryInProgress = null;
      }
    }
  }

  #notifyStatus(update: SnapBalanceFetchStatusUpdate): void {
    try {
      this.#onBalanceFetchStatusChange?.(update);
    } catch (error) {
      log('Balance fetch status listener failed', { error });
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

    // Stop revalidation
    if (this.#revalidationTimer) {
      clearInterval(this.#revalidationTimer);
      this.#revalidationTimer = null;
    }
    this.#watchedAccounts.clear();

    // Stop pending retries
    this.#destroyed = true;
    for (const failure of this.#failedAccounts.values()) {
      if (failure.timer) {
        clearTimeout(failure.timer);
      }
    }
    this.#failedAccounts.clear();
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
