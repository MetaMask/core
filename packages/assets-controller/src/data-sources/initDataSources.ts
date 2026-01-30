import type { ApiPlatformClient } from '@metamask/core-backend';
import { Messenger } from '@metamask/messenger';
import type { ActionConstraint, EventConstraint } from '@metamask/messenger';

import { AccountsApiDataSource } from './AccountsApiDataSource';
import type {
  AccountsApiDataSourceActions,
  AccountsApiDataSourceAllowedActions,
  AccountsApiDataSourceEvents,
  AccountsApiDataSourceMessenger,
} from './AccountsApiDataSource';
import { BackendWebsocketDataSource } from './BackendWebsocketDataSource';
import type {
  BackendWebsocketDataSourceActions,
  BackendWebsocketDataSourceAllowedActions,
  BackendWebsocketDataSourceAllowedEvents,
  BackendWebsocketDataSourceEvents,
  BackendWebsocketDataSourceMessenger,
} from './BackendWebsocketDataSource';
import { PriceDataSource } from './PriceDataSource';
import type {
  PriceDataSourceActions,
  PriceDataSourceAllowedActions,
  PriceDataSourceEvents,
  PriceDataSourceMessenger,
} from './PriceDataSource';
import { RpcDataSource } from './RpcDataSource';
import type {
  RpcDataSourceActions,
  RpcDataSourceAllowedActions,
  RpcDataSourceAllowedEvents,
  RpcDataSourceEvents,
  RpcDataSourceMessenger,
} from './RpcDataSource';
import { SnapDataSource } from './SnapDataSource';
import type {
  SnapDataSourceActions,
  SnapDataSourceEvents,
  SnapDataSourceMessenger,
} from './SnapDataSource';
import { TokenDataSource } from './TokenDataSource';
import type {
  TokenDataSourceActions,
  TokenDataSourceMessenger,
} from './TokenDataSource';
import type {
  DetectionMiddlewareActions,
  DetectionMiddlewareMessenger,
} from '../middlewares';
import { DetectionMiddleware } from '../middlewares';

// ============================================================================
// ACTION & EVENT TYPES
// ============================================================================

/**
 * All actions from data sources.
 */
export type DataSourceActions =
  | RpcDataSourceActions
  | BackendWebsocketDataSourceActions
  | AccountsApiDataSourceActions
  | SnapDataSourceActions
  | TokenDataSourceActions
  | PriceDataSourceActions
  | DetectionMiddlewareActions;

/**
 * All events from data sources.
 */
export type DataSourceEvents =
  | RpcDataSourceEvents
  | BackendWebsocketDataSourceEvents
  | AccountsApiDataSourceEvents
  | SnapDataSourceEvents
  | PriceDataSourceEvents;

/**
 * All external actions that data sources need.
 * Note: TokenDataSource, AccountsApiDataSource, and PriceDataSource now use ApiPlatformClient
 * directly, so they don't need BackendApiClient actions delegated.
 */
export type DataSourceAllowedActions =
  | RpcDataSourceAllowedActions
  | BackendWebsocketDataSourceAllowedActions
  | AccountsApiDataSourceAllowedActions
  | PriceDataSourceAllowedActions;

/**
 * All external events that data sources need.
 */
export type DataSourceAllowedEvents =
  | RpcDataSourceAllowedEvents
  | BackendWebsocketDataSourceAllowedEvents;

/**
 * Root messenger type for all data sources.
 */
export type RootMessenger<
  AllowedActions extends ActionConstraint,
  AllowedEvents extends EventConstraint,
> = Messenger<string, AllowedActions, AllowedEvents>;

// ============================================================================
// MESSENGER TYPES
// ============================================================================

/**
 * All messengers for data sources.
 */
export type DataSourceMessengers = {
  rpcMessenger: RpcDataSourceMessenger;
  backendWebsocketMessenger: BackendWebsocketDataSourceMessenger;
  accountsApiMessenger: AccountsApiDataSourceMessenger;
  snapMessenger: SnapDataSourceMessenger;
  tokenMessenger: TokenDataSourceMessenger;
  priceMessenger: PriceDataSourceMessenger;
  detectionMessenger: DetectionMiddlewareMessenger;
};

/**
 * Options for initializing messengers.
 */
export type InitMessengersOptions<
  AllowedActions extends ActionConstraint,
  AllowedEvents extends EventConstraint,
> = {
  /** The root controller messenger */
  messenger: RootMessenger<AllowedActions, AllowedEvents>;
};

// ============================================================================
// CONTROLLER TYPES
// ============================================================================

/**
 * All data source instances.
 */
export type DataSources = {
  rpcDataSource: RpcDataSource;
  backendWebsocketDataSource: BackendWebsocketDataSource;
  accountsApiDataSource: AccountsApiDataSource;
  snapDataSource: SnapDataSource;
  tokenDataSource: TokenDataSource;
  priceDataSource: PriceDataSource;
  detectionMiddleware: DetectionMiddleware;
};

/**
 * Configuration options for RpcDataSource.
 */
export type RpcDataSourceConfig = {
  /** Balance polling interval in ms (default: 30s) */
  balanceInterval?: number;
  /** Token detection polling interval in ms (default: 180s / 3 min) */
  detectionInterval?: number;
  /** Whether token detection is enabled (default: false) */
  tokenDetectionEnabled?: boolean;
  /** Request timeout in ms (default: 10s) */
  timeout?: number;
};

/**
 * Options for initializing data sources.
 */
export type InitDataSourcesOptions = {
  /** Messengers for each data source */
  messengers: DataSourceMessengers;

  /** ApiPlatformClient for cached API calls */
  queryApiClient: ApiPlatformClient;

  /** Optional configuration for RpcDataSource */
  rpcDataSourceConfig?: RpcDataSourceConfig;
};

// ============================================================================
// MESSENGER INITIALIZATION
// ============================================================================

/**
 * Initialize all messengers for data sources.
 *
 * This function creates child messengers for each data source from the root
 * controller messenger, with proper action/event delegation.
 *
 * @example
 * ```typescript
 * import { initMessengers } from '@metamask/assets-controllers';
 *
 * const messengers = initMessengers({ messenger });
 * ```
 *
 * @param options - Configuration options
 * @returns Object containing all messengers
 */
export function initMessengers<
  AllowedActions extends ActionConstraint,
  AllowedEvents extends EventConstraint,
>(
  options: InitMessengersOptions<AllowedActions, AllowedEvents>,
): DataSourceMessengers {
  const { messenger } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootMessenger = messenger as any;

  // RPC Data Source messenger
  const rpcMessenger = new Messenger({
    namespace: 'RpcDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'AssetsController:activeChainsUpdate',
      'AssetsController:assetsUpdate',
      'AssetsController:getState',
      'TokenListController:getState',
      'NetworkEnablementController:getState',
    ],
    events: ['NetworkController:stateChange'],
    messenger: rpcMessenger,
  });

  // Backend Websocket Data Source messenger
  const backendWebsocketMessenger = new Messenger({
    namespace: 'BackendWebsocketDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'BackendWebSocketService:subscribe',
      'BackendWebSocketService:unsubscribe',
      'BackendWebSocketService:getState',
      'BackendWebSocketService:getConnectionInfo',
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      'AssetsController:activeChainsUpdate',
      'AssetsController:assetsUpdate',
    ],
    events: [
      'BackendWebSocketService:stateChange',
      'BackendWebSocketService:connectionStateChanged',
      'AccountsApiDataSource:activeChainsUpdated',
    ],
    messenger: backendWebsocketMessenger,
  });

  // Accounts API Data Source messenger
  // Note: AccountsApiDataSource uses ApiPlatformClient directly, so no BackendApiClient actions needed
  const accountsApiMessenger = new Messenger({
    namespace: 'AccountsApiDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'AssetsController:activeChainsUpdate',
      'AssetsController:assetsUpdate',
    ],
    messenger: accountsApiMessenger,
  });

  // Snap Data Source messenger
  const snapMessenger = new Messenger({
    namespace: 'SnapDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'AssetsController:activeChainsUpdate',
      'AssetsController:assetsUpdate',
      // SnapController actions for direct snap communication
      'SnapController:getRunnableSnaps',
      'SnapController:handleRequest',
      // PermissionController action for dynamic snap discovery
      'PermissionController:getPermissions',
    ],
    events: [
      // Snap keyring balance updates - snaps emit this when balances change
      'AccountsController:accountBalancesUpdated',
      // Permission changes for runtime snap discovery
      'PermissionController:stateChange',
    ],
    messenger: snapMessenger,
  });

  // Token Data Source messenger
  // Note: TokenDataSource uses ApiPlatformClient directly, so no BackendApiClient actions needed
  const tokenMessenger = new Messenger({
    namespace: 'TokenDataSource',
    parent: rootMessenger,
  });

  // Price Data Source messenger
  // Note: PriceDataSource uses ApiPlatformClient directly, so no BackendApiClient actions needed
  const priceMessenger = new Messenger({
    namespace: 'PriceDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: ['AssetsController:getState', 'AssetsController:assetsUpdate'],
    messenger: priceMessenger,
  });

  // Detection Middleware messenger
  const detectionMessenger = new Messenger({
    namespace: 'DetectionMiddleware',
    parent: rootMessenger,
  });

  return {
    rpcMessenger: rpcMessenger as RpcDataSourceMessenger,
    backendWebsocketMessenger:
      backendWebsocketMessenger as BackendWebsocketDataSourceMessenger,
    accountsApiMessenger:
      accountsApiMessenger as AccountsApiDataSourceMessenger,
    snapMessenger: snapMessenger as SnapDataSourceMessenger,
    tokenMessenger: tokenMessenger as TokenDataSourceMessenger,
    priceMessenger: priceMessenger as PriceDataSourceMessenger,
    detectionMessenger: detectionMessenger as DetectionMiddlewareMessenger,
  };
}

// ============================================================================
// DATA SOURCE INITIALIZATION
// ============================================================================

/**
 * Initialize all data sources and middlewares.
 *
 * This function creates and initializes all data sources, registering their
 * action handlers with the messenger.
 *
 * @example
 * ```typescript
 * import { initMessengers, initDataSources } from '@metamask/assets-controllers';
 *
 * // Initialize messengers first
 * const messengers = initMessengers({ controllerMessenger });
 *
 * // Then initialize data sources
 * const dataSources = initDataSources({
 *   messengers,
 *   queryApiClient,
 * });
 * ```
 *
 * @param options - Configuration options
 * @returns Object containing all data source instances
 */
export function initDataSources(options: InitDataSourcesOptions): DataSources {
  const { messengers, queryApiClient, rpcDataSourceConfig } = options;

  // Initialize primary data sources (provide balance data)
  const rpcDataSource = new RpcDataSource({
    messenger: messengers.rpcMessenger,
    ...rpcDataSourceConfig,
  });

  const backendWebsocketDataSource = new BackendWebsocketDataSource({
    messenger: messengers.backendWebsocketMessenger,
  });

  const accountsApiDataSource = new AccountsApiDataSource({
    messenger: messengers.accountsApiMessenger,
    queryApiClient,
  });

  const snapDataSource = new SnapDataSource({
    messenger: messengers.snapMessenger,
  });

  // Initialize middleware data sources (enrich responses)
  const tokenDataSource = new TokenDataSource({
    messenger: messengers.tokenMessenger,
    queryApiClient,
  });

  const priceDataSource = new PriceDataSource({
    messenger: messengers.priceMessenger,
    queryApiClient,
  });

  const detectionMiddleware = new DetectionMiddleware({
    messenger: messengers.detectionMessenger,
  });

  return {
    rpcDataSource,
    backendWebsocketDataSource,
    accountsApiDataSource,
    snapDataSource,
    tokenDataSource,
    priceDataSource,
    detectionMiddleware,
  };
}
