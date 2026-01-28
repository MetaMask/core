import type {
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from '@metamask/account-tree-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkEnablementControllerGetStateAction,
  NetworkEnablementControllerEvents,
  NetworkEnablementControllerState,
} from '@metamask/network-enablement-controller';
import type { Json } from '@metamask/utils';
import { parseCaipAssetType } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import BigNumberJS from 'bignumber.js';
import { isEqual } from 'lodash';

import type { AccountsApiDataSourceGetAssetsMiddlewareAction } from './data-sources/AccountsApiDataSource';
import type {
  PriceDataSourceGetAssetsMiddlewareAction,
  PriceDataSourceFetchAction,
  PriceDataSourceSubscribeAction,
  PriceDataSourceUnsubscribeAction,
} from './data-sources/PriceDataSource';
import type { RpcDataSourceGetAssetsMiddlewareAction } from './data-sources/RpcDataSource';
import type { SnapDataSourceGetAssetsMiddlewareAction } from './data-sources/SnapDataSource';
import type { TokenDataSourceGetAssetsMiddlewareAction } from './data-sources/TokenDataSource';
import { projectLogger, createModuleLogger } from './logger';
import type { DetectionMiddlewareGetAssetsMiddlewareAction } from './middlewares/DetectionMiddleware';
import type {
  AccountId,
  ChainId,
  Caip19AssetId,
  AssetMetadata,
  AssetPrice,
  AssetBalance,
  AssetType,
  DataType,
  DataRequest,
  DataResponse,
  NextFunction,
  Middleware,
  DataSourceDefinition,
  SubscriptionResponse,
  Asset,
  AssetsControllerStateInternal,
} from './types';
import { normalizeAssetId } from './utils';

// ============================================================================
// CONTROLLER CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AssetsController' as const;

/** Default polling interval hint for data sources (30 seconds) */
const DEFAULT_POLLING_INTERVAL_MS = 30_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * State structure for AssetsController.
 *
 * All values are JSON-serializable. The type is widened to satisfy
 * StateConstraint from BaseController, but the actual runtime values
 * conform to AssetMetadata, AssetPrice, and AssetBalance interfaces.
 *
 * @see AssetsControllerStateInternal for the semantic type structure
 */
export type AssetsControllerState = {
  /** Shared metadata for all assets (stored once per asset) */
  assetsMetadata: { [assetId: string]: Json };
  /** Per-account balance data */
  assetsBalance: { [accountId: string]: { [assetId: string]: Json } };
  /** Custom assets added by users per account (CAIP-19 asset IDs) */
  customAssets: { [accountId: string]: string[] };
};

/**
 * Returns the default state for AssetsController.
 *
 * @returns The default AssetsController state with empty metadata, balance, and customAssets maps.
 */
export function getDefaultAssetsControllerState(): AssetsControllerState {
  return {
    assetsMetadata: {},
    assetsBalance: {},
    customAssets: {},
  };
}

// ============================================================================
// MESSENGER TYPES
// ============================================================================

export type AssetsControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  AssetsControllerState
>;

export type AssetsControllerGetAssetsAction = {
  type: `${typeof CONTROLLER_NAME}:getAssets`;
  handler: AssetsController['getAssets'];
};

export type AssetsControllerGetAssetsBalanceAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetsBalance`;
  handler: AssetsController['getAssetsBalance'];
};

export type AssetsControllerGetAssetMetadataAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetMetadata`;
  handler: AssetsController['getAssetMetadata'];
};

export type AssetsControllerGetAssetsPriceAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetsPrice`;
  handler: AssetsController['getAssetsPrice'];
};

export type AssetsControllerActiveChainsUpdateAction = {
  type: `${typeof CONTROLLER_NAME}:activeChainsUpdate`;
  handler: AssetsController['handleActiveChainsUpdate'];
};

export type AssetsControllerAssetsUpdateAction = {
  type: `${typeof CONTROLLER_NAME}:assetsUpdate`;
  handler: AssetsController['handleAssetsUpdate'];
};

export type AssetsControllerAddCustomAssetAction = {
  type: `${typeof CONTROLLER_NAME}:addCustomAsset`;
  handler: AssetsController['addCustomAsset'];
};

export type AssetsControllerRemoveCustomAssetAction = {
  type: `${typeof CONTROLLER_NAME}:removeCustomAsset`;
  handler: AssetsController['removeCustomAsset'];
};

export type AssetsControllerGetCustomAssetsAction = {
  type: `${typeof CONTROLLER_NAME}:getCustomAssets`;
  handler: AssetsController['getCustomAssets'];
};

export type AssetsControllerActions =
  | AssetsControllerGetStateAction
  | AssetsControllerGetAssetsAction
  | AssetsControllerGetAssetsBalanceAction
  | AssetsControllerGetAssetMetadataAction
  | AssetsControllerGetAssetsPriceAction
  | AssetsControllerActiveChainsUpdateAction
  | AssetsControllerAssetsUpdateAction
  | AssetsControllerAddCustomAssetAction
  | AssetsControllerRemoveCustomAssetAction
  | AssetsControllerGetCustomAssetsAction;

export type AssetsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof CONTROLLER_NAME,
  AssetsControllerState
>;

export type AssetsControllerBalanceChangedEvent = {
  type: `${typeof CONTROLLER_NAME}:balanceChanged`;
  payload: [
    {
      accountId: AccountId;
      assetId: Caip19AssetId;
      previousAmount: string;
      newAmount: string;
    },
  ];
};

export type AssetsControllerPriceChangedEvent = {
  type: `${typeof CONTROLLER_NAME}:priceChanged`;
  payload: [{ prices: Record<Caip19AssetId, AssetPrice> }];
};

export type AssetsControllerAssetsDetectedEvent = {
  type: `${typeof CONTROLLER_NAME}:assetsDetected`;
  payload: [{ accountId: AccountId; assetIds: Caip19AssetId[] }];
};

export type AssetsControllerEvents =
  | AssetsControllerStateChangeEvent
  | AssetsControllerBalanceChangedEvent
  | AssetsControllerPriceChangedEvent
  | AssetsControllerAssetsDetectedEvent;

type AllowedActions =
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  | NetworkEnablementControllerGetStateAction
  // Data source middlewares
  | AccountsApiDataSourceGetAssetsMiddlewareAction
  | SnapDataSourceGetAssetsMiddlewareAction
  | RpcDataSourceGetAssetsMiddlewareAction
  // Enrichment middlewares
  | TokenDataSourceGetAssetsMiddlewareAction
  | PriceDataSourceGetAssetsMiddlewareAction
  | PriceDataSourceFetchAction
  | PriceDataSourceSubscribeAction
  | PriceDataSourceUnsubscribeAction
  | DetectionMiddlewareGetAssetsMiddlewareAction;

/**
 * App lifecycle event: fired when app becomes active (opened/foregrounded)
 */
export type AppStateControllerAppOpenedEvent = {
  type: 'AppStateController:appOpened';
  payload: [];
};

/**
 * App lifecycle event: fired when app becomes inactive (closed/backgrounded)
 */
export type AppStateControllerAppClosedEvent = {
  type: 'AppStateController:appClosed';
  payload: [];
};

type AllowedEvents =
  | AccountTreeControllerSelectedAccountGroupChangeEvent
  | NetworkEnablementControllerEvents
  | AppStateControllerAppOpenedEvent
  | AppStateControllerAppClosedEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent;

export type AssetsControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  AssetsControllerActions | AllowedActions,
  AssetsControllerEvents | AllowedEvents
>;

// ============================================================================
// CONTROLLER OPTIONS
// ============================================================================

export type AssetsControllerOptions = {
  messenger: AssetsControllerMessenger;
  state?: Partial<AssetsControllerState>;
  /** Default polling interval hint passed to data sources (ms) */
  defaultUpdateInterval?: number;
};

// ============================================================================
// STATE METADATA
// ============================================================================

const stateMetadata: StateMetadata<AssetsControllerState> = {
  assetsMetadata: {
    persist: true,
    includeInStateLogs: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  assetsBalance: {
    persist: true,
    includeInStateLogs: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  customAssets: {
    persist: true,
    includeInStateLogs: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractChainId(assetId: Caip19AssetId): ChainId {
  const parsed = parseCaipAssetType(assetId);
  return parsed.chainId;
}

/**
 * Normalizes all asset IDs in a DataResponse.
 * This is applied at the controller level to ensure consistent state
 * regardless of how data sources format their asset IDs.
 *
 * @param response - The DataResponse to normalize.
 * @returns The normalized DataResponse with checksummed EVM addresses.
 */
function normalizeResponse(response: DataResponse): DataResponse {
  const normalized: DataResponse = {};

  if (response.assetsMetadata) {
    normalized.assetsMetadata = {};
    for (const [assetId, metadata] of Object.entries(response.assetsMetadata)) {
      const normalizedId = normalizeAssetId(assetId as Caip19AssetId);
      normalized.assetsMetadata[normalizedId] = metadata;
    }
  }

  if (response.assetsPrice) {
    normalized.assetsPrice = {};
    for (const [assetId, price] of Object.entries(response.assetsPrice)) {
      const normalizedId = normalizeAssetId(assetId as Caip19AssetId);
      normalized.assetsPrice[normalizedId] = price;
    }
  }

  if (response.assetsBalance) {
    normalized.assetsBalance = {};
    for (const [accountId, balances] of Object.entries(
      response.assetsBalance,
    )) {
      normalized.assetsBalance[accountId] = {};
      for (const [assetId, balance] of Object.entries(balances)) {
        const normalizedId = normalizeAssetId(assetId as Caip19AssetId);
        normalized.assetsBalance[accountId][normalizedId] = balance;
      }
    }
  }

  // Preserve detectedAssets with normalized asset IDs
  if (response.detectedAssets) {
    normalized.detectedAssets = {};
    for (const [accountId, assetIds] of Object.entries(
      response.detectedAssets,
    )) {
      normalized.detectedAssets[accountId] = assetIds.map((assetId) =>
        normalizeAssetId(assetId),
      );
    }
  }

  // Preserve errors (chain IDs don't need normalization)
  if (response.errors) {
    normalized.errors = { ...response.errors };
  }

  return normalized;
}

// ============================================================================
// CONTROLLER IMPLEMENTATION
// ============================================================================

/**
 * AssetsController provides a unified interface for managing asset balances
 * across all blockchain networks (EVM and non-EVM) and all asset types.
 *
 * ## Core Responsibilities
 *
 * 1. **One-Time Fetch (Sync)**: For initial load, force refresh, or on-demand queries.
 *    Uses `getAssets()`, `getAssetsBalance()`, etc. with `forceUpdate: true`.
 *
 * 2. **Async Subscriptions**: Subscribes to data sources for ongoing updates.
 *    Data sources push updates via callbacks; the controller updates state.
 *
 * 3. **Dynamic Source Selection**: Routes requests to appropriate data sources
 *    based on which chains they support. When active chains change, the controller
 *    dynamically adjusts subscriptions.
 *
 * 4. **App Lifecycle Management**: Listens to app open/close events via messenger
 *    to start/stop subscriptions automatically, conserving resources when app is closed.
 *
 * ## App Lifecycle
 *
 * - **App Opened** (`AppStateController:appOpened`): Starts subscriptions, fetches initial data
 * - **App Closed** (`AppStateController:appClosed`): Stops all subscriptions to conserve resources
 *
 * ## Architecture
 *
 * - Data sources declare their supported chains (async, can change over time)
 * - Data sources are responsible for their own update mechanisms (WebSocket, polling, events)
 * - The controller does NOT manage polling - it simply receives pushed updates
 */
export class AssetsController extends BaseController<
  typeof CONTROLLER_NAME,
  AssetsControllerState,
  AssetsControllerMessenger
> {
  /** Default update interval hint passed to data sources */
  readonly #defaultUpdateInterval: number;

  readonly #controllerMutex = new Mutex();

  /**
   * Active balance subscriptions keyed by account ID.
   * Each account has one logical subscription that may span multiple data sources.
   * For example, if WebSocket covers chains A,B and RPC covers chain C,
   * the account subscribes to both data sources for its chains.
   */
  readonly #activeSubscriptions: Map<string, SubscriptionResponse> = new Map();

  /** Currently enabled chains from NetworkEnablementController */
  #enabledChains: Set<ChainId> = new Set();

  /**
   * Get the currently selected accounts from AccountTreeController.
   * This includes all accounts in the same group as the selected account
   * (EVM, Bitcoin, Solana, Tron, etc. that belong to the same logical account group).
   *
   * @returns Array of InternalAccount objects from the selected account group.
   */
  get #selectedAccounts(): InternalAccount[] {
    return this.messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );
  }

  /** Price data for assets (in-memory only, not persisted) */
  #assetsPrice: Record<Caip19AssetId, AssetPrice> = {};

  /**
   * Registered data sources with their available chains.
   * Updated continuously and independently from subscription flows.
   * Key: sourceId, Value: Set of currently available chainIds
   */
  readonly #dataSources: Map<string, Set<ChainId>> = new Map();

  constructor({
    messenger,
    state = {},
    defaultUpdateInterval = DEFAULT_POLLING_INTERVAL_MS,
  }: AssetsControllerOptions) {
    super({
      name: CONTROLLER_NAME,
      messenger,
      metadata: stateMetadata,
      state: {
        ...getDefaultAssetsControllerState(),
        ...state,
      },
    });

    this.#defaultUpdateInterval = defaultUpdateInterval;

    log('Initializing AssetsController', {
      defaultUpdateInterval,
    });

    this.#initializeState();
    this.#subscribeToEvents();
    this.#registerActionHandlers();

    // Register data sources (order = subscription priority)
    this.registerDataSources([
      'BackendWebsocketDataSource', // Real-time push updates
      'AccountsApiDataSource', // HTTP polling fallback
      'SnapDataSource', // Solana/Bitcoin/Tron snaps
      'RpcDataSource', // Direct blockchain queries
    ]);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  #initializeState(): void {
    const { enabledNetworkMap } = this.messenger.call(
      'NetworkEnablementController:getState',
    );
    this.#enabledChains = this.#extractEnabledChains(enabledNetworkMap);

    log('Initialized state', {
      enabledNetworkMap,
      enabledChains: this.#enabledChains,
    });
  }

  /**
   * Extract enabled chains from enabledNetworkMap.
   * Returns CAIP-2 chain IDs for all enabled networks across all namespaces.
   *
   * Note: For EIP155 (EVM) chains, the reference is normalized to decimal format
   * to ensure consistency with CAIP-2 standard and API responses.
   *
   * @param enabledNetworkMap - The enabled network map from NetworkEnablementController.
   * @returns Set of CAIP-2 chain IDs for all enabled networks.
   */
  #extractEnabledChains(
    enabledNetworkMap: NetworkEnablementControllerState['enabledNetworkMap'],
  ): Set<ChainId> {
    const chains = new Set<ChainId>();

    for (const [namespace, networks] of Object.entries(enabledNetworkMap)) {
      for (const [reference, isEnabled] of Object.entries(networks)) {
        if (isEnabled) {
          // Check if reference is already a full CAIP-2 chain ID (contains colon)
          if (reference.includes(':')) {
            // Already a full chain ID, use as-is
            chains.add(reference as ChainId);
          } else {
            // Normalize EIP155 chain references from hex to decimal (CAIP-2 standard)
            const normalizedReference = this.#normalizeChainReference(
              namespace,
              reference,
            );
            chains.add(`${namespace}:${normalizedReference}`);
          }
        }
      }
    }
    return chains;
  }

  /**
   * Normalize chain reference to CAIP-2 standard format.
   * For EIP155, converts hex chain IDs to decimal.
   *
   * @param namespace - The chain namespace (e.g., "eip155").
   * @param reference - The chain reference (e.g., "0x1" or "1").
   * @returns The normalized chain reference in decimal format.
   */
  #normalizeChainReference(namespace: string, reference: string): string {
    if (namespace === 'eip155' && reference.startsWith('0x')) {
      // Convert hex to decimal for EIP155 chains
      return parseInt(reference, 16).toString();
    }
    return reference;
  }

  #subscribeToEvents(): void {
    // Subscribe to account group changes (when user switches between account groups like Account 1 -> Account 2)
    this.messenger.subscribe(
      'AccountTreeController:selectedAccountGroupChange',
      () => {
        this.#handleAccountGroupChanged().catch(console.error);
      },
    );

    // Subscribe to network enablement changes (only enabledNetworkMap)
    this.messenger.subscribe(
      'NetworkEnablementController:stateChange',
      ({ enabledNetworkMap }) => {
        this.#handleEnabledNetworksChanged(enabledNetworkMap).catch(
          console.error,
        );
      },
    );

    // App lifecycle: start when opened, stop when closed
    this.messenger.subscribe('AppStateController:appOpened', () =>
      this.#start(),
    );
    this.messenger.subscribe('AppStateController:appClosed', () =>
      this.#stop(),
    );

    // Keyring lifecycle: start when unlocked, stop when locked
    this.messenger.subscribe('KeyringController:unlock', () => this.#start());
    this.messenger.subscribe('KeyringController:lock', () => this.#stop());
  }

  #registerActionHandlers(): void {
    this.messenger.registerActionHandler(
      'AssetsController:getAssets',
      this.getAssets.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:getAssetsBalance',
      this.getAssetsBalance.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:getAssetMetadata',
      this.getAssetMetadata.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:getAssetsPrice',
      this.getAssetsPrice.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:activeChainsUpdate',
      this.handleActiveChainsUpdate.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:assetsUpdate',
      this.handleAssetsUpdate.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:addCustomAsset',
      this.addCustomAsset.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:removeCustomAsset',
      this.removeCustomAsset.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:getCustomAssets',
      this.getCustomAssets.bind(this),
    );
  }

  // ============================================================================
  // DATA SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Register data sources with the controller.
   * Order of the array determines subscription order.
   *
   * Data sources report chain changes by calling `AssetsController:activeChainsUpdate` action.
   *
   * @param dataSourceIds - Array of data source identifiers to register.
   */
  registerDataSources(dataSourceIds: DataSourceDefinition[]): void {
    for (const id of dataSourceIds) {
      log('Registering data source', { id });

      // Initialize available chains tracking for this source
      this.#dataSources.set(id, new Set());
    }
  }

  // ============================================================================
  // DATA SOURCE CHAIN MANAGEMENT
  // ============================================================================

  /**
   * Handle when a data source's active chains change.
   * Active chains are chains that are both supported AND available.
   * Updates centralized chain tracking and triggers re-selection if needed.
   *
   * Data sources should call this via `AssetsController:activeChainsUpdate` action.
   *
   * @param dataSourceId - The identifier of the data source reporting the change.
   * @param activeChains - Array of currently active chain IDs for this source.
   */
  handleActiveChainsUpdate(
    dataSourceId: string,
    activeChains: ChainId[],
  ): void {
    log('Data source active chains changed', {
      dataSourceId,
      chainCount: activeChains.length,
      chains: activeChains,
    });

    const previousChains = this.#dataSources.get(dataSourceId) ?? new Set();
    const newChains = new Set(activeChains);

    // Update centralized available chains tracking
    this.#dataSources.set(dataSourceId, newChains);

    // Check for changes
    const addedChains = activeChains.filter(
      (chain) => !previousChains.has(chain),
    );
    const removedChains = Array.from(previousChains).filter(
      (chain) => !newChains.has(chain),
    );

    if (addedChains.length > 0 || removedChains.length > 0) {
      // Refresh subscriptions to use updated data source availability
      this.#subscribeToDataSources();
    }

    // If chains were added and we have selected accounts, do one-time fetch
    if (addedChains.length > 0 && this.#selectedAccounts.length > 0) {
      const addedEnabledChains = addedChains.filter((chain) =>
        this.#enabledChains.has(chain),
      );
      if (addedEnabledChains.length > 0) {
        log('Fetching balances for newly added chains', { addedEnabledChains });
        this.getAssets(this.#selectedAccounts, {
          chainIds: addedEnabledChains,
          forceUpdate: true,
        }).catch((error) => {
          log('Failed to fetch balance for added chains', { error });
        });
      }
    }
  }

  // ============================================================================
  // MIDDLEWARE EXECUTION
  // ============================================================================

  /**
   * Execute middlewares with request/response context.
   *
   * @param middlewares - Middlewares to execute in order.
   * @param request - The data request.
   * @param initialResponse - Optional initial response (for enriching existing data).
   * @returns The final DataResponse after all middlewares have processed.
   */
  async #executeMiddlewares(
    middlewares: Middleware[],
    request: DataRequest,
    initialResponse: DataResponse = {},
  ): Promise<DataResponse> {
    const chain = middlewares.reduceRight<NextFunction>(
      (next, middleware) =>
        async (
          ctx,
        ): Promise<{
          request: DataRequest;
          response: DataResponse;
          getAssetsState: () => AssetsControllerStateInternal;
        }> => {
          try {
            return await middleware(ctx, next);
          } catch (error) {
            console.error('[AssetsController] Middleware failed:', error);
            return next(ctx);
          }
        },
      async (ctx) => ctx,
    );

    const result = await chain({
      request,
      response: initialResponse,
      getAssetsState: () => this.state as AssetsControllerStateInternal,
    });
    return result.response;
  }

  // ============================================================================
  // PUBLIC API: QUERY METHODS
  // ============================================================================

  async getAssets(
    accounts: InternalAccount[],
    options?: {
      chainIds?: ChainId[];
      assetTypes?: AssetType[];
      forceUpdate?: boolean;
      dataTypes?: DataType[];
    },
  ): Promise<Record<AccountId, Record<Caip19AssetId, Asset>>> {
    const chainIds = options?.chainIds ?? [...this.#enabledChains];
    const assetTypes = options?.assetTypes ?? ['fungible'];
    const dataTypes = options?.dataTypes ?? ['balance', 'metadata', 'price'];

    // Collect custom assets for all requested accounts
    const customAssets: Caip19AssetId[] = [];
    for (const account of accounts) {
      const accountCustomAssets = this.getCustomAssets(account.id);
      customAssets.push(...accountCustomAssets);
    }

    if (options?.forceUpdate) {
      const response = await this.#executeMiddlewares(
        [
          this.messenger.call('AccountsApiDataSource:getAssetsMiddleware'),
          this.messenger.call('SnapDataSource:getAssetsMiddleware'),
          this.messenger.call('RpcDataSource:getAssetsMiddleware'),
          this.messenger.call('DetectionMiddleware:getAssetsMiddleware'),
          this.messenger.call('TokenDataSource:getAssetsMiddleware'),
          this.messenger.call('PriceDataSource:getAssetsMiddleware'),
        ],
        {
          accounts,
          chainIds,
          assetTypes,
          dataTypes,
          customAssets: customAssets.length > 0 ? customAssets : undefined,
          forceUpdate: true,
        },
      );
      await this.#updateState(response);
    }

    return this.#getAssetsFromState(accounts, chainIds, assetTypes);
  }

  async getAssetsBalance(
    accounts: InternalAccount[],
    options?: {
      chainIds?: ChainId[];
      assetTypes?: AssetType[];
      forceUpdate?: boolean;
    },
  ): Promise<Record<AccountId, Record<Caip19AssetId, AssetBalance>>> {
    // Reuse getAssets with dataTypes: ['balance'] only
    const assets = await this.getAssets(accounts, {
      chainIds: options?.chainIds,
      assetTypes: options?.assetTypes,
      forceUpdate: options?.forceUpdate,
      dataTypes: ['balance', 'metadata'],
    });

    // Extract just the balance from each asset
    const result: Record<AccountId, Record<Caip19AssetId, AssetBalance>> = {};
    for (const [accountId, accountAssets] of Object.entries(assets)) {
      result[accountId] = {};
      for (const [assetId, asset] of Object.entries(accountAssets)) {
        if (asset.balance) {
          result[accountId][assetId as Caip19AssetId] = asset.balance;
        }
      }
    }

    return result;
  }

  getAssetMetadata(assetId: Caip19AssetId): AssetMetadata | undefined {
    return this.state.assetsMetadata[assetId] as AssetMetadata | undefined;
  }

  async getAssetsPrice(
    accounts: InternalAccount[],
    options?: {
      chainIds?: ChainId[];
      assetTypes?: AssetType[];
      forceUpdate?: boolean;
    },
  ): Promise<Record<Caip19AssetId, AssetPrice>> {
    const assets = await this.getAssets(accounts, {
      chainIds: options?.chainIds,
      assetTypes: options?.assetTypes,
      forceUpdate: options?.forceUpdate,
      dataTypes: ['price'],
    });

    // Extract just the price from each asset (flattened across accounts)
    const result: Record<Caip19AssetId, AssetPrice> = {};
    for (const accountAssets of Object.values(assets)) {
      for (const [assetId, asset] of Object.entries(accountAssets)) {
        if (asset.price) {
          result[assetId as Caip19AssetId] = asset.price;
        }
      }
    }

    return result;
  }

  // ============================================================================
  // CUSTOM ASSETS MANAGEMENT
  // ============================================================================

  /**
   * Add a custom asset for an account.
   * Custom assets are included in subscription and fetch operations.
   *
   * @param accountId - The account ID to add the custom asset for.
   * @param assetId - The CAIP-19 asset ID to add.
   */
  async addCustomAsset(
    accountId: AccountId,
    assetId: Caip19AssetId,
  ): Promise<void> {
    const normalizedAssetId = normalizeAssetId(assetId);

    log('Adding custom asset', { accountId, assetId: normalizedAssetId });

    this.update((state) => {
      const customAssets = state.customAssets as Record<string, string[]>;
      if (!customAssets[accountId]) {
        customAssets[accountId] = [];
      }

      // Only add if not already present
      if (!customAssets[accountId].includes(normalizedAssetId)) {
        customAssets[accountId].push(normalizedAssetId);
      }
    });

    // Fetch data for the newly added custom asset
    const account = this.#selectedAccounts.find((a) => a.id === accountId);
    if (account) {
      const chainId = extractChainId(normalizedAssetId);
      await this.getAssets([account], {
        chainIds: [chainId],
        forceUpdate: true,
      });
    }
  }

  /**
   * Remove a custom asset from an account.
   *
   * @param accountId - The account ID to remove the custom asset from.
   * @param assetId - The CAIP-19 asset ID to remove.
   */
  removeCustomAsset(accountId: AccountId, assetId: Caip19AssetId): void {
    const normalizedAssetId = normalizeAssetId(assetId);

    log('Removing custom asset', { accountId, assetId: normalizedAssetId });

    this.update((state) => {
      const customAssets = state.customAssets as Record<string, string[]>;
      if (customAssets[accountId]) {
        customAssets[accountId] = customAssets[accountId].filter(
          (id) => id !== normalizedAssetId,
        );

        // Clean up empty arrays
        if (customAssets[accountId].length === 0) {
          delete customAssets[accountId];
        }
      }
    });
  }

  /**
   * Get all custom assets for an account.
   *
   * @param accountId - The account ID to get custom assets for.
   * @returns Array of CAIP-19 asset IDs for the account's custom assets.
   */
  getCustomAssets(accountId: AccountId): Caip19AssetId[] {
    return (this.state.customAssets[accountId] ?? []) as Caip19AssetId[];
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  /**
   * Assign chains to data sources based on availability.
   * Returns a map of sourceId -> chains to handle.
   *
   * @param requestedChains - Array of chain IDs to assign to data sources.
   * @returns Map of sourceId to array of assigned chain IDs.
   */
  #assignChainsToDataSources(
    requestedChains: ChainId[],
  ): Map<string, ChainId[]> {
    const assignment = new Map<string, ChainId[]>();
    const remainingChains = new Set(requestedChains);

    for (const sourceId of this.#dataSources.keys()) {
      // Get available chains for this data source
      const availableChains = this.#dataSources.get(sourceId);
      if (!availableChains || availableChains.size === 0) {
        continue;
      }

      const chainsForThisSource: ChainId[] = [];

      for (const chainId of remainingChains) {
        // Check if this chain is available on this source
        if (availableChains.has(chainId)) {
          chainsForThisSource.push(chainId);
          remainingChains.delete(chainId);
        }
      }

      if (chainsForThisSource.length > 0) {
        assignment.set(sourceId, chainsForThisSource);
        log('Assigned chains to data source', {
          sourceId,
          chains: chainsForThisSource,
        });
      }
    }

    return assignment;
  }

  /**
   * Subscribe to price updates for all assets held by the given accounts.
   * Polls PriceDataSource which fetches prices from balance state.
   *
   * @param accounts - Accounts to subscribe price updates for.
   * @param chainIds - Chain IDs to filter prices for.
   * @param options - Subscription options.
   * @param options.updateInterval - Polling interval in ms.
   */
  subscribeAssetsPrice(
    accounts: InternalAccount[],
    chainIds: ChainId[],
    options: { updateInterval?: number } = {},
  ): void {
    const { updateInterval = this.#defaultUpdateInterval } = options;
    const subscriptionKey = 'ds:PriceDataSource';

    const existingSubscription = this.#activeSubscriptions.get(subscriptionKey);
    const isUpdate = existingSubscription !== undefined;

    // Fire-and-forget - errors are handled internally by PriceDataSource
    this.messenger
      .call('PriceDataSource:subscribe', {
        request: {
          accounts,
          chainIds,
          dataTypes: ['price'],
          updateInterval,
        },
        subscriptionId: subscriptionKey,
        isUpdate,
      })
      .catch(console.error);

    // Track subscription
    const subscription: SubscriptionResponse = {
      chains: chainIds,
      accountId: subscriptionKey,
      assetTypes: ['fungible'],
      dataTypes: ['price'],
      unsubscribe: () => {
        this.#activeSubscriptions.delete(subscriptionKey);
      },
    };

    this.#activeSubscriptions.set(subscriptionKey, subscription);
  }

  /**
   * Unsubscribe from price updates.
   */
  unsubscribeAssetsPrice(): void {
    const subscriptionKey = 'ds:PriceDataSource';
    const existingSubscription = this.#activeSubscriptions.get(subscriptionKey);

    if (!existingSubscription) {
      return;
    }

    // Fire-and-forget - errors are handled internally by PriceDataSource
    this.messenger
      .call('PriceDataSource:unsubscribe', subscriptionKey)
      .catch(console.error);

    existingSubscription.unsubscribe();
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  async #updateState(response: DataResponse): Promise<void> {
    // Normalize asset IDs (checksum EVM addresses) before storing in state
    const normalizedResponse = normalizeResponse(response);

    const releaseLock = await this.#controllerMutex.acquire();

    try {
      const previousState = this.state;
      const previousPrices = { ...this.#assetsPrice };
      // Use detectedAssets from response (assets without metadata)
      const detectedAssets: Record<AccountId, Caip19AssetId[]> =
        normalizedResponse.detectedAssets ?? {};

      // Update prices in memory (not persisted in state)
      if (normalizedResponse.assetsPrice) {
        for (const [key, value] of Object.entries(
          normalizedResponse.assetsPrice,
        )) {
          this.#assetsPrice[key as Caip19AssetId] = value;
        }
      }

      // Track actual changes for logging
      const changedBalances: {
        accountId: string;
        assetId: string;
        oldAmount: string | undefined;
        newAmount: string;
      }[] = [];
      const changedMetadata: string[] = [];

      this.update((state) => {
        // Use type assertions to avoid deep type instantiation issues with Draft<Json>
        const metadata = state.assetsMetadata as unknown as Record<
          string,
          unknown
        >;
        const balances = state.assetsBalance as unknown as Record<
          string,
          Record<string, unknown>
        >;

        if (normalizedResponse.assetsMetadata) {
          for (const [key, value] of Object.entries(
            normalizedResponse.assetsMetadata,
          )) {
            if (
              !isEqual(
                previousState.assetsMetadata[key as Caip19AssetId],
                value,
              )
            ) {
              changedMetadata.push(key);
            }
            metadata[key] = value;
          }
        }

        if (normalizedResponse.assetsBalance) {
          for (const [accountId, accountBalances] of Object.entries(
            normalizedResponse.assetsBalance,
          )) {
            const previousBalances =
              previousState.assetsBalance[accountId] ?? {};

            if (!balances[accountId]) {
              balances[accountId] = {};
            }

            for (const [assetId, balance] of Object.entries(accountBalances)) {
              const previousBalance = previousBalances[
                assetId as Caip19AssetId
              ] as { amount: string } | undefined;
              const balanceData = balance as { amount: string };
              const newAmount = balanceData.amount;
              const oldAmount = previousBalance?.amount;

              // Track if balance actually changed
              if (oldAmount !== newAmount) {
                changedBalances.push({
                  accountId,
                  assetId,
                  oldAmount,
                  newAmount,
                });
              }
            }

            Object.assign(balances[accountId], accountBalances);
          }
        }
      });

      // Calculate changed prices
      const changedPriceAssets: string[] = normalizedResponse.assetsPrice
        ? Object.keys(normalizedResponse.assetsPrice).filter(
            (assetId) =>
              !isEqual(
                previousPrices[assetId as Caip19AssetId],
                normalizedResponse.assetsPrice?.[assetId as Caip19AssetId],
              ),
          )
        : [];

      // Log only actual changes
      if (
        changedBalances.length > 0 ||
        changedMetadata.length > 0 ||
        changedPriceAssets.length > 0
      ) {
        log('State updated', {
          changedBalances:
            changedBalances.length > 0 ? changedBalances : undefined,
          changedMetadataCount:
            changedMetadata.length > 0 ? changedMetadata.length : undefined,
          changedPricesCount:
            changedPriceAssets.length > 0
              ? changedPriceAssets.length
              : undefined,
          newAssets:
            Object.keys(detectedAssets).length > 0
              ? Object.entries(detectedAssets).map(([accountId, assets]) => ({
                  accountId,
                  assets,
                }))
              : undefined,
        });
      }

      // Publish balance changed events
      for (const change of changedBalances) {
        this.messenger.publish('AssetsController:balanceChanged', {
          accountId: change.accountId,
          assetId: change.assetId as Caip19AssetId,
          previousAmount: change.oldAmount ?? '0',
          newAmount: change.newAmount,
        });
      }

      // Publish price changed event with full price data
      if (changedPriceAssets.length > 0 && normalizedResponse.assetsPrice) {
        // Build prices object with only changed prices
        const changedPrices: Record<Caip19AssetId, AssetPrice> = {};
        for (const assetId of changedPriceAssets) {
          const price =
            normalizedResponse.assetsPrice[assetId as Caip19AssetId];
          if (price) {
            changedPrices[assetId as Caip19AssetId] = price;
          }
        }
        this.messenger.publish('AssetsController:priceChanged', {
          prices: changedPrices,
        });
      }

      // Publish assets detected events
      for (const [accountId, assetIds] of Object.entries(detectedAssets)) {
        if (assetIds.length > 0) {
          this.messenger.publish('AssetsController:assetsDetected', {
            accountId,
            assetIds,
          });
        }
      }
    } finally {
      releaseLock();
    }
  }

  #getAssetsFromState(
    accounts: InternalAccount[],
    chainIds: ChainId[],
    assetTypes: AssetType[],
  ): Record<AccountId, Record<Caip19AssetId, Asset>> {
    const result: Record<AccountId, Record<Caip19AssetId, Asset>> = {};
    // Convert to Sets for O(1) lookups
    const chainIdSet = new Set(chainIds);
    const assetTypeSet = new Set(assetTypes);

    for (const account of accounts) {
      result[account.id] = {};

      const accountBalances = this.state.assetsBalance[account.id] ?? {};

      for (const [assetId, balance] of Object.entries(accountBalances)) {
        const typedAssetId = assetId as Caip19AssetId;
        const assetChainId = extractChainId(typedAssetId);

        if (!chainIdSet.has(assetChainId)) {
          continue;
        }

        const metadataRaw = this.state.assetsMetadata[typedAssetId];

        // Skip assets without metadata
        if (!metadataRaw) {
          continue;
        }

        const metadata = metadataRaw as AssetMetadata;

        // Filter by asset type
        const tokenAssetType = this.#tokenStandardToAssetType(metadata.type);
        if (!assetTypeSet.has(tokenAssetType)) {
          continue;
        }

        const typedBalance = balance as AssetBalance;
        const priceRaw = this.#assetsPrice[typedAssetId];
        const price: AssetPrice = priceRaw ?? {
          price: 0,
          lastUpdated: 0,
        };

        // Compute fiat value using BigNumber for precision
        // Note: typedBalance.amount is already in human-readable format (e.g., "1" for 1 ETH)
        // so we do NOT divide by 10^decimals here
        const balanceAmount = new BigNumberJS(typedBalance.amount || '0');
        const fiatValue = balanceAmount
          .multipliedBy(price.price || 0)
          .toNumber();

        const asset: Asset = {
          id: typedAssetId,
          chainId: assetChainId,
          balance: typedBalance,
          metadata,
          price,
          fiatValue,
        };

        result[account.id][typedAssetId] = asset;
      }
    }

    return result;
  }

  /**
   * Maps a token standard to its corresponding asset type.
   *
   * @param tokenStandard - The token standard from metadata.
   * @returns The corresponding asset type.
   */
  #tokenStandardToAssetType(tokenStandard: string): AssetType {
    switch (tokenStandard) {
      case 'native':
      case 'erc20':
      case 'spl':
        return 'fungible';
      case 'erc721':
        return 'nft';
      case 'erc1155':
        // ERC1155 can be either fungible or non-fungible, treat as collectible
        return 'collectible';
      default:
        // Unknown standards default to fungible
        return 'fungible';
    }
  }

  // ============================================================================
  // START / STOP
  // ============================================================================

  /**
   * Start asset tracking: subscribe to updates and fetch current balances.
   * Called when app opens, account changes, or keyring unlocks.
   */
  #start(): void {
    log('Starting asset tracking', {
      selectedAccountCount: this.#selectedAccounts.length,
      enabledChainCount: this.#enabledChains.size,
    });

    this.#subscribeToDataSources();
    if (this.#selectedAccounts.length > 0) {
      this.getAssets(this.#selectedAccounts, {
        chainIds: [...this.#enabledChains],
        forceUpdate: true,
      }).catch((error) => {
        log('Failed to fetch assets', error);
      });
    }
  }

  /**
   * Stop asset tracking: unsubscribe from all updates.
   * Called when app closes or keyring locks.
   */
  #stop(): void {
    log('Stopping asset tracking', {
      activeSubscriptionCount: this.#activeSubscriptions.size,
      hasPriceSubscription: this.#activeSubscriptions.has('ds:PriceDataSource'),
    });

    // Stop price subscription first (uses direct messenger call)
    this.unsubscribeAssetsPrice();

    // Stop balance subscriptions by properly notifying data sources via messenger
    // This ensures data sources stop their polling timers
    // Convert to array first to avoid modifying map during iteration
    const subscriptionKeys = [...this.#activeSubscriptions.keys()];
    for (const subscriptionKey of subscriptionKeys) {
      // Extract sourceId from subscription key (format: "ds:${sourceId}")
      if (subscriptionKey.startsWith('ds:')) {
        const sourceId = subscriptionKey.slice(3);
        this.#unsubscribeDataSource(sourceId);
      }
    }
    this.#activeSubscriptions.clear();
  }

  /**
   * Subscribe to asset updates for all selected accounts.
   */
  #subscribeToDataSources(): void {
    if (this.#selectedAccounts.length === 0) {
      return;
    }

    // Subscribe to balance updates (batched by data source)
    this.#subscribeAssetsBalance();

    // Subscribe to price updates for all assets held by selected accounts
    this.subscribeAssetsPrice(this.#selectedAccounts, [...this.#enabledChains]);
  }

  /**
   * Subscribe to balance updates for all selected accounts.
   *
   * Strategy to minimize data source calls:
   * 1. Collect all chains to subscribe based on enabled networks
   * 2. Map chains to accounts based on their scopes
   * 3. Split by data source (ordered by priority) - each data source gets ONE subscription
   *
   * This ensures we make minimal subscriptions to each data source while covering
   * all accounts and chains.
   */
  #subscribeAssetsBalance(): void {
    // Step 1: Build chain -> accounts mapping based on account scopes and enabled networks
    const chainToAccounts = this.#buildChainToAccountsMap(
      this.#selectedAccounts,
      this.#enabledChains,
    );

    // Step 2: Split by data source active chains (ordered by priority)
    // Get all chains that need to be subscribed
    const remainingChains = new Set(chainToAccounts.keys());

    // Assign chains to data sources based on availability (ordered by priority)
    const chainAssignment = this.#assignChainsToDataSources(
      Array.from(remainingChains),
    );

    log('Subscribe - chain assignment', {
      totalChains: remainingChains.size,
      dataSourceAssignments: Array.from(chainAssignment.entries()).map(
        ([sourceId, chains]) => ({ sourceId, chainCount: chains.length }),
      ),
    });

    // Subscribe to each data source with its assigned chains and relevant accounts
    for (const sourceId of this.#dataSources.keys()) {
      const assignedChains = chainAssignment.get(sourceId);

      if (!assignedChains || assignedChains.length === 0) {
        // Unsubscribe from data sources with no assigned chains
        this.#unsubscribeDataSource(sourceId);
        continue;
      }

      // Collect unique accounts that need any of the assigned chains
      const accountsForSource = this.#getAccountsForChains(
        assignedChains,
        chainToAccounts,
      );

      if (accountsForSource.length === 0) {
        continue;
      }

      // Subscribe with ONE call per data source
      this.#subscribeToDataSource(sourceId, accountsForSource, assignedChains);
    }
  }

  /**
   * Build a mapping of chainId -> accounts that support that chain.
   * Only includes chains that are in the chainsToSubscribe set.
   *
   * @param accounts - Array of accounts to build mapping for.
   * @param chainsToSubscribe - Set of chain IDs to include in the mapping.
   * @returns Map of chainId to array of accounts that support that chain.
   */
  #buildChainToAccountsMap(
    accounts: InternalAccount[],
    chainsToSubscribe: Set<ChainId>,
  ): Map<ChainId, InternalAccount[]> {
    const chainToAccounts = new Map<ChainId, InternalAccount[]>();

    for (const account of accounts) {
      const accountChains = this.#getEnabledChainsForAccount(account);

      for (const chainId of accountChains) {
        if (!chainsToSubscribe.has(chainId)) {
          continue;
        }

        const existingAccounts = chainToAccounts.get(chainId) ?? [];
        existingAccounts.push(account);
        chainToAccounts.set(chainId, existingAccounts);
      }
    }

    return chainToAccounts;
  }

  /**
   * Get unique accounts that need any of the specified chains.
   *
   * @param chains - Array of chain IDs to find accounts for.
   * @param chainToAccounts - Map of chainId to accounts.
   * @returns Array of unique accounts that need any of the specified chains.
   */
  #getAccountsForChains(
    chains: ChainId[],
    chainToAccounts: Map<ChainId, InternalAccount[]>,
  ): InternalAccount[] {
    const accountIds = new Set<string>();
    const accounts: InternalAccount[] = [];

    for (const chainId of chains) {
      const chainAccounts = chainToAccounts.get(chainId) ?? [];
      for (const account of chainAccounts) {
        if (!accountIds.has(account.id)) {
          accountIds.add(account.id);
          accounts.push(account);
        }
      }
    }

    return accounts;
  }

  /**
   * Subscribe to a specific data source with accounts and chains.
   * Uses the data source ID as the subscription key for batching.
   *
   * @param sourceId - The data source identifier.
   * @param accounts - Array of accounts to subscribe for.
   * @param chains - Array of chain IDs to subscribe for.
   */
  #subscribeToDataSource(
    sourceId: string,
    accounts: InternalAccount[],
    chains: ChainId[],
  ): void {
    const subscriptionKey = `ds:${sourceId}`;
    const existingSubscription = this.#activeSubscriptions.get(subscriptionKey);
    const isUpdate = existingSubscription !== undefined;

    log('Subscribe to data source', {
      sourceId,
      subscriptionKey,
      isUpdate,
      accountCount: accounts.length,
      chainCount: chains.length,
    });

    // Call data source subscribe action via Messenger (fire-and-forget)
    (async (): Promise<void> => {
      try {
        await (this.messenger.call as CallableFunction)(
          `${sourceId}:subscribe`,
          {
            request: {
              accounts,
              chainIds: chains,
              assetTypes: ['fungible'],
              dataTypes: ['balance'],
              updateInterval: this.#defaultUpdateInterval,
            },
            subscriptionId: subscriptionKey,
            isUpdate,
          },
        );
      } catch (error) {
        console.error(
          `[AssetsController] Failed to subscribe to '${sourceId}':`,
          error,
        );
      }
    })().catch(console.error);

    // Track subscription
    const subscription: SubscriptionResponse = {
      chains,
      accountId: subscriptionKey,
      assetTypes: ['fungible'],
      dataTypes: ['balance', 'price'],
      unsubscribe: () => {
        this.#activeSubscriptions.delete(subscriptionKey);
      },
    };

    this.#activeSubscriptions.set(subscriptionKey, subscription);
  }

  /**
   * Unsubscribe from a data source if we have an active subscription.
   *
   * @param sourceId - The data source identifier to unsubscribe from.
   */
  #unsubscribeDataSource(sourceId: string): void {
    const subscriptionKey = `ds:${sourceId}`;
    const existingSubscription = this.#activeSubscriptions.get(subscriptionKey);

    if (existingSubscription) {
      // Fire-and-forget unsubscribe call
      (async (): Promise<void> => {
        try {
          await (this.messenger.call as CallableFunction)(
            `${sourceId}:unsubscribe`,
            subscriptionKey,
          );
        } catch {
          // Ignore errors - source may not have been subscribed
        }
      })().catch(() => {
        // Ignore errors - source may not have been subscribed
      });
      existingSubscription.unsubscribe();
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get the chains that an account supports based on its scopes.
   * Returns the intersection of the account's scopes and the enabled chains.
   *
   * @param account - The account to get supported chains for.
   * @returns Array of ChainIds that the account supports and are enabled.
   */
  #getEnabledChainsForAccount(account: InternalAccount): ChainId[] {
    // Account scopes are CAIP-2 chain IDs like "eip155:1", "solana:mainnet", "bip122:..."
    const scopes = account.scopes ?? [];
    const result: ChainId[] = [];

    for (const scope of scopes) {
      const [namespace, reference] = (scope as string).split(':');

      // Wildcard scope (e.g., "eip155:0" means all enabled chains in that namespace)
      if (reference === '0') {
        for (const chain of this.#enabledChains) {
          if (chain.startsWith(`${namespace}:`)) {
            result.push(chain);
          }
        }
      } else if (namespace === 'eip155' && reference?.startsWith('0x')) {
        // Normalize hex to decimal for EIP155
        result.push(`eip155:${parseInt(reference, 16)}` as ChainId);
      } else {
        result.push(scope);
      }
    }

    return result;
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  async #handleAccountGroupChanged(): Promise<void> {
    const accounts = this.#selectedAccounts;

    log('Account group changed', {
      accountCount: accounts.length,
      accountIds: accounts.map((a) => a.id),
    });

    // Subscribe and fetch for the new account group
    this.#subscribeToDataSources();
    if (accounts.length > 0) {
      await this.getAssets(accounts, {
        chainIds: [...this.#enabledChains],
        forceUpdate: true,
      });
    }
  }

  async #handleEnabledNetworksChanged(
    enabledNetworkMap: NetworkEnablementControllerState['enabledNetworkMap'],
  ): Promise<void> {
    const previousChains = this.#enabledChains;
    this.#enabledChains = this.#extractEnabledChains(enabledNetworkMap);

    // Find newly enabled chains (in new set but not in previous)
    const addedChains: ChainId[] = [];
    for (const chain of this.#enabledChains) {
      if (!previousChains.has(chain)) {
        addedChains.push(chain);
      }
    }

    // Find disabled chains to clean up (in previous but not in new)
    const removedChains: ChainId[] = [];
    for (const chain of previousChains) {
      if (!this.#enabledChains.has(chain)) {
        removedChains.push(chain);
      }
    }

    log('Enabled networks changed', {
      previousCount: previousChains.size,
      newCount: this.#enabledChains.size,
      addedChains,
      removedChains,
    });

    // Note: We intentionally do NOT delete balance data for disabled chains.
    // Users may want to see historical balances even if the network is currently disabled.
    // The data will simply not be updated until the network is re-enabled.

    // Refresh subscriptions for new chain set
    this.#subscribeToDataSources();

    // Do one-time fetch for newly enabled chains
    if (addedChains.length > 0 && this.#selectedAccounts.length > 0) {
      await this.getAssets(this.#selectedAccounts, {
        chainIds: addedChains,
        forceUpdate: true,
      });
    }
  }

  /**
   * Handle assets updated from a data source.
   * Called via `AssetsController:assetsUpdate` action by data sources.
   *
   * @param response - The data response with updated assets
   * @param sourceId - The data source ID reporting the update
   */
  async handleAssetsUpdate(
    response: DataResponse,
    sourceId: string,
  ): Promise<void> {
    log('Assets updated from data source', {
      sourceId,
      hasBalance: Boolean(response.assetsBalance),
      hasPrice: Boolean(response.assetsPrice),
    });
    await this.#handleSubscriptionUpdate(response, sourceId);
  }

  /**
   * Handle an async update from a data source subscription.
   * Enriches response with token metadata before updating state.
   *
   * @param response - The data response from the data source.
   * @param _sourceId - The source ID (unused but kept for logging context).
   * @param request - Optional original request for context.
   */
  async #handleSubscriptionUpdate(
    response: DataResponse,
    _sourceId?: string,
    request?: DataRequest,
  ): Promise<void> {
    // Run through enrichment middlewares (Event Stack: Detection → Token → Price)
    // Include 'metadata' in dataTypes so TokenDataSource runs to enrich detected assets
    const enrichedResponse = await this.#executeMiddlewares(
      [
        this.messenger.call('DetectionMiddleware:getAssetsMiddleware'),
        this.messenger.call('TokenDataSource:getAssetsMiddleware'),
        this.messenger.call('PriceDataSource:getAssetsMiddleware'),
      ],
      request ?? {
        accounts: [],
        chainIds: [],
        dataTypes: ['balance', 'metadata', 'price'],
      },
      response,
    );

    // Update state
    await this.#updateState(enrichedResponse);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    log('Destroying AssetsController', {
      dataSourceCount: this.#dataSources.size,
      subscriptionCount: this.#activeSubscriptions.size,
    });

    // Clear data sources
    this.#dataSources.clear();

    // Stop all active subscriptions
    this.#stop();

    // Unregister action handlers
    this.messenger.unregisterActionHandler('AssetsController:getAssets');
    this.messenger.unregisterActionHandler('AssetsController:getAssetsBalance');
    this.messenger.unregisterActionHandler('AssetsController:getAssetMetadata');
    this.messenger.unregisterActionHandler('AssetsController:getAssetsPrice');
    this.messenger.unregisterActionHandler(
      'AssetsController:activeChainsUpdate',
    );
    this.messenger.unregisterActionHandler('AssetsController:assetsUpdate');
    this.messenger.unregisterActionHandler('AssetsController:addCustomAsset');
    this.messenger.unregisterActionHandler(
      'AssetsController:removeCustomAsset',
    );
    this.messenger.unregisterActionHandler('AssetsController:getCustomAssets');
  }
}
