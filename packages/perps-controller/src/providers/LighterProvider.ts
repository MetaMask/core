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

import {
  computeLighterMinOrderSize,
  getLighterChainId,
  LIGHTER_DEFAULT_API_KEY_INDEX,
  LIGHTER_MAX_LEVERAGE,
  LIGHTER_NO_TRIGGER_PRICE,
  LIGHTER_ORDER_EXPIRY_NONE,
  LIGHTER_ORDER_TYPE_LIMIT,
  LIGHTER_ORDER_TYPE_MARKET,
  LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME,
  LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
  LIGHTER_TX_TYPE_CANCEL_ORDER,
  LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
  LIGHTER_TX_TYPE_CREATE_ORDER,
  toLighterInteger,
} from '../constants/lighterConfig.js';
import { PERPS_CONSTANTS } from '../constants/perpsConfig.js';
import type { PerpsControllerMessenger } from '../PerpsController.js';
import { LighterClientService } from '../services/LighterClientService.js';
import { LighterWalletService } from '../services/LighterWalletService.js';
import { WebSocketConnectionState } from '../types/index.js';
import type {
  AccountState,
  AssetRoute,
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
} from '../types/lighter-types.js';
import { ensureError } from '../utils/errorUtils.js';
import {
  adaptAccountStateFromLighter,
  adaptMarketDataFromLighter,
  adaptMarketFromLighter,
  adaptOrderFromLighter,
  adaptPositionFromLighter,
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
  }) {
    this.#deps = options.platformDependencies;
    this.#isTestnet = options.isTestnet ?? true;
    this.#messenger = options.messenger ?? null;
    this.#signerBridge = options.signerBridge ?? null;
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

  #getErrorContext(
    method: string,
    extra?: Record<string, unknown>,
  ): {
    tags?: Record<string, string | number>;
    context?: { name: string; data: Record<string, unknown> };
  } {
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
  }

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

  #getSignerBridge(): LighterSignerBridge {
    if (!this.#signerBridge) {
      throw new Error(LIGHTER_SIGNER_UNAVAILABLE_ERROR);
    }
    return this.#signerBridge;
  }

  /**
   * Resolve the Lighter account index for the current user.
   *
   * @returns The account index.
   */
  async #ensureAccountIndex(): Promise<number> {
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
  }

  /**
   * Create the WASM signer client and register the venue key if the
   * account's key slot does not hold it yet. Deduplicated.
   *
   * @returns Resolves when the signer session is ready.
   */
  async #ensureSignerReady(): Promise<void> {
    if (this.#signerReadyPromise) {
      return await this.#signerReadyPromise;
    }
    this.#signerReadyPromise = this.#setupSigner().catch((error) => {
      this.#signerReadyPromise = null;
      throw error;
    });
    return await this.#signerReadyPromise;
  }

  async #setupSigner(): Promise<void> {
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
  }

  async #isVenueKeyRegistered(accountIndex: number): Promise<boolean> {
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
  }

  async #registerVenueKey(
    accountIndex: number,
    changePubKeyBody: string,
  ): Promise<void> {
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
  }

  /**
   * Mint (or reuse) an auth token for authenticated REST reads.
   *
   * @returns Auth token string.
   */
  async #getAuthToken(): Promise<string> {
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
  }

  async #ensureMarkets(): Promise<Map<string, LighterOrderBookMeta>> {
    if (this.#marketsBySymbol.size === 0) {
      await this.initialize();
    }
    return this.#marketsBySymbol;
  }

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

      const price = parseFloat(
        params.price ?? String(params.currentPrice ?? 0),
      );
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
          LIGHTER_ORDER_EXPIRY_NONE,
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

  async editOrder(_params: EditOrderParams): Promise<OrderResult> {
    return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  async cancelOrders(
    _params: BatchCancelOrdersParams,
  ): Promise<CancelOrdersResult> {
    return { success: false, successCount: 0, failureCount: 0, results: [] };
  }

  async closePosition(_params: ClosePositionParams): Promise<OrderResult> {
    return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  async closePositions(
    _params: ClosePositionsParams,
  ): Promise<ClosePositionsResult> {
    return { success: false, successCount: 0, failureCount: 0, results: [] };
  }

  async updatePositionTPSL(
    _params: UpdatePositionTPSLParams,
  ): Promise<OrderResult> {
    return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  async updateMargin(_params: UpdateMarginParams): Promise<MarginResult> {
    return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  async withdraw(_params: WithdrawParams): Promise<WithdrawResult> {
    return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
  }

  // ============================================================================
  // History Operations (POC: stubbed)
  // ============================================================================

  async getOrderFills(
    _params?: GetOrderFillsParams,
    _options?: PerpsReadOptions,
  ): Promise<OrderFill[]> {
    return [];
  }

  async getOrFetchFills(_params?: GetOrFetchFillsParams): Promise<OrderFill[]> {
    return [];
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
    return [];
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
  // Subscriptions (POC: immediate empty snapshots, no live streams)
  // ============================================================================

  subscribeToPrices(params: SubscribePricesParams): () => void {
    setTimeout(() => params.callback([]), 0);
    return () => {
      /* noop */
    };
  }

  subscribeToPositions(params: SubscribePositionsParams): () => void {
    setTimeout(() => params.callback([]), 0);
    return () => {
      /* noop */
    };
  }

  subscribeToOrderFills(params: SubscribeOrderFillsParams): () => void {
    setTimeout(() => params.callback([]), 0);
    return () => {
      /* noop */
    };
  }

  subscribeToOrders(params: SubscribeOrdersParams): () => void {
    setTimeout(() => params.callback([]), 0);
    return () => {
      /* noop */
    };
  }

  subscribeToAccount(params: SubscribeAccountParams): () => void {
    setTimeout(() => params.callback(EMPTY_ACCOUNT_STATE), 0);
    return () => {
      /* noop */
    };
  }

  subscribeToOICaps(params: SubscribeOICapsParams): () => void {
    setTimeout(() => params.callback([]), 0);
    return () => {
      /* noop */
    };
  }

  subscribeToCandles(params: SubscribeCandlesParams): () => void {
    setTimeout(
      () =>
        params.callback({
          symbol: params.symbol,
          interval: params.interval,
          candles: [],
        }),
      0,
    );
    return () => {
      /* noop */
    };
  }

  subscribeToOrderBook(_params: SubscribeOrderBookParams): () => void {
    return () => {
      /* noop */
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
