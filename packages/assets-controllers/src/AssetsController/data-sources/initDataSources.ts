import { Messenger, type ActionConstraint, type EventConstraint } from '@metamask/messenger';

import {
  AccountsApiDataSource,
  type AccountsApiDataSourceActions,
  type AccountsApiDataSourceAllowedActions,
  type AccountsApiDataSourceEvents,
  type AccountsApiDataSourceMessenger,
} from './AccountsApiDataSource';
import {
  BackendWebsocketDataSource,
  type BackendWebsocketDataSourceActions,
  type BackendWebsocketDataSourceAllowedActions,
  type BackendWebsocketDataSourceAllowedEvents,
  type BackendWebsocketDataSourceEvents,
  type BackendWebsocketDataSourceMessenger,
} from './BackendWebsocketDataSource';
import {
  DetectionMiddleware,
  type DetectionMiddlewareActions,
  type DetectionMiddlewareMessenger,
} from './DetectionMiddleware';
import {
  PriceDataSource,
  type PriceDataSourceActions,
  type PriceDataSourceAllowedActions,
  type PriceDataSourceEvents,
  type PriceDataSourceMessenger,
} from './PriceDataSource';
import {
  RpcDataSource,
  type RpcDataSourceActions,
  type RpcDataSourceAllowedActions,
  type RpcDataSourceAllowedEvents,
  type RpcDataSourceEvents,
  type RpcDataSourceMessenger,
} from './RpcDataSource';
import {
  SnapDataSource,
  type SnapDataSourceActions,
  type SnapDataSourceEvents,
  type SnapDataSourceMessenger,
  type SnapProvider,
} from './SnapDataSource';
import {
  TokenDataSource,
  type TokenDataSourceActions,
  type TokenDataSourceAllowedActions,
  type TokenDataSourceMessenger,
} from './TokenDataSource';

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
 */
export type DataSourceAllowedActions =
  | RpcDataSourceAllowedActions
  | BackendWebsocketDataSourceAllowedActions
  | AccountsApiDataSourceAllowedActions
  | TokenDataSourceAllowedActions
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
export interface DataSourceMessengers {
  rpcMessenger: RpcDataSourceMessenger;
  backendWebsocketMessenger: BackendWebsocketDataSourceMessenger;
  accountsApiMessenger: AccountsApiDataSourceMessenger;
  snapMessenger: SnapDataSourceMessenger;
  tokenMessenger: TokenDataSourceMessenger;
  priceMessenger: PriceDataSourceMessenger;
  detectionMessenger: DetectionMiddlewareMessenger;
}

/**
 * Options for initializing messengers.
 */
export interface InitMessengersOptions<
  AllowedActions extends ActionConstraint,
  AllowedEvents extends EventConstraint,
> {
  /** The root controller messenger */
  messenger: RootMessenger<AllowedActions, AllowedEvents>;
}

// ============================================================================
// CONTROLLER TYPES
// ============================================================================

/**
 * All data source instances.
 */
export interface DataSources {
  rpcDataSource: RpcDataSource;
  backendWebsocketDataSource: BackendWebsocketDataSource;
  accountsApiDataSource: AccountsApiDataSource;
  snapDataSource: SnapDataSource;
  tokenDataSource: TokenDataSource;
  priceDataSource: PriceDataSource;
  detectionMiddleware: DetectionMiddleware;
}

/**
 * Options for initializing data sources.
 */
export interface InitDataSourcesOptions {
  /** Messengers for each data source */
  messengers: DataSourceMessengers;

  /** Snap provider for communicating with snaps */
  snapProvider: SnapProvider;
}

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
>(options: InitMessengersOptions<AllowedActions, AllowedEvents>): DataSourceMessengers {
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
  const accountsApiMessenger = new Messenger({
    namespace: 'AccountsApiDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'BackendApiClient:Accounts:getV2SupportedNetworks',
      'BackendApiClient:Accounts:getV4MultiAccountBalances',
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
    ],
    events: [
      // Snap keyring balance updates - snaps emit this when balances change
      'AccountsController:accountBalancesUpdated',
    ],
    messenger: snapMessenger,
  });

  // Token Data Source messenger
  const tokenMessenger = new Messenger({
    namespace: 'TokenDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: ['BackendApiClient:Tokens:getV3Assets'],
    messenger: tokenMessenger,
  });

  // Price Data Source messenger
  const priceMessenger = new Messenger({
    namespace: 'PriceDataSource',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'BackendApiClient:Prices:getV3SpotPrices',
      'AssetsController:getState',
      'AssetsController:assetsUpdate',
    ],
    messenger: priceMessenger,
  });

  // Detection Middleware messenger
  const detectionMessenger = new Messenger({
    namespace: 'DetectionMiddleware',
    parent: rootMessenger,
  });

  return {
    rpcMessenger: rpcMessenger as RpcDataSourceMessenger,
    backendWebsocketMessenger: backendWebsocketMessenger as BackendWebsocketDataSourceMessenger,
    accountsApiMessenger: accountsApiMessenger as AccountsApiDataSourceMessenger,
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
 *   snapProvider: snapController,
 * });
 * ```
 *
 * @param options - Configuration options
 * @returns Object containing all data source instances
 */
export function initDataSources(options: InitDataSourcesOptions): DataSources {
  const { messengers, snapProvider } = options;

  // Initialize primary data sources (provide balance data)
  const rpcDataSource = new RpcDataSource({
    messenger: messengers.rpcMessenger,
  });

  const backendWebsocketDataSource = new BackendWebsocketDataSource({
    messenger: messengers.backendWebsocketMessenger,
  });

  const accountsApiDataSource = new AccountsApiDataSource({
    messenger: messengers.accountsApiMessenger,
  });

  const snapDataSource = new SnapDataSource({
    messenger: messengers.snapMessenger,
    snapProvider,
  });

  // Initialize middleware data sources (enrich responses)
  const tokenDataSource = new TokenDataSource({
    messenger: messengers.tokenMessenger,
  });

  const priceDataSource = new PriceDataSource({
    messenger: messengers.priceMessenger,
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
