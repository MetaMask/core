/**
 * LighterProvider
 *
 * Provider implementation for the zkLighter protocol (POC).
 * Implements the PerpsProvider interface with live REST reads and a real
 * write path (place/cancel limit orders) driven through the Lighter Go/WASM
 * signer behind the transport-agnostic {@link LighterSignerBridge} seam.
 *
 * Key differences from HyperLiquid:
 * - Venue-specific key (Schnorr over ECgFp5) registered per API-key slot via
 *   a ChangePubKey L2 transaction carrying an EIP-191 personal_sign L1Sig.
 * - Order prices/sizes are integers scaled by per-market decimals.
 * - REST + polling in the POC; WebSocket streams deferred.
 */

import type { CaipAccountId } from '@metamask/utils';

import type { CandlePeriod } from '../constants/chartConfig.js';
import {
  computeLighterMinOrderSize,
  getLighterChainId,
  LIGHTER_RESOLUTION_MS,
  LIGHTER_SUPPORTED_RESOLUTIONS,
  LIGHTER_DEFAULT_API_KEY_INDEX,
  LIGHTER_MAX_LEVERAGE,
  LIGHTER_NO_TRIGGER_PRICE,
  LIGHTER_ORDER_EXPIRY_NONE,
  LIGHTER_ORDER_TYPE_LIMIT,
  LIGHTER_ORDER_TYPE_MARKET,
  LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME,
  getLighterWsEndpoint,
  LIGHTER_PRICE_POLLING_INTERVAL_MS,
  LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
  LIGHTER_BRIDGE_CONFIG,
  LIGHTER_TX_TYPE_CANCEL_ORDER,
  LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
  LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER,
  LIGHTER_ORDER_TYPE_STOP_LOSS,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT,
  LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
  LIGHTER_TX_TYPE_CREATE_ORDER,
  LIGHTER_TX_TYPE_UPDATE_LEVERAGE,
  LIGHTER_TX_TYPE_UPDATE_MARGIN,
  LIGHTER_TX_TYPE_WITHDRAW,
  LIGHTER_MARGIN_MODE_CROSS,
  LIGHTER_USDC_ASSET_INDEX,
  toLighterInteger,
} from '../constants/lighterConfig.js';
import { PERPS_CONSTANTS } from '../constants/perpsConfig.js';
import type { PerpsControllerMessenger } from '../PerpsController.js';
import {
  convertKeysToCamelCase,
  LighterClientService,
} from '../services/LighterClientService.js';
import { LighterWalletService } from '../services/LighterWalletService.js';
import { WebSocketConnectionState } from '../types/index.js';
import type {
  AccountState,
  AssetRoute,
  CandleData,
  CandleStick,
  CancelOrderParams,
  CancelOrderResult,
  ClosePositionParams,
  DepositParams,
  DisconnectResult,
  EditOrderParams,
  FeeCalculationParams,
  FeeCalculationResult,
  Funding,
  GetAccountStateParams,
  GetFundingParams,
  GetHistoricalPortfolioParams,
  GetMarketsParams,
  GetOrderFillsParams,
  GetOrdersParams,
  GetOrFetchFillsParams,
  GetPositionsParams,
  GetSupportedPathsParams,
  HistoricalPortfolioResult,
  InitializeResult,
  LiquidationPriceParams,
  LiveDataConfig,
  MaintenanceMarginParams,
  MarginResult,
  MarketInfo,
  Order,
  OrderFill,
  OrderParams,
  OrderResult,
  PerpsMarketData,
  PerpsPlatformDependencies,
  PerpsProvider,
  PerpsReadOptions,
  Position,
  RawLedgerUpdate,
  ReadyToTradeResult,
  SubscribeAccountParams,
  SubscribeCandlesParams,
  SubscribeOICapsParams,
  SubscribeOrderBookParams,
  SubscribeOrderFillsParams,
  SubscribeOrdersParams,
  PriceUpdate,
  SubscribePositionsParams,
  SubscribePricesParams,
  ToggleTestnetResult,
  UpdateMarginParams,
  UpdatePositionTPSLParams,
  UserHistoryItem,
  WithdrawParams,
  WithdrawResult,
} from '../types/index.js';
import type {
  LighterAuthConfig,
  LighterCreateAuthTokenResult,
  LighterCreateClientResult,
  LighterOrderBookMeta,
  LighterSignChangePubKeyResult,
  LighterSignerBridge,
  LighterWasmCall,
  LighterTxResult,
  LighterWebSocketCtor,
  LighterWebSocketLike,
  LighterWsAccountMessage,
  LighterWsCandleMessage,
  LighterWsOrderBookMessage,
  LighterWsTradesMessage,
  LighterWsMarketStat,
  LighterWsMarketStatsMessage,
} from '../types/lighter-types.js';
import { ensureError } from '../utils/errorUtils.js';
import {
  adaptAccountStateFromLighter,
  adaptAccountStateFromLighterUserStats,
  adaptFillFromLighterTrade,
  adaptMarketDataFromLighter,
  adaptMarketFromLighter,
  adaptOrderFromLighter,
  adaptPositionFromLighter,
  adaptPriceUpdateFromLighter,
  adaptPriceUpdateFromLighterWsStat,
} from '../utils/lighterAdapter.js';

// ============================================================================
// Constants
// ============================================================================

const LIGHTER_NOT_SUPPORTED_ERROR = 'Lighter operation not yet supported';
const LIGHTER_SIGNER_UNAVAILABLE_ERROR = 'Lighter signer bridge not configured';
const LIGHTER_MAINNET_EXPLORER_URL = 'https://scan.lighter.xyz';
const LIGHTER_TESTNET_EXPLORER_URL = 'https://testnet.zklighter.elliot.ai';

/**
 * Empty account state returned when reads fail or no account exists.
 */
const EMPTY_ACCOUNT_STATE: AccountState = {
  totalBalance: '0',
  spendableBalance: '0',
  withdrawableBalance: '0',
  marginUsed: '0',
  unrealizedPnl: '0',
  returnOnEquity: '0',
  providerId: 'lighter',
};

// ============================================================================
// LighterProvider
// ============================================================================

/**
 * Lighter provider implementation (POC).
 */
export class LighterProvider implements PerpsProvider {
  readonly protocolId = 'lighter';

  readonly #deps: PerpsPlatformDependencies;

  readonly #clientService: LighterClientService;

  readonly #walletService: LighterWalletService;

  readonly #messenger: PerpsControllerMessenger | null;

  readonly #signerBridge: LighterSignerBridge | null;

  readonly #isTestnet: boolean;

  readonly #apiKeyIndex: number;

  readonly #configuredAccountIndex: number | undefined;

  /** Markets cache keyed by symbol (freshness delegated to client service). */
  #marketsBySymbol: Map<string, LighterOrderBookMeta> = new Map();

  #marketsById: Map<number, LighterOrderBookMeta> = new Map();

  /** Resolved Lighter account index (after ensureAccount()). */
  #accountIndex: number | null = null;

  /** L1 address the current venue session (index/signer/auth) is bound to. */
  #boundAddress: string | null = null;

  /** Active price-stream subscribers (REST polling fan-out). */
  readonly #priceSubscribers: Set<SubscribePricesParams> = new Set();

  #pricePollTimer: ReturnType<typeof setInterval> | null = null;

  #priceWs: LighterWebSocketLike | null = null;

  /** Monotonic poll counter — surfaced in debug logs so e2e can assert liveness. */
  #pricePollCycle = 0;

  /** Injectable WebSocket constructor (null → REST polling fallback). */
  readonly #webSocketCtor: LighterWebSocketCtor | null;

  /** Channels the shared socket should be subscribed to (subscribe payloads). */
  readonly #wsWantedChannels: Map<string, { auth?: string }> = new Map();

  #wsKeepaliveTimer: ReturnType<typeof setInterval> | null = null;

  /** Live WS connection state, mirrored to subscribed listeners. */
  #connectionState: WebSocketConnectionState =
    WebSocketConnectionState.Disconnected;

  /** Consecutive reconnect attempts since the last successful open. */
  #wsReconnectAttempts = 0;

  readonly #connectionListeners = new Set<
    (state: WebSocketConnectionState, reconnectionAttempt: number) => void
  >();

  readonly #setConnectionState = (state: WebSocketConnectionState): void => {
    if (this.#connectionState === state) {
      return;
    }
    this.#connectionState = state;
    for (const listener of this.#connectionListeners) {
      try {
        listener(state, this.#wsReconnectAttempts);
      } catch (error) {
        this.#logSubscriberError('connection-state', error);
      }
    }
  };

  #wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Merged latest price per symbol, replayed to late price subscribers. */
  readonly #lastPriceBySymbol: Map<string, PriceUpdate> = new Map();

  /** Merged live position state from account_all_positions (keyed marketId). */
  readonly #wsPositions: Map<number, Position> = new Map();

  /** Merged live open orders from account_all_orders (keyed orderId). */
  readonly #wsOrders: Map<string, Order> = new Map();

  readonly #oiCapSubscribers: Set<SubscribeOICapsParams> = new Set();

  readonly #accountSubscribers: Set<SubscribeAccountParams> = new Set();

  readonly #positionSubscribers: Set<SubscribePositionsParams> = new Set();

  readonly #orderSubscribers: Set<SubscribeOrdersParams> = new Set();

  readonly #fillSubscribers: Set<SubscribeOrderFillsParams> = new Set();

  /** Order-book subscribers keyed by market id. */
  readonly #orderBookSubscribers: Map<number, Set<SubscribeOrderBookParams>> =
    new Map();

  /** Live order-book level state per market (price → size). */
  readonly #orderBookState: Map<
    number,
    { bids: Map<string, string>; asks: Map<string, string> }
  > = new Map();

  /** Candle subscribers keyed by `marketId:resolution`. */
  readonly #candleSubscribers: Map<string, Set<SubscribeCandlesParams>> =
    new Map();

  /** Cached candle series per `marketId:resolution` (keyed by open time). */
  readonly #candleSeries: Map<string, Map<number, CandleStick>> = new Map();

  /** Dedup for the async account-channel setup. */
  #accountChannelsPromise: Promise<void> | null = null;

  /** Derived venue public key hex, set after the signer client is created. */
  #venuePublicKey: string | null = null;

  /** Signer session dedup. */
  #signerReadyPromise: Promise<void> | null = null;

  /** Cached auth token (deadline-managed). */
  #authToken: { token: string; deadline: number } | null = null;

  constructor(options: {
    isTestnet?: boolean;
    platformDependencies: PerpsPlatformDependencies;
    messenger?: PerpsControllerMessenger;
    lighterAuthConfig?: LighterAuthConfig;
    signerBridge?: LighterSignerBridge;
    webSocketCtor?: LighterWebSocketCtor | null;
  }) {
    this.#deps = options.platformDependencies;
    this.#isTestnet = options.isTestnet ?? true;
    this.#messenger = options.messenger ?? null;
    this.#signerBridge = options.signerBridge ?? null;
    const globalWebSocket = Reflect.get(globalThis, 'WebSocket') as
      | LighterWebSocketCtor
      | undefined;
    const defaultWebSocketCtor =
      typeof globalWebSocket === 'function' ? globalWebSocket : null;
    this.#webSocketCtor =
      options.webSocketCtor === undefined
        ? defaultWebSocketCtor
        : options.webSocketCtor;
    this.#apiKeyIndex =
      options.lighterAuthConfig?.apiKeyIndex ?? LIGHTER_DEFAULT_API_KEY_INDEX;
    this.#configuredAccountIndex = options.lighterAuthConfig?.accountIndex;

    this.#clientService = new LighterClientService(this.#deps, {
      isTestnet: this.#isTestnet,
    });
    this.#walletService = new LighterWalletService(this.#deps, {
      isTestnet: this.#isTestnet,
      messenger: options.messenger,
      personalSigner: options.lighterAuthConfig?.personalSigner,
      l1Address: options.lighterAuthConfig?.l1Address,
    });

    this.#deps.debugLogger.log('[LighterProvider] Constructor complete', {
      protocolId: this.protocolId,
      isTestnet: this.#isTestnet,
      hasMessenger: Boolean(this.#messenger),
      hasSignerBridge: Boolean(this.#signerBridge),
      apiKeyIndex: this.#apiKeyIndex,
    });
  }

  // ============================================================================
  // Error Context Helper
  // ============================================================================

  readonly #getErrorContext = (
    method: string,
    extra?: Record<string, unknown>,
  ): {
    tags?: Record<string, string | number>;
    context?: { name: string; data: Record<string, unknown> };
  } => {
    return {
      tags: {
        feature: PERPS_CONSTANTS.FeatureName,
        provider: 'LighterProvider',
        network: this.#isTestnet ? 'testnet' : 'mainnet',
      },
      context: {
        name: `LighterProvider.${method}`,
        data: {
          isTestnet: this.#isTestnet,
          ...extra,
        },
      },
    };
  };

  // ============================================================================
  // Initialization & Lifecycle
  // ============================================================================

  async initialize(): Promise<InitializeResult> {
    try {
      const markets = await this.#clientService.getOrderBooks(true);
      this.#marketsBySymbol = new Map(
        markets.map((market) => [market.symbol, market]),
      );
      this.#marketsById = new Map(
        markets.map((market) => [market.marketId, market]),
      );
      this.#deps.debugLogger.log('[LighterProvider] Initialized', {
        markets: markets.length,
      });
      return { success: true };
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.initialize',
      );
      this.#deps.debugLogger.log('[LighterProvider] initialize failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('initialize'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  async disconnect(): Promise<DisconnectResult> {
    this.#signerReadyPromise = null;
    this.#authToken = null;
    this.#teardownStream();
    this.#priceSubscribers.clear();
    this.#oiCapSubscribers.clear();
    this.#accountSubscribers.clear();
    this.#positionSubscribers.clear();
    this.#orderSubscribers.clear();
    this.#fillSubscribers.clear();
    this.#orderBookSubscribers.clear();
    this.#candleSubscribers.clear();
    return { success: true };
  }

  async ping(_timeoutMs?: number): Promise<void> {
    await this.#clientService.getOrderBooks();
  }

  async toggleTestnet(): Promise<ToggleTestnetResult> {
    // Network is fixed at construction, mirroring MYXProvider.
    return {
      success: false,
      isTestnet: this.#isTestnet,
      error: 'Lighter network is fixed at construction',
    };
  }

  async isReadyToTrade(): Promise<ReadyToTradeResult> {
    try {
      if (!this.#signerBridge) {
        return {
          ready: false,
          error: LIGHTER_SIGNER_UNAVAILABLE_ERROR,
          walletConnected: false,
          networkSupported: true,
        };
      }
      await this.#ensureSignerReady();
      return {
        ready: true,
        walletConnected: true,
        networkSupported: true,
        authenticatedAddress: this.#walletService.getUserAddress(),
      };
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.isReadyToTrade',
      );
      return {
        ready: false,
        error: wrappedError.message,
        walletConnected: false,
        networkSupported: true,
      };
    }
  }

  // ============================================================================
  // Signer session
  // ============================================================================

  readonly #getSignerBridge = (): LighterSignerBridge => {
    if (!this.#signerBridge) {
      throw new Error(LIGHTER_SIGNER_UNAVAILABLE_ERROR);
    }
    const bridge = this.#signerBridge;
    // The WASM client lives inside the bridge host (mobile: a WebView that
    // can reload and lose it). When the venue signer reports a missing
    // client, drop the cached session so the next call re-runs setup
    // instead of failing forever against a resolved-but-dead session.
    return {
      execute: async <Result>(call: LighterWasmCall): Promise<Result> => {
        try {
          const result = await bridge.execute<Result>(call);
          const error = (result as { error?: string } | null)?.error;
          if (error && /client is not created/iu.test(error)) {
            this.#invalidateSignerSession();
          }
          return result;
        } catch (error) {
          if (/client is not created/iu.test(String(error))) {
            this.#invalidateSignerSession();
          }
          throw error;
        }
      },
    };
  };

  readonly #invalidateSignerSession = (): void => {
    this.#signerReadyPromise = null;
    this.#authToken = null;
    this.#deps.debugLogger.log(
      '[LighterProvider] signer session invalidated (client lost); will re-setup on next call',
    );
  };

  /**
   * Bind the venue session to the currently selected wallet address.
   *
   * Everything downstream — account index, venue signer, auth token, and
   * the account-scoped stream channels — is derived from one L1 address.
   * When the wallet switches accounts, all of it must be dropped
   * atomically or reads/writes would keep targeting the previous account.
   */
  readonly #ensureSessionBinding = (): void => {
    let address: string;
    try {
      address = this.#walletService.getUserAddress().toLowerCase();
    } catch {
      // No account selected — the caller's own address resolution surfaces
      // the error with better context.
      return;
    }
    if (this.#boundAddress === address) {
      return;
    }
    const hadPreviousBinding = this.#boundAddress !== null;
    this.#boundAddress = address;
    if (!hadPreviousBinding) {
      return;
    }
    this.#accountIndex = null;
    this.#signerReadyPromise = null;
    this.#authToken = null;
    this.#teardownStream();
    if (this.#hasAnySubscriber()) {
      this.#ensureStream();
    }
    this.#deps.debugLogger.log(
      '[LighterProvider] session rebound to new wallet account',
    );
  };

  /**
   * Resolve the Lighter account index for the current user.
   *
   * @returns The account index.
   */
  readonly #ensureAccountIndex = async (): Promise<number> => {
    this.#ensureSessionBinding();
    if (this.#accountIndex !== null) {
      return this.#accountIndex;
    }
    if (this.#configuredAccountIndex !== undefined) {
      this.#accountIndex = this.#configuredAccountIndex;
      return this.#accountIndex;
    }
    const address = this.#walletService.getUserAddress();
    const response = await this.#clientService.getAccountsByL1Address(address);
    if (!response.subAccounts?.length) {
      throw new Error(
        `No Lighter account exists for ${address}; fund it via the bridge (or the testnet faucet) first`,
      );
    }
    const master = response.subAccounts.reduce((min, account) =>
      account.index < min.index ? account : min,
    );
    this.#accountIndex = master.index;
    return this.#accountIndex;
  };

  /**
   * Create the WASM signer client and register the venue key if the
   * account's key slot does not hold it yet. Deduplicated.
   *
   * @returns Resolves when the signer session is ready.
   */
  readonly #ensureSignerReady = async (): Promise<void> => {
    this.#ensureSessionBinding();
    if (this.#signerReadyPromise) {
      return await this.#signerReadyPromise;
    }
    this.#signerReadyPromise = this.#setupSigner().catch((error) => {
      this.#signerReadyPromise = null;
      throw error;
    });
    return await this.#signerReadyPromise;
  };

  readonly #setupSigner = async (): Promise<void> => {
    const bridge = this.#getSignerBridge();
    const accountIndex = await this.#ensureAccountIndex();
    const chainId = getLighterChainId(this.#clientService.network);
    const seed = await this.#walletService.deriveKeySeedPlain(
      this.#apiKeyIndex,
    );
    const nonceResponse = await this.#clientService.getNextNonce(
      accountIndex,
      this.#apiKeyIndex,
    );

    const created = await bridge.execute<LighterCreateClientResult>({
      function: '_createClient',
      params: [
        seed,
        chainId,
        accountIndex,
        nonceResponse.nonce,
        this.#apiKeyIndex,
      ],
    });
    if (created.error || !created.success) {
      throw new Error(
        `Lighter signer client creation failed: ${created.error ?? 'unknown'}`,
      );
    }
    this.#venuePublicKey = created.pk;

    // Register the venue key when the slot does not hold it yet. Only the
    // plaintext body leaves this scope — `created.prv` (the venue private
    // key) must stay inside the signer bridge boundary and never be logged.
    const registered = await this.#isVenueKeyRegistered(accountIndex);
    if (!registered) {
      await this.#registerVenueKey(accountIndex, created.body);
    }
  };

  readonly #isVenueKeyRegistered = async (
    accountIndex: number,
  ): Promise<boolean> => {
    try {
      const response = await this.#clientService.getApiKeys(
        accountIndex,
        this.#apiKeyIndex,
      );
      return response.apiKeys.some(
        (key) =>
          key.apiKeyIndex === this.#apiKeyIndex &&
          key.publicKey === this.#venuePublicKey,
      );
    } catch {
      return false;
    }
  };

  readonly #registerVenueKey = async (
    accountIndex: number,
    changePubKeyBody: string,
  ): Promise<void> => {
    const bridge = this.#getSignerBridge();
    // The ChangePubKey plaintext from _createClient embeds the nonce used at
    // client creation; sign it with the user's L1 account (EIP-191).
    const l1Signature =
      await this.#walletService.signPersonalMessage(changePubKeyBody);
    const nonceResponse = await this.#clientService.getNextNonce(
      accountIndex,
      this.#apiKeyIndex,
    );
    const signed = await bridge.execute<LighterSignChangePubKeyResult>({
      function: '_signChangePubKey',
      params: [
        accountIndex,
        l1Signature,
        nonceResponse.nonce,
        this.#apiKeyIndex,
      ],
    });
    if (signed.error) {
      throw new Error(`Lighter ChangePubKey signing failed: ${signed.error}`);
    }
    const result = await this.#clientService.sendTx(
      LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
      signed.txInfo,
    );
    this.#deps.debugLogger.log('[LighterProvider] Venue key registered', {
      accountIndex,
      apiKeyIndex: this.#apiKeyIndex,
      txHash: result.txHash,
    });
  };

  /**
   * Mint (or reuse) an auth token for authenticated REST reads.
   *
   * @returns Auth token string.
   */
  /** Tail of the serialized venue-write chain (see #withVenueNonce). */
  #writeChain: Promise<void> = Promise.resolve();

  /**
   * Serialize a nonce-consuming venue write.
   *
   * Lighter nonces are strictly ordered per key slot; two interleaved
   * fetch→submit pairs (e.g. the controller's per-item batch fallbacks
   * running concurrently) would sign with the same nonce and get one
   * rejection. Every write acquires the chain, fetches a fresh nonce
   * inside it, and submits before the next write's fetch runs.
   *
   * @param accountIndex - Account whose key-slot nonce is consumed.
   * @param operation - Sign+submit critical section receiving the nonce.
   * @returns The operation's result.
   */
  readonly #withVenueNonce = async <Result>(
    accountIndex: number,
    operation: (nonce: number) => Promise<Result>,
  ): Promise<Result> => {
    const criticalSection = async (): Promise<Result> => {
      const nonceResponse = await this.#clientService.getNextNonce(
        accountIndex,
        this.#apiKeyIndex,
      );
      return await operation(nonceResponse.nonce);
    };
    const run = this.#writeChain.then(criticalSection, criticalSection);
    this.#writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  };

  readonly #getAuthToken = async (): Promise<string> => {
    this.#ensureSessionBinding();
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.#authToken && this.#authToken.deadline - nowSeconds > 60) {
      return this.#authToken.token;
    }
    await this.#ensureSignerReady();
    const accountIndex = await this.#ensureAccountIndex();
    const token =
      await this.#getSignerBridge().execute<LighterCreateAuthTokenResult>({
        function: '_createAuthToken',
        params: [accountIndex, this.#apiKeyIndex],
      });
    if (token.error || !token.token) {
      throw new Error(
        `Lighter auth token creation failed: ${token.error ?? 'unknown'}`,
      );
    }
    this.#authToken = { token: token.token, deadline: token.deadline };
    return token.token;
  };

  readonly #ensureMarkets = async (): Promise<
    Map<string, LighterOrderBookMeta>
  > => {
    if (this.#marketsBySymbol.size === 0) {
      await this.initialize();
    }
    return this.#marketsBySymbol;
  };

  // ============================================================================
  // Market Data Operations (Public Reads)
  // ============================================================================

  async getMarkets(_params?: GetMarketsParams): Promise<MarketInfo[]> {
    try {
      const markets = await this.#clientService.getOrderBooks();
      return markets
        .filter((market) => market.marketType === 'perp')
        .map(adaptMarketFromLighter);
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getMarkets',
      );
      this.#deps.debugLogger.log('[LighterProvider] getMarkets failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getMarkets'),
      });
      return [];
    }
  }

  async getMarketDataWithPrices(): Promise<PerpsMarketData[]> {
    try {
      const response = await this.#clientService.getOrderBookDetails();
      return response.orderBookDetails
        .filter((detail) => detail.marketType === 'perp')
        .map((detail) =>
          adaptMarketDataFromLighter(detail, this.#deps.marketDataFormatters),
        );
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getMarketDataWithPrices',
      );
      this.#deps.debugLogger.log(
        '[LighterProvider] getMarketDataWithPrices failed',
        {
          error: String(wrappedError),
          ...this.#getErrorContext('getMarketDataWithPrices'),
        },
      );
      return [];
    }
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async getPositions(_params?: GetPositionsParams): Promise<Position[]> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const response =
        await this.#clientService.getAccountByIndex(accountIndex);
      const account = response.accounts[0];
      if (!account?.positions) {
        return [];
      }
      return account.positions
        .filter((position) => parseFloat(position.position) !== 0)
        .map(adaptPositionFromLighter);
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getPositions',
      );
      this.#deps.debugLogger.log('[LighterProvider] getPositions failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getPositions'),
      });
      return [];
    }
  }

  async getAccountState(
    _params?: GetAccountStateParams,
  ): Promise<AccountState> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const response =
        await this.#clientService.getAccountByIndex(accountIndex);
      const account = response.accounts[0];
      if (!account) {
        return EMPTY_ACCOUNT_STATE;
      }
      return adaptAccountStateFromLighter(account);
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getAccountState',
      );
      this.#deps.debugLogger.log('[LighterProvider] getAccountState failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getAccountState'),
      });
      return EMPTY_ACCOUNT_STATE;
    }
  }

  async getOpenOrders(_params?: GetOrdersParams): Promise<Order[]> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      const response = await this.#clientService.getActiveOrders(
        accountIndex,
        authToken,
      );
      return response.orders.map((order) =>
        adaptOrderFromLighter(
          order,
          this.#marketsById.get(order.marketIndex)?.symbol ??
            String(order.marketIndex),
        ),
      );
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getOpenOrders',
      );
      this.#deps.debugLogger.log('[LighterProvider] getOpenOrders failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getOpenOrders'),
      });
      return [];
    }
  }

  async getOrders(
    params?: GetOrdersParams,
    _options?: PerpsReadOptions,
  ): Promise<Order[]> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      await this.#ensureMarkets();
      const response = await this.#clientService.getInactiveOrders(
        accountIndex,
        authToken,
      );
      const historical = (response.orders ?? []).map((order) =>
        adaptOrderFromLighter(
          order,
          this.#marketsById.get(order.marketIndex)?.symbol ??
            String(order.marketIndex),
        ),
      );
      // Full lifecycle: open orders first, then the historical states.
      const open = await this.getOpenOrders(params);
      return [...open, ...historical];
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.getOrders',
      );
      this.#deps.debugLogger.log('[LighterProvider] getOrders failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('getOrders'),
      });
      return [];
    }
  }

  async getCurrentAccountId(): Promise<CaipAccountId> {
    const address = this.#walletService.getUserAddress();
    const chainId = getLighterChainId(this.#clientService.network);
    return `eip155:${chainId}:${address}` as CaipAccountId;
  }

  // ============================================================================
  // Trading Operations (POC: limit/market place + cancel)
  // ============================================================================

  /**
   * Apply the leverage the caller requested with the order.
   *
   * Lighter models leverage as a per-market account setting (UpdateLeverage,
   * tx 20; initial margin fraction in hundredths of a percent), not an order
   * field. The venue rejects the update while a position or resting order
   * exists on the market, so in that case the request is skipped with a log
   * (matching the already-set leverage is not an error).
   *
   * @param accountIndex - Lighter account index.
   * @param market - Market metadata for the order being placed.
   * @param params - The original order params carrying `leverage`.
   */
  readonly #applyRequestedLeverage = async (
    accountIndex: number,
    market: LighterOrderBookMeta,
    params: OrderParams,
  ): Promise<void> => {
    const requested = params.leverage;
    if (
      !requested ||
      requested <= 0 ||
      requested === params.existingPositionLeverage
    ) {
      return;
    }
    const [positions, openOrders] = await Promise.all([
      this.getPositions(),
      this.getOpenOrders(),
    ]);
    const marketBusy =
      positions.some((position) => position.symbol === params.symbol) ||
      openOrders.some((order) => order.symbol === params.symbol);
    if (marketBusy) {
      this.#deps.debugLogger.log(
        '[LighterProvider] leverage change skipped: market has a position or resting order',
        { symbol: params.symbol, requested },
      );
      return;
    }
    const imfHundredths = Math.round(10_000 / requested);
    await this.#withVenueNonce(accountIndex, async (nonce) => {
      const signed = await this.#getSignerBridge().execute<LighterTxResult>({
        function: '_signUpdateLeverage',
        params: [
          accountIndex,
          market.marketId,
          imfHundredths,
          LIGHTER_MARGIN_MODE_CROSS,
          nonce,
        ],
      });
      if (signed.error) {
        throw new Error(`Lighter leverage update failed: ${signed.error}`);
      }
      return await this.#clientService.sendTx(
        LIGHTER_TX_TYPE_UPDATE_LEVERAGE,
        signed.txInfo,
      );
    });
  };

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    try {
      if (params.orderType !== 'limit' && params.orderType !== 'market') {
        return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
      }
      // User intent is never silently dropped: fields this venue path does
      // not execute are rejected so the caller can adapt, not surprised.
      if (params.takeProfitPrice || params.stopLossPrice) {
        return {
          success: false,
          error:
            'Lighter does not support TP/SL attached at placement; place the order, then call updatePositionTPSL',
        };
      }
      if (params.timeInForce === 'ALO') {
        return {
          success: false,
          error: 'Lighter placement does not support post-only (ALO) yet',
        };
      }
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      if (params.orderType === 'limit' && !params.price) {
        return { success: false, error: 'Limit order requires a price' };
      }

      let price = parseFloat(params.price ?? String(params.currentPrice ?? 0));
      if (params.orderType === 'market') {
        // Lighter market orders are IOC orders with a protection price: use
        // the last trade price bounded by 5% slippage in the taker direction.
        if (!(price > 0)) {
          const details = await this.#clientService.getOrderBookDetails();
          price =
            details.orderBookDetails.find(
              (entry) => entry.symbol === params.symbol,
            )?.lastTradePrice ?? 0;
        }
        price = params.isBuy ? price * 1.05 : price * 0.95;
      }
      if (!(price > 0)) {
        return {
          success: false,
          error: 'Unable to resolve an execution price for the order',
        };
      }
      const requestedSize = parseFloat(params.size);
      if (!(requestedSize > 0)) {
        return { success: false, error: 'Order size must be positive' };
      }
      const minSize = computeLighterMinOrderSize(market, price);
      // Reduce-only (incl. full closes) may be bumped to the venue minimum:
      // the venue clamps execution to the position, so no extra exposure can
      // result. Position-increasing orders must never be silently resized.
      if (
        requestedSize < minSize &&
        !params.isFullClose &&
        !params.reduceOnly
      ) {
        return {
          success: false,
          error: `Order size ${params.size} is below the Lighter minimum of ${minSize} ${params.symbol}`,
        };
      }
      const size = Math.max(requestedSize, minSize);

      await this.#applyRequestedLeverage(accountIndex, market, params);

      const priceInt = toLighterInteger(price, market.supportedPriceDecimals);
      const sizeInt = toLighterInteger(size, market.supportedSizeDecimals);
      const clientOrderIndex = Date.now() % 1_000_000_000;

      const result = await this.#withVenueNonce(accountIndex, async (nonce) => {
        const signed = await this.#getSignerBridge().execute<LighterTxResult>({
          function: '_signCreateOrder',
          params: [
            accountIndex,
            market.marketId,
            clientOrderIndex,
            String(sizeInt),
            String(priceInt),
            params.isBuy ? 0 : 1,
            params.orderType === 'limit'
              ? LIGHTER_ORDER_TYPE_LIMIT
              : LIGHTER_ORDER_TYPE_MARKET,
            params.orderType === 'limit' && params.timeInForce !== 'IOC'
              ? LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME
              : LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
            params.reduceOnly ? 1 : 0,
            String(LIGHTER_NO_TRIGGER_PRICE),
            // GTT orders auto-expire in 28 days (signer sentinel -1); IOC
            // orders must carry a zero expiry.
            params.orderType === 'limit' && params.timeInForce !== 'IOC'
              ? LIGHTER_ORDER_EXPIRY_NONE
              : 0,
            nonce,
          ],
        });
        if (signed.error) {
          throw new Error(`Lighter order signing failed: ${signed.error}`);
        }
        return await this.#clientService.sendTx(
          LIGHTER_TX_TYPE_CREATE_ORDER,
          signed.txInfo,
        );
      });

      this.#deps.debugLogger.log('[LighterProvider] Order placed', {
        symbol: params.symbol,
        clientOrderIndex,
        txHash: result.txHash,
      });

      return {
        success: true,
        orderId: String(clientOrderIndex),
        submittedSize: String(size),
        providerId: 'lighter',
      };
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.placeOrder',
      );
      this.#deps.debugLogger.log('[LighterProvider] placeOrder failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('placeOrder', { symbol: params.symbol }),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  async cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
    try {
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }

      await this.#withVenueNonce(accountIndex, async (nonce) => {
        const signed = await this.#getSignerBridge().execute<LighterTxResult>({
          function: '_signCancelOrder',
          params: [accountIndex, market.marketId, params.orderId, nonce],
        });
        if (signed.error) {
          throw new Error(`Lighter cancel signing failed: ${signed.error}`);
        }
        return await this.#clientService.sendTx(
          LIGHTER_TX_TYPE_CANCEL_ORDER,
          signed.txInfo,
        );
      });

      return {
        success: true,
        orderId: params.orderId,
        providerId: 'lighter',
      };
    } catch (caughtError) {
      const wrappedError = ensureError(
        caughtError,
        'LighterProvider.cancelOrder',
      );
      this.#deps.debugLogger.log('[LighterProvider] cancelOrder failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('cancelOrder', { symbol: params.symbol }),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  // ============================================================================
  // Trading Operations (POC: stubbed)
  // ============================================================================

  async editOrder(_params: EditOrderParams): Promise<OrderResult> {
    // ModifyOrder (tx 17) is accepted by the venue's sendTx but the resting
    // order keeps its original price — an execution no-op we have raised
    // with Lighter. Reporting success here would misrepresent user intent,
    // so the operation refuses until the venue behavior is resolved.
    // Callers can cancel + re-place instead.
    return {
      success: false,
      error:
        'Lighter order editing is unavailable: the venue currently accepts but does not apply ModifyOrder. Cancel and re-place the order instead.',
    };
  }

  async closePosition(params: ClosePositionParams): Promise<OrderResult> {
    try {
      const positions = await this.getPositions();
      const position = positions.find(
        (entry) => entry.symbol === params.symbol,
      );
      if (!position) {
        return {
          success: false,
          error: `No open Lighter position for ${params.symbol}`,
        };
      }
      const signedSize = parseFloat(position.size);
      const closeSize = params.size ?? String(Math.abs(signedSize));
      // Reduce-only market order on the opposite side flattens the position.
      return await this.placeOrder({
        symbol: params.symbol,
        isBuy: signedSize < 0,
        size: closeSize,
        orderType: 'market',
        reduceOnly: true,
        // A full close must never be rejected by the minimum-notional check
        // even when the residual position is dust.
        isFullClose: params.size === undefined,
        currentPrice: params.currentPrice,
      });
    } catch (error) {
      const wrappedError = ensureError(error, 'LighterProvider.closePosition');
      this.#deps.debugLogger.log('[LighterProvider] closePosition failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('closePosition'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  async updatePositionTPSL(
    params: UpdatePositionTPSLParams,
  ): Promise<OrderResult> {
    try {
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      const positions = await this.getPositions();
      const position = positions.find(
        (entry) => entry.symbol === params.symbol,
      );
      if (!position) {
        return {
          success: false,
          error: `No open Lighter position for ${params.symbol}`,
        };
      }
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();

      // Replace semantics: drop existing reduce-only trigger orders first.
      const openOrders = await this.getOpenOrders();
      for (const order of openOrders) {
        if (
          order.symbol === params.symbol &&
          order.reduceOnly &&
          (Boolean(order.orderType?.includes('stop')) ||
            Boolean(order.orderType?.includes('take')) ||
            order.isTrigger === true)
        ) {
          await this.cancelOrder({
            orderId: order.orderId,
            symbol: params.symbol,
          });
        }
      }
      if (!params.takeProfitPrice && !params.stopLossPrice) {
        return { success: true };
      }

      const signedSize = parseFloat(position.size);
      const isLong = signedSize > 0;
      const coverSize = Math.abs(signedSize);
      const sizeInt = toLighterInteger(coverSize, market.supportedSizeDecimals);
      // Closing side is opposite the position; trigger market orders execute
      // at a protection price 5% beyond the trigger in the taker direction.
      const isAsk = isLong ? 1 : 0;
      const buildOrder = (
        orderType: number,
        triggerPriceRaw: string,
        clientOrderIndex: number,
      ): (string | number)[] => {
        const trigger = parseFloat(triggerPriceRaw);
        const execution = isLong ? trigger * 0.95 : trigger * 1.05;
        return [
          market.marketId,
          clientOrderIndex,
          String(sizeInt),
          String(toLighterInteger(execution, market.supportedPriceDecimals)),
          isAsk,
          orderType,
          LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          1,
          String(toLighterInteger(trigger, market.supportedPriceDecimals)),
          // Trigger orders rest until fired: use the 28-day default expiry.
          LIGHTER_ORDER_EXPIRY_NONE,
        ];
      };

      const clientBase = Date.now() % 1_000_000_000;
      const grouped: (string | number)[] = [];
      let orderCount = 0;
      if (params.takeProfitPrice) {
        grouped.push(
          ...buildOrder(
            LIGHTER_ORDER_TYPE_TAKE_PROFIT,
            params.takeProfitPrice,
            clientBase + 1,
          ),
        );
        orderCount += 1;
      }
      if (params.stopLossPrice) {
        grouped.push(
          ...buildOrder(
            LIGHTER_ORDER_TYPE_STOP_LOSS,
            params.stopLossPrice,
            clientBase + 2,
          ),
        );
        orderCount += 1;
      }
      const groupingType =
        orderCount === 2 ? LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER : 0;
      await this.#withVenueNonce(accountIndex, async (nonce) => {
        const signed = await this.#getSignerBridge().execute<LighterTxResult>({
          function: '_signCreateGroupedOrders',
          params: [accountIndex, groupingType, orderCount, ...grouped, nonce],
        });
        if (signed.error) {
          throw new Error(signed.error);
        }
        return await this.#clientService.sendTx(
          LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
          signed.txInfo,
        );
      });
      return { success: true };
    } catch (error) {
      const wrappedError = ensureError(
        error,
        'LighterProvider.updatePositionTPSL',
      );
      this.#deps.debugLogger.log(
        '[LighterProvider] updatePositionTPSL failed',
        {
          error: String(wrappedError),
          ...this.#getErrorContext('updatePositionTPSL'),
        },
      );
      return { success: false, error: wrappedError.message };
    }
  }

  async updateMargin(params: UpdateMarginParams): Promise<MarginResult> {
    try {
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      const amount = parseFloat(params.amount);
      if (!Number.isFinite(amount) || amount === 0) {
        return {
          success: false,
          error: 'updateMargin requires a non-zero amount',
        };
      }
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      // USDC uses 6 decimals; direction 1 adds isolated margin, 0 removes it
      // (types/txtypes/constants.go: RemoveFromIsolatedMargin=0, Add=1).
      await this.#withVenueNonce(accountIndex, async (nonce) => {
        const signed = await this.#getSignerBridge().execute<LighterTxResult>({
          function: '_signUpdateMargin',
          params: [
            accountIndex,
            market.marketId,
            Math.round(Math.abs(amount) * 1_000_000),
            amount > 0 ? 1 : 0,
            nonce,
          ],
        });
        if (signed.error) {
          throw new Error(signed.error);
        }
        return await this.#clientService.sendTx(
          LIGHTER_TX_TYPE_UPDATE_MARGIN,
          signed.txInfo,
        );
      });
      return { success: true };
    } catch (error) {
      const wrappedError = ensureError(error, 'LighterProvider.updateMargin');
      this.#deps.debugLogger.log('[LighterProvider] updateMargin failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('updateMargin'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  async withdraw(params: WithdrawParams): Promise<WithdrawResult> {
    try {
      const amount = parseFloat(params.amount);
      if (!(amount > 0)) {
        return { success: false, error: 'withdraw requires a positive amount' };
      }
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      // USDC uses 6 decimals on zkLighter.
      const assetAmount = String(Math.round(amount * 1_000_000));
      const result = await this.#withVenueNonce(accountIndex, async (nonce) => {
        const signed = await this.#getSignerBridge().execute<LighterTxResult>({
          function: '_signWithdraw',
          params: [
            accountIndex,
            LIGHTER_USDC_ASSET_INDEX,
            0,
            assetAmount,
            nonce,
          ],
        });
        if (signed.error) {
          throw new Error(signed.error);
        }
        return await this.#clientService.sendTx(
          LIGHTER_TX_TYPE_WITHDRAW,
          signed.txInfo,
        );
      });
      return { success: true, txHash: result.txHash };
    } catch (error) {
      const wrappedError = ensureError(error, 'LighterProvider.withdraw');
      this.#deps.debugLogger.log('[LighterProvider] withdraw failed', {
        error: String(wrappedError),
        ...this.#getErrorContext('withdraw'),
      });
      return { success: false, error: wrappedError.message };
    }
  }

  // ============================================================================
  // History Operations (POC: stubbed)
  // ============================================================================

  async getOrderFills(
    params?: GetOrderFillsParams,
    _options?: PerpsReadOptions,
  ): Promise<OrderFill[]> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const token = await this.#getAuthToken();
      await this.#ensureMarkets();
      const response = await this.#clientService.getTrades(
        accountIndex,
        token,
        params?.limit ?? 50,
      );
      return (response.trades ?? []).map((trade) =>
        adaptFillFromLighterTrade(
          trade,
          this.#marketsById.get(trade.marketId)?.symbol ??
            String(trade.marketId),
          accountIndex,
        ),
      );
    } catch (error) {
      this.#deps.debugLogger.log('[LighterProvider] getOrderFills failed', {
        error: String(error),
      });
      return [];
    }
  }

  async getOrFetchFills(params?: GetOrFetchFillsParams): Promise<OrderFill[]> {
    return await this.getOrderFills(params);
  }

  async getHistoricalPortfolio(
    _params?: GetHistoricalPortfolioParams,
  ): Promise<HistoricalPortfolioResult> {
    return {
      accountValue1dAgo: '0',
      timestamp: Date.now(),
    };
  }

  async getFunding(
    _params?: GetFundingParams,
    _options?: PerpsReadOptions,
  ): Promise<Funding[]> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const token = await this.#getAuthToken();
      await this.#ensureMarkets();
      const response = await this.#clientService.getPositionFundings(
        accountIndex,
        token,
      );
      return (response.positionFundings ?? []).map((entry) => ({
        symbol:
          this.#marketsById.get(entry.marketId)?.symbol ??
          String(entry.marketId),
        // `change` is the signed USDC funding flow for the account's side.
        amountUsd: entry.change,
        rate: entry.rate,
        timestamp: entry.timestamp * 1000,
      }));
    } catch (error) {
      this.#deps.debugLogger.log('[LighterProvider] getFunding failed', {
        error: String(error),
      });
      return [];
    }
  }

  async getUserNonFundingLedgerUpdates(params?: {
    accountId?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<RawLedgerUpdate[]> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      const l1Address = this.#walletService.getUserAddress();
      const [deposits, withdraws, transfers] = await Promise.all([
        this.#clientService.getDepositHistory(
          accountIndex,
          l1Address,
          authToken,
        ),
        this.#clientService.getWithdrawHistory(accountIndex, authToken),
        this.#clientService.getTransferHistory(accountIndex, authToken),
      ]);
      const updates: RawLedgerUpdate[] = [
        ...(deposits.deposits ?? []).map((entry) => ({
          hash: entry.l1TxHash,
          time: entry.timestamp,
          delta: { type: 'deposit', usdc: entry.amount },
        })),
        ...(withdraws.withdraws ?? []).map((entry) => ({
          hash: entry.l1TxHash,
          time: entry.timestamp,
          delta: { type: 'withdraw', usdc: `-${entry.amount}` },
        })),
        ...(transfers.transfers ?? []).map((entry) => ({
          hash: entry.txHash,
          time: entry.timestamp,
          delta: {
            // Venue types are L2TransferInflow / L2TransferOutflow.
            type: entry.type.includes('Outflow') ? 'transferOut' : 'transferIn',
            usdc: entry.type.includes('Outflow')
              ? `-${entry.amount}`
              : entry.amount,
          },
        })),
      ].sort((first, second) => second.time - first.time);
      const { startTime, endTime } = params ?? {};
      return updates.filter(
        (update) =>
          (startTime === undefined || update.time >= startTime) &&
          (endTime === undefined || update.time <= endTime),
      );
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] getUserNonFundingLedgerUpdates failed',
        { error: String(error) },
      );
      return [];
    }
  }

  async getUserHistory(params?: {
    accountId?: CaipAccountId;
    startTime?: number;
    endTime?: number;
  }): Promise<UserHistoryItem[]> {
    try {
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      const l1Address = this.#walletService.getUserAddress();
      const [deposits, withdraws] = await Promise.all([
        this.#clientService.getDepositHistory(
          accountIndex,
          l1Address,
          authToken,
        ),
        this.#clientService.getWithdrawHistory(accountIndex, authToken),
      ]);
      const toStatus = (venueStatus: string): UserHistoryItem['status'] => {
        if (venueStatus === 'completed') {
          return 'completed';
        }
        return venueStatus === 'failed' ? 'failed' : 'pending';
      };
      const items: UserHistoryItem[] = [
        ...(deposits.deposits ?? []).map((entry) => ({
          id: `deposit-${entry.id}`,
          timestamp: entry.timestamp,
          type: 'deposit' as const,
          amount: entry.amount,
          asset: 'USDC',
          txHash: entry.l1TxHash,
          status: toStatus(entry.status),
          details: { source: 'lighter' },
        })),
        ...(withdraws.withdraws ?? []).map((entry) => ({
          id: `withdrawal-${entry.id}`,
          timestamp: entry.timestamp,
          type: 'withdrawal' as const,
          amount: entry.amount,
          asset: 'USDC',
          txHash: entry.l1TxHash,
          status: toStatus(entry.status),
          details: { source: 'lighter' },
        })),
      ].sort((first, second) => second.timestamp - first.timestamp);
      const { startTime, endTime } = params ?? {};
      return items.filter(
        (item) =>
          (startTime === undefined || item.timestamp >= startTime) &&
          (endTime === undefined || item.timestamp <= endTime),
      );
    } catch (error) {
      this.#deps.debugLogger.log('[LighterProvider] getUserHistory failed', {
        error: String(error),
      });
      return [];
    }
  }

  // ============================================================================
  // Validation (POC: minimal)
  // ============================================================================

  async validateDeposit(
    _params: DepositParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  async validateOrder(
    params: OrderParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    if (params.orderType !== 'limit' && params.orderType !== 'market') {
      return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
    }
    if (params.orderType === 'limit' && !params.price) {
      return { isValid: false, error: 'Limit order requires a price' };
    }
    return { isValid: true };
  }

  async validateClosePosition(
    params: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    const markets = await this.#ensureMarkets();
    if (!markets.has(params.symbol)) {
      return {
        isValid: false,
        error: `Unknown Lighter market ${params.symbol}`,
      };
    }
    return { isValid: true };
  }

  async validateWithdrawal(
    params: WithdrawParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    const amount = parseFloat(params.amount ?? '');
    if (!Number.isFinite(amount) || amount <= 0) {
      return { isValid: false, error: 'Withdrawal amount must be positive' };
    }
    return { isValid: true };
  }

  // ============================================================================
  // Calculations (POC: coarse)
  // ============================================================================

  async calculateLiquidationPrice(
    _params: LiquidationPriceParams,
  ): Promise<string> {
    return '0';
  }

  async calculateMaintenanceMargin(
    _params: MaintenanceMarginParams,
  ): Promise<number> {
    return 0;
  }

  async getMaxLeverage(_asset: string): Promise<number> {
    return LIGHTER_MAX_LEVERAGE;
  }

  async calculateFees(
    _params: FeeCalculationParams,
  ): Promise<FeeCalculationResult> {
    // Lighter currently charges zero protocol fees on standard accounts.
    return {
      feeRate: 0,
      feeAmount: 0,
      protocolFeeRate: 0,
      metamaskFeeRate: 0,
    };
  }

  // ============================================================================
  // Subscriptions (POC: REST polling stands in for a WS feed; prices are live,
  // the remaining channels emit empty snapshots)
  // ============================================================================

  subscribeToPrices(params: SubscribePricesParams): () => void {
    this.#priceSubscribers.add(params);
    if (this.#lastPriceBySymbol.size > 0) {
      this.#deliverPrices(params, [...this.#lastPriceBySymbol.values()]);
    }
    this.#requestChannel('market_stats/all');
    this.#ensureStream();
    return () => {
      this.#priceSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToOICaps(params: SubscribeOICapsParams): () => void {
    this.#oiCapSubscribers.add(params);
    this.#requestChannel('market_stats/all');
    this.#ensureStream();
    return () => {
      this.#oiCapSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToAccount(params: SubscribeAccountParams): () => void {
    this.#accountSubscribers.add(params);
    this.#ensureAccountChannels();
    return () => {
      this.#accountSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToPositions(params: SubscribePositionsParams): () => void {
    this.#positionSubscribers.add(params);
    if (this.#wsPositions.size > 0) {
      params.callback([...this.#wsPositions.values()]);
    }
    this.#ensureAccountChannels();
    return () => {
      this.#positionSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToOrders(params: SubscribeOrdersParams): () => void {
    this.#orderSubscribers.add(params);
    if (this.#wsOrders.size > 0) {
      params.callback([...this.#wsOrders.values()]);
    }
    this.#ensureAccountChannels();
    return () => {
      this.#orderSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToOrderFills(params: SubscribeOrderFillsParams): () => void {
    this.#fillSubscribers.add(params);
    this.#ensureAccountChannels();
    return () => {
      this.#fillSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  // ============================================================================
  // Shared WebSocket stream manager (market_stats / user_stats /
  // account_all_positions / account_all_orders), REST polling fallback for
  // prices when no WebSocket implementation is available.
  // ============================================================================

  /**
   * Resolve the Lighter account index and request the account-scoped
   * channels; without a Lighter account the account-ish subscribers get one
   * empty emission (graceful degradation, matching REST reads).
   */
  readonly #ensureAccountChannels = (): void => {
    if (this.#accountChannelsPromise) {
      this.#ensureStream();
      return;
    }
    this.#accountChannelsPromise = (async (): Promise<void> => {
      try {
        const accountIndex = await this.#ensureAccountIndex();
        this.#requestChannel(`user_stats/${accountIndex}`);
        this.#requestChannel(`account_all_positions/${accountIndex}`);
        this.#requestChannel(`account_all_trades/${accountIndex}`);
        try {
          const auth = await this.#getAuthToken();
          this.#requestChannel(`account_all_orders/${accountIndex}`, auth);
        } catch (error) {
          this.#deps.debugLogger.log(
            '[LighterProvider] orders channel skipped (no auth token)',
            { error: String(error) },
          );
          this.#emitToOrderSubscribers([]);
        }
      } catch (error) {
        this.#deps.debugLogger.log(
          '[LighterProvider] account channels unavailable',
          { error: String(error) },
        );
        for (const subscriber of this.#accountSubscribers) {
          subscriber.callback(EMPTY_ACCOUNT_STATE);
        }
        for (const subscriber of this.#positionSubscribers) {
          subscriber.callback([]);
        }
        this.#emitToOrderSubscribers([]);
      }
    })();
    this.#ensureStream();
  };

  readonly #hasAnySubscriber = (): boolean => {
    return (
      this.#priceSubscribers.size > 0 ||
      this.#oiCapSubscribers.size > 0 ||
      this.#accountSubscribers.size > 0 ||
      this.#positionSubscribers.size > 0 ||
      this.#orderSubscribers.size > 0 ||
      this.#fillSubscribers.size > 0 ||
      [...this.#orderBookSubscribers.values()].some(
        (subscribers) => subscribers.size > 0,
      ) ||
      [...this.#candleSubscribers.values()].some(
        (subscribers) => subscribers.size > 0,
      )
    );
  };

  readonly #requestChannel = (channel: string, auth?: string): void => {
    if (this.#wsWantedChannels.has(channel)) {
      return;
    }
    this.#wsWantedChannels.set(channel, { auth });
    if (this.#priceWs && this.#priceWs.readyState === 1) {
      this.#sendSubscribe(channel, auth);
    }
  };

  readonly #sendSubscribe = (channel: string, auth?: string): void => {
    this.#priceWs?.send(
      JSON.stringify(
        auth
          ? { type: 'subscribe', channel, auth }
          : { type: 'subscribe', channel },
      ),
    );
  };

  readonly #releaseChannelIfUnused = (): void => {
    if (!this.#hasAnySubscriber()) {
      this.#teardownStream();
    }
  };

  readonly #ensureStream = (): void => {
    if (this.#priceWs || this.#pricePollTimer) {
      return;
    }
    if (this.#webSocketCtor) {
      this.#connectWs();
    } else {
      this.#startPricePolling();
    }
  };

  readonly #connectWs = (): void => {
    if (!this.#webSocketCtor) {
      return;
    }
    const url = getLighterWsEndpoint(this.#isTestnet ? 'testnet' : 'mainnet');
    const WebSocketCtor = this.#webSocketCtor;
    const ws = new WebSocketCtor(url);
    this.#priceWs = ws;
    this.#setConnectionState(WebSocketConnectionState.Connecting);

    ws.onopen = (): void => {
      this.#wsReconnectAttempts = 0;
      this.#setConnectionState(WebSocketConnectionState.Connected);
      for (const [channel, meta] of this.#wsWantedChannels) {
        if (meta.auth) {
          // Auth tokens are short-lived; a reconnect after the deadline must
          // re-mint instead of replaying the token captured at subscribe
          // time. #getAuthToken reuses the cached token while it is fresh.
          this.#getAuthToken()
            .then((freshToken) => {
              this.#wsWantedChannels.set(channel, { auth: freshToken });
              this.#sendSubscribe(channel, freshToken);
              return undefined;
            })
            .catch((error) => {
              this.#deps.debugLogger.log(
                '[LighterProvider] auth channel resubscribe failed',
                { channel, error: String(error) },
              );
            });
        } else {
          this.#sendSubscribe(channel, meta.auth);
        }
      }
      // The server closes idle sockets; any frame under 2 minutes keeps it up.
      // Unconditional replacement: `??=` would keep a timer bound to a dead
      // socket when a new one opens before the old socket's onclose fired.
      this.#clearKeepalive();
      this.#wsKeepaliveTimer = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // Socket closing; onclose handles recovery.
        }
      }, 60_000);
      this.#deps.debugLogger.log(
        '[LighterProvider] price stream connected (ws)',
        { url, channels: [...this.#wsWantedChannels.keys()] },
      );
    };

    ws.onmessage = (event: { data: unknown }): void => {
      this.#handleWsMessage(String(event.data));
    };

    ws.onclose = (): void => {
      if (this.#priceWs !== ws) {
        return;
      }
      this.#priceWs = null;
      this.#clearKeepalive();
      this.#setConnectionState(WebSocketConnectionState.Disconnected);
      if (this.#hasAnySubscriber()) {
        this.#deps.debugLogger.log(
          '[LighterProvider] price stream closed; reconnecting in 5s',
        );
        this.#wsReconnectAttempts += 1;
        this.#wsReconnectTimer = setTimeout((): void => {
          this.#wsReconnectTimer = null;
          this.#ensureStream();
        }, 5_000);
      }
    };

    ws.onerror = (): void => {
      this.#deps.debugLogger.log('[LighterProvider] price stream ws error');
    };
  };

  readonly #handleWsMessage = (raw: string): void => {
    let message: LighterWsMarketStatsMessage & LighterWsAccountMessage;
    try {
      message = convertKeysToCamelCase(JSON.parse(raw)) as typeof message;
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] price stream message parse failed',
        { error: String(error) },
      );
      return;
    }
    const type = message.type ?? '';
    if (type.includes('market_stats') && message.marketStats) {
      const timestamp = message.timestamp ?? Date.now();
      const updates = Object.values(message.marketStats).map((stat) =>
        adaptPriceUpdateFromLighterWsStat(stat, timestamp),
      );
      this.#dispatchPriceUpdates(updates, 'ws');
      this.#dispatchOICaps(Object.values(message.marketStats));
      return;
    }
    if (type.includes('user_stats') && message.stats) {
      const accountState = adaptAccountStateFromLighterUserStats(message.stats);
      for (const subscriber of this.#accountSubscribers) {
        try {
          subscriber.callback(accountState);
        } catch (error) {
          this.#logSubscriberError('account', error);
        }
      }
      return;
    }
    if (type.includes('account_all_positions') && message.positions) {
      const isSnapshot = type.startsWith('subscribed');
      if (isSnapshot) {
        this.#wsPositions.clear();
      }
      for (const [marketId, position] of Object.entries(message.positions)) {
        const adapted = adaptPositionFromLighter(position);
        if (parseFloat(adapted.size) === 0) {
          this.#wsPositions.delete(Number(marketId));
        } else {
          this.#wsPositions.set(Number(marketId), adapted);
        }
      }
      const positions = [...this.#wsPositions.values()];
      for (const subscriber of this.#positionSubscribers) {
        try {
          subscriber.callback(positions);
        } catch (error) {
          this.#logSubscriberError('positions', error);
        }
      }
      return;
    }
    if (type.includes('order_book')) {
      this.#handleOrderBookMessage(type, message as LighterWsOrderBookMessage);
      return;
    }
    if (type.includes('candle')) {
      this.#handleCandleMessage(message as LighterWsCandleMessage);
      return;
    }
    if (type.includes('account_all_trades')) {
      this.#handleTradesMessage(message as LighterWsTradesMessage);
      return;
    }
    if (type.includes('account_all_orders') && message.orders) {
      const isSnapshot = type.startsWith('subscribed');
      if (isSnapshot) {
        this.#wsOrders.clear();
      }
      for (const marketOrders of Object.values(message.orders)) {
        for (const order of marketOrders) {
          const adapted = adaptOrderFromLighter(
            order,
            this.#marketsById.get(order.marketIndex)?.symbol ??
              String(order.marketIndex),
          );
          const isOpen =
            adapted.status === 'queued' || adapted.status === 'open';
          if (isOpen) {
            this.#wsOrders.set(adapted.orderId, adapted);
          } else {
            this.#wsOrders.delete(adapted.orderId);
          }
        }
      }
      this.#emitToOrderSubscribers([...this.#wsOrders.values()]);
    }
  };

  /**
   * Apply an order_book snapshot/delta and fan the assembled book out.
   *
   * @param type - Message type (subscribed = full snapshot, update = delta).
   * @param message - Camelized order_book payload.
   */
  readonly #handleOrderBookMessage = (
    type: string,
    message: LighterWsOrderBookMessage,
  ): void => {
    const channel = message.channel ?? '';
    const marketId = Number(channel.split(':')[1] ?? Number.NaN);
    if (!Number.isFinite(marketId) || !message.orderBook) {
      return;
    }
    let state = this.#orderBookState.get(marketId);
    if (!state || type.startsWith('subscribed')) {
      state = { bids: new Map(), asks: new Map() };
      this.#orderBookState.set(marketId, state);
    }
    for (const side of ['bids', 'asks'] as const) {
      for (const level of message.orderBook[side] ?? []) {
        if (parseFloat(level.size) === 0) {
          state[side].delete(level.price);
        } else {
          state[side].set(level.price, level.size);
        }
      }
    }
    const subscribers = this.#orderBookSubscribers.get(marketId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    for (const subscriber of subscribers) {
      const levels = subscriber.levels ?? 10;
      const bids = [...state.bids.entries()]
        .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
        .slice(0, levels)
        .map(([price, size]) => ({ price, size }));
      const asks = [...state.asks.entries()]
        .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
        .slice(0, levels)
        .map(([price, size]) => ({ price, size }));
      const bestBid = parseFloat(bids[0]?.price ?? '0');
      const bestAsk = parseFloat(asks[0]?.price ?? '0');
      const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
      try {
        subscriber.callback({
          bids,
          asks,
          spread: String(bestAsk - bestBid),
          spreadPercentage:
            mid > 0 ? String(((bestAsk - bestBid) / mid) * 100) : '0',
          midPrice: String(mid),
        } as never);
      } catch (error) {
        this.#logSubscriberError('orderBook', error);
      }
    }
  };

  /**
   * Merge live candle updates into the cached series and fan out.
   *
   * @param message - Camelized candle payload.
   */
  readonly #handleCandleMessage = (message: LighterWsCandleMessage): void => {
    const channel = message.channel ?? '';
    const [, marketIdRaw, resolution] = channel.split(':');
    const key = `${marketIdRaw}:${resolution}`;
    const series = this.#candleSeries.get(key);
    const subscribers = this.#candleSubscribers.get(key);
    if (!series || !subscribers || subscribers.size === 0) {
      return;
    }
    for (const candle of message.candles ?? []) {
      series.set(candle.t, {
        time: candle.t,
        open: String(candle.o),
        high: String(candle.h),
        low: String(candle.l),
        close: String(candle.c),
        volume: String(candle.v),
      });
    }
    const candles = [...series.values()].sort((a, b) => a.time - b.time);
    for (const subscriber of subscribers) {
      try {
        subscriber.callback({
          symbol: subscriber.symbol,
          interval: subscriber.interval,
          candles,
        });
      } catch (error) {
        this.#logSubscriberError('candles', error);
      }
    }
  };

  /**
   * Adapt live account trades into OrderFill emissions.
   *
   * @param message - Camelized account_all_trades payload.
   */
  readonly #handleTradesMessage = (message: LighterWsTradesMessage): void => {
    if (this.#fillSubscribers.size === 0) {
      return;
    }
    const isSnapshot = (message.type ?? '').startsWith('subscribed');
    const fills: OrderFill[] = [];
    for (const marketTrades of Object.values(message.trades ?? {})) {
      for (const trade of marketTrades) {
        const symbol =
          this.#marketsById.get(trade.marketId)?.symbol ??
          String(trade.marketId);
        const accountIsAsk = trade.askAccountId === this.#accountIndex;
        fills.push({
          orderId: String(accountIsAsk ? trade.askId : trade.bidId),
          symbol,
          side: accountIsAsk ? 'sell' : 'buy',
          size: trade.size,
          price: trade.price,
          pnl: '0',
          direction: accountIsAsk ? 'sell' : 'buy',
          fee: '0',
          feeToken: 'USDC',
          timestamp: trade.timestamp,
        });
      }
    }
    if (fills.length === 0 && !isSnapshot) {
      return;
    }
    for (const subscriber of this.#fillSubscribers) {
      try {
        subscriber.callback(fills, isSnapshot);
      } catch (error) {
        this.#logSubscriberError('fills', error);
      }
    }
  };

  readonly #dispatchOICaps = (stats: LighterWsMarketStat[]): void => {
    if (this.#oiCapSubscribers.size === 0) {
      return;
    }
    const capped = stats
      .filter((stat) => {
        const openInterest = parseFloat(stat.openInterest ?? '0');
        const limit = parseFloat(
          (stat as { openInterestLimit?: string }).openInterestLimit ?? '0',
        );
        return limit > 0 && openInterest >= limit;
      })
      .map((stat) => stat.symbol);
    for (const subscriber of this.#oiCapSubscribers) {
      try {
        subscriber.callback(capped);
      } catch (error) {
        this.#logSubscriberError('oiCaps', error);
      }
    }
  };

  readonly #emitToOrderSubscribers = (orders: Order[]): void => {
    for (const subscriber of this.#orderSubscribers) {
      try {
        subscriber.callback(orders);
      } catch (error) {
        this.#logSubscriberError('orders', error);
      }
    }
  };

  readonly #logSubscriberError = (channel: string, error: unknown): void => {
    this.#deps.debugLogger.log(
      `[LighterProvider] ${channel} subscriber callback failed`,
      { error: String(error) },
    );
  };

  readonly #startPricePolling = (): void => {
    if (this.#pricePollTimer) {
      return;
    }
    const poll = (): void => {
      this.#emitPolledPrices().catch((error: unknown) => {
        this.#deps.debugLogger.log('[LighterProvider] price poll failed', {
          error: String(error),
        });
      });
    };
    poll();
    this.#pricePollTimer = setInterval(poll, LIGHTER_PRICE_POLLING_INTERVAL_MS);
  };

  /**
   * REST fallback: fetch market stats once and fan them out.
   */
  readonly #emitPolledPrices = async (): Promise<void> => {
    if (this.#priceSubscribers.size === 0) {
      return;
    }
    const response = await this.#clientService.getOrderBookDetails();
    const timestamp = Date.now();
    const updates = (response.orderBookDetails ?? []).map((detail) =>
      adaptPriceUpdateFromLighter(detail, timestamp),
    );
    this.#dispatchPriceUpdates(updates, 'poll');
  };

  /**
   * Fan price updates out to every subscriber, honoring symbol filters.
   *
   * @param updates - Adapted price updates for this cycle.
   * @param transport - Which transport produced the cycle (ws or poll).
   */
  readonly #dispatchPriceUpdates = (
    updates: PriceUpdate[],
    transport: string,
  ): void => {
    if (updates.length === 0) {
      return;
    }
    for (const update of updates) {
      this.#lastPriceBySymbol.set(update.symbol, update);
    }
    this.#pricePollCycle += 1;
    this.#deps.debugLogger.log(
      `[LighterProvider] price stream cycle=${this.#pricePollCycle} transport=${transport} updates=${updates.length}`,
    );
    for (const subscriber of this.#priceSubscribers) {
      this.#deliverPrices(subscriber, updates);
    }
  };

  readonly #deliverPrices = (
    subscriber: SubscribePricesParams,
    updates: PriceUpdate[],
  ): void => {
    const filtered =
      subscriber.symbols.length > 0
        ? updates.filter((update) => subscriber.symbols.includes(update.symbol))
        : updates;
    if (filtered.length === 0) {
      return;
    }
    try {
      subscriber.callback(filtered);
    } catch (error) {
      this.#logSubscriberError('prices', error);
    }
  };

  readonly #clearKeepalive = (): void => {
    if (this.#wsKeepaliveTimer) {
      clearInterval(this.#wsKeepaliveTimer);
      this.#wsKeepaliveTimer = null;
    }
  };

  readonly #teardownStream = (): void => {
    if (this.#pricePollTimer) {
      clearInterval(this.#pricePollTimer);
      this.#pricePollTimer = null;
    }
    if (this.#wsReconnectTimer) {
      clearTimeout(this.#wsReconnectTimer);
      this.#wsReconnectTimer = null;
    }
    this.#clearKeepalive();
    this.#wsWantedChannels.clear();
    this.#accountChannelsPromise = null;
    this.#wsPositions.clear();
    this.#wsOrders.clear();
    this.#orderBookState.clear();
    this.#candleSeries.clear();
    this.#lastPriceBySymbol.clear();
    if (this.#priceWs) {
      const ws = this.#priceWs;
      this.#priceWs = null;
      try {
        ws.close();
      } catch {
        // Socket may already be closed.
      }
    }
    this.#setConnectionState(WebSocketConnectionState.Disconnected);
  };

  subscribeToCandles(params: SubscribeCandlesParams): () => void {
    let released = false;
    let seriesKey: string | null = null;
    const resolution = LIGHTER_SUPPORTED_RESOLUTIONS.has(params.interval)
      ? params.interval
      : '15m';
    this.#ensureMarkets()
      .then(async (markets) => {
        const market = markets.get(params.symbol);
        if (!market || released) {
          return undefined;
        }
        seriesKey = `${market.marketId}:${resolution}`;
        // Seed with history so charts render immediately, then let the WS
        // candle channel keep the series live.
        const seeded = await this.fetchHistoricalCandles({
          symbol: params.symbol,
          interval: params.interval,
          limit: 120,
        });
        if (released) {
          return undefined;
        }
        const series = new Map<number, CandleStick>();
        for (const candle of seeded.candles) {
          series.set(candle.time, candle);
        }
        this.#candleSeries.set(seriesKey, series);
        let subscribers = this.#candleSubscribers.get(seriesKey);
        if (!subscribers) {
          subscribers = new Set();
          this.#candleSubscribers.set(seriesKey, subscribers);
        }
        subscribers.add(params);
        params.callback(seeded);
        this.#requestChannel(`candle/${market.marketId}/${resolution}`);
        this.#ensureStream();
        return undefined;
      })
      .catch((error: unknown) => {
        this.#deps.debugLogger.log('[LighterProvider] candle seed failed', {
          error: String(error),
        });
      });
    return () => {
      released = true;
      if (seriesKey !== null) {
        this.#candleSubscribers.get(seriesKey)?.delete(params);
      }
      this.#releaseChannelIfUnused();
    };
  }

  readonly fetchHistoricalCandles = async (options: {
    symbol: string;
    interval: CandlePeriod;
    limit?: number;
    endTime?: number;
  }): Promise<CandleData> => {
    const empty: CandleData = {
      symbol: options.symbol,
      interval: options.interval,
      candles: [],
    };
    try {
      const markets = await this.#ensureMarkets();
      const market = markets.get(options.symbol);
      if (!market) {
        return empty;
      }
      const resolution = LIGHTER_SUPPORTED_RESOLUTIONS.has(options.interval)
        ? options.interval
        : '15m';
      const intervalMs =
        LIGHTER_RESOLUTION_MS[resolution] ?? LIGHTER_RESOLUTION_MS['15m'];
      const limit = options.limit ?? 120;
      const endTimestamp = options.endTime ?? Date.now();
      const startTimestamp = endTimestamp - intervalMs * limit;
      const response = await this.#clientService.getCandles(
        market.marketId,
        resolution,
        startTimestamp,
        endTimestamp,
        limit,
      );
      return {
        symbol: options.symbol,
        interval: options.interval,
        candles: (response.c ?? []).map((candle) => ({
          time: candle.t,
          open: String(candle.o),
          high: String(candle.h),
          low: String(candle.l),
          close: String(candle.c),
          volume: String(candle.v),
        })),
      };
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] fetchHistoricalCandles failed',
        { error: String(error) },
      );
      return empty;
    }
  };

  subscribeToOrderBook(params: SubscribeOrderBookParams): () => void {
    let released = false;
    let marketId: number | null = null;
    this.#ensureMarkets()
      .then((markets) => {
        const market = markets.get(params.symbol);
        if (!market || released) {
          return undefined;
        }
        marketId = market.marketId;
        let subscribers = this.#orderBookSubscribers.get(marketId);
        if (!subscribers) {
          subscribers = new Set();
          this.#orderBookSubscribers.set(marketId, subscribers);
        }
        subscribers.add(params);
        this.#requestChannel(`order_book/${marketId}`);
        this.#ensureStream();
        return undefined;
      })
      .catch((error: unknown) => {
        params.onError?.(ensureError(error));
      });
    return () => {
      released = true;
      if (marketId !== null) {
        this.#orderBookSubscribers.get(marketId)?.delete(params);
      }
      this.#releaseChannelIfUnused();
    };
  }

  setLiveDataConfig(_config: Partial<LiveDataConfig>): void {
    // POC: no live data configuration
  }

  getWebSocketConnectionState(): WebSocketConnectionState {
    // REST-polling transport has no socket to report on; treat an active
    // poll loop as connected so callers don't tear down live subscriptions.
    if (!this.#webSocketCtor) {
      return WebSocketConnectionState.Connected;
    }
    return this.#connectionState;
  }

  subscribeToConnectionState(
    listener: (
      state: WebSocketConnectionState,
      reconnectionAttempt: number,
    ) => void,
  ): () => void {
    this.#connectionListeners.add(listener);
    listener(this.getWebSocketConnectionState(), this.#wsReconnectAttempts);
    return (): void => {
      this.#connectionListeners.delete(listener);
    };
  }

  async reconnect(): Promise<void> {
    const ws = this.#priceWs;
    if (ws) {
      // Detach first so the onclose handler's 5s backoff never races the
      // immediate reconnect below.
      this.#priceWs = null;
      this.#clearKeepalive();
      try {
        ws.close();
      } catch {
        // Socket may already be closed.
      }
      this.#setConnectionState(WebSocketConnectionState.Disconnected);
    }
    if (this.#wsReconnectTimer) {
      clearTimeout(this.#wsReconnectTimer);
      this.#wsReconnectTimer = null;
    }
    if (this.#hasAnySubscriber()) {
      this.#ensureStream();
    }
  }

  // ============================================================================
  // Asset Routes
  // ============================================================================

  /**
   * The venue's USDC bridge route for the active network, in AssetRoute
   * shape. Facts sourced live from `layer1BasicInfo` + venue docs (see
   * LIGHTER_BRIDGE_CONFIG).
   *
   * @param minAmount - Which venue minimum applies (deposit vs withdrawal).
   * @returns Single-element route list.
   */
  readonly #bridgeRoute = (minAmount: string): AssetRoute[] => {
    const bridge =
      LIGHTER_BRIDGE_CONFIG[this.#isTestnet ? 'testnet' : 'mainnet'];
    return [
      {
        assetId:
          `${bridge.chainId}/erc20:${bridge.usdcContract}/default` as AssetRoute['assetId'],
        chainId: bridge.chainId as AssetRoute['chainId'],
        contractAddress: bridge.bridgeContract as AssetRoute['contractAddress'],
        constraints: { minAmount },
      },
    ];
  };

  getDepositRoutes(_params?: GetSupportedPathsParams): AssetRoute[] {
    const bridge =
      LIGHTER_BRIDGE_CONFIG[this.#isTestnet ? 'testnet' : 'mainnet'];
    return this.#bridgeRoute(bridge.minDepositUsdc);
  }

  getWithdrawalRoutes(_params?: GetSupportedPathsParams): AssetRoute[] {
    const bridge =
      LIGHTER_BRIDGE_CONFIG[this.#isTestnet ? 'testnet' : 'mainnet'];
    return this.#bridgeRoute(bridge.minWithdrawUsdc);
  }

  // ============================================================================
  // Block Explorer
  // ============================================================================

  getBlockExplorerUrl(address?: string): string {
    const baseUrl = this.#isTestnet
      ? LIGHTER_TESTNET_EXPLORER_URL
      : LIGHTER_MAINNET_EXPLORER_URL;
    return address ? `${baseUrl}/address/${address}` : baseUrl;
  }
}
