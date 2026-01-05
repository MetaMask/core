import { toChecksumAddress } from '@ethereumjs/util';
import type {
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from '@metamask/account-tree-controller';
import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type StateMetadata,
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
import { parseCaipAssetType, parseCaipChainId } from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { isEqual } from 'lodash';

import type {
  TokensGetV3AssetsAction,
  PricesGetV3SpotPricesAction,
} from '@metamask/core-backend';

import { projectLogger, createModuleLogger } from '../logger';
import type { AccountsApiDataSourceGetAssetsMiddlewareAction } from './data-sources/AccountsApiDataSource';
import type { DetectionMiddlewareGetAssetsMiddlewareAction } from './data-sources/DetectionMiddleware';
import type {
  PriceDataSourceGetAssetsMiddlewareAction,
  PriceDataSourceFetchAction,
  PriceDataSourceSubscribeAction,
  PriceDataSourceUnsubscribeAction,
} from './data-sources/PriceDataSource';
import type { RpcDataSourceGetAssetsMiddlewareAction } from './data-sources/RpcDataSource';
import type { SnapDataSourceGetAssetsMiddlewareAction } from './data-sources/SnapDataSource';
import type { TokenDataSourceGetAssetsMiddlewareAction } from './data-sources/TokenDataSource';
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
  RegisteredDataSource,
  SubscriptionResponse,
  Asset,
  AssetsControllerStateInternal,
} from './types';

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
};

/**
 * Returns the default state for AssetsController.
 */
export function getDefaultAssetsControllerState(): AssetsControllerState {
  return {
    assetsMetadata: {},
    assetsBalance: {},
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

export type AssetsControllerActions =
  | AssetsControllerGetStateAction
  | AssetsControllerGetAssetsAction
  | AssetsControllerGetAssetsBalanceAction
  | AssetsControllerGetAssetMetadataAction
  | AssetsControllerGetAssetsPriceAction
  | AssetsControllerActiveChainsUpdateAction
  | AssetsControllerAssetsUpdateAction;

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
  payload: [{ assetIds: Caip19AssetId[] }];
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
  | TokensGetV3AssetsAction
  | PricesGetV3SpotPricesAction
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

export interface AssetsControllerOptions {
  messenger: AssetsControllerMessenger;
  state?: Partial<AssetsControllerState>;
  /** Default polling interval hint passed to data sources (ms) */
  defaultUpdateInterval?: number;
}

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
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function extractChainId(assetId: Caip19AssetId): ChainId {
  const parsed = parseCaipAssetType(assetId);
  return parsed.chainId as ChainId;
}

/**
 * Normalizes a CAIP-19 asset ID by checksumming EVM addresses.
 * This ensures consistent asset IDs regardless of the data source format.
 *
 * For EVM ERC20 tokens (e.g., "eip155:1/erc20:0x..."), the address is checksummed.
 * All other asset types are returned unchanged.
 *
 * @param assetId - The CAIP-19 asset ID to normalize
 * @returns The normalized asset ID with checksummed address (for EVM tokens)
 */
function normalizeAssetId(assetId: Caip19AssetId): Caip19AssetId {
  const parsed = parseCaipAssetType(assetId);
  const chainIdParsed = parseCaipChainId(parsed.chainId);

  // Only checksum EVM ERC20 addresses
  if (
    chainIdParsed.namespace === 'eip155' &&
    parsed.assetNamespace === 'erc20'
  ) {
    const checksummedAddress = toChecksumAddress(parsed.assetReference);
    return `${parsed.chainId}/${parsed.assetNamespace}:${checksummedAddress}` as Caip19AssetId;
  }

  return assetId;
}

/**
 * Normalizes all asset IDs in a DataResponse.
 * This is applied at the controller level to ensure consistent state
 * regardless of how data sources format their asset IDs.
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
  private readonly defaultUpdateInterval: number;

  /** Registered data sources */
  private readonly dataSources: RegisteredDataSource[] = [];


  private readonly controllerMutex = new Mutex();

  /**
   * Active balance subscriptions keyed by account ID.
   * Each account has one logical subscription that may span multiple data sources.
   * For example, if WebSocket covers chains A,B and RPC covers chain C,
   * the account subscribes to both data sources for its chains.
   */
  private readonly activeSubscriptions: Map<string, SubscriptionResponse> =
    new Map();

  /** Active price subscription ID (one global subscription for all assets) */
  private activePriceSubscription: string | undefined;

  /**
   * Currently selected accounts - all accounts in the same group as the selected account.
   * This includes accounts across different chain types (EVM, Bitcoin, Solana, Tron, etc.)
   * that belong to the same logical account group (e.g., "Account 1").
   */
  private selectedAccounts: InternalAccount[] = [];

  /** Currently enabled chains from NetworkEnablementController */
  private enabledChains: ChainId[] = [];

  /** Price data for assets (in-memory only, not persisted) */
  private assetsPrice: Record<Caip19AssetId, AssetPrice> = {};

  /**
   * Centralized tracking of available chains per data source.
   * Updated continuously and independently from subscription flows.
   * Key: sourceId, Value: Set of currently available chainIds
   */
  private readonly availableChainsPerSource: Map<string, Set<ChainId>> =
    new Map();

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

    this.defaultUpdateInterval = defaultUpdateInterval;

    log('Initializing AssetsController', {
      defaultUpdateInterval,
    });

    this.initializeState();
    this.subscribeToEvents();
    this.registerActionHandlers();
    this.registerMiddlewares();
  }

  /**
   * Register all middlewares (data sources + enrichment).
   *
   * All middlewares use the same Middleware type. Data source middlewares
   * have additional chain management (activeChains).
   *
   * Middlewares are stacked with reduceRight, so the LAST added runs its
   * after-next code FIRST. Registration order (top to bottom = execution order):
   *
   * Data Source Middlewares (fetch data):
   * 1. WebSocket - real-time push updates
   * 2. AccountsAPI - HTTP polling fallback
   * 3. Snap - Solana/Bitcoin/Tron snaps
   * 4. RPC - direct blockchain queries
   *
   * Enrichment Middlewares (enrich data, no chain management):
   * 5. Detection - identifies newly discovered assets
   * 6. Token - enriches with token metadata
   * 7. Price - fetches prices for assets
   */
  private registerMiddlewares(): void {
    // ========================================================================
    // DATA SOURCES (registration order = subscription order)
    // ========================================================================

    this.registerDataSources([
      'BackendWebsocketDataSource', // Real-time push updates
      'AccountsApiDataSource',      // HTTP polling fallback
      'SnapDataSource',             // Solana/Bitcoin/Tron snaps
      'RpcDataSource',              // Direct blockchain queries
    ]);

  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeState(): void {
    // Initialize selectedAccounts as empty - will be populated when
    // AccountTreeController:selectedAccountGroupChange fires (which happens
    // during AccountTreeController.init() and on account group changes)
    this.selectedAccounts = [];

    const { enabledNetworkMap } = this.messenger.call(
      'NetworkEnablementController:getState',
    );
    this.enabledChains = this.extractEnabledChains(enabledNetworkMap);

    log('Initialized state', {
      enabledNetworkMap,
      enabledChains: this.enabledChains,
    });
  }

  /**
   * Extract enabled chains from enabledNetworkMap.
   * Returns CAIP-2 chain IDs for all enabled networks across all namespaces.
   *
   * Note: For EIP155 (EVM) chains, the reference is normalized to decimal format
   * to ensure consistency with CAIP-2 standard and API responses.
   */
  private extractEnabledChains(
    enabledNetworkMap: NetworkEnablementControllerState['enabledNetworkMap'],
  ): ChainId[] {
    const chains: ChainId[] = [];

    for (const [namespace, networks] of Object.entries(enabledNetworkMap)) {
      for (const [reference, isEnabled] of Object.entries(networks)) {
        if (isEnabled) {
          // Normalize EIP155 chain references from hex to decimal (CAIP-2 standard)
          const normalizedReference = this.normalizeChainReference(
            namespace,
            reference,
          );
          chains.push(`${namespace}:${normalizedReference}` as ChainId);
        }
      }
    }
    return chains;
  }

  /**
   * Normalize chain reference to CAIP-2 standard format.
   * For EIP155, converts hex chain IDs to decimal.
   */
  private normalizeChainReference(
    namespace: string,
    reference: string,
  ): string {
    if (namespace === 'eip155' && reference.startsWith('0x')) {
      // Convert hex to decimal for EIP155 chains
      return parseInt(reference, 16).toString();
    }
    return reference;
  }

  private subscribeToEvents(): void {
    // Subscribe to account group changes (when user switches between account groups like Account 1 -> Account 2)
    this.messenger.subscribe(
      'AccountTreeController:selectedAccountGroupChange',
      () => {
        this.handleAccountGroupChanged().catch(console.error);
      },
    );

    // Subscribe to network enablement changes (only enabledNetworkMap)
    this.messenger.subscribe(
      'NetworkEnablementController:stateChange',
      ({ enabledNetworkMap }) => {
        this.handleEnabledNetworksChanged(enabledNetworkMap).catch(
          console.error,
        );
      },
    );

    // App lifecycle: start when opened, stop when closed
    this.messenger.subscribe('AppStateController:appOpened', () => this.start());
    this.messenger.subscribe('AppStateController:appClosed', () => this.stop());

    // Keyring lifecycle: start when unlocked, stop when locked
    this.messenger.subscribe('KeyringController:unlock', () => this.start());
    this.messenger.subscribe('KeyringController:lock', () => this.stop());
  }

  private registerActionHandlers(): void {
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
  }

  // ============================================================================
  // DATA SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Register data sources with the controller.
   * Order of the array determines subscription order.
   *
   * Data sources report chain changes by calling `AssetsController:activeChainsUpdate` action.
   */
  registerDataSources(dataSourceIds: DataSourceDefinition[]): void {
    for (const id of dataSourceIds) {
      log('Registering data source', { id });

      // Initialize available chains tracking for this source
      this.availableChainsPerSource.set(id, new Set());

      this.dataSources.push(id);
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

    const previousChains = this.availableChainsPerSource.get(dataSourceId) ?? new Set();
    const newChains = new Set(activeChains);

    // Update centralized available chains tracking
    this.availableChainsPerSource.set(dataSourceId, newChains);

    // Check for changes
    const addedChains = activeChains.filter(
      (chain) => !previousChains.has(chain),
    );
    const removedChains = Array.from(previousChains).filter(
      (chain) => !newChains.has(chain),
    );

    if (addedChains.length > 0 || removedChains.length > 0) {
      // Refresh subscriptions to use updated data source availability
      this.subscribe();
    }

    // If chains were added and we have selected accounts, do one-time fetch (respecting scopes)
    if (addedChains.length > 0 && this.selectedAccounts.length > 0) {
      const addedEnabledChains = addedChains.filter((chain) =>
        this.enabledChains.includes(chain),
      );
      if (addedEnabledChains.length > 0) {
        log('Fetching balances for newly added chains', { addedEnabledChains });
        const addedChainsSet = new Set(addedEnabledChains);
        // Fetch per account with only the chains they support
        for (const account of this.selectedAccounts) {
          const accountChains = this.getEnabledChainsForAccount(account);
          const chainsToFetch = accountChains.filter((chain) =>
            addedChainsSet.has(chain),
          );
          if (chainsToFetch.length > 0) {
            this.getAssets([account], {
              chainIds: chainsToFetch,
              forceUpdate: true,
            }).catch((error) => {
              log('Failed to fetch balance for added chains', {
                accountId: account.id,
                error,
              });
            });
          }
        }
      }
    }
  }

  // ============================================================================
  // MIDDLEWARE EXECUTION
  // ============================================================================

  /**
   * Execute middlewares with request/response context.
   * @param middlewares - Middlewares to execute in order
   * @param request - The data request
   * @param initialResponse - Optional initial response (for enriching existing data)
   */
  private async executeMiddlewares(
    middlewares: Middleware[],
    request: DataRequest,
    initialResponse: DataResponse = {},
  ): Promise<DataResponse> {
    const chain = middlewares.reduceRight<NextFunction>(
      (next, middleware) => async (ctx) => {
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
    const chainIds = options?.chainIds ?? this.enabledChains;
    const assetTypes = options?.assetTypes ?? ['fungible'];
    const dataTypes = options?.dataTypes ?? ['balance', 'metadata', 'price'];

    if (options?.forceUpdate) {
      const response = await this.executeMiddlewares(
        [
          this.messenger.call('AccountsApiDataSource:getAssetsMiddleware'),
          this.messenger.call('SnapDataSource:getAssetsMiddleware'),
          this.messenger.call('RpcDataSource:getAssetsMiddleware'),
          this.messenger.call('DetectionMiddleware:getAssetsMiddleware'),
          this.messenger.call('TokenDataSource:getAssetsMiddleware'),
          this.messenger.call('PriceDataSource:getAssetsMiddleware'),
        ], {
        accounts,
        chainIds,
        assetTypes,
        dataTypes,
        forceUpdate: true,
      });
      await this.updateState(response);
    }

    return this.getAssetsFromState(accounts, chainIds, assetTypes);
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
      dataTypes: ['balance'],
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
  // SUBSCRIPTIONS
  // ============================================================================

  /**
   * Assign chains to data sources based on availability.
   * Uses the centralized `availableChainsPerSource` tracking.
   * Returns a map of sourceId -> chains to handle.
   */
  private assignChainsToDataSources(
    requestedChains: ChainId[],
  ): Map<string, ChainId[]> {
    const assignment = new Map<string, ChainId[]>();
    const remainingChains = new Set(requestedChains);

    for (const sourceId of this.dataSources) {
      // Get available chains from centralized tracking
      const availableChains = this.availableChainsPerSource.get(sourceId);
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
   * Subscribe to balance updates for an account.
   *
   * An account may subscribe to multiple data sources if no single source covers
   * all requested chains. For example:
   * - WebSocket data source covers EVM chains
   * - RPC data source covers chains not supported by WebSocket
   * - Snap data source covers non-EVM chains (Bitcoin, Solana, etc.)
   *
   * Subscriptions are set up IN PARALLEL - all data sources are notified simultaneously.
   * Each data source handles its own update mechanism and reports via `AssetsController:assetsUpdate`.
   *
   * @param options - Subscription options
   * @param options.account - The account to subscribe for
   * @param options.chainIds - Chain IDs to subscribe (defaults to enabled chains)
   * @param options.assetTypes - Asset types to watch (defaults to ['fungible'])
   * @param options.dataTypes - Data types to keep fresh (defaults to all)
   * @param options.updateInterval - Hint for data sources that use polling (ms)
   * @returns Subscription response with unsubscribe function
   */
  subscribeAssetsBalance(options: {
    account: InternalAccount;
    chainIds?: ChainId[];
    assetTypes?: AssetType[];
    dataTypes?: DataType[];
    updateInterval?: number;
  }): SubscriptionResponse {
    const {
      account,
      chainIds = this.enabledChains,
      assetTypes = ['fungible'],
      dataTypes = ['balance', 'price'],
      updateInterval = this.defaultUpdateInterval,
    } = options;

    // Check if this is an update to an existing subscription
    const existingSubscription = this.activeSubscriptions.get(account.id);
    const isUpdate = existingSubscription !== undefined;

    // Assign chains to data sources based on availability
    const chainAssignment = this.assignChainsToDataSources(chainIds);

    // Subscribe to all data sources IN PARALLEL
    // Each source only gets the chains it should handle
    // Sources with no assigned chains are unsubscribed to prevent stale polling
    const subscriptionPromises: Promise<void>[] = [];

    for (const sourceId of this.dataSources) {
      const assignedChains = chainAssignment.get(sourceId);

      // If this source has no assigned chains, unsubscribe it
      // This handles the case where chains were reassigned to another source
      if (!assignedChains || assignedChains.length === 0) {
        if (isUpdate) {
          // Only unsubscribe during updates - for new subscriptions there's nothing to clean up
          const unsubscribePromise = (async () => {
            try {
              await (this.messenger.call as CallableFunction)(
                `${sourceId}:unsubscribe`,
                account.id,
              );
              log('Unsubscribed data source with no assigned chains', {
                sourceId,
                accountId: account.id,
              });
            } catch {
              // Ignore errors - source may not have been subscribed
            }
          })();
          subscriptionPromises.push(unsubscribePromise);
        }
        continue;
      }

      // Subscribe to data source
      const promise = (async () => {
        try {
          // Call data source subscribe action via Messenger
          await (this.messenger.call as CallableFunction)(
            `${sourceId}:subscribe`,
            {
              request: {
                accounts: [account],
                chainIds: assignedChains,
                assetTypes,
                dataTypes,
                updateInterval,
              },
              subscriptionId: account.id,
              isUpdate,
            },
          );
        } catch (error) {
          console.error(
            `[AssetsController] Failed to subscribe to '${sourceId}':`,
            error,
          );
        }
      })();

      subscriptionPromises.push(promise);
    }

    // All subscriptions start in parallel - don't await here
    Promise.all(subscriptionPromises).catch(console.error);

    const subscription: SubscriptionResponse = {
      chains: chainIds,
      accountId: account.id,
      assetTypes,
      dataTypes,
      unsubscribe: () => {
        this.activeSubscriptions.delete(account.id);
      },
    };

    this.activeSubscriptions.set(account.id, subscription);
    return subscription;
  }

  /**
   * Subscribe to price updates for all assets held by the given accounts.
   * Polls PriceDataSource which fetches prices from balance state.
   *
   * @param accounts - Accounts to subscribe price updates for
   * @param chainIds - Chain IDs to filter prices for
   * @param options - Subscription options
   * @param options.updateInterval - Polling interval in ms
   */
  subscribeAssetsPrice(
    accounts: InternalAccount[],
    chainIds: ChainId[],
    options: { updateInterval?: number } = {},
  ): void {
    const { updateInterval = this.defaultUpdateInterval } = options;
    const subscriptionId = 'price';

    const isUpdate = this.activePriceSubscription !== undefined;

    this.messenger.call('PriceDataSource:subscribe', {
      request: {
        accounts,
        chainIds,
        dataTypes: ['price'],
        updateInterval,
      },
      subscriptionId,
      isUpdate,
    })

    this.activePriceSubscription = subscriptionId;
  }

  /**
   * Unsubscribe from price updates.
   */
  unsubscribeAssetsPrice(): void {
    if (!this.activePriceSubscription) {
      return;
    }
    this.messenger.call(
      'PriceDataSource:unsubscribe',
      this.activePriceSubscription,
    )
    this.activePriceSubscription = undefined;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  private async updateState(response: DataResponse): Promise<void> {
    // Normalize asset IDs (checksum EVM addresses) before storing in state
    const normalizedResponse = normalizeResponse(response);


    const releaseLock = await this.controllerMutex.acquire();

    try {
      const previousState = this.state;
      const previousPrices = { ...this.assetsPrice };
      const detectedAssets: Record<AccountId, Caip19AssetId[]> = {};

      // Update prices in memory (not persisted in state)
      if (normalizedResponse.assetsPrice) {
        for (const [key, value] of Object.entries(
          normalizedResponse.assetsPrice,
        )) {
          this.assetsPrice[key as Caip19AssetId] = value;
        }
      }

      // Track actual changes for logging
      const changedBalances: Array<{
        accountId: string;
        assetId: string;
        oldAmount: string | undefined;
        newAmount: string;
      }> = [];
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
            if (!isEqual(previousState.assetsMetadata[key as Caip19AssetId], value)) {
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
              const previousBalance = previousBalances[assetId as Caip19AssetId] as { amount: string } | undefined;
              const balanceData = balance as { amount: string };
              const newAmount = balanceData.amount;
              const oldAmount = previousBalance?.amount;

              // Track if this is a new asset
              if (!previousBalance) {
                if (!detectedAssets[accountId]) {
                  detectedAssets[accountId] = [];
                }
                detectedAssets[accountId].push(assetId as Caip19AssetId);
              }

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
      if (changedBalances.length > 0 || changedMetadata.length > 0 || changedPriceAssets.length > 0) {
        log('State updated', {
          changedBalances: changedBalances.length > 0 ? changedBalances : undefined,
          changedMetadataCount: changedMetadata.length > 0 ? changedMetadata.length : undefined,
          changedPricesCount: changedPriceAssets.length > 0 ? changedPriceAssets.length : undefined,
          newAssets: Object.keys(detectedAssets).length > 0
            ? Object.entries(detectedAssets).map(([accountId, assets]) => ({
                accountId,
                assets,
              }))
            : undefined,
        });
      }

      for (const [accountId, assetIds] of Object.entries(detectedAssets)) {
        if (assetIds.length > 0) {
          this.messenger.publish('AssetsController:assetsDetected', {
            accountId,
            assetIds,
          });
        }
      }

      // Note: Prices for newly detected assets are fetched by the price middleware
      // which subscribes to assetsBalance state changes
    } finally {
      releaseLock();
    }
  }

  private getAssetsFromState(
    accounts: InternalAccount[],
    chainIds: ChainId[],
    assetTypes: AssetType[],
  ): Record<AccountId, Record<Caip19AssetId, Asset>> {
    const result: Record<AccountId, Record<Caip19AssetId, Asset>> = {};

    for (const account of accounts) {
      result[account.id] = {};

      const accountBalances = this.state.assetsBalance[account.id] ?? {};

      for (const [assetId, balance] of Object.entries(accountBalances)) {
        const typedAssetId = assetId as Caip19AssetId;
        const assetChainId = extractChainId(typedAssetId);

        if (!chainIds.includes(assetChainId)) {
          continue;
        }

        const metadataRaw = this.state.assetsMetadata[typedAssetId];

        // Skip assets without metadata
        if (!metadataRaw) {
          continue;
        }

        const metadata = metadataRaw as AssetMetadata;

        // Filter by asset type
        const isFungible = ['native', 'erc20', 'spl'].includes(metadata.type);
        const isNft = ['erc721', 'erc1155'].includes(metadata.type);

        if (assetTypes.includes('fungible') && !isFungible) {
          continue;
        }
        if (assetTypes.includes('nft') && !isNft) {
          continue;
        }

        const typedBalance = balance as AssetBalance;
        const priceRaw = this.assetsPrice[typedAssetId];
        const price: AssetPrice = (priceRaw as AssetPrice) ?? {
          price: 0,
          lastUpdated: 0,
        };

        // Compute fiat value
        const balanceAmount = parseFloat(typedBalance.amount) || 0;
        const normalizedAmount =
          balanceAmount / Math.pow(10, metadata.decimals);
        const fiatValue = normalizedAmount * (price.price || 0);

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

  // ============================================================================
  // START / STOP
  // ============================================================================

  /**
   * Start asset tracking: subscribe to updates and fetch current balances.
   * Called when app opens, account changes, or keyring unlocks.
   */
  private start(): void {
    log('Starting asset tracking', {
      selectedAccountCount: this.selectedAccounts.length,
      enabledChainCount: this.enabledChains.length,
    });

    this.subscribe();
    this.fetch().catch((error) => {
      log('Failed to fetch assets', error);
    });
  }

  /**
   * Stop asset tracking: unsubscribe from all updates.
   * Called when app closes or keyring locks.
   */
  private stop(): void {
    log('Stopping asset tracking', {
      activeSubscriptionCount: this.activeSubscriptions.size,
      hasPriceSubscription: !!this.activePriceSubscription,
    });

    // Stop balance subscriptions
    for (const subscription of this.activeSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.activeSubscriptions.clear();

    // Stop price subscription
    this.unsubscribeAssetsPrice();
  }

  /**
   * Subscribe to asset updates for all selected accounts.
   * - Balance subscriptions: each account subscribes to chains it supports
   * - Price subscriptions: one global subscription for all assets in balance state
   *
   * Instead of unsubscribing and resubscribing, this updates existing
   * subscriptions. Data sources receive `isUpdate: true` and can efficiently
   * update (e.g., add/remove chains from WebSocket) without rebuilding connections.
   */
  private subscribe(): void {
    if (this.selectedAccounts.length === 0) {
      return;
    }

    // Subscribe to balance updates for each account
    for (const account of this.selectedAccounts) {
      const chains = this.getEnabledChainsForAccount(account);

      if (chains.length > 0) {
        this.subscribeAssetsBalance({ account, chainIds: chains });
      } else {
        // No chains for this account - unsubscribe if exists
        const existingSubscription = this.activeSubscriptions.get(account.id);
        if (existingSubscription) {
          existingSubscription.unsubscribe();
        }
      }
    }

    // Subscribe to price updates for all assets held by selected accounts
    this.subscribeAssetsPrice(this.selectedAccounts, this.enabledChains);
  }

  /**
   * Fetch assets for all selected accounts, respecting each account's scopes.
   */
  private async fetch(): Promise<void> {
    if (this.selectedAccounts.length === 0) {
      return;
    }

    const fetchPromises = this.selectedAccounts.map((account) => {
      const accountChains = this.getEnabledChainsForAccount(account);
      if (accountChains.length === 0) {
        return Promise.resolve();
      }
      return this.getAssets([account], {
        chainIds: accountChains,
        forceUpdate: true,
      });
    });

    await Promise.all(fetchPromises);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get the chains that an account supports based on its scopes.
   * Returns the intersection of the account's scopes and the enabled chains.
   *
   * @param account - The account to get supported chains for
   * @returns Array of ChainIds that the account supports and are enabled
   */
  private getEnabledChainsForAccount(account: InternalAccount): ChainId[] {
    // Account scopes are CAIP-2 chain IDs like "eip155:1", "solana:mainnet", "bip122:..."
    const scopes = account.scopes ?? [];
    const result: ChainId[] = [];

    for (const scope of scopes) {
      const [namespace, reference] = (scope as string).split(':');

      // Wildcard scope (e.g., "eip155:0" means all enabled chains in that namespace)
      if (reference === '0') {
        const matchingChains = this.enabledChains.filter((chain) =>
          chain.startsWith(`${namespace}:`),
        );
        result.push(...matchingChains);
      } else if (namespace === 'eip155' && reference?.startsWith('0x')) {
        // Normalize hex to decimal for EIP155
        result.push(`eip155:${parseInt(reference, 16)}` as ChainId);
      } else {
        result.push(scope as ChainId);
      }
    }

    return result;
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  private async handleAccountGroupChanged(): Promise<void> {
    // Get all accounts in the currently selected account group
    // AccountTreeController handles the grouping logic based on the selected account
    this.selectedAccounts = this.messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );

    log('Account group changed', {
      accountCount: this.selectedAccounts.length,
      accountIds: this.selectedAccounts.map((a) => a.id),
    });

    // Subscribe and fetch for the new account group
    this.subscribe();
    await this.fetch();
  }

  private async handleEnabledNetworksChanged(
    enabledNetworkMap: NetworkEnablementControllerState['enabledNetworkMap'],
  ): Promise<void> {
    const previousChains = this.enabledChains;
    this.enabledChains = this.extractEnabledChains(enabledNetworkMap);

    // Find newly enabled chains
    const addedChains = this.enabledChains.filter(
      (chain) => !previousChains.includes(chain),
    );

    // Find disabled chains to clean up
    const removedChains = previousChains.filter(
      (chain) => !this.enabledChains.includes(chain),
    );

    log('Enabled networks changed', {
      previousCount: previousChains.length,
      newCount: this.enabledChains.length,
      addedChains,
      removedChains,
    });

    // Clean up state for disabled chains
    if (removedChains.length > 0) {
      this.update((state) => {
        const balances = state.assetsBalance as unknown as Record<
          string,
          Record<string, unknown>
        >;
        for (const accountId of Object.keys(balances)) {
          for (const assetId of Object.keys(balances[accountId])) {
            const assetChainId = extractChainId(assetId as Caip19AssetId);
            if (removedChains.includes(assetChainId)) {
              delete balances[accountId][assetId];
            }
          }
        }
      });
    }

    // Refresh subscriptions for new chain set
    this.subscribe();

    // Do one-time fetch for newly enabled chains (respecting each account's scopes)
    if (addedChains.length > 0 && this.selectedAccounts.length > 0) {
      const addedChainsSet = new Set(addedChains);
      const fetchPromises = this.selectedAccounts.map((account) => {
        // Get only the newly added chains that this account supports
        const accountChains = this.getEnabledChainsForAccount(account);
        const chainsToFetch = accountChains.filter((chain) =>
          addedChainsSet.has(chain),
        );
        if (chainsToFetch.length === 0) {
          return Promise.resolve();
        }
        return this.getAssets([account], {
          chainIds: chainsToFetch,
          forceUpdate: true,
        });
      });
      await Promise.all(fetchPromises);
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
      hasBalance: !!response.assetsBalance,
      hasPrice: !!response.assetsPrice,
    });
    await this.handleSubscriptionUpdate(response, sourceId);
  }

  /**
   * Handle an async update from a data source subscription.
   * Enriches response with token metadata before updating state.
   */
  private async handleSubscriptionUpdate(
    response: DataResponse,
    _sourceId?: string,
    request?: DataRequest,
  ): Promise<void> {
    // Run through enrichment middlewares (Event Stack: Detection → Token → Price)
    const enrichedResponse = await this.executeMiddlewares(
      [
        this.messenger.call('DetectionMiddleware:getAssetsMiddleware'),
        this.messenger.call('TokenDataSource:getAssetsMiddleware'),
        this.messenger.call('PriceDataSource:getAssetsMiddleware'),
      ],
      request ?? { accounts: [], chainIds: [], dataTypes: ['balance', 'price'] },
      response,
    );

    // Update state
    await this.updateState(enrichedResponse);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    log('Destroying AssetsController', {
      dataSourceCount: this.dataSources.length,
      subscriptionCount: this.activeSubscriptions.size,
    });

    // Clear chain tracking
    this.availableChainsPerSource.clear();

    // Stop all active subscriptions
    this.stop();

    // Unregister action handlers
    this.messenger.unregisterActionHandler('AssetsController:getAssets');
    this.messenger.unregisterActionHandler('AssetsController:getAssetsBalance');
    this.messenger.unregisterActionHandler(
      'AssetsController:getAssetMetadata',
    );
    this.messenger.unregisterActionHandler('AssetsController:getAssetsPrice');
    this.messenger.unregisterActionHandler(
      'AssetsController:activeChainsUpdate',
    );
    this.messenger.unregisterActionHandler(
      'AssetsController:assetsUpdate',
    );
  }
}
