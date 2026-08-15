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
  LIGHTER_TX_TYPE_CANCEL_ORDER,
  LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
  LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER,
  LIGHTER_ORDER_TYPE_STOP_LOSS,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT,
  LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
  LIGHTER_TX_TYPE_CREATE_ORDER,
  LIGHTER_TX_TYPE_MODIFY_ORDER,
  LIGHTER_TX_TYPE_UPDATE_MARGIN,
  LIGHTER_TX_TYPE_WITHDRAW,
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
  BatchCancelOrdersParams,
  CancelOrderParams,
  CancelOrderResult,
  CancelOrdersResult,
  ClosePositionParams,
  ClosePositionsParams,
  ClosePositionsResult,
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
    return this.#signerBridge;
  };

  /**
   * Resolve the Lighter account index for the current user.
   *
   * @returns The account index.
   */
  readonly #ensureAccountIndex = async (): Promise<number> => {
    if (this.#accountIndex !== null) {
      return this.#accountIndex;
    }
    if (this.#configuredAccountIndex !== undefined) {
      this.#accountIndex = this.#configuredAccountIndex;
      return this.#accountIndex;
    }
    const address = this.#walletService.getUserAddress();
    const response = await this.#clientService.getAccountsByL1Address(address);
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
  readonly #getAuthToken = async (): Promise<string> => {
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
    _params?: GetOrdersParams,
    _options?: PerpsReadOptions,
  ): Promise<Order[]> {
    // POC: only currently-open orders are surfaced (no historical lifecycle).
    return await this.getOpenOrders(_params);
  }

  async getCurrentAccountId(): Promise<CaipAccountId> {
    const address = this.#walletService.getUserAddress();
    const chainId = getLighterChainId(this.#clientService.network);
    return `eip155:${chainId}:${address}` as CaipAccountId;
  }

  // ============================================================================
  // Trading Operations (POC: limit/market place + cancel)
  // ============================================================================

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    try {
      if (params.orderType !== 'limit' && params.orderType !== 'market') {
        return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
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
      const minSize = computeLighterMinOrderSize(market, price);
      const size = Math.max(requestedSize, minSize);

      const priceInt = toLighterInteger(price, market.supportedPriceDecimals);
      const sizeInt = toLighterInteger(size, market.supportedSizeDecimals);
      const clientOrderIndex = Date.now() % 1_000_000_000;

      const nonceResponse = await this.#clientService.getNextNonce(
        accountIndex,
        this.#apiKeyIndex,
      );

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
          params.orderType === 'limit'
            ? LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME
            : LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          params.reduceOnly ? 1 : 0,
          String(LIGHTER_NO_TRIGGER_PRICE),
          // GTT orders auto-expire in 28 days (signer sentinel -1); IOC
          // orders must carry a zero expiry.
          params.orderType === 'limit' ? LIGHTER_ORDER_EXPIRY_NONE : 0,
          nonceResponse.nonce,
        ],
      });
      if (signed.error) {
        return {
          success: false,
          error: `Lighter order signing failed: ${signed.error}`,
        };
      }

      const result = await this.#clientService.sendTx(
        LIGHTER_TX_TYPE_CREATE_ORDER,
        signed.txInfo,
      );

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

      const nonceResponse = await this.#clientService.getNextNonce(
        accountIndex,
        this.#apiKeyIndex,
      );
      const signed = await this.#getSignerBridge().execute<LighterTxResult>({
        function: '_signCancelOrder',
        params: [
          accountIndex,
          market.marketId,
          params.orderId,
          nonceResponse.nonce,
        ],
      });
      if (signed.error) {
        return {
          success: false,
          error: `Lighter cancel signing failed: ${signed.error}`,
        };
      }

      await this.#clientService.sendTx(
        LIGHTER_TX_TYPE_CANCEL_ORDER,
        signed.txInfo,
      );

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

  async editOrder(params: EditOrderParams): Promise<OrderResult> {
    try {
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.newOrder.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.newOrder.symbol}`,
        };
      }
      const price = parseFloat(params.newOrder.price ?? '0');
      const size = parseFloat(params.newOrder.size);
      if (!(price > 0) || !(size > 0)) {
        return {
          success: false,
          error: 'editOrder requires a positive price and size',
        };
      }
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      const nonceResponse = await this.#clientService.getNextNonce(
        accountIndex,
        this.#apiKeyIndex,
      );
      const signed = await this.#getSignerBridge().execute<LighterTxResult>({
        function: '_signModifyOrder',
        params: [
          accountIndex,
          market.marketId,
          String(params.orderId),
          toLighterInteger(size, market.supportedSizeDecimals),
          toLighterInteger(price, market.supportedPriceDecimals),
          LIGHTER_NO_TRIGGER_PRICE,
          nonceResponse.nonce,
        ],
      });
      if (signed.error) {
        return { success: false, error: signed.error };
      }
      const result = await this.#clientService.sendTx(
        LIGHTER_TX_TYPE_MODIFY_ORDER,
        signed.txInfo,
      );
      return { success: true, orderId: params.orderId, txHash: result.txHash };
    } catch (error) {
      return { success: false, error: ensureError(error).message };
    }
  }

  async cancelOrders(
    _params: BatchCancelOrdersParams,
  ): Promise<CancelOrdersResult> {
    return { success: false, successCount: 0, failureCount: 0, results: [] };
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
        currentPrice: params.currentPrice,
      });
    } catch (error) {
      return { success: false, error: ensureError(error).message };
    }
  }

  async closePositions(
    _params: ClosePositionsParams,
  ): Promise<ClosePositionsResult> {
    return { success: false, successCount: 0, failureCount: 0, results: [] };
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
      const nonceResponse = await this.#clientService.getNextNonce(
        accountIndex,
        this.#apiKeyIndex,
      );
      const groupingType =
        orderCount === 2 ? LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER : 0;
      const signed = await this.#getSignerBridge().execute<LighterTxResult>({
        function: '_signCreateGroupedOrders',
        params: [
          accountIndex,
          groupingType,
          orderCount,
          ...grouped,
          nonceResponse.nonce,
        ],
      });
      if (signed.error) {
        return { success: false, error: signed.error };
      }
      const result = await this.#clientService.sendTx(
        LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
        signed.txInfo,
      );
      return { success: true, txHash: result.txHash };
    } catch (error) {
      return { success: false, error: ensureError(error).message };
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
      const nonceResponse = await this.#clientService.getNextNonce(
        accountIndex,
        this.#apiKeyIndex,
      );
      // USDC uses 6 decimals; direction 1 adds isolated margin, 0 removes it
      // (types/txtypes/constants.go: RemoveFromIsolatedMargin=0, Add=1).
      const signed = await this.#getSignerBridge().execute<LighterTxResult>({
        function: '_signUpdateMargin',
        params: [
          accountIndex,
          market.marketId,
          Math.round(Math.abs(amount) * 1_000_000),
          amount > 0 ? 1 : 0,
          nonceResponse.nonce,
        ],
      });
      if (signed.error) {
        return { success: false, error: signed.error };
      }
      await this.#clientService.sendTx(
        LIGHTER_TX_TYPE_UPDATE_MARGIN,
        signed.txInfo,
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: ensureError(error).message };
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
      const nonceResponse = await this.#clientService.getNextNonce(
        accountIndex,
        this.#apiKeyIndex,
      );
      // USDC uses 6 decimals on zkLighter.
      const assetAmount = String(Math.round(amount * 1_000_000));
      const signed = await this.#getSignerBridge().execute<LighterTxResult>({
        function: '_signWithdraw',
        params: [
          accountIndex,
          LIGHTER_USDC_ASSET_INDEX,
          0,
          assetAmount,
          nonceResponse.nonce,
        ],
      });
      if (signed.error) {
        return { success: false, error: signed.error };
      }
      const result = await this.#clientService.sendTx(
        LIGHTER_TX_TYPE_WITHDRAW,
        signed.txInfo,
      );
      return { success: true, txHash: result.txHash };
    } catch (error) {
      return { success: false, error: ensureError(error).message };
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

  async getUserNonFundingLedgerUpdates(_params?: {
    accountId?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<RawLedgerUpdate[]> {
    return [];
  }

  async getUserHistory(_params?: {
    accountId?: CaipAccountId;
    startTime?: number;
    endTime?: number;
  }): Promise<UserHistoryItem[]> {
    return [];
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
    _params: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  async validateWithdrawal(
    _params: WithdrawParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
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

    ws.onopen = (): void => {
      for (const [channel, meta] of this.#wsWantedChannels) {
        this.#sendSubscribe(channel, meta.auth);
      }
      // The server closes idle sockets; any frame under 2 minutes keeps it up.
      this.#wsKeepaliveTimer ??= setInterval(() => {
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
      if (this.#hasAnySubscriber()) {
        this.#deps.debugLogger.log(
          '[LighterProvider] price stream closed; reconnecting in 5s',
        );
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
    return WebSocketConnectionState.Connected;
  }

  // ============================================================================
  // Asset Routes (POC: stubbed)
  // ============================================================================

  getDepositRoutes(_params?: GetSupportedPathsParams): AssetRoute[] {
    return [];
  }

  getWithdrawalRoutes(_params?: GetSupportedPathsParams): AssetRoute[] {
    return [];
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
