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
  LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX,
  LIGHTER_USDC_ASSET_INDEX,
  LIGHTER_DATA_INTEGRITY_PREFIX,
  LIGHTER_MARGIN_METADATA_TTL_MS,
  parseLighterStrictDecimal,
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
  LighterApiOrder,
  LighterAuthConfig,
  LighterTxLookupResponse,
  LighterCreateAuthTokenResult,
  LighterCreateClientResult,
  LighterOrderBookMeta,
  LighterSignChangePubKeyResult,
  LighterSendTxResponse,
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

/** Full-string decimal/scientific literal (optional sign and exponent). */
/**
 * Strict full-string numeric parsing shared with the adaptation boundary
 * (see lighterConfig.parseLighterStrictDecimal): '10USD' or '0.001BTC'
 * would prefix-parse into signed intent under bare parseFloat.
 */
const parseStrictDecimal = parseLighterStrictDecimal;

/**
 * Parse caller-supplied numeric intent, accepting only finite positive
 * values from a strictly numeric string.
 *
 * @param value - Raw numeric string from params.
 * @returns The parsed number, or null when malformed, non-finite or
 * non-positive.
 */
const parseFinitePositive = (value: string): number | null => {
  const parsed = parseStrictDecimal(value);
  return parsed !== null && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
};

/**
 * Integerize a SIGNER-BOUND value: the scaled result must be a positive
 * safe wire integer. The positive-intent policy lives here, not in the
 * generic public converter.
 *
 * @param value - Human-units value.
 * @param decimals - Market/asset decimals.
 * @returns The positive wire integer.
 */
const toSignerWireInteger = (value: number, decimals: number): number => {
  const scaled = toLighterInteger(value, decimals);
  if (scaled < 1) {
    throw new Error(`Value ${value} rounds to zero at ${decimals} decimals`);
  }
  return scaled;
};

/** The pinned signer casts price fields to uint32. */
const LIGHTER_MAX_WIRE_PRICE = 4_294_967_295;

/**
 * One recorded TP/SL venue mutation attempt. Each attempt carries its own
 * nonce and outcome: a single flat flag cannot represent "create accepted,
 * cancel #1 accepted, cancel #2 response-lost".
 */
type TpslCreateAttempt = {
  kind: 'create';
  /** The venue nonce this submission attempted to consume. */
  nonce: number;
  /** 'accepted' only after the venue's 200 was OBSERVED. */
  outcome: 'unknown' | 'accepted';
  /** Created client ids (nonempty). */
  clientIds: number[];
  /** The signed transaction hash (known BEFORE submission). */
  txHash: string;
  /**
   * Signed payload expiry (ms). After this instant (+ clock slack) the
   * sequencer can no longer accept the payload, so a not-found hash is
   * authoritatively never-landed.
   */
  expiresAt: number;
  /** What this create IS: the replacement, or a restore of the old set. */
  role: 'replacement' | 'restore';
  /**
   * For role 'restore' only: the prior trigger (by original orderId in
   * `priorTriggers`) this attempt restores. With multiple prior triggers
   * and a crash mid-restore, recovery uses this to restore exactly the
   * remaining intents — never duplicating or omitting one.
   */
  priorOrderId?: string;
};

type TpslCancelAttempt = {
  kind: 'cancel';
  nonce: number;
  outcome: 'unknown' | 'accepted';
  /** The cancelled order id. */
  orderId: string;
  txHash: string;
  expiresAt: number;
  /** Whether this cancels OLD protection or rolls back a failed leg. */
  role: 'stale' | 'rollback';
};

/** A recorded TP/SL venue mutation attempt (discriminated by kind). */
type TpslAttempt = TpslCreateAttempt | TpslCancelAttempt;

/**
 * The wire intent of a PRIOR trigger, persisted before it is cancelled so
 * a crash-then-terminal-failure can still RESTORE the old protection.
 */
type TpslPriorTrigger = {
  orderId: string;
  side: 'buy' | 'sell';
  /**
   * EXACT signer wire order type (2 stop-loss, 3 stop-loss-limit,
   * 4 take-profit, 5 take-profit-limit). A restore must rebuild the
   * prior order faithfully — never coerce a limit trigger to market.
   */
  wireOrderType: 2 | 3 | 4 | 5;
  /** Exact signer wire time-in-force (0 IOC, 1 GTT, 2 post-only). */
  wireTimeInForce: 0 | 1 | 2;
  /**
   * Venue-reported absolute order expiry (ms). Restores reuse it while
   * still in the future; otherwise the signer's default sentinel.
   */
  orderExpiry: number;
  /** Execution price (market triggers) or exact limit price. */
  price: string;
  /** User-facing trigger level. */
  triggerPrice: string;
  remainingSize: string;
};

/**
 * Identity of the position the journalled protection belonged to. A
 * delayed restore must never attach old triggers to a DIFFERENT
 * lifecycle (original closed, new same-symbol position opened).
 */
type TpslPositionFingerprint = {
  sign: 1 | -1;
  size: string;
  entryPrice: string;
};

/**
 * Durable transition state: 'creating' means the old protection is still
 * untouched (a failed replacement needs at most a rollback of surviving
 * legs); 'cancelling' means old cancels are underway/done (a failed
 * replacement requires a RESTORE from priorTriggers).
 */
type TpslJournalState = {
  attempts: TpslAttempt[];
  recordedAt: number;
  /**
   * The durable OPERATION intent: a 'remove' journals only cancels and
   * must NEVER be "recovered" by restoring the cancelled protection —
   * that would silently undo an intentional removal.
   */
  intent: 'replace' | 'remove';
  /**
   * 'creating': old protection untouched (failure needs at most a
   * rollback of surviving replacement legs). 'cancelling': old cancels
   * underway/done (a fully-failed replacement needs a RESTORE).
   * 'restoring': restore creates underway — their ids must never be
   * mistaken for the failed replacement.
   */
  phase: 'creating' | 'cancelling' | 'restoring';
  priorTriggers: TpslPriorTrigger[];
  /** Lifecycle identity gate for restores (null = never restore). */
  positionFingerprint: TpslPositionFingerprint | null;
};

/**
 * Clock slack added to a signed payload's ExpiredAt before a not-found
 * transaction hash is declared never-landed.
 */
const LIGHTER_TX_EXPIRY_SLACK_MS = 30_000;

/**
 * Extract the signed txHash and ExpiredAt from a bridge signing result,
 * failing CLOSED: without them the settlement journal cannot resolve a
 * lost response authoritatively, so the mutation must not be submitted.
 *
 * @param signed - Bridge signing result.
 * @param signed.txHash - Signed transaction hash (hex).
 * @param signed.txInfo - Signed wire payload JSON (carries ExpiredAt).
 * @returns The transaction hash and expiry (ms).
 */
const requireSignedTxIdentity = (signed: {
  txHash?: string;
  txInfo?: string;
}): { txHash: string; expiresAt: number } => {
  const { txHash } = signed;
  if (
    typeof txHash !== 'string' ||
    !/^(0x)?[0-9a-fA-F]{8,128}$/u.test(txHash)
  ) {
    throw new Error(
      'Lighter signing result carries no usable txHash; refusing to submit an unreconcilable mutation',
    );
  }
  let expiresAt: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    expiresAt = (JSON.parse(signed.txInfo ?? '') as { ExpiredAt?: unknown })
      .ExpiredAt;
  } catch {
    expiresAt = undefined;
  }
  if (
    typeof expiresAt !== 'number' ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0
  ) {
    throw new Error(
      'Lighter signing result carries no usable ExpiredAt; refusing to submit an unreconcilable mutation',
    );
  }
  return { txHash, expiresAt };
};

/**
 * Map a RAW venue trigger row to its durable prior wire intent, or null
 * when it cannot be faithfully restored (unknown type/TIF/expiry). A
 * mutation that would cancel such a row must fail closed BEFORE any
 * cancel: coercing a limit trigger to a market restore would silently
 * change the user's protection semantics.
 *
 * @param raw - Raw venue order row.
 * @returns The exact prior wire intent, or null when unmappable.
 */
const mapRawTriggerToPriorIntent = (
  raw: LighterApiOrder,
): TpslPriorTrigger | null => {
  const wireOrderTypeByVenueType: Record<string, 2 | 3 | 4 | 5> = {
    'stop-loss': 2,
    'stop-loss-limit': 3,
    'take-profit': 4,
    'take-profit-limit': 5,
  };
  const wireTimeInForceByVenueTif: Record<string, 0 | 1 | 2> = {
    'immediate-or-cancel': 0,
    'good-till-time': 1,
    'post-only': 2,
  };
  const wireOrderType = wireOrderTypeByVenueType[raw.type];
  const wireTimeInForce = wireTimeInForceByVenueTif[raw.timeInForce];
  if (
    wireOrderType === undefined ||
    wireTimeInForce === undefined ||
    !Number.isSafeInteger(raw.orderExpiry) ||
    raw.orderExpiry < -1
  ) {
    return null;
  }
  return {
    orderId: String(raw.orderIndex),
    side: raw.isAsk ? 'sell' : 'buy',
    wireOrderType,
    wireTimeInForce,
    orderExpiry: raw.orderExpiry,
    price: raw.price,
    triggerPrice: raw.triggerPrice ?? raw.price,
    remainingSize: raw.remainingBaseAmount,
  };
};

/** Delay between TP/SL settlement visibility polls. */
const LIGHTER_TPSL_SETTLE_POLL_MS = 150;

/** Bounded attempts for TP/SL settlement visibility. */
const LIGHTER_TPSL_SETTLE_ATTEMPTS = 10;

/**
 * Integerize a signer-bound PRICE (order price / trigger price): the
 * pinned lighter-go signer casts these to uint32 (web-wasm/main.go), so a
 * safe-integer above 2^32-1 silently WRAPS (e.g. 429496729.7 at 1 decimal
 * scales to 4,294,967,297 and wires as 1).
 *
 * @param value - Human-units price.
 * @param decimals - Market price decimals.
 * @returns The positive uint32 wire integer.
 */
const toSignerWirePriceInteger = (value: number, decimals: number): number => {
  const scaled = toSignerWireInteger(value, decimals);
  if (scaled > LIGHTER_MAX_WIRE_PRICE) {
    throw new Error(
      `Price ${value} exceeds Lighter's uint32 wire range at ${decimals} decimals`,
    );
  }
  return scaled;
};

/**
 * Build the EXACT signer wire params rebuilding a prior trigger — the
 * single restore-payload implementation shared by the live transition
 * and crash recovery.
 *
 * @param prior - Durable prior wire intent.
 * @param market - Market integerization parameters.
 * @param market.marketId - Venue market id.
 * @param market.supportedSizeDecimals - Size integerization decimals.
 * @param market.supportedPriceDecimals - Price integerization decimals.
 * @param accountIndex - Venue account index.
 * @param clientId - Allocated client order index.
 * @param nonce - Reserved venue nonce.
 * @returns Wire params for `_signCreateOrder`.
 */
const buildRestoreWireParams = (
  prior: TpslPriorTrigger,
  market: {
    marketId: number;
    supportedSizeDecimals: number;
    supportedPriceDecimals: number;
  },
  accountIndex: number,
  clientId: number,
  nonce: number,
): (string | number)[] => [
  accountIndex,
  market.marketId,
  clientId,
  String(
    toSignerWireInteger(
      parseStrictDecimal(prior.remainingSize) ?? Number.NaN,
      market.supportedSizeDecimals,
    ),
  ),
  String(
    toSignerWirePriceInteger(
      parseStrictDecimal(prior.price) ?? Number.NaN,
      market.supportedPriceDecimals,
    ),
  ),
  prior.side === 'sell' ? 1 : 0,
  prior.wireOrderType,
  prior.wireTimeInForce,
  1,
  String(
    toSignerWirePriceInteger(
      parseStrictDecimal(prior.triggerPrice) ?? Number.NaN,
      market.supportedPriceDecimals,
    ),
  ),
  // Reuse the venue-reported absolute expiry while still valid;
  // otherwise the signer's default sentinel.
  prior.orderExpiry > Date.now()
    ? prior.orderExpiry
    : LIGHTER_ORDER_EXPIRY_NONE,
  nonce,
];

/**
 * Validate caller leverage intent against what Lighter can represent.
 *
 * @param leverage - Requested leverage, if any.
 * @returns The exact rejection message, or null when acceptable.
 */
const lighterLeverageError = (leverage: number | undefined): string | null => {
  if (leverage === undefined) {
    return null;
  }
  if (!Number.isFinite(leverage) || !(leverage > 0)) {
    return `Invalid leverage ${leverage}: must be a positive number`;
  }
  // UpdateLeverage signs an initial margin fraction in hundredths of a
  // percent. The derived IMF must itself be a positive safe integer within
  // the venue's fraction range: huge finite leverage rounds it to zero,
  // tiny finite leverage (Number.MIN_VALUE) overflows the division to
  // Infinity, and sub-1x leverage exceeds a 100% margin fraction.
  const imfHundredths = Math.round(10_000 / leverage);
  if (
    !Number.isSafeInteger(imfHundredths) ||
    imfHundredths < 1 ||
    imfHundredths > 10_000
  ) {
    return `Invalid leverage ${leverage}: outside Lighter's representable leverage range`;
  }
  return null;
};

/**
 * Derive the protection/execution price a market order signs from its
 * reference price — shared by placement and both validators so wire-range
 * checks always inspect the exact value the signer receives.
 *
 * @param referencePrice - Fresh venue reference price.
 * @param isBuy - Order side; buys protect above, sells below.
 * @param slippageFraction - Slippage tolerance (validated < 1).
 * @returns The slippage-adjusted execution price.
 */
const deriveLighterExecutionPrice = (
  referencePrice: number,
  isBuy: boolean,
  slippageFraction: number,
): number =>
  isBuy
    ? referencePrice * (1 + slippageFraction)
    : referencePrice * (1 - slippageFraction);

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

  /**
   * Monotonic counter bumped on every session rebind. Async resolutions
   * capture it before awaiting and refuse to cache results from a stale
   * generation (an account-A lookup resolving after the switch to B).
   */
  #sessionGeneration = 0;

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
    // Learn about bridge resets proactively (e.g. the mobile WebView
    // reloading) instead of from the next failed trading call.
    this.#signerBridge?.onReset?.(() => this.#invalidateSignerSession());
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
    // A disconnect (provider switch, shutdown) invalidates the whole
    // session: an in-flight write paused inside the lock must fail its
    // fences instead of submitting after the provider was torn down.
    this.#invalidateSessionState();
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
        const lostClientPattern =
          /client is not created|WebView reloaded|signer not ready|executor not connected|timed out/iu;
        try {
          const result = await bridge.execute<Result>(call);
          const error = (result as { error?: string } | null)?.error;
          if (error && lostClientPattern.test(error)) {
            this.#invalidateSignerSession();
          }
          return result;
        } catch (error) {
          if (lostClientPattern.test(String(error))) {
            this.#invalidateSignerSession();
          }
          throw error;
        }
      },
    };
  };

  readonly #invalidateSignerSession = (): void => {
    // Advancing the generation aborts any in-flight setup/write that was
    // started against the now-dead WASM client.
    this.#sessionGeneration += 1;
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
      if (this.#boundAddress !== null) {
        // All accounts deselected while a session existed: invalidate so
        // nothing in flight can still act for the old account.
        this.#invalidateSessionState();
        this.#teardownStream();
      }
      // The caller's own address resolution surfaces the error.
      return;
    }
    if (this.#boundAddress === address) {
      return;
    }
    const hadPreviousBinding = this.#boundAddress !== null;
    this.#boundAddress = address;
    if (!hadPreviousBinding) {
      // First binding (or first after a deselection): surviving
      // subscribers may be sitting on an empty channel set.
      if (this.#hasAnySubscriber() && this.#wsWantedChannels.size === 0) {
        this.#rebuildStreamForSubscribers();
      }
      return;
    }
    // Invalidate in-flight async resolutions started under the previous
    // binding: they compare this generation after their awaits and retry
    // instead of caching results for the wrong account.
    this.#sessionGeneration += 1;
    this.#accountIndex = null;
    this.#signerReadyPromise = null;
    this.#authToken = null;
    // #tpslUnsettled is NOT cleared: entries are keyed by
    // address+accountIndex+symbol, so B never consumes A's pending ids and
    // switching back to A retains its reconciliation obligation.
    this.#teardownStream();
    this.#rebuildStreamForSubscribers();
    this.#deps.debugLogger.log(
      '[LighterProvider] session rebound to new wallet account',
    );
  };

  /**
   * Re-request every channel the current subscriber registries imply.
   *
   * #teardownStream clears the wanted-channel intents; without this,
   * subscribers that outlive an account switch would sit on a fresh socket
   * subscribed to nothing.
   */
  readonly #rebuildStreamForSubscribers = (): void => {
    if (!this.#hasAnySubscriber()) {
      return;
    }
    if (this.#priceSubscribers.size > 0 || this.#oiCapSubscribers.size > 0) {
      this.#requestChannel('market_stats/all');
    }
    for (const marketId of this.#orderBookSubscribers.keys()) {
      this.#requestChannel(`order_book/${marketId}`);
    }
    for (const seriesKey of this.#candleSubscribers.keys()) {
      // Series keys are `${marketId}:${resolution}`; the channel form uses
      // slashes. The teardown cleared the series state, and the message
      // router drops updates for unknown series — recreate an empty series
      // so live candles flow again (history reseeds on the next fetch).
      this.#candleSeries.set(seriesKey, new Map());
      this.#requestChannel(`candle/${seriesKey.replace(':', '/')}`);
    }
    if (
      this.#accountSubscribers.size > 0 ||
      this.#positionSubscribers.size > 0 ||
      this.#orderSubscribers.size > 0 ||
      this.#fillSubscribers.size > 0
    ) {
      // The promise was cleared by the teardown, so this re-resolves the
      // account channels against the newly bound address.
      this.#ensureAccountChannels();
    }
    this.#ensureStream();
  };

  /**
   * Resolve the Lighter account index for the current user.
   *
   * @returns The account index.
   */
  readonly #ensureAccountIndex = async (): Promise<number> => {
    this.#ensureSessionBinding();
    // Account-bound work requires a bound wallet — including the cached
    // fast path and the configured-index path.
    this.#assertSession(this.#sessionGeneration);
    if (this.#accountIndex !== null) {
      return this.#accountIndex;
    }
    if (this.#configuredAccountIndex !== undefined) {
      // A configured index must be a Standard (0-fee) account AND owned by
      // the bound wallet address: a signed-in wallet must never read or
      // trade another owner's account just because an env var names it.
      const generationAtCheck = this.#sessionGeneration;
      const configured = await this.#clientService.getAccountByIndex(
        this.#configuredAccountIndex,
      );
      this.#ensureSessionBinding();
      if (generationAtCheck !== this.#sessionGeneration) {
        return await this.#ensureAccountIndex();
      }
      const configuredAccount = configured.accounts[0];
      this.#assertStandardAccount(configuredAccount?.accountType);
      const ownerAddress = configuredAccount?.l1Address?.toLowerCase();
      if (!ownerAddress || ownerAddress !== this.#boundAddress) {
        // Capability-prefixed so read catches SURFACE it instead of
        // degrading a cross-owner misconfiguration into empty state.
        throw new Error(
          `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} configured account ${this.#configuredAccountIndex} is not owned by the selected wallet address`,
        );
      }
      this.#accountIndex = this.#configuredAccountIndex;
      return this.#accountIndex;
    }
    const generation = this.#sessionGeneration;
    const address = this.#walletService.getUserAddress();
    const response = await this.#clientService.getAccountsByL1Address(address);
    // Re-run the binding so an EXTERNAL switch nothing else observed also
    // advances the generation, then compare: caching after any switch
    // would poison the new session with the old account. Retry instead.
    this.#ensureSessionBinding();
    if (generation !== this.#sessionGeneration) {
      return await this.#ensureAccountIndex();
    }
    if (!response.subAccounts?.length) {
      throw new Error(
        `No Lighter account exists for ${address}; fund it via the bridge (or the testnet faucet) first`,
      );
    }
    const master = response.subAccounts.reduce((min, account) =>
      account.index < min.index ? account : min,
    );
    this.#assertStandardAccount(master.accountType);
    this.#accountIndex = master.index;
    return this.#accountIndex;
  };

  /**
   * Capability gate: only Standard (0-fee) Lighter accounts are supported.
   * Premium accounts pay nonzero maker/taker fees whose wire unit is
   * unverified — serving their history would show financially false zero
   * fees, so the whole account-bound surface refuses instead.
   *
   * @param accountType - Venue account type code (0 = Standard).
   */
  readonly #assertStandardAccount = (accountType: number | undefined): void => {
    // Fail closed: only a PROVEN Standard (type 0) account passes. A
    // missing account/type is not evidence of Standard.
    if (accountType === undefined) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} account type could not be verified (account not found); refusing to assume a Standard account`,
      );
    }
    if (accountType !== 0) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} Premium accounts are not supported yet: their fee semantics are unverified and history would be financially incorrect`,
      );
    }
  };

  /**
   * Whether an error is an explicit capability gate (unsupported account
   * tier / unverified fee semantics). These must SURFACE to callers —
   * swallowing them into empty state would present false data.
   *
   * @param error - Caught error.
   * @returns True for capability-gate errors.
   */
  readonly #isUnsupportedCapabilityError = (error: unknown): boolean =>
    String(error).includes(LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX);

  readonly #isDataIntegrityError = (error: unknown): boolean =>
    String(error).includes(LIGHTER_DATA_INTEGRITY_PREFIX);

  /**
   * TP/SL settlement expectations that timed out before becoming visible
   * on the venue's REST book, per symbol. While an entry exists, further
   * TP/SL mutations for that symbol must reconcile it first.
   */
  readonly #tpslUnsettled = new Map<string, TpslJournalState>();

  /**
   * Session-global nonce reservation per `accountIndex:apiKeyIndex`.
   * Advanced at submission DISPATCH; consulted by every write-lock
   * section so a lagging nextNonce endpoint can never reissue a nonce an
   * earlier (possibly response-lost) submission may have consumed. A
   * reconciliation that PROVES a submission never landed (exact-hash
   * not-found after signed expiry) releases the reservation again.
   */
  readonly #nonceReservations = new Map<string, number>();

  /**
   * Durable TP/SL journal key (network + address + accountIndex + symbol
   * scoped): the in-memory map alone cannot survive app/WebView/provider
   * death between venue commit and visibility.
   *
   * @param settlementKey - address:accountIndex:symbol identity.
   * @returns The disk-cache key.
   */
  readonly #tpslJournalKey = (settlementKey: string): string =>
    `lighterTpslJournal:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}`;

  /**
   * Load and strictly validate a persisted journal entry. Malformed or
   * unsupported disk data BLOCKS protection changes (fail closed) — it is
   * never trusted into signing decisions nor silently dropped.
   *
   * @param settlementKey - Settlement identity.
   * @returns The validated entry, or null.
   */
  readonly #loadTpslJournal = async (
    settlementKey: string,
  ): Promise<TpslJournalState | null> => {
    const key = this.#tpslJournalKey(settlementKey);
    // FAIL CLOSED on read failure and on corruption: turning either into
    // "no entry" would erase exactly the uncertainty this journal exists
    // to preserve and could duplicate a committed mutation. Malformed
    // data is NOT auto-removed — it blocks until inspected/resolved.
    let raw: string | null;
    try {
      raw = await this.#deps.diskCache.getItem(key);
    } catch (error) {
      throw new Error(
        `Lighter TP/SL journal read failed for ${settlementKey}; refusing protection changes: ${ensureError(error, 'LighterProvider.#loadTpslJournal').message}`,
      );
    }
    if (raw === null) {
      return null;
    }
    let parsed: {
      version?: unknown;
      recordedAt?: unknown;
      apiKeyIndex?: unknown;
      intent?: unknown;
      phase?: unknown;
      priorTriggers?: unknown;
      positionFingerprint?: unknown;
      attempts?: unknown;
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new Error(
        `Lighter TP/SL journal for ${settlementKey} is corrupt; refusing protection changes until it is resolved`,
      );
    }
    const isWireId = (value: unknown): boolean =>
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value < 2 ** 48;
    const isNonce = (value: unknown): boolean =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
    const isOrderIdString = (value: unknown): boolean =>
      typeof value === 'string' && /^\d{1,20}$/u.test(value);
    const isTxHash = (value: unknown): boolean =>
      typeof value === 'string' && /^(0x)?[0-9a-fA-F]{8,128}$/u.test(value);
    const isExpiry = (value: unknown): boolean =>
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
    const isAttempt = (value: unknown): value is TpslAttempt => {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      const attempt = value as Record<string, unknown>;
      if (
        !isNonce(attempt.nonce) ||
        (attempt.outcome !== 'unknown' && attempt.outcome !== 'accepted') ||
        !isTxHash(attempt.txHash) ||
        !isExpiry(attempt.expiresAt)
      ) {
        return false;
      }
      if (attempt.kind === 'create') {
        return (
          attempt.orderId === undefined &&
          (attempt.role === 'replacement' || attempt.role === 'restore') &&
          // priorOrderId durably keys WHICH prior intent a restore leg
          // restores; REQUIRED on restores, forbidden on replacements.
          (attempt.role === 'restore'
            ? isOrderIdString(attempt.priorOrderId)
            : attempt.priorOrderId === undefined) &&
          Array.isArray(attempt.clientIds) &&
          attempt.clientIds.length >= 1 &&
          attempt.clientIds.length <= 2 &&
          attempt.clientIds.every(isWireId) &&
          new Set(attempt.clientIds).size === attempt.clientIds.length
        );
      }
      if (attempt.kind === 'cancel') {
        return (
          attempt.clientIds === undefined &&
          (attempt.role === 'stale' || attempt.role === 'rollback') &&
          isOrderIdString(attempt.orderId)
        );
      }
      return false;
    };
    // Recovery SIGNS from these values: they must be strict, finite and
    // strictly positive before they can reach the wire.
    const isPositiveDecimalString = (value: unknown): boolean => {
      if (typeof value !== 'string') {
        return false;
      }
      const numeric = parseStrictDecimal(value);
      return numeric !== null && Number.isFinite(numeric) && numeric > 0;
    };
    const isPriorTrigger = (value: unknown): value is TpslPriorTrigger => {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      const trigger = value as Record<string, unknown>;
      return (
        isOrderIdString(trigger.orderId) &&
        (trigger.side === 'buy' || trigger.side === 'sell') &&
        (trigger.wireOrderType === 2 ||
          trigger.wireOrderType === 3 ||
          trigger.wireOrderType === 4 ||
          trigger.wireOrderType === 5) &&
        (trigger.wireTimeInForce === 0 ||
          trigger.wireTimeInForce === 1 ||
          trigger.wireTimeInForce === 2) &&
        typeof trigger.orderExpiry === 'number' &&
        Number.isSafeInteger(trigger.orderExpiry) &&
        trigger.orderExpiry >= -1 &&
        isPositiveDecimalString(trigger.price) &&
        isPositiveDecimalString(trigger.triggerPrice) &&
        isPositiveDecimalString(trigger.remainingSize)
      );
    };
    const isPositionFingerprint = (
      value: unknown,
    ): value is TpslPositionFingerprint => {
      if (typeof value !== 'object' || value === null) {
        return false;
      }
      const fingerprint = value as Record<string, unknown>;
      return (
        (fingerprint.sign === 1 || fingerprint.sign === -1) &&
        isPositiveDecimalString(fingerprint.size) &&
        isPositiveDecimalString(fingerprint.entryPrice)
      );
    };
    // Version 1 lacked the phase/priorTriggers/role transition state the
    // recovery machine needs — it CANNOT be interpreted safely. Fail
    // closed explicitly (never silently cleared, never read as v2).
    if (parsed.version === 1) {
      throw new Error(
        `Lighter TP/SL journal for ${settlementKey} uses unsupported schema version 1; refusing protection changes until it is resolved`,
      );
    }
    if (
      parsed.version === 2 &&
      typeof parsed.recordedAt === 'number' &&
      Number.isSafeInteger(parsed.recordedAt) &&
      parsed.recordedAt >= 0 &&
      // The journal is bound to ONE api-key slot: nonces are per slot.
      parsed.apiKeyIndex === this.#apiKeyIndex &&
      // An explicit durable operation intent is REQUIRED: without it a
      // remove could be misread as a failed replacement and "restored".
      (parsed.intent === 'replace' || parsed.intent === 'remove') &&
      (parsed.phase === 'creating' ||
        parsed.phase === 'cancelling' ||
        parsed.phase === 'restoring') &&
      (parsed.positionFingerprint === null ||
        isPositionFingerprint(parsed.positionFingerprint)) &&
      Array.isArray(parsed.priorTriggers) &&
      parsed.priorTriggers.length <= 4 &&
      parsed.priorTriggers.every(isPriorTrigger) &&
      new Set(parsed.priorTriggers.map((trigger) => trigger.orderId)).size ===
        parsed.priorTriggers.length &&
      Array.isArray(parsed.attempts) &&
      // An EMPTY journal is malformed — empty-but-shape-valid would be
      // accepted and silently cleared.
      parsed.attempts.length >= 1 &&
      parsed.attempts.length <= 40 &&
      parsed.attempts.every(isAttempt) &&
      new Set(parsed.attempts.map((entry) => entry.nonce)).size ===
        parsed.attempts.length
    ) {
      const { attempts } = parsed;
      const { priorTriggers } = parsed;
      // Every restore leg must link to a persisted prior intent — an
      // unlinked restore could sign a duplicate or orphan a prior one.
      const restoresLinked = attempts.every(
        (attempt) =>
          attempt.kind !== 'create' ||
          attempt.role !== 'restore' ||
          priorTriggers.some(
            (trigger) => trigger.orderId === attempt.priorOrderId,
          ),
      );
      if (restoresLinked) {
        return {
          attempts,
          recordedAt: parsed.recordedAt,
          intent: parsed.intent,
          phase: parsed.phase,
          priorTriggers,
          positionFingerprint: parsed.positionFingerprint ?? null,
        };
      }
    }
    throw new Error(
      `Lighter TP/SL journal for ${settlementKey} is malformed; refusing protection changes until it is resolved`,
    );
  };

  /**
   * Durable index of settlement keys with pending journals.
   *
   * @returns The disk-cache key of the index.
   */
  readonly #tpslJournalIndexKey = (): string =>
    `lighterTpslJournalIndex:${this.#isTestnet ? 'testnet' : 'mainnet'}`;

  /**
   * Read the durable journal index (strictly validated; failures fail
   * closed by throwing).
   *
   * @returns The list of settlement keys with pending journals.
   */
  readonly #readTpslJournalIndex = async (): Promise<string[]> => {
    const raw = await this.#deps.diskCache.getItem(this.#tpslJournalIndexKey());
    if (raw === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length <= 64 &&
        parsed.every((entry) => typeof entry === 'string')
      ) {
        return parsed;
      }
    } catch {
      // fall through
    }
    throw new Error('Lighter TP/SL journal index is corrupt');
  };

  /**
   * Persist a journal entry durably and ensure the index lists its key so
   * restart recovery can enumerate pending obligations without waiting
   * for the next mutation.
   *
   * @param settlementKey - Settlement identity.
   * @param journal - The journal entry.
   */
  readonly #persistTpslJournal = async (
    settlementKey: string,
    journal: TpslJournalState,
  ): Promise<void> => {
    // WRITER-SIDE capacity enforcement, mirrored from the loader: a
    // journal the loader would reject as malformed must never be written
    // in the first place. Throwing here aborts BEFORE the submission the
    // entry was journalling, with every older obligation intact.
    if (journal.priorTriggers.length > 4) {
      throw new Error(
        `Lighter TP/SL journal for ${settlementKey} would record too many prior triggers (${journal.priorTriggers.length} > 4); refusing the mutation`,
      );
    }
    if (journal.attempts.length > 40) {
      throw new Error(
        `Lighter TP/SL journal for ${settlementKey} would record too many attempts (${journal.attempts.length} > 40); refusing further submissions until pending obligations resolve`,
      );
    }
    // INDEX-FIRST: a dangling index entry (no journal behind it) is
    // safely prunable by recovery, whereas compensating a failed index
    // write by removing the journal could erase an EXISTING authoritative
    // journal holding already-accepted attempts. Any failure here aborts
    // BEFORE the next submission with every older obligation intact.
    const index = await this.#readTpslJournalIndex();
    if (!index.includes(settlementKey)) {
      if (index.length >= 64) {
        // NEVER evict a live obligation: fail the mutation before
        // submission instead.
        throw new Error(
          'Lighter TP/SL journal index is full; refusing further protection changes until pending obligations resolve',
        );
      }
      await this.#deps.diskCache.setItem(
        this.#tpslJournalIndexKey(),
        JSON.stringify([...index, settlementKey]),
      );
    }
    await this.#deps.diskCache.setItem(
      this.#tpslJournalKey(settlementKey),
      JSON.stringify({
        version: 2,
        recordedAt: journal.recordedAt,
        apiKeyIndex: this.#apiKeyIndex,
        intent: journal.intent,
        phase: journal.phase,
        priorTriggers: journal.priorTriggers,
        positionFingerprint: journal.positionFingerprint,
        attempts: journal.attempts,
      }),
    );
    // A NEW pending obligation invalidates any "recovery complete"
    // marker recorded earlier in this session — otherwise later read
    // kicks would skip it until a restart or another mutation.
    this.#tpslRecoveryGeneration = -1;
  };

  /**
   * Resolve a settlement obligation everywhere. Disk removal failures
   * PROPAGATE and the in-memory entry is retained: silently dropping only
   * the memory copy would leave a stale durable obligation to wedge a
   * later session.
   *
   * @param settlementKey - Settlement identity.
   */
  readonly #clearTpslJournal = async (settlementKey: string): Promise<void> => {
    await this.#deps.diskCache.removeItem(this.#tpslJournalKey(settlementKey));
    const index = await this.#readTpslJournalIndex().catch(() => null);
    if (index?.includes(settlementKey)) {
      await this.#deps.diskCache
        .setItem(
          this.#tpslJournalIndexKey(),
          JSON.stringify(index.filter((entry) => entry !== settlementKey)),
        )
        .catch(() => undefined);
    }
    this.#tpslUnsettled.delete(settlementKey);
  };

  /**
   * Targeted, cached, active-first inactive-history reader shared by the
   * mutation transition and recovery: terminal rows are immutable so they
   * cache across polls; page 1 per call; the deep cursor walk runs at
   * most ONCE per reader and stops when every target id is found.
   *
   * @param accountIndex - Captured account index.
   * @param authToken - Captured auth token.
   * @param generation - Captured session generation (fenced per read).
   * @param marketId - Market to scope inactive-history requests to.
   * @returns The reader closure.
   */
  readonly #makeInactiveReader = (
    accountIndex: number,
    authToken: string,
    generation: number,
    marketId: number,
  ): ((targetClientIds: number[]) => Promise<LighterApiOrder[]>) => {
    const terminalCache = new Map<string, LighterApiOrder>();
    let deepTraversalDone = false;
    return async (targetClientIds: number[]): Promise<LighterApiOrder[]> => {
      this.#assertSession(generation);
      const targets = targetClientIds.map(String);
      const missing = (): boolean =>
        targets.some((id) => !terminalCache.has(id));
      const ingest = (orders: LighterApiOrder[]): void => {
        for (const order of orders) {
          if (order.ownerAccountIndex === accountIndex) {
            terminalCache.set(String(order.clientOrderIndex), order);
          }
        }
      };
      const firstPage = await this.#clientService.getInactiveOrders(
        accountIndex,
        authToken,
        100,
        undefined,
        marketId,
      );
      this.#assertSession(generation);
      ingest(firstPage.orders);
      if (missing() && !deepTraversalDone) {
        deepTraversalDone = true;
        let cursor = firstPage.nextCursor;
        for (let page = 0; page < 9 && cursor && missing(); page += 1) {
          const response = await this.#clientService.getInactiveOrders(
            accountIndex,
            authToken,
            100,
            cursor,
            marketId,
          );
          this.#assertSession(generation);
          ingest(response.orders);
          cursor = response.nextCursor;
        }
      }
      return [...terminalCache.values()];
    };
  };

  /** Session generation whose journal recovery fully resolved. */
  #tpslRecoveryGeneration = -1;

  /** In-flight journal recovery (deduplicates concurrent triggers). */
  #tpslRecoveryInFlight: Promise<void> | null = null;

  /**
   * Detached, deduplicated recovery kick. Wired into signer setup AND the
   * public read paths: a recovery that returned unresolved (e.g. REST
   * visibility lag) must get another chance later in the SAME session,
   * not only at the next signer setup.
   */
  /** A kick arrived while a (possibly stale) recovery was in flight. */
  #tpslRecoveryKickPending = false;

  readonly #kickTpslRecovery = (): void => {
    if (this.#tpslRecoveryGeneration === this.#sessionGeneration) {
      return;
    }
    if (this.#tpslRecoveryInFlight) {
      // A stale-generation recovery may be finishing: remember this kick
      // so the CURRENT generation's journals are not silently skipped.
      this.#tpslRecoveryKickPending = true;
      return;
    }
    setTimeout(() => {
      this.#recoverPendingTpslJournals().catch((error) => {
        this.#deps.debugLogger.log(
          '[LighterProvider] TP/SL journal recovery failed',
          { error: String(error) },
        );
      });
    }, 0);
  };

  /**
   * Enumerate durable journal-index entries for the CURRENT identity and
   * recover each: reconcile, complete an interrupted replacement's stale
   * cancels when its created protection is live, then clear. Bounded and
   * deduplicated per session generation; unresolved entries stay for the
   * next attempt.
   */
  readonly #recoverPendingTpslJournals = async (): Promise<void> => {
    const generation = this.#sessionGeneration;
    if (this.#tpslRecoveryGeneration === generation) {
      return;
    }
    if (this.#tpslRecoveryInFlight) {
      await this.#tpslRecoveryInFlight;
      return;
    }
    this.#tpslRecoveryInFlight = (async (): Promise<void> => {
      try {
        // Index corruption/read failure PROPAGATES (logged by the hook):
        // silently treating it as empty would disable recovery entirely.
        const index = await this.#readTpslJournalIndex();
        if (index.length === 0) {
          this.#tpslRecoveryGeneration = generation;
          return;
        }
        const address = this.#boundAddress;
        if (!address) {
          return;
        }
        const accountIndex = await this.#ensureAccountIndex();
        this.#assertSession(generation);
        const prefix = `${address}:${accountIndex}:${this.#apiKeyIndex}:`;
        let allResolved = true;
        for (const settlementKey of index) {
          if (!settlementKey.startsWith(prefix)) {
            continue;
          }
          const resolved = await this.#recoverTpslSymbol(
            settlementKey.slice(prefix.length),
            settlementKey,
            generation,
            accountIndex,
          ).catch((error) => {
            // Surface the exact cause (corruption, transport, session
            // fence) — the entry stays retryable, but never silently.
            this.#deps.debugLogger.log(
              '[LighterProvider] TP/SL journal entry recovery failed',
              { settlementKey, error: String(error) },
            );
            return false;
          });
          if (!resolved) {
            allResolved = false;
          }
        }
        // Marked complete ONLY when everything resolved: unresolved or
        // errored entries stay retryable within this session.
        if (allResolved) {
          this.#tpslRecoveryGeneration = generation;
        }
      } finally {
        this.#tpslRecoveryInFlight = null;
        if (this.#tpslRecoveryKickPending) {
          this.#tpslRecoveryKickPending = false;
          this.#kickTpslRecovery();
        }
      }
    })();
    await this.#tpslRecoveryInFlight;
  };

  /**
   * Recover one pending TP/SL journal without any new protection intent.
   *
   * @param symbol - Market symbol from the settlement key.
   * @param settlementKey - Full settlement identity.
   * @param generation - Captured session generation.
   * @param accountIndex - Captured account index.
   * @returns True when the obligation fully resolved (journal cleared);
   * false when it remains pending and must be retried.
   */
  readonly #recoverTpslSymbol = async (
    symbol: string,
    settlementKey: string,
    generation: number,
    accountIndex: number,
  ): Promise<boolean> => {
    const journalEntry = await this.#loadTpslJournal(settlementKey);
    if (!journalEntry) {
      // Stale index entry with no journal behind it: prune.
      await this.#clearTpslJournal(settlementKey).catch(() => undefined);
      return true;
    }
    const markets = await this.#ensureMarkets();
    const market = markets.get(symbol);
    if (!market) {
      return false;
    }
    await this.#ensureSignerReady();
    this.#assertSession(generation);
    const authToken = await this.#getAuthToken();
    this.#assertSession(generation);
    return await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit): Promise<boolean> => {
        const readActiveRaw = async (): Promise<LighterApiOrder[]> => {
          this.#assertSession(generation);
          const response = await this.#clientService.getActiveOrders(
            accountIndex,
            authToken,
          );
          this.#assertSession(generation);
          return response.orders;
        };
        const readInactiveFor = this.#makeInactiveReader(
          accountIndex,
          authToken,
          generation,
          market.marketId,
        );
        return await this.#settleTpslObligation({
          settlementKey,
          symbol,
          journalEntry,
          market,
          accountIndex,
          generation,
          readActiveRaw,
          readInactiveFor,
          nextNonce,
          submit,
        });
      },
      generation,
    );
  };

  /**
   * THE TP/SL obligation state machine — the single implementation run by
   * startup/read-path recovery AND by a direct foreground update that
   * finds a pending journal. Reconciles every attempt authoritatively,
   * then acts per durable intent and phase, and clears the journal ONLY
   * on a fully-settled outcome.
   *
   * @param context - Captured settlement context.
   * @param context.settlementKey - Full settlement identity.
   * @param context.symbol - Market symbol.
   * @param context.journalEntry - The pending journal.
   * @param context.market - Market integerization parameters.
   * @param context.market.marketId - Venue market id.
   * @param context.market.supportedSizeDecimals - Size integerization decimals.
   * @param context.market.supportedPriceDecimals - Price integerization decimals.
   * @param context.accountIndex - Captured account index.
   * @param context.generation - Captured session generation.
   * @param context.readActiveRaw - Session-fenced raw active reader.
   * @param context.readInactiveFor - Targeted inactive reader.
   * @param context.nextNonce - Lock-section nonce issuer.
   * @param context.submit - Lock-section submitter.
   * @returns True when fully resolved (journal cleared); false when the
   * obligation remains pending and must be retried.
   */
  readonly #settleTpslObligation = async (context: {
    settlementKey: string;
    symbol: string;
    journalEntry: TpslJournalState;
    market: {
      marketId: number;
      supportedSizeDecimals: number;
      supportedPriceDecimals: number;
    };
    accountIndex: number;
    generation: number;
    readActiveRaw: () => Promise<LighterApiOrder[]>;
    readInactiveFor: (targetClientIds: number[]) => Promise<LighterApiOrder[]>;
    nextNonce: () => Promise<number>;
    submit: (
      txType: number,
      txInfo: string,
      onAccepted?: () => void,
    ) => Promise<LighterSendTxResponse>;
  }): Promise<boolean> => {
    const {
      settlementKey,
      journalEntry,
      market,
      accountIndex,
      generation,
      readActiveRaw,
      readInactiveFor,
      nextNonce,
      submit,
    } = context;
    const reconciled = await this.#reconcilePriorTpsl(
      readActiveRaw,
      readInactiveFor,
      accountIndex,
      journalEntry,
    );
    if (reconciled === 'unresolved') {
      return false;
    }
    const persistEntry = async (): Promise<void> => {
      this.#tpslUnsettled.set(settlementKey, journalEntry);
      await this.#persistTpslJournal(settlementKey, journalEntry);
    };
    // Same journalled cancel discipline as the live transition.
    const submitRecoveryCancel = async (
      orderId: string,
      role: 'stale' | 'rollback',
    ): Promise<void> => {
      if (role === 'stale' && journalEntry.intent === 'replace') {
        journalEntry.phase = 'cancelling';
      }
      const cancelNonce = await nextNonce();
      const signedCancel =
        await this.#getSignerBridge().execute<LighterTxResult>({
          function: '_signCancelOrder',
          params: [accountIndex, market.marketId, orderId, cancelNonce],
        });
      if (signedCancel.error) {
        throw new Error(
          `Failed to cancel trigger order ${orderId}: ${signedCancel.error}`,
        );
      }
      const cancelIdentity = requireSignedTxIdentity(signedCancel);
      const cancelAttempt: TpslCancelAttempt = {
        kind: 'cancel',
        nonce: cancelNonce,
        outcome: 'unknown',
        orderId,
        txHash: cancelIdentity.txHash,
        expiresAt: cancelIdentity.expiresAt,
        role,
      };
      journalEntry.attempts.push(cancelAttempt);
      await persistEntry();
      await submit(LIGHTER_TX_TYPE_CANCEL_ORDER, signedCancel.txInfo, () => {
        cancelAttempt.outcome = 'accepted';
      });
    };
    // Restore one prior intent from its durably persisted EXACT wire
    // payload; `priorOrderId` durably keys WHICH intent this restores.
    const submitRecoveryRestore = async (
      prior: TpslPriorTrigger,
    ): Promise<number> => {
      journalEntry.phase = 'restoring';
      const [restoreClientId] = this.#allocateClientOrderIndexes(1);
      const restoreNonce = await nextNonce();
      const signedRestore =
        await this.#getSignerBridge().execute<LighterTxResult>({
          function: '_signCreateOrder',
          params: buildRestoreWireParams(
            prior,
            market,
            accountIndex,
            restoreClientId,
            restoreNonce,
          ),
        });
      if (signedRestore.error) {
        throw new Error(
          `Failed to restore previous protection: ${signedRestore.error}`,
        );
      }
      const restoreIdentity = requireSignedTxIdentity(signedRestore);
      const restoreAttempt: TpslCreateAttempt = {
        kind: 'create',
        nonce: restoreNonce,
        outcome: 'unknown',
        clientIds: [restoreClientId],
        txHash: restoreIdentity.txHash,
        expiresAt: restoreIdentity.expiresAt,
        role: 'restore',
        priorOrderId: prior.orderId,
      };
      journalEntry.attempts.push(restoreAttempt);
      await persistEntry();
      await submit(LIGHTER_TX_TYPE_CREATE_ORDER, signedRestore.txInfo, () => {
        restoreAttempt.outcome = 'accepted';
      });
      return restoreClientId;
    };
    // Classify every journalled create leg on the books (reconcile
    // proved each attempt either landed or never can).
    const replacementIds = journalEntry.attempts
      .filter(
        (attempt): attempt is TpslCreateAttempt =>
          attempt.kind === 'create' && attempt.role === 'replacement',
      )
      .flatMap((attempt) => attempt.clientIds);
    const restoreAttempts = journalEntry.attempts.filter(
      (attempt): attempt is TpslCreateAttempt =>
        attempt.kind === 'create' && attempt.role === 'restore',
    );
    const allCreateIds = [
      ...replacementIds,
      ...restoreAttempts.flatMap((attempt) => attempt.clientIds),
    ];
    const rawActive = await readActiveRaw();
    const missingFromActive = allCreateIds.filter(
      (clientId) =>
        !rawActive.some(
          (order) => String(order.clientOrderIndex) === String(clientId),
        ),
    );
    const rawInactive =
      missingFromActive.length > 0
        ? await readInactiveFor(missingFromActive)
        : [];
    const stateOf = (clientId: number): 'active' | 'success' | 'failed' => {
      if (
        rawActive.some(
          (order) => String(order.clientOrderIndex) === String(clientId),
        )
      ) {
        return 'active';
      }
      const terminal = rawInactive.find(
        (order) => String(order.clientOrderIndex) === String(clientId),
      );
      if (!terminal) {
        // Reconcile proved never-landed: same outcome as failed.
        return 'failed';
      }
      const status = terminal.status.toLowerCase();
      const fullyExecuted =
        (status === 'filled' || status === 'executed') &&
        parseStrictDecimal(terminal.remainingBaseAmount) === 0;
      return fullyExecuted ? 'success' : 'failed';
    };
    const replacementStates = replacementIds.map(stateOf);
    const anySuccess = replacementStates.includes('success');
    const anyActive = replacementStates.includes('active');
    const anyFailed = replacementStates.includes('failed');
    const priorActive = (prior: TpslPriorTrigger): boolean =>
      rawActive.some((order) => String(order.orderIndex) === prior.orderId);
    const cancelledOrderIds: string[] = [];
    const createdClientIds: number[] = [];
    const cancelPriorLeftovers = async (): Promise<void> => {
      // The replacement must STAY proven while the old protection is
      // removed: keep its live ids in the final expectation so a leg
      // terminal-failing DURING these cancels (the phase race) fails
      // this pass instead of clearing the journal naked.
      for (const clientId of replacementIds) {
        if (stateOf(clientId) === 'active') {
          createdClientIds.push(clientId);
        }
      }
      for (const prior of journalEntry.priorTriggers) {
        if (priorActive(prior)) {
          await submitRecoveryCancel(prior.orderId, 'stale');
          cancelledOrderIds.push(prior.orderId);
        }
      }
    };
    const rollbackActiveReplacements = async (): Promise<void> => {
      for (const clientId of replacementIds) {
        if (stateOf(clientId) !== 'active') {
          continue;
        }
        const survivor = rawActive.find(
          (order) => String(order.clientOrderIndex) === String(clientId),
        );
        if (survivor) {
          await submitRecoveryCancel(String(survivor.orderIndex), 'rollback');
          cancelledOrderIds.push(String(survivor.orderIndex));
        }
      }
    };
    /**
     * A restore may ONLY attach to the position lifecycle the protection
     * belonged to. Verified against the live venue position; absence or
     * any mismatch (side, size, entry) fails closed.
     *
     * @returns True when the persisted fingerprint matches the live one.
     */
    const lifecycleVerified = async (): Promise<boolean> => {
      const persisted = journalEntry.positionFingerprint;
      if (!persisted) {
        return false;
      }
      this.#assertSession(generation);
      const accountResponse =
        await this.#clientService.getAccountByIndex(accountIndex);
      this.#assertSession(generation);
      const rawPosition = accountResponse.accounts?.[0]?.positions?.find(
        (position) => position.marketId === market.marketId,
      );
      if (!rawPosition) {
        return false;
      }
      const liveMagnitude = parseStrictDecimal(String(rawPosition.position));
      const persistedMagnitude = parseStrictDecimal(persisted.size);
      const liveEntry = parseStrictDecimal(String(rawPosition.avgEntryPrice));
      const persistedEntry = parseStrictDecimal(persisted.entryPrice);
      return (
        rawPosition.sign === persisted.sign &&
        liveMagnitude !== null &&
        liveMagnitude === persistedMagnitude &&
        liveEntry !== null &&
        liveEntry === persistedEntry
      );
    };
    // Restore every prior intent not already covered, gated by the
    // lifecycle fingerprint. When the lifecycle cannot be proven, fail
    // closed WITHOUT attaching stale triggers: cancel every journalled
    // leg still active (they belong to the dead lifecycle) and resolve.
    const restorePriorSet = async (): Promise<void> => {
      const needingRestore = journalEntry.priorTriggers.filter((prior) => {
        const restoredCovered = restoreAttempts.some(
          (attempt) =>
            attempt.priorOrderId === prior.orderId &&
            attempt.clientIds.every(
              (clientId) => stateOf(clientId) !== 'failed',
            ),
        );
        return !priorActive(prior) && !restoredCovered;
      });
      if (needingRestore.length === 0) {
        return;
      }
      if (await lifecycleVerified()) {
        for (const prior of needingRestore) {
          createdClientIds.push(await submitRecoveryRestore(prior));
        }
        return;
      }
      this.#deps.debugLogger.log(
        '[LighterProvider] TP/SL restore refused: position lifecycle changed',
        { settlementKey },
      );
      await rollbackActiveReplacements();
      for (const prior of journalEntry.priorTriggers) {
        if (priorActive(prior)) {
          await submitRecoveryCancel(prior.orderId, 'stale');
          cancelledOrderIds.push(prior.orderId);
        }
      }
    };
    if (journalEntry.intent === 'remove') {
      // An intentional REMOVAL is never "recovered" by restoring the
      // cancelled protection: finish/reconcile the cancels exactly.
      for (const prior of journalEntry.priorTriggers) {
        if (priorActive(prior)) {
          await submitRecoveryCancel(prior.orderId, 'stale');
          cancelledOrderIds.push(prior.orderId);
        }
      }
    } else if (journalEntry.phase === 'creating') {
      // Old protection untouched. Nothing landed / everything failed
      // → the old set is still the only intent: just clear.
      if (replacementIds.length > 0 && (anySuccess || anyActive)) {
        if (!anySuccess && anyFailed) {
          // Partial OCO before old cancels: roll surviving legs back so
          // the OLD protection remains authoritative.
          await rollbackActiveReplacements();
        } else {
          // Replacement in force (or executed): finish the swap.
          await cancelPriorLeftovers();
        }
      }
    } else if (journalEntry.phase === 'cancelling') {
      if (anySuccess || (anyActive && !anyFailed)) {
        // Replacement fully won — finish cancelling the old protection.
        await cancelPriorLeftovers();
      } else if (anyActive && anyFailed) {
        // Degraded OCO pair AFTER old cancels began: never silently keep
        // a partial set. Roll the survivor back and restore the WHOLE
        // prior protection.
        await rollbackActiveReplacements();
        await restorePriorSet();
      } else {
        // Replacement fully failed AFTER old cancels began: RESTORE
        // every prior intent whose original order is gone.
        await restorePriorSet();
      }
    } else {
      // 'restoring': each prior intent must be covered — original still
      // active, or a restore leg (keyed by priorOrderId) landed.
      // Re-create exactly the missing ones.
      await restorePriorSet();
    }
    if (cancelledOrderIds.length > 0 || createdClientIds.length > 0) {
      const settled = await this.#awaitTpslVisibility(
        readActiveRaw,
        readInactiveFor,
        { createdClientIds, cancelledOrderIds },
      );
      // ONLY a fully-settled pass may clear. 'created-terminal-failed'
      // (a rejected restore, or a replacement dying during the old
      // cancels) retains the journal so the next pass restores or
      // retries — clearing here would leave the position naked.
      if (settled.outcome !== 'settled') {
        return false;
      }
    }
    await this.#clearTpslJournal(settlementKey);
    return true;
  };

  /**
   * Reconcile a PRIOR transition's expectation before any new mutation.
   * Only created ids can cause duplicates from a stale snapshot, so they
   * must be accounted for (active or terminal). Cancelled ids are safe in
   * either state: still-active targets reappear in the fresh snapshot and
   * are re-cancelled.
   *
   * @param readActiveRaw - Strict raw active-orders reader.
   * @param readInactive - Targeted inactive-history reader (cached, bounded).
   * @param accountIndex - Captured account index.
   * @param entry - The recorded expectation.
   * @param entry.attempts - Journalled per-attempt submissions.
   * @param entry.recordedAt - When the journal was recorded (ms).
   * @returns 'resolved' when safe to proceed; 'unresolved' when an
   * ACCEPTED mutation is still not visible.
   */
  readonly #reconcilePriorTpsl = async (
    readActiveRaw: () => Promise<LighterApiOrder[]>,
    readInactive: (targetClientIds: number[]) => Promise<LighterApiOrder[]>,
    accountIndex: number,
    entry: { attempts: TpslAttempt[]; recordedAt: number },
  ): Promise<'resolved' | 'unresolved'> => {
    // Per-attempt reconciliation, authoritative and never time-guessed:
    // 1. Books first — a create is resolved when its ids are all
    //    active/terminal, a cancel when its target left the active book.
    // 2. Otherwise the EXACT signed tx hash is looked up: a strict match
    //    (hash + account + api key slot + nonce) proves the payload
    //    reached the sequencer, so absence from the books can only be
    //    visibility lag (keep blocking). A venue-confirmed not-found is
    //    only never-landed once the signed ExpiredAt (+ clock slack) has
    //    passed — the sequencer cannot accept an expired payload.
    const satisfiedOnBooks = (
      attempt: TpslAttempt,
      rawActive: LighterApiOrder[],
      rawInactive: LighterApiOrder[],
    ): boolean =>
      attempt.kind === 'create'
        ? attempt.clientIds.every(
            (clientId) =>
              rawActive.some(
                (order) => String(order.clientOrderIndex) === String(clientId),
              ) ||
              rawInactive.some(
                (order) => String(order.clientOrderIndex) === String(clientId),
              ),
          )
        : !rawActive.some(
            (order) => String(order.orderIndex) === attempt.orderId,
          );
    // Books can satisfy only OBSERVED-accepted attempts. An UNKNOWN
    // attempt's desired book state may hold for INDEPENDENT reasons (a
    // fill, an external cancel) while the signed payload could still
    // land later and consume its nonce — every unknown attempt must
    // resolve by exact hash identity or proven expiry.
    let rawActive: LighterApiOrder[] = [];
    let rawInactive: LighterApiOrder[] = [];
    for (let poll = 0; poll < LIGHTER_TPSL_SETTLE_ATTEMPTS; poll += 1) {
      const activeNow = await readActiveRaw();
      // ACTIVE-FIRST (see #awaitTpslVisibility): inactive history is only
      // consulted for create ids not already visible active.
      const createIdsMissingFromActive = entry.attempts
        .filter(
          (attempt): attempt is TpslCreateAttempt => attempt.kind === 'create',
        )
        .flatMap((attempt) => attempt.clientIds)
        .filter(
          (clientId) =>
            !activeNow.some(
              (order) => String(order.clientOrderIndex) === String(clientId),
            ),
        );
      const inactiveNow =
        createIdsMissingFromActive.length > 0
          ? await readInactive(createIdsMissingFromActive)
          : [];
      rawActive = activeNow;
      rawInactive = inactiveNow;
      // Poll the books through visibility lag for ALL attempts — book
      // convergence resolves accepted attempts directly and lets an
      // unknown-but-landed attempt pass its final identity check below.
      const anyUnsatisfied = entry.attempts.some(
        (attempt) => !satisfiedOnBooks(attempt, activeNow, inactiveNow),
      );
      if (!anyUnsatisfied) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, LIGHTER_TPSL_SETTLE_POLL_MS),
      );
    }
    for (const attempt of entry.attempts) {
      if (
        attempt.outcome === 'accepted' &&
        satisfiedOnBooks(attempt, rawActive, rawInactive)
      ) {
        continue;
      }
      let lookedUp: LighterTxLookupResponse | null;
      try {
        lookedUp = await this.#clientService.getTx(attempt.txHash);
      } catch {
        // Lookup failure is AMBIGUOUS, never evidence of non-acceptance.
        return 'unresolved';
      }
      if (lookedUp !== null) {
        // The exact signed hash exists at the venue. With a matching
        // identity (hash + account + api key slot + nonce):
        //  - terminal FAILED/REJECTED status (4/5) resolves the attempt
        //    deterministically — the nonce was consumed but the books
        //    were never mutated (the machine re-acts on book state);
        //  - any other status with the books already reflecting the
        //    attempt resolves it;
        //  - otherwise it reached the sequencer but is not yet visible —
        //    keep blocking. A NON-matching payload under this hash fails
        //    closed identically, and is logged (signer/venue defect).
        const matchesIdentity =
          typeof lookedUp.hash === 'string' &&
          lookedUp.hash.toLowerCase().replace(/^0x/u, '') ===
            attempt.txHash.toLowerCase().replace(/^0x/u, '') &&
          lookedUp.accountIndex === accountIndex &&
          lookedUp.apiKeyIndex === this.#apiKeyIndex &&
          lookedUp.nonce === attempt.nonce;
        if (!matchesIdentity) {
          this.#deps.debugLogger.log(
            '[LighterProvider] TP/SL tx lookup identity mismatch; failing closed',
            { txHash: attempt.txHash },
          );
          return 'unresolved';
        }
        if (lookedUp.status === 4 || lookedUp.status === 5) {
          continue;
        }
        if (satisfiedOnBooks(attempt, rawActive, rawInactive)) {
          continue;
        }
        return 'unresolved';
      }
      // Venue-confirmed not-found: only never-landed once the signed
      // payload can no longer be accepted.
      if (Date.now() <= attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS) {
        return 'unresolved';
      }
      // Expired and venue-confirmed absent: authoritatively never landed —
      // its reserved nonce is provably unconsumed and may be released.
      this.#releaseNonceReservation(accountIndex, attempt.nonce);
    }
    return 'resolved';
  };

  /**
   * Release a session-global nonce reservation once a submission is
   * PROVEN never-landed. Only the topmost reservation can be safely
   * lowered; anything else stays reserved until proven in turn.
   *
   * @param accountIndex - Venue account index.
   * @param nonce - The proven-unconsumed nonce.
   */
  readonly #releaseNonceReservation = (
    accountIndex: number,
    nonce: number,
  ): void => {
    const reservationKey = `${accountIndex}:${this.#apiKeyIndex}`;
    if (this.#nonceReservations.get(reservationKey) === nonce + 1) {
      this.#nonceReservations.set(reservationKey, nonce);
    }
  };

  /**
   * Bounded poll until the venue reflects a TP/SL transition: every
   * created client id accounted for and every cancelled order id absent
   * from the active book.
   *
   * A created trigger can EXECUTE, expire, or be venue-cancelled before
   * the first poll (an immediate/crossed TP/SL never rests), so created
   * ids reconcile against the active book PLUS the inactive/terminal
   * history — otherwise the obligation could never resolve and would
   * permanently block the symbol.
   *
   * @param readActiveRaw - Strict raw active-orders reader (session-fenced).
   * @param readInactive - Targeted inactive-history reader (cached, bounded).
   * @param expectation - Ids the venue must account for.
   * @param expectation.createdClientIds - Client ids that must be active
   * or terminal.
   * @param expectation.cancelledOrderIds - Order ids that must leave the
   * active book.
   * @returns Outcome: 'settled' when every id is accounted for and no
   * created id failed ('executedCreated' marks created ids that reached a
   * SUCCESS terminal state — filled/executed — instead of resting
   * active); 'created-terminal-failed' when the venue reports a created
   * id cancelled/rejected/expired (the obligation RESOLVES — the caller
   * surfaces the failure but no permanent block remains); 'timeout' when
   * the bound elapsed unresolved.
   */
  readonly #awaitTpslVisibility = async (
    readActiveRaw: () => Promise<LighterApiOrder[]>,
    readInactive: (targetClientIds: number[]) => Promise<LighterApiOrder[]>,
    expectation: { createdClientIds: number[]; cancelledOrderIds: string[] },
  ): Promise<
    | { outcome: 'settled'; executedCreated: boolean }
    | {
        outcome: 'created-terminal-failed';
        /** New legs still resting ACTIVE despite a failed sibling. */
        survivingActiveClientIds: number[];
      }
    | { outcome: 'timeout' }
  > => {
    for (
      let attempt = 0;
      attempt < LIGHTER_TPSL_SETTLE_ATTEMPTS;
      attempt += 1
    ) {
      const rawActive = await readActiveRaw();
      // ACTIVE-FIRST: only ids not already proven active need the
      // high-weight inactive-history lookup; a normal freshly-active
      // replacement performs ZERO inactive requests.
      const missingFromActive = expectation.createdClientIds.filter(
        (clientId) =>
          !rawActive.some(
            (order) => String(order.clientOrderIndex) === String(clientId),
          ),
      );
      const rawInactive =
        missingFromActive.length > 0
          ? await readInactive(missingFromActive)
          : [];
      // Per-id classification. Success is EXACT-whitelisted
      // ('filled'/'executed') AND requires a strictly ZERO remaining size
      // (a 'filled' row with remainder is not a proven execution);
      // everything else terminal — including unknown statuses — fails
      // CLOSED.
      const classified = expectation.createdClientIds.map((clientId) => {
        if (
          rawActive.some(
            (order) => String(order.clientOrderIndex) === String(clientId),
          )
        ) {
          return { clientId, state: 'active' as const };
        }
        const terminal = rawInactive.find(
          (order) => String(order.clientOrderIndex) === String(clientId),
        );
        if (!terminal) {
          return { clientId, state: 'missing' as const };
        }
        const status = terminal.status.toLowerCase();
        // STRICT remaining parse: a prefix-parsed '0oops' must never
        // count as a proven zero remainder.
        const fullyExecuted =
          (status === 'filled' || status === 'executed') &&
          parseStrictDecimal(terminal.remainingBaseAmount) === 0;
        return {
          clientId,
          state: fullyExecuted ? ('success' as const) : ('failed' as const),
        };
      });
      const createdAccounted = !classified.some(
        (entry) => entry.state === 'missing',
      );
      const cancelledGone = expectation.cancelledOrderIds.every(
        (orderId) =>
          !rawActive.some((order) => String(order.orderIndex) === orderId),
      );
      if (createdAccounted && cancelledGone) {
        // OCO aggregation: one leg fully filling auto-cancels its sibling,
        // so ANY proven execution makes the overall outcome an EXECUTION.
        // Only failed-without-success is a terminal failure — reported
        // WITH any legs still active so the caller can roll back or keep
        // them explicitly.
        if (classified.some((entry) => entry.state === 'success')) {
          return { outcome: 'settled', executedCreated: true };
        }
        if (classified.some((entry) => entry.state === 'failed')) {
          return {
            outcome: 'created-terminal-failed',
            survivingActiveClientIds: classified
              .filter((entry) => entry.state === 'active')
              .map((entry) => entry.clientId),
          };
        }
        return { outcome: 'settled', executedCreated: false };
      }
      await new Promise((resolve) =>
        setTimeout(resolve, LIGHTER_TPSL_SETTLE_POLL_MS),
      );
    }
    return { outcome: 'timeout' };
  };

  /**
   * Throws when the session generation moved past the captured one — used
   * after every await in account-bound async work so a delayed account-A
   * step can never mutate account-B's session.
   *
   * @param generation - Generation captured when the work started.
   */
  readonly #assertSession = (generation: number): void => {
    if (generation !== this.#sessionGeneration) {
      throw new Error(
        'Operation cancelled: the wallet switched accounts (or the signer reset) while this operation was in flight',
      );
    }
    // The generation only advances when some provider call rebinds; also
    // notice a wallet switch nothing has observed yet. Account-bound work
    // must never run without a binding: every legitimate flow (including
    // headless l1Address and configured-index setups) binds first, so a
    // null binding here means the wallet was deselected — fail closed even
    // when a configured account index could still resolve.
    if (this.#boundAddress === null) {
      throw new Error(
        'Operation cancelled: no wallet account is bound to the venue session',
      );
    }
    let address: string | null = null;
    try {
      address = this.#walletService.getUserAddress().toLowerCase();
    } catch {
      address = null;
    }
    if (address !== this.#boundAddress) {
      if (address === null) {
        // Deselected: nothing to rebind to yet.
        this.#invalidateSessionState();
        this.#teardownStream();
      } else {
        // Unobserved switch: rebind properly (invalidates caches and
        // rebuilds stream channels for the new account) before cancelling
        // the stale operation.
        this.#ensureSessionBinding();
      }
      throw new Error(
        'Operation cancelled: the wallet switched accounts (or the signer reset) while this operation was in flight',
      );
    }
  };

  /** Drop every cache derived from the previously bound account. */
  readonly #invalidateSessionState = (): void => {
    this.#sessionGeneration += 1;
    this.#boundAddress = null;
    this.#accountIndex = null;
    this.#signerReadyPromise = null;
    this.#authToken = null;
    // #tpslUnsettled survives (address+accountIndex+symbol keyed): a
    // reselect of the same account must still reconcile its pending ids.
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
    const generation = this.#sessionGeneration;
    const setupPromise = this.#setupSigner(generation);
    this.#signerReadyPromise = setupPromise;
    try {
      return await setupPromise;
    } catch (error) {
      // Only clear the promise WE installed — a newer session may already
      // have replaced it, and an old rejection must not tear that down.
      if (this.#signerReadyPromise === setupPromise) {
        this.#signerReadyPromise = null;
      }
      throw error;
    }
  };

  readonly #setupSigner = async (generation: number): Promise<void> => {
    const bridge = this.#getSignerBridge();
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const chainId = getLighterChainId(this.#clientService.network);
    // The WASM client is a singleton inside the bridge host and the venue
    // key registration is a nonce-consuming write. Both therefore run
    // INSIDE the venue write lock: a stale previous-account setup aborts at
    // the lock's fence before it can touch the bridge, and no other
    // account's setup or write can interleave with this critical section.
    await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit) => {
        const seed = await this.#walletService.deriveKeySeedPlain(
          this.#apiKeyIndex,
        );
        this.#assertSession(generation);
        const nonce = await nextNonce();
        this.#assertSession(generation);
        const created = await bridge.execute<LighterCreateClientResult>({
          function: '_createClient',
          params: [seed, chainId, accountIndex, nonce, this.#apiKeyIndex],
        });
        if (created.error || !created.success) {
          throw new Error(
            `Lighter signer client creation failed: ${created.error ?? 'unknown'}`,
          );
        }
        this.#assertSession(generation);
        this.#venuePublicKey = created.pk;

        // Register the venue key when the slot does not hold it yet. Only
        // the plaintext body leaves this scope — `created.prv` (the venue
        // private key) must stay inside the signer bridge boundary and
        // never be logged.
        const registered = await this.#isVenueKeyRegistered(accountIndex);
        this.#assertSession(generation);
        if (!registered) {
          await this.#registerVenueKey(
            accountIndex,
            created.body,
            generation,
            nextNonce,
            submit,
          );
          this.#assertSession(generation);
        }
      },
      generation,
    );
    // AUTOMATIC bounded recovery: pending TP/SL journals must be
    // reconciled at startup/reconnect, not only when the next mutation
    // happens to run. Detached so it awaits THIS setup's resolved promise
    // instead of deadlocking on it.
    this.#kickTpslRecovery();
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
    generation: number,
    nextNonce: () => Promise<number>,
    submit: (txType: number, txInfo: string) => Promise<LighterSendTxResponse>,
  ): Promise<void> => {
    const bridge = this.#getSignerBridge();
    // The ChangePubKey plaintext from _createClient embeds the nonce used at
    // client creation; sign it with the user's L1 account (EIP-191). Every
    // await is fenced and the submission goes through the lock's fenced
    // submit — a stale registration can never reach the venue.
    const l1Signature =
      await this.#walletService.signPersonalMessage(changePubKeyBody);
    this.#assertSession(generation);
    const nonce = await nextNonce();
    this.#assertSession(generation);
    const signed = await bridge.execute<LighterSignChangePubKeyResult>({
      function: '_signChangePubKey',
      params: [accountIndex, l1Signature, nonce, this.#apiKeyIndex],
    });
    if (signed.error) {
      throw new Error(`Lighter ChangePubKey signing failed: ${signed.error}`);
    }
    this.#assertSession(generation);
    const result = await submit(LIGHTER_TX_TYPE_CHANGE_PUB_KEY, signed.txInfo);
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

  /** Every client order id this instance has issued (collision set). */
  readonly #issuedClientOrderIds = new Set<number>();

  /**
   * Atomically reserve unique client order indexes.
   *
   * The venue requires client_order_index to be UNIQUE ACROSS ALL MARKETS
   * for the account (official Get Started docs) and does not require
   * monotonicity. Ids are uniform random draws over the uint48 space
   * (two 24-bit draws, exact in float space) with a per-instance
   * collision set and retry: within an instance duplicates are
   * impossible; across simultaneous instances/devices a single pair
   * collides with probability 1/2^48 (~3.6e-15) and the birthday bound
   * over n total ids is ~n(n-1)/2^49 — about 1.8e-7 after ten thousand
   * orders, versus the 1% per-pair risk of the previous 100-lane scheme.
   *
   * @param count - How many ids to reserve.
   * @returns The reserved ids.
   */
  readonly #allocateClientOrderIndexes = (count: number): number[] => {
    const ids: number[] = [];
    // Bounded: a degenerate randomness source (or an absurdly full
    // collision set) must surface as an error, never a synchronous spin.
    // 100 attempts per id makes accidental exhaustion unreachable in
    // practice (collision odds per draw stay astronomically small).
    let attempts = 0;
    const maxAttempts = count * 100;
    while (ids.length < count) {
      if (attempts >= maxAttempts) {
        throw new Error(
          `Unable to allocate a unique Lighter client order id after ${maxAttempts} attempts`,
        );
      }
      attempts += 1;
      const high = Math.floor(Math.random() * 2 ** 24);
      const low = Math.floor(Math.random() * 2 ** 24);
      const candidate = high * 2 ** 24 + low;
      if (candidate === 0 || this.#issuedClientOrderIds.has(candidate)) {
        continue;
      }
      this.#issuedClientOrderIds.add(candidate);
      ids.push(candidate);
    }
    return ids;
  };

  /**
   * Serialize a nonce-consuming venue write.
   *
   * Lighter nonces are strictly ordered per key slot; two interleaved
   * fetch→submit pairs (e.g. the controller's per-item batch fallbacks
   * running concurrently) would sign with the same nonce and get one
   * rejection. Every write acquires the chain, fetches a fresh nonce
   * inside it, and submits before the next write's fetch runs. A section
   * queued under a wallet account that has since been switched away from
   * refuses to run — a delayed account-A write must never execute inside
   * account-B's session.
   *
   * @param accountIndex - Account whose key-slot nonce is consumed.
   * @param section - Work to run exclusively; fetch nonces via the
   * provided helper (each call returns the next fresh nonce).
   * @param generationAtIntent - Session generation captured when the
   * caller's intent was formed (defaults to now).
   * @returns The section's result.
   */
  readonly #withVenueWriteLock = async <Result>(
    accountIndex: number,
    section: (
      nextNonce: () => Promise<number>,
      submit: (
        txType: number,
        txInfo: string,
        onAccepted?: () => void,
      ) => Promise<LighterSendTxResponse>,
    ) => Promise<Result>,
    generationAtIntent = this.#sessionGeneration,
  ): Promise<Result> => {
    const criticalSection = async (): Promise<Result> => {
      this.#assertSession(generationAtIntent);
      // Monotonic nonce reservation: the venue's nextNonce endpoint can
      // LAG accepted submissions. The floor is SESSION-GLOBAL per
      // accountIndex:apiKeyIndex — a queued/next lock section (any
      // symbol, any operation) must never be handed a nonce an earlier
      // submission may have consumed, even when that submission's
      // response was lost. Reservation advances at DISPATCH (a signing
      // failure never burns a nonce the venue still expects); a proven
      // never-landed submission releases it again via reconciliation.
      const reservationKey = `${accountIndex}:${this.#apiKeyIndex}`;
      let lastIssuedNonce: number | null = null;
      const nextNonce = async (): Promise<number> => {
        // Re-fenced on every fetch AND after it resolves: the account can
        // switch between the section's own await points, not only while it
        // sat in the queue.
        this.#assertSession(generationAtIntent);
        const nonceResponse = await this.#clientService.getNextNonce(
          accountIndex,
          this.#apiKeyIndex,
        );
        this.#assertSession(generationAtIntent);
        const reservedFloor = this.#nonceReservations.get(reservationKey);
        const issued =
          reservedFloor === undefined
            ? nonceResponse.nonce
            : Math.max(nonceResponse.nonce, reservedFloor);
        lastIssuedNonce = issued;
        return issued;
      };
      const submit = async (
        txType: number,
        txInfo: string,
        onAccepted?: () => void,
      ): Promise<LighterSendTxResponse> => {
        // Last fence before anything reaches the venue: a switch that
        // happened while SIGNING must abort before submission.
        this.#assertSession(generationAtIntent);
        // Reserve BEFORE dispatch: from this point the venue may consume
        // the nonce even if the response never arrives.
        if (lastIssuedNonce !== null) {
          this.#nonceReservations.set(reservationKey, lastIssuedNonce + 1);
        }
        const response = await this.#clientService.sendTx(txType, txInfo);
        // Acceptance bookkeeping runs SYNCHRONOUSLY before the post-fence:
        // a switch during network submission must cancel the operation,
        // never the record of an already-accepted venue mutation.
        onAccepted?.();
        // And after: a switch DURING network submission must not let the
        // operation report success under the new account's session.
        this.#assertSession(generationAtIntent);
        return response;
      };
      return await section(nextNonce, submit);
    };
    const run = this.#writeChain.then(criticalSection, criticalSection);
    this.#writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  };

  readonly #withVenueNonce = async <Result>(
    accountIndex: number,
    operation: (
      nonce: number,
      submit: (
        txType: number,
        txInfo: string,
        onAccepted?: () => void,
      ) => Promise<LighterSendTxResponse>,
    ) => Promise<Result>,
    generationAtIntent = this.#sessionGeneration,
  ): Promise<Result> =>
    await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit) => operation(await nextNonce(), submit),
      generationAtIntent,
    );

  readonly #getAuthToken = async (): Promise<string> => {
    this.#ensureSessionBinding();
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.#authToken && this.#authToken.deadline - nowSeconds > 60) {
      return this.#authToken.token;
    }
    const generation = this.#sessionGeneration;
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
    // Rebind first so an unobserved external switch during the bridge call
    // advances the generation, then compare: a token minted under a binding
    // that no longer exists must never be cached — re-mint under the new
    // captured session instead.
    this.#ensureSessionBinding();
    if (generation !== this.#sessionGeneration) {
      return await this.#getAuthToken();
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
      // Best effort: per-market max leverage from the venue's margin
      // fractions; the adapter's constant only stands in when unknown.
      await this.#ensureMarketMargins().catch(() => undefined);
      return markets
        .filter((market) => market.marketType === 'perp')
        .map((market) => {
          const adapted = adaptMarketFromLighter(market);
          const minInitial = this.#marginBySymbol.get(
            market.symbol,
          )?.minInitial;
          if (minInitial && minInitial > 0) {
            adapted.maxLeverage = Math.floor(10_000 / minInitial);
          }
          return adapted;
        });
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
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      // Per-market max leverage comes from the margin cache; warm it so
      // known markets never fall back to the global constant.
      await this.#ensureMarketMargins().catch(() => undefined);
      const accountIndex = await this.#ensureAccountIndex();
      const response =
        await this.#clientService.getAccountByIndex(accountIndex);
      this.#assertSession(generation);
      const account = response.accounts[0];
      if (!account?.positions) {
        return [];
      }
      // Adapt BEFORE filtering: the adapter strict-validates raw numeric
      // sizes, and a prefix-parsing filter would silently drop (or keep)
      // malformed entries like '0oops' before validation could fire.
      return account.positions
        .map((position) =>
          adaptPositionFromLighter(
            position,
            this.#maxLeverageForMarketId(position.marketId),
          ),
        )
        .filter((position) => parseFloat(position.size) !== 0);
    } catch (caughtError) {
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        // Capability gates and venue-data integrity failures must surface,
        // never degrade into empty state that can preserve stale views.
        throw caughtError;
      }
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
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const response =
        await this.#clientService.getAccountByIndex(accountIndex);
      // A delayed response for the previous account must never surface as
      // the current account's state.
      this.#assertSession(generation);
      const account = response.accounts[0];
      if (!account) {
        return EMPTY_ACCOUNT_STATE;
      }
      return adaptAccountStateFromLighter(account);
    } catch (caughtError) {
      if (this.#isUnsupportedCapabilityError(caughtError)) {
        // Capability gates must surface, never degrade into empty state.
        throw caughtError;
      }
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

  /**
   * STRICT active-orders read: any REST/auth failure THROWS. Mutation
   * flows (TP/SL replacement/removal) must use this — treating a swallowed
   * [] as authoritative would let them "succeed" while cancelling nothing.
   *
   * @returns Adapted open orders.
   */
  readonly #readOpenOrdersStrict = async (): Promise<Order[]> => {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    const authToken = await this.#getAuthToken();
    // The index and the token must belong to the SAME session — never
    // pair the previous account's index with the new account's token.
    this.#assertSession(generation);
    const response = await this.#clientService.getActiveOrders(
      accountIndex,
      authToken,
    );
    this.#assertSession(generation);
    return response.orders.map((order) =>
      adaptOrderFromLighter(
        order,
        this.#marketsById.get(order.marketIndex)?.symbol ??
          String(order.marketIndex),
      ),
    );
  };

  async getOpenOrders(_params?: GetOrdersParams): Promise<Order[]> {
    // Public reads re-kick pending journal recovery (deduped, detached).
    this.#kickTpslRecovery();
    try {
      return await this.#readOpenOrdersStrict();
    } catch (caughtError) {
      if (this.#isUnsupportedCapabilityError(caughtError)) {
        // Capability gates must surface, never degrade into empty state.
        throw caughtError;
      }
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
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const authToken = await this.#getAuthToken();
      this.#assertSession(generation);
      await this.#ensureMarkets();
      const response = await this.#clientService.getInactiveOrders(
        accountIndex,
        authToken,
      );
      // Both legs (historical + open) must come from one session — a
      // switch mid-way would merge account A's history with B's orders.
      this.#assertSession(generation);
      const historical = (response.orders ?? []).map((order) =>
        adaptOrderFromLighter(
          order,
          this.#marketsById.get(order.marketIndex)?.symbol ??
            String(order.marketIndex),
        ),
      );
      // Full lifecycle: open orders first, then the historical states.
      const open = await this.getOpenOrders(params);
      // getOpenOrders swallows its own cancellation into []; the merge must
      // still refuse to pair A's history with B's session.
      this.#assertSession(generation);
      return [...open, ...historical];
    } catch (caughtError) {
      if (this.#isUnsupportedCapabilityError(caughtError)) {
        // Capability gates must surface, never degrade into empty state.
        throw caughtError;
      }
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
  /**
   * Decide whether the caller's requested leverage needs a venue update.
   *
   * @param params - The order params carrying `leverage`.
   * @returns The UpdateLeverage margin fraction (hundredths of a percent)
   * to sign, or null when no change is needed.
   */
  readonly #resolveLeverageIntent = async (
    params: OrderParams,
  ): Promise<number | null> => {
    const requested = params.leverage;
    if (requested === undefined) {
      return null;
    }
    // Venue state decides, never the caller's possibly-stale
    // existingPositionLeverage snapshot.
    const positions = await this.getPositions();
    const held = positions.find(
      (position) => position.symbol === params.symbol,
    );
    if (
      held?.leverage?.value !== undefined &&
      Math.abs(held.leverage.value - requested) < 0.5
    ) {
      // Requested leverage already in effect — intent satisfied.
      return null;
    }
    // Otherwise sign the update inside the placement's own write lock. If
    // the market has a position or resting order the venue rejects it with
    // a clear error, failing the placement instead of silently trading at
    // a leverage the caller did not ask for.
    return Math.round(10_000 / requested);
  };

  async placeOrder(
    params: OrderParams,
    inheritedGeneration?: number,
  ): Promise<OrderResult> {
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
      const leverageError = lighterLeverageError(params.leverage);
      if (leverageError) {
        return { success: false, error: leverageError };
      }
      // Bind the write to the wallet account it was INITIATED under; if the
      // wallet switches before the queued critical section runs, it aborts.
      // A composite caller (closePosition) passes ITS generation so the
      // whole read-then-write sequence shares one intent identity.
      this.#ensureSessionBinding();
      const generationAtIntent = inheritedGeneration ?? this.#sessionGeneration;
      this.#assertSession(generationAtIntent);
      // All intent validation below uses PUBLIC market data only; signer
      // and account setup are deferred until it passes so invalid intent
      // causes zero bridge calls (no client creation or key registration
      // side effects).
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
      if (params.leverage !== undefined) {
        // Authoritative metadata REQUIRED: the display fallback (global
        // 50x) must never approve leverage for a market whose published
        // bound is unavailable.
        const maxLeverage = await this.#requireMarketMaxLeverage(params.symbol);
        if (maxLeverage === null) {
          return {
            success: false,
            error: `Cannot validate leverage for ${params.symbol}: venue margin metadata unavailable`,
          };
        }
        if (params.leverage > maxLeverage) {
          return {
            success: false,
            error: `Invalid leverage ${params.leverage}: exceeds the ${params.symbol} maximum of ${maxLeverage}x`,
          };
        }
      }

      // Slippage tolerance: caller basis points win, then the deprecated
      // decimal field, then the venue-conventional 5%.
      const slippageFraction =
        params.maxSlippageBps === undefined
          ? (params.slippage ?? 0.05)
          : params.maxSlippageBps / 10_000;
      // The reference price sizes the order; market orders additionally get
      // a protection price offset by the slippage tolerance. They are kept
      // separate so usdAmount sizing is never distorted by the protection
      // offset.
      let referencePrice: number;
      if (params.orderType === 'limit') {
        // STRICT full-string parse: '90000USD' prefix-parses under
        // parseFloat and must never become signed intent.
        const parsedLimitPrice = parseFinitePositive(params.price ?? '');
        if (parsedLimitPrice === null) {
          return {
            success: false,
            error: `Invalid limit price ${params.price}: must be a positive number`,
          };
        }
        referencePrice = parsedLimitPrice;
      } else {
        referencePrice = parseFloat(
          params.price ?? String(params.currentPrice ?? 0),
        );
      }
      let executionPrice = referencePrice;
      if (params.orderType === 'market') {
        const resolved = await this.#resolveMarketReferencePrice(
          params.symbol,
          slippageFraction,
          params.priceAtCalculation,
        );
        if (resolved.error !== null) {
          return { success: false, error: resolved.error };
        }
        referencePrice = resolved.referencePrice;
        executionPrice = deriveLighterExecutionPrice(
          referencePrice,
          params.isBuy,
          slippageFraction,
        );
      }
      // Finite AND positive: 'Infinity' passes a bare > 0 check but would
      // corrupt integerization/signing downstream.
      if (
        !Number.isFinite(referencePrice) ||
        !(referencePrice > 0) ||
        !Number.isFinite(executionPrice) ||
        !(executionPrice > 0)
      ) {
        return {
          success: false,
          error: 'Unable to resolve a finite execution price for the order',
        };
      }
      // USD is the source of truth when provided (hybrid sizing contract),
      // converted at the reference price — not the protection price. A
      // provided-but-invalid usdAmount is an error, never a silent fallback
      // to the size field.
      let requestedSize: number;
      if (params.usdAmount === undefined) {
        const parsedSize = parseFinitePositive(params.size);
        if (parsedSize === null) {
          return { success: false, error: 'Order size must be positive' };
        }
        requestedSize = parsedSize;
      } else {
        const usdAmount = parseFinitePositive(params.usdAmount);
        if (usdAmount === null) {
          return {
            success: false,
            error: `Invalid usdAmount ${params.usdAmount}: must be a positive number`,
          };
        }
        requestedSize = usdAmount / referencePrice;
      }
      if (!(requestedSize > 0)) {
        return { success: false, error: 'Order size must be positive' };
      }
      const minSize = computeLighterMinOrderSize(market, referencePrice);
      if (requestedSize < minSize) {
        // Only a LIVE-VERIFIED full close may be bumped to the venue
        // minimum: reduce-only execution clamps to the position, so no
        // extra exposure results and dust positions stay closable. The
        // isFullClose flag is a hint, never trusted — a partial close
        // bumped to the minimum would close more than the caller asked.
        const verifiedFullClose = params.reduceOnly
          ? await this.#isVerifiedFullClose(params.symbol, requestedSize)
          : false;
        if (!verifiedFullClose) {
          return {
            success: false,
            error: `Order size ${requestedSize} is below the Lighter minimum of ${minSize} ${params.symbol}`,
          };
        }
      }
      const size = Math.max(requestedSize, minSize);

      // Wire-format integerization runs BEFORE signer setup: overflow and
      // sub-tick rejections throw here, still with zero bridge calls.
      const priceInt = toSignerWirePriceInteger(
        executionPrice,
        market.supportedPriceDecimals,
      );
      const sizeInt = toSignerWireInteger(size, market.supportedSizeDecimals);

      const leverageImfHundredths = await this.#resolveLeverageIntent(params);

      // Intent validated — only now do signer and account setup run.
      // Re-fence FIRST: the preflight awaited public/account reads during
      // which the wallet may have switched, and a stale intent must never
      // create or register the new account's venue key.
      this.#assertSession(generationAtIntent);
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generationAtIntent);
      const [clientOrderIndex] = this.#allocateClientOrderIndexes(1);

      // Leverage update and order placement share ONE lock acquisition so a
      // concurrent write can never interleave between the caller's leverage
      // intent and the order that depends on it.
      const result = await this.#withVenueWriteLock(
        accountIndex,
        async (nextNonce, submit) => {
          if (leverageImfHundredths !== null) {
            const signedLeverage =
              await this.#getSignerBridge().execute<LighterTxResult>({
                function: '_signUpdateLeverage',
                // Contract: [accountIndex, marketId, imfHundredths,
                // marginMode, nonce] — exactly five params.
                params: [
                  accountIndex,
                  market.marketId,
                  leverageImfHundredths,
                  LIGHTER_MARGIN_MODE_CROSS,
                  await nextNonce(),
                ],
              });
            if (signedLeverage.error) {
              throw new Error(
                `Lighter leverage update failed: ${signedLeverage.error}`,
              );
            }
            await submit(
              LIGHTER_TX_TYPE_UPDATE_LEVERAGE,
              signedLeverage.txInfo,
            );
          }
          const signed = await this.#getSignerBridge().execute<LighterTxResult>(
            {
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
                // GTT orders auto-expire in 28 days (signer sentinel -1);
                // IOC orders must carry a zero expiry.
                params.orderType === 'limit' && params.timeInForce !== 'IOC'
                  ? LIGHTER_ORDER_EXPIRY_NONE
                  : 0,
                await nextNonce(),
              ],
            },
          );
          if (signed.error) {
            throw new Error(`Lighter order signing failed: ${signed.error}`);
          }
          return await submit(LIGHTER_TX_TYPE_CREATE_ORDER, signed.txInfo);
        },
        generationAtIntent,
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

  async cancelOrder(
    params: CancelOrderParams,
    inheritedGeneration?: number,
  ): Promise<CancelOrderResult> {
    try {
      this.#ensureSessionBinding();
      const generationAtIntent = inheritedGeneration ?? this.#sessionGeneration;
      this.#assertSession(generationAtIntent);
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

      await this.#withVenueNonce(
        accountIndex,
        async (nonce, submit) => {
          const signed = await this.#getSignerBridge().execute<LighterTxResult>(
            {
              function: '_signCancelOrder',
              params: [accountIndex, market.marketId, params.orderId, nonce],
            },
          );
          if (signed.error) {
            throw new Error(`Lighter cancel signing failed: ${signed.error}`);
          }
          return await submit(LIGHTER_TX_TYPE_CANCEL_ORDER, signed.txInfo);
        },
        generationAtIntent,
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

  /**
   * Resolve the FRESH venue reference price for a market-order sizing,
   * with the same fail-closed and drift semantics as execution — shared
   * by placement and close validation so they can never disagree.
   *
   * @param symbol - Market symbol.
   * @param slippageFraction - Caller slippage tolerance (fraction).
   * @param priceAtCalculation - Caller's sizing snapshot, if any.
   * @returns The fresh reference price, or the exact execution error.
   */
  readonly #resolveMarketReferencePrice = async (
    symbol: string,
    slippageFraction: number,
    priceAtCalculation?: number,
  ): Promise<
    | { referencePrice: number; error: null }
    | { referencePrice: null; error: string }
  > => {
    // Numeric intent validates fail-closed BEFORE any drift math. A
    // non-finite/non-positive snapshot makes the drift comparison NaN
    // (silently bypassing protection), and a tolerance at or above 100%
    // derives a zero-or-negative protection price on sells.
    if (
      !Number.isFinite(slippageFraction) ||
      slippageFraction < 0 ||
      slippageFraction >= 1
    ) {
      return {
        referencePrice: null,
        error: `Invalid slippage tolerance ${slippageFraction * 10_000} bps: must be at least 0 and below 10000`,
      };
    }
    if (
      priceAtCalculation !== undefined &&
      (!Number.isFinite(priceAtCalculation) || !(priceAtCalculation > 0))
    ) {
      return {
        referencePrice: null,
        error: `Invalid price snapshot ${priceAtCalculation}: must be a positive finite number`,
      };
    }
    // Always a FRESH venue price: the caller's currentPrice is the same
    // snapshot as priceAtCalculation, and a drift check that compares a
    // snapshot to itself would never fire.
    const details = await this.#clientService.getOrderBookDetails();
    const freshPrice =
      details.orderBookDetails.find((entry) => entry.symbol === symbol)
        ?.lastTradePrice ?? 0;
    if (!Number.isFinite(freshPrice) || !(freshPrice > 0)) {
      // Fail closed: falling back to the caller's snapshot would let the
      // drift check compare that snapshot to itself.
      return {
        referencePrice: null,
        error: `No live venue price available for ${symbol}; refusing to size a market order`,
      };
    }
    if (
      priceAtCalculation !== undefined &&
      priceAtCalculation > 0 &&
      Math.abs(freshPrice - priceAtCalculation) / priceAtCalculation >
        slippageFraction
    ) {
      return {
        referencePrice: null,
        error: `Price moved beyond the ${(slippageFraction * 100).toFixed(2)}% slippage tolerance since sizing`,
      };
    }
    return { referencePrice: freshPrice, error: null };
  };

  /**
   * Validate the shape of a close request (shared by validateClosePosition
   * and closePosition so validation can never approve a close the
   * execution path refuses).
   *
   * @param params - Close request.
   * @returns Error message, or null when the shape is acceptable.
   */
  readonly #validateCloseShape = (
    params: ClosePositionParams,
  ): string | null => {
    const closeOrderType = params.orderType ?? 'market';
    if (closeOrderType !== 'market' && closeOrderType !== 'limit') {
      return `Lighter cannot close with a ${closeOrderType} order; use market or limit`;
    }
    if (closeOrderType === 'limit' && !params.price) {
      return 'Limit close requires a price';
    }
    if (
      params.usdAmount !== undefined &&
      parseFinitePositive(params.usdAmount) === null
    ) {
      // Finite REQUIRED: a non-finite usdAmount must never fall back to
      // held-size validation while execution forwards the infinite USD
      // into placement.
      return `Invalid usdAmount ${params.usdAmount}: must be a positive number`;
    }
    // closePosition forwards an explicit size to placement, which rejects
    // non-finite or non-positive values; validation must match.
    if (
      params.usdAmount === undefined &&
      params.size !== undefined &&
      parseFinitePositive(params.size) === null
    ) {
      return 'Order size must be positive';
    }
    return null;
  };

  /**
   * Live check whether a below-minimum reduce-only request is actually a
   * full close of the held position (shared by placement and validation).
   *
   * @param symbol - Market symbol.
   * @param requestedSize - Requested base size.
   * @returns True when the live position verifies a full close.
   */
  readonly #isVerifiedFullClose = async (
    symbol: string,
    requestedSize: number,
  ): Promise<boolean> => {
    const positions = await this.getPositions();
    const held = Math.abs(
      parseFloat(
        positions.find((entry) => entry.symbol === symbol)?.size ?? '0',
      ),
    );
    // Exact match (float epsilon only): closePosition forwards the precise
    // live size, and anything less is a deliberate partial that a min-size
    // bump would silently over-close.
    return held > 0 && requestedSize >= held * (1 - 1e-9);
  };

  async closePosition(params: ClosePositionParams): Promise<OrderResult> {
    try {
      // One intent identity from the position read through the final write:
      // an account switch mid-sequence aborts instead of trading the new
      // account with sizing derived from the old one.
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
      const closeOrderType = params.orderType ?? 'market';
      const shapeError = this.#validateCloseShape(params);
      if (shapeError) {
        return { success: false, error: shapeError };
      }
      const positions = await this.getPositions();
      this.#assertSession(generationAtIntent);
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
      const explicitSizing =
        params.size !== undefined || params.usdAmount !== undefined;
      const closeSize = params.size ?? String(Math.abs(signedSize));
      // Reduce-only order on the opposite side; the caller's full sizing
      // and protection intent (usdAmount, slippage, price snapshot, limit
      // price) rides through the placement path unchanged.
      return await this.placeOrder(
        {
          symbol: params.symbol,
          isBuy: signedSize < 0,
          size: closeSize,
          usdAmount: params.usdAmount,
          orderType: closeOrderType,
          price: params.price,
          reduceOnly: true,
          // Without explicit sizing this is a full close and must never be
          // rejected by the minimum-notional check on a dust position.
          isFullClose: !explicitSizing,
          currentPrice: params.currentPrice,
          priceAtCalculation: params.priceAtCalculation,
          maxSlippageBps: params.maxSlippageBps,
        },
        generationAtIntent,
      );
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
      // Partial TP/SL sizes are NOT wired to this venue path: it always
      // covers the full position. Silently ignoring a requested partial
      // size would close the entire position when the trigger fires, so
      // the request is refused before any read, signer setup or mutation.
      if (
        params.takeProfitSize !== undefined ||
        params.stopLossSize !== undefined
      ) {
        return {
          success: false,
          error:
            'Lighter TP/SL covers the full position: partial takeProfitSize/stopLossSize are not supported',
        };
      }
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
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

      // FULL local preflight: construct the entire deterministic
      // replacement payload BEFORE signer setup, the open-orders read and
      // any cancellation. Everything that can fail locally — venue
      // position-size parsing/integerization, trigger/execution price
      // parsing/integerization, bounded client-id allocation — must fail
      // while the existing protection is still in place.
      const wantsReplacement =
        Boolean(params.takeProfitPrice) || Boolean(params.stopLossPrice);
      let groupedPayload: (string | number)[] | null = null;
      let createdClientIds: number[] = [];
      let createdIdsNeedingFinalCheck: number[] = [];
      let groupedOrderCount = 0;
      let groupedType = 0;
      if (wantsReplacement) {
        // getPositions does not validate venue sizes; a non-finite or
        // sub-tick size must abort here, not after the cancels.
        const signedSize = parseFloat(position.size);
        if (!Number.isFinite(signedSize) || signedSize === 0) {
          return {
            success: false,
            error: `Invalid live position size ${position.size} for ${params.symbol}`,
          };
        }
        const isLong = signedSize > 0;
        const coverSize = Math.abs(signedSize);
        const sizeInt = toSignerWireInteger(
          coverSize,
          market.supportedSizeDecimals,
        );
        // Closing side is opposite the position; trigger market orders
        // execute at a protection price 5% beyond the trigger in the taker
        // direction.
        const isAsk = isLong ? 1 : 0;
        const orderIntents: {
          orderType: number;
          raw: string;
          label: string;
        }[] = [];
        if (params.takeProfitPrice) {
          orderIntents.push({
            orderType: LIGHTER_ORDER_TYPE_TAKE_PROFIT,
            raw: params.takeProfitPrice,
            label: 'takeProfitPrice',
          });
        }
        if (params.stopLossPrice) {
          orderIntents.push({
            orderType: LIGHTER_ORDER_TYPE_STOP_LOSS,
            raw: params.stopLossPrice,
            label: 'stopLossPrice',
          });
        }
        const validatedOrders: {
          orderType: number;
          execInt: number;
          triggerInt: number;
        }[] = [];
        for (const intent of orderIntents) {
          const trigger = parseFinitePositive(intent.raw);
          if (trigger === null) {
            return {
              success: false,
              error: `Invalid ${intent.label} ${intent.raw}: must be a positive number`,
            };
          }
          const execution = isLong ? trigger * 0.95 : trigger * 1.05;
          validatedOrders.push({
            orderType: intent.orderType,
            execInt: toSignerWirePriceInteger(
              execution,
              market.supportedPriceDecimals,
            ),
            triggerInt: toSignerWirePriceInteger(
              trigger,
              market.supportedPriceDecimals,
            ),
          });
        }
        // Only the ids actually required: allocation attempts are bounded
        // and a degenerate RNG must exhaust BEFORE any cancellation.
        const clientOrderIds = this.#allocateClientOrderIndexes(
          validatedOrders.length,
        );
        createdClientIds = clientOrderIds;
        // VENUE CONTRACT (proven live: 'GroupingType is not valid'):
        // CreateGroupedOrders only accepts grouping types 1/2/3 and OCO
        // requires two siblings, so a SINGLE TP or SL must be an ordinary
        // CreateOrder trigger; grouped OCO is reserved for both together.
        groupedPayload = validatedOrders.flatMap((entry, index) => [
          market.marketId,
          clientOrderIds[index],
          String(sizeInt),
          String(entry.execInt),
          isAsk,
          entry.orderType,
          LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
          1,
          String(entry.triggerInt),
          // Trigger orders rest until fired: the signer expands the -1
          // sentinel to the 28-day default expiry.
          LIGHTER_ORDER_EXPIRY_NONE,
        ]);
        groupedOrderCount = validatedOrders.length;
        groupedType =
          groupedOrderCount === 2 ? LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER : 0;
      }

      // Re-fence BEFORE signer setup: the preflight awaited public reads
      // during which the wallet may have switched, and a stale intent must
      // never create or register the new account's venue key.
      this.#assertSession(generationAtIntent);
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generationAtIntent);
      // Pre-mint the auth token OUTSIDE the write lock: #getAuthToken can
      // trigger signer setup, and signer setup queues on the write chain —
      // calling any setup-capable helper from inside the held section
      // would self-deadlock after a bridge reset or unobserved switch.
      const authToken = await this.#getAuthToken();
      this.#assertSession(generationAtIntent);
      // Settlement identity: pending expectations are keyed by the
      // captured normalized address + account index + symbol so another
      // account can never consume (or be blocked by) this account's ids,
      // while a same-account bridge reset or switch-away-and-back retains
      // the reconciliation obligation.
      // Includes the API KEY SLOT: nonces are per key slot, so a journal
      // recorded under one slot must never be reconciled under another.
      const settlementKey = `${this.#boundAddress ?? 'unbound'}:${accountIndex}:${this.#apiKeyIndex}:${params.symbol}`;

      // The ENTIRE snapshot -> create -> cancel lifecycle runs as ONE
      // serialized transition on the account's write chain. Two concurrent
      // replacements would otherwise both snapshot the same old trigger,
      // each create a new set, and each cancel only the original — leaving
      // both protection sets live; a concurrent remove could miss a
      // just-created replacement. Cancels are INLINED (not this.cancelOrder)
      // so no nested lock acquisition can deadlock; nonce serialization is
      // preserved because every nonce comes from this section's nextNonce.
      await this.#withVenueWriteLock(
        accountIndex,
        async (nextNonce, submit) => {
          // STRICT direct read with the CAPTURED account/auth/generation:
          // a swallowed [] would make remove "succeed" cancelling nothing;
          // a setup-capable helper here could self-deadlock (see auth
          // pre-mint above). Session fences on every read.
          const readActiveRaw = async (): Promise<LighterApiOrder[]> => {
            this.#assertSession(generationAtIntent);
            const response = await this.#clientService.getActiveOrders(
              accountIndex,
              authToken,
            );
            this.#assertSession(generationAtIntent);
            return response.orders;
          };
          // Shared targeted inactive reader (cached, active-first callers,
          // one bounded deep cursor walk per section, market-scoped).
          const readInactiveFor = this.#makeInactiveReader(
            accountIndex,
            authToken,
            generationAtIntent,
            market.marketId,
          );

          // VENUE LINEARIZABILITY: if a previous TP/SL transition's
          // settlement never became visible, run it through the SAME
          // obligation state machine as startup recovery — a pending
          // 'cancelling'/'restoring' journal may owe a rollback or a
          // RESTORE, and merely reconciling-then-clearing it here would
          // erase that obligation and leave the position naked.
          // Pending obligations survive provider death via the durable
          // journal: lazily reload before any same-account mutation.
          const unsettled =
            this.#tpslUnsettled.get(settlementKey) ??
            (await this.#loadTpslJournal(settlementKey));
          if (unsettled) {
            const resolved = await this.#settleTpslObligation({
              settlementKey,
              symbol: params.symbol,
              journalEntry: unsettled,
              market,
              accountIndex,
              generation: generationAtIntent,
              readActiveRaw,
              readInactiveFor,
              nextNonce,
              submit,
            });
            if (!resolved) {
              // Keep both records for the next attempt.
              this.#tpslUnsettled.set(settlementKey, unsettled);
              throw new Error(
                `Lighter TP/SL settlement for ${params.symbol} is unresolved; refusing further protection changes until the venue reflects the previous update`,
              );
            }
            this.#assertSession(generationAtIntent);
          }

          const rawOrders = await readActiveRaw();
          const openOrders = rawOrders.map((order) =>
            adaptOrderFromLighter(
              order,
              this.#marketsById.get(order.marketIndex)?.symbol ??
                String(order.marketIndex),
            ),
          );
          const staleTriggers = openOrders.filter(
            (order) =>
              order.symbol === params.symbol &&
              order.reduceOnly &&
              (Boolean(order.orderType?.includes('stop')) ||
                Boolean(order.orderType?.includes('take')) ||
                order.isTrigger === true),
          );
          // The prior triggers' EXACT wire intents ride along with the
          // journal: a crash can still restore/rollback faithfully. A
          // stale trigger that CANNOT be faithfully restored (unknown
          // venue type/TIF) refuses the whole mutation BEFORE any cancel
          // or create — coercing its semantics on restore is worse than
          // rejecting the update.
          const priorTriggers: TpslPriorTrigger[] = [];
          for (const stale of staleTriggers) {
            const rawRow = rawOrders.find(
              (order) => String(order.orderIndex) === stale.orderId,
            );
            const priorIntent = rawRow
              ? mapRawTriggerToPriorIntent(rawRow)
              : null;
            if (!priorIntent) {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} refused: existing trigger order ${stale.orderId} cannot be faithfully restored (unsupported type/time-in-force), so it will not be cancelled`,
              );
            }
            priorTriggers.push(priorIntent);
          }
          // Lifecycle identity of the position this protection belongs
          // to: a delayed restore must never attach to a NEW same-symbol
          // position opened after the original closed.
          const fingerprintSign: 1 | -1 = position.size.startsWith('-')
            ? -1
            : 1;
          const fingerprintSize = position.size.replace(/^-/u, '');
          const positionFingerprint: TpslPositionFingerprint | null =
            parseStrictDecimal(fingerprintSize) !== null &&
            (parseStrictDecimal(fingerprintSize) ?? 0) > 0 &&
            parseStrictDecimal(position.entryPrice) !== null &&
            (parseStrictDecimal(position.entryPrice) ?? 0) > 0
              ? {
                  sign: fingerprintSign,
                  size: fingerprintSize,
                  entryPrice: position.entryPrice,
                }
              : null;
          // Per-attempt mutation journal, persisted incrementally.
          // RESPONSE-LOSS safety: every attempt is recorded UNKNOWN with
          // its own venue nonce BEFORE submission (the venue may commit
          // even when the response is lost), flips to accepted inside
          // onAccepted (pre-fence), and reconciliation disambiguates each
          // attempt individually via books + nonce.
          const journal: TpslJournalState = {
            attempts: [],
            recordedAt: Date.now(),
            intent: wantsReplacement ? 'replace' : 'remove',
            phase: 'creating',
            priorTriggers,
            positionFingerprint,
          };
          const persistJournal = async (): Promise<void> => {
            journal.recordedAt = Date.now();
            await this.#persistTpslJournal(settlementKey, journal);
          };
          // Sign+journal+submit one tracked cancel (stale protection or a
          // rollback of a surviving replacement leg).
          const submitTrackedCancel = async (
            orderId: string,
            role: 'stale' | 'rollback',
          ): Promise<void> => {
            if (role === 'stale' && journal.intent === 'replace') {
              // Durable phase transition BEFORE the old protection is
              // touched: a crash from here on may require a RESTORE.
              // (A 'remove' journal never restores — phase is moot.)
              journal.phase = 'cancelling';
            }
            const cancelNonce = await nextNonce();
            const signedCancel =
              await this.#getSignerBridge().execute<LighterTxResult>({
                function: '_signCancelOrder',
                params: [accountIndex, market.marketId, orderId, cancelNonce],
              });
            if (signedCancel.error) {
              throw new Error(
                `Failed to cancel trigger order ${orderId}: ${signedCancel.error}`,
              );
            }
            const cancelIdentity = requireSignedTxIdentity(signedCancel);
            const cancelAttempt: TpslCancelAttempt = {
              kind: 'cancel',
              nonce: cancelNonce,
              outcome: 'unknown',
              orderId,
              txHash: cancelIdentity.txHash,
              expiresAt: cancelIdentity.expiresAt,
              role,
            };
            journal.attempts.push(cancelAttempt);
            this.#tpslUnsettled.set(settlementKey, journal);
            await persistJournal();
            await submit(
              LIGHTER_TX_TYPE_CANCEL_ORDER,
              signedCancel.txInfo,
              () => {
                cancelAttempt.outcome = 'accepted';
              },
            );
          };
          // Sign+journal+submit a RESTORE create rebuilding a previously
          // cancelled trigger from its durably persisted EXACT wire
          // intent (single builder shared with crash recovery).
          const restoredClientIds: number[] = [];
          const submitTrackedRestoreCreate = async (
            prior: TpslPriorTrigger,
          ): Promise<void> => {
            // Durable transition: restore create ids must never be
            // mistaken for the failed replacement after a crash.
            journal.phase = 'restoring';
            const [restoreClientId] = this.#allocateClientOrderIndexes(1);
            const restoreNonce = await nextNonce();
            const signedRestore =
              await this.#getSignerBridge().execute<LighterTxResult>({
                function: '_signCreateOrder',
                params: buildRestoreWireParams(
                  prior,
                  market,
                  accountIndex,
                  restoreClientId,
                  restoreNonce,
                ),
              });
            if (signedRestore.error) {
              throw new Error(
                `Failed to restore previous protection: ${signedRestore.error}`,
              );
            }
            const restoreIdentity = requireSignedTxIdentity(signedRestore);
            const restoreAttempt: TpslCreateAttempt = {
              kind: 'create',
              nonce: restoreNonce,
              outcome: 'unknown',
              clientIds: [restoreClientId],
              txHash: restoreIdentity.txHash,
              expiresAt: restoreIdentity.expiresAt,
              role: 'restore',
              priorOrderId: prior.orderId,
            };
            journal.attempts.push(restoreAttempt);
            this.#tpslUnsettled.set(settlementKey, journal);
            await persistJournal();
            await submit(
              LIGHTER_TX_TYPE_CREATE_ORDER,
              signedRestore.txInfo,
              () => {
                restoreAttempt.outcome = 'accepted';
              },
            );
            restoredClientIds.push(restoreClientId);
          };

          // CREATE FIRST, cancel after: if signing or submission of the
          // new protection fails, the old triggers were never touched and
          // the position is never left naked. The temporary overlap is
          // safe — both sets are reduce-only and clamp to the position.
          if (wantsReplacement && groupedPayload !== null) {
            const payload = groupedPayload;
            const isSingleTrigger = groupedOrderCount === 1;
            const createNonce = await nextNonce();
            // A lone trigger is an ordinary CreateOrder (same wire
            // layout); only a TP+SL pair uses the grouped OCO transaction.
            const signed =
              await this.#getSignerBridge().execute<LighterTxResult>(
                isSingleTrigger
                  ? {
                      function: '_signCreateOrder',
                      params: [accountIndex, ...payload, createNonce],
                    }
                  : {
                      function: '_signCreateGroupedOrders',
                      params: [
                        accountIndex,
                        groupedType,
                        groupedOrderCount,
                        ...payload,
                        createNonce,
                      ],
                    },
              );
            if (signed.error) {
              throw new Error(signed.error);
            }
            // UNKNOWN recorded BEFORE the wire — in memory AND durably
            // (awaited): a transport failure after venue commit, or
            // provider/process death, must still leave a reconciliation
            // obligation resolvable by EXACT tx hash. A failed durable
            // write, or a signing result without hash/expiry, aborts the
            // mutation before submission.
            const createIdentity = requireSignedTxIdentity(signed);
            const createAttempt: TpslCreateAttempt = {
              kind: 'create',
              nonce: createNonce,
              outcome: 'unknown',
              clientIds: [...createdClientIds],
              txHash: createIdentity.txHash,
              expiresAt: createIdentity.expiresAt,
              role: 'replacement',
            };
            journal.attempts.push(createAttempt);
            this.#tpslUnsettled.set(settlementKey, journal);
            await persistJournal();
            await submit(
              isSingleTrigger
                ? LIGHTER_TX_TYPE_CREATE_ORDER
                : LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
              signed.txInfo,
              () => {
                // Acceptance OBSERVED (pre-fence): absence from the books
                // can now only mean visibility lag, never never-landed.
                createAttempt.outcome = 'accepted';
              },
            );

            // PHASE BARRIER: prove the replacement is on the venue's books
            // BEFORE touching the old protection. An accepted create can
            // be asynchronously rejected/venue-cancelled; cancelling stale
            // triggers first would strip valid protection and discover it
            // afterwards.
            const createVisibility = await this.#awaitTpslVisibility(
              readActiveRaw,
              readInactiveFor,
              {
                createdClientIds,
                cancelledOrderIds: [],
              },
            );
            if (createVisibility.outcome === 'timeout') {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
              );
            }
            if (createVisibility.outcome === 'created-terminal-failed') {
              // The replacement (or one OCO leg) failed before the old
              // protection was touched. ROLL BACK any leg still resting
              // active so the venue returns to exactly the prior
              // protection, then resolve the obligation for a retry.
              if (createVisibility.survivingActiveClientIds.length > 0) {
                const activeNow = await readActiveRaw();
                const survivorOrderIds: string[] = [];
                for (const clientId of createVisibility.survivingActiveClientIds) {
                  const survivor = activeNow.find(
                    (order) =>
                      String(order.clientOrderIndex) === String(clientId),
                  );
                  if (survivor) {
                    survivorOrderIds.push(String(survivor.orderIndex));
                    await submitTrackedCancel(
                      String(survivor.orderIndex),
                      'rollback',
                    );
                  }
                }
                const rollback = await this.#awaitTpslVisibility(
                  readActiveRaw,
                  readInactiveFor,
                  { createdClientIds: [], cancelledOrderIds: survivorOrderIds },
                );
                if (rollback.outcome === 'timeout') {
                  throw new Error(
                    `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
                  );
                }
              }
              await this.#clearTpslJournal(settlementKey);
              throw new Error(
                `Lighter replacement TP/SL for ${params.symbol} was cancelled or rejected by the venue before becoming active; the existing protection was left untouched`,
              );
            }
            // Barrier-proved TERMINAL success is immutable: skip those ids
            // in the final settlement check (no duplicate high-weight
            // inactive read); active-at-barrier ids are still re-verified
            // there (they can terminal-fail before the cancels settle).
            createdIdsNeedingFinalCheck = createVisibility.executedCreated
              ? []
              : createdClientIds;
            if (createVisibility.executedCreated) {
              // The trigger EXECUTED before activation was observed (an
              // immediate/crossed TP/SL): not a failure — the position may
              // already be closed. Stale triggers below are still cleaned
              // up as reduce-only leftovers.
              this.#deps.debugLogger.log(
                '[LighterProvider] replacement trigger executed immediately',
                { symbol: params.symbol },
              );
            }
          }

          for (const order of staleTriggers) {
            await submitTrackedCancel(order.orderId, 'stale');
          }

          // Await authoritative visibility of the CANCELS before releasing
          // the lock (created ids were proven at the phase barrier): the
          // next queued transition must never snapshot a stale book.
          if (journal.attempts.length > 0) {
            const settled = await this.#awaitTpslVisibility(
              readActiveRaw,
              readInactiveFor,
              {
                // Barrier-proved terminal successes are immutable and
                // excluded; active-at-barrier ids are re-verified.
                createdClientIds: createdIdsNeedingFinalCheck,
                cancelledOrderIds: journal.attempts
                  .filter(
                    (attempt): attempt is TpslCancelAttempt =>
                      attempt.kind === 'cancel',
                  )
                  .map((attempt) => attempt.orderId),
              },
            );
            if (settled.outcome === 'timeout') {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
              );
            }
            if (settled.outcome === 'created-terminal-failed') {
              // Active at the phase barrier but venue-cancelled/rejected
              // AFTER the old protection was already cancelled. Never
              // report success, never leave the position naked — and
              // never silently keep a DEGRADED pair: a surviving OCO leg
              // is rolled back and the WHOLE prior set restored.
              if (settled.survivingActiveClientIds.length > 0) {
                const activeNow = await readActiveRaw();
                const survivorOrderIds: string[] = [];
                for (const clientId of settled.survivingActiveClientIds) {
                  const survivor = activeNow.find(
                    (order) =>
                      String(order.clientOrderIndex) === String(clientId),
                  );
                  if (survivor) {
                    survivorOrderIds.push(String(survivor.orderIndex));
                    await submitTrackedCancel(
                      String(survivor.orderIndex),
                      'rollback',
                    );
                  }
                }
                const rollback = await this.#awaitTpslVisibility(
                  readActiveRaw,
                  readInactiveFor,
                  {
                    createdClientIds: [],
                    cancelledOrderIds: survivorOrderIds,
                  },
                );
                if (rollback.outcome === 'timeout') {
                  throw new Error(
                    `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
                  );
                }
              }
              // RESTORE the previous protection from the durably
              // persisted prior wire intents so the position is not
              // naked.
              for (const prior of journal.priorTriggers) {
                await submitTrackedRestoreCreate(prior);
              }
              const restoreVisibility = await this.#awaitTpslVisibility(
                readActiveRaw,
                readInactiveFor,
                { createdClientIds: restoredClientIds, cancelledOrderIds: [] },
              );
              if (restoreVisibility.outcome !== 'settled') {
                // Journal retained (restore attempts recorded): the next
                // transition must reconcile before further mutation.
                throw new Error(
                  `Lighter replacement TP/SL for ${params.symbol} failed after activation and restoring the previous protection is not yet confirmed; further protection changes are blocked until the venue reflects it`,
                );
              }
              await this.#clearTpslJournal(settlementKey);
              this.#assertSession(generationAtIntent);
              throw new Error(
                `Lighter replacement TP/SL for ${params.symbol} was cancelled or rejected by the venue after activation; the previous protection was restored`,
              );
            }
            await this.#clearTpslJournal(settlementKey);
            // A switch DURING the final journal-clear await must not let
            // stale A protection report success under B.
            this.#assertSession(generationAtIntent);
          }
        },
        generationAtIntent,
      );
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
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
      const markets = await this.#ensureMarkets();
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      // Strict full-string parse: '5USD' must not prefix-parse into
      // signed intent. Signed values are meaningful here (add/remove).
      const amount = parseStrictDecimal(params.amount) ?? Number.NaN;
      if (!Number.isFinite(amount) || amount === 0) {
        return {
          success: false,
          error: 'updateMargin requires a non-zero amount',
        };
      }
      // USDC uses 6 decimals. Integerize BEFORE signer setup so a huge
      // finite amount fails closed with zero bridge calls instead of
      // raw-scaling to an unsafe integer inside signer params.
      const marginAmountInt = toSignerWireInteger(Math.abs(amount), 6);
      // Re-fence before signer setup: the market lookup above awaited, and
      // a stale intent must never initialize the new account's signer.
      this.#assertSession(generationAtIntent);
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      // USDC uses 6 decimals; direction 1 adds isolated margin, 0 removes it
      // (types/txtypes/constants.go: RemoveFromIsolatedMargin=0, Add=1).
      await this.#withVenueNonce(
        accountIndex,
        async (nonce, submit) => {
          const signed = await this.#getSignerBridge().execute<LighterTxResult>(
            {
              function: '_signUpdateMargin',
              params: [
                accountIndex,
                market.marketId,
                marginAmountInt,
                amount > 0 ? 1 : 0,
                nonce,
              ],
            },
          );
          if (signed.error) {
            throw new Error(signed.error);
          }
          return await submit(LIGHTER_TX_TYPE_UPDATE_MARGIN, signed.txInfo);
        },
        generationAtIntent,
      );
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
      this.#ensureSessionBinding();
      const generationAtIntent = this.#sessionGeneration;
      const amount = parseFinitePositive(params.amount);
      if (amount === null) {
        return { success: false, error: 'withdraw requires a positive amount' };
      }
      // Enforce the advertised route minimum: getWithdrawalRoutes reports
      // minWithdrawUsdc, and signing below it would either burn a nonce on
      // a venue rejection or strand dust.
      const minWithdraw = parseFloat(
        LIGHTER_BRIDGE_CONFIG[this.#isTestnet ? 'testnet' : 'mainnet']
          .minWithdrawUsdc,
      );
      if (amount < minWithdraw) {
        return {
          success: false,
          error: `Withdrawal amount ${params.amount} is below the Lighter minimum of ${minWithdraw} USDC`,
        };
      }
      // USDC uses 6 decimals on zkLighter. Integerize BEFORE signer setup:
      // overflow/sub-tick amounts fail closed with zero bridge calls,
      // matching validateWithdrawal exactly.
      const assetAmount = String(toSignerWireInteger(amount, 6));
      await this.#ensureSignerReady();
      const accountIndex = await this.#ensureAccountIndex();
      const result = await this.#withVenueNonce(
        accountIndex,
        async (nonce, submit) => {
          const signed = await this.#getSignerBridge().execute<LighterTxResult>(
            {
              function: '_signWithdraw',
              params: [
                accountIndex,
                LIGHTER_USDC_ASSET_INDEX,
                0,
                assetAmount,
                nonce,
              ],
            },
          );
          if (signed.error) {
            throw new Error(signed.error);
          }
          return await submit(LIGHTER_TX_TYPE_WITHDRAW, signed.txInfo);
        },
        generationAtIntent,
      );
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
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const token = await this.#getAuthToken();
      await this.#ensureMarkets();
      const response = await this.#clientService.getTrades(
        accountIndex,
        token,
        params?.limit ?? 50,
      );
      this.#assertSession(generation);
      return (response.trades ?? []).map((trade) =>
        adaptFillFromLighterTrade(
          trade,
          this.#marketsById.get(trade.marketId)?.symbol ??
            String(trade.marketId),
          accountIndex,
        ),
      );
    } catch (error) {
      if (this.#isUnsupportedCapabilityError(error)) {
        // Capability gates must surface, never degrade into empty state.
        throw error;
      }
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
    // Capability-gated: the venue's PnLEntry carries trade, pool, spot, and
    // staking flows; reconstructing account value from the trade flows
    // alone is materially wrong for accounts using the other routes, and
    // no captured payload proves the full-flow semantics. Reporting a
    // plausible number would show false daily history — fail explicitly.
    throw new Error(
      'Historical portfolio is unavailable for Lighter: account-value reconstruction requires pool/spot/staking flow semantics that are not yet verified against the venue',
    );
  }

  async getFunding(
    _params?: GetFundingParams,
    _options?: PerpsReadOptions,
  ): Promise<Funding[]> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const token = await this.#getAuthToken();
      await this.#ensureMarkets();
      const response = await this.#clientService.getPositionFundings(
        accountIndex,
        token,
      );
      this.#assertSession(generation);
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
      if (this.#isUnsupportedCapabilityError(error)) {
        // Capability gates must surface, never degrade into empty state.
        throw error;
      }
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
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
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
      this.#assertSession(generation);
      return updates.filter(
        (update) =>
          (startTime === undefined || update.time >= startTime) &&
          (endTime === undefined || update.time <= endTime),
      );
    } catch (error) {
      if (this.#isUnsupportedCapabilityError(error)) {
        // Capability gates must surface, never degrade into empty state.
        throw error;
      }
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
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
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
      this.#assertSession(generation);
      return items.filter(
        (item) =>
          (startTime === undefined || item.timestamp >= startTime) &&
          (endTime === undefined || item.timestamp <= endTime),
      );
    } catch (error) {
      if (this.#isUnsupportedCapabilityError(error)) {
        // Capability gates must surface, never degrade into empty state.
        throw error;
      }
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
    // ONE error-to-invalid boundary: a validator RESOLVES, never rejects,
    // whichever awaited venue read fails (markets, margin metadata, fresh
    // price, live positions, data integrity).
    try {
      return await this.#validateOrderChecks(params);
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateOrder').message,
      };
    }
  }

  readonly #validateOrderChecks = async (
    params: OrderParams,
  ): Promise<{ isValid: boolean; error?: string }> => {
    // Mirrors placeOrder's own rejections so validation never approves an
    // order shape the placement path would refuse.
    if (params.orderType !== 'limit' && params.orderType !== 'market') {
      return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
    }
    if (params.takeProfitPrice || params.stopLossPrice) {
      return {
        isValid: false,
        error:
          'Lighter does not support TP/SL attached at placement; place the order, then call updatePositionTPSL',
      };
    }
    if (params.timeInForce === 'ALO') {
      return {
        isValid: false,
        error: 'Lighter placement does not support post-only (ALO) yet',
      };
    }
    if (params.orderType === 'limit' && !params.price) {
      return { isValid: false, error: 'Limit order requires a price' };
    }
    if (params.orderType === 'limit' && params.price !== undefined) {
      // Strict finite parity with placement, LIMIT ONLY: 'Infinity' and
      // prefix-numeric strings ('90000USD') both parse under a bare
      // parseFloat check but placement refuses them. Market placement
      // ignores params.price entirely (fresh venue price), so rejecting
      // it here would fail orders placement accepts.
      if (parseFinitePositive(params.price) === null) {
        return {
          isValid: false,
          error: `Invalid limit price ${params.price}: must be a positive number`,
        };
      }
    }
    const leverageError = lighterLeverageError(params.leverage);
    if (leverageError) {
      return { isValid: false, error: leverageError };
    }
    let usdAmount: number | undefined;
    if (params.usdAmount !== undefined) {
      const parsedUsd = parseFinitePositive(params.usdAmount);
      if (parsedUsd === null) {
        return {
          isValid: false,
          error: `Invalid usdAmount ${params.usdAmount}: must be a positive number`,
        };
      }
      usdAmount = parsedUsd;
    }
    const hasUsdSizing = usdAmount !== undefined;
    if (!hasUsdSizing && parseFinitePositive(params.size) === null) {
      return { isValid: false, error: 'Order size must be positive' };
    }
    const markets = await this.#ensureMarkets();
    const market = markets.get(params.symbol);
    if (!market) {
      return {
        isValid: false,
        error: `Unknown Lighter market: ${params.symbol}`,
      };
    }
    if (params.leverage !== undefined) {
      // Same authoritative-metadata requirement as placement.
      const maxLeverage = await this.#requireMarketMaxLeverage(params.symbol);
      if (maxLeverage === null) {
        return {
          isValid: false,
          error: `Cannot validate leverage for ${params.symbol}: venue margin metadata unavailable`,
        };
      }
      if (params.leverage > maxLeverage) {
        return {
          isValid: false,
          error: `Invalid leverage ${params.leverage}: exceeds the ${params.symbol} maximum of ${maxLeverage}x`,
        };
      }
    }
    // Reference-price parity with placement: a MARKET order sizes at the
    // FRESH venue price through the SAME resolver (fail-closed missing
    // price, snapshot and slippage intent validation, drift) — the
    // caller's price/currentPrice is never trusted for min-size. A LIMIT
    // order sizes at the caller's (finite-validated) price. The EXECUTION
    // price is derived through the same helper placement signs with, so
    // the wire-range check below inspects the exact signed value.
    let referencePrice: number;
    let executionPrice: number;
    if (params.orderType === 'market') {
      const slippageFraction =
        params.maxSlippageBps === undefined
          ? (params.slippage ?? 0.05)
          : params.maxSlippageBps / 10_000;
      // A validator must RESOLVE to an invalid result, never reject: the
      // fresh-price lookup can throw on REST failure.
      let resolved:
        | { referencePrice: number; error: null }
        | { referencePrice: null; error: string };
      try {
        resolved = await this.#resolveMarketReferencePrice(
          params.symbol,
          slippageFraction,
          params.priceAtCalculation,
        );
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateOrder').message,
        };
      }
      if (resolved.error !== null) {
        return { isValid: false, error: resolved.error };
      }
      referencePrice = resolved.referencePrice;
      executionPrice = deriveLighterExecutionPrice(
        referencePrice,
        params.isBuy,
        slippageFraction,
      );
    } else {
      referencePrice = parseFloat(
        params.price ?? String(params.currentPrice ?? 0),
      );
      executionPrice = referencePrice;
    }
    if (referencePrice > 0) {
      const requestedSize =
        usdAmount === undefined
          ? parseFloat(params.size)
          : usdAmount / referencePrice;
      const minSize = computeLighterMinOrderSize(market, referencePrice);
      if (requestedSize < minSize) {
        // EXACTLY the placement rule: only reduce-only orders may bump to
        // the venue minimum, and only when the live position verifies a
        // full close; isFullClose remains an untrusted hint. The live read
        // can THROW (capability gates, venue-data integrity): a validator
        // must resolve to an explicit invalid result, never reject.
        let verifiedFullClose = false;
        if (params.reduceOnly) {
          try {
            verifiedFullClose = await this.#isVerifiedFullClose(
              params.symbol,
              requestedSize,
            );
          } catch (error) {
            return {
              isValid: false,
              error: ensureError(error, 'LighterProvider.validateOrder')
                .message,
            };
          }
        }
        if (!verifiedFullClose) {
          return {
            isValid: false,
            error: `Order size ${requestedSize} is below the Lighter minimum of ${minSize} ${params.symbol}`,
          };
        }
      }
      // Wire-format parity: placement integerizes size and the
      // slippage-adjusted EXECUTION price; toLighterInteger throws on
      // safe-integer overflow and wire-zero there; surface the identical
      // error here so validation never approves an order the signer path
      // refuses (a safe reference can still overflow after +5%).
      try {
        toSignerWireInteger(requestedSize, market.supportedSizeDecimals);
        toSignerWirePriceInteger(executionPrice, market.supportedPriceDecimals);
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateOrder').message,
        };
      }
    }
    return { isValid: true };
  };

  async validateClosePosition(
    params: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    // Same single error-to-invalid boundary as validateOrder.
    try {
      return await this.#validateClosePositionChecks(params);
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateClosePosition')
          .message,
      };
    }
  }

  readonly #validateClosePositionChecks = async (
    params: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> => {
    // Same shape rules the execution path enforces.
    const shapeError = this.#validateCloseShape(params);
    if (shapeError) {
      return { isValid: false, error: shapeError };
    }
    const markets = await this.#ensureMarkets();
    const market = markets.get(params.symbol);
    if (!market) {
      return {
        isValid: false,
        error: `Unknown Lighter market ${params.symbol}`,
      };
    }
    // Live sizing parity with closePosition→placeOrder: a validator that
    // approves a close the execution path rejects is worse than none.
    // Capability and data-integrity errors from the read surface as an
    // explicit invalid result, never an exception or a silent empty.
    let positions: Position[];
    try {
      positions = await this.getPositions();
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateClosePosition')
          .message,
      };
    }
    const signedHeld = parseFloat(
      positions.find((entry) => entry.symbol === params.symbol)?.size ?? '0',
    );
    const held = Math.abs(signedHeld);
    if (held === 0) {
      return {
        isValid: false,
        error: `No open Lighter position for ${params.symbol}`,
      };
    }
    // Order-type-specific pricing, matching execution exactly: a LIMIT
    // close is sized at the caller's price (which must be a finite
    // positive number — never silently replaced by a live price the
    // execution path would not use); a MARKET close resolves the FRESH
    // venue price through the SAME helper as placement, inheriting its
    // fail-closed missing-price and drift semantics.
    let referencePrice: number;
    let executionPrice: number;
    if ((params.orderType ?? 'market') === 'limit') {
      const parsedLimitPrice = parseFinitePositive(params.price ?? '');
      if (parsedLimitPrice === null) {
        return {
          isValid: false,
          error: `Invalid limit price ${params.price}: must be a positive number`,
        };
      }
      referencePrice = parsedLimitPrice;
      executionPrice = referencePrice;
    } else {
      const slippageFraction =
        params.maxSlippageBps === undefined
          ? 0.05
          : params.maxSlippageBps / 10_000;
      // Same validator contract as validateOrder: REST failures resolve.
      let resolved:
        | { referencePrice: number; error: null }
        | { referencePrice: null; error: string };
      try {
        resolved = await this.#resolveMarketReferencePrice(
          params.symbol,
          slippageFraction,
          params.priceAtCalculation,
        );
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateClosePosition')
            .message,
        };
      }
      if (resolved.error !== null) {
        return { isValid: false, error: resolved.error };
      }
      referencePrice = resolved.referencePrice;
      // Closing is the opposite side: a SHORT closes with a BUY, whose
      // +slippage protection price is what placement actually signs.
      executionPrice = deriveLighterExecutionPrice(
        referencePrice,
        signedHeld < 0,
        slippageFraction,
      );
    }
    if (referencePrice > 0) {
      const usdAmount = parseFloat(params.usdAmount ?? '');
      const requestedSize =
        Number.isFinite(usdAmount) && usdAmount > 0
          ? usdAmount / referencePrice
          : parseFloat(params.size ?? String(held));
      const minSize = computeLighterMinOrderSize(market, referencePrice);
      if (requestedSize < minSize && !(requestedSize >= held * (1 - 1e-9))) {
        return {
          isValid: false,
          error: `Order size ${requestedSize} is below the Lighter minimum of ${minSize} ${params.symbol}`,
        };
      }
      // Wire-format parity with the placement path closePosition uses:
      // the EXECUTION price is what gets integerized and signed.
      try {
        toSignerWireInteger(requestedSize, market.supportedSizeDecimals);
        toSignerWirePriceInteger(executionPrice, market.supportedPriceDecimals);
      } catch (error) {
        return {
          isValid: false,
          error: ensureError(error, 'LighterProvider.validateClosePosition')
            .message,
        };
      }
    }
    return { isValid: true };
  };

  async validateWithdrawal(
    params: WithdrawParams,
  ): Promise<{ isValid: boolean; error?: string }> {
    const amount = parseFinitePositive(params.amount ?? '');
    if (amount === null) {
      return { isValid: false, error: 'Withdrawal amount must be positive' };
    }
    // Advertised route-minimum parity with withdraw.
    const minWithdraw = parseFloat(
      LIGHTER_BRIDGE_CONFIG[this.#isTestnet ? 'testnet' : 'mainnet']
        .minWithdrawUsdc,
    );
    if (amount < minWithdraw) {
      return {
        isValid: false,
        error: `Withdrawal amount ${params.amount} is below the Lighter minimum of ${minWithdraw} USDC`,
      };
    }
    // Scaled wire-range parity with withdraw's own integerization.
    try {
      toSignerWireInteger(amount, 6);
    } catch (error) {
      return {
        isValid: false,
        error: ensureError(error, 'LighterProvider.validateWithdrawal').message,
      };
    }
    return { isValid: true };
  }

  // ============================================================================
  // Calculations (POC: coarse)
  // ============================================================================

  async calculateLiquidationPrice(
    _params: LiquidationPriceParams,
  ): Promise<string> {
    // Capability-gated: Lighter cross-margin liquidation depends on total
    // account value and the aggregate maintenance requirement across all
    // positions — inputs this preview does not have. A plausible-looking
    // per-position estimate would feed stop-loss warnings with a wrong
    // number, so the calculation reports unavailable and clients render
    // their explicit fallback. Live positions carry the venue's own
    // liquidationPrice.
    throw new Error(
      'Liquidation price preview is unavailable for Lighter: cross-margin liquidation depends on total account value and aggregate maintenance requirements',
    );
  }

  async calculateMaintenanceMargin(
    params: MaintenanceMarginParams,
  ): Promise<number> {
    // The venue publishes per-market maintenance margin fractions
    // (hundredths of a percent, e.g. 240 = 2.4%) in orderBookDetails.
    try {
      await this.#ensureMarketMargins();
      const maintenance = this.#marginBySymbol.get(params.asset)?.maintenance;
      if (maintenance && maintenance > 0) {
        return maintenance / 10_000;
      }
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] maintenance margin fallback',
        { error: String(error) },
      );
    }
    // Fallback: half the initial margin at the max-leverage constant.
    return 1 / (2 * LIGHTER_MAX_LEVERAGE);
  }

  /** Per-market margin fractions from orderBookDetails (hundredths of %). */
  readonly #marginBySymbol: Map<
    string,
    { minInitial?: number; maintenance?: number }
  > = new Map();

  /**
   * Synchronous best-effort per-market max leverage from the margin cache
   * (populated by #ensureMarketMargins); the constant covers cache misses.
   *
   * @param marketId - Numeric Lighter market id.
   * @returns Max leverage for the market.
   */
  readonly #maxLeverageForMarketId = (marketId: number): number => {
    const symbol = this.#marketsById.get(marketId)?.symbol;
    const minInitial = symbol
      ? this.#marginBySymbol.get(symbol)?.minInitial
      : undefined;
    return minInitial && minInitial > 0
      ? Math.floor(10_000 / minInitial)
      : LIGHTER_MAX_LEVERAGE;
  };

  /**
   * Authoritative per-market max leverage for TRADING validation: unlike
   * getMaxLeverage (which may fall back to the global constant for
   * display), this returns null when the venue's margin metadata is
   * missing or unreadable so leverage validation fails CLOSED — the 50x
   * fallback must never approve 26x for what may be a 25x market.
   *
   * @param symbol - Market symbol.
   * @returns The published max leverage, or null when unavailable.
   */
  readonly #requireMarketMaxLeverage = async (
    symbol: string,
  ): Promise<number | null> => {
    try {
      await this.#ensureMarketMargins();
    } catch {
      return null;
    }
    const minInitial = this.#marginBySymbol.get(symbol)?.minInitial;
    if (typeof minInitial !== 'number' || !(minInitial > 0)) {
      return null;
    }
    return Math.floor(10_000 / minInitial);
  };

  /** When the margin-metadata cache was last refreshed (0 = never). */
  #marginFetchedAt = 0;

  /** In-flight authoritative margin refresh, shared by the stale epoch. */
  #marginRefreshInFlight: Promise<void> | null = null;

  readonly #ensureMarketMargins = async (): Promise<void> => {
    // TTL refresh: metadata cached once for the whole session would keep
    // validating leverage against a stale (possibly higher) max. On
    // expiry the fetch re-runs; if it fails, the throw propagates and
    // #requireMarketMaxLeverage fails CLOSED for explicit leverage while
    // display callers keep their catch+fallback behavior.
    if (
      this.#marginBySymbol.size > 0 &&
      Date.now() - this.#marginFetchedAt < LIGHTER_MARGIN_METADATA_TTL_MS
    ) {
      return;
    }
    // ONE authoritative request per stale epoch: overlapping independent
    // fetches can resolve out of order, letting a DELAYED older payload
    // overwrite a fresher cap for a full TTL. A rejection propagates to
    // every waiter of this epoch (fail closed) and clears the in-flight
    // slot in finally so a later call can retry.
    if (!this.#marginRefreshInFlight) {
      this.#marginRefreshInFlight = (async (): Promise<void> => {
        try {
          const details = await this.#clientService.getOrderBookDetails();
          // Atomic replacement: set()-ing into the old map would let a
          // symbol REMOVED from fresh metadata keep its stale cap forever.
          // The timestamp only advances on success.
          const fresh = new Map<
            string,
            { minInitial?: number; maintenance?: number }
          >();
          for (const detail of details.orderBookDetails) {
            fresh.set(detail.symbol, {
              minInitial: detail.minInitialMarginFraction,
              maintenance: detail.maintenanceMarginFraction,
            });
          }
          this.#marginBySymbol.clear();
          for (const [symbol, entry] of fresh) {
            this.#marginBySymbol.set(symbol, entry);
          }
          this.#marginFetchedAt = Date.now();
        } finally {
          this.#marginRefreshInFlight = null;
        }
      })();
    }
    await this.#marginRefreshInFlight;
  };

  async getMaxLeverage(asset: string): Promise<number> {
    // The venue publishes per-market minimum initial margin fractions
    // (hundredths of a percent): 400 → 25x. The global constant is only a
    // fallback when the market is unknown.
    try {
      await this.#ensureMarketMargins();
      const minInitial = this.#marginBySymbol.get(asset)?.minInitial;
      if (minInitial && minInitial > 0) {
        return Math.floor(10_000 / minInitial);
      }
    } catch (error) {
      this.#deps.debugLogger.log('[LighterProvider] getMaxLeverage fallback', {
        error: String(error),
      });
    }
    return LIGHTER_MAX_LEVERAGE;
  }

  async calculateFees(
    params: FeeCalculationParams,
  ): Promise<FeeCalculationResult> {
    // The market metadata's zero fee is only true for Standard accounts —
    // resolve and gate the account tier first so a Premium account can
    // never be quoted a false zero (throws for Premium/unverified).
    await this.#ensureAccountIndex();
    // Sourced from the venue's own per-market metadata rather than assumed:
    // Lighter standard accounts currently report 0 maker/taker fees.
    const markets = await this.#ensureMarkets();
    const market = markets.get(params.symbol);
    const feeRate = parseFloat(
      (params.isMaker ? market?.makerFee : market?.takerFee) ?? '0',
    );
    const amount = parseFloat(params.amount ?? '0');
    return {
      feeRate,
      feeAmount: Number.isFinite(amount) ? amount * feeRate : 0,
      protocolFeeRate: feeRate,
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
    const generation = this.#sessionGeneration;
    let channelsRequested = false;
    const setupPromise = (async (): Promise<void> => {
      try {
        // Warm the margin cache before any WS position frame is adapted.
        await this.#ensureMarketMargins().catch(() => undefined);
        const accountIndex = await this.#ensureAccountIndex();
        // Address-aware: an EXTERNAL switch during the lookup (with no other
        // provider call to advance the generation) must also stop these
        // channels from being requested for the old account. The rebind
        // inside the binding call triggers its own rebuild for the new one.
        // Fails closed when no wallet account is bound — a configured
        // account index alone must never subscribe user channels.
        this.#assertSession(generation);
        this.#requestChannel(`user_stats/${accountIndex}`);
        this.#requestChannel(`account_all_positions/${accountIndex}`);
        this.#requestChannel(`account_all_trades/${accountIndex}`);
        channelsRequested = true;
        try {
          const auth = await this.#getAuthToken();
          this.#assertSession(generation);
          this.#requestChannel(`account_all_orders/${accountIndex}`, auth);
        } catch (error) {
          this.#deps.debugLogger.log(
            '[LighterProvider] orders channel skipped (no auth token)',
            { error: String(error) },
          );
          // Only the CURRENT session may blank the order subscribers: an
          // auth failure from an aborted previous-account setup must not
          // overwrite the new account's live orders with [].
          if (generation === this.#sessionGeneration) {
            this.#emitToOrderSubscribers([]);
          }
        }
      } catch (error) {
        this.#deps.debugLogger.log(
          '[LighterProvider] account channels unavailable',
          { error: String(error) },
        );
        // Only the CURRENT session may blank the subscribers: an aborted
        // previous-account setup must not overwrite the new account's data
        // with empty emissions.
        if (generation !== this.#sessionGeneration) {
          return;
        }
        // Capability gates (Premium/unverified tier, cross-owner config)
        // are not "no data": emitting empty state for them would present
        // false emptiness where reads surface an explicit error. Preserve
        // whatever the subscribers last saw and only log.
        if (this.#isUnsupportedCapabilityError(error)) {
          return;
        }
        for (const subscriber of this.#accountSubscribers) {
          subscriber.callback(EMPTY_ACCOUNT_STATE);
        }
        for (const subscriber of this.#positionSubscribers) {
          subscriber.callback([]);
        }
        this.#emitToOrderSubscribers([]);
      }
    })();
    this.#accountChannelsPromise = setupPromise;
    // A setup that never requested channels (no wallet account yet, or an
    // aborted switch) must not satisfy future ensure calls — clear it so
    // the next bind retries, without clobbering a newer session's promise.
    setupPromise
      .then(() => {
        if (
          !channelsRequested &&
          this.#accountChannelsPromise === setupPromise
        ) {
          this.#accountChannelsPromise = null;
        }
        return undefined;
      })
      .catch(() => undefined);
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
      // Observe any external switch first, then drop if this socket was
      // replaced (by that rebind or an earlier one).
      this.#ensureSessionBinding();
      if (this.#priceWs !== ws) {
        return;
      }
      const generationAtOpen = this.#sessionGeneration;
      this.#wsReconnectAttempts = 0;
      this.#setConnectionState(WebSocketConnectionState.Connected);
      for (const [channel, meta] of this.#wsWantedChannels) {
        if (meta.auth) {
          // Auth tokens are short-lived; a reconnect after the deadline must
          // re-mint instead of replaying the token captured at subscribe
          // time. #getAuthToken reuses the cached token while it is fresh.
          this.#getAuthToken()
            .then((freshToken) => {
              // The async continuation may resolve after an account switch
              // replaced the socket or the channel set: never reinsert a
              // stale channel or pair it with the new session's token.
              if (
                this.#priceWs !== ws ||
                generationAtOpen !== this.#sessionGeneration ||
                !this.#wsWantedChannels.has(channel)
              ) {
                return undefined;
              }
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
      // Re-run the live binding first: an EXTERNAL account switch that no
      // provider call has observed yet must tear this socket down (the
      // rebind replaces it) before any frame routes into current UI.
      this.#ensureSessionBinding();
      // Frames from a socket that was replaced (account rebind, reconnect)
      // must never reach the router — they carry the previous session's data.
      if (this.#priceWs !== ws) {
        return;
      }
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
        const adapted = adaptPositionFromLighter(
          position,
          this.#maxLeverageForMarketId(position.marketId),
        );
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
    let droppedUnsupportedFill = false;
    for (const marketTrades of Object.values(message.trades ?? {})) {
      for (const trade of marketTrades) {
        const symbol =
          this.#marketsById.get(trade.marketId)?.symbol ??
          String(trade.marketId);
        // One adapter serves REST history and the live stream so pnl,
        // fees, and direction vocabulary can never diverge between them.
        // A capability-refused fill (unverified nonzero fee) must never be
        // rendered with a false zero fee, nor crash the event handler.
        try {
          fills.push(
            adaptFillFromLighterTrade(trade, symbol, this.#accountIndex ?? -1),
          );
        } catch (error) {
          droppedUnsupportedFill = true;
          this.#deps.debugLogger.log(
            '[LighterProvider] dropped unsupported fill from stream',
            { tradeId: trade.tradeId, error: String(error) },
          );
        }
      }
    }
    if (fills.length === 0 && !isSnapshot) {
      return;
    }
    // A snapshot that lost fills to a capability refusal is PARTIAL:
    // emitting it would overwrite valid cached history with false
    // emptiness. Preserve what subscribers already have; REST reads
    // surface the capability error explicitly.
    if (isSnapshot && droppedUnsupportedFill) {
      this.#deps.debugLogger.log(
        '[LighterProvider] withholding partial fills snapshot (unsupported fills present)',
      );
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
