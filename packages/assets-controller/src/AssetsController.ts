import type {
  AccountTreeControllerGetAccountsFromSelectedAccountGroupAction,
  AccountTreeControllerSelectedAccountGroupChangeEvent,
} from '@metamask/account-tree-controller';
import type { GetTokenListState } from '@metamask/assets-controllers';
import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type { ClientControllerStateChangeEvent } from '@metamask/client-controller';
import { clientControllerSelectors } from '@metamask/client-controller';
import type {
  ApiPlatformClient,
  BackendWebSocketServiceActions,
  BackendWebSocketServiceEvents,
  SupportedCurrency,
} from '@metamask/core-backend';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type {
  NetworkEnablementControllerGetStateAction,
  NetworkEnablementControllerEvents,
  NetworkEnablementControllerState,
} from '@metamask/network-enablement-controller';
import type {
  GetPermissions,
  PermissionControllerStateChange,
} from '@metamask/permission-controller';
import type { PreferencesControllerStateChangeEvent } from '@metamask/preferences-controller';
import type {
  GetRunnableSnaps,
  HandleSnapRequest,
} from '@metamask/snaps-controllers';
import type {
  TransactionControllerIncomingTransactionsReceivedEvent,
  TransactionControllerTransactionConfirmedEvent,
} from '@metamask/transaction-controller';
import {
  isCaipChainId,
  isStrictHexString,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import { Mutex } from 'async-mutex';
import BigNumberJS from 'bignumber.js';
import { isEqual } from 'lodash';

import type { AssetsControllerMethodActions } from './AssetsController-method-action-types';
import type {
  AbstractDataSource,
  DataSourceState,
  SubscriptionRequest,
} from './data-sources/AbstractDataSource';
import type { AccountsApiDataSourceConfig } from './data-sources/AccountsApiDataSource';
import { AccountsApiDataSource } from './data-sources/AccountsApiDataSource';
import { BackendWebsocketDataSource } from './data-sources/BackendWebsocketDataSource';
import type { PriceDataSourceConfig } from './data-sources/PriceDataSource';
import { PriceDataSource } from './data-sources/PriceDataSource';
import type { RpcDataSourceConfig } from './data-sources/RpcDataSource';
import { RpcDataSource } from './data-sources/RpcDataSource';
import type { AccountsControllerAccountBalancesUpdatedEvent } from './data-sources/SnapDataSource';
import { SnapDataSource } from './data-sources/SnapDataSource';
import type { StakedBalanceDataSourceConfig } from './data-sources/StakedBalanceDataSource';
import { StakedBalanceDataSource } from './data-sources/StakedBalanceDataSource';
import { TokenDataSource } from './data-sources/TokenDataSource';
import { projectLogger, createModuleLogger } from './logger';
import { DetectionMiddleware } from './middlewares/DetectionMiddleware';
import {
  createParallelBalanceMiddleware,
  createParallelMiddleware,
} from './middlewares/ParallelMiddleware';
import type {
  AccountId,
  AssetPreferences,
  AssetsUpdateMode,
  ChainId,
  Caip19AssetId,
  AssetMetadata,
  FungibleAssetMetadata,
  AssetPrice,
  AssetBalance,
  AccountWithSupportedChains,
  AssetType,
  DataType,
  DataRequest,
  DataResponse,
  FetchContext,
  FetchNextFunction,
  NextFunction,
  Middleware,
  SubscriptionResponse,
  Asset,
  AssetsControllerStateInternal,
} from './types';
import { normalizeAssetId } from './utils';

// ============================================================================
// PENDING TOKEN METADATA (UI input format for addCustomAsset)
// ============================================================================

/**
 * Metadata format passed from the UI when adding a custom token.
 * Mirrors the "pendingTokens" shape used by the extension.
 */
export type PendingTokenMetadata = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  iconUrl?: string;
  aggregators?: string[];
  occurrences?: number;
  chainId: string;
  unlisted?: boolean;
};

// ============================================================================
// CONTROLLER CONSTANTS
// ============================================================================

const CONTROLLER_NAME = 'AssetsController' as const;

/** Method names exposed as messenger actions (AssetsController:getAssets, etc.) */
const MESSENGER_EXPOSED_METHODS = [
  'getAssets',
  'getAssetsBalance',
  'getAssetMetadata',
  'getAssetsPrice',
  'addCustomAsset',
  'removeCustomAsset',
  'getCustomAssets',
  'hideAsset',
  'unhideAsset',
] as const;

/** Default polling interval hint for data sources (30 seconds) */
const DEFAULT_POLLING_INTERVAL_MS = 30_000;

const log = createModuleLogger(projectLogger, CONTROLLER_NAME);

// ============================================================================
// STATE TYPES
// ============================================================================

/**
 * State structure for AssetsController.
 *
 * All values are JSON-serializable. UI preferences (e.g. hidden) are in
 * assetPreferences, not in metadata.
 *
 * @see AssetsControllerStateInternal for the semantic type structure
 */
export type AssetsControllerState = {
  /** Shared metadata for all assets (stored once per asset) */
  assetsInfo: { [assetId: string]: AssetMetadata };
  /** Per-account balance data */
  assetsBalance: { [accountId: string]: { [assetId: string]: AssetBalance } };
  /** Price data for assets */
  assetsPrice: { [assetId: string]: AssetPrice };
  /** Custom assets added by users per account (CAIP-19 asset IDs) */
  customAssets: { [accountId: string]: Caip19AssetId[] };
  /** UI preferences per asset (e.g. hidden) */
  assetPreferences: { [assetId: string]: AssetPreferences };
  /** Currently-active ISO 4217 currency code */
  selectedCurrency: SupportedCurrency;
};

/**
 * Returns the default state for AssetsController.
 *
 * @returns The default AssetsController state with empty maps.
 */
export function getDefaultAssetsControllerState(): AssetsControllerState {
  return {
    assetsInfo: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets: {},
    assetPreferences: {},
    selectedCurrency: 'usd',
  };
}

// ============================================================================
// MESSENGER TYPES
// ============================================================================

export type AssetsControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  AssetsControllerState
>;

export type AssetsControllerActions =
  | AssetsControllerGetStateAction
  | AssetsControllerMethodActions;

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
  // AssetsController
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  // RpcDataSource
  | GetTokenListState
  | NetworkControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  // RpcDataSource, StakedBalanceDataSource
  | NetworkEnablementControllerGetStateAction
  // SnapDataSource
  | GetRunnableSnaps
  | HandleSnapRequest
  | GetPermissions
  // BackendWebsocketDataSource
  | BackendWebSocketServiceActions;

type AllowedEvents =
  // AssetsController
  | AccountTreeControllerSelectedAccountGroupChangeEvent
  | ClientControllerStateChangeEvent
  | KeyringControllerLockEvent
  | KeyringControllerUnlockEvent
  | PreferencesControllerStateChangeEvent
  // RpcDataSource, StakedBalanceDataSource
  | NetworkControllerStateChangeEvent
  | TransactionControllerTransactionConfirmedEvent
  | TransactionControllerIncomingTransactionsReceivedEvent
  // StakedBalanceDataSource
  | NetworkEnablementControllerEvents
  // SnapDataSource
  | AccountsControllerAccountBalancesUpdatedEvent
  | PermissionControllerStateChange
  // BackendWebsocketDataSource
  | BackendWebSocketServiceEvents;

export type AssetsControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  AssetsControllerActions | AllowedActions,
  AssetsControllerEvents | AllowedEvents
>;

// ============================================================================
// CONTROLLER OPTIONS
// ============================================================================

/**
 * Payload for the first init/fetch MetaMetrics event.
 * Passed to the optional trackMetaMetricsEvent callback when the initial
 * asset fetch completes after unlock or app open.
 */
export type AssetsControllerFirstInitFetchMetaMetricsPayload = {
  /** Duration of the first init fetch in milliseconds (wall-clock). */
  durationMs: number;
  /** Chain IDs requested in the fetch (e.g. ['eip155:1', 'eip155:137']). */
  chainIds: string[];
  /**
   * Exclusive latency in ms per data source (time spent in that source only).
   * Sum of values approximates durationMs. Order: same as middleware chain.
   */
  durationByDataSource: Record<string, number>;
};

export type AssetsControllerOptions = {
  messenger: AssetsControllerMessenger;
  state?: Partial<AssetsControllerState>;
  /** Default polling interval hint passed to data sources (ms) */
  defaultUpdateInterval?: number;
  /** Function to determine if the controller is enabled. Defaults to true. */
  isEnabled?: () => boolean;
  /**
   * Getter for basic functionality (matches the "Basic functionality" setting in the UI).
   * When it returns true, internet services are on: token/price APIs are used for metadata, price,
   * and price subscription. When false, only RPC is used (no token/price APIs).
   * No value is stored; the getter is invoked when needed.
   * Defaults to () => true when not provided (APIs enabled).
   */
  isBasicFunctionality?: () => boolean;
  /**
   * Called by the controller with an onChange callback. The consumer subscribes to its own
   * basic-functionality source (e.g. PreferencesController:stateChange in extension, or a
   * different mechanism in mobile) and invokes onChange(isBasic) when the value changes.
   * The controller will then refresh its subscriptions. May return an unsubscribe function
   * called on controller destroy. Optional; when omitted, basic-functionality changes are not
   * subscribed to (e.g. host can notify via root messenger or another path).
   */
  subscribeToBasicFunctionalityChange?: (
    onChange: (isBasic: boolean) => void,
  ) => void | (() => void);
  /**
   * API client for balance/price/metadata. The controller instantiates data sources
   * and uses them directly when this is provided.
   */
  queryApiClient: ApiPlatformClient;
  /** Optional configuration for RpcDataSource. */
  rpcDataSourceConfig?: RpcDataSourceConfig;
  /**
   * Optional callback invoked when the first init/fetch completes (e.g. after unlock).
   * Use this to track first init fetch duration in MetaMetrics.
   */
  trackMetaMetricsEvent?: (
    payload: AssetsControllerFirstInitFetchMetaMetricsPayload,
  ) => void;
  /** Optional configuration for AccountsApiDataSource. */
  accountsApiDataSourceConfig?: AccountsApiDataSourceConfig;
  /** Optional configuration for PriceDataSource. */
  priceDataSourceConfig?: PriceDataSourceConfig;
  /** Optional configuration for StakedBalanceDataSource. */
  stakedBalanceDataSourceConfig?: StakedBalanceDataSourceConfig;
};

// ============================================================================
// STATE METADATA
// ============================================================================

const stateMetadata: StateMetadata<AssetsControllerState> = {
  assetsInfo: {
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
  assetsPrice: {
    persist: false,
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
  assetPreferences: {
    persist: true,
    includeInStateLogs: false,
    includeInDebugSnapshot: false,
    usedInUi: true,
  },
  selectedCurrency: {
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

  if (response.assetsInfo) {
    normalized.assetsInfo = {};
    for (const [assetId, metadata] of Object.entries(response.assetsInfo)) {
      const normalizedId = normalizeAssetId(assetId as Caip19AssetId);
      normalized.assetsInfo[normalizedId] = metadata;
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

  if (response.updateMode) {
    normalized.updateMode = response.updateMode;
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
 * 4. **Client + Keyring Lifecycle**: Starts subscriptions only when both the UI is
 *    open (ClientController) and the wallet is unlocked (KeyringController).
 *    Stops when either the UI closes or the keyring locks. See client-controller
 *    README for the combined pattern.
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
  /** Whether the controller is enabled */
  readonly #isEnabled: boolean;

  /** Getter for basic functionality (only balance fetch/subscribe use RPC; token/price API not used). No attribute stored. */
  readonly #isBasicFunctionality: () => boolean;

  /** Default update interval hint passed to data sources */
  readonly #defaultUpdateInterval: number;

  /** Optional callback for first init/fetch MetaMetrics (duration). */
  readonly #trackMetaMetricsEvent?: (
    payload: AssetsControllerFirstInitFetchMetaMetricsPayload,
  ) => void;

  /** Whether we have already reported first init fetch for this session (reset on #stop). */
  #firstInitFetchReported = false;

  /** Whether the client (UI) is open. Combined with #keyringUnlocked for #updateActive. */
  #uiOpen = false;

  /** Whether the keyring is unlocked. Combined with #uiOpen for #updateActive. */
  #keyringUnlocked = false;

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

  readonly #backendWebsocketDataSource: BackendWebsocketDataSource;

  readonly #accountsApiDataSource: AccountsApiDataSource;

  readonly #snapDataSource: SnapDataSource;

  readonly #rpcDataSource: RpcDataSource;

  readonly #stakedBalanceDataSource: StakedBalanceDataSource;

  /**
   * All balance data sources (used for unsubscription in #stop so we can clean up
   * regardless of current isBasicFunctionality mode).
   * Note: StakedBalanceDataSource is excluded because it provides supplementary
   * data and should not participate in chain-claiming.
   *
   * @returns The four balance data source instances in priority order.
   */
  get #allBalanceDataSources(): [
    BackendWebsocketDataSource,
    AccountsApiDataSource,
    SnapDataSource,
    RpcDataSource,
  ] {
    return [
      this.#backendWebsocketDataSource,
      this.#accountsApiDataSource,
      this.#snapDataSource,
      this.#rpcDataSource,
    ];
  }

  readonly #priceDataSource: PriceDataSource;

  readonly #detectionMiddleware: DetectionMiddleware;

  readonly #tokenDataSource: TokenDataSource;

  #unsubscribeBasicFunctionality: (() => void) | null = null;

  readonly #onActiveChainsUpdated: (
    dataSourceId: string,
    activeChains: ChainId[],
    previousChains: ChainId[],
  ) => void;

  constructor({
    messenger,
    state = {},
    defaultUpdateInterval = DEFAULT_POLLING_INTERVAL_MS,
    isEnabled = (): boolean => true,
    isBasicFunctionality,
    subscribeToBasicFunctionalityChange,
    queryApiClient,
    rpcDataSourceConfig,
    trackMetaMetricsEvent,
    accountsApiDataSourceConfig,
    priceDataSourceConfig,
    stakedBalanceDataSourceConfig,
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

    this.#isEnabled = isEnabled();
    this.#isBasicFunctionality = isBasicFunctionality ?? ((): boolean => true);
    this.#defaultUpdateInterval = defaultUpdateInterval;
    this.#trackMetaMetricsEvent = trackMetaMetricsEvent;
    const rpcConfig = rpcDataSourceConfig ?? {};

    this.#onActiveChainsUpdated = (
      dataSourceName: string,
      chains: ChainId[],
      previousChains: ChainId[],
    ): void => {
      this.#handleActiveChainsUpdate(dataSourceName, chains, previousChains);
    };

    this.#backendWebsocketDataSource = new BackendWebsocketDataSource({
      messenger: this.messenger,
      queryApiClient,
      onActiveChainsUpdated: this.#onActiveChainsUpdated,
    });
    this.#accountsApiDataSource = new AccountsApiDataSource({
      queryApiClient,
      onActiveChainsUpdated: this.#onActiveChainsUpdated,
      ...accountsApiDataSourceConfig,
    });
    this.#snapDataSource = new SnapDataSource({
      messenger: this.messenger,
      onActiveChainsUpdated: this.#onActiveChainsUpdated,
    });
    this.#rpcDataSource = new RpcDataSource({
      messenger: this.messenger,
      onActiveChainsUpdated: this.#onActiveChainsUpdated,
      ...rpcConfig,
    });
    this.#stakedBalanceDataSource = new StakedBalanceDataSource({
      messenger: this.messenger,
      onActiveChainsUpdated: this.#onActiveChainsUpdated,
      ...stakedBalanceDataSourceConfig,
    });
    this.#tokenDataSource = new TokenDataSource({
      queryApiClient,
    });
    this.#priceDataSource = new PriceDataSource({
      queryApiClient,
      getSelectedCurrency: (): SupportedCurrency => this.state.selectedCurrency,
      ...priceDataSourceConfig,
    });
    this.#detectionMiddleware = new DetectionMiddleware();

    if (!this.#isEnabled) {
      log('AssetsController is disabled, skipping initialization');
      return;
    }

    log('Initializing AssetsController', {
      defaultUpdateInterval: this.#defaultUpdateInterval,
    });

    this.#initializeState();
    this.#subscribeToEvents();
    this.#registerActionHandlers();
    // Subscriptions start only when both UI is open and keyring unlocked -> #updateActive().

    // Subscribe to basic-functionality changes after construction so a synchronous
    // onChange during subscribe cannot run before data sources are initialized.
    if (subscribeToBasicFunctionalityChange) {
      const unsubscribe = subscribeToBasicFunctionalityChange((isBasic) =>
        this.handleBasicFunctionalityChange(isBasic),
      );
      if (typeof unsubscribe === 'function') {
        this.#unsubscribeBasicFunctionality = unsubscribe;
      }
    }
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
    if (namespace === 'eip155' && isStrictHexString(reference)) {
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

    // Client + Keyring lifecycle: only run when UI is open AND keyring is unlocked
    this.messenger.subscribe(
      'ClientController:stateChange',
      (isUiOpen: boolean) => {
        this.#uiOpen = isUiOpen;
        this.#updateActive();
      },
      clientControllerSelectors.selectIsUiOpen,
    );
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#keyringUnlocked = true;
      this.#updateActive();
    });
    this.messenger.subscribe('KeyringController:lock', () => {
      this.#keyringUnlocked = false;
      this.#updateActive();
    });
  }

  /**
   * Start or stop asset tracking based on client (UI) open state and keyring
   * unlock state. Only runs when both UI is open and keyring is unlocked.
   */
  #updateActive(): void {
    const shouldRun = this.#uiOpen && this.#keyringUnlocked;
    if (shouldRun) {
      this.#start();
    } else {
      this.#stop();
    }
  }

  #registerActionHandlers(): void {
    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  // ============================================================================
  // DATA SOURCE CHAIN MANAGEMENT
  // ============================================================================

  /**
   * Handle when a data source's supported chains change.
   * Used to refresh balance subscriptions and run a one-time fetch when a new chain is supported.
   *
   * - On any add/remove: re-subscribes to data sources so chain assignment stays correct.
   * - When chains are added: fetches balances for the new chains (for selected accounts on enabled networks).
   *
   * Controller does not store chains; sources report via this callback. previousChains is required for diff.
   *
   * @param dataSourceId - The identifier of the data source reporting the change.
   * @param activeChains - Currently active (supported and available) chain IDs for this source.
   * @param previousChains - Previous chains; used to compute added/removed.
   */
  #handleActiveChainsUpdate(
    dataSourceId: string,
    activeChains: ChainId[],
    previousChains: ChainId[],
  ): void {
    if (!this.#isEnabled) {
      return;
    }
    log('Data source active chains changed', {
      dataSourceId,
      chainCount: activeChains.length,
      chains: activeChains,
    });

    const previous: ChainId[] = previousChains;

    const previousSet = new Set(previous);
    const addedChains = activeChains.filter((ch) => !previousSet.has(ch));
    const removedChains = previous.filter((ch) => !activeChains.includes(ch));

    if (addedChains.length > 0 || removedChains.length > 0) {
      // Refresh subscriptions to use updated data source availability
      this.#subscribeAssets();
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
          updateMode: 'merge',
        }).catch((error) => {
          log('Failed to fetch balance for added chains', { error });
        });
      }
    }
  }

  /**
   * Returns the callback passed to data sources for reporting active chain updates.
   * Used by tests to simulate a data source reporting chain changes.
   *
   * @returns The onActiveChainsUpdated callback.
   */
  getOnActiveChainsUpdated(): (
    dataSourceId: string,
    activeChains: ChainId[],
    previousChains: ChainId[],
  ) => void {
    return this.#onActiveChainsUpdated;
  }

  // ============================================================================
  // MIDDLEWARE EXECUTION
  // ============================================================================

  /**
   * Execute middlewares with request/response context.
   * Returns response and exclusive duration per source (sum ≈ wall time).
   *
   * @param sources - Data sources or middlewares with getName() and assetsMiddleware (executed in order).
   * @param request - The data request.
   * @param initialResponse - Optional initial response (for enriching existing data).
   * @returns Response and durationByDataSource (exclusive ms per source name).
   */
  async #executeMiddlewares(
    sources: { getName(): string; assetsMiddleware: Middleware }[],
    request: DataRequest,
    initialResponse: DataResponse = {},
  ): Promise<{
    response: DataResponse;
    durationByDataSource: Record<string, number>;
  }> {
    const names = sources.map((source) => source.getName());
    const middlewares = sources.map((source) => source.assetsMiddleware);
    const inclusive: number[] = [];
    const wrapped = middlewares.map(
      (middleware, i) =>
        (async (
          ctx: FetchContext,
          next: FetchNextFunction,
        ): Promise<{
          request: DataRequest;
          response: DataResponse;
          getAssetsState: () => AssetsControllerStateInternal;
        }> => {
          const start = Date.now();
          try {
            return await middleware(ctx, next);
          } finally {
            inclusive[i] = Date.now() - start;
          }
        }) as Middleware,
    );

    const chain = wrapped.reduceRight<NextFunction>(
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

    const durationByDataSource: Record<string, number> = {};
    for (let i = 0; i < inclusive.length; i++) {
      const nextInc = i + 1 < inclusive.length ? (inclusive[i + 1] ?? 0) : 0;
      const exclusive = Math.max(0, (inclusive[i] ?? 0) - nextInc);
      const name = names[i];
      if (name !== undefined) {
        durationByDataSource[name] = exclusive;
      }
    }
    return { response: result.response, durationByDataSource };
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
      assetsForPriceUpdate?: Caip19AssetId[];
      /** When set to 'merge', fetch result is merged with existing state instead of replacing. Use for partial fetches (e.g. newly added chains). */
      updateMode?: AssetsUpdateMode;
    },
  ): Promise<Record<AccountId, Record<Caip19AssetId, Asset>>> {
    const chainIds = options?.chainIds ?? [...this.#enabledChains];
    const assetTypes = options?.assetTypes ?? ['fungible'];
    const dataTypes = options?.dataTypes ?? ['balance', 'metadata', 'price'];

    if (accounts.length === 0 || chainIds.length === 0) {
      return this.#getAssetsFromState(accounts, chainIds, assetTypes);
    }

    // Collect custom assets for all requested accounts
    const customAssets: Caip19AssetId[] = [];
    for (const account of accounts) {
      const accountCustomAssets = this.getCustomAssets(account.id);
      customAssets.push(...accountCustomAssets);
    }

    if (options?.forceUpdate) {
      const startTime = Date.now();
      const request = this.#buildDataRequest(accounts, chainIds, {
        assetTypes,
        dataTypes,
        customAssets: customAssets.length > 0 ? customAssets : undefined,
        forceUpdate: true,
        assetsForPriceUpdate: options?.assetsForPriceUpdate,
      });
      const sources = this.#isBasicFunctionality()
        ? [
            createParallelBalanceMiddleware([
              this.#accountsApiDataSource,
              this.#snapDataSource,
              this.#rpcDataSource,
              this.#stakedBalanceDataSource,
            ]),
            this.#detectionMiddleware,
            createParallelMiddleware([
              this.#tokenDataSource,
              this.#priceDataSource,
            ]),
          ]
        : [
            this.#rpcDataSource,
            this.#stakedBalanceDataSource,
            this.#detectionMiddleware,
          ];
      const { response, durationByDataSource } = await this.#executeMiddlewares(
        sources,
        request,
      );
      // Default to 'merge' when fetching a subset of chains so we don't wipe
      // balances from chains that weren't included in this fetch.
      const isPartialChainFetch =
        options?.chainIds !== undefined &&
        options.chainIds.length < this.#enabledChains.size;
      const updateMode =
        options?.updateMode ?? (isPartialChainFetch ? 'merge' : 'full');
      await this.#updateState({ ...response, updateMode });
      if (this.#trackMetaMetricsEvent && !this.#firstInitFetchReported) {
        this.#firstInitFetchReported = true;
        const durationMs = Date.now() - startTime;
        this.#trackMetaMetricsEvent({
          durationMs,
          chainIds,
          durationByDataSource,
        });
      }
    }

    const result = this.#getAssetsFromState(accounts, chainIds, assetTypes);
    return result;
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
    return this.state.assetsInfo[assetId] as AssetMetadata | undefined;
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
   * Adding a custom asset also unhides it if it was previously hidden.
   *
   * When `pendingMetadata` is provided (e.g. from the extension's pending-tokens
   * flow), the token metadata is persisted immediately into `assetsInfo` so the
   * UI can render it without waiting for the next pipeline fetch.
   *
   * @param accountId - The account ID to add the custom asset for.
   * @param assetId - The CAIP-19 asset ID to add.
   * @param pendingMetadata - Optional token metadata from the UI (pendingTokens format).
   */
  async addCustomAsset(
    accountId: AccountId,
    assetId: Caip19AssetId,
    pendingMetadata?: PendingTokenMetadata,
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

      // Unhide the asset if it was hidden (via assetPreferences)
      const prefs = state.assetPreferences[normalizedAssetId];
      if (prefs?.hidden) {
        delete prefs.hidden;
        if (Object.keys(prefs).length === 0) {
          delete state.assetPreferences[normalizedAssetId];
        }
      }

      // Persist metadata from the UI so the token is immediately renderable
      if (pendingMetadata) {
        const parsed = parseCaipAssetType(normalizedAssetId);
        let tokenType: FungibleAssetMetadata['type'] = 'erc20';
        if (parsed.assetNamespace === 'slip44') {
          tokenType = 'native';
        } else if (parsed.assetNamespace === 'spl') {
          tokenType = 'spl';
        }

        const assetMetadata: FungibleAssetMetadata = {
          type: tokenType,
          symbol: pendingMetadata.symbol,
          name: pendingMetadata.name,
          decimals: pendingMetadata.decimals,
          image: pendingMetadata.iconUrl,
          aggregators: pendingMetadata.aggregators,
          occurrences: pendingMetadata.occurrences,
        };

        (state.assetsInfo as Record<string, AssetMetadata>)[normalizedAssetId] =
          assetMetadata;
      }
    });

    // Fetch data for the newly added custom asset (merge to preserve other chains)
    const account = this.#selectedAccounts.find((a) => a.id === accountId);
    if (account) {
      const chainId = extractChainId(normalizedAssetId);
      await this.getAssets([account], {
        chainIds: [chainId],
        forceUpdate: true,
        updateMode: 'merge',
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
      if (state.customAssets[accountId]) {
        state.customAssets[accountId] = state.customAssets[accountId].filter(
          (id) => id !== normalizedAssetId,
        );

        // Clean up empty arrays
        if (state.customAssets[accountId].length === 0) {
          delete state.customAssets[accountId];
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
    return this.state.customAssets[accountId] ?? [];
  }

  // ============================================================================
  // HIDDEN ASSETS MANAGEMENT
  // ============================================================================

  /**
   * Hide an asset globally.
   * Hidden assets are excluded from the asset list returned by getAssets.
   * The hidden state is stored in assetPreferences.
   *
   * @param assetId - The CAIP-19 asset ID to hide.
   */
  hideAsset(assetId: Caip19AssetId): void {
    const normalizedAssetId = normalizeAssetId(assetId);

    log('Hiding asset', { assetId: normalizedAssetId });

    this.update((state) => {
      if (!state.assetPreferences[normalizedAssetId]) {
        state.assetPreferences[normalizedAssetId] = {};
      }
      state.assetPreferences[normalizedAssetId].hidden = true;
    });
  }

  /**
   * Unhide an asset globally.
   *
   * @param assetId - The CAIP-19 asset ID to unhide.
   */
  unhideAsset(assetId: Caip19AssetId): void {
    const normalizedAssetId = normalizeAssetId(assetId);

    log('Unhiding asset', { assetId: normalizedAssetId });

    this.update((state) => {
      const prefs = state.assetPreferences[normalizedAssetId];
      if (prefs) {
        delete prefs.hidden;
        if (Object.keys(prefs).length === 0) {
          delete state.assetPreferences[normalizedAssetId];
        }
      }
    });
  }

  // ============================================================================
  // CURRENT CURRENCY MANAGEMENT
  // ============================================================================

  /**
   * Set the current currency.
   *
   * @param selectedCurrency - The ISO 4217 currency code to set.
   */
  setSelectedCurrency(selectedCurrency: SupportedCurrency): void {
    const previousCurrency = this.state.selectedCurrency;

    if (previousCurrency === selectedCurrency) {
      return;
    }

    this.update((state) => {
      state.selectedCurrency = selectedCurrency;
    });

    log('Current currency changed', {
      previousCurrency,
      selectedCurrency,
    });

    this.getAssets(this.#selectedAccounts, {
      forceUpdate: true,
      dataTypes: ['price'],
      assetsForPriceUpdate: Object.values(this.state.assetsBalance).flatMap(
        (balances) => Object.keys(balances) as Caip19AssetId[],
      ),
    }).catch((error) => {
      log('Failed to fetch asset prices after current currency change', error);
    });
  }

  // ============================================================================
  // SUBSCRIPTIONS
  // ============================================================================

  /**
   * Subscribe to price updates for all assets held by the given accounts.
   * Polls PriceDataSource which fetches prices from balance state.
   *
   * @param accounts - Accounts to subscribe price updates for.
   * @param chainIds - Chain IDs to filter prices for.
   */
  subscribeAssetsPrice(accounts: InternalAccount[], chainIds: ChainId[]): void {
    if (!this.#isBasicFunctionality()) {
      return;
    }
    const subscriptionKey = 'ds:PriceDataSource';

    const existingSubscription = this.#activeSubscriptions.get(subscriptionKey);
    const isUpdate = existingSubscription !== undefined;

    const subscribeReq: SubscriptionRequest = {
      request: this.#buildDataRequest(accounts, chainIds, {
        dataTypes: ['price'],
      }),
      subscriptionId: subscriptionKey,
      isUpdate,
      onAssetsUpdate: (response) =>
        this.handleAssetsUpdate(response, 'PriceDataSource'),
      getAssetsState: () => this.state,
    };

    this.#priceDataSource.subscribe(subscribeReq).catch(console.error);

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
    this.#priceDataSource.unsubscribe(subscriptionKey).catch(console.error);
    existingSubscription.unsubscribe();
  }

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  /**
   * Resolves native asset IDs (CAIP-19) for the given chains by looking them up
   * in NetworkEnablementController.nativeAssetIdentifiers.
   * Chains without a registered native identifier are skipped.
   *
   * @param chains - The chain IDs to resolve native assets for.
   * @returns Array of native asset IDs for the chains that have a registered identifier.
   */
  #resolveNativeAssetIds(chains: Iterable<ChainId>): Caip19AssetId[] {
    const { nativeAssetIdentifiers } = this.messenger.call(
      'NetworkEnablementController:getState',
    );
    const ids: Caip19AssetId[] = [];
    for (const chainId of chains) {
      const nativeId = nativeAssetIdentifiers?.[chainId];
      if (nativeId) {
        ids.push(nativeId as Caip19AssetId);
      }
    }
    return ids;
  }

  /**
   * Returns native asset IDs for all enabled chains.
   *
   * @returns Array of native asset IDs, one per enabled chain that has a registered identifier.
   */
  #getNativeAssetIdsForEnabledChains(): Caip19AssetId[] {
    return this.#resolveNativeAssetIds(this.#enabledChains);
  }

  /**
   * Returns native asset IDs for the chains that this account supports
   * (account scopes ∩ enabled chains).
   *
   * @param account - The account (scopes determine which chains apply).
   * @returns Array of native asset IDs, one per supported chain that has a registered identifier.
   */
  #getNativeAssetIdsForAccount(account: InternalAccount): Caip19AssetId[] {
    return this.#resolveNativeAssetIds(
      this.#getEnabledChainsForAccount(account),
    );
  }

  /**
   * Ensures assetsBalance has a 0 balance for each native token (from
   * NetworkEnablementController.nativeAssetIdentifiers) for each selected account.
   * Only adds natives for chains that the account supports (correct accountId ↔ chain mapping).
   */
  #ensureNativeBalancesDefaultZero(): void {
    const accounts = this.#selectedAccounts;
    if (accounts.length === 0) {
      return;
    }
    this.update((state) => {
      const balances = state.assetsBalance as Record<
        string,
        Record<string, AssetBalance>
      >;
      for (const account of accounts) {
        const accountId = account.id;
        const nativeAssetIds = this.#getNativeAssetIdsForAccount(account);
        if (nativeAssetIds.length === 0) {
          continue;
        }
        if (!balances[accountId]) {
          balances[accountId] = {};
        }
        for (const nativeAssetId of nativeAssetIds) {
          if (!(nativeAssetId in balances[accountId])) {
            balances[accountId][nativeAssetId] = { amount: '0' };
          }
        }
      }
    });
  }

  async #updateState(response: DataResponse): Promise<void> {
    const normalizedResponse = normalizeResponse(response);
    const mode: AssetsUpdateMode = normalizedResponse.updateMode ?? 'merge';

    const releaseLock = await this.#controllerMutex.acquire();

    try {
      const previousState = this.state;
      const previousPrices = { ...this.state.assetsPrice };
      // Use detectedAssets from response (assets without metadata)
      const detectedAssets: Record<AccountId, Caip19AssetId[]> =
        normalizedResponse.detectedAssets ?? {};

      // Track actual changes for logging
      const changedBalances: {
        accountId: string;
        assetId: string;
        oldAmount: string | undefined;
        newAmount: string;
      }[] = [];
      const changedMetadata: string[] = [];

      this.update((state) => {
        // Use type assertions to avoid deep type instantiation issues with Immer Draft types
        const metadata = state.assetsInfo as Record<string, AssetMetadata>;
        const balances = state.assetsBalance as Record<
          string,
          Record<string, AssetBalance>
        >;
        const prices = state.assetsPrice as Record<string, AssetPrice>;

        if (normalizedResponse.assetsInfo) {
          for (const [key, value] of Object.entries(
            normalizedResponse.assetsInfo,
          )) {
            if (
              !isEqual(previousState.assetsInfo[key as Caip19AssetId], value)
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
            const customAssetIds =
              (state.customAssets as Record<string, Caip19AssetId[]>)[
                accountId
              ] ?? [];

            // Full: response is authoritative; preserve custom assets not in response.
            // Merge: response overlays previous balances.
            // Callers that fetch partial data (e.g. newly added chains) must set updateMode: 'merge'.
            const effective: Record<string, AssetBalance> =
              mode === 'merge'
                ? { ...previousBalances, ...accountBalances }
                : ((): Record<string, AssetBalance> => {
                    const next: Record<string, AssetBalance> = {
                      ...accountBalances,
                    };
                    for (const customId of customAssetIds) {
                      if (!(customId in next)) {
                        const prev = previousBalances[customId];
                        next[customId] =
                          prev ?? ({ amount: '0' } as AssetBalance);
                      }
                    }
                    return next;
                  })();

            // Ensure native tokens have an entry (0 if missing) for chains this account supports
            const account = this.#selectedAccounts.find(
              (a) => a.id === accountId,
            );
            const nativeAssetIdsForAccount = account
              ? this.#getNativeAssetIdsForAccount(account)
              : this.#getNativeAssetIdsForEnabledChains();
            for (const nativeAssetId of nativeAssetIdsForAccount) {
              if (!(nativeAssetId in effective)) {
                effective[nativeAssetId] = { amount: '0' } as AssetBalance;
              }
            }

            for (const [assetId, balance] of Object.entries(effective)) {
              const previousBalance = previousBalances[
                assetId as Caip19AssetId
              ] as { amount: string } | undefined;
              const newAmount = (balance as { amount: string }).amount;
              const oldAmount = previousBalance?.amount;
              const isNewDefaultNativeZero =
                oldAmount === undefined &&
                newAmount === '0' &&
                nativeAssetIdsForAccount.includes(assetId as Caip19AssetId);
              if (oldAmount !== newAmount && !isNewDefaultNativeZero) {
                changedBalances.push({
                  accountId,
                  assetId,
                  oldAmount,
                  newAmount,
                });
              }
            }
            balances[accountId] = effective;
          }
        }

        // Update prices in state
        if (normalizedResponse.assetsPrice) {
          for (const [key, value] of Object.entries(
            normalizedResponse.assetsPrice,
          )) {
            prices[key] = value;
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

        const metadataRaw = this.state.assetsInfo[typedAssetId];

        // Skip assets without metadata
        if (!metadataRaw) {
          continue;
        }

        const metadata = metadataRaw;

        // Skip hidden assets (assetPreferences)
        const prefs = this.state.assetPreferences[typedAssetId];
        if (prefs?.hidden) {
          continue;
        }

        const assetChainId = extractChainId(typedAssetId);

        if (!chainIdSet.has(assetChainId)) {
          continue;
        }

        // Filter by asset type
        const tokenAssetType = this.#tokenStandardToAssetType(metadata.type);
        if (!assetTypeSet.has(tokenAssetType)) {
          continue;
        }

        const typedBalance = balance;
        const priceRaw = this.state.assetsPrice[typedAssetId];
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

    this.#subscribeAssets();
    this.#ensureNativeBalancesDefaultZero();
    this.getAssets(this.#selectedAccounts, {
      chainIds: [...this.#enabledChains],
      forceUpdate: true,
    }).catch((error) => {
      log('Failed to fetch assets', error);
    });
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

    this.#firstInitFetchReported = false;

    // Stop price subscription first (uses direct messenger call)
    this.unsubscribeAssetsPrice();

    // Stop balance subscriptions by properly notifying data sources via messenger
    // This ensures data sources stop their polling timers.
    // Use #allBalanceDataSources + staked balance source so we unsubscribe from
    // every source that may have been subscribed.
    const allSources = [
      ...this.#allBalanceDataSources,
      this.#stakedBalanceDataSource,
    ];
    const subscriptionKeys = [...this.#activeSubscriptions.keys()];
    for (const subscriptionKey of subscriptionKeys) {
      if (subscriptionKey.startsWith('ds:')) {
        const sourceId = subscriptionKey.slice(3);
        const source = allSources.find((ds) => ds.getName() === sourceId);
        if (source) {
          this.#unsubscribeDataSource(source);
        }
      }
    }
    this.#activeSubscriptions.clear();
  }

  /**
   * Handle basic functionality toggle change. Call this from the consumer (extension or mobile)
   * when the user changes the "Basic functionality" setting. Refreshes subscriptions so the
   * current {@link AssetsControllerOptions.isBasicFunctionality} getter is used (true = APIs on,
   * false = RPC only).
   *
   * @param _isBasic - The new value (for call-site clarity; the getter is the source of truth).
   */
  handleBasicFunctionalityChange(_isBasic: boolean): void {
    this.#stop();
    this.#subscribeAssets();
  }

  /**
   * Subscribe to asset updates for all selected accounts.
   */
  #subscribeAssets(): void {
    if (this.#selectedAccounts.length === 0 || this.#enabledChains.size === 0) {
      return;
    }

    // Subscribe to balance updates (batched by data source)
    this.#subscribeAssetsBalance(this.#selectedAccounts, [
      ...this.#enabledChains,
    ]);

    // Subscribe to staked balance updates (separate from regular balance chain-claiming)
    this.#subscribeStakedBalance(this.#selectedAccounts, [
      ...this.#enabledChains,
    ]);

    // Subscribe to price updates for all assets held by selected accounts
    this.subscribeAssetsPrice(this.#selectedAccounts, [...this.#enabledChains]);
  }

  /**
   * Subscribe to balance updates for the given accounts and chains.
   *
   * Strategy to minimize data source calls:
   * 1. Collect all chains to subscribe based on enabled networks
   * 2. Map chains to accounts based on their scopes
   * 3. Split by data source (ordered by priority) - each data source gets ONE subscription
   *
   * This ensures we make minimal subscriptions to each data source while covering
   * all accounts and chains.
   *
   * @param accounts - Accounts to subscribe balance updates for.
   * @param chainIds - Chain IDs to subscribe for.
   */
  #subscribeAssetsBalance(
    accounts: InternalAccount[],
    chainIds: ChainId[],
  ): void {
    const chainToAccounts = this.#buildChainToAccountsMap(
      accounts,
      new Set(chainIds),
    );
    const remainingChains = new Set(chainToAccounts.keys());

    // When basic functionality is on (getter true), use all balance data sources; when off (getter false), RPC only.
    const balanceDataSources = this.#isBasicFunctionality()
      ? this.#allBalanceDataSources
      : [this.#rpcDataSource];

    for (const source of balanceDataSources) {
      const availableChains = new Set(source.getActiveChainsSync());
      const assignedChains: ChainId[] = [];

      for (const chainId of remainingChains) {
        if (availableChains.has(chainId)) {
          assignedChains.push(chainId);
          remainingChains.delete(chainId);
        }
      }

      if (assignedChains.length === 0) {
        this.#unsubscribeDataSource(source);
        continue;
      }

      const seenIds = new Set<string>();
      const accountsForSource = assignedChains
        .flatMap((chainId) => chainToAccounts.get(chainId) ?? [])
        .filter(
          (account) =>
            !seenIds.has(account.id) && (seenIds.add(account.id), true),
        );
      if (accountsForSource.length > 0) {
        this.#subscribeDataSource(source, accountsForSource, assignedChains);
      }
    }
  }

  /**
   * Subscribe to staked balance updates.
   * Unlike regular balance data sources, the staked balance data source provides
   * supplementary data and does not participate in chain-claiming.
   *
   * @param accounts - Accounts to subscribe staked balance updates for.
   * @param chainIds - Chain IDs to subscribe for.
   */
  #subscribeStakedBalance(
    accounts: InternalAccount[],
    chainIds: ChainId[],
  ): void {
    const source = this.#stakedBalanceDataSource;
    if (!source) {
      return;
    }
    const availableChains = new Set(source.getActiveChainsSync());
    const assignedChains = chainIds.filter((chainId) =>
      availableChains.has(chainId),
    );

    if (assignedChains.length === 0) {
      this.#unsubscribeDataSource(source);
      return;
    }

    this.#subscribeDataSource(source, accounts, assignedChains);
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
      for (const chainId of this.#getEnabledChainsForAccount(account)) {
        if (!chainsToSubscribe.has(chainId)) {
          continue;
        }
        let list = chainToAccounts.get(chainId);
        if (!list) {
          list = [];
          chainToAccounts.set(chainId, list);
        }
        list.push(account);
      }
    }
    return chainToAccounts;
  }

  /**
   * Subscribe to a specific data source with accounts and chains.
   * Uses the data source name as the subscription key for batching.
   *
   * @param source - The balance data source instance.
   * @param accounts - Array of accounts to subscribe for.
   * @param chains - Array of chain IDs to subscribe for.
   */
  #subscribeDataSource(
    source: AbstractDataSource<string, DataSourceState>,
    accounts: InternalAccount[],
    chains: ChainId[],
  ): void {
    const sourceId = source.getName();
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

    const subscribeReq: SubscriptionRequest = {
      request: this.#buildDataRequest(accounts, chains, {
        assetTypes: ['fungible'],
        dataTypes: ['balance'],
        updateInterval: this.#defaultUpdateInterval,
      }),
      subscriptionId: subscriptionKey,
      isUpdate,
      onAssetsUpdate: (response, request) =>
        this.handleAssetsUpdate(response, sourceId, request),
      getAssetsState: () => this.state,
    };

    source.subscribe(subscribeReq).catch((error) => {
      console.error(
        `[AssetsController] Failed to subscribe to '${sourceId}':`,
        error,
      );
    });

    // Track subscription
    const subscription: SubscriptionResponse = {
      chains,
      accountId: subscriptionKey,
      assetTypes: ['fungible'],
      dataTypes: ['balance'],
      unsubscribe: () => {
        this.#activeSubscriptions.delete(subscriptionKey);
      },
    };

    this.#activeSubscriptions.set(subscriptionKey, subscription);
  }

  /**
   * Unsubscribe from a data source if we have an active subscription.
   *
   * @param source - The balance data source instance to unsubscribe from.
   */
  #unsubscribeDataSource(
    source: AbstractDataSource<string, DataSourceState>,
  ): void {
    const subscriptionKey = `ds:${source.getName()}`;
    const existingSubscription = this.#activeSubscriptions.get(subscriptionKey);

    if (existingSubscription) {
      source.unsubscribe(subscriptionKey).catch(() => undefined);
      existingSubscription.unsubscribe();
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Build a DataRequest with accountsWithSupportedChains (enabled chains ∩ account scope ∩ requested chainIds).
   *
   * @param accounts - Accounts to include.
   * @param chainIds - Requested chain IDs (e.g. enabled chains or subset).
   * @param partial - Rest of the request (dataTypes, assetTypes, etc.).
   * @returns DataRequest with accountsWithSupportedChains and chainIds.
   */
  #buildDataRequest(
    accounts: InternalAccount[],
    chainIds: ChainId[],
    partial: Partial<
      Omit<DataRequest, 'accountsWithSupportedChains' | 'chainIds'>
    > = {},
  ): DataRequest {
    const chainIdSet = new Set(chainIds);
    const accountsWithSupportedChains: AccountWithSupportedChains[] =
      accounts.map((account) => ({
        account,
        supportedChains: this.#getEnabledChainsForAccount(account).filter(
          (chain) => chainIdSet.has(chain),
        ),
      }));
    return {
      accountsWithSupportedChains,
      chainIds,
      ...partial,
    } as DataRequest;
  }

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
      const scopeStr = scope as string;
      if (!isCaipChainId(scopeStr)) {
        result.push(scope);
        continue;
      }
      const { namespace, reference } = parseCaipChainId(scopeStr);

      // Wildcard scope (e.g., "eip155:0" means all enabled chains in that namespace)
      if (reference === '0') {
        for (const chain of this.#enabledChains) {
          if (isCaipChainId(chain)) {
            const chainParsed = parseCaipChainId(chain);
            if (chainParsed.namespace === namespace) {
              result.push(chain);
            }
          }
        }
      } else if (namespace === 'eip155' && isStrictHexString(reference)) {
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
    this.#subscribeAssets();
    if (accounts.length > 0) {
      await this.getAssets(accounts, {
        chainIds: [...this.#enabledChains],
        forceUpdate: true,
      });
    }

    this.#ensureNativeBalancesDefaultZero();
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
    this.#subscribeAssets();

    // Do one-time fetch for newly enabled chains; merge so we keep existing chain balances
    if (addedChains.length > 0 && this.#selectedAccounts.length > 0) {
      await this.getAssets(this.#selectedAccounts, {
        chainIds: addedChains,
        forceUpdate: true,
        updateMode: 'merge',
      });
    }

    this.#ensureNativeBalancesDefaultZero();
  }

  /**
   * Handle assets updated from a data source.
   * Called via the onAssetsUpdate callback passed in SubscriptionRequest when the controller subscribes to a data source.
   * Enriches the response with token metadata (via middlewares) before updating state.
   *
   * @param response - The data response with updated assets
   * @param sourceId - The data source ID reporting the update
   * @param request - Optional original request for context when enriching
   */
  async handleAssetsUpdate(
    response: DataResponse,
    sourceId: string,
    request?: DataRequest,
  ): Promise<void> {
    log('Assets updated from data source', {
      sourceId,
      hasBalance: Boolean(response.assetsBalance),
      hasPrice: Boolean(response.assetsPrice),
    });

    // Run through enrichment middlewares (Detection, then Token + Price in parallel)
    // Include 'metadata' in dataTypes so TokenDataSource runs to enrich detected assets
    const { response: enrichedResponse } = await this.#executeMiddlewares(
      [
        this.#detectionMiddleware,
        createParallelMiddleware([
          this.#tokenDataSource,
          this.#priceDataSource,
        ]),
      ],
      request ?? {
        accountsWithSupportedChains: [],
        chainIds: [],
        dataTypes: ['balance', 'metadata', 'price'],
      },
      response,
    );

    await this.#updateState(enrichedResponse);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  destroy(): void {
    log('Destroying AssetsController', {
      dataSourceCount: this.#allBalanceDataSources.length,
      subscriptionCount: this.#activeSubscriptions.size,
    });

    // Destroy instantiated data sources
    this.#backendWebsocketDataSource?.destroy?.();
    this.#accountsApiDataSource?.destroy?.();
    this.#snapDataSource?.destroy?.();
    this.#rpcDataSource?.destroy?.();
    this.#stakedBalanceDataSource?.destroy?.();

    // Stop all active subscriptions
    this.#stop();

    if (this.#unsubscribeBasicFunctionality) {
      this.#unsubscribeBasicFunctionality();
      this.#unsubscribeBasicFunctionality = null;
    }

    // Unregister action handlers
    this.messenger.unregisterActionHandler('AssetsController:getAssets');
    this.messenger.unregisterActionHandler('AssetsController:getAssetsBalance');
    this.messenger.unregisterActionHandler('AssetsController:getAssetMetadata');
    this.messenger.unregisterActionHandler('AssetsController:getAssetsPrice');
    this.messenger.unregisterActionHandler('AssetsController:addCustomAsset');
    this.messenger.unregisterActionHandler(
      'AssetsController:removeCustomAsset',
    );
    this.messenger.unregisterActionHandler('AssetsController:getCustomAssets');
    this.messenger.unregisterActionHandler('AssetsController:hideAsset');
    this.messenger.unregisterActionHandler('AssetsController:unhideAsset');
  }
}
