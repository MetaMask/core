/**
 * Lighter Client Service
 *
 * Thin REST client for the zkLighter API. No SDK dependency — endpoints are
 * called with the platform `fetch` global. Each successful endpoint response
 * is decoded before it reaches provider signing or trading logic.
 *
 * Endpoints used (https://apidocs.lighter.xyz):
 * - GET  /api/v1/orderBooks           market metadata
 * - GET  /api/v1/orderBookDetails     market stats
 * - GET  /api/v1/account              account (+positions) by index
 * - GET  /api/v1/accountsByL1Address  account discovery
 * - GET  /api/v1/apikeys              registered venue keys
 * - GET  /api/v1/nextNonce            per-key nonce
 * - GET  /api/v1/accountActiveOrders  open orders (auth token header)
 * - POST /api/v1/sendTx               submit signed L2 transaction
 */

import type { Struct } from '@metamask/superstruct';
import {
  array,
  assert,
  boolean,
  define,
  optional,
  record,
  refine,
  string,
  type,
  union,
} from '@metamask/superstruct';

import {
  LIGHTER_MAX_BASE_AMOUNT,
  LIGHTER_MAX_CLIENT_ORDER_INDEX,
  LIGHTER_MAX_ORDER_ID,
  LIGHTER_CLIENT_ORDER_LOOKUP_LIMIT,
  LIGHTER_RATE_LIMIT_BASE_COOLDOWN_MS,
  LIGHTER_RATE_LIMIT_MAX_COOLDOWN_MS,
  LIGHTER_REST_BUDGET_WINDOW_MS,
  LIGHTER_REST_REQUESTS_PER_MINUTE,
} from '../constants/lighterConfig.js';
import {
  getLighterHttpEndpoint,
  LIGHTER_DATA_INTEGRITY_PREFIX,
  LIGHTER_HTTP_TIMEOUT_MS,
  LIGHTER_RECENT_TRADES_MAX_LIMIT,
} from '../constants/lighterConfig.js';
import type { PerpsPlatformDependencies } from '../types/index.js';
import type {
  LighterAccountResponse,
  LighterAccountsByL1AddressResponse,
  LighterActiveOrdersResponse,
  LighterEditableOrdersResponse,
  LighterApiKeysResponse,
  LighterNetwork,
  LighterNextNonceResponse,
  LighterTxLookupResponse,
  LighterOrderBookMeta,
  LighterOrderBookOrdersResponse,
  LighterOrderBookDetailsResponse,
  LighterOrderBooksResponse,
  LighterCandlesResponse,
  LighterRecentTradesResponse,
  LighterDepositHistoryResponse,
  LighterInactiveOrdersResponse,
  LighterPnlResponse,
  LighterPositionFundingsResponse,
  LighterSendTxResponse,
  LighterTradesResponse,
  LighterTradesQuery,
  LighterTransferType,
  LighterTransferHistoryResponse,
  LighterWithdrawHistoryResponse,
} from '../types/lighter-types.js';
import { parseLighterLosslessJson } from '../utils/lighterLosslessJson.js';

/**
 * Duration market metadata stays cached before a refetch.
 */
const MARKETS_CACHE_TTL_MS = 5 * 60 * 1000;

const FiniteNumberStruct = define<number>('finite number', (value) =>
  typeof value === 'number' ? Number.isFinite(value) : false,
);
const SafeIntegerStruct = define<number>('safe integer', (value) =>
  typeof value === 'number' ? Number.isSafeInteger(value) : false,
);
const NonNegativeIntegerStruct = define<number>(
  'non-negative safe integer',
  (value) =>
    typeof value === 'number'
      ? Number.isSafeInteger(value) && value >= 0
      : false,
);
const parseStrictDecimalString = (value: unknown): number | null => {
  if (
    typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value)
  ) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const SignedDecimalStringStruct = define<string>(
  'finite decimal string',
  (value) => parseStrictDecimalString(value) !== null,
);
const NonNegativeDecimalStringStruct = define<string>(
  'non-negative finite decimal string',
  (value) => {
    const parsed = parseStrictDecimalString(value);
    return parsed !== null && parsed >= 0;
  },
);
const TransferTypeStruct = define<LighterTransferType>(
  'Lighter transfer type',
  (value) => value === 'L2TransferInflow' || value === 'L2TransferOutflow',
);
const PositiveDecimalStringStruct = define<string>(
  'positive finite decimal string',
  (value) => {
    const parsed = parseStrictDecimalString(value);
    return parsed !== null && parsed > 0;
  },
);
const NonNegativeFiniteNumberStruct = define<number>(
  'non-negative finite number',
  (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
);
const NonNegativeMarginFractionStruct = define<number>(
  'margin fraction in [0, 10000]',
  (value) =>
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 10_000,
);
const NonNegativeFinancialNumberStruct = union([
  NonNegativeFiniteNumberStruct,
  NonNegativeDecimalStringStruct,
]);
const BaseResponseStruct = type({
  code: SafeIntegerStruct,
  message: optional(string()),
});
const PositionStruct = type({
  marketId: NonNegativeIntegerStruct,
  symbol: string(),
  initialMarginFraction: NonNegativeDecimalStringStruct,
  openOrderCount: NonNegativeIntegerStruct,
  pendingOrderCount: optional(NonNegativeIntegerStruct),
  positionTiedOrderCount: optional(NonNegativeIntegerStruct),
  allocatedMargin: optional(NonNegativeDecimalStringStruct),
  sign: SafeIntegerStruct,
  position: NonNegativeDecimalStringStruct,
  avgEntryPrice: NonNegativeDecimalStringStruct,
  positionValue: NonNegativeDecimalStringStruct,
  unrealizedPnl: SignedDecimalStringStruct,
  realizedPnl: SignedDecimalStringStruct,
  liquidationPrice: NonNegativeDecimalStringStruct,
  marginMode: optional(SafeIntegerStruct),
});
const AccountStruct = type({
  code: SafeIntegerStruct,
  accountType: SafeIntegerStruct,
  index: NonNegativeIntegerStruct,
  l1Address: string(),
  cancelAllTime: NonNegativeIntegerStruct,
  totalOrderCount: NonNegativeIntegerStruct,
  pendingOrderCount: NonNegativeIntegerStruct,
  status: SafeIntegerStruct,
  collateral: NonNegativeDecimalStringStruct,
  availableBalance: NonNegativeDecimalStringStruct,
  positions: optional(array(PositionStruct)),
});
// The address-discovery endpoint is an identity lookup, not a financial read:
// live responses can carry sparse balance fields (for example an empty
// `availableBalance`). Validate only the fields its sole consumer needs. Full
// account reads retain AccountStruct and its strict financial validation.
const AccountSummaryStruct = type({
  accountType: SafeIntegerStruct,
  index: NonNegativeIntegerStruct,
  l1Address: string(),
});
const MarketBaseStruct = type({
  symbol: string(),
  marketId: NonNegativeIntegerStruct,
  marketType: string(),
  status: string(),
  takerFee: SignedDecimalStringStruct,
  makerFee: SignedDecimalStringStruct,
  minBaseAmount: NonNegativeDecimalStringStruct,
  minQuoteAmount: NonNegativeDecimalStringStruct,
  supportedSizeDecimals: NonNegativeIntegerStruct,
  supportedPriceDecimals: NonNegativeIntegerStruct,
  supportedQuoteDecimals: NonNegativeIntegerStruct,
});
const hasValidMarketMinimums = (
  market: Pick<
    LighterOrderBookMeta,
    'status' | 'minBaseAmount' | 'minQuoteAmount'
  >,
): boolean =>
  market.status === 'inactive' ||
  [market.minBaseAmount, market.minQuoteAmount].every((value) => {
    const parsed = parseStrictDecimalString(value);
    return parsed !== null && parsed > 0;
  });
const MarketStruct = refine(
  MarketBaseStruct,
  'positive minimum amounts for tradable markets',
  hasValidMarketMinimums,
);
const MarketDetailBaseStruct = type({
  ...MarketBaseStruct.schema,
  lastTradePrice: NonNegativeFiniteNumberStruct,
  defaultInitialMarginFraction: optional(NonNegativeMarginFractionStruct),
  minInitialMarginFraction: optional(NonNegativeMarginFractionStruct),
  maintenanceMarginFraction: optional(NonNegativeMarginFractionStruct),
  dailyTradesCount: NonNegativeFiniteNumberStruct,
  dailyBaseTokenVolume: NonNegativeFiniteNumberStruct,
  dailyQuoteTokenVolume: NonNegativeFiniteNumberStruct,
  dailyPriceLow: NonNegativeFiniteNumberStruct,
  dailyPriceHigh: NonNegativeFiniteNumberStruct,
  dailyPriceChange: FiniteNumberStruct,
  openInterest: NonNegativeFiniteNumberStruct,
  dailyChart: record(string(), FiniteNumberStruct),
});
const hasValidMarketMarginFractions = (market: {
  status: string;
  defaultInitialMarginFraction?: number;
  minInitialMarginFraction?: number;
  maintenanceMarginFraction?: number;
}): boolean =>
  market.status === 'inactive' ||
  [
    market.defaultInitialMarginFraction,
    market.minInitialMarginFraction,
    market.maintenanceMarginFraction,
  ].every((value) => value === undefined || value > 0);
const MarketDetailStruct = refine(
  refine(
    MarketDetailBaseStruct,
    'positive minimum amounts for tradable markets',
    hasValidMarketMinimums,
  ),
  'positive margin fractions for tradable markets',
  hasValidMarketMarginFractions,
);
const OrderStruct = refine(
  type({
    orderIndex: NonNegativeIntegerStruct,
    clientOrderIndex: NonNegativeIntegerStruct,
    marketIndex: NonNegativeIntegerStruct,
    ownerAccountIndex: NonNegativeIntegerStruct,
    initialBaseAmount: NonNegativeDecimalStringStruct,
    remainingBaseAmount: NonNegativeDecimalStringStruct,
    filledBaseAmount: optional(NonNegativeDecimalStringStruct),
    filledQuoteAmount: optional(NonNegativeDecimalStringStruct),
    clientOrderId: optional(string()),
    nonce: optional(SafeIntegerStruct),
    createdAt: optional(NonNegativeIntegerStruct),
    updatedAt: optional(NonNegativeIntegerStruct),
    transactionTime: optional(NonNegativeIntegerStruct),
    price: PositiveDecimalStringStruct,
    isAsk: boolean(),
    type: string(),
    timeInForce: string(),
    reduceOnly: union([FiniteNumberStruct, boolean()]),
    status: string(),
    orderExpiry: SafeIntegerStruct,
    timestamp: NonNegativeIntegerStruct,
    triggerPrice: optional(NonNegativeDecimalStringStruct),
    orderId: optional(string()),
    parentOrderIndex: optional(NonNegativeIntegerStruct),
    parentOrderId: optional(string()),
    toCancelOrderId0: optional(string()),
    toTriggerOrderId0: optional(string()),
    toTriggerOrderId1: optional(string()),
  }),
  'positive order size or explicitly linked zero-size reduce-only trigger',
  (order) => {
    if (Number(order.initialBaseAmount) > 0) {
      return true;
    }
    const hasParent =
      (order.parentOrderIndex !== undefined && order.parentOrderIndex > 0) ||
      (typeof order.parentOrderId === 'string' &&
        /^[1-9]\d*$/u.test(order.parentOrderId));
    return (
      hasParent &&
      (order.reduceOnly === 1 || order.reduceOnly === true) &&
      [
        'stop-loss',
        'stop-loss-limit',
        'take-profit',
        'take-profit-limit',
      ].includes(order.type) &&
      Number(order.triggerPrice) > 0
    );
  },
);
const TradeStruct = type({
  tradeIdStr: optional(string()),
  bidIdStr: optional(string()),
  askIdStr: optional(string()),
  tradeId: NonNegativeIntegerStruct,
  txHash: string(),
  type: string(),
  marketId: NonNegativeIntegerStruct,
  size: PositiveDecimalStringStruct,
  price: PositiveDecimalStringStruct,
  usdAmount: PositiveDecimalStringStruct,
  askId: NonNegativeIntegerStruct,
  bidId: NonNegativeIntegerStruct,
  askAccountId: NonNegativeIntegerStruct,
  bidAccountId: NonNegativeIntegerStruct,
  isMakerAsk: boolean(),
  timestamp: NonNegativeIntegerStruct,
  askAccountPnl: optional(SignedDecimalStringStruct),
  bidAccountPnl: optional(SignedDecimalStringStruct),
  takerFee: optional(NonNegativeFinancialNumberStruct),
  makerFee: optional(NonNegativeFinancialNumberStruct),
  takerPositionSizeBefore: NonNegativeDecimalStringStruct,
  makerPositionSizeBefore: NonNegativeDecimalStringStruct,
  takerPositionSignChanged: optional(boolean()),
  makerPositionSignChanged: optional(boolean()),
});

// Public trade tape: only the fields the feed reads, so a change to the
// venue's account-specific fields cannot break it.
const PublicTradeStruct = type({
  tradeIdStr: optional(string()),
  tradeId: NonNegativeIntegerStruct,
  txHash: string(),
  marketId: NonNegativeIntegerStruct,
  size: PositiveDecimalStringStruct,
  price: PositiveDecimalStringStruct,
  isMakerAsk: boolean(),
  timestamp: NonNegativeIntegerStruct,
});

const BookOrderStruct = type({
  orderIndex: NonNegativeIntegerStruct,
  orderId: string(),
  ownerAccountIndex: NonNegativeIntegerStruct,
  initialBaseAmount: PositiveDecimalStringStruct,
  remainingBaseAmount: PositiveDecimalStringStruct,
  price: PositiveDecimalStringStruct,
  orderExpiry: NonNegativeIntegerStruct,
  transactionTime: NonNegativeIntegerStruct,
});

const LosslessOrderIndexStruct = define<number | string>(
  'exact nonnegative native order identity',
  (value) => {
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value >= 0;
    }
    return (
      typeof value === 'string' &&
      /^(?:0|[1-9]\d*)$/u.test(value) &&
      value.length <= 19 &&
      BigInt(value) <= BigInt(LIGHTER_MAX_ORDER_ID)
    );
  },
);
const EditableOrderStruct = type({
  ...OrderStruct.schema,
  orderIndex: LosslessOrderIndexStruct,
  parentOrderIndex: optional(LosslessOrderIndexStruct),
});
const EditableOrdersStruct = type({
  ...BaseResponseStruct.schema,
  orders: array(EditableOrderStruct),
});

const ResponseStructs = {
  orderBookOrders: type({
    code: SafeIntegerStruct,
    totalBids: NonNegativeIntegerStruct,
    totalAsks: NonNegativeIntegerStruct,
    bids: array(BookOrderStruct),
    asks: array(BookOrderStruct),
  }),
  orderBooks: type({
    ...BaseResponseStruct.schema,
    orderBooks: array(MarketStruct),
  }),
  orderBookDetails: type({
    ...BaseResponseStruct.schema,
    orderBookDetails: array(MarketDetailStruct),
  }),
  account: type({
    ...BaseResponseStruct.schema,
    accounts: array(AccountStruct),
  }),
  accountsByAddress: type({
    ...BaseResponseStruct.schema,
    l1Address: string(),
    subAccounts: array(AccountSummaryStruct),
  }),
  apiKeys: type({
    ...BaseResponseStruct.schema,
    apiKeys: array(
      type({
        accountIndex: NonNegativeIntegerStruct,
        apiKeyIndex: NonNegativeIntegerStruct,
        nonce: NonNegativeIntegerStruct,
        publicKey: string(),
      }),
    ),
  }),
  nextNonce: type({
    ...BaseResponseStruct.schema,
    nonce: NonNegativeIntegerStruct,
  }),
  transaction: type({
    ...BaseResponseStruct.schema,
    hash: string(),
    accountIndex: NonNegativeIntegerStruct,
    apiKeyIndex: NonNegativeIntegerStruct,
    nonce: NonNegativeIntegerStruct,
    status: SafeIntegerStruct,
  }),
  sendTransaction: type({
    ...BaseResponseStruct.schema,
    txHash: string(),
  }),
  activeOrders: type({
    ...BaseResponseStruct.schema,
    orders: array(OrderStruct),
  }),
  inactiveOrders: type({
    ...BaseResponseStruct.schema,
    nextCursor: optional(string()),
    orders: array(OrderStruct),
  }),
  deposits: type({
    ...BaseResponseStruct.schema,
    deposits: array(
      type({
        id: string(),
        assetId: NonNegativeIntegerStruct,
        amount: PositiveDecimalStringStruct,
        timestamp: NonNegativeIntegerStruct,
        status: string(),
        l1TxHash: string(),
      }),
    ),
    cursor: optional(string()),
  }),
  withdrawals: type({
    ...BaseResponseStruct.schema,
    withdraws: array(
      type({
        id: string(),
        assetId: NonNegativeIntegerStruct,
        amount: PositiveDecimalStringStruct,
        timestamp: NonNegativeIntegerStruct,
        status: string(),
        type: string(),
        l1TxHash: string(),
      }),
    ),
    cursor: optional(string()),
  }),
  transfers: type({
    ...BaseResponseStruct.schema,
    transfers: array(
      type({
        id: string(),
        assetId: NonNegativeIntegerStruct,
        amount: PositiveDecimalStringStruct,
        fee: NonNegativeDecimalStringStruct,
        timestamp: NonNegativeIntegerStruct,
        type: TransferTypeStruct,
        fromL1Address: string(),
        toL1Address: string(),
        fromAccountIndex: NonNegativeIntegerStruct,
        toAccountIndex: NonNegativeIntegerStruct,
        txHash: string(),
      }),
    ),
    cursor: optional(string()),
  }),
  trades: type({
    ...BaseResponseStruct.schema,
    nextCursor: optional(string()),
    trades: array(TradeStruct),
  }),
  recentTrades: type({
    ...BaseResponseStruct.schema,
    trades: array(PublicTradeStruct),
  }),
  fundings: type({
    ...BaseResponseStruct.schema,
    positionFundings: array(
      type({
        timestamp: NonNegativeIntegerStruct,
        marketId: NonNegativeIntegerStruct,
        fundingId: NonNegativeIntegerStruct,
        change: SignedDecimalStringStruct,
        rate: SignedDecimalStringStruct,
        positionSize: NonNegativeDecimalStringStruct,
        positionSide: string(),
      }),
    ),
  }),
  pnl: type({
    ...BaseResponseStruct.schema,
    resolution: optional(string()),
    pnl: optional(
      array(
        type({
          timestamp: NonNegativeIntegerStruct,
          tradePnl: FiniteNumberStruct,
          inflow: FiniteNumberStruct,
          outflow: FiniteNumberStruct,
          volume: FiniteNumberStruct,
        }),
      ),
    ),
  }),
  candles: type({
    ...BaseResponseStruct.schema,
    r: optional(string()),
    c: optional(
      array(
        type({
          t: NonNegativeIntegerStruct,
          o: FiniteNumberStruct,
          h: FiniteNumberStruct,
          l: FiniteNumberStruct,
          c: FiniteNumberStruct,
          v: FiniteNumberStruct,
        }),
      ),
    ),
  }),
} as const;

/**
 * Convert a snake_case wire key to camelCase.
 *
 * @param key - Wire key (e.g. `min_base_amount`).
 * @returns camelCase key (e.g. `minBaseAmount`).
 */
function toCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/gu, (_match, char: string) =>
    char.toUpperCase(),
  );
}

/**
 * Recursively convert all object keys from snake_case to camelCase.
 * The zkLighter wire format is snake_case; parsed shapes in this package
 * follow camelCase conventions (see types/lighter-types.ts).
 *
 * @param value - Parsed JSON value.
 * @param rejectCollisions - Refuse distinct wire keys that camelize to one identity.
 * @returns The value with camelCase keys.
 */
export function convertKeysToCamelCase(
  value: unknown,
  rejectCollisions = false,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      convertKeysToCamelCase(entry, rejectCollisions),
    );
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (
      rejectCollisions &&
      new Set(entries.map(([key]) => toCamelKey(key))).size !== entries.length
    ) {
      throw new Error('Ambiguous Lighter response keys');
    }
    return Object.fromEntries(
      entries.map(([key, entry]) => [
        toCamelKey(key),
        convertKeysToCamelCase(entry, rejectCollisions),
      ]),
    );
  }
  return value;
}

/**
 * Error thrown for non-2xx HTTP responses or API-level error codes.
 */
export class LighterApiError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'LighterApiError';
    this.code = code;
  }
}

/**
 * Request priority. Trading calls never wait for the REST budget or a
 * rate-limit cooldown: order submission, the nonce and receipt reads around
 * it, and the book and exact-order reads that order and chase flows check for
 * freshness. Every other read does.
 */
type LighterRequestPriority = 'read' | 'trading';

/** REST health signals the provider folds into its health report. */
export type LighterRequestHealth = {
  /** Consecutive 5xx responses; reset by any response that is not 5xx, 429 or 405. */
  consecutiveServerErrors: number;
  /** Epoch ms when the current 429/405 cooldown ends, or null when none. */
  cooldownUntil: number | null;
};

const RATE_LIMIT_STATUSES = new Set([405, 429]);

/**
 * Parse a Retry-After header (seconds or an HTTP date) into milliseconds.
 *
 * @param value - Header value.
 * @returns Delay in milliseconds, or null when absent or invalid.
 */
const parseRetryAfterMs = (value: string | null): number | null => {
  if (value === null || value.trim() === '') {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds >= 0 ? seconds * 1000 : null;
  }
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
};

/**
 * REST client for the zkLighter API.
 */
export class LighterClientService {
  readonly #deps: PerpsPlatformDependencies;

  readonly #isTestnet: boolean;

  #marketsCache: LighterOrderBookMeta[] | null = null;

  #marketsCacheTime = 0;

  readonly #onRequestHealthChange: (() => void) | undefined;

  readonly #requestsPerMinute: number;

  /** Start times of requests inside the current budget window. */
  readonly #recentRequests: number[] = [];

  #consecutiveServerErrors = 0;

  #rateLimitStrikes = 0;

  #cooldownUntil: number | null = null;

  /** Write sections running now; the reads they issue skip the waits. */
  #tradingSections = 0;

  /** Ends the waits of reads held by the budget or a cooldown. */
  readonly #heldRequestReleases = new Set<() => void>();

  /** Bumped by `cancelHeldRequests`, so a released read knows to stop. */
  #heldRequestGeneration = 0;

  constructor(
    deps: PerpsPlatformDependencies,
    config: {
      isTestnet: boolean;
      /** Called when the 5xx streak or the rate-limit cooldown changes. */
      onRequestHealthChange?: () => void;
      /** REST budget per minute (defaults to the Standard-account limit). */
      requestsPerMinute?: number;
    },
  ) {
    this.#deps = deps;
    this.#isTestnet = config.isTestnet;
    this.#onRequestHealthChange = config.onRequestHealthChange;
    this.#requestsPerMinute =
      config.requestsPerMinute ?? LIGHTER_REST_REQUESTS_PER_MINUTE;
  }

  /**
   * Current REST health: the 5xx streak and any active 429/405 cooldown.
   *
   * @returns REST health signals.
   */
  getRequestHealth(): LighterRequestHealth {
    return {
      consecutiveServerErrors: this.#consecutiveServerErrors,
      cooldownUntil:
        this.#cooldownUntil !== null && this.#cooldownUntil > Date.now()
          ? this.#cooldownUntil
          : null,
    };
  }

  /**
   * Run a venue write flow. Reads it issues skip the budget and cooldown
   * waits like trading calls, so a held read never delays an order or the
   * orders queued behind it. Reads from other callers made meanwhile skip
   * them too.
   *
   * @param section - The write section.
   * @returns The section's result.
   */
  async runTradingSection<Result>(
    section: () => Promise<Result>,
  ): Promise<Result> {
    this.#tradingSections += 1;
    try {
      return await section();
    } finally {
      this.#tradingSections -= 1;
    }
  }

  /**
   * End every read held by the budget or a cooldown without sending it, for
   * example when the provider disconnects. Held reads reject; later requests
   * are unaffected.
   */
  cancelHeldRequests(): void {
    this.#heldRequestGeneration += 1;
    for (const release of [...this.#heldRequestReleases]) {
      release();
    }
  }

  get network(): LighterNetwork {
    return this.#isTestnet ? 'testnet' : 'mainnet';
  }

  get baseUrl(): string {
    return getLighterHttpEndpoint(this.network);
  }

  /**
   * Fetch market metadata, cached for 5 minutes.
   *
   * @param forceRefresh - Skip the cache and refetch.
   * @returns Market metadata entries.
   */
  async getOrderBooks(forceRefresh = false): Promise<LighterOrderBookMeta[]> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.#marketsCache &&
      now - this.#marketsCacheTime < MARKETS_CACHE_TTL_MS
    ) {
      return this.#marketsCache;
    }

    const response = await this.#get<LighterOrderBooksResponse>(
      '/api/v1/orderBooks',
      ResponseStructs.orderBooks,
    );
    this.#marketsCache = response.orderBooks;
    this.#marketsCacheTime = now;
    return response.orderBooks;
  }

  /**
   * Read a new public native order book snapshot without a local cache.
   *
   * @param marketId - Native signed int16 market ID.
   * @returns Up to 250 individual orders on each side.
   */
  async getOrderBookOrders(
    marketId: number,
  ): Promise<LighterOrderBookOrdersResponse> {
    if (!Number.isSafeInteger(marketId) || marketId < 0 || marketId > 32767) {
      throw new Error('Invalid Lighter market ID');
    }
    return await this.#get<LighterOrderBookOrdersResponse>(
      `/api/v1/orderBookOrders?market_id=${marketId}&limit=250`,
      ResponseStructs.orderBookOrders,
      undefined,
      'trading',
    );
  }

  /**
   * Fetch market stats for all markets.
   *
   * @returns Order book details entries.
   */
  async getOrderBookDetails(): Promise<LighterOrderBookDetailsResponse> {
    return await this.#get<LighterOrderBookDetailsResponse>(
      '/api/v1/orderBookDetails',
      ResponseStructs.orderBookDetails,
    );
  }

  /**
   * Fetch an account (including positions) by its Lighter index.
   *
   * @param accountIndex - The Lighter account index.
   * @returns Account payload.
   */
  async getAccountByIndex(
    accountIndex: number,
  ): Promise<LighterAccountResponse> {
    return await this.#get<LighterAccountResponse>(
      `/api/v1/account?by=index&value=${accountIndex}`,
      ResponseStructs.account,
    );
  }

  /**
   * Discover Lighter accounts owned by an L1 address.
   *
   * @param l1Address - The owning EVM address.
   * @returns Accounts payload.
   */
  async getAccountsByL1Address(
    l1Address: string,
  ): Promise<LighterAccountsByL1AddressResponse> {
    return await this.#get<LighterAccountsByL1AddressResponse>(
      `/api/v1/accountsByL1Address?l1_address=${l1Address}`,
      ResponseStructs.accountsByAddress,
    );
  }

  /**
   * Fetch registered API keys for an account.
   *
   * @param accountIndex - The Lighter account index.
   * @param apiKeyIndex - Key slot, or 255 for all slots.
   * @returns API keys payload.
   */
  async getApiKeys(
    accountIndex: number,
    apiKeyIndex = 255,
  ): Promise<LighterApiKeysResponse> {
    return await this.#get<LighterApiKeysResponse>(
      `/api/v1/apikeys?account_index=${accountIndex}&api_key_index=${apiKeyIndex}`,
      ResponseStructs.apiKeys,
    );
  }

  /**
   * Fetch the next nonce for a key slot.
   *
   * @param accountIndex - The Lighter account index.
   * @param apiKeyIndex - Key slot.
   * @returns Next nonce payload.
   */
  async getNextNonce(
    accountIndex: number,
    apiKeyIndex: number,
  ): Promise<LighterNextNonceResponse> {
    return await this.#get<LighterNextNonceResponse>(
      `/api/v1/nextNonce?account_index=${accountIndex}&api_key_index=${apiKeyIndex}`,
      ResponseStructs.nextNonce,
      undefined,
      'trading',
    );
  }

  /**
   * Look up a transaction by its exact hash (`GET /api/v1/tx`). Used to
   * resolve submission-acceptance ambiguity authoritatively: an exact-hash
   * match proves the signed payload reached the sequencer.
   *
   * Contract: a venue-confirmed "transaction not found" (API error code
   * 21500) resolves to NULL; transport failures and every other API error
   * RETHROW — they are ambiguity, never evidence of non-acceptance.
   *
   * @param txHash - The signed transaction hash.
   * @returns The venue's transaction payload, or null when the venue
   * confirms the hash is unknown.
   */
  async getTx(txHash: string): Promise<LighterTxLookupResponse | null> {
    try {
      return await this.#get<LighterTxLookupResponse>(
        `/api/v1/tx?by=hash&value=${encodeURIComponent(txHash)}`,
        ResponseStructs.transaction,
        undefined,
        'trading',
      );
    } catch (error) {
      if (error instanceof LighterApiError && error.code === 21500) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch active (open) orders for an account.
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer (`_createAuthToken`).
   * @param marketId - Optional market filter (255 = all markets).
   * @returns Active orders payload.
   */
  async getActiveOrders(
    accountIndex: number,
    authToken: string,
    marketId = 255,
  ): Promise<LighterActiveOrdersResponse> {
    return await this.#get<LighterActiveOrdersResponse>(
      `/api/v1/accountActiveOrders?account_index=${accountIndex}&market_id=${marketId}`,
      ResponseStructs.activeOrders,
      { authorization: authToken },
    );
  }

  /**
   * Fetch exact client IDs. Venue retention is the last 10K active orders or
   * last 1K inactive orders within 24 hours; omission is not absence proof.
   *
   * @param accountIndex - Explicit verified account owner.
   * @param authToken - Matching account read authority.
   * @param clientOrderIds - Unique canonical 48-bit client IDs, at most twenty.
   * @returns Matching rows, subject to venue retention limits.
   */
  async getOrdersByClientIds(
    accountIndex: number,
    authToken: string,
    clientOrderIds: readonly string[],
  ): Promise<LighterActiveOrdersResponse> {
    if (!Number.isSafeInteger(accountIndex) || accountIndex < 0) {
      throw new Error('Invalid Lighter account index');
    }
    if (
      clientOrderIds.length === 0 ||
      clientOrderIds.length > LIGHTER_CLIENT_ORDER_LOOKUP_LIMIT ||
      new Set(clientOrderIds).size !== clientOrderIds.length ||
      clientOrderIds.some(
        (id) =>
          typeof id !== 'string' ||
          !/^[1-9]\d*$/u.test(id) ||
          BigInt(id) > BigInt(LIGHTER_MAX_CLIENT_ORDER_INDEX),
      )
    ) {
      throw new Error('Invalid Lighter client order IDs');
    }
    return await this.#get<LighterActiveOrdersResponse>(
      `/api/v1/accountOrders?account_index=${accountIndex}&client_order_indexes=${encodeURIComponent(clientOrderIds.join(','))}`,
      ResponseStructs.activeOrders,
      { authorization: authToken },
      'trading',
    );
  }

  /**
   * Read active targets or exact client-correlated lifecycle rows without rounding int64 venue IDs.
   * Uses the saved accountOrders contract, which accepts client IDs, not venue order IDs.
   *
   * @param accountIndex - Verified owner account.
   * @param authToken - Existing registered read authority.
   * @param clientOrderIds - Exact client identities once an active target is known.
   * @returns Validated lossless order observations. Missing rows are never terminal proof.
   */
  async getEditableOrders(
    accountIndex: number,
    authToken: string,
    clientOrderIds?: readonly string[],
  ): Promise<LighterEditableOrdersResponse> {
    if (
      !Number.isSafeInteger(accountIndex) ||
      accountIndex < 0 ||
      accountIndex > Number(LIGHTER_MAX_BASE_AMOUNT) ||
      (clientOrderIds &&
        (clientOrderIds.length === 0 ||
          clientOrderIds.length > LIGHTER_CLIENT_ORDER_LOOKUP_LIMIT ||
          new Set(clientOrderIds).size !== clientOrderIds.length ||
          clientOrderIds.some(
            (id) =>
              !/^[1-9]\d*$/u.test(id) ||
              id.length > 15 ||
              BigInt(id) > BigInt(LIGHTER_MAX_BASE_AMOUNT),
          )))
    ) {
      throw new Error('Invalid Lighter editable-order identity');
    }
    const path = clientOrderIds
      ? `/api/v1/accountOrders?account_index=${accountIndex}&client_order_indexes=${encodeURIComponent(clientOrderIds.join(','))}`
      : `/api/v1/accountActiveOrders?account_index=${accountIndex}`;
    return await this.#request(
      path,
      { method: 'GET', headers: { authorization: authToken } },
      EditableOrdersStruct,
      true,
      'trading',
    );
  }

  /**
   * Fetch historical (inactive) orders: filled and canceled lifecycle
   * states, newest first (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @param limit - Maximum entries per page.
   * @param cursor - Pagination cursor from a previous page's `nextCursor`.
   * @param marketId - Optional market filter (official `market_id` query
   * param) — sharply bounds history scans to one symbol.
   * @returns Inactive orders payload.
   */
  async getInactiveOrders(
    accountIndex: number,
    authToken: string,
    limit = 50,
    cursor?: string,
    marketId?: number,
  ): Promise<LighterInactiveOrdersResponse> {
    return await this.#get<LighterInactiveOrdersResponse>(
      `/api/v1/accountInactiveOrders?account_index=${accountIndex}&limit=${limit}${
        cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`
      }${marketId === undefined ? '' : `&market_id=${marketId}`}`,
      ResponseStructs.inactiveOrders,
      { authorization: authToken },
    );
  }

  /**
   * Fetch L1→L2 deposit history (auth token required). The venue requires
   * both the account index and its L1 address on this endpoint.
   *
   * @param accountIndex - The Lighter account index.
   * @param l1Address - The account's L1 address.
   * @param authToken - Auth token minted by the signer.
   * @returns Deposit history payload (newest first, cursor-paged).
   */
  async getDepositHistory(
    accountIndex: number,
    l1Address: string,
    authToken: string,
  ): Promise<LighterDepositHistoryResponse> {
    return await this.#get<LighterDepositHistoryResponse>(
      `/api/v1/deposit/history?account_index=${accountIndex}&l1_address=${l1Address}`,
      ResponseStructs.deposits,
      { authorization: authToken },
    );
  }

  /**
   * Fetch L2→L1 withdrawal history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @returns Withdrawal history payload (newest first, cursor-paged).
   */
  async getWithdrawHistory(
    accountIndex: number,
    authToken: string,
  ): Promise<LighterWithdrawHistoryResponse> {
    return await this.#get<LighterWithdrawHistoryResponse>(
      `/api/v1/withdraw/history?account_index=${accountIndex}`,
      ResponseStructs.withdrawals,
      { authorization: authToken },
    );
  }

  /**
   * Fetch L2 transfer history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @returns Transfer history payload (newest first, cursor-paged).
   */
  async getTransferHistory(
    accountIndex: number,
    authToken: string,
  ): Promise<LighterTransferHistoryResponse> {
    return await this.#get<LighterTransferHistoryResponse>(
      `/api/v1/transfer/history?account_index=${accountIndex}`,
      ResponseStructs.transfers,
      { authorization: authToken },
    );
  }

  /**
   * Fetch account trade history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @param query - Pagination, range, and market filters.
   * @returns Trades payload (newest first).
   */
  async getTrades(
    accountIndex: number,
    authToken: string,
    query: LighterTradesQuery,
  ): Promise<LighterTradesResponse> {
    const { limit, cursor, from, marketId, orderIndex, aggregate } = query;
    if (
      orderIndex !== undefined &&
      (typeof orderIndex !== 'string' ||
        !/^[1-9]\d*$/u.test(orderIndex) ||
        BigInt(orderIndex) > BigInt(LIGHTER_MAX_ORDER_ID))
    ) {
      throw new Error('Invalid Lighter exact trade order index');
    }
    return await this.#get<LighterTradesResponse>(
      `/api/v1/trades?sort_by=timestamp&sort_dir=desc&limit=${limit}&account_index=${accountIndex}&market_type=perp${
        cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`
      }${from === undefined ? '' : `&from=${from}`}${
        marketId === undefined ? '' : `&market_id=${marketId}`
      }${orderIndex === undefined ? '' : `&order_index=${orderIndex}`}${
        aggregate === undefined ? '' : `&aggregate=${String(aggregate)}`
      }`,
      ResponseStructs.trades,
      { authorization: authToken },
    );
  }

  /**
   * Fetch a market's most recent public trades (no auth), newest first.
   *
   * @param marketId - Numeric Lighter market id.
   * @param limit - Number of trades, 1 to {@link LIGHTER_RECENT_TRADES_MAX_LIMIT}.
   * @returns Recent trades payload.
   */
  async getRecentTrades(
    marketId: number,
    limit: number,
  ): Promise<LighterRecentTradesResponse> {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > LIGHTER_RECENT_TRADES_MAX_LIMIT
    ) {
      throw new Error('Invalid Lighter recent trades limit');
    }
    return await this.#get<LighterRecentTradesResponse>(
      `/api/v1/recentTrades?market_id=${marketId}&limit=${limit}`,
      ResponseStructs.recentTrades,
    );
  }

  /**
   * Fetch user funding payment history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @param limit - Max entries.
   * @returns Position fundings payload.
   */
  async getPositionFundings(
    accountIndex: number,
    authToken: string,
    limit = 50,
  ): Promise<LighterPositionFundingsResponse> {
    return await this.#get<LighterPositionFundingsResponse>(
      `/api/v1/positionFunding?account_index=${accountIndex}&market_id=255&limit=${limit}&sort_by=timestamp&side=all`,
      ResponseStructs.fundings,
      { authorization: authToken },
    );
  }

  /**
   * Fetch account PnL history (auth token required).
   *
   * @param accountIndex - The Lighter account index.
   * @param authToken - Auth token minted by the signer.
   * @param startTimestamp - Range start (ms).
   * @param endTimestamp - Range end (ms).
   * @param countBack - Records counted back from range end.
   * @returns PnL payload.
   */
  async getPnl(
    accountIndex: number,
    authToken: string,
    startTimestamp: number,
    endTimestamp: number,
    countBack: number,
  ): Promise<LighterPnlResponse> {
    return await this.#get<LighterPnlResponse>(
      `/api/v1/pnl?by=index&value=${accountIndex}&resolution=1d&count_back=${countBack}&start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`,
      ResponseStructs.pnl,
      { authorization: authToken },
    );
  }

  /**
   * Fetch an OHLCV candle series for a market.
   *
   * @param marketId - Numeric Lighter market id.
   * @param resolution - Candle resolution (e.g. `1m`, `15m`, `1h`, `1d`).
   * @param startTimestamp - Range start (ms).
   * @param endTimestamp - Range end (ms).
   * @param countBack - Number of candles counted back from the range end.
   * @returns Candle series payload.
   */
  async getCandles(
    marketId: number,
    resolution: string,
    startTimestamp: number,
    endTimestamp: number,
    countBack: number,
  ): Promise<LighterCandlesResponse> {
    return await this.#get<LighterCandlesResponse>(
      `/api/v1/candles?market_id=${marketId}&resolution=${resolution}&start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}&count_back=${countBack}`,
      ResponseStructs.candles,
    );
  }

  /**
   * Submit a signed L2 transaction.
   *
   * @param txType - L2 transaction type code (see lighterConfig).
   * @param txInfo - Serialized signed transaction JSON.
   * @returns Send result payload.
   */
  async sendTx(txType: number, txInfo: string): Promise<LighterSendTxResponse> {
    const body = new URLSearchParams({
      tx_type: String(txType),
      tx_info: txInfo,
    });

    const response = await this.#request<LighterSendTxResponse>(
      '/api/v1/sendTx',
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      ResponseStructs.sendTransaction,
      false,
      'trading',
    );
    return response;
  }

  readonly #get = async <Result extends { code: number; message?: string }>(
    path: string,
    responseStruct: Struct<Result, unknown>,
    headers?: Record<string, string>,
    priority: LighterRequestPriority = 'read',
  ): Promise<Result> => {
    return await this.#request<Result>(
      path,
      { method: 'GET', headers },
      responseStruct,
      false,
      priority,
    );
  };

  /**
   * Take a slot in the REST budget. Reads wait for a free slot and for any
   * rate-limit cooldown; trading calls go out at once but still count.
   *
   * @param priority - Request priority.
   */
  readonly #acquireRequestSlot = async (
    priority: LighterRequestPriority,
  ): Promise<void> => {
    const generation = this.#heldRequestGeneration;
    for (;;) {
      const now = Date.now();
      while (
        this.#recentRequests.length > 0 &&
        this.#recentRequests[0] <= now - LIGHTER_REST_BUDGET_WINDOW_MS
      ) {
        this.#recentRequests.shift();
      }
      const cooldownWait =
        this.#cooldownUntil === null ? 0 : this.#cooldownUntil - now;
      const budgetWait =
        this.#recentRequests.length < this.#requestsPerMinute
          ? 0
          : this.#recentRequests[0] + LIGHTER_REST_BUDGET_WINDOW_MS - now;
      const waitMs =
        priority === 'trading' || this.#tradingSections > 0
          ? 0
          : Math.max(cooldownWait, budgetWait);
      if (waitMs <= 0) {
        this.#recentRequests.push(now);
        return;
      }
      let release = (): void => undefined;
      const waited = new Promise<void>((resolveWait) => {
        const timer = setTimeout(resolveWait, waitMs);
        release = (): void => {
          clearTimeout(timer);
          resolveWait();
        };
      });
      this.#heldRequestReleases.add(release);
      await waited;
      this.#heldRequestReleases.delete(release);
      if (this.#heldRequestGeneration !== generation) {
        throw new Error('Lighter request cancelled while held');
      }
    }
  };

  /**
   * Track the 5xx streak and 429/405 cooldowns from one response status.
   *
   * @param status - HTTP status.
   * @param retryAfter - Retry-After header, read only for rate-limit statuses.
   */
  readonly #recordResponseStatus = (
    status: number,
    retryAfter: string | null,
  ): void => {
    const before = `${this.#consecutiveServerErrors}:${this.#cooldownUntil}`;
    if (RATE_LIMIT_STATUSES.has(status)) {
      this.#rateLimitStrikes += 1;
      const delayMs = Math.min(
        LIGHTER_RATE_LIMIT_MAX_COOLDOWN_MS,
        parseRetryAfterMs(retryAfter) ??
          LIGHTER_RATE_LIMIT_BASE_COOLDOWN_MS *
            2 ** (this.#rateLimitStrikes - 1),
      );
      this.#cooldownUntil = Math.max(
        this.#cooldownUntil ?? 0,
        Date.now() + delayMs,
      );
      this.#deps.debugLogger?.log?.('[LighterClientService] rate limited', {
        status,
        strike: this.#rateLimitStrikes,
        cooldownMs: this.#cooldownUntil - Date.now(),
      });
    } else {
      this.#rateLimitStrikes = 0;
      this.#consecutiveServerErrors =
        status >= 500 ? this.#consecutiveServerErrors + 1 : 0;
    }
    if (`${this.#consecutiveServerErrors}:${this.#cooldownUntil}` !== before) {
      this.#onRequestHealthChange?.();
    }
  };

  readonly #request = async <Result extends { code: number; message?: string }>(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
    responseStruct: Struct<Result, unknown>,
    lossless = false,
    priority: LighterRequestPriority = 'read',
  ): Promise<Result> => {
    await this.#acquireRequestSlot(priority);
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      LIGHTER_HTTP_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: init.method,
        headers: init.headers,
        body: init.body,
        signal: controller.signal,
      });
      this.#recordResponseStatus(
        response.status,
        RATE_LIMIT_STATUSES.has(response.status)
          ? response.headers.get('retry-after')
          : null,
      );

      let body: unknown;
      try {
        body = lossless
          ? parseLighterLosslessJson(await response.text())
          : await response.json();
      } catch (parseError) {
        // A rate-limit or gateway error page is not JSON: keep its HTTP
        // status as the error code instead of a parser message.
        if (!response.ok) {
          throw new LighterApiError(
            `Lighter API error (HTTP ${response.status})`,
            response.status,
          );
        }
        throw parseError;
      }
      const payload: unknown = convertKeysToCamelCase(body, lossless);
      assert(payload, BaseResponseStruct);

      // Lighter returns HTTP 200 with an application-level error code, and
      // 4xx/5xx with `{code, message}` bodies — treat both uniformly.
      if (!response.ok || payload.code !== 200) {
        throw new LighterApiError(
          payload.message ?? `Lighter API error (HTTP ${response.status})`,
          payload.code ?? response.status,
        );
      }
      try {
        assert(payload, responseStruct);
      } catch (error) {
        throw new LighterApiError(
          `${LIGHTER_DATA_INTEGRITY_PREFIX} response for ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof LighterApiError) {
        throw error;
      }
      this.#deps.debugLogger?.log?.('LighterClientService request failed', {
        url,
        error,
      });
      throw new LighterApiError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timeout);
    }
  };
}
