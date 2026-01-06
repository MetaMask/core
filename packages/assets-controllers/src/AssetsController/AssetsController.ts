import { toChecksumAddress } from '@ethereumjs/util';
import type { AccountsControllerListAccountsAction } from '@metamask/accounts-controller';
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
  AssetByIdResponse,
  TokensGetV3AssetsAction,
} from '@metamask/core-backend';
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
import type { CaipChainId, CaipAssetType, Json } from '@metamask/utils';
import {
  parseCaipAssetType,
  parseCaipChainId,
  isCaipChainId,
} from '@metamask/utils';
import { Mutex } from 'async-mutex';
import { isEqual } from 'lodash';

import { projectLogger, createModuleLogger } from '../logger';
import type {
  AccountId,
  ChainId,
  Caip19AssetId,
  AssetMetadata,
  AssetPrice,
  AssetBalance,
  AssetType,
  DataType,
  DataFetchRequest,
  DataResponse,
  FetchContext,
  SubscribeContext,
  MiddlewareContext,
  NextFunction,
  DataSourceMiddleware,
  DataSourceDefinition,
  RegisteredDataSource,
  SubscriptionResponse,
  Asset,
  UpdateContext,
  UpdateMiddleware,
  UpdateNextFunction,
  UpdateMiddlewareFetchers,
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
 * Internal state structure for AssetsController following normalized design.
 *
 * Keys use string type for JSON serialization compatibility,
 * but semantically represent:
 * - assetsMetadata/assetsPrice keys: CAIP-19 asset IDs (e.g., "eip155:1/erc20:0x...")
 * - assetsBalance outer keys: Account IDs (InternalAccount.id UUIDs)
 * - assetsBalance inner keys: CAIP-19 asset IDs
 */
type AssetsControllerStateInternal = {
  /** Shared metadata for all assets (stored once per asset) */
  assetsMetadata: { [assetId: string]: AssetMetadata };
  /** Price data for assets (stored once per asset) */
  assetsPrice: { [assetId: string]: AssetPrice };
  /** Per-account balance data */
  assetsBalance: { [accountId: string]: { [assetId: string]: AssetBalance } };
};

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
  /** Price data for assets (stored once per asset) */
  assetsPrice: { [assetId: string]: Json };
  /** Per-account balance data */
  assetsBalance: { [accountId: string]: { [assetId: string]: Json } };
};

/**
 * Returns the default state for AssetsController.
 */
export function getDefaultAssetsControllerState(): AssetsControllerState {
  return {
    assetsMetadata: {},
    assetsPrice: {},
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

export type AssetsControllerGetAssetsMetadataAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetsMetadata`;
  handler: AssetsController['getAssetsMetadata'];
};

export type AssetsControllerGetAssetsPriceAction = {
  type: `${typeof CONTROLLER_NAME}:getAssetsPrice`;
  handler: AssetsController['getAssetsPrice'];
};

export type AssetsControllerActions =
  | AssetsControllerGetStateAction
  | AssetsControllerGetAssetsAction
  | AssetsControllerGetAssetsBalanceAction
  | AssetsControllerGetAssetsMetadataAction
  | AssetsControllerGetAssetsPriceAction;

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
  | AccountsControllerListAccountsAction
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  | NetworkEnablementControllerGetStateAction
  | TokensGetV3AssetsAction;

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
  assetsPrice: {
    persist: false,
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
 * - Priority-based selection: highest priority data source handles each chain
 */
export class AssetsController extends BaseController<
  typeof CONTROLLER_NAME,
  AssetsControllerState,
  AssetsControllerMessenger
> {
  /** Default update interval hint passed to data sources */
  private readonly defaultUpdateInterval: number;

  /** Registered data sources sorted by priority (highest first) */
  private readonly dataSources: RegisteredDataSource[] = [];

  /** Update middlewares for processing async responses */
  private readonly updateMiddlewares: UpdateMiddleware[] = [];

  private readonly controllerMutex = new Mutex();

  /** Active subscriptions keyed by subscription identifier */
  private readonly activeSubscriptions: Map<string, SubscriptionResponse> =
    new Map();

  /** Cleanup functions for data source chain change listeners */
  private readonly dataSourceCleanups: Map<string, () => void> = new Map();

  /**
   * Currently selected accounts - all accounts in the same group as the selected account.
   * This includes accounts across different chain types (EVM, Bitcoin, Solana, Tron, etc.)
   * that belong to the same logical account group (e.g., "Account 1").
   */
  private selectedAccounts: InternalAccount[] = [];

  /** Currently enabled chains from NetworkEnablementController */
  private enabledChains: ChainId[] = [];

  /**
   * Active data source per chain - tracks which source is currently handling each chain.
   * Used for failover/recovery to know when to switch sources.
   */
  private readonly activeSourcePerChain: Map<ChainId, string> = new Map();

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
    this.registerDefaultDataSources();

    // Register metadata enrichment middleware to enrich balances with metadata if not present in state
    this.registerMetadataEnrichmentMiddleware();
  }

  /**
   * Register the default data sources.
   *
   * Data sources communicate with AssetsController via Messenger:
   * - AssetsController calls data source actions (e.g., 'AccountsApiDataSource:subscribe')
   * - Data sources publish events (e.g., 'AccountsApiDataSource:assetsUpdated')
   * - AssetsController subscribes to data source events
   *
   * Each data source is a separate service/controller with its own Messenger integration.
   * Data sources should be instantiated before the AssetsController.
   */
  private registerDefaultDataSources(): void {
    // 1. Backend WebSocket - high priority for real-time push updates
    // WebSocket provides instant balance notifications
    this.registerDataSource({
      id: 'BackendWebsocketDataSource',
      priority: 99,
      middleware: this.createMessengerMiddleware('BackendWebsocketDataSource'),
      getActiveChains: async () => {
        try {
          return await (this.messenger.call as CallableFunction)(
            'BackendWebsocketDataSource:getActiveChains',
          );
        } catch {
          return [];
        }
      },
      onActiveChainChange: (callback) => {
        return (this.messenger.subscribe as CallableFunction)(
          'BackendWebsocketDataSource:activeChainsChanged',
          callback,
        );
      },
    });

    // 2. Accounts API - highest priority for initial data fetch
    this.registerDataSource({
      id: 'AccountsApiDataSource',
      priority: 100,
      middleware: this.createMessengerMiddleware('AccountsApiDataSource'),
      getActiveChains: async () => {
        try {
          return await (this.messenger.call as CallableFunction)(
            'AccountsApiDataSource:getActiveChains',
          );
        } catch {
          return [];
        }
      },
      onActiveChainChange: (callback) => {
        return (this.messenger.subscribe as CallableFunction)(
          'AccountsApiDataSource:activeChainsChanged',
          callback,
        );
      },
    });

    // 3. RPC - fallback for EVM chains, direct blockchain queries
    this.registerDataSource({
      id: 'RpcDataSource',
      priority: 50,
      middleware: this.createMessengerMiddleware('RpcDataSource'),
      getActiveChains: async () => {
        try {
          return await (this.messenger.call as CallableFunction)(
            'RpcDataSource:getActiveChains',
          );
        } catch {
          return [];
        }
      },
      onActiveChainChange: (callback) => {
        return (this.messenger.subscribe as CallableFunction)(
          'RpcDataSource:activeChainsChanged',
          callback,
        );
      },
    });

    // 4. Unified Snap Data Source - routes to Solana/Bitcoin/Tron snaps
    // Uses the installed wallet snaps for Solana, Bitcoin, and Tron chains
    this.registerDataSource({
      id: 'SnapDataSource',
      priority: 81, // Higher than native data sources for OTA updates
      middleware: this.createMessengerMiddleware('SnapDataSource'),
      getActiveChains: async () => {
        try {
          return await (this.messenger.call as CallableFunction)(
            'SnapDataSource:getActiveChains',
          );
        } catch {
          return [];
        }
      },
      onActiveChainChange: (callback) => {
        return (this.messenger.subscribe as CallableFunction)(
          'SnapDataSource:activeChainsChanged',
          callback,
        );
      },
    });

    // Note: Additional Snap data sources for non-EVM chains can be registered
    // dynamically when snaps are installed via registerDynamicDataSource()
  }

  /**
   * Create a middleware that communicates with a data source via Messenger.
   * The middleware forwards requests to the data source and handles responses.
   */
  private createMessengerMiddleware(
    dataSourceName: string,
  ): DataSourceMiddleware {
    return async (context, next) => {
      if (context.type === 'fetch') {
        try {
          // Call data source fetch action via Messenger
          const response: DataResponse = await (
            this.messenger.call as CallableFunction
          )(`${dataSourceName}:fetch`, context.request);

          // Merge response into context (deep merge for nested balance objects)
          if (response) {
            if (response.assetsBalance) {
              // Deep merge: preserve existing account balances and add new ones
              if (!context.response.assetsBalance) {
                context.response.assetsBalance = {};
              }
              for (const [accountId, accountBalances] of Object.entries(
                response.assetsBalance,
              )) {
                if (!context.response.assetsBalance[accountId]) {
                  context.response.assetsBalance[accountId] = {};
                }
                // Merge individual asset balances for this account
                context.response.assetsBalance[accountId] = {
                  ...context.response.assetsBalance[accountId],
                  ...accountBalances,
                };
              }

              log('Middleware merged balances from', {
                dataSource: dataSourceName,
                accountsInResponse: Object.keys(response.assetsBalance).length,
                totalAccountsAfterMerge: Object.keys(
                  context.response.assetsBalance,
                ).length,
                totalAssetsAfterMerge: Object.values(
                  context.response.assetsBalance,
                ).reduce(
                  (sum, balances) => sum + Object.keys(balances).length,
                  0,
                ),
              });
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
          }
        } catch (error) {
          console.error(
            `[AssetsController] Fetch via ${dataSourceName} failed:`,
            error,
          );
        }
      } else if (context.type === 'subscribe') {
        try {
          // Call data source subscribe action via Messenger
          await (this.messenger.call as CallableFunction)(
            `${dataSourceName}:subscribe`,
            {
              request: context.request,
              subscriptionId: context.subscriptionId,
              isUpdate: context.isUpdate,
            },
          );

          // Only subscribe to messenger events for NEW subscriptions
          // When isUpdate is true, the existing listener is still active
          // Adding another listener would cause duplicate event handling
          if (!context.isUpdate) {
            // Subscribe to updates from this data source
            const unsubscribe = (this.messenger.subscribe as CallableFunction)(
              `${dataSourceName}:assetsUpdated`,
              (response: DataResponse, sourceId?: string) => {
                context.onUpdate(response, sourceId ?? dataSourceName);
              },
            );

            context.addCleanup(unsubscribe);
          }
        } catch (error) {
          console.error(
            `[AssetsController] Subscribe via ${dataSourceName} failed:`,
            error,
          );
        }
      }

      return next(context);
    };
  }

  /**
   * Register a dynamic data source (e.g., for Snaps).
   *
   * This allows external services to register themselves as data sources
   * at runtime, particularly useful for Snap-based non-EVM chain support.
   *
   * @param sourceId - Unique identifier for the data source
   * @param priority - Priority for chain assignment (higher = preferred)
   */
  registerDynamicDataSource(sourceId: string, priority: number): void {
    this.registerDataSource({
      id: sourceId,
      priority,
      middleware: this.createMessengerMiddleware(sourceId),
      getActiveChains: async () => {
        try {
          return await (this.messenger.call as CallableFunction)(
            `${sourceId}:getActiveChains`,
          );
        } catch {
          return [];
        }
      },
      onActiveChainChange: (callback) => {
        return (this.messenger.subscribe as CallableFunction)(
          `${sourceId}:activeChainsChanged`,
          callback,
        );
      },
    });
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

    // Subscribe to app lifecycle events
    // Start subscriptions when app is opened, stop when closed
    this.messenger.subscribe('AppStateController:appOpened', () => {
      this.handleAppOpened();
    });

    this.messenger.subscribe('AppStateController:appClosed', () => {
      this.handleAppClosed();
    });

    // Subscribe to keyring lock/unlock events
    // Refresh subscriptions when unlocked, stop when locked to conserve resources
    this.messenger.subscribe('KeyringController:unlock', () => {
      console.debug(
        '[AssetsController] Keyring unlocked - refreshing subscriptions',
      );
      this.refreshSubscriptions();
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      console.debug(
        '[AssetsController] Keyring locked - stopping subscriptions',
      );
      this.unsubscribeAll();
    });
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
      'AssetsController:getAssetsMetadata',
      this.getAssetsMetadata.bind(this),
    );

    this.messenger.registerActionHandler(
      'AssetsController:getAssetsPrice',
      this.getAssetsPrice.bind(this),
    );
  }

  // ============================================================================
  // DATA SOURCE MANAGEMENT
  // ============================================================================

  /**
   * Register a data source with the controller.
   * Each data source declares its supported chains asynchronously.
   *
   * Data sources with higher priority are preferred. When a chain becomes
   * unavailable on a source, the controller automatically fails over to a
   * lower priority source for that specific chain. When the chain recovers
   * on the preferred source, it switches back.
   */
  registerDataSource(definition: DataSourceDefinition): void {
    log('Registering data source', {
      id: definition.id,
      priority: definition.priority,
    });

    // Clean up existing data source with same ID if exists
    this.unregisterDataSource(definition.id);

    const registeredSource: RegisteredDataSource = {
      ...definition,
      cachedActiveChains: [], // Will be populated by initial refresh
      lastChainsRefresh: 0,
    };

    // Initialize available chains tracking for this source
    this.availableChainsPerSource.set(definition.id, new Set());

    // Subscribe to active chain changes if the data source supports it
    if (definition.onActiveChainChange) {
      const cleanup = definition.onActiveChainChange((chains) => {
        this.handleDataSourceActiveChainsChanged(definition.id, chains);
      });
      this.dataSourceCleanups.set(definition.id, cleanup);
    }

    this.dataSources.push(registeredSource);
    this.dataSources.sort((a, b) => b.priority - a.priority);

    // Trigger initial async refresh - this will populate availableChainsPerSource
    this.refreshDataSourceChains(definition.id).catch((error) => {
      log('Failed to refresh data source chains', { id: definition.id, error });
    });
  }

  /**
   * Unregister a data source by ID.
   */
  unregisterDataSource(id: string): void {
    const index = this.dataSources.findIndex((ds) => ds.id === id);
    if (index !== -1) {
      this.dataSources.splice(index, 1);
    }

    // Clean up chain change listener
    const chainCleanup = this.dataSourceCleanups.get(id);
    if (chainCleanup) {
      chainCleanup();
      this.dataSourceCleanups.delete(id);
    }

    // Remove from available chains tracking
    this.availableChainsPerSource.delete(id);

    // Remove from active source tracking
    for (const [chainId, sourceId] of this.activeSourcePerChain.entries()) {
      if (sourceId === id) {
        this.activeSourcePerChain.delete(chainId);
      }
    }
  }

  /**
   * Get all chains supported by any data source (sync).
   */
  getAllActiveChains(): ChainId[] {
    const allChains = new Set<ChainId>();
    for (const source of this.dataSources) {
      for (const chain of source.cachedActiveChains) {
        allChains.add(chain);
      }
    }
    return Array.from(allChains);
  }

  /**
   * Get chains that support async/push updates.
   * Data sources that provide `onActiveChainChange` are considered
   * to have async/push capability for their active chains.
   */
  getAsyncActiveChains(): ChainId[] {
    const chains = new Set<ChainId>();
    for (const source of this.dataSources) {
      // Data sources with change notifications are considered async capable
      if (source.onActiveChainChange) {
        for (const chain of source.cachedActiveChains) {
          chains.add(chain);
        }
      }
    }
    return Array.from(chains);
  }

  /**
   * Get the best available data source for a specific chain based on priority.
   * Skips sources that have the chain marked as unavailable.
   * Returns undefined if no data source supports the chain.
   */
  getDataSourceForChain(chainId: ChainId): RegisteredDataSource | undefined {
    // Data sources are already sorted by priority (highest first)
    // Find first source that has this chain active
    return this.dataSources.find((source) =>
      source.cachedActiveChains.includes(chainId),
    );
  }

  /**
   * Get the preferred (highest priority) data source for a chain,
   * regardless of current availability. Used for determining which
   * source should ideally handle a chain.
   */
  getPreferredDataSourceForChain(
    chainId: ChainId,
  ): RegisteredDataSource | undefined {
    return this.dataSources.find((source) =>
      source.cachedActiveChains.includes(chainId),
    );
  }

  // ============================================================================
  // CHAIN AVAILABILITY TRACKING
  // ============================================================================

  /**
   * Get all currently available chains across all data sources.
   * A chain is available if at least one data source can handle it.
   */
  getAvailableChains(): ChainId[] {
    const allChains = new Set<ChainId>();
    for (const chains of this.availableChainsPerSource.values()) {
      for (const chain of chains) {
        allChains.add(chain);
      }
    }
    return Array.from(allChains);
  }

  /**
   * Get available chains for a specific data source.
   */
  getAvailableChainsForSource(sourceId: string): ChainId[] {
    const chains = this.availableChainsPerSource.get(sourceId);
    return chains ? Array.from(chains) : [];
  }

  /**
   * Get a snapshot of all data source chain availability.
   * Useful for debugging and UI display.
   */
  getDataSourceAvailability(): Record<
    string,
    { active: ChainId[]; priority: number }
  > {
    const result: Record<string, { active: ChainId[]; priority: number }> = {};

    for (const source of this.dataSources) {
      const activeChains = this.availableChainsPerSource.get(source.id);
      result[source.id] = {
        active: activeChains ? Array.from(activeChains) : [],
        priority: source.priority,
      };
    }

    return result;
  }

  /**
   * Check if a specific chain is available on any data source.
   */
  isChainAvailable(chainId: ChainId): boolean {
    for (const chains of this.availableChainsPerSource.values()) {
      if (chains.has(chainId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get a mapping of chains to their best data source.
   * Used for understanding current source selection.
   */
  getChainToDataSourceMapping(): Record<ChainId, string> {
    const mapping: Record<ChainId, string> = {};

    for (const chainId of this.enabledChains) {
      const source = this.getDataSourceForChain(chainId);
      if (source) {
        mapping[chainId] = source.id;
      }
    }

    return mapping;
  }

  // ============================================================================
  // UPDATE MIDDLEWARE MANAGEMENT
  // ============================================================================

  /**
   * Register an update middleware to process async responses.
   *
   * Update middlewares are called in order when data sources push updates.
   * Each middleware can:
   * - Inspect and modify the response data
   * - Filter out unwanted data
   * - Enrich data with additional information
   * - Log/monitor updates
   * - Skip calling next() to block the update
   *
   * @param middleware - The update middleware function
   * @example
   * ```typescript
   * // Filter out spam tokens
   * controller.registerUpdateMiddleware(async (context, next) => {
   *   if (context.response.assetsMetadata) {
   *     for (const [assetId, metadata] of Object.entries(context.response.assetsMetadata)) {
   *       if (metadata.isSpam) {
   *         delete context.response.assetsMetadata[assetId];
   *       }
   *     }
   *   }
   *   await next(context);
   * });
   *
   * // Log all updates
   * controller.registerUpdateMiddleware(async (context, next) => {
   *   console.log('Update received:', context.sourceId, context.response);
   *   await next(context);
   * });
   * ```
   */
  registerUpdateMiddleware(middleware: UpdateMiddleware): void {
    this.updateMiddlewares.push(middleware);
  }

  /**
   * Remove all registered update middlewares.
   */
  clearUpdateMiddlewares(): void {
    this.updateMiddlewares.length = 0;
  }

  /**
   * Register the metadata enrichment middleware.
   * POC: Fetches metadata for assets that are missing image in both response and state.
   */
  private registerMetadataEnrichmentMiddleware(): void {
    log('Registering metadata enrichment middleware');

    this.registerUpdateMiddleware(async (context, next) => {
      const { response, getState } = context;
      const currentState = getState();

      // Collect asset IDs that need metadata (missing image in response AND state)
      const assetIdsNeedingMetadata = new Set<string>();

      // Check balances in response for assets needing enrichment
      if (response.assetsBalance) {
        for (const accountBalances of Object.values(response.assetsBalance)) {
          for (const assetId of Object.keys(
            accountBalances as Record<string, unknown>,
          )) {
            const caipAssetId = assetId as Caip19AssetId;

            // Check if image exists in response
            const responseMetadata = response.assetsMetadata?.[caipAssetId] as
              | AssetMetadata
              | undefined;
            if (responseMetadata?.image) {
              continue; // Has image in response, skip
            }

            // Check if image exists in state - if so, skip (no need to fetch again)
            const stateMetadata = currentState.assetsMetadata[caipAssetId] as
              | AssetMetadata
              | undefined;
            if (stateMetadata?.image) {
              continue; // Has image in state, skip
            }

            // No image in response or state - need to fetch
            assetIdsNeedingMetadata.add(assetId);
          }
        }
      }

      // Fetch metadata if we have assets that need it
      if (assetIdsNeedingMetadata.size > 0) {
        log('Metadata enrichment: fetching metadata for assets missing image', {
          count: assetIdsNeedingMetadata.size,
          assetIds: [...assetIdsNeedingMetadata].slice(0, 10), // Log first 10
        });

        try {
          const assetIds = [...assetIdsNeedingMetadata];
          const metadataResponse = await this.messenger.call(
            'BackendApiClient:Tokens:getV3Assets',
            assetIds,
            {
              includeIconUrl: true,
              includeCoingeckoId: true,
              includeOccurrences: true,
            },
          );

          log('Metadata enrichment: received metadata from API', {
            requestedCount: assetIds.length,
            receivedCount: Object.keys(metadataResponse).length,
            receivedAssetIds: Object.keys(metadataResponse),
          });

          // Transform and add metadata to response (only if not already in state)
          if (!response.assetsMetadata) {
            response.assetsMetadata = {};
          }

          for (const [assetId, assetData] of Object.entries(metadataResponse)) {
            try {
              const caipAssetId = assetId as Caip19AssetId;

              // Skip if metadata already exists in state (no need to write again)
              const stateMetadata = currentState.assetsMetadata[caipAssetId] as
                | AssetMetadata
                | undefined;
              if (stateMetadata) {
                // Only update if we have a new image to add
                const iconUrl = assetData.iconUrl ?? assetData.iconUrlThumbnail;
                if (iconUrl && !stateMetadata.image) {
                  response.assetsMetadata[caipAssetId] = {
                    ...stateMetadata,
                    image: iconUrl,
                  };
                  log(
                    'Metadata enrichment: added image to existing state metadata',
                    {
                      assetId: caipAssetId,
                      iconUrl,
                    },
                  );
                } else {
                  log(
                    'Metadata enrichment: skipping, metadata already in state',
                    {
                      assetId: caipAssetId,
                    },
                  );
                }
                continue;
              }

              // Check response metadata
              const responseMetadata = response.assetsMetadata[caipAssetId] as
                | AssetMetadata
                | undefined;
              if (responseMetadata) {
                // Merge icon into existing response metadata
                const iconUrl = assetData.iconUrl ?? assetData.iconUrlThumbnail;
                if (iconUrl && !responseMetadata.image) {
                  response.assetsMetadata[caipAssetId] = {
                    ...responseMetadata,
                    image: iconUrl,
                  };
                  log(
                    'Metadata enrichment: merged icon into response metadata',
                    {
                      assetId: caipAssetId,
                      iconUrl,
                    },
                  );
                }
                continue;
              }

              // No existing metadata anywhere - create full entry
              const transformedMetadata =
                this.transformAssetByIdResponseToMetadata(assetId, assetData);
              response.assetsMetadata[caipAssetId] = transformedMetadata;
              log('Metadata enrichment: created new metadata entry', {
                assetId: caipAssetId,
                metadata: transformedMetadata,
              });
            } catch (assetError) {
              log('Metadata enrichment: failed to process asset', {
                assetId,
                error: assetError,
              });
              // Continue processing other assets - don't fail entire enrichment
            }
          }

          log('Metadata enrichment: response.assetsMetadata after enrichment', {
            metadataCount: Object.keys(response.assetsMetadata).length,
            metadataKeys: Object.keys(response.assetsMetadata),
          });
        } catch (error) {
          log('Metadata enrichment: failed to fetch metadata', { error });
          // Continue without metadata - don't block the update
        }
      }

      // Continue to next middleware
      await next(context);
    });
  }

  /**
   * Transform AssetByIdResponse from Tokens API to AssetMetadata format.
   */
  private transformAssetByIdResponseToMetadata(
    assetId: string,
    assetData: AssetByIdResponse,
  ): AssetMetadata {
    // Determine the token type based on the asset ID
    const parsed = parseCaipAssetType(assetId as CaipAssetType);
    let tokenType: 'native' | 'erc20' | 'spl' = 'erc20';

    if (parsed.assetNamespace === 'slip44') {
      tokenType = 'native';
    } else if (parsed.assetNamespace === 'spl') {
      tokenType = 'spl';
    }

    return {
      type: tokenType,
      name: assetData.name,
      symbol: assetData.symbol,
      decimals: assetData.decimals,
      image: assetData.iconUrl ?? assetData.iconUrlThumbnail,
    };
  }

  /**
   * Execute the update middleware chain for an async response.
   */
  private async executeUpdateMiddlewareChain(
    context: UpdateContext,
    index: number = 0,
  ): Promise<void> {
    if (index >= this.updateMiddlewares.length) {
      // End of middleware chain - update state
      log('executeUpdateMiddlewareChain: end of chain, calling updateState', {
        hasAssetsBalance: !!context.response.assetsBalance,
        hasAssetsMetadata: !!context.response.assetsMetadata,
        hasAssetsPrice: !!context.response.assetsPrice,
        metadataCount: context.response.assetsMetadata
          ? Object.keys(context.response.assetsMetadata).length
          : 0,
        metadataKeys: context.response.assetsMetadata
          ? Object.keys(context.response.assetsMetadata)
          : [],
      });
      await this.updateState(context.response);
      return;
    }

    const middleware = this.updateMiddlewares[index];
    const next: UpdateNextFunction = (ctx) =>
      this.executeUpdateMiddlewareChain(ctx, index + 1);

    try {
      await middleware(context, next);
    } catch (error) {
      console.error(
        `[AssetsController] Update middleware at index ${index} failed:`,
        error,
      );
      // Continue to next middleware on error
      await next(context);
    }
  }

  /**
   * Refresh supported chains for a specific data source.
   */
  async refreshDataSourceChains(dataSourceId: string): Promise<void> {
    const source = this.dataSources.find((ds) => ds.id === dataSourceId);
    if (!source) {
      return;
    }

    try {
      const chains = await source.getActiveChains();
      this.handleDataSourceActiveChainsChanged(dataSourceId, chains);
    } catch (error) {
      console.error(
        `[AssetsController] Failed to refresh chains for data source '${dataSourceId}':`,
        error,
      );
    }
  }

  /**
   * Handle when a data source's active chains change.
   * Active chains are chains that are both supported AND available.
   * Updates centralized chain tracking and triggers re-selection if needed.
   */
  private handleDataSourceActiveChainsChanged(
    dataSourceId: string,
    activeChains: ChainId[],
  ): void {
    const source = this.dataSources.find((ds) => ds.id === dataSourceId);
    if (!source) {
      return;
    }

    const previousChains = new Set(source.cachedActiveChains);
    const newChains = new Set(activeChains);

    // Update cached active chains on the source
    source.cachedActiveChains = activeChains;
    source.lastChainsRefresh = Date.now();

    // Update centralized available chains tracking
    this.availableChainsPerSource.set(dataSourceId, new Set(activeChains));

    // Check for changes
    const addedChains = activeChains.filter(
      (chain) => !previousChains.has(chain),
    );
    const removedChains = Array.from(previousChains).filter(
      (chain) => !newChains.has(chain),
    );

    // Log changes for debugging
    if (addedChains.length > 0 || removedChains.length > 0) {
      log('Data source active chains changed', {
        dataSourceId,
        added: addedChains,
        removed: removedChains,
        totalActiveChains: activeChains.length,
      });

      // Refresh subscriptions to use updated data source availability
      this.refreshSubscriptions();
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
          const accountChains = this.getChainsForAccount(account);
          const chainsToFetch = accountChains.filter((chain) =>
            addedChainsSet.has(chain),
          );
          if (chainsToFetch.length > 0) {
            this.getAssetsBalance([account], {
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

  private async executeMiddlewareChain(
    context: MiddlewareContext,
    index: number = 0,
  ): Promise<MiddlewareContext> {
    if (index >= this.dataSources.length) {
      return context;
    }

    const source = this.dataSources[index];
    const next: NextFunction = (ctx) =>
      this.executeMiddlewareChain(ctx, index + 1);

    try {
      return await source.middleware(context, next);
    } catch (error) {
      console.error(
        `[AssetsController] Data source '${source.id}' failed:`,
        error,
      );
      return next(context);
    }
  }

  // ============================================================================
  // PUBLIC API: QUERY METHODS
  // ============================================================================

  /**
   * Get all currently selected accounts across different chain types.
   * These are all accounts that belong to the same account group (e.g., "Account 1")
   * including EVM, Bitcoin, Solana, Tron, etc. addresses.
   *
   * @returns Array of InternalAccount objects for all selected accounts in the group
   */
  getSelectedAccounts(): InternalAccount[] {
    return [...this.selectedAccounts];
  }

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
    const forceUpdate = options?.forceUpdate ?? false;

    if (forceUpdate) {
      const request: DataFetchRequest = {
        accountIds: accounts.map((a) => a.id),
        addresses: accounts.map((a) => a.address),
        chainIds,
        assetTypes,
        dataTypes,
        forceUpdate: true,
      };

      const context: FetchContext = {
        type: 'fetch',
        request,
        response: {
          assetsBalance: {},
          assetsMetadata: {},
          assetsPrice: {},
        },
      };

      const result = await this.executeMiddlewareChain(context);

      if (result.type === 'fetch') {
        await this.updateState(result.response);
      }
    }

    return this.buildAssetsFromState(accounts, chainIds, assetTypes);
  }

  async getAssetsBalance(
    accounts: InternalAccount[],
    options?: {
      chainIds?: ChainId[];
      assetTypes?: AssetType[];
      forceUpdate?: boolean;
    },
  ): Promise<Record<AccountId, Record<Caip19AssetId, AssetBalance>>> {
    const chainIds = options?.chainIds ?? this.enabledChains;
    const forceUpdate = options?.forceUpdate ?? false;

    if (forceUpdate) {
      const request: DataFetchRequest = {
        accountIds: accounts.map((a) => a.id),
        addresses: accounts.map((a) => a.address),
        chainIds,
        assetTypes: options?.assetTypes ?? ['fungible'],
        dataTypes: ['balance'],
        forceUpdate: true,
      };

      const context: FetchContext = {
        type: 'fetch',
        request,
        response: { assetsBalance: {} },
      };

      const result = await this.executeMiddlewareChain(context);
      if (result.type === 'fetch') {
        await this.updateState(result.response);
      }
    }

    const resultObj: Record<
      AccountId,
      Record<Caip19AssetId, AssetBalance>
    > = {};

    for (const account of accounts) {
      resultObj[account.id] = {};
      const accountBalances = this.state.assetsBalance[account.id] ?? {};

      for (const [assetId, balance] of Object.entries(accountBalances)) {
        const assetChainId = extractChainId(assetId as Caip19AssetId);
        if (chainIds.includes(assetChainId)) {
          resultObj[account.id][assetId as Caip19AssetId] =
            balance as AssetBalance;
        }
      }
    }

    return resultObj;
  }

  async getAssetsMetadata(
    accounts: InternalAccount[],
    options?: {
      chainIds?: ChainId[];
      assetTypes?: AssetType[];
      forceUpdate?: boolean;
    },
  ): Promise<Record<Caip19AssetId, AssetMetadata>> {
    const chainIds = options?.chainIds ?? this.enabledChains;
    const forceUpdate = options?.forceUpdate ?? false;

    if (forceUpdate) {
      const request: DataFetchRequest = {
        accountIds: accounts.map((a) => a.id),
        addresses: accounts.map((a) => a.address),
        chainIds,
        assetTypes: options?.assetTypes ?? ['fungible'],
        dataTypes: ['metadata'],
        forceUpdate: true,
      };

      const context: FetchContext = {
        type: 'fetch',
        request,
        response: { assetsMetadata: {} },
      };

      const result = await this.executeMiddlewareChain(context);
      if (result.type === 'fetch') {
        await this.updateState(result.response);
      }
    }

    const resultObj: Record<Caip19AssetId, AssetMetadata> = {};

    for (const account of accounts) {
      const accountBalances = this.state.assetsBalance[account.id] ?? {};
      for (const assetId of Object.keys(accountBalances)) {
        const assetChainId = extractChainId(assetId as Caip19AssetId);
        if (chainIds.includes(assetChainId)) {
          const metadata = this.state.assetsMetadata[assetId as Caip19AssetId];
          if (metadata) {
            resultObj[assetId as Caip19AssetId] = metadata as AssetMetadata;
          }
        }
      }
    }

    return resultObj;
  }

  async getAssetsPrice(
    accounts: InternalAccount[],
    options?: {
      chainIds?: ChainId[];
      assetTypes?: AssetType[];
      forceUpdate?: boolean;
    },
  ): Promise<Record<Caip19AssetId, AssetPrice>> {
    const chainIds = options?.chainIds ?? this.enabledChains;
    const forceUpdate = options?.forceUpdate ?? false;

    if (forceUpdate) {
      const request: DataFetchRequest = {
        accountIds: accounts.map((a) => a.id),
        addresses: accounts.map((a) => a.address),
        chainIds,
        assetTypes: options?.assetTypes ?? ['fungible'],
        dataTypes: ['price'],
        forceUpdate: true,
      };

      const context: FetchContext = {
        type: 'fetch',
        request,
        response: { assetsPrice: {} },
      };

      const result = await this.executeMiddlewareChain(context);
      if (result.type === 'fetch') {
        await this.updateState(result.response);
      }
    }

    const resultObj: Record<Caip19AssetId, AssetPrice> = {};

    for (const account of accounts) {
      const accountBalances = this.state.assetsBalance[account.id] ?? {};
      for (const assetId of Object.keys(accountBalances)) {
        const assetChainId = extractChainId(assetId as Caip19AssetId);
        if (chainIds.includes(assetChainId)) {
          const price = this.state.assetsPrice[assetId as Caip19AssetId];
          if (price) {
            resultObj[assetId as Caip19AssetId] = price as AssetPrice;
          }
        }
      }
    }

    return resultObj;
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  /**
   * Assign chains to data sources based on priority and availability.
   * Uses the centralized `availableChainsPerSource` tracking.
   * Higher priority sources get first pick of chains they support.
   * Returns a map of sourceId -> chains to handle.
   */
  private assignChainsToDataSources(
    requestedChains: ChainId[],
  ): Map<string, ChainId[]> {
    const assignment = new Map<string, ChainId[]>();
    const remainingChains = new Set(requestedChains);

    // Log available chains per source for debugging
    log('assignChainsToDataSources - available chains per source', {
      requestedChains,
      sources: this.dataSources.map((s) => ({
        id: s.id,
        priority: s.priority,
        availableChains: Array.from(
          this.availableChainsPerSource.get(s.id) ?? [],
        ),
      })),
    });

    // Data sources are already sorted by priority (highest first)
    for (const source of this.dataSources) {
      // Get available chains from centralized tracking
      const availableChains = this.availableChainsPerSource.get(source.id);
      if (!availableChains || availableChains.size === 0) {
        log(
          'assignChainsToDataSources - skipping source (no available chains)',
          {
            sourceId: source.id,
          },
        );
        continue;
      }

      const chainsForThisSource: ChainId[] = [];

      for (const chainId of remainingChains) {
        // Check if this chain is available on this source
        if (availableChains.has(chainId)) {
          chainsForThisSource.push(chainId);
          remainingChains.delete(chainId);
          // Track which source is active for this chain
          this.activeSourcePerChain.set(chainId, source.id);
        }
      }

      if (chainsForThisSource.length > 0) {
        assignment.set(source.id, chainsForThisSource);
        log('assignChainsToDataSources - assigned chains to source', {
          sourceId: source.id,
          chains: chainsForThisSource,
        });
      }
    }

    // Log any chains that couldn't be assigned
    if (remainingChains.size > 0) {
      log('assignChainsToDataSources - UNASSIGNED chains (no data source)', {
        unassignedChains: Array.from(remainingChains),
      });
    }

    return assignment;
  }

  /**
   * Subscribe to asset updates for an account.
   *
   * This sets up async subscriptions with data sources IN PARALLEL.
   * Each data source is assigned chains based on priority:
   * - Higher priority sources get first pick of chains they support
   * - All data sources are notified simultaneously (not sequentially)
   * - Data sources are responsible for their own update mechanisms
   *
   * @param options - Subscription options
   * @param options.account - The account to subscribe for
   * @param options.chainIds - Chain IDs to subscribe (defaults to enabled chains)
   * @param options.assetTypes - Asset types to watch (defaults to ['fungible'])
   * @param options.dataTypes - Data types to keep fresh (defaults to all)
   * @param options.updateInterval - Hint for data sources that use polling (ms)
   * @param options.subscriptionId - Optional ID for the subscription (defaults to account ID)
   * @returns Subscription response with unsubscribe function
   */
  subscribeAssets(options: {
    account: InternalAccount;
    chainIds?: ChainId[];
    assetTypes?: AssetType[];
    dataTypes?: DataType[];
    updateInterval?: number;
    subscriptionId?: string;
  }): SubscriptionResponse {
    const {
      account,
      chainIds = this.enabledChains,
      assetTypes = ['fungible'],
      dataTypes = ['balance', 'metadata', 'price'],
      updateInterval = this.defaultUpdateInterval,
      subscriptionId = account.id,
    } = options;

    // Check if this is an update to an existing subscription
    const existingSubscription = this.activeSubscriptions.get(subscriptionId);
    const isUpdate = existingSubscription !== undefined;

    // For updates, we need to preserve the existing cleanup functions (messenger unsubscribes)
    // Only create a new array for new subscriptions
    const cleanupFunctions: (() => void)[] = [];

    // Track which cleanup functions were inherited from existing subscription
    // We'll need to call these when unsubscribing (cleanup functions are stored in closures within the middleware)

    // Shared update handler for all data sources
    const onUpdate = (response: DataResponse, sourceId?: string) => {
      this.handleSubscriptionUpdate(response, sourceId, {
        accountIds: [account.id],
        addresses: [account.address],
        chainIds,
        assetTypes,
        dataTypes,
        updateInterval,
      }).catch(console.error);
    };

    // Assign chains to data sources based on priority
    const chainAssignment = this.assignChainsToDataSources(chainIds);

    // Subscribe to all data sources IN PARALLEL
    // Each source only gets the chains it should handle
    const subscriptionPromises: Promise<void>[] = [];

    for (const source of this.dataSources) {
      const assignedChains = chainAssignment.get(source.id);
      if (!assignedChains || assignedChains.length === 0) {
        continue; // This source has no chains to handle
      }

      // Create context for this specific data source
      const context: SubscribeContext = {
        type: 'subscribe',
        request: {
          accountIds: [account.id],
          addresses: [account.address],
          chainIds: assignedChains, // Only chains assigned to this source
          assetTypes,
          dataTypes,
          updateInterval,
        },
        subscriptionId,
        isUpdate,
        onUpdate,
        addCleanup: (cleanup) => {
          cleanupFunctions.push(cleanup);
        },
        getRequest: () => ({
          accountIds: [account.id],
          addresses: [account.address],
          chainIds: assignedChains,
          assetTypes,
          dataTypes,
          updateInterval,
        }),
      };

      // Call middleware directly (no chain, just this source)
      // This runs in parallel with other sources
      const promise = source
        .middleware(context, async (ctx) => ctx)
        .then(() => {
          console.debug(
            `[AssetsController] Subscribed to '${source.id}' for chains:`,
            assignedChains,
          );
        })
        .catch((error) => {
          console.error(
            `[AssetsController] Failed to subscribe to '${source.id}':`,
            error,
          );
        });

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
        cleanupFunctions.forEach((cleanup) => cleanup());
        this.activeSubscriptions.delete(subscriptionId);
        // Clear active source tracking for these chains
        for (const chainId of chainIds) {
          this.activeSourcePerChain.delete(chainId);
        }
      },
    };

    this.activeSubscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  private async updateState(response: DataResponse): Promise<void> {
    // Normalize asset IDs (checksum EVM addresses) before storing in state
    const normalizedResponse = normalizeResponse(response);

    // Log what we're about to write to state
    if (normalizedResponse.assetsBalance) {
      for (const [accountId, accountBalances] of Object.entries(
        normalizedResponse.assetsBalance,
      )) {
        const balanceDetails = Object.entries(accountBalances).map(
          ([assetId, balance]) => ({
            assetId,
            amount: balance.amount,
          }),
        );
        log('Writing balances to state', {
          accountId,
          assetCount: Object.keys(accountBalances).length,
          balances: balanceDetails,
        });
      }
    }

    if (normalizedResponse.assetsMetadata) {
      log('Writing metadata to state', {
        assetCount: Object.keys(normalizedResponse.assetsMetadata).length,
        assets: Object.keys(normalizedResponse.assetsMetadata),
      });
    }

    if (normalizedResponse.assetsPrice) {
      log('Writing prices to state', {
        assetCount: Object.keys(normalizedResponse.assetsPrice).length,
        assets: Object.keys(normalizedResponse.assetsPrice),
      });
    }

    const releaseLock = await this.controllerMutex.acquire();

    try {
      const previousState = this.state;
      const detectedAssets: Record<AccountId, Caip19AssetId[]> = {};

      this.update((state) => {
        // Use type assertions to avoid deep type instantiation issues with Draft<Json>
        const metadata = state.assetsMetadata as unknown as Record<
          string,
          unknown
        >;
        const prices = state.assetsPrice as unknown as Record<string, unknown>;
        const balances = state.assetsBalance as unknown as Record<
          string,
          Record<string, unknown>
        >;

        if (normalizedResponse.assetsMetadata) {
          for (const [key, value] of Object.entries(
            normalizedResponse.assetsMetadata,
          )) {
            metadata[key] = value;
          }
        }

        if (normalizedResponse.assetsPrice) {
          for (const [key, value] of Object.entries(
            normalizedResponse.assetsPrice,
          )) {
            prices[key] = value;
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

            for (const assetId of Object.keys(accountBalances)) {
              if (!previousBalances[assetId]) {
                if (!detectedAssets[accountId]) {
                  detectedAssets[accountId] = [];
                }
                detectedAssets[accountId].push(assetId as Caip19AssetId);
              }
            }

            Object.assign(balances[accountId], accountBalances);
          }
        }
      });

      for (const [accountId, assetIds] of Object.entries(detectedAssets)) {
        if (assetIds.length > 0) {
          this.messenger.publish('AssetsController:assetsDetected', {
            accountId,
            assetIds,
          });
        }
      }

      if (normalizedResponse.assetsPrice) {
        const changedPrices = Object.keys(
          normalizedResponse.assetsPrice,
        ).filter(
          (assetId) =>
            !isEqual(
              previousState.assetsPrice[assetId as Caip19AssetId],
              normalizedResponse.assetsPrice?.[assetId as Caip19AssetId],
            ),
        );

        if (changedPrices.length > 0) {
          this.messenger.publish('AssetsController:priceChanged', {
            assetIds: changedPrices as Caip19AssetId[],
          });
        }
      }

      // Log state after update
      const stateAfterUpdate = this.state;
      const totalBalanceAccounts = Object.keys(
        stateAfterUpdate.assetsBalance,
      ).length;
      const totalAssets = Object.values(stateAfterUpdate.assetsBalance).reduce(
        (sum, accountBalances) => sum + Object.keys(accountBalances).length,
        0,
      );
      log('State AFTER updateState', {
        totalBalanceAccounts,
        totalAssets,
        totalMetadata: Object.keys(stateAfterUpdate.assetsMetadata).length,
        totalPrices: Object.keys(stateAfterUpdate.assetsPrice).length,
        accountIds: Object.keys(stateAfterUpdate.assetsBalance),
      });
    } finally {
      releaseLock();
    }
  }

  private buildAssetsFromState(
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
        const priceRaw = this.state.assetsPrice[typedAssetId];
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
  // APP LIFECYCLE HANDLERS
  // ============================================================================

  /**
   * Handle app opened event.
   * Refreshes subscriptions and fetches balances for the selected accounts.
   */
  private handleAppOpened(): void {
    log('App opened - refreshing subscriptions', {
      selectedAccountCount: this.selectedAccounts.length,
      enabledChainCount: this.enabledChains.length,
    });
    this.refreshSubscriptions();

    // Do initial one-time fetch when app opens - fetch per account with their scopes
    this.fetchBalancesForSelectedAccounts().catch((error) => {
      log('Failed to fetch balances for selected accounts', error);
    });
  }

  /**
   * Fetch balances for all selected accounts, respecting each account's scopes.
   * Each account is only queried for chains it supports.
   */
  private async fetchBalancesForSelectedAccounts(): Promise<void> {
    if (this.selectedAccounts.length === 0) {
      log('fetchBalancesForSelectedAccounts - no accounts selected');
      return;
    }

    log('Fetching balances for selected accounts', {
      accounts: this.selectedAccounts.map((a) => ({
        id: a.id,
        address: a.address,
        scopes: a.scopes,
      })),
    });

    // Collect all chains we're going to fetch
    const allChainsToFetch = new Set<ChainId>();
    const fetchPromises = this.selectedAccounts.map((account) => {
      const accountChains = this.getChainsForAccount(account);
      accountChains.forEach((chain) => allChainsToFetch.add(chain));
      if (accountChains.length === 0) {
        log('No chains for account during fetch', { accountId: account.id });
        return Promise.resolve();
      }
      return this.getAssetsBalance([account], {
        chainIds: accountChains,
        forceUpdate: true,
      });
    });

    // Check which chains have data source coverage
    const chainAssignment = this.assignChainsToDataSources(
      Array.from(allChainsToFetch),
    );
    const coveredChains = new Set<ChainId>();
    for (const chains of chainAssignment.values()) {
      chains.forEach((chain) => coveredChains.add(chain));
    }
    const uncoveredChains = Array.from(allChainsToFetch).filter(
      (chain) => !coveredChains.has(chain),
    );

    try {
      await Promise.all(fetchPromises);

      // Log completion status
      if (uncoveredChains.length > 0) {
        log('Fetch WARNING: Uncovered chains (no data source)', {
          uncoveredChains,
        });
      }

      if (coveredChains.size > 0) {
        log('Fetch SUCCESS', {
          coveredChains: Array.from(coveredChains),
          totalRequested: allChainsToFetch.size,
        });
      } else if (allChainsToFetch.size > 0) {
        log('Fetch FAILED - no chains covered', {
          requestedChains: Array.from(allChainsToFetch),
        });
      }
    } catch (error) {
      log('Fetch ERROR', {
        error,
        requestedChains: Array.from(allChainsToFetch),
      });
      throw error;
    }
  }

  /**
   * Handle app closed event.
   * Stops all subscriptions to conserve resources.
   */
  private handleAppClosed(): void {
    log('App closed - stopping subscriptions', {
      activeSubscriptionCount: this.activeSubscriptions.size,
    });
    this.unsubscribeAll();
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Get the chains that an account supports based on its scopes.
   * Returns the intersection of the account's scopes and the enabled chains.
   *
   * @param account - The account to get supported chains for
   * @returns Array of ChainIds that the account supports and are enabled
   */
  private getChainsForAccount(account: InternalAccount): ChainId[] {
    // Account scopes are CAIP-2 chain IDs like "eip155:1", "solana:mainnet", "bip122:..."
    // Special case: "eip155:0" means "all EVM chains"
    const rawScopes = account.scopes ?? [];

    // Check for wildcard scopes (namespace:0 means all chains in that namespace)
    const wildcardNamespaces = new Set<string>();
    const specificScopes = new Set<ChainId>();

    for (const scope of rawScopes) {
      const [namespace, reference] = (scope as string).split(':');

      // "0" reference means wildcard - match all chains in this namespace
      if (reference === '0') {
        wildcardNamespaces.add(namespace);
      } else if (namespace === 'eip155' && reference?.startsWith('0x')) {
        // Normalize hex to decimal for EIP155
        specificScopes.add(`eip155:${parseInt(reference, 16)}` as ChainId);
      } else {
        specificScopes.add(scope as ChainId);
      }
    }

    // Get all available chains from data sources
    const allAvailableChains = this.getAllAvailableChains();

    // Match chains: either specific scope match OR wildcard namespace match
    const result = allAvailableChains.filter((chainId) => {
      // Check specific scope match
      if (specificScopes.has(chainId)) {
        return true;
      }

      // Check wildcard namespace match (e.g., eip155:0 matches all eip155:* chains)
      const [chainNamespace] = chainId.split(':');
      if (wildcardNamespaces.has(chainNamespace)) {
        return true;
      }

      return false;
    });

    // Debug: Always log the comparison for debugging
    log('getChainsForAccount', {
      accountId: account.id,
      rawScopes,
      wildcardNamespaces: Array.from(wildcardNamespaces),
      specificScopes: Array.from(specificScopes),
      allAvailableChainsCount: allAvailableChains.length,
      matchedChains: result,
    });

    return result;
  }

  /**
   * Get all available chains from both enabled networks and data sources.
   * - EVM chains: Use enabledChains from NetworkEnablementController (user-controlled)
   * - Non-EVM chains: Use chains from data sources (automatic based on availability)
   */
  private getAllAvailableChains(): ChainId[] {
    const allChains = new Set<ChainId>();

    // Add enabled EVM chains
    for (const chain of this.enabledChains) {
      allChains.add(chain);
    }

    // Add non-EVM chains from data sources
    // For Solana, Tron, Bitcoin etc., data sources determine availability
    for (const chains of this.availableChainsPerSource.values()) {
      for (const chain of chains) {
        // Only add non-EVM chains from data sources
        // EVM chains are controlled by NetworkEnablementController
        if (!chain.startsWith('eip155:')) {
          allChains.add(chain);
        }
      }
    }

    return Array.from(allChains);
  }

  /**
   * Refresh subscriptions based on current enabled chains and data sources.
   * Called when chains change or data source availability changes.
   *
   * Subscribes to all accounts in the selected group (e.g., EVM, Bitcoin, Solana, Tron
   * addresses that belong to "Account 1"). Each account is only subscribed to the
   * chains it supports based on its scopes.
   *
   * Instead of unsubscribing and resubscribing, this updates the existing
   * subscription. Data sources receive `isUpdate: true` and can efficiently
   * update their subscription (e.g., add/remove chains from WebSocket) without
   * tearing down and rebuilding connections.
   */
  private refreshSubscriptions(): void {
    if (this.selectedAccounts.length === 0) {
      log('No selected accounts - skipping subscription refresh');
      return;
    }

    // Log available data source chains
    const dataSourceAvailability: Record<string, ChainId[]> = {};
    for (const [sourceId, chains] of this.availableChainsPerSource.entries()) {
      dataSourceAvailability[sourceId] = Array.from(chains);
    }

    const allAvailableChains = this.getAllAvailableChains();

    log('Refreshing subscriptions', {
      accountCount: this.selectedAccounts.length,
      enabledChains: this.enabledChains,
      allAvailableChains,
      dataSourceAvailability,
    });

    // Collect all chains we're going to subscribe to
    const allChainsToSubscribe = new Set<ChainId>();

    // Subscribe/update each account in the group
    // Each account gets its own subscription with only the chains it supports
    for (const account of this.selectedAccounts) {
      const autoSubscriptionId = `auto-${account.id}`;
      const accountChains = this.getChainsForAccount(account);

      log('Account subscription details', {
        accountId: account.id,
        address: account.address,
        rawScopes: account.scopes,
        accountChains,
        matchedCount: accountChains.length,
      });

      // Track all chains being subscribed
      accountChains.forEach((chain) => allChainsToSubscribe.add(chain));

      if (accountChains.length > 0) {
        this.subscribeAssets({
          account,
          chainIds: accountChains,
          subscriptionId: autoSubscriptionId,
        });
      } else {
        log('No chains for account - skipping subscription', {
          accountId: account.id,
        });
        // No chains for this account - unsubscribe if exists
        const existingSubscription =
          this.activeSubscriptions.get(autoSubscriptionId);
        if (existingSubscription) {
          existingSubscription.unsubscribe();
        }
      }
    }

    // Check which chains have data source coverage
    const chainAssignment = this.assignChainsToDataSources(
      Array.from(allChainsToSubscribe),
    );

    // Log data source assignments
    const assignmentDetails: Record<string, ChainId[]> = {};
    for (const [sourceId, chains] of chainAssignment.entries()) {
      assignmentDetails[sourceId] = chains;
    }
    log('Data source chain assignments', assignmentDetails);

    const coveredChains = new Set<ChainId>();
    for (const chains of chainAssignment.values()) {
      chains.forEach((chain) => coveredChains.add(chain));
    }
    const uncoveredChains = Array.from(allChainsToSubscribe).filter(
      (chain) => !coveredChains.has(chain),
    );

    // Log subscription result
    if (uncoveredChains.length > 0) {
      log('WARNING: Uncovered chains (no data source available)', {
        uncoveredChains,
      });
    }

    if (coveredChains.size > 0) {
      log('Subscriptions SUCCESS', {
        coveredChains: Array.from(coveredChains),
        totalRequested: allChainsToSubscribe.size,
      });
    } else if (allChainsToSubscribe.size > 0) {
      log('Subscriptions FAILED - no chains covered', {
        requestedChains: Array.from(allChainsToSubscribe),
        availableDataSources: this.dataSources.map((ds) => ({
          id: ds.id,
          cachedActiveChains: ds.cachedActiveChains,
        })),
      });
    } else {
      log('Subscriptions SKIPPED - no chains to subscribe');
    }
  }

  /**
   * Unsubscribe from all active subscriptions.
   */
  private unsubscribeAll(): void {
    for (const subscription of this.activeSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.activeSubscriptions.clear();
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

    // Refresh subscriptions for the new account group
    this.refreshSubscriptions();

    // Do one-time fetch for all accounts in the group (respecting each account's scopes)
    await this.fetchBalancesForSelectedAccounts();
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
    this.refreshSubscriptions();

    // Do one-time fetch for newly enabled chains (respecting each account's scopes)
    if (addedChains.length > 0 && this.selectedAccounts.length > 0) {
      const addedChainsSet = new Set(addedChains);
      const fetchPromises = this.selectedAccounts.map((account) => {
        // Get only the newly added chains that this account supports
        const accountChains = this.getChainsForAccount(account);
        const chainsToFetch = accountChains.filter((chain) =>
          addedChainsSet.has(chain),
        );
        if (chainsToFetch.length === 0) {
          return Promise.resolve();
        }
        return this.getAssetsBalance([account], {
          chainIds: chainsToFetch,
          forceUpdate: true,
        });
      });
      await Promise.all(fetchPromises);
    }
  }

  /**
   * Handle an async update from a data source subscription.
   * Runs the update through the middleware chain before updating state.
   */
  private async handleSubscriptionUpdate(
    response: DataResponse,
    sourceId?: string,
    subscriptionRequest?: DataFetchRequest,
  ): Promise<void> {
    // Create fetcher functions for middlewares to trigger additional queries
    const fetchers: UpdateMiddlewareFetchers = {
      fetchMetadata: async (assetIds: Caip19AssetId[]) => {
        await this.fetchMetadataForAssets(assetIds);
      },
      fetchPrice: async (assetIds: Caip19AssetId[]) => {
        await this.fetchPriceForAssets(assetIds);
      },
      fetchBalance: async (assetIds: Caip19AssetId[]) => {
        await this.fetchBalanceForAssets(assetIds);
      },
    };

    const context: UpdateContext = {
      response,
      sourceId,
      timestamp: Date.now(),
      subscriptionRequest,
      getState: () => ({
        assetsMetadata: { ...this.state.assetsMetadata },
        assetsPrice: { ...this.state.assetsPrice },
        assetsBalance: { ...this.state.assetsBalance },
      }),
      fetchers,
    };

    // If no update middlewares, directly update state
    if (this.updateMiddlewares.length === 0) {
      await this.updateState(response);
      return;
    }

    // Run through update middleware chain
    await this.executeUpdateMiddlewareChain(context);
  }

  /**
   * Fetch metadata for specific assets.
   * Used by update middlewares to enrich data.
   */
  private async fetchMetadataForAssets(
    assetIds: Caip19AssetId[],
  ): Promise<void> {
    if (assetIds.length === 0 || this.selectedAccounts.length === 0) {
      return;
    }

    // Extract unique chain IDs from asset IDs
    const chainIds = [...new Set(assetIds.map((id) => extractChainId(id)))];

    const request: DataFetchRequest = {
      accountIds: this.selectedAccounts.map((a) => a.id),
      addresses: this.selectedAccounts.map((a) => a.address),
      chainIds,
      dataTypes: ['metadata'],
      customAssets: assetIds,
      forceUpdate: true,
    };

    const context: FetchContext = {
      type: 'fetch',
      request,
      response: { assetsMetadata: {} },
    };

    const result = await this.executeMiddlewareChain(context);
    if (result.type === 'fetch' && result.response.assetsMetadata) {
      await this.updateState({
        assetsMetadata: result.response.assetsMetadata,
      });
    }
  }

  /**
   * Fetch prices for specific assets.
   * Used by update middlewares to enrich data.
   */
  private async fetchPriceForAssets(assetIds: Caip19AssetId[]): Promise<void> {
    if (assetIds.length === 0 || this.selectedAccounts.length === 0) {
      return;
    }

    // Extract unique chain IDs from asset IDs
    const chainIds = [...new Set(assetIds.map((id) => extractChainId(id)))];

    const request: DataFetchRequest = {
      accountIds: this.selectedAccounts.map((a) => a.id),
      addresses: this.selectedAccounts.map((a) => a.address),
      chainIds,
      dataTypes: ['price'],
      customAssets: assetIds,
      forceUpdate: true,
    };

    const context: FetchContext = {
      type: 'fetch',
      request,
      response: { assetsPrice: {} },
    };

    const result = await this.executeMiddlewareChain(context);
    if (result.type === 'fetch' && result.response.assetsPrice) {
      await this.updateState({ assetsPrice: result.response.assetsPrice });
    }
  }

  /**
   * Fetch balances for specific assets.
   * Used by update middlewares to enrich data.
   */
  private async fetchBalanceForAssets(
    assetIds: Caip19AssetId[],
  ): Promise<void> {
    if (assetIds.length === 0 || this.selectedAccounts.length === 0) {
      log('fetchBalanceForAssets - skipping (no assets or accounts)');
      return;
    }

    // Extract unique chain IDs from asset IDs
    const chainIds = [...new Set(assetIds.map((id) => extractChainId(id)))];

    log('fetchBalanceForAssets', {
      assetCount: assetIds.length,
      chainIds,
      accountCount: this.selectedAccounts.length,
    });

    const request: DataFetchRequest = {
      accountIds: this.selectedAccounts.map((a) => a.id),
      addresses: this.selectedAccounts.map((a) => a.address),
      chainIds,
      dataTypes: ['balance'],
      customAssets: assetIds,
      forceUpdate: true,
    };

    const context: FetchContext = {
      type: 'fetch',
      request,
      response: { assetsBalance: {} },
    };

    try {
      const result = await this.executeMiddlewareChain(context);
      if (result.type === 'fetch' && result.response.assetsBalance) {
        const balanceCount = Object.keys(result.response.assetsBalance).length;
        log('fetchBalanceForAssets SUCCESS', {
          balanceCount,
          assets: Object.keys(result.response.assetsBalance),
        });
        await this.updateState({
          assetsBalance: result.response.assetsBalance,
        });
      } else {
        log('fetchBalanceForAssets - no balance data in response');
      }
    } catch (error) {
      log('fetchBalanceForAssets ERROR', { error, assetIds });
      throw error;
    }
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    log('Destroying AssetsController', {
      dataSourceCount: this.dataSources.length,
      subscriptionCount: this.activeSubscriptions.size,
    });

    // Clean up data source chain change listeners
    for (const cleanup of this.dataSourceCleanups.values()) {
      cleanup();
    }
    this.dataSourceCleanups.clear();

    // Clear chain tracking
    this.activeSourcePerChain.clear();
    this.availableChainsPerSource.clear();

    // Unsubscribe all active subscriptions
    // This triggers cleanup functions registered by data sources,
    // including any polling/update mechanisms they may have set up
    this.unsubscribeAll();

    // Unregister action handlers
    this.messenger.unregisterActionHandler('AssetsController:getAssets');
    this.messenger.unregisterActionHandler('AssetsController:getAssetsBalance');
    this.messenger.unregisterActionHandler(
      'AssetsController:getAssetsMetadata',
    );
    this.messenger.unregisterActionHandler('AssetsController:getAssetsPrice');
  }
}
