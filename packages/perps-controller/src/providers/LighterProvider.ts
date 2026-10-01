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
 * - REST reads plus WebSocket market, account, position, order, fill,
 *   order-book, and candle streams, with price polling as a fallback.
 */

import type { CaipAccountId } from '@metamask/utils';

import type { CandlePeriod } from '../constants/chartConfig.js';
import {
  computeLighterMinOrderSize,
  fromLighterInteger,
  getLighterChainId,
  getLighterTransactionOutcome,
  LIGHTER_RESOLUTION_MS,
  LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT,
  LIGHTER_SUPPORTED_RESOLUTIONS,
  LIGHTER_DEFAULT_API_KEY_INDEX,
  LIGHTER_MIN_TRADING_API_KEY_INDEX,
  LIGHTER_MAX_TRADING_API_KEY_INDEX,
  LIGHTER_TRADING_API_KEY_COUNT,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS,
  LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS,
  LIGHTER_FILL_REPLAY_LIMIT,
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
  LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  LIGHTER_TX_TYPE_CREATE_GROUPED_ORDERS,
  LIGHTER_TX_TYPE_CREATE_ORDER,
  LIGHTER_TX_TYPE_UPDATE_LEVERAGE,
  LIGHTER_TX_TYPE_UPDATE_MARGIN,
  LIGHTER_TX_TYPE_WITHDRAW,
  LIGHTER_MARGIN_MODE_CROSS,
  LIGHTER_MARGIN_MODE_ISOLATED,
  LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX,
  LIGHTER_USDC_ASSET_INDEX,
  LIGHTER_DATA_INTEGRITY_PREFIX,
  LIGHTER_MARGIN_METADATA_TTL_MS,
  parseLighterStrictDecimal,
  toLighterInteger,
} from '../constants/lighterConfig.js';
import { PERPS_CONSTANTS } from '../constants/perpsConfig.js';
import type { PerpsControllerMessenger } from '../PerpsController.js';
import { PERPS_ERROR_CODES } from '../perpsErrorCodes.js';
import { hasErrorInCauseChain } from '../services/causeChain.js';
import {
  convertKeysToCamelCase,
  LighterApiError,
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
  DirectProviderOrderCapabilities,
  DirectProviderOrderCapabilitiesUnavailableReason,
  GetOrderCapabilitiesParams,
  GetAccountStateParams,
  GetFundingParams,
  GetHistoricalPortfolioParams,
  GetMarginModeLockParams,
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
  TriggerOrderType,
  PerpsMarginModeLock,
  PerpsMarketData,
  PerpsPlatformDependencies,
  PerpsProvider,
  PerpsRecoveredDispatch,
  PerpsRecoveryVenueReview,
  ResolveRecoveryProtectionParams,
  PerpsRecoveryProtectionResult,
  PerpsReadOptions,
  Position,
  PositionModifyPreviewParams,
  PositionModifyPreviewResult,
  RawLedgerUpdate,
  ReadyToTradeResult,
  SubscribeAccountParams,
  SubscribeCandlesParams,
  SubscribeOICapsParams,
  OrderBookData,
  OrderBookLevel,
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
  LighterApiPosition,
  LighterAccountsByL1AddressResponse,
  LighterAccountSummary,
  LighterAuthConfig,
  LighterTxLookupResponse,
  LighterTransferHistoryItem,
  LighterCreateClientResult,
  LighterCreateOrderWireParams,
  LighterGroupedOrderWireParams,
  LighterOrderBookMeta,
  LighterSendTxResponse,
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
  LighterTxResult,
  LighterWebSocketCtor,
  LighterWebSocketLike,
  LighterWsAccountMessage,
  LighterCandle,
  LighterWsCandleMessage,
  LighterWsOrderBookMessage,
  LighterWsTradesMessage,
  LighterWsMarketStat,
  LighterWsMarketStatsMessage,
} from '../types/lighter-types.js';
import { ensureError, isKeyringLockedError } from '../utils/errorUtils.js';
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
import {
  isLimitExecutionOrderType,
  isTriggerOrderType,
  TRIGGER_ORDER_TYPES,
} from '../utils/orderTypes.js';
import { assertExpectedPosition } from '../utils/positionProtection.js';

type LighterFillQuery = GetOrderFillsParams & {
  symbol?: string;
};

type LighterMarginMetadata = {
  marketId: number;
  minInitial?: number;
  maintenance?: number;
  lastTradePrice?: number;
};

type LighterOrderBookState = {
  bids: Map<string, string>;
  asks: Map<string, string>;
  nonce: number;
};

const NOOP_UNSUBSCRIBE = (): void => undefined;

const LIGHTER_INACTIVE_HISTORY_ROW_LIMIT = 10_000;

/** Default Lighter execution protection, in basis points (5%). */
const LIGHTER_DEFAULT_SLIPPAGE_BPS = 500;

/** Maximum durable position-protection ownership entries per account market. */
const LIGHTER_TPSL_OWNERSHIP_MAX_ORDERS = 256;

/** Single-page history bound used when reclaiming expired protection ownership. */
const LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE = 100;

const deriveLighterMaxLeverage = (
  minInitialMarginFraction: number | undefined,
  market: string | number,
): number => {
  if (
    typeof minInitialMarginFraction !== 'number' ||
    !Number.isSafeInteger(minInitialMarginFraction) ||
    minInitialMarginFraction < 1 ||
    minInitialMarginFraction > 10_000
  ) {
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} invalid initial margin fraction for market ${String(market)}`,
    );
  }
  const maxLeverage = Math.floor(10_000 / minInitialMarginFraction);
  if (!Number.isSafeInteger(maxLeverage) || maxLeverage < 1) {
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} invalid max leverage for market ${String(market)}`,
    );
  }
  return maxLeverage;
};

const isInactiveMarketWithoutUsableRiskMetadata = (market: {
  status: string;
  minInitialMarginFraction?: number;
  maintenanceMarginFraction?: number;
}): boolean =>
  // Lighter retains inactive rows for historical identity but can zero their
  // trading constraints. They are valid venue records, not usable markets.
  market.status === 'inactive' &&
  (market.minInitialMarginFraction === undefined ||
    market.minInitialMarginFraction === 0 ||
    market.maintenanceMarginFraction === 0);

const adaptLighterTransferDelta = (
  entry: LighterTransferHistoryItem,
): RawLedgerUpdate['delta'] => {
  if (entry.type === 'L2TransferOutflow') {
    return { type: 'transferOut', usdc: `-${entry.amount}` };
  }
  if (entry.type === 'L2TransferInflow') {
    return { type: 'transferIn', usdc: entry.amount };
  }
  throw new Error(
    `${LIGHTER_DATA_INTEGRITY_PREFIX} unknown transfer type ${String(entry.type)}`,
  );
};

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

/**
 * Snap a base size onto the market's size grid exactly as wire
 * integerization will (round to nearest step). Minimum-size checks must
 * judge the SNAPPED size: a raw USD/price quotient one hair under the
 * minimum still reaches the venue as the valid minimum step, and
 * rejecting the raw quotient refuses orders the venue accepts.
 *
 * @param size - Raw base size (human units).
 * @param supportedSizeDecimals - Market size decimals.
 * @returns The grid-snapped size, or the input unchanged when it cannot
 * be integerized (range overflow) — later wire conversion fails closed.
 */
const snapToLighterSizeGrid = (
  size: number,
  supportedSizeDecimals: number,
): number => {
  try {
    return fromLighterInteger(
      toLighterInteger(size, supportedSizeDecimals),
      supportedSizeDecimals,
    );
  } catch {
    return size;
  }
};

/**
 * Whether Lighter applies its documented maker-only order minimums.
 *
 * @param params - Order intent to classify.
 * @returns Whether the order rests as a maker order.
 */
const isLighterMakerOrder = (params: OrderParams): boolean =>
  isLimitExecutionOrderType(params.orderType) && params.timeInForce !== 'IOC';

/**
 * Parse a candle field without JavaScript's null/boolean/blank coercions.
 *
 * @param value - Raw candle field from the venue.
 * @returns A finite number, or null when the field is malformed.
 */
const toFiniteCandleNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : parseStrictDecimal(value);
  return parsed !== null && Number.isFinite(parsed) ? parsed : null;
};

/**
 * Map one venue candle onto the CandleStick contract, or null when any
 * field is non-finite. WS/REST candle payloads are cast at the boundary,
 * not validated — a malformed candle stringified blind reaches the chart
 * as "undefined"/NaN, the same native-SVG crash class the bare
 * order-book levels produced.
 *
 * @param candle - Raw venue candle.
 * @returns The contract candle, or null when unmappable.
 */
const toFiniteCandle = (candle: LighterCandle): CandleStick | null => {
  const time = toFiniteCandleNumber(candle?.t);
  const fields = [candle?.o, candle?.h, candle?.l, candle?.c, candle?.v].map(
    toFiniteCandleNumber,
  );
  if (time === null || fields.some((value) => value === null)) {
    return null;
  }
  const [open, high, low, close, volume] = fields as number[];
  return {
    time,
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: String(volume),
  };
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
  /**
   * Unique per-journal attempt identity. Nonces CANNOT identify
   * attempts: a proven-never-landed submission releases its nonce and a
   * retry legitimately reuses it.
   */
  attemptId: number;
  /** See TpslCancelAttempt.terminalStatus. */
  terminalStatus?: number;
  /** Current-pass exact-hash absence after expiry; never persisted or reused. */
  neverLanded?: true;
  /** The venue nonce this submission attempted to consume. */
  nonce: number;
  /** 'accepted' only after the venue's 200 was OBSERVED. */
  outcome: 'unknown' | 'accepted';
  /** Created client ids (nonempty). */
  clientIds: number[];
  /** Signed absolute ORDER expiries, aligned with clientIds; legacy may omit. */
  orderExpiries?: number[];
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
   * For role 'restore' only: the prior triggers (by original orderId in
   * `priorTriggers`) this attempt restores, INDEX-ALIGNED with
   * `clientIds` (a grouped OCO restore carries two legs). With multiple
   * prior triggers and a crash mid-restore, recovery uses this to
   * restore exactly the remaining intents — never duplicating or
   * omitting one.
   */
  priorOrderIds?: string[];
};

type TpslCancelAttempt = {
  kind: 'cancel';
  /** Unique per-journal attempt identity (see TpslCreateAttempt). */
  attemptId: number;
  /**
   * Venue-reported terminal status (4 failed / 5 rejected) recorded by
   * reconciliation for an attempt that LANDED but did not mutate the
   * books — makes it compactable.
   */
  terminalStatus?: number;
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
/**
 * Durable nonce dispatch ledger document. Entries carry the OPERATION
 * kind (tx type) and a human-readable intent so a dispatch whose
 * response was lost but which is later PROVEN consumed can be surfaced
 * as a recovered outcome — blocking blind retries of financial
 * operations until explicitly acknowledged.
 */
type LighterRecoveredDispatch = {
  /** Stable identity for selective acknowledgment. */
  recoveryId: string;
  kind: number;
  intent: string;
  txHash: string | null;
  /**
   * Authoritative outcome: 'succeeded' (exact-hash lookup, venue status
   * executed), 'failed' (exact-hash lookup, venue status failed/rejected
   * — retry-safe, non-blocking), 'unknown' (only the nonce advance is
   * proven, e.g. another device moved the nonce; the intent's own fate
   * is NOT known and must never be reported as completed).
   */
  outcome: 'succeeded' | 'failed' | 'unknown';
  /** What proved the outcome (e.g. 'tx-status:2', 'rest-advance'). */
  evidence: string;
};

type LighterNonceLedgerDoc = {
  consumedFloor: number;
  entries: {
    nonce: number;
    txHash: string | null;
    expiresAt: number | null;
    kind: number;
    intent: string;
    /**
     * Operation that owns reconciliation of this dispatch (a TP/SL
     * journal's operationId). Owned dispatches resolve through their
     * own state machine and are NEVER quarantined into the generic
     * recovered list — that would deadlock the machine behind an
     * acknowledgment it cannot give.
     */
    owner: string | null;
  }[];
  recovered: LighterRecoveredDispatch[];
};

/**
 * Validate persisted replacement groups retained across signer changes.
 *
 * @param value - Persisted groups.
 * @returns Whether every group contains valid Lighter client order IDs.
 */
const isRecoveryGroups = (value: unknown): value is number[][] =>
  Array.isArray(value) &&
  value.length <= 64 &&
  value.every(
    (group) =>
      Array.isArray(group) &&
      group.length > 0 &&
      group.length <= 2 &&
      group.every(
        (id) =>
          typeof id === 'number' &&
          Number.isSafeInteger(id) &&
          id > 0 &&
          id < 2 ** 48,
      ),
  );

type TpslRecoverySuccessor = {
  version: 1;
  sourceSettlementKey: string;
  sourceOperationId: string;
  successorSettlementKey: string;
  successorOperationId: string;
  state: 'prepared' | 'pending' | 'failed' | 'settled';
  ownedOrderIds: string[];
  retainedReplacementGroups?: number[][];
};

type TpslJournalState = {
  attempts: TpslAttempt[];
  recordedAt: number;
  /**
   * IMMUTABLE identity of the operation this journal records. Clears and
   * updates are compare-and-swap on this id so a recovery pass holding a
   * STALE snapshot can never erase a newer operation's journal.
   */
  operationId: string;
  /** Exact manual source operation selected by the explicit successor. */
  sourceRecoveryOperationId?: string;
  sourceRecoverySettlementKey?: string;
  retainedReplacementGroups?: number[][];
  /** When the OPERATION began (immutable; `recordedAt` moves per write). */
  createdAt: number;
  /**
   * DURABLE monotonic attempt-id allocator: compaction removes attempts,
   * so deriving the next id from the surviving maximum could recycle an
   * identity a removed attempt already used.
   */
  nextAttemptId: number;
  /**
   * The durable OPERATION intent: a 'remove' journals only cancels and
   * must NEVER be "recovered" by restoring the cancelled protection —
   * that would silently undo an intentional removal.
   */
  intent: 'replace' | 'remove';
  /**
   * 'creating': old protection untouched (failure needs at most a
   * rollback of surviving replacement legs). 'cancelling': old cancels
   * underway/done. 'manual': the venue has NO atomic primitive that
   * could prove a restore attaches to the same position lifecycle, so a
   * fully-failed replacement after old cancels is NEVER auto-restored —
   * the journal parks durably in this state, is surfaced to callers via
   * `getPendingManualRecoveries`, and only an explicit NEW protection
   * intent from the user resolves it.
   */
  phase: 'creating' | 'cancelling' | 'manual';
  /**
   * Whether the prior set was a venue-linked auto-cancel TP+SL pair
   * (decided ONLY by the venue's own linkage fields).
   */
  priorGrouping: 'oco' | 'independent';
  priorTriggers: TpslPriorTrigger[];
};

/** Durable identities of Core-created protection, independent of position size. */
type ManagedTpslOrder = {
  clientId: string;
  orderId: string | null;
  /** Signed absolute order expiry (ms); unknown for legacy records. */
  orderExpiry?: number;
};

/**
 * DURABLE manual-recovery record, SEPARATE from the settlement journal:
 * parking releases the journal slot (so a successor protection intent
 * can run), while this warning survives until a successor intent
 * SUCCEEDS — a failed successor must never erase the warning.
 */
type TpslManualRecovery = {
  settlementKey: string;
  symbol: string;
  /** Human-readable cause of the parked state. */
  reason: string;
  priorIntent: 'replace' | 'remove';
  /** Exact wire intents of the protection that was in place before. */
  priorTriggers: TpslPriorTrigger[];
  /** Venue order ids still on the books when the state was parked. */
  survivingOrderIds: string[];
  operationId: string;
  recordedAt: number;
};

/**
 * Clock slack added to a signed payload's ExpiredAt before a not-found
 * transaction hash is declared never-landed.
 */
const LIGHTER_TX_EXPIRY_SLACK_MS = 30_000;
/** Maximum durable recovered-dispatch outcomes retained per nonce ledger. */
const LIGHTER_RECOVERED_DISPATCH_LIMIT = 32;
/** Maximum durable TP/SL manual-recovery obligations retained per network. */
const LIGHTER_TPSL_MANUAL_RECOVERY_LIMIT = 64;

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
    expiresAt = (JSON.parse(signed.txInfo ?? '') as Record<string, unknown>)
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
 * Capture each exact client's signed absolute order expiry. Transaction expiry
 * only bounds acceptance, so it cannot prove a resting order has ended.
 *
 * @param signed - Bridge signing result.
 * @param signed.txInfo - Signed single or grouped wire payload.
 * @param clientIds - Expected client identities, in journal order.
 * @returns Index-aligned absolute order expiries, in milliseconds.
 */
const requireSignedOrderExpiries = (
  signed: { txInfo?: string },
  clientIds: number[],
): number[] => {
  const invalid = (): Error =>
    new Error(
      'Lighter signing result carries no usable order expiry identity; refusing protection changes',
    );
  let payload: unknown;
  try {
    payload = JSON.parse(signed.txInfo ?? '');
  } catch {
    throw invalid();
  }
  if (typeof payload !== 'object' || payload === null) {
    throw invalid();
  }
  const wire = payload as Record<string, unknown>;
  const rows = clientIds.length === 1 ? [wire] : wire.Orders;
  if (!Array.isArray(rows) || rows.length !== clientIds.length) {
    throw invalid();
  }
  const expiries = new Map<number, number>();
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) {
      throw invalid();
    }
    const { ClientOrderIndex: clientId, OrderExpiry: orderExpiry } =
      row as Record<string, unknown>;
    if (
      typeof clientId !== 'number' ||
      !clientIds.includes(clientId) ||
      expiries.has(clientId) ||
      typeof orderExpiry !== 'number' ||
      !Number.isSafeInteger(orderExpiry) ||
      orderExpiry <= Date.now()
    ) {
      throw invalid();
    }
    expiries.set(clientId, orderExpiry);
  }
  return clientIds.map((clientId) => {
    const expiry = expiries.get(clientId);
    if (expiry === undefined) {
      throw invalid();
    }
    return expiry;
  });
};

/**
 * PROCESS-WIDE mutexes: venue write sections, the per-settlement journal
 * state machine, and journal/index read-modify-writes are serialized
 * across ALL provider instances in this runtime. Instance-local write
 * chains cannot protect two live providers sharing one venue account or
 * one disk cache. Completed tails are evicted to keep the map bounded.
 */
const processMutexTails = new Map<string, Promise<unknown>>();

/**
 * Run an operation atomically w.r.t. every other holder of the same key
 * in this process.
 *
 * @param key - Key to serialize on.
 * @param operation - The critical operation.
 * @returns The operation's result.
 */
const withProcessMutex = async <Result>(
  key: string,
  operation: () => Promise<Result>,
): Promise<Result> => {
  const tail = processMutexTails.get(key) ?? Promise.resolve();
  const run = tail.then(operation, operation);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  processMutexTails.set(key, settled);
  settled
    .then(() => {
      // Evict when no newer holder queued behind us.
      if (processMutexTails.get(key) === settled) {
        processMutexTails.delete(key);
      }
    })
    .catch(() => undefined);
  return await run;
};

/**
 * Storage-scoped alias of the process mutex (kept for call-site clarity).
 *
 * @param key - Storage key to serialize on.
 * @param operation - The read-modify-write.
 * @returns The operation's result.
 */
const withStorageMutex = withProcessMutex;

/**
 * The WASM signer hosts ONE global client per bridge. These module maps
 * track which venue identity (`network:account:apiKey`) currently owns
 * each bridge's client, and give every bridge a process-unique mutex key
 * so all sign-and-dispatch sections across ALL provider instances
 * sharing a bridge are serialized and re-establish the correct client
 * before signing.
 */
/**
 * Cryptographic randomness with a bounded Math.random fallback for hosts
 * without WebCrypto. Collision-resistant ids matter here: a recycled
 * operation id could let a stale journal resolver clear a live journal.
 *
 * @param byteCount - Number of random bytes.
 * @returns The random bytes.
 */
const randomBytes = (byteCount: number): Uint8Array => {
  const bytes = new Uint8Array(byteCount);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < byteCount; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

/**
 * Two independent 24-bit random values (client order id halves).
 *
 * @returns The [high, low] pair.
 */
const randomUint24Pair = (): [number, number] => {
  const bytes = randomBytes(6);
  return [
    bytes[0] * 65_536 + bytes[1] * 256 + bytes[2],
    bytes[3] * 65_536 + bytes[4] * 256 + bytes[5],
  ];
};

/**
 * Collision-resistant id suffix (80 bits, hex).
 *
 * @returns The suffix string.
 */
const randomIdSuffix = (): string =>
  Array.from(randomBytes(10), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');

const bridgeClientOwners = new WeakMap<object, string>();
const bridgeIds = new WeakMap<object, number>();
let nextBridgeId = 1;

/**
 * Process-unique mutex key for a bridge instance.
 *
 * @param bridge - The signer bridge.
 * @returns The mutex key.
 */
const bridgeMutexKey = (bridge: object): string => {
  let id = bridgeIds.get(bridge);
  if (id === undefined) {
    id = nextBridgeId;
    nextBridgeId += 1;
    bridgeIds.set(bridge, id);
  }
  return `lighterBridge:${id}`;
};

/**
 * Parse a journal-pointer document, or null when the content is not a
 * pointer (legacy inline journal or corrupt data — both handled by the
 * caller's payload validation path).
 *
 * @param raw - Raw base-key content.
 * @returns The pointer, or null.
 */
const parseTpslJournalPointer = (
  raw: string,
): { operationId: string } | null => {
  try {
    const parsed = JSON.parse(raw) as {
      pointerVersion?: unknown;
      operationId?: unknown;
    };
    if (
      parsed.pointerVersion === 1 &&
      typeof parsed.operationId === 'string' &&
      parsed.operationId.length >= 1 &&
      parsed.operationId.length <= 64
    ) {
      return { operationId: parsed.operationId };
    }
  } catch {
    // Not JSON: not a pointer.
  }
  return null;
};

/**
 * Best-effort dispatch identity from a bridge signing result. The pinned
 * WASM contract (web-wasm light_client.go) returns `{txHash, txInfo}`
 * where txInfo is the marshaled wire payload — it carries Nonce and
 * ExpiredAt but NEVER the hash. Non-throwing: ops whose signers omit a
 * field dispatch with a partial identity (resolvable only by REST
 * advance, never by expiry).
 *
 * @param signed - Bridge signing result.
 * @param signed.txHash - Signed transaction hash from the RESULT.
 * @param signed.txInfo - Marshaled wire payload.
 * @returns The dispatch identity (null fields when unavailable).
 */
const extractDispatchIdentity = (signed: {
  txHash?: unknown;
  txInfo?: string;
}): { txHash: string | null; expiresAt: number | null } => {
  const txHash =
    typeof signed.txHash === 'string' &&
    /^(0x)?[0-9a-fA-F]{8,128}$/u.test(signed.txHash)
      ? signed.txHash
      : null;
  let expiresAt: number | null = null;
  try {
    const wire = JSON.parse(signed.txInfo ?? '') as Record<string, unknown>;
    expiresAt =
      typeof wire.ExpiredAt === 'number' &&
      Number.isSafeInteger(wire.ExpiredAt) &&
      wire.ExpiredAt > 0
        ? wire.ExpiredAt
        : null;
  } catch {
    expiresAt = null;
  }
  return { txHash, expiresAt };
};

/**
 * Allocate the next unique attempt identity from the journal's DURABLE
 * monotonic counter (compaction can therefore never recycle an id).
 *
 * @param journal - The journal being appended to.
 * @returns The allocated attempt id.
 */
const nextAttemptIdFor = (journal: TpslJournalState): number => {
  const allocated = journal.nextAttemptId;
  journal.nextAttemptId += 1;
  return allocated;
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
 * Map a RAW venue trigger row to its durable prior wire intent, or null
 * when it cannot be faithfully restored: unknown type/TIF/expiry, a
 * MISSING trigger price (never substituted — that would change the
 * user's protection semantics), a malformed/non-positive decimal, or a
 * value that cannot be integerized onto the wire (range/sub-tick). The
 * writer must never persist state the loader (or the signer) would
 * later reject. A mutation that would cancel such a row must fail
 * closed BEFORE any cancel.
 *
 * @param raw - Raw venue order row.
 * @param market - Market integerization parameters.
 * @param market.supportedSizeDecimals - Size integerization decimals.
 * @param market.supportedPriceDecimals - Price integerization decimals.
 * @returns The exact prior wire intent, or null when unmappable.
 */
const mapRawTriggerToPriorIntent = (
  raw: LighterApiOrder,
  market: {
    supportedSizeDecimals: number;
    supportedPriceDecimals: number;
  },
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
    raw.orderExpiry < -1 ||
    !/^\d{1,20}$/u.test(String(raw.orderIndex)) ||
    // A trigger's trigger price is REQUIRED verbatim.
    typeof raw.triggerPrice !== 'string'
  ) {
    return null;
  }
  const price = parseStrictDecimal(raw.price);
  const triggerPrice = parseStrictDecimal(raw.triggerPrice);
  const remainingSize = parseStrictDecimal(raw.remainingBaseAmount);
  if (
    price === null ||
    !Number.isFinite(price) ||
    price <= 0 ||
    triggerPrice === null ||
    !Number.isFinite(triggerPrice) ||
    triggerPrice <= 0 ||
    remainingSize === null ||
    !Number.isFinite(remainingSize) ||
    remainingSize <= 0
  ) {
    return null;
  }
  // Wire PREFLIGHT: integerize exactly what a restore would sign. A
  // range/sub-tick failure here refuses the whole mutation up front.
  try {
    toSignerWireInteger(remainingSize, market.supportedSizeDecimals);
    toSignerWirePriceInteger(price, market.supportedPriceDecimals);
    toSignerWirePriceInteger(triggerPrice, market.supportedPriceDecimals);
  } catch {
    return null;
  }
  return {
    orderId: String(raw.orderIndex),
    side: raw.isAsk ? 'sell' : 'buy',
    wireOrderType,
    wireTimeInForce,
    orderExpiry: raw.orderExpiry,
    price: raw.price,
    triggerPrice: raw.triggerPrice,
    remainingSize: raw.remainingBaseAmount,
  };
};

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
 * reference price, either a live price or a trigger level. Shared by placement and both validators so wire-range
 * checks always inspect the exact value the signer receives.
 *
 * @param referencePrice - Fresh venue price or validated trigger level.
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
const LIGHTER_TRIGGER_WIRE_TYPES: Readonly<Record<TriggerOrderType, number>> =
  Object.freeze({
    stop_market: LIGHTER_ORDER_TYPE_STOP_LOSS,
    stop_limit: LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
    take_profit_market: LIGHTER_ORDER_TYPE_TAKE_PROFIT,
    take_profit_limit: LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
  });

/**
 * Refuse trigger fields that the native standalone transaction cannot carry.
 *
 * @param params - Caller order intent.
 * @returns A validation error, or null when the shape is supported.
 */
const getLighterTriggerIntentError = (params: OrderParams): string | null => {
  if (!isTriggerOrderType(params.orderType)) {
    return params.triggerPrice === undefined
      ? null
      : PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED;
  }
  if (params.timeInForce !== undefined) {
    return PERPS_ERROR_CODES.ORDER_TIME_IN_FORCE_NOT_SUPPORTED;
  }
  if (
    params.takeProfitPrice !== undefined ||
    params.stopLossPrice !== undefined
  ) {
    return PERPS_ERROR_CODES.ORDER_TRIGGER_TPSL_UNSUPPORTED;
  }
  const unsupportedFields = [
    'takeProfitSize',
    'stopLossSize',
    'tpslLinkage',
    'grouping',
    'clientOrderId',
    'twapDuration',
    'twapRandomize',
    'scaleMinPrice',
    'scaleMaxPrice',
    'scaleNumOrders',
    'scaleSkew',
    'chaseIntervalMs',
    'chaseMaxDurationMs',
    'chaseMaxRepricings',
    'chaseMaxDistanceBps',
  ] as const satisfies readonly (keyof OrderParams)[];
  const unsupported = unsupportedFields.find(
    (field) => params[field] !== undefined,
  );
  return unsupported
    ? `Lighter standalone triggers do not support ${unsupported}`
    : null;
};

/**
 * Resolve the native trigger prices before any signer or account mutation.
 *
 * @param params - Standalone trigger intent.
 * @param market - Venue price precision.
 * @returns Sizing reference, execution protection and the exact trigger wire value.
 */
const resolveLighterTriggerPrices = (
  params: OrderParams,
  market: LighterOrderBookMeta,
): {
  referencePrice: number;
  executionPrice: number;
  triggerPriceInt: number;
} => {
  if (params.triggerPrice === undefined || params.triggerPrice === '') {
    throw new Error(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
  }
  const triggerPrice = parseFinitePositive(params.triggerPrice);
  if (triggerPrice === null) {
    throw new Error(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE);
  }
  const triggerPriceInt = toSignerWirePriceInteger(
    triggerPrice,
    market.supportedPriceDecimals,
  );
  if (
    fromLighterInteger(triggerPriceInt, market.supportedPriceDecimals) !==
    triggerPrice
  ) {
    throw new Error('Trigger price does not align with the Lighter price grid');
  }
  if (isLimitExecutionOrderType(params.orderType)) {
    const price = parseFinitePositive(params.price ?? '');
    if (price === null) {
      throw new Error(
        `Invalid limit price ${params.price}: must be a positive number`,
      );
    }
    return { referencePrice: price, executionPrice: price, triggerPriceInt };
  }
  const slippageFraction =
    params.maxSlippageBps === undefined
      ? (params.slippage ?? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000)
      : params.maxSlippageBps / 10_000;
  if (
    !Number.isFinite(slippageFraction) ||
    slippageFraction < 0 ||
    slippageFraction >= 1
  ) {
    throw new Error(
      `Invalid slippage tolerance ${slippageFraction * 10_000} bps: must be at least 0 and below 10000`,
    );
  }
  return {
    referencePrice: triggerPrice,
    executionPrice: deriveLighterExecutionPrice(
      triggerPrice,
      params.isBuy,
      slippageFraction,
    ),
    triggerPriceInt,
  };
};

/** A definitive venue response that the selected wallet has no account. */
class LighterAccountNotFoundError extends Error {
  constructor(address: string) {
    super(
      `No Lighter account exists for ${address}; fund it via the bridge (or the testnet faucet) first`,
    );
    this.name = 'LighterAccountNotFoundError';
  }
}

/**
 * Session-bound work stopped because the provider disconnected or the wallet
 * switched accounts while it ran.
 */
class LighterSessionCancelledError extends Error {
  constructor(reason: string) {
    super(`Operation cancelled: ${reason}`);
    this.name = 'LighterSessionCancelledError';
  }
}

// EIP-1193 `userRejectedRequest` error code.
const USER_REJECTED_REQUEST_CODE = 4001;

// How wallets word a declined signature when they set no code (the same
// wordings the controller's deposit flow treats as a cancellation).
const USER_REJECTED_MESSAGE_PATTERN = /user (rejected|denied|cancell?ed)/iu;

/**
 * Whether the user declined the venue-key signature; the order path asks
 * again.
 *
 * @param error - The caught error.
 * @returns True for a declined signature.
 */
const isDeclinedRegistration = (error: unknown): boolean =>
  hasErrorInCauseChain(
    error,
    (current) =>
      (current as { code?: unknown }).code === USER_REJECTED_REQUEST_CODE ||
      USER_REJECTED_MESSAGE_PATTERN.test(current.message),
  );

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

  #signerResetUnsubscribe: (() => void) | null = null;

  readonly #isTestnet: boolean;

  #apiKeyIndex: number;

  readonly #preferredApiKeyIndex: number;

  readonly #configuredAccountIndex: number | undefined;

  /** Markets cache keyed by symbol (freshness delegated to client service). */
  #marketsBySymbol: Map<string, LighterOrderBookMeta> = new Map();

  #marketsById: Map<number, LighterOrderBookMeta> = new Map();

  /** Resolved Lighter account index (after ensureAccount()). */
  #accountIndex: number | null = null;

  /** L1 address the current venue session (index/signer/auth) is bound to. */
  #boundAddress: string | null = null;

  /** Terminal lifecycle fence set by disconnect(). */
  #isDisconnected = false;

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

  #hasOrdersSnapshot = false;

  /** Last validated fill history for this wallet session, including empty. */
  #wsFills: OrderFill[] | null = null;

  readonly #oiCapSubscribers: Set<SubscribeOICapsParams> = new Set();

  readonly #accountSubscribers: Set<SubscribeAccountParams> = new Set();

  readonly #positionSubscribers: Set<SubscribePositionsParams> = new Set();

  readonly #orderSubscribers: Set<SubscribeOrdersParams> = new Set();

  readonly #fillSubscribers: Set<SubscribeOrderFillsParams> = new Set();

  /** Order-book subscribers keyed by market id. */
  readonly #orderBookSubscribers: Map<number, Set<SubscribeOrderBookParams>> =
    new Map();

  /** Live order-book level state per market (price → size). */
  readonly #orderBookState: Map<number, LighterOrderBookState> = new Map();

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

  /** Set only after key validation, registration and nonce reconciliation succeed. */
  #readyApiKeyIndex: number | null = null;

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
    this.#ensureSignerResetListener();
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
    this.#preferredApiKeyIndex = this.#apiKeyIndex;
    this.#configuredAccountIndex = options.lighterAuthConfig?.accountIndex;

    this.#clientService = new LighterClientService(this.#deps, {
      isTestnet: this.#isTestnet,
    });
    this.#walletService = new LighterWalletService(this.#deps, {
      isTestnet: this.#isTestnet,
      messenger: options.messenger,
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
      if (this.#isDisconnected) {
        return { success: false, error: 'Lighter provider is disconnected' };
      }
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
    this.#isDisconnected = true;
    this.#invalidateSessionState();
    this.#removeSignerResetListener();
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
    // Network is fixed at construction.
    return {
      success: false,
      isTestnet: this.#isTestnet,
      error: 'Lighter network is fixed at construction',
    };
  }

  /**
   * Register the venue key ahead of the first order, so its main-account
   * `personal_sign` happens in a guided session. A read-only provider (no
   * signer bridge) has nothing to prepare and resolves `ready: true` while an
   * account is selected and the main-account signer is ready.
   *
   * @returns The readiness result described on
   * `PerpsController.prepareTradingWallet`.
   */
  async prepareTradingWallet(): Promise<ReadyToTradeResult> {
    if (!this.#walletService.isMainAccountSignerReady()) {
      return { ready: false, error: PERPS_ERROR_CODES.KEYRING_LOCKED };
    }
    try {
      this.#walletService.getUserAddress();
    } catch {
      return { ready: false, error: PERPS_ERROR_CODES.NO_ACCOUNT_SELECTED };
    }
    if (!this.#signerBridge) {
      return { ready: true };
    }
    try {
      await this.#ensureSignerReady();
      // The signer can lock while the venue key is being registered.
      if (!this.#walletService.isMainAccountSignerReady()) {
        return { ready: false, error: PERPS_ERROR_CODES.KEYRING_LOCKED };
      }
      return { ready: true };
    } catch (caughtError) {
      // A locked signer, or one that locked while registration ran.
      if (
        isKeyringLockedError(caughtError) ||
        !this.#walletService.isMainAccountSignerReady()
      ) {
        return { ready: false, error: PERPS_ERROR_CODES.KEYRING_LOCKED };
      }
      if (isDeclinedRegistration(caughtError)) {
        return { ready: false };
      }
      // Nothing can be registered before the wallet has a Lighter account.
      if (caughtError instanceof LighterAccountNotFoundError) {
        return {
          ready: false,
          error: PERPS_ERROR_CODES.EXCHANGE_ACCOUNT_NOT_FOUND,
        };
      }
      // The session moved on while registering; the next preparation
      // starts over for the current account.
      if (caughtError instanceof LighterSessionCancelledError) {
        this.#deps.debugLogger.log(
          '[prepareTradingWallet] Session changed during preparation',
          { reason: caughtError.message },
        );
        return {
          ready: false,
          error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        };
      }
      const error = ensureError(
        caughtError,
        'LighterProvider.prepareTradingWallet',
      );
      this.#deps.logger.error(
        error,
        this.#getErrorContext('prepareTradingWallet'),
      );
      return { ready: false, error: error.message };
    }
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

  /**
   * The RAW bridge instance — the STABLE identity object for the
   * process-wide ownership map and mutex key. The `#getSignerBridge`
   * wrapper below is a fresh object per call and must NEVER key either.
   *
   * @returns The raw signer bridge.
   */
  readonly #rawSignerBridge = (): LighterSignerBridge => {
    if (!this.#signerBridge) {
      throw new Error(LIGHTER_SIGNER_UNAVAILABLE_ERROR);
    }
    return this.#signerBridge;
  };

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
      getRecoverableKeyIndices: bridge.getRecoverableKeyIndices?.bind(bridge),
      getStoredKeyIndices: bridge.getStoredKeyIndices?.bind(bridge),
      createClient: async (params): Promise<LighterCreateClientResult> => {
        try {
          const result = await bridge.createClient(params);
          if (result.error) {
            this.#invalidateSignerSession();
          }
          return result;
        } catch (error) {
          this.#invalidateSignerSession();
          throw error;
        }
      },
      execute: async <Operation extends LighterSignerOperation>(
        call: LighterWasmCall<Operation>,
      ): Promise<LighterSignerResult<Operation>> => {
        const lostClientPattern =
          /client is not created|WebView reloaded|signer not ready|executor not connected|timed out/iu;
        try {
          const result = await bridge.execute(call);
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
    this.#readyApiKeyIndex = null;
    this.#authToken = null;
    this.#clearBridgeOwnership();
    this.#deps.debugLogger.log(
      '[LighterProvider] signer session invalidated (client lost); will re-setup on next call',
    );
  };

  /** Replace this provider's listener on the client-owned signer bridge. */
  readonly #replaceSignerResetListener = (): void => {
    this.#removeSignerResetListener();
    this.#ensureSignerResetListener();
  };

  /** Install the reset listener when the current binding has none. */
  readonly #ensureSignerResetListener = (): void => {
    if (this.#isDisconnected || this.#signerResetUnsubscribe) {
      return;
    }
    this.#signerResetUnsubscribe =
      this.#signerBridge?.onReset?.(() => this.#invalidateSignerSession()) ??
      null;
  };

  /** Remove this provider's listener when its session is retired. */
  readonly #removeSignerResetListener = (): void => {
    this.#signerResetUnsubscribe?.();
    this.#signerResetUnsubscribe = null;
  };

  /**
   * Drop ALL bridge-client ownership material for this provider: the
   * identity, the recreate params, and — when WE are the recorded owner
   * — the process-wide ownership entry, so a dead/rebound session can
   * never be mistaken for the live owner of the singleton client.
   */
  readonly #clearBridgeOwnership = (): void => {
    if (
      this.#signerBridge &&
      this.#signerIdentity !== null &&
      bridgeClientOwners.get(this.#signerBridge) === this.#signerIdentity
    ) {
      bridgeClientOwners.delete(this.#signerBridge);
    }
    this.#signerIdentity = null;
    this.#signerRecreateParams = null;
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
    if (this.#isDisconnected) {
      return;
    }
    let address: string;
    try {
      address = this.#walletService.getUserAddress().toLowerCase();
    } catch {
      if (this.#boundAddress !== null) {
        // All accounts deselected while a session existed: invalidate so
        // nothing in flight can still act for the old account.
        this.#emitAccountBindingReset();
        this.#invalidateSessionState();
        this.#removeSignerResetListener();
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
      this.#ensureSignerResetListener();
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
    this.#apiKeyIndex = this.#preferredApiKeyIndex;
    this.#signerReadyPromise = null;
    this.#readyApiKeyIndex = null;
    this.#authToken = null;
    this.#replaceSignerResetListener();
    // #tpslUnsettled is NOT cleared: entries are keyed by
    // address+accountIndex+symbol, so B never consumes A's pending ids and
    // switching back to A retains its reconciliation obligation.
    this.#emitAccountBindingReset();
    this.#teardownStream();
    this.#rebuildStreamForSubscribers();
    this.#deps.debugLogger.log(
      '[LighterProvider] session rebound to new wallet account',
    );
  };

  /** Clear subscriber-visible account data before a wallet rebind. */
  readonly #emitAccountBindingReset = (): void => {
    for (const subscriber of this.#accountSubscribers) {
      try {
        subscriber.callback(EMPTY_ACCOUNT_STATE);
      } catch (error) {
        this.#logSubscriberError('account', error);
      }
    }
    for (const subscriber of this.#positionSubscribers) {
      try {
        subscriber.callback([]);
      } catch (error) {
        this.#logSubscriberError('positions', error);
      }
    }
    this.#emitToOrderSubscribers([]);
  };

  /**
   * Re-request every channel the current subscriber registries imply.
   *
   * #teardownStream clears the wanted-channel intents; without this,
   * subscribers that outlive an account switch would sit on a fresh socket
   * subscribed to nothing.
   */
  readonly #rebuildStreamForSubscribers = (): void => {
    if (this.#isDisconnected || !this.#hasAnySubscriber()) {
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
    let response: LighterAccountsByL1AddressResponse;
    try {
      response = await this.#clientService.getAccountsByL1Address(address);
    } catch (error) {
      if (error instanceof LighterApiError && error.code === 21100) {
        throw new LighterAccountNotFoundError(address);
      }
      throw error;
    }
    // Re-run the binding so an EXTERNAL switch nothing else observed also
    // advances the generation, then compare: caching after any switch
    // would poison the new session with the old account. Retry instead.
    this.#ensureSessionBinding();
    if (generation !== this.#sessionGeneration) {
      return await this.#ensureAccountIndex();
    }
    if (!response.subAccounts?.length) {
      throw new LighterAccountNotFoundError(address);
    }
    const master = response.subAccounts.reduce((min, account) =>
      account.index < min.index ? account : min,
    );
    this.#assertStandardAccount(master.accountType);
    this.#accountIndex = master.index;
    return this.#accountIndex;
  };

  /**
   * Local account identities recorded before any venue mutation.
   *
   * @returns Storage key scoped to the selected wallet and network.
   */
  readonly #recoveryAccountsKey = (): string =>
    `lighterRecoveryAccounts:${this.#isTestnet ? 'testnet' : 'mainnet'}:${this.#boundAddress}`;

  /**
   * @returns Wallet-scoped previously verified venue accounts.
   */
  readonly #readRememberedRecoveryAccounts = async (): Promise<number[]> => {
    let raw: string | null;
    try {
      raw = await this.#deps.diskCache.getItem(this.#recoveryAccountsKey());
    } catch (error) {
      throw new Error(
        `Lighter recovery account index read failed: ${ensureError(error, 'LighterProvider.#readRememberedRecoveryAccounts').message}`,
      );
    }
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length > LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT ||
      !parsed.every(
        (index) =>
          typeof index === 'number' &&
          Number.isSafeInteger(index) &&
          index >= 0,
      ) ||
      new Set(parsed).size !== parsed.length
    ) {
      throw new Error('Lighter recovery account index is corrupt');
    }
    return parsed as number[];
  };

  /**
   * Preserve discovery of nonce-only obligations if the venue later reports absence.
   *
   * @param accountIndex - Account already verified for this wallet.
   * @param generation - Issuing session.
   */
  readonly #rememberRecoveryAccount = async (
    accountIndex: number,
    generation: number,
  ): Promise<void> => {
    const key = this.#recoveryAccountsKey();
    await withStorageMutex(key, async () => {
      this.#assertSession(generation);
      const accounts = await this.#readRememberedRecoveryAccounts();
      this.#assertSession(generation);
      if (accounts.includes(accountIndex)) {
        return;
      }
      if (accounts.length >= LIGHTER_RECOVERY_ACCOUNT_INDEX_LIMIT) {
        throw new Error(
          'Lighter recovery account index is full; refusing to hide a future obligation',
        );
      }
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify([...accounts, accountIndex]),
      );
      this.#assertSession(generation);
    });
  };

  /**
   * Resolve inventory independently of fee/trading capability. Expected absence
   * and known Premium accounts retain local obligations without venue mutation.
   * Ownership, malformed metadata, transport and storage failures still reject.
   *
   * @param generation - Issuing wallet session.
   * @returns Inventory accounts and whether current venue reconciliation is supported.
   */
  readonly #resolveRecoveryInventory = async (
    generation: number,
  ): Promise<{
    accounts: number[];
    canReconcile: boolean;
  }> => {
    const absent = async (): Promise<{
      accounts: number[];
      canReconcile: false;
    }> => {
      const [remembered, manual, journals] = await Promise.all([
        this.#readRememberedRecoveryAccounts(),
        this.#readTpslManualIndex(),
        this.#readTpslJournalIndex(),
      ]);
      this.#assertSession(generation);
      const prior = new Set(remembered);
      for (const key of [...manual, ...journals]) {
        if (!key.startsWith(`${this.#boundAddress}:`)) {
          continue;
        }
        const account = key.split(':')[1];
        const index = Number(account);
        if (
          !Number.isSafeInteger(index) ||
          index < 0 ||
          String(index) !== account
        ) {
          throw new Error(
            'Lighter recovery index contains an invalid account identity',
          );
        }
        prior.add(index);
      }
      return {
        accounts: [...prior].filter(
          (index) =>
            this.#configuredAccountIndex === undefined ||
            index === this.#configuredAccountIndex,
        ),
        canReconcile: false,
      };
    };
    if (this.#accountIndex !== null) {
      return { accounts: [this.#accountIndex], canReconcile: true };
    }
    let account: LighterAccountSummary | undefined;
    try {
      if (this.#configuredAccountIndex === undefined) {
        const response = await this.#clientService.getAccountsByL1Address(
          this.#walletService.getUserAddress(),
        );
        account = response.subAccounts.reduce<
          LighterAccountSummary | undefined
        >(
          (selected, next) =>
            selected === undefined || next.index < selected.index
              ? next
              : selected,
          undefined,
        );
      } else {
        const response = await this.#clientService.getAccountByIndex(
          this.#configuredAccountIndex,
        );
        account = response.accounts[0];
      }
    } catch (error) {
      this.#assertSession(generation);
      if (error instanceof LighterApiError && error.code === 21100) {
        return absent();
      }
      throw error;
    }
    this.#assertSession(generation);
    if (account === undefined) {
      return absent();
    }
    if (
      !Number.isSafeInteger(account.index) ||
      account.index < 0 ||
      account.l1Address.toLowerCase() !== this.#boundAddress ||
      (this.#configuredAccountIndex !== undefined &&
        account.index !== this.#configuredAccountIndex)
    ) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} recovery account is not owned by the selected wallet address`,
      );
    }
    if (account.accountType !== 0 && account.accountType !== 1) {
      throw new Error(
        `${LIGHTER_UNSUPPORTED_CAPABILITY_PREFIX} recovery account type could not be verified`,
      );
    }
    if (account.accountType === 0) {
      this.#accountIndex = account.index;
    }
    return {
      accounts: [account.index],
      canReconcile: account.accountType === 0,
    };
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
   * Whether a read error represents an explicit non-empty state.
   *
   * @param error - Caught read error.
   * @returns Whether the error must surface to the caller.
   */
  readonly #mustSurfaceReadError = (error: unknown): boolean =>
    this.#isUnsupportedCapabilityError(error) ||
    this.#isDataIntegrityError(error);

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

  /** Monotonic source for journal operation ids within this session. */
  #tpslOperationCounter = 0;

  /** This provider's bridge-client ownership identity (set at setup). */
  #signerIdentity: string | null = null;

  /**
   * Parameters to re-create OUR venue client on the shared bridge. The
   * wallet-derived seed is NEVER retained here — it is re-derived under
   * the bridge lease each time re-establishment is needed.
   */
  #signerRecreateParams: {
    chainId: number;
    accountIndex: number;
  } | null = null;

  /**
   * Durable dispatch-ledger key: every nonce-consuming submission is
   * recorded here BEFORE dispatch so a restart can never reissue a nonce
   * whose outcome is unknown, and a proven never-landed dispatch can
   * release its nonce for the venue to consume.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @returns The disk-cache key.
   */
  readonly #nonceLedgerKey = (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): string =>
    `lighterNonceLedger:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}:${apiKeyIndex}`;

  /**
   * Read and strictly validate the durable dispatch ledger. Corruption
   * fails CLOSED (writes stay blocked) — guessing at nonce state could
   * duplicate or wedge submissions.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @returns The ledger document (consumed-nonce watermark + unresolved
   * dispatch entries).
   */
  readonly #readNonceLedger = async (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<LighterNonceLedgerDoc> => {
    let raw: string | null;
    try {
      raw = await this.#deps.diskCache.getItem(
        this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      );
    } catch (error) {
      throw new Error(
        `Lighter nonce ledger read failed; refusing writes: ${ensureError(error, 'LighterProvider.#readNonceLedger').message}`,
      );
    }
    if (raw === null) {
      return { consumedFloor: 0, entries: [], recovered: [] };
    }
    try {
      const parsed = JSON.parse(raw) as {
        version?: unknown;
        consumedFloor?: unknown;
        entries?: unknown;
        recovered?: unknown;
      };
      // EXPLICIT schema evolution: earlier documents (v1 without the
      // consumed watermark, v2 without operation kind/intent) migrate in
      // place — calling valid outstanding dispatch state corrupt would
      // block writes permanently.
      const consumedFloor =
        parsed.version === 1 && parsed.consumedFloor === undefined
          ? 0
          : parsed.consumedFloor;
      if (
        (parsed.version === 1 ||
          parsed.version === 2 ||
          parsed.version === 3 ||
          parsed.version === 4) &&
        typeof consumedFloor === 'number' &&
        Number.isSafeInteger(consumedFloor) &&
        consumedFloor >= 0 &&
        Array.isArray(parsed.entries) &&
        parsed.entries.length <= 16 &&
        parsed.entries.every((entry) => {
          if (typeof entry !== 'object' || entry === null) {
            return false;
          }
          const candidate = entry as Record<string, unknown>;
          return (
            typeof candidate.nonce === 'number' &&
            Number.isSafeInteger(candidate.nonce) &&
            candidate.nonce >= 0 &&
            (candidate.txHash === null ||
              typeof candidate.txHash === 'string') &&
            (candidate.expiresAt === null ||
              (typeof candidate.expiresAt === 'number' &&
                Number.isSafeInteger(candidate.expiresAt) &&
                candidate.expiresAt > 0))
          );
        })
      ) {
        // v4 recovered outcomes are safety state: silently dropping a
        // malformed or overflow row could make a completed/unknown
        // financial intent retryable. Older schemas predate the list.
        const recoveredRaw = parsed.version === 4 ? parsed.recovered : [];
        if (
          !Array.isArray(recoveredRaw) ||
          recoveredRaw.length > LIGHTER_RECOVERED_DISPATCH_LIMIT ||
          !recoveredRaw.every((row): row is LighterRecoveredDispatch => {
            if (typeof row !== 'object' || row === null) {
              return false;
            }
            const candidate = row as Record<string, unknown>;
            return (
              typeof candidate.recoveryId === 'string' &&
              candidate.recoveryId.length >= 1 &&
              candidate.recoveryId.length <= 160 &&
              typeof candidate.kind === 'number' &&
              typeof candidate.intent === 'string' &&
              candidate.intent.length <= 200 &&
              (candidate.txHash === null ||
                typeof candidate.txHash === 'string') &&
              (candidate.outcome === 'succeeded' ||
                candidate.outcome === 'failed' ||
                candidate.outcome === 'unknown') &&
              typeof candidate.evidence === 'string'
            );
          })
        ) {
          throw new Error('Malformed recovered-dispatch safety state');
        }
        const recovered = recoveredRaw;
        return {
          consumedFloor,
          entries: (
            parsed.entries as {
              nonce: number;
              txHash: string | null;
              expiresAt: number | null;
              kind?: number;
              intent?: string;
              owner?: string | null;
            }[]
          ).map((entry) => ({
            ...entry,
            // v1-v3 migration: kind/intent/owner unknown.
            kind: typeof entry.kind === 'number' ? entry.kind : -1,
            intent: typeof entry.intent === 'string' ? entry.intent : 'unknown',
            owner: typeof entry.owner === 'string' ? entry.owner : null,
          })),
          recovered,
        };
      }
    } catch {
      // fall through to fail closed
    }
    throw new Error(
      'Lighter nonce dispatch ledger is corrupt; refusing further writes until it is resolved',
    );
  };

  /**
   * Persist the dispatch ledger document.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param doc - The ledger document.
   * @param doc.consumedFloor - Highest proven-consumed nonce + 1.
   * @param doc.entries - Unresolved dispatch entries.
   */
  readonly #writeNonceLedger = async (
    accountIndex: number,
    doc: LighterNonceLedgerDoc,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> => {
    await this.#deps.diskCache.setItem(
      this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      JSON.stringify({ version: 4, ...doc }),
    );
  };

  /**
   * Resolve one dispatch entry as CONSUMED: remove it and advance the
   * durable consumed-nonce watermark so no later (stale) reconciliation
   * can ever release the nonce back.
   *
   * @param accountIndex - Venue account index.
   * @param entry - The consumed entry.
   * @param entry.nonce - The dispatched nonce.
   * @param entry.txHash - The dispatched tx hash (or null).
   */
  /**
   * EVERY ledger read-modify-write (append, resolve, consumed-resolve,
   * selective acknowledgment) serializes on this ONE process-wide mutex
   * per account+slot document. The venue write mutex alone cannot
   * protect the document: `acknowledgeRecoveredDispatch` legitimately
   * runs OUTSIDE it, and an unserialized ack RMW could overwrite a
   * concurrent append with a stale doc — silently erasing an unresolved
   * dispatch entry. Lock order is always venueWrite → bridge → ledger
   * (the ack path takes only the ledger mutex), so no cycle exists.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param operation - The ledger RMW critical section.
   * @returns The operation's result.
   */
  readonly #withLedgerLock = async <Result>(
    accountIndex: number,
    operation: () => Promise<Result>,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<Result> =>
    await withProcessMutex(
      this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      operation,
    );

  /**
   * Append a recovered dispatch without ever sacrificing a blocking
   * succeeded/unknown outcome to bounded storage. Retry-safe failures may
   * be omitted at capacity; a blocking outcome may replace one such row.
   * If every retained row is already blocking, fail before persistence so
   * the original unresolved ledger entry remains authoritative.
   *
   * @param doc - Mutable nonce ledger document held under its mutex.
   * @param outcome - Recovered dispatch to retain when safety requires it.
   */
  readonly #appendRecoveredDispatch = (
    doc: LighterNonceLedgerDoc,
    outcome: LighterRecoveredDispatch,
  ): void => {
    if (
      doc.recovered.some(
        (candidate) => candidate.recoveryId === outcome.recoveryId,
      )
    ) {
      return;
    }
    if (doc.recovered.length < LIGHTER_RECOVERED_DISPATCH_LIMIT) {
      doc.recovered.push(outcome);
      return;
    }
    if (outcome.outcome === 'failed') {
      return;
    }
    const failedIndex = doc.recovered.findIndex(
      (candidate) => candidate.outcome === 'failed',
    );
    if (failedIndex < 0) {
      throw new Error(
        'Lighter recovered-dispatch ledger is full of unresolved blocking outcomes; refusing to discard the current dispatch',
      );
    }
    doc.recovered.splice(failedIndex, 1, outcome);
  };

  /**
   * ATOMIC post-dispatch entry transition, decided by the session fence
   * BEFORE any ledger mutation: fence passed → the entry is consumed and
   * removed (watermark advances); fence failed → the entry converts to a
   * durable recovered SUCCEEDED outcome (the venue mutation is committed
   * and a later retry under the original account would double the
   * financial intent). Both shapes land in ONE write under the ledger
   * lock — if that write fails, the ORIGINAL unresolved entry remains
   * the durable record and every retry stays blocked. The entry is never
   * consumed first and quarantined second. TP/SL-journal-owned entries
   * are consumed without quarantine in both cases (their machine
   * reconciles the intent by exact hash).
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index of the ORIGINAL session.
   * @param entry - The dispatched (accepted) ledger entry.
   * @param fenceFailed - Whether the post-send session fence rejected.
   * @returns Resolves when the transition is durably committed.
   */
  readonly #resolveEntryPostDispatch = async (
    accountIndex: number,
    entry: LighterNonceLedgerDoc['entries'][number],
    fenceFailed: boolean,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> =>
    await this.#withLedgerLock(
      accountIndex,
      async () => {
        const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
        const at = doc.entries.findIndex(
          (candidate) =>
            candidate.nonce === entry.nonce &&
            candidate.txHash === entry.txHash,
        );
        if (at >= 0) {
          doc.entries.splice(at, 1);
        }
        doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
        if (fenceFailed && entry.owner === null) {
          const recoveryId = `${String(entry.nonce)}:${entry.txHash ?? 'nohash'}`;
          this.#appendRecoveredDispatch(doc, {
            recoveryId,
            kind: entry.kind,
            intent: entry.intent,
            txHash: entry.txHash,
            outcome: 'succeeded',
            evidence: 'post-dispatch-session-cancelled',
          });
        }
        await this.#writeNonceLedger(accountIndex, doc, apiKeyIndex);
      },
      apiKeyIndex,
    );

  /**
   * Resolve every unresolved dispatch before a write section may issue
   * nonces. Consumption is proven by REST-nonce advance or an exact tx
   * lookup verifying the FULL identity (hash + account + api-key slot +
   * nonce + a numeric venue status); never-landed is proven ONLY by
   * venue-confirmed absence of the exact HASH after the signed validity
   * elapsed. A hashless dispatch can never be proven absent — it stays
   * blocking until the venue advances. Ambiguity blocks the write.
   * Runs under the account+slot ledger lock.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @returns Resolves when every prior dispatch is accounted for.
   */
  readonly #resolveNonceLedger = async (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> =>
    await this.#withLedgerLock(
      accountIndex,
      async () => this.#resolveNonceLedgerLocked(accountIndex, apiKeyIndex),
      apiKeyIndex,
    );

  /**
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param reconciliation - Non-financial pass that retains owned entries and
   * reports pending/quarantined outcomes instead of granting write permission.
   * @returns Resolves when the pass completes.
   */
  readonly #resolveNonceLedgerLocked = async (
    accountIndex: number,
    apiKeyIndex = this.#apiKeyIndex,
    reconciliation?: { generation: number },
  ): Promise<void> => {
    const generation = reconciliation?.generation ?? this.#sessionGeneration;
    this.#assertSession(generation);
    const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
    this.#assertSession(generation);
    const reservationKey = `${accountIndex}:${apiKeyIndex}`;
    const releasedNonces: number[] = [];
    const commitReservations = (): void => {
      this.#assertSession(generation);
      const floor = this.#nonceReservations.get(reservationKey) ?? 0;
      this.#nonceReservations.set(
        reservationKey,
        Math.max(floor, doc.consumedFloor),
      );
      for (const nonce of releasedNonces) {
        if (nonce >= doc.consumedFloor) {
          this.#releaseNonceReservation(accountIndex, nonce, apiKeyIndex);
        }
      }
    };
    // QUARANTINE CHECK FIRST: unacknowledged recovered outcomes block
    // EVERY retry, including retries arriving when no unresolved
    // entries remain — an early empty-entries return here would let the
    // second retry sail past the quarantine.
    const throwIfQuarantined = (): void => {
      const blocking = doc.recovered.filter(
        (outcome) => outcome.outcome !== 'failed',
      );
      if (blocking.length > 0) {
        throw new Error(
          `A previous Lighter submission believed failed actually ${blocking.some((outcome) => outcome.outcome === 'succeeded') ? 'completed' : 'landed with an UNKNOWN outcome'} (${blocking
            .map((outcome) => outcome.intent)
            .join(
              ', ',
            )}); refresh state and call acknowledgeRecoveredDispatch before retrying`,
        );
      }
    };
    if (!reconciliation) {
      throwIfQuarantined();
    }
    if (!doc.entries.some((entry) => !reconciliation || entry.owner === null)) {
      if (!reconciliation) {
        commitReservations();
      }
      return;
    }
    const quarantine = (
      entry: LighterNonceLedgerDoc['entries'][number],
      outcome: LighterRecoveredDispatch['outcome'],
      evidence: string,
    ): void => {
      // TP/SL-journal-OWNED dispatches resolve through their own state
      // machine (journal attempts + exact-hash reconciliation) — they
      // are never parked behind the generic acknowledgment.
      if (entry.owner !== null) {
        return;
      }
      this.#appendRecoveredDispatch(doc, {
        recoveryId: `${String(entry.nonce)}:${entry.txHash ?? 'nohash'}`,
        kind: entry.kind,
        intent: entry.intent,
        txHash: entry.txHash,
        outcome,
        evidence,
      });
    };
    const nonceResponse = await this.#clientService.getNextNonce(
      accountIndex,
      apiKeyIndex,
    );
    this.#assertSession(generation);
    if (!Number.isSafeInteger(nonceResponse.nonce) || nonceResponse.nonce < 0) {
      throw new Error(
        'Lighter nonce reconciliation received an invalid venue nonce',
      );
    }
    const remaining: typeof doc.entries = [];
    for (const entry of doc.entries) {
      if (reconciliation && entry.owner !== null) {
        remaining.push(entry);
        continue;
      }
      if (entry.txHash === null && nonceResponse.nonce > entry.nonce) {
        // Only the nonce ADVANCE is proven (possibly by another device):
        // the intent's own fate is UNKNOWN — never reported completed.
        doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
        quarantine(entry, 'unknown', 'rest-advance');
        continue;
      }
      if (entry.txHash !== null) {
        let lookedUp: LighterTxLookupResponse | null;
        try {
          lookedUp = await this.#clientService.getTx(entry.txHash);
        } catch {
          this.#assertSession(generation);
          // Lookup failure is AMBIGUITY, never evidence either way: the
          // entry stays and the write remains blocked.
          remaining.push(entry);
          continue;
        }
        this.#assertSession(generation);
        if (lookedUp !== null) {
          const matchesIdentity =
            typeof lookedUp.hash === 'string' &&
            lookedUp.hash.toLowerCase().replace(/^0x/u, '') ===
              entry.txHash.toLowerCase().replace(/^0x/u, '') &&
            lookedUp.accountIndex === accountIndex &&
            lookedUp.apiKeyIndex === apiKeyIndex &&
            lookedUp.nonce === entry.nonce &&
            typeof lookedUp.status === 'number';
          if (matchesIdentity) {
            const transactionOutcome = getLighterTransactionOutcome(
              lookedUp.status,
            );
            // A matching hash is not enough to prove the transaction's
            // outcome. Non-terminal statuses must retain the unresolved
            // entry so no acknowledgment can make the intent retryable
            // while the original transaction is still in flight.
            if (
              transactionOutcome !== 'failed' &&
              transactionOutcome !== 'executed'
            ) {
              remaining.push(entry);
              continue;
            }
            doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
            // The EXACT tx status decides the intent's fate: executed →
            // succeeded (blocking until acknowledged); failed/rejected →
            // retry-safe FAILURE (recorded, non-blocking); anything else
            // still pending → keep blocking as unresolved.
            if (transactionOutcome === 'failed') {
              quarantine(
                entry,
                'failed',
                `tx-status:${String(lookedUp.status)}`,
              );
            } else {
              quarantine(
                entry,
                'succeeded',
                `tx-status:${String(lookedUp.status)}`,
              );
            }
            continue;
          }
          // A DIFFERENT payload under this hash: ambiguity, fail closed.
          remaining.push(entry);
          continue;
        }
        if (nonceResponse.nonce > entry.nonce) {
          // The venue moved past this nonce while OUR exact hash is
          // absent: another dispatch (e.g. a second device) consumed it.
          // Our payload can never land now — retry-safe never-landed,
          // no quarantine; the floor advances with the venue.
          doc.consumedFloor = Math.max(doc.consumedFloor, entry.nonce + 1);
          continue;
        }
        if (
          entry.expiresAt !== null &&
          Date.now() > entry.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
        ) {
          // Venue-confirmed absent after the signed validity: PROVEN
          // never landed — the venue still expects this nonce (unless a
          // later dispatch already consumed it: consumedFloor guards).
          releasedNonces.push(entry.nonce);
          continue;
        }
      }
      // Hashless, or hash present but unexpired-and-absent: ambiguous.
      remaining.push(entry);
    }
    this.#assertSession(generation);
    await this.#writeNonceLedger(
      accountIndex,
      {
        consumedFloor: doc.consumedFloor,
        entries: remaining,
        recovered: doc.recovered,
      },
      apiKeyIndex,
    );
    this.#assertSession(generation);
    commitReservations();
    if (reconciliation) {
      return;
    }
    if (remaining.length > 0) {
      throw new Error(
        'A previous Lighter submission has an unresolved outcome; writes are blocked until it can be proven consumed or never-landed',
      );
    }
    // RECOVERED-OUTCOME quarantine: succeeded/unknown outcomes block
    // every subsequent write until selectively acknowledged (a blind
    // retry could double the financial intent). FAILED outcomes are
    // retry-safe and never block.
    throwIfQuarantined();
  };

  /**
   * List TP/SL obligations parked in DURABLE manual-recovery state: the
   * venue removed (or rejected) protection in a way that cannot be
   * safely re-established automatically. Surfaced to callers/UI; each
   * current-key entry resolves after a successful explicit TP/SL update.
   * Selected obligations can be resolved through an explicitly linked successor.
   *
   * @returns Parked manual-recovery entries.
   */
  async getPendingManualRecoveries(): Promise<
    {
      symbol: string;
      recoveryId?: string;
      providerId?: 'lighter';
      walletAddress?: string;
      network?: string;
      settlementKey: string;
      recordedAt: number;
      reason: string;
      priorIntent: 'replace' | 'remove';
      survivingOrderIds: string[];
      actionNeeded: string;
    }[]
  > {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const inventory = await this.#resolveRecoveryInventory(generation);
    const rows = await Promise.all(
      inventory.accounts.map(async (accountIndex) =>
        this.#listPendingManualRecoveries(accountIndex, generation),
      ),
    );
    this.#assertSession(generation);
    return rows.flat();
  }

  /**
   * @param accountIndex - Verified current or durably remembered account.
   * @param generation - Issuing wallet session.
   * @returns Local manual obligations scoped to that account.
   */
  readonly #listPendingManualRecoveries = async (
    accountIndex: number,
    generation: number,
  ): ReturnType<LighterProvider['getPendingManualRecoveries']> => {
    // Protection belongs to the wallet and venue account, even after its
    // trading key migrates. Network storage remains separately scoped.
    const identityPrefix = `${this.#boundAddress ?? 'unbound'}:${accountIndex}:`;
    const currentSlotPrefix =
      this.#readyApiKeyIndex === null
        ? null
        : `${identityPrefix}${this.#readyApiKeyIndex}:`;
    const pending: {
      symbol: string;
      recoveryId?: string;
      providerId?: 'lighter';
      walletAddress?: string;
      network?: string;
      settlementKey: string;
      recordedAt: number;
      reason: string;
      priorIntent: 'replace' | 'remove';
      survivingOrderIds: string[];
      actionNeeded: string;
    }[] = [];
    const actionNeeded = (settlementKey: string): string => {
      if (currentSlotPrefix === null) {
        return 'Initialize the wallet trading key and review the position and recorded TP/SL orders. Select the obligation to reconcile its original submissions before requesting new protection';
      }
      if (settlementKey.startsWith(currentSlotPrefix)) {
        return 'Review the position and submit a new explicit TP/SL update for this symbol to re-establish protection';
      }
      return 'Review the position and recorded orders from the previous trading key in Lighter. An ordinary current-key TP/SL update does not clear this obligation; select its recovery action to reconcile the original submissions and request new protection';
    };
    // Storage errors PROPAGATE — a corrupt index degrading to "nothing
    // pending" would hide a naked position.
    const manualIndex = await this.#readTpslManualIndex();
    for (const settlementKey of manualIndex) {
      if (!settlementKey.startsWith(identityPrefix)) {
        continue;
      }
      const doc = await this.#loadTpslManualRecovery(settlementKey);
      if (doc) {
        pending.push({
          providerId: 'lighter',
          walletAddress: this.#boundAddress ?? undefined,
          network: this.#isTestnet ? 'testnet' : 'mainnet',
          symbol: doc.symbol,
          recoveryId: this.#protectionRecoveryId(
            settlementKey,
            doc.operationId,
          ),
          settlementKey,
          recordedAt: doc.recordedAt,
          reason: doc.reason,
          priorIntent: doc.priorIntent,
          survivingOrderIds: doc.survivingOrderIds,
          actionNeeded: actionNeeded(settlementKey),
        });
      }
    }
    // Legacy: journals parked 'manual' in the journal slot by an earlier
    // version (migrated to the doc on the next settle pass).
    const journalIndex = await this.#readTpslJournalIndex();
    for (const settlementKey of journalIndex) {
      if (
        !settlementKey.startsWith(identityPrefix) ||
        pending.some((entry) => entry.settlementKey === settlementKey)
      ) {
        continue;
      }
      const journal = await this.#loadTpslJournal(settlementKey);
      if (
        journal?.sourceRecoverySettlementKey &&
        journal.sourceRecoveryOperationId &&
        pending.some(
          (entry) =>
            entry.recoveryId ===
            this.#protectionRecoveryId(
              journal.sourceRecoverySettlementKey as string,
              journal.sourceRecoveryOperationId as string,
            ),
        )
      ) {
        continue;
      }
      if (
        journal &&
        (journal.phase === 'manual' ||
          currentSlotPrefix === null ||
          !settlementKey.startsWith(currentSlotPrefix))
      ) {
        let reason =
          'An unfinished TP/SL update from a previous trading key requires reconciliation';
        if (journal.phase === 'manual') {
          reason =
            'TP/SL protection could not be safely re-established automatically (parked by an earlier session)';
        } else if (currentSlotPrefix === null) {
          reason = 'An unfinished TP/SL update requires startup reconciliation';
        }
        pending.push({
          providerId: 'lighter',
          walletAddress: this.#boundAddress ?? undefined,
          network: this.#isTestnet ? 'testnet' : 'mainnet',
          symbol: settlementKey.split(':').slice(3).join(':'),
          recoveryId: this.#protectionRecoveryId(
            settlementKey,
            journal.operationId,
          ),
          settlementKey,
          recordedAt: journal.recordedAt,
          reason,
          priorIntent: journal.intent,
          survivingOrderIds: [],
          actionNeeded: actionNeeded(settlementKey),
        });
      }
    }
    this.#assertSession(generation);
    return pending;
  };

  /**
   * Read local durable outcomes across the bounded trading-slot range without
   * changing ledgers or registering/signing with previous keys. Corruption
   * fails closed instead of presenting an incomplete account as empty.
   *
   * @param accountIndex - Captured venue account.
   * @param generation - Wallet session owning the read.
   * @returns Slot-labelled local ledger documents.
   */
  readonly #readAccountRecoveryLedgers = async (
    accountIndex: number,
    generation: number,
  ): Promise<{ apiKeyIndex: number; doc: LighterNonceLedgerDoc }[]> => {
    const ledgers: { apiKeyIndex: number; doc: LighterNonceLedgerDoc }[] = [];
    for (
      let apiKeyIndex = LIGHTER_MIN_TRADING_API_KEY_INDEX;
      apiKeyIndex <= LIGHTER_MAX_TRADING_API_KEY_INDEX;
      apiKeyIndex += 1
    ) {
      this.#assertSession(generation);
      const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
      this.#assertSession(generation);
      if (doc.recovered.length > 0 || doc.entries.length > 0) {
        ledgers.push({ apiKeyIndex, doc });
      }
    }
    return ledgers;
  };

  /**
   * Read-only account-wide view of durable recovered outcomes, including keys
   * skipped during discovery. Waits for an in-flight setup but remains usable
   * after setup failure and before initialization. Opaque IDs bind the selected
   * wallet, network, account, key slot and original ledger identity. No signing,
   * nonce reconciliation, quarantine clearing or financial retry occurs.
   * Unresolved raw entries are reported separately as unknown with
   * acknowledgeable:false, including current-session in-flight submissions.
   * Listing is read-only and starts no background reconciliation. A later
   * fenced financial action re-checks authoritative state before any dispatch.
   *
   * @returns Pending outcomes labelled with their original trading-key slot.
   */
  async getRecoveredDispatches(): Promise<
    (PerpsRecoveredDispatch & { apiKeyIndex: number })[]
  > {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const inventory = await this.#resolveRecoveryInventory(generation);
    const rows = await Promise.all(
      inventory.accounts.map(async (accountIndex) =>
        this.#listRecoveredDispatches(accountIndex, generation),
      ),
    );
    this.#assertSession(generation);
    return rows.flat();
  }

  /**
   * Format a fenced local view for the already captured account.
   *
   * @param accountIndex - Captured venue account.
   * @param generation - Captured wallet session.
   * @returns Scoped pending and recovered dispatches.
   */
  readonly #listRecoveredDispatches = async (
    accountIndex: number,
    generation: number,
  ): Promise<(PerpsRecoveredDispatch & { apiKeyIndex: number })[]> => {
    const ledgers = await this.#readAccountRecoveryLedgers(
      accountIndex,
      generation,
    );
    this.#assertSession(generation);
    return ledgers.flatMap(({ apiKeyIndex, doc }) => [
      ...doc.recovered.map((outcome) => ({
        ...outcome,
        providerId: 'lighter' as const,
        walletAddress: this.#boundAddress ?? undefined,
        network: this.#isTestnet ? 'testnet' : 'mainnet',
        apiKeyIndex,
        recoveryId: `lighter:${JSON.stringify([this.#isTestnet ? 'testnet' : 'mainnet', this.#boundAddress, accountIndex, apiKeyIndex, outcome.recoveryId])}`,
      })),
      ...doc.entries.map((entry) => ({
        providerId: 'lighter' as const,
        walletAddress: this.#boundAddress ?? undefined,
        network: this.#isTestnet ? 'testnet' : 'mainnet',
        recoveryId: `lighter-pending:${JSON.stringify([this.#isTestnet ? 'testnet' : 'mainnet', this.#boundAddress, accountIndex, apiKeyIndex, entry.nonce, entry.txHash])}`,
        apiKeyIndex,
        acknowledgeable: false,
        kind: entry.kind,
        intent: entry.intent,
        txHash: entry.txHash,
        outcome: 'unknown' as const,
        evidence: 'unresolved-dispatch',
      })),
    ]);
  };

  /**
   * Reconcile owner-null dispatches using unauthenticated venue nonce/hash reads
   * and local persistence. This never initializes a signer, signs, submits,
   * acknowledges outcomes or starts TP/SL recovery. Owned entries remain pending.
   * Existing quarantine and ambiguous slots do not prevent inspection of others.
   * A removed pending row can mean proven absence, not successful execution.
   * Replace the caller's view with these newly scoped IDs after every pass.
   *
   * @returns Current account-wide pending and recovered dispatches.
   */
  async reconcileRecoveredDispatches(): Promise<PerpsRecoveredDispatch[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    this.#assertSession(generation);
    const network = this.#isTestnet ? 'testnet' : 'mainnet';
    const inventory = await this.#resolveRecoveryInventory(generation);
    if (!inventory.canReconcile) {
      const rows = await Promise.all(
        inventory.accounts.map(async (index) =>
          this.#listRecoveredDispatches(index, generation),
        ),
      );
      this.#assertSession(generation);
      return rows.flat();
    }
    const [accountIndex] = inventory.accounts;
    if (accountIndex === undefined) {
      throw new Error('Lighter recovery account identity is missing');
    }
    this.#assertSession(generation);
    const result = await withProcessMutex(
      `lighterVenueWrite:${network}:${accountIndex}`,
      async () => {
        this.#assertSession(generation);
        for (
          let apiKeyIndex = LIGHTER_MIN_TRADING_API_KEY_INDEX;
          apiKeyIndex <= LIGHTER_MAX_TRADING_API_KEY_INDEX;
          apiKeyIndex += 1
        ) {
          await this.#withLedgerLock(
            accountIndex,
            async () => {
              this.#assertSession(generation);
              await this.#resolveNonceLedgerLocked(accountIndex, apiKeyIndex, {
                generation,
              });
              this.#assertSession(generation);
            },
            apiKeyIndex,
          );
          this.#assertSession(generation);
        }
        const rows = await this.#listRecoveredDispatches(
          accountIndex,
          generation,
        );
        this.#assertSession(generation);
        return rows;
      },
    );
    this.#assertSession(generation);
    return result;
  }

  /**
   * Bind the opaque source ID to the exact durable operation and venue scope.
   *
   * @param settlementKey - Original wallet/account/slot/symbol identity.
   * @param operationId - Immutable source operation.
   * @returns Public opaque selection reference.
   */
  readonly #protectionRecoveryId = (
    settlementKey: string,
    operationId: string,
  ): string => {
    const [address, account, slot, ...symbolParts] = settlementKey.split(':');
    const symbol = symbolParts.join(':');
    return `lighter-protection:${JSON.stringify([this.#isTestnet ? 'testnet' : 'mainnet', address, Number(account), Number(slot), symbol, operationId])}`;
  };

  readonly #recoverySuccessorKey = (
    settlementKey: string,
    operationId: string,
  ): string =>
    `lighterTpslSuccessor:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}:${operationId}`;

  readonly #loadRecoverySuccessor = async (
    settlementKey: string,
    operationId: string,
  ): Promise<TpslRecoverySuccessor | null> => {
    const raw = await this.#deps.diskCache.getItem(
      this.#recoverySuccessorKey(settlementKey, operationId),
    );
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid Lighter recovery successor record');
    }
    const doc = parsed as Record<string, unknown>;
    if (
      doc.version !== 1 ||
      doc.sourceSettlementKey !== settlementKey ||
      doc.sourceOperationId !== operationId ||
      typeof doc.successorSettlementKey !== 'string' ||
      typeof doc.successorOperationId !== 'string' ||
      !['prepared', 'pending', 'failed', 'settled'].includes(
        String(doc.state),
      ) ||
      (doc.retainedReplacementGroups !== undefined &&
        !isRecoveryGroups(doc.retainedReplacementGroups)) ||
      !Array.isArray(doc.ownedOrderIds) ||
      !doc.ownedOrderIds.every((id) => typeof id === 'string')
    ) {
      throw new Error('Invalid Lighter recovery successor identity');
    }
    return parsed as TpslRecoverySuccessor;
  };

  readonly #persistRecoverySuccessor = async (
    doc: TpslRecoverySuccessor,
    generation: number,
  ): Promise<void> => {
    this.#assertSession(generation);
    await this.#deps.diskCache.setItem(
      this.#recoverySuccessorKey(
        doc.sourceSettlementKey,
        doc.sourceOperationId,
      ),
      JSON.stringify(doc),
    );
    this.#assertSession(generation);
  };

  readonly #assertRecoverySource = async (
    journal: TpslJournalState,
    generation: number,
  ): Promise<void> => {
    this.#assertSession(generation);
    if (
      !journal.sourceRecoveryOperationId ||
      !journal.sourceRecoverySettlementKey
    ) {
      return;
    }
    const source = await this.#loadTpslManualRecovery(
      journal.sourceRecoverySettlementKey,
    );
    this.#assertSession(generation);
    if (source?.operationId !== journal.sourceRecoveryOperationId) {
      throw new Error('Lighter recovery source operation changed');
    }
  };

  // Caller holds the venue lock. Terminal persistence is the authority for
  // cleanup, never permission to repeat a financial intent.
  readonly #finalizeRecoverySuccessor = async (
    doc: TpslRecoverySuccessor,
    generation: number,
  ): Promise<void> => {
    this.#assertSession(generation);
    if (doc.state !== 'settled') {
      throw new Error('Lighter successor is not settled');
    }
    const journal = await this.#loadTpslJournal(doc.successorSettlementKey);
    this.#assertSession(generation);
    if (journal?.operationId === doc.successorOperationId) {
      if (
        journal.sourceRecoveryOperationId !== doc.sourceOperationId ||
        journal.sourceRecoverySettlementKey !== doc.sourceSettlementKey
      ) {
        throw new Error('Lighter terminal successor link changed');
      }
      await this.#clearTpslJournal(
        doc.successorSettlementKey,
        doc.successorOperationId,
      );
      this.#assertSession(generation);
    } else if (journal === null) {
      // Prune a pointer whose payload was already removed at the crash boundary.
      await this.#clearTpslJournal(doc.successorSettlementKey, null);
      this.#assertSession(generation);
    }
    const source = await this.#loadTpslManualRecovery(doc.sourceSettlementKey);
    this.#assertSession(generation);
    if (source === null || source.operationId === doc.sourceOperationId) {
      await this.#clearTpslManualRecovery(
        doc.sourceSettlementKey,
        doc.sourceOperationId,
        generation,
      );
    }
  };

  readonly #verifyRetainedRecoveryCoverage = async (
    journal: TpslJournalState,
    readActive: () => Promise<LighterApiOrder[]>,
    readInactive: (ids: number[]) => Promise<LighterApiOrder[]>,
  ): Promise<void> => {
    const generation = this.#sessionGeneration;
    const groups = journal.retainedReplacementGroups;
    if (!groups || groups.length === 0) {
      return;
    }
    const visible = await this.#awaitTpslVisibility(
      readActive,
      readInactive,
      { createdClientIds: groups.flat(), cancelledOrderIds: [] },
      { createdGroups: groups },
    );
    if (visible.outcome === 'created-terminal-failed') {
      const active = await readActive();
      this.#assertSession(generation);
      await this.#finishRecoverySuccessor(
        journal,
        'failed',
        active,
        generation,
      );
      const sourceKey = journal.sourceRecoverySettlementKey;
      const sourceOperation = journal.sourceRecoveryOperationId;
      if (!sourceKey || !sourceOperation) {
        throw new Error('Lighter retained successor source link is missing');
      }
      const failed = await this.#loadRecoverySuccessor(
        sourceKey,
        sourceOperation,
      );
      this.#assertSession(generation);
      if (
        !failed ||
        failed.successorOperationId !== journal.operationId ||
        failed.state !== 'failed'
      ) {
        throw new Error('Lighter retained successor operation changed');
      }
      await this.#clearTpslJournal(
        failed.successorSettlementKey,
        journal.operationId,
        active,
      );
      this.#assertSession(generation);
      throw new Error(
        'Lighter retained successor coverage failed; select a new protection intent',
      );
    }
    if (visible.outcome !== 'settled') {
      throw new Error('Lighter retained successor coverage is not settled');
    }
  };

  readonly #finishRecoverySuccessor = async (
    journal: TpslJournalState,
    state: 'failed' | 'settled',
    active: LighterApiOrder[],
    generation: number,
  ): Promise<void> => {
    if (
      journal.sourceRecoveryOperationId === undefined ||
      journal.sourceRecoverySettlementKey === undefined
    ) {
      return;
    }
    this.#assertSession(generation);
    const doc = await this.#loadRecoverySuccessor(
      journal.sourceRecoverySettlementKey,
      journal.sourceRecoveryOperationId,
    );
    this.#assertSession(generation);
    if (!doc || doc.successorOperationId !== journal.operationId) {
      throw new Error('Lighter recovery successor operation changed');
    }
    const owned = active.filter(
      (row) =>
        journal.priorTriggers.some(
          (prior) => prior.orderId === String(row.orderIndex),
        ) ||
        (journal.retainedReplacementGroups ?? []).some((group) =>
          group.includes(row.clientOrderIndex),
        ) ||
        journal.attempts.some(
          (attempt) =>
            attempt.kind === 'create' &&
            attempt.clientIds.includes(row.clientOrderIndex),
        ),
    );
    if (state === 'settled') {
      await this.#updateManagedTpsl(
        doc.successorSettlementKey,
        journal,
        active,
      );
      this.#assertSession(generation);
    }
    await this.#persistRecoverySuccessor(
      {
        ...doc,
        state,
        retainedReplacementGroups:
          state === 'failed' ? undefined : doc.retainedReplacementGroups,
        ownedOrderIds: [
          ...new Set([
            ...doc.ownedOrderIds,
            ...owned.map((row) => String(row.orderIndex)),
          ]),
        ],
      },
      generation,
    );
    if (state === 'settled') {
      await this.#finalizeRecoverySuccessor({ ...doc, state }, generation);
    }
  };

  /**
   * Mint read authentication with an existing registered local key only.
   * Caller holds the account venue lock; this helper takes the bridge lease.
   *
   * @param accountIndex - Captured account.
   * @param generation - Issuing wallet session.
   * @param requiredSlot - Restrict authentication to a selected original slot.
   * @returns Authentication token, without granting financial readiness.
   */
  readonly #getRecoveryReadToken = async (
    accountIndex: number,
    generation: number,
    requiredSlot?: number,
  ): Promise<{ token: string; apiKeyIndex: number; publicKey: string }> => {
    const address = this.#boundAddress;
    const bridge = this.#rawSignerBridge();
    return withProcessMutex(
      bridgeMutexKey(this.#rawSignerBridge()),
      async () => {
        this.#assertSession(generation);
        const registrations =
          await this.#clientService.getApiKeys(accountIndex);
        this.#assertSession(generation);
        if (
          !Array.isArray(registrations.apiKeys) ||
          registrations.apiKeys.some(
            (key) =>
              key.accountIndex !== accountIndex ||
              !Number.isSafeInteger(key.apiKeyIndex) ||
              typeof key.publicKey !== 'string',
          )
        ) {
          throw new Error(
            'Lighter recovery review registration metadata unavailable',
          );
        }
        const requested = registrations.apiKeys
          .filter(
            (key) =>
              key.accountIndex === accountIndex &&
              Number.isSafeInteger(key.apiKeyIndex) &&
              key.apiKeyIndex >= LIGHTER_MIN_TRADING_API_KEY_INDEX &&
              key.apiKeyIndex <= LIGHTER_MAX_TRADING_API_KEY_INDEX,
          )
          .map((key) => key.apiKeyIndex);
        const discover =
          bridge.getRecoverableKeyIndices?.bind(bridge) ??
          bridge.getStoredKeyIndices?.bind(bridge);
        const discovered = discover
          ? await discover({
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
              apiKeyIndices: requested,
              walletAddress: address ?? undefined,
            })
          : [this.#preferredApiKeyIndex];
        const local =
          requiredSlot === undefined
            ? [...new Set([this.#preferredApiKeyIndex, ...discovered])].filter(
                (slot) => discovered.includes(slot),
              )
            : discovered.filter((slot) => slot === requiredSlot);
        this.#assertSession(generation);
        if (discover && local.some((slot) => !requested.includes(slot))) {
          throw new Error(
            'Lighter recovery review received an unrequested local key',
          );
        }
        try {
          for (const slot of local) {
            const matches = registrations.apiKeys.filter(
              (key) =>
                key.apiKeyIndex === slot && key.accountIndex === accountIndex,
            );
            if (matches.length !== 1) {
              continue;
            }
            const nonce = await this.#clientService.getNextNonce(
              accountIndex,
              slot,
            );
            this.#assertSession(generation);
            if (!Number.isSafeInteger(nonce.nonce) || nonce.nonce < 0) {
              throw new Error(
                'Lighter recovery review received invalid nonce metadata',
              );
            }
            const created = await bridge.createClient({
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
              nonce: nonce.nonce,
              apiKeyIndex: slot,
              walletAddress: address ?? undefined,
            });
            this.#assertSession(generation);
            if (created.error || !created.success) {
              throw new Error(
                created.error ?? 'Lighter recovery review client unavailable',
              );
            }
            const normalize = (key: string): string =>
              key.replace(/^0x/u, '').toLowerCase();
            if (
              !created.pk ||
              normalize(created.pk) !== normalize(matches[0].publicKey)
            ) {
              continue;
            }
            const auth = await bridge.execute({
              function: '_createAuthToken',
              params: [accountIndex, slot],
            });
            this.#assertSession(generation);
            if (
              auth.error ||
              !auth.token ||
              !Number.isFinite(auth.deadline) ||
              auth.deadline <= Date.now() / 1000
            ) {
              throw new Error(
                auth.error ?? 'Lighter recovery review auth unavailable',
              );
            }
            return {
              token: auth.token,
              apiKeyIndex: slot,
              publicKey: created.pk,
            };
          }
          throw new Error(
            'Lighter recovery review requires a matching locally retained registered key; reconnect without replacing venue keys',
          );
        } finally {
          bridgeClientOwners.delete(this.#rawSignerBridge());
        }
      },
    );
  };

  /**
   * Read fresh account positions and authenticated orders without financial
   * readiness. Only a locally held, already registered key can mint the read
   * token; client creation is local and auth signing cannot submit a transaction.
   * No authority is cached and ownership is released before returning.
   *
   * @returns A provider-scoped authoritative snapshot.
   */
  async reviewRecoveryVenue(): Promise<PerpsRecoveryVenueReview> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    this.#assertSession(generation);
    const address = this.#boundAddress;
    const network = this.#isTestnet ? 'testnet' : 'mainnet';
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const result = await withProcessMutex(
      `lighterVenueWrite:${network}:${accountIndex}`,
      async () => {
        this.#assertSession(generation);
        const { token } = await this.#getRecoveryReadToken(
          accountIndex,
          generation,
        );
        this.#assertSession(generation);
        const accountResponse =
          await this.#clientService.getAccountByIndex(accountIndex);
        this.#assertSession(generation);
        const account = accountResponse.accounts?.[0];
        if (
          !Array.isArray(accountResponse.accounts) ||
          accountResponse.accounts.length !== 1 ||
          !account ||
          account.index !== accountIndex ||
          account.l1Address?.toLowerCase() !== address ||
          account.accountType !== 0 ||
          !Array.isArray(account.positions)
        ) {
          throw new Error(
            'Lighter recovery review account identity or positions unavailable',
          );
        }
        const metadata = await this.#clientService.getOrderBookDetails();
        this.#assertSession(generation);
        if (!Array.isArray(metadata.orderBookDetails)) {
          throw new Error(
            'Lighter recovery review market metadata unavailable',
          );
        }
        const positions = account.positions
          .map((position) => {
            const markets = metadata.orderBookDetails.filter(
              (market) =>
                market.marketId === position.marketId &&
                market.symbol === position.symbol,
            );
            if (
              markets.length !== 1 ||
              parseStrictDecimal(position.position) === null ||
              parseStrictDecimal(position.avgEntryPrice) === null ||
              (position.sign !== 1 && position.sign !== -1)
            ) {
              throw new Error(
                'Lighter recovery review position metadata unavailable',
              );
            }
            return adaptPositionFromLighter(
              position,
              deriveLighterMaxLeverage(
                markets[0].minInitialMarginFraction,
                position.marketId,
              ),
            );
          })
          .filter((position) => parseStrictDecimal(position.size) !== 0);
        const active = await this.#clientService.getActiveOrders(
          accountIndex,
          token,
        );
        this.#assertSession(generation);
        if (!Array.isArray(active.orders)) {
          throw new Error('Lighter recovery review orders unavailable');
        }
        const orders = active.orders.map((order) => {
          const markets = metadata.orderBookDetails.filter(
            (market) => market.marketId === order.marketIndex,
          );
          if (
            markets.length !== 1 ||
            order.ownerAccountIndex !== accountIndex
          ) {
            throw new Error(
              'Lighter recovery review order identity or metadata unavailable',
            );
          }
          return adaptOrderFromLighter(order, markets[0].symbol);
        });
        this.#assertSession(generation);
        return {
          status: 'ready' as const,
          providerId: 'lighter' as const,
          walletAddress: address ?? '',
          network,
          accountIndex,
          positions,
          orders,
          reviewedAt: Date.now(),
        };
      },
    );
    this.#assertSession(generation);
    return result;
  }

  /**
   * Acknowledge one exact stored outcome after the caller refreshes venue state.
   * Scoped IDs from any local slot work without changing the active signer.
   * Legacy unscoped IDs are accepted only when unique across this account.
   * The slot mutex and session fence preserve concurrent appends, unresolved
   * entries and all other outcomes. Unknown outcomes require the same explicit
   * acknowledgment; this is never permission to resubmit an ambiguous intent.
   *
   * @param recoveryId - Opaque stable id from {@link getRecoveredDispatches}.
   */
  async acknowledgeRecoveredDispatch(recoveryId: string): Promise<void> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    const accountIndex = await this.#ensureAccountIndex();
    await this.#signerReadyPromise?.catch(() => undefined);
    this.#assertSession(generation);
    const unmatched = (): Error =>
      new Error(
        'No pending recovered Lighter dispatch matches this scoped id; refresh and re-read before acknowledging',
      );
    if (recoveryId.startsWith('lighter-pending:')) {
      throw new Error(
        'Unresolved Lighter dispatches cannot be acknowledged. Use reconcileRecoveredDispatches to check authoritative state; unresolved dispatches remain blocked',
      );
    }
    let apiKeyIndex: number;
    let ledgerRecoveryId: string;
    if (recoveryId.startsWith('lighter:')) {
      let scope: unknown;
      try {
        scope = JSON.parse(recoveryId.slice('lighter:'.length));
      } catch {
        throw unmatched();
      }
      if (
        !Array.isArray(scope) ||
        scope.length !== 5 ||
        scope[0] !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
        scope[1] !== this.#boundAddress ||
        scope[2] !== accountIndex ||
        typeof scope[3] !== 'number' ||
        !Number.isSafeInteger(scope[3]) ||
        scope[3] < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
        scope[3] > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
        typeof scope[4] !== 'string'
      ) {
        throw unmatched();
      }
      apiKeyIndex = scope[3];
      ledgerRecoveryId = scope[4];
    } else {
      const matches = (
        await this.#readAccountRecoveryLedgers(accountIndex, generation)
      ).filter(({ doc }) =>
        doc.recovered.some((outcome) => outcome.recoveryId === recoveryId),
      );
      if (matches.length !== 1) {
        throw unmatched();
      }
      apiKeyIndex = matches[0].apiKeyIndex;
      ledgerRecoveryId = recoveryId;
    }
    await withProcessMutex(
      this.#nonceLedgerKey(accountIndex, apiKeyIndex),
      async () => {
        this.#ensureSessionBinding();
        this.#assertSession(generation);
        const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex);
        this.#assertSession(generation);
        const matching = doc.recovered.filter(
          (outcome) => outcome.recoveryId === ledgerRecoveryId,
        );
        if (matching.length !== 1) {
          throw unmatched();
        }
        await this.#writeNonceLedger(
          accountIndex,
          {
            consumedFloor: doc.consumedFloor,
            entries: doc.entries,
            recovered: doc.recovered.filter(
              (outcome) => outcome.recoveryId !== ledgerRecoveryId,
            ),
          },
          apiKeyIndex,
        );
      },
    );
  }

  /**
   * Release a nonce reservation for a PROVEN never-landed dispatch —
   * refused when the durable consumed watermark shows a later dispatch
   * (e.g. a retry) already consumed the nonce.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param nonce - The proven-unconsumed nonce.
   */
  readonly #releaseNonceReservationIfUnconsumed = async (
    accountIndex: number,
    nonce: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<void> => {
    const doc = await this.#readNonceLedger(accountIndex, apiKeyIndex).catch(
      () => null,
    );
    if (doc === null || nonce < doc.consumedFloor) {
      return;
    }
    this.#releaseNonceReservation(accountIndex, nonce, apiKeyIndex);
  };

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
   * Protection belongs to the wallet/account/market, not the signing key slot.
   * A key recovered into another slot must still recognize this device's orders.
   *
   * @param settlementKey - Address:accountIndex:apiKeyIndex:symbol identity.
   * @returns The network-scoped ownership storage key.
   */
  readonly #managedTpslKey = (settlementKey: string): string => {
    const [address, accountIndex, , ...symbolParts] = settlementKey.split(':');
    const symbol = symbolParts.join(':');
    return `lighterManagedTpsl:${this.#isTestnet ? 'testnet' : 'mainnet'}:${address}:${accountIndex}:${symbol}`;
  };

  /**
   * Read ownership strictly. Storage failure or corruption never means unowned.
   *
   * @param settlementKey - Captured settlement identity.
   * @returns Recorded client and venue identities.
   */
  readonly #readManagedTpsl = async (
    settlementKey: string,
  ): Promise<ManagedTpslOrder[]> => {
    const raw = await this.#deps.diskCache.getItem(
      this.#managedTpslKey(settlementKey),
    );
    if (raw === null) {
      return [];
    }
    const parsed = JSON.parse(raw) as { version?: unknown; orders?: unknown };
    if (
      parsed === null ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.orders) ||
      parsed.orders.length > LIGHTER_TPSL_OWNERSHIP_MAX_ORDERS ||
      !parsed.orders.every((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) {
          return false;
        }
        const order = entry as Partial<ManagedTpslOrder>;
        return (
          typeof order.clientId === 'string' &&
          /^\d{1,15}$/u.test(order.clientId) &&
          Number.isSafeInteger(Number(order.clientId)) &&
          Number(order.clientId) > 0 &&
          (order.orderId === null ||
            (typeof order.orderId === 'string' &&
              /^\d{1,20}$/u.test(order.orderId))) &&
          (order.orderExpiry === undefined ||
            (typeof order.orderExpiry === 'number' &&
              Number.isSafeInteger(order.orderExpiry) &&
              order.orderExpiry > 0))
        );
      })
    ) {
      throw new Error(
        'Invalid Lighter managed TP/SL ownership; refusing protection changes',
      );
    }
    const orders = parsed.orders as ManagedTpslOrder[];
    if (new Set(orders.map((entry) => entry.clientId)).size !== orders.length) {
      throw new Error(
        'Duplicate Lighter managed TP/SL ownership; refusing protection changes',
      );
    }
    return orders;
  };

  /**
   * Record every journalled creation before dispatch. At proven settlement,
   * prune only proven cancelled venue IDs. A lagging book never erases a create.
   * Unrelated or uncertain IDs from another slot's operation are retained.
   *
   * @param settlementKey - Captured settlement identity.
   * @param journal - Operation whose IDs are being updated.
   * @param settledActive - Strict active book after authoritative settlement.
   * @returns Newly inserted client IDs, for rollback of a failed pre-dispatch write.
   */
  readonly #updateManagedTpsl = async (
    settlementKey: string,
    journal: TpslJournalState,
    settledActive?: LighterApiOrder[],
  ): Promise<string[]> => {
    const key = this.#managedTpslKey(settlementKey);
    return await withStorageMutex(key, async () => {
      const orders = new Map(
        (await this.#readManagedTpsl(settlementKey)).map((entry) => [
          entry.clientId,
          entry,
        ]),
      );
      const createdOrders = new Map(
        journal.attempts.flatMap((attempt) =>
          attempt.kind === 'create' &&
          attempt.neverLanded !== true &&
          getLighterTransactionOutcome(attempt.terminalStatus) !== 'failed'
            ? attempt.clientIds.map((id, index): [string, ManagedTpslOrder] => [
                String(id),
                {
                  clientId: String(id),
                  orderId: null,
                  ...(attempt.orderExpiries === undefined
                    ? {}
                    : { orderExpiry: attempt.orderExpiries[index] }),
                },
              ])
            : [],
        ),
      );
      const inserted: string[] = [];
      for (const [clientId, entry] of settledActive ? [] : createdOrders) {
        if (!orders.has(clientId)) {
          inserted.push(clientId);
          orders.set(clientId, entry);
        }
      }
      if (settledActive) {
        const cancelledIds = new Set(
          journal.attempts.flatMap((attempt) =>
            attempt.kind === 'cancel' ? [attempt.orderId] : [],
          ),
        );
        for (const [clientId, entry] of orders) {
          const active = settledActive.find(
            (row) => String(row.clientOrderIndex) === clientId,
          );
          if (active) {
            orders.set(clientId, {
              ...entry,
              orderId: String(active.orderIndex),
            });
          } else if (
            entry.orderId !== null &&
            cancelledIds.has(entry.orderId)
          ) {
            orders.delete(clientId);
          }
        }
      }
      if (orders.size > LIGHTER_TPSL_OWNERSHIP_MAX_ORDERS) {
        throw new Error(
          'Lighter managed TP/SL ownership is full; refusing further protection changes',
        );
      }
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify({ version: 1, orders: [...orders.values()] }),
      );
      return inserted;
    });
  };

  /**
   * Drop IDs only with explicit pre-dispatch, terminal-failure or expiry proof.
   *
   * @param settlementKey - Captured settlement identity.
   * @param clientIds - Exact IDs proven incapable of creating a live order.
   */
  readonly #discardManagedTpslIds = async (
    settlementKey: string,
    clientIds: string[],
  ): Promise<void> => {
    if (clientIds.length === 0) {
      return;
    }
    const key = this.#managedTpslKey(settlementKey);
    await withStorageMutex(key, async () => {
      const orders = await this.#readManagedTpsl(settlementKey);
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify({
          version: 1,
          orders: orders.filter((entry) => !clientIds.includes(entry.clientId)),
        }),
      );
    });
  };

  /**
   * Prune ownership on exact terminal history or signed order expiry plus slack.
   * Absence from an active read alone never discards an uncertain creation.
   * Bookkeeping reads are bounded and best-effort, unlike journal settlement.
   *
   * @param settlementKey - Captured settlement identity.
   * @param active - Strict active venue book.
   * @param readRecentInactive - One-page, captured-account inactive reader.
   */
  readonly #pruneManagedTpsl = async (
    settlementKey: string,
    active: LighterApiOrder[],
    readRecentInactive: () => Promise<LighterApiOrder[]>,
  ): Promise<void> => {
    const orders = await this.#readManagedTpsl(settlementKey);
    const missing = orders.filter(
      (entry) =>
        !active.some((row) => String(row.clientOrderIndex) === entry.clientId),
    );
    if (missing.length === 0) {
      return;
    }
    const expired = new Map(
      missing
        .filter(
          (entry) =>
            entry.orderExpiry !== undefined &&
            Date.now() - entry.orderExpiry > LIGHTER_TX_EXPIRY_SLACK_MS,
        )
        .map((entry) => [entry.clientId, entry.orderExpiry]),
    );
    const missingIds = new Set(
      missing
        .filter((entry) => !expired.has(entry.clientId))
        .map((entry) => entry.clientId),
    );
    let inactive: LighterApiOrder[] = [];
    if (missingIds.size > 0) {
      try {
        inactive = await readRecentInactive();
      } catch (error) {
        this.#deps.debugLogger.log(
          '[LighterProvider] TP/SL ownership history unavailable; retaining uncertain IDs',
          { error: String(error) },
        );
      }
    }
    const terminalIds = new Set(
      inactive
        .filter((row) => {
          if (!missingIds.has(String(row.clientOrderIndex))) {
            return false;
          }
          const status = row.status.toLowerCase();
          if (status === 'rejected') {
            return true;
          }
          if (status === 'executed') {
            return parseStrictDecimal(row.remainingBaseAmount) === 0;
          }
          try {
            // The adapter is the canonical venue status vocabulary, including
            // OCO, reduce-only, expiry and other cancellation causes.
            const adapted = adaptOrderFromLighter(row, String(row.marketIndex));
            return (
              adapted.status === 'canceled' ||
              (adapted.status === 'filled' &&
                parseStrictDecimal(row.remainingBaseAmount) === 0)
            );
          } catch {
            // Unknown states retain ownership rather than guessing termination.
            return false;
          }
        })
        .map((row) => String(row.clientOrderIndex)),
    );
    if (terminalIds.size === 0 && expired.size === 0) {
      return;
    }
    const key = this.#managedTpslKey(settlementKey);
    await withStorageMutex(key, async () => {
      const current = await this.#readManagedTpsl(settlementKey);
      await this.#deps.diskCache.setItem(
        key,
        JSON.stringify({
          version: 1,
          orders: current.filter(
            (entry) =>
              !terminalIds.has(entry.clientId) &&
              !(
                expired.has(entry.clientId) &&
                expired.get(entry.clientId) === entry.orderExpiry
              ),
          ),
        }),
      );
    });
  };

  /**
   * Operation-scoped journal payload key: each operation's journal lives
   * under its OWN key so a stale resolver physically cannot overwrite or
   * delete a newer operation's payload — only its own.
   *
   * @param settlementKey - Settlement identity.
   * @param operationId - The operation identity.
   * @returns The disk-cache key.
   */
  readonly #tpslJournalOpKey = (
    settlementKey: string,
    operationId: string,
  ): string =>
    `lighterTpslJournalOp:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}:${operationId}`;

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
    let baseRaw: string | null;
    try {
      baseRaw = await this.#deps.diskCache.getItem(key);
    } catch (error) {
      throw new Error(
        `Lighter TP/SL journal read failed for ${settlementKey}; refusing protection changes: ${ensureError(error, 'LighterProvider.#loadTpslJournal').message}`,
      );
    }
    if (baseRaw === null) {
      return null;
    }
    // The base key holds either a POINTER to an operation-scoped payload
    // (code-written journals: a stale writer physically cannot destroy a
    // newer operation's payload) or a legacy inline journal.
    let raw = baseRaw;
    const pointer = parseTpslJournalPointer(baseRaw);
    if (pointer !== null) {
      const payloadRaw = await this.#deps.diskCache.getItem(
        this.#tpslJournalOpKey(settlementKey, pointer.operationId),
      );
      if (payloadRaw === null) {
        // Dangling pointer (payload already resolved elsewhere).
        return null;
      }
      raw = payloadRaw;
    }
    let parsed: {
      version?: unknown;
      recordedAt?: unknown;
      operationId?: unknown;
      sourceRecoveryOperationId?: unknown;
      sourceRecoverySettlementKey?: unknown;
      retainedReplacementGroups?: unknown;
      createdAt?: unknown;
      nextAttemptId?: unknown;
      apiKeyIndex?: unknown;
      intent?: unknown;
      phase?: unknown;
      priorGrouping?: unknown;
      priorTriggers?: unknown;
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
        typeof attempt.attemptId !== 'number' ||
        !Number.isSafeInteger(attempt.attemptId) ||
        attempt.attemptId < 1 ||
        (attempt.terminalStatus !== undefined &&
          (typeof attempt.terminalStatus !== 'number' ||
            !Number.isSafeInteger(attempt.terminalStatus))) ||
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
          // priorOrderIds durably key WHICH prior intents a restore
          // restores, INDEX-ALIGNED with clientIds; REQUIRED on
          // restores, forbidden on replacements.
          (attempt.role === 'restore'
            ? Array.isArray(attempt.priorOrderIds) &&
              Array.isArray(attempt.clientIds) &&
              attempt.priorOrderIds.length === attempt.clientIds.length &&
              attempt.priorOrderIds.every(isOrderIdString)
            : attempt.priorOrderIds === undefined) &&
          Array.isArray(attempt.clientIds) &&
          attempt.clientIds.length >= 1 &&
          attempt.clientIds.length <= 2 &&
          attempt.clientIds.every(isWireId) &&
          new Set(attempt.clientIds).size === attempt.clientIds.length &&
          (attempt.orderExpiries === undefined ||
            (Array.isArray(attempt.orderExpiries) &&
              attempt.orderExpiries.length === attempt.clientIds.length &&
              attempt.orderExpiries.every(isExpiry)))
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
    // EXPLICIT remediation policy for early schemas (v1/v2): their
    // transition state cannot be interpreted safely, so instead of a
    // permanent opaque block they convert to a DURABLE MANUAL-recovery
    // state — surfaced to the user, resolved only by an explicit new
    // protection intent.
    if (parsed.version === 1 || parsed.version === 2) {
      return {
        attempts: [],
        recordedAt:
          typeof parsed.recordedAt === 'number' ? parsed.recordedAt : 0,
        operationId:
          typeof parsed.operationId === 'string' &&
          parsed.operationId.length > 0
            ? parsed.operationId
            : `legacy-v${String(parsed.version)}`,
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
        nextAttemptId: 1,
        intent: 'replace',
        phase: 'manual',
        priorGrouping: 'independent',
        priorTriggers: [],
      };
    }
    if (
      (parsed.version === 3 || parsed.version === 4) &&
      typeof parsed.recordedAt === 'number' &&
      Number.isSafeInteger(parsed.recordedAt) &&
      parsed.recordedAt >= 0 &&
      // The journal is bound to ONE api-key slot: nonces are per slot.
      String(parsed.apiKeyIndex) === settlementKey.split(':').at(-2) &&
      typeof parsed.apiKeyIndex === 'number' &&
      Number.isSafeInteger(parsed.apiKeyIndex) &&
      parsed.apiKeyIndex >= 0 &&
      (parsed.retainedReplacementGroups === undefined ||
        isRecoveryGroups(parsed.retainedReplacementGroups)) &&
      (parsed.sourceRecoverySettlementKey === undefined) ===
        (parsed.sourceRecoveryOperationId === undefined) &&
      (parsed.sourceRecoverySettlementKey === undefined ||
        (typeof parsed.sourceRecoverySettlementKey === 'string' &&
          parsed.sourceRecoverySettlementKey.length > 0)) &&
      (parsed.sourceRecoveryOperationId === undefined ||
        (typeof parsed.sourceRecoveryOperationId === 'string' &&
          parsed.sourceRecoveryOperationId.length > 0 &&
          parsed.sourceRecoveryOperationId.length <= 64)) &&
      typeof parsed.operationId === 'string' &&
      parsed.operationId.length >= 1 &&
      parsed.operationId.length <= 64 &&
      typeof parsed.createdAt === 'number' &&
      Number.isSafeInteger(parsed.createdAt) &&
      parsed.createdAt >= 0 &&
      typeof parsed.nextAttemptId === 'number' &&
      Number.isSafeInteger(parsed.nextAttemptId) &&
      parsed.nextAttemptId >= 1 &&
      // An explicit durable operation intent is REQUIRED: without it a
      // remove could be misread as a failed replacement.
      (parsed.intent === 'replace' || parsed.intent === 'remove') &&
      (parsed.phase === 'creating' ||
        parsed.phase === 'cancelling' ||
        // v3's 'restoring' migrates to 'manual' below.
        parsed.phase === 'restoring' ||
        parsed.phase === 'manual') &&
      // 'oco' grouping structurally requires the linked pair.
      (parsed.priorGrouping === 'independent' ||
        (parsed.priorGrouping === 'oco' &&
          Array.isArray(parsed.priorTriggers) &&
          parsed.priorTriggers.length === 2)) &&
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
      // Attempt IDENTITY is the attemptId — nonces may legitimately
      // repeat when a proven-never-landed submission is retried. The
      // durable allocator must sit strictly ABOVE every recorded id so
      // compaction can never recycle one.
      new Set(parsed.attempts.map((entry) => entry.attemptId)).size ===
        parsed.attempts.length &&
      parsed.attempts.every(
        (entry) => entry.attemptId < (parsed.nextAttemptId as number),
      )
    ) {
      const { attempts } = parsed;
      const { priorTriggers } = parsed;
      // Every restore leg must link to a persisted prior intent — an
      // unlinked restore could sign a duplicate or orphan a prior one.
      const restoresLinked = attempts.every(
        (attempt) =>
          attempt.kind !== 'create' ||
          attempt.role !== 'restore' ||
          (attempt.priorOrderIds ?? []).every((priorOrderId) =>
            priorTriggers.some((trigger) => trigger.orderId === priorOrderId),
          ),
      );
      if (restoresLinked) {
        return {
          attempts: attempts.map((attempt) =>
            attempt.kind === 'create'
              ? { ...attempt, neverLanded: undefined }
              : attempt,
          ),
          recordedAt: parsed.recordedAt,
          operationId: parsed.operationId,
          retainedReplacementGroups: isRecoveryGroups(
            parsed.retainedReplacementGroups,
          )
            ? parsed.retainedReplacementGroups
            : undefined,
          sourceRecoverySettlementKey:
            typeof parsed.sourceRecoverySettlementKey === 'string'
              ? parsed.sourceRecoverySettlementKey
              : undefined,
          sourceRecoveryOperationId:
            typeof parsed.sourceRecoveryOperationId === 'string'
              ? parsed.sourceRecoveryOperationId
              : undefined,
          createdAt: parsed.createdAt,
          nextAttemptId: parsed.nextAttemptId,
          intent: parsed.intent,
          // v3 MIGRATION: an interrupted 'restoring' operation predates
          // the no-auto-restore policy — it parks as MANUAL.
          phase: parsed.phase === 'restoring' ? 'manual' : parsed.phase,
          priorGrouping: parsed.priorGrouping,
          priorTriggers,
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
   * Durable manual-recovery doc key (separate from the journal slot).
   *
   * @param settlementKey - Settlement identity.
   * @returns The disk-cache key.
   */
  readonly #tpslManualKey = (settlementKey: string): string =>
    `lighterTpslManual:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}`;

  /**
   * Manual-recovery index key.
   *
   * @returns The disk-cache key.
   */
  readonly #tpslManualIndexKey = (): string =>
    `lighterTpslManualIndex:${this.#isTestnet ? 'testnet' : 'mainnet'}`;

  /**
   * Read the manual-recovery index. Corruption THROWS — a parked
   * protection warning silently degrading to "nothing pending" would
   * hide a naked position.
   *
   * @returns Settlement keys with pending manual recoveries.
   */
  readonly #readTpslManualIndex = async (): Promise<string[]> => {
    const raw = await this.#deps.diskCache.getItem(this.#tpslManualIndexKey());
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
    throw new Error('Lighter TP/SL manual-recovery index is corrupt');
  };

  /**
   * Durably record a manual-recovery warning (doc + index entry).
   *
   * @param doc - The manual-recovery record.
   */
  readonly #writeTpslManualRecovery = async (
    doc: TpslManualRecovery,
  ): Promise<void> => {
    await withStorageMutex(this.#tpslManualIndexKey(), async () => {
      const index = await this.#readTpslManualIndex();
      if (
        !index.includes(doc.settlementKey) &&
        index.length >= LIGHTER_TPSL_MANUAL_RECOVERY_LIMIT
      ) {
        throw new Error(
          'Lighter TP/SL manual-recovery index is full; refusing to hide a new recovery obligation',
        );
      }
      await this.#deps.diskCache.setItem(
        this.#tpslManualKey(doc.settlementKey),
        JSON.stringify({ version: 1, ...doc }),
      );
      if (!index.includes(doc.settlementKey)) {
        await this.#deps.diskCache.setItem(
          this.#tpslManualIndexKey(),
          JSON.stringify([...index, doc.settlementKey]),
        );
      }
    });
  };

  /**
   * Load a manual-recovery record. Corruption THROWS (never null) so a
   * parked warning cannot silently vanish.
   *
   * @param settlementKey - Settlement identity.
   * @returns The record, or null when none is parked.
   */
  readonly #loadTpslManualRecovery = async (
    settlementKey: string,
  ): Promise<TpslManualRecovery | null> => {
    const raw = await this.#deps.diskCache.getItem(
      this.#tpslManualKey(settlementKey),
    );
    if (raw === null) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        parsed.version === 1 &&
        typeof parsed.settlementKey === 'string' &&
        typeof parsed.symbol === 'string' &&
        typeof parsed.reason === 'string' &&
        parsed.reason.length <= 500 &&
        (parsed.priorIntent === 'replace' || parsed.priorIntent === 'remove') &&
        Array.isArray(parsed.priorTriggers) &&
        Array.isArray(parsed.survivingOrderIds) &&
        (parsed.survivingOrderIds as unknown[]).every(
          (id) => typeof id === 'string',
        ) &&
        typeof parsed.operationId === 'string' &&
        typeof parsed.recordedAt === 'number'
      ) {
        return {
          settlementKey: parsed.settlementKey,
          symbol: parsed.symbol,
          reason: parsed.reason,
          priorIntent: parsed.priorIntent,
          priorTriggers: parsed.priorTriggers as TpslPriorTrigger[],
          survivingOrderIds: parsed.survivingOrderIds as string[],
          operationId: parsed.operationId,
          recordedAt: parsed.recordedAt,
        };
      }
    } catch {
      // fall through to fail closed
    }
    throw new Error(
      `Lighter TP/SL manual-recovery record for ${settlementKey} is corrupt; resolve storage before proceeding`,
    );
  };

  /**
   * Clear a manual-recovery record — called ONLY after a successor
   * protection intent has authoritatively succeeded.
   *
   * @param settlementKey - Settlement identity.
   * @param expectedOperationId - Exact source to clear, when explicitly selected.
   * @param generation - Issuing wallet session.
   */
  readonly #clearTpslManualRecovery = async (
    settlementKey: string,
    expectedOperationId?: string,
    generation = this.#sessionGeneration,
  ): Promise<void> => {
    await withStorageMutex(this.#tpslManualIndexKey(), async () => {
      this.#assertSession(generation);
      const current = await this.#loadTpslManualRecovery(settlementKey);
      this.#assertSession(generation);
      if (
        expectedOperationId !== undefined &&
        current !== null &&
        current.operationId !== expectedOperationId
      ) {
        throw new Error(
          'Lighter recovery source operation changed before completion',
        );
      }
      const index = await this.#readTpslManualIndex();
      this.#assertSession(generation);
      await this.#deps.diskCache.removeItem(this.#tpslManualKey(settlementKey));
      this.#assertSession(generation);
      if (index.includes(settlementKey)) {
        await this.#deps.diskCache.setItem(
          this.#tpslManualIndexKey(),
          JSON.stringify(index.filter((entry) => entry !== settlementKey)),
        );
        this.#assertSession(generation);
      }
    });
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
    // Index RMW under its OWN process-wide mutex: concurrent persists
    // for different settlement keys must never lose each other's entry.
    await withStorageMutex(this.#tpslJournalIndexKey(), async () => {
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
    });
    const baseKey = this.#tpslJournalKey(settlementKey);
    // The pointer read-modify-write is serialized PROCESS-WIDE: the
    // instance-local write lock cannot protect two live provider
    // instances sharing one disk cache.
    await withStorageMutex(baseKey, async () => {
      // COMPARE-AND-SWAP on the operation identity: a writer holding a
      // stale snapshot must never take over a DIFFERENT operation's
      // journal. (A missing journal is fine — first write of an op.)
      const currentRaw = await this.#deps.diskCache.getItem(baseKey);
      const pointerAlreadyOurs =
        currentRaw !== null &&
        parseTpslJournalPointer(currentRaw)?.operationId ===
          journal.operationId;
      // A DANGLING pointer (payload already resolved; only the base
      // removal failed) has no live owner — it is claimable, otherwise a
      // partial clear would block every future operation forever.
      let danglingPointer = false;
      if (currentRaw !== null) {
        const staleCheck = parseTpslJournalPointer(currentRaw);
        if (
          staleCheck !== null &&
          staleCheck.operationId !== journal.operationId
        ) {
          danglingPointer =
            (await this.#deps.diskCache.getItem(
              this.#tpslJournalOpKey(settlementKey, staleCheck.operationId),
            )) === null;
        }
      }
      if (currentRaw !== null && !danglingPointer) {
        const pointer = parseTpslJournalPointer(currentRaw);
        let currentOperationId: unknown = pointer?.operationId ?? null;
        if (pointer === null) {
          try {
            currentOperationId = (
              JSON.parse(currentRaw) as { operationId?: unknown }
            ).operationId;
          } catch {
            // Corrupt current journal: fail closed below via mismatch.
          }
        }
        if (currentOperationId !== journal.operationId) {
          throw new Error(
            `Lighter TP/SL journal for ${settlementKey} belongs to a different operation; refusing a stale write`,
          );
        }
      }
      const previous = danglingPointer
        ? null
        : await this.#loadTpslJournal(settlementKey);
      const priorCreateIds = new Set(
        previous?.attempts.flatMap((attempt) =>
          attempt.kind === 'create' ? attempt.clientIds.map(String) : [],
        ) ?? [],
      );
      // Ownership must succeed BEFORE publishing an unknown journal attempt.
      // A failed ownership write therefore leaves no never-sent obligation.
      const insertedOwnership = await this.#updateManagedTpsl(
        settlementKey,
        journal,
      );
      try {
        await this.#deps.diskCache.setItem(
          this.#tpslJournalOpKey(settlementKey, journal.operationId),
          JSON.stringify({
            version: 4,
            recordedAt: journal.recordedAt,
            operationId: journal.operationId,
            sourceRecoveryOperationId: journal.sourceRecoveryOperationId,
            sourceRecoverySettlementKey: journal.sourceRecoverySettlementKey,
            retainedReplacementGroups: journal.retainedReplacementGroups,
            createdAt: journal.createdAt,
            nextAttemptId: journal.nextAttemptId,
            apiKeyIndex: this.#apiKeyIndex,
            intent: journal.intent,
            phase: journal.phase,
            priorGrouping: journal.priorGrouping,
            priorTriggers: journal.priorTriggers,
            attempts: journal.attempts.map((attempt) =>
              attempt.kind === 'create'
                ? { ...attempt, neverLanded: undefined }
                : attempt,
            ),
          }),
        );
        if (!pointerAlreadyOurs) {
          await this.#deps.diskCache.setItem(
            baseKey,
            JSON.stringify({
              pointerVersion: 1,
              operationId: journal.operationId,
            }),
          );
        }
      } catch (error) {
        // Pointer write failed on the FIRST persist of this operation:
        // remove the freshly written payload so no orphan accumulates.
        // (When an earlier persist already pointed here, the payload is
        // referenced durable state — keep it.)
        if (!pointerAlreadyOurs) {
          await this.#deps.diskCache
            .removeItem(
              this.#tpslJournalOpKey(settlementKey, journal.operationId),
            )
            .catch(() => undefined);
        }
        // Only brand-new attempts absent from the previous durable journal
        // are known never dispatched. Retain all prior committed identities.
        try {
          await this.#discardManagedTpslIds(
            settlementKey,
            insertedOwnership.filter((id) => !priorCreateIds.has(id)),
          );
        } catch (rollbackError) {
          // Keep ownership conservatively if storage also fails during rollback.
          // Bounded bookkeeping can reclaim them after their signed order expiry.
          this.#deps.debugLogger.log(
            '[LighterProvider] pre-dispatch ownership rollback failed; retaining IDs',
            { error: String(rollbackError) },
          );
        }
        throw error;
      }
    });
    // A NEW pending obligation invalidates any "recovery complete"
    // marker recorded earlier in this session — otherwise later read
    // kicks would skip it until a restart or another mutation.
    this.#tpslRecoveryGeneration = -1;
  };

  /**
   * Resolve a settlement obligation everywhere — compare-and-swap on the
   * operation identity: a resolver holding a STALE snapshot must never
   * erase a NEWER operation's journal. Disk removal failures PROPAGATE
   * and the in-memory entry is retained: silently dropping only the
   * memory copy would leave a stale durable obligation to wedge a later
   * session.
   *
   * @param settlementKey - Settlement identity.
   * @param expectedOperationId - The operation this resolver settled;
   * null prunes only a dangling index entry with NO journal behind it.
   * @param settledActive - Strict active book after the operation settled.
   * @returns True when the obligation was cleared (or already gone);
   * false when a NEWER operation owns the journal (unresolved).
   */
  readonly #clearTpslJournal = async (
    settlementKey: string,
    expectedOperationId: string | null,
    settledActive?: LighterApiOrder[],
  ): Promise<boolean> => {
    const journalKey = this.#tpslJournalKey(settlementKey);
    const cleared = await withStorageMutex(journalKey, async () => {
      const currentRaw = await this.#deps.diskCache.getItem(journalKey);
      if (currentRaw === null) {
        // Already resolved (or never journalled): nothing left to clear.
        return true;
      }
      const pointer = parseTpslJournalPointer(currentRaw);
      if (pointer !== null) {
        if (expectedOperationId === null) {
          // Prune mode: only a DANGLING pointer may be pruned.
          const payloadRaw = await this.#deps.diskCache.getItem(
            this.#tpslJournalOpKey(settlementKey, pointer.operationId),
          );
          if (payloadRaw !== null) {
            return false;
          }
          await this.#deps.diskCache.removeItem(journalKey);
          return true;
        }
        if (pointer.operationId !== expectedOperationId) {
          // A NEWER operation owns the journal: remove only OUR OWN
          // payload (physically incapable of touching theirs) and
          // report the clear as unresolved.
          this.#deps.debugLogger.log(
            '[LighterProvider] TP/SL journal clear refused: different operation',
            { settlementKey },
          );
          await this.#deps.diskCache
            .removeItem(
              this.#tpslJournalOpKey(settlementKey, expectedOperationId),
            )
            .catch(() => undefined);
          return false;
        }
        if (settledActive) {
          const journal = await this.#loadTpslJournal(settlementKey);
          if (journal) {
            await this.#updateManagedTpsl(
              settlementKey,
              journal,
              settledActive,
            );
          }
        }
        await this.#deps.diskCache.removeItem(
          this.#tpslJournalOpKey(settlementKey, expectedOperationId),
        );
        await this.#deps.diskCache.removeItem(journalKey);
        return true;
      }
      // Legacy inline journal at the base key.
      if (expectedOperationId === null) {
        return false;
      }
      let currentOperationId: unknown = null;
      try {
        const inline = JSON.parse(currentRaw) as {
          operationId?: unknown;
          version?: unknown;
        };
        currentOperationId =
          inline.operationId ??
          // Early schemas carry no operation id: the loader synthesizes
          // `legacy-v{n}` for their manual-remediation state — mirror it
          // so the explicit new intent can clear them.
          (inline.version === 1 || inline.version === 2
            ? `legacy-v${String(inline.version)}`
            : null);
      } catch {
        // Corrupt journal is never silently cleared.
      }
      if (currentOperationId !== expectedOperationId) {
        this.#deps.debugLogger.log(
          '[LighterProvider] TP/SL journal clear refused: different operation',
          { settlementKey },
        );
        return false;
      }
      if (settledActive) {
        const journal = await this.#loadTpslJournal(settlementKey);
        if (journal) {
          await this.#updateManagedTpsl(settlementKey, journal, settledActive);
        }
      }
      await this.#deps.diskCache.removeItem(journalKey);
      return true;
    });
    if (!cleared) {
      return false;
    }
    // Index removal under the index mutex, RE-VERIFYING the journal is
    // still gone: a newer operation may have persisted (journal +
    // index entry) between our clear and this removal — removing the
    // entry then would blind restart recovery to a live obligation.
    // A storage READ failure here is AMBIGUITY, never absence: it
    // propagates (the index entry is retained and the settlement stays
    // unresolved) — guessing could orphan a live obligation.
    await withStorageMutex(this.#tpslJournalIndexKey(), async () => {
      const stillGone =
        (await this.#deps.diskCache.getItem(journalKey)) === null;
      if (!stillGone) {
        return;
      }
      const index = await this.#readTpslJournalIndex();
      if (index.includes(settlementKey)) {
        await this.#deps.diskCache.setItem(
          this.#tpslJournalIndexKey(),
          JSON.stringify(index.filter((entry) => entry !== settlementKey)),
        );
      }
    });
    const memoryEntry = this.#tpslUnsettled.get(settlementKey);
    if (
      memoryEntry === undefined ||
      expectedOperationId === null ||
      memoryEntry.operationId === expectedOperationId
    ) {
      this.#tpslUnsettled.delete(settlementKey);
    }
    return true;
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
    const conflictingClients = new Set<string>();
    let deepTraversalDone = false;
    return async (targetClientIds: number[]): Promise<LighterApiOrder[]> => {
      this.#assertSession(generation);
      const targets = targetClientIds.map(String);
      const missing = (): boolean =>
        targets.some((id) => !terminalCache.has(id));
      const ingest = (orders: LighterApiOrder[]): void => {
        for (const order of orders) {
          if (order.ownerAccountIndex === accountIndex) {
            const clientId = String(order.clientOrderIndex);
            const previous = terminalCache.get(clientId);
            if (
              previous &&
              (previous.orderIndex !== order.orderIndex ||
                previous.marketIndex !== order.marketIndex)
            ) {
              conflictingClients.add(clientId);
            }
            terminalCache.set(clientId, order);
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
      let rowsRead = firstPage.orders.length;
      if (rowsRead > LIGHTER_INACTIVE_HISTORY_ROW_LIMIT) {
        throw new Error(
          `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history exceeded ${LIGHTER_INACTIVE_HISTORY_ROW_LIMIT} rows; TP/SL recovery is still pending`,
        );
      }
      ingest(firstPage.orders);
      if (missing() && !deepTraversalDone) {
        let cursor = firstPage.nextCursor;
        const seenCursors = new Set<string>();
        let pagesRead = 1;
        while (cursor && missing()) {
          if (seenCursors.has(cursor)) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history repeated cursor ${cursor} after ${rowsRead} rows; TP/SL recovery is still pending`,
            );
          }
          seenCursors.add(cursor);
          const response = await this.#clientService.getInactiveOrders(
            accountIndex,
            authToken,
            100,
            cursor,
            marketId,
          );
          this.#assertSession(generation);
          pagesRead += 1;
          if (
            response.orders.length === 0 &&
            response.nextCursor !== undefined
          ) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history advanced without returning rows; TP/SL recovery is still pending`,
            );
          }
          if (pagesRead > LIGHTER_INACTIVE_HISTORY_ROW_LIMIT) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history exceeded ${LIGHTER_INACTIVE_HISTORY_ROW_LIMIT} pages; TP/SL recovery is still pending`,
            );
          }
          rowsRead += response.orders.length;
          if (rowsRead > LIGHTER_INACTIVE_HISTORY_ROW_LIMIT) {
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} inactive-order history exceeded ${LIGHTER_INACTIVE_HISTORY_ROW_LIMIT} rows (${rowsRead} rows returned); TP/SL recovery is still pending`,
            );
          }
          ingest(response.orders);
          cursor = response.nextCursor;
        }
        deepTraversalDone = !cursor || !missing();
      }
      if (targets.some((id) => conflictingClients.has(id))) {
        throw new Error(
          `${LIGHTER_DATA_INTEGRITY_PREFIX} conflicting inactive-order identity for requested client; TP/SL recovery is still pending`,
        );
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
              {
                settlementKey,
                error:
                  error instanceof Error
                    ? (error.stack ?? error.message)
                    : String(error),
              },
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
        // The journal is loaded INSIDE the lock: a snapshot taken while
        // waiting for the lock could be superseded by a foreground
        // operation that settles it and journals a NEW one — acting on
        // the stale snapshot could erase the newer obligation.
        const journalEntry = await this.#loadTpslJournal(settlementKey);
        if (!journalEntry) {
          // Stale index entry with no journal behind it: prune.
          return await this.#clearTpslJournal(settlementKey, null).catch(
            () => false,
          );
        }
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
          authToken,
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
   * @param context.authToken - Captured venue auth token.
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
    authToken: string;
    generation: number;
    readActiveRaw: () => Promise<LighterApiOrder[]>;
    readInactiveFor: (targetClientIds: number[]) => Promise<LighterApiOrder[]>;
    nextNonce: () => Promise<number>;
    submit: (
      txType: number,
      txInfo: string,
      onAccepted?: () => void,
      identity?: {
        txHash: string | null;
        expiresAt: number | null;
        intent?: string;
        owner?: string | null;
        beforeDispatch?: () => Promise<void>;
      },
    ) => Promise<LighterSendTxResponse>;
  }): Promise<boolean> => {
    const { settlementKey } = context;
    // The ENTIRE same-settlement state machine is serialized
    // PROCESS-WIDE: two live providers resolving the same operation
    // could otherwise both choose and submit identical restores/cancels
    // and overwrite each other's attempt state.
    return await withProcessMutex(
      `lighterTpslSettle:${this.#isTestnet ? 'testnet' : 'mainnet'}:${settlementKey}`,
      async () => await this.#settleTpslObligationLocked(context),
    );
  };

  /**
   * The settlement machine body — MUST only run under the per-settlement
   * process mutex (see #settleTpslObligation).
   *
   * @param context - See #settleTpslObligation.
   * @param context.settlementKey - Full settlement identity.
   * @param context.symbol - Market symbol.
   * @param context.journalEntry - Caller's journal snapshot (reloaded).
   * @param context.market - Market integerization parameters.
   * @param context.market.marketId - Venue market id.
   * @param context.market.supportedSizeDecimals - Size decimals.
   * @param context.market.supportedPriceDecimals - Price decimals.
   * @param context.accountIndex - Captured account index.
   * @param context.authToken - Captured venue auth token.
   * @param context.generation - Captured session generation.
   * @param context.readActiveRaw - Session-fenced raw active reader.
   * @param context.readInactiveFor - Targeted inactive reader.
   * @param context.nextNonce - Lock-section nonce issuer.
   * @param context.submit - Lock-section submitter.
   * @returns See #settleTpslObligation.
   */
  readonly #settleTpslObligationLocked = async (context: {
    settlementKey: string;
    symbol: string;
    journalEntry: TpslJournalState;
    market: {
      marketId: number;
      supportedSizeDecimals: number;
      supportedPriceDecimals: number;
    };
    accountIndex: number;
    authToken: string;
    generation: number;
    readActiveRaw: () => Promise<LighterApiOrder[]>;
    readInactiveFor: (targetClientIds: number[]) => Promise<LighterApiOrder[]>;
    nextNonce: () => Promise<number>;
    submit: (
      txType: number,
      txInfo: string,
      onAccepted?: () => void,
      identity?: {
        txHash: string | null;
        expiresAt: number | null;
        intent?: string;
        owner?: string | null;
        beforeDispatch?: () => Promise<void>;
      },
    ) => Promise<LighterSendTxResponse>;
  }): Promise<boolean> => {
    const {
      settlementKey,
      symbol,
      market,
      accountIndex,
      readActiveRaw,
      readInactiveFor,
      nextNonce,
      submit,
    } = context;
    // RELOAD inside the settlement mutex: the caller's snapshot may have
    // been superseded while waiting for the mutex — decisions must be
    // made on the CURRENT journal of the SAME operation only. Disk is
    // AUTHORITATIVE: absence means another resolver cleared it, so any
    // stale in-memory copy must be dropped, never resurrected.
    const journalEntry = await this.#loadTpslJournal(settlementKey);
    if (!journalEntry) {
      this.#tpslUnsettled.delete(settlementKey);
      return await this.#clearTpslJournal(settlementKey, null).catch(
        () => false,
      );
    }
    if (journalEntry.operationId !== context.journalEntry.operationId) {
      // A different operation owns the journal now: this resolver's
      // obligation no longer exists — report unresolved so the caller
      // re-evaluates against the fresh state.
      return false;
    }
    const successor = await this.#loadRecoverySuccessor(
      settlementKey,
      journalEntry.operationId,
    );
    this.#assertSession(context.generation);
    if (successor && successor.state !== 'failed') {
      return false;
    }
    if (
      journalEntry.sourceRecoveryOperationId &&
      journalEntry.sourceRecoverySettlementKey
    ) {
      const linked = await this.#loadRecoverySuccessor(
        journalEntry.sourceRecoverySettlementKey,
        journalEntry.sourceRecoveryOperationId,
      );
      this.#assertSession(context.generation);
      if (
        linked?.state === 'failed' &&
        linked.successorOperationId === journalEntry.operationId &&
        linked.successorSettlementKey === settlementKey
      ) {
        // Failure retirement may have stopped after its durable marker.
        // Replay only exact cleanup; never retry the failed financial intent.
        await this.#clearTpslJournal(settlementKey, journalEntry.operationId);
        this.#assertSession(context.generation);
        return false;
      }
      if (
        linked?.state === 'settled' &&
        linked.successorOperationId === journalEntry.operationId &&
        linked.successorSettlementKey === settlementKey
      ) {
        await this.#finalizeRecoverySuccessor(linked, context.generation);
        return true;
      }
    }
    await this.#assertRecoverySource(journalEntry, context.generation);
    const reconciled = await this.#reconcilePriorTpsl(
      readActiveRaw,
      readInactiveFor,
      accountIndex,
      journalEntry,
    );
    if (reconciled === 'unresolved') {
      return false;
    }
    // Diagnose retained coverage before issuing any remaining cancellations.
    await this.#verifyRetainedRecoveryCoverage(
      journalEntry,
      readActiveRaw,
      readInactiveFor,
    );
    await this.#discardManagedTpslIds(
      settlementKey,
      journalEntry.attempts.flatMap((attempt) =>
        attempt.kind === 'create' &&
        (attempt.neverLanded === true ||
          getLighterTransactionOutcome(attempt.terminalStatus) === 'failed')
          ? attempt.clientIds.map(String)
          : [],
      ),
    );
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
      await this.#assertRecoverySource(journalEntry, context.generation);
      const cancelNonce = await nextNonce();
      const signedCancel = await this.#getSignerBridge().execute({
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
        attemptId: nextAttemptIdFor(journalEntry),
        nonce: cancelNonce,
        outcome: 'unknown',
        orderId,
        txHash: cancelIdentity.txHash,
        expiresAt: cancelIdentity.expiresAt,
        role,
      };
      journalEntry.attempts.push(cancelAttempt);
      await persistEntry();
      await submit(
        LIGHTER_TX_TYPE_CANCEL_ORDER,
        signedCancel.txInfo,
        () => {
          cancelAttempt.outcome = 'accepted';
        },
        {
          txHash: cancelIdentity.txHash,
          expiresAt: cancelIdentity.expiresAt,
          owner: journalEntry.operationId,
          beforeDispatch: async () =>
            this.#assertRecoverySource(journalEntry, context.generation),
        },
      );
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
    // Aggregation groups parallel to createdClientIds: one group per
    // create ATTEMPT (grouped OCO semantics within, independence across).
    const createdGroups: number[][] = [];
    const pushCreatedGroup = (group: number[]): void => {
      createdClientIds.push(...group);
      createdGroups.push(group);
    };
    const cancelPriorLeftovers = async (): Promise<void> => {
      // The replacement must STAY proven while the old protection is
      // removed: keep its live ids in the final expectation so a leg
      // terminal-failing DURING these cancels (the phase race) fails
      // this pass instead of clearing the journal naked. Grouped per
      // replacement ATTEMPT: an executed OCO leg legitimately
      // auto-cancels its sibling.
      for (const attempt of journalEntry.attempts) {
        if (attempt.kind !== 'create' || attempt.role !== 'replacement') {
          continue;
        }
        const activeLegs = attempt.clientIds.filter(
          (clientId) => stateOf(clientId) === 'active',
        );
        if (activeLegs.length > 0) {
          pushCreatedGroup(attempt.clientIds);
        }
      }
      for (const prior of journalEntry.priorTriggers) {
        if (priorActive(prior)) {
          await submitRecoveryCancel(prior.orderId, 'stale');
          cancelledOrderIds.push(prior.orderId);
        }
      }
    };
    const rollbackActiveJournalledLegs = async (
      legIds: number[],
    ): Promise<void> => {
      for (const clientId of legIds) {
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
    const rollbackActiveReplacements = async (): Promise<void> =>
      await rollbackActiveJournalledLegs(replacementIds);
    // COMPACTION: proven-resolved attempts with no live effect and no
    // coverage are dropped so repeated retries can never dead-end at the
    // attempt cap: FAILED restore creates (never landed/terminal-failed)
    // and resolved cancels (target gone, or proven never-landed).
    const compactionNow = Date.now();
    journalEntry.attempts = journalEntry.attempts.filter((attempt) => {
      if (attempt.kind === 'create') {
        return (
          attempt.role !== 'restore' ||
          attempt.clientIds.some((clientId) => stateOf(clientId) !== 'failed')
        );
      }
      const targetGone = !rawActive.some(
        (order) => String(order.orderIndex) === attempt.orderId,
      );
      const provenNeverLanded =
        attempt.outcome === 'unknown' &&
        compactionNow > attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS;
      // Accepted-but-terminal-FAILED cancels (venue status 0) landed
      // without mutating the books: proven-resolved, compactable.
      const landedTerminalFailed =
        getLighterTransactionOutcome(attempt.terminalStatus) === 'failed';
      return !(targetGone || provenNeverLanded || landedTerminalFailed);
    });
    // NO AUTOMATIC RESTORE: the venue exposes no atomic primitive that
    // could prove a re-created trigger attaches to the SAME position
    // lifecycle, so a fully-failed replacement after old cancels parks
    // the journal in a DURABLE 'manual' state — surfaced via
    // `getPendingManualRecoveries` and resolved only by an explicit NEW
    // protection intent from the user. Never restored, never silently
    // cleared.
    const parkManual = async (reason: string): Promise<boolean> => {
      // Survivors: prior triggers still on the books + replacement legs
      // still active — deliberately LEFT (only remaining protection).
      const survivingOrderIds = [
        ...new Set([
          ...journalEntry.priorTriggers
            .filter((prior) => priorActive(prior))
            .map((prior) => prior.orderId),
          ...rawActive
            .filter((order) =>
              replacementIds.some(
                (clientId) =>
                  String(order.clientOrderIndex) === String(clientId),
              ),
            )
            .map((order) => String(order.orderIndex)),
        ]),
      ];
      // The DURABLE warning lives in its own doc; the journal slot is
      // released so a successor protection intent can run. The doc
      // clears only after a successor SUCCEEDS.
      if (journalEntry.sourceRecoveryOperationId) {
        await this.#finishRecoverySuccessor(
          journalEntry,
          'failed',
          rawActive,
          context.generation,
        );
      } else {
        await this.#writeTpslManualRecovery({
          settlementKey,
          symbol,
          reason,
          priorIntent: journalEntry.intent,
          priorTriggers: journalEntry.priorTriggers,
          survivingOrderIds,
          operationId: journalEntry.operationId,
          recordedAt: Date.now(),
        });
      }
      this.#deps.debugLogger.log(
        '[LighterProvider] TP/SL protection requires MANUAL re-establishment',
        { settlementKey, reason },
      );
      await this.#clearTpslJournal(
        settlementKey,
        journalEntry.operationId,
        await readActiveRaw(),
      );
      return true;
    };
    if (journalEntry.phase === 'manual') {
      // Journal parked 'manual' by an earlier version: migrate the
      // warning into the dedicated durable doc.
      return await parkManual(
        'TP/SL protection could not be safely re-established automatically (parked by an earlier session)',
      );
    }
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
      } else {
        // Replacement fully failed (or degraded to a partial set) AFTER
        // old cancels began: the position's protection can no longer be
        // proven — park durably for MANUAL re-establishment. Any
        // surviving leg is deliberately LEFT (it is the only protection
        // remaining); nothing is restored.
        return await parkManual(
          'Replacement TP/SL orders failed after the previous protection cancels began; the position may be under-protected',
        );
      }
    }
    if (cancelledOrderIds.length > 0 || createdClientIds.length > 0) {
      const settled = await this.#awaitTpslVisibility(
        readActiveRaw,
        readInactiveFor,
        { createdClientIds, cancelledOrderIds },
        // PER-ATTEMPT groups: a grouped OCO replacement's executed leg
        // legitimately auto-cancels its sibling.
        { createdGroups },
      );
      // ONLY a fully-settled pass may clear; a replacement dying DURING
      // the old cancels parks for manual re-establishment.
      if (settled.outcome === 'timeout') {
        return false;
      }
      if (settled.outcome === 'created-terminal-failed') {
        return await parkManual(
          'Replacement TP/SL order was cancelled or rejected by the venue after the previous protection was already removed',
        );
      }
    }
    // Persist terminal successor disposition before journal removal so a
    // restarted caller cannot replay an already completed explicit intent.
    await this.#verifyRetainedRecoveryCoverage(
      journalEntry,
      readActiveRaw,
      readInactiveFor,
    );
    await this.#finishRecoverySuccessor(
      journalEntry,
      journalEntry.intent === 'remove' ||
        anySuccess ||
        (anyActive && !anyFailed)
        ? 'settled'
        : 'failed',
      await readActiveRaw(),
      context.generation,
    );
    // A refused clear (superseded by a newer operation) is UNRESOLVED —
    // never reported as success.
    return await this.#clearTpslJournal(
      settlementKey,
      journalEntry.operationId,
      await readActiveRaw(),
    );
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
   * @param apiKeyIndex - Original attempt slot, independent of the successor key.
   * @returns 'resolved' when safe to proceed; 'unresolved' when an
   * ACCEPTED mutation is still not visible.
   */
  readonly #reconcilePriorTpsl = async (
    readActiveRaw: () => Promise<LighterApiOrder[]>,
    readInactive: (targetClientIds: number[]) => Promise<LighterApiOrder[]>,
    accountIndex: number,
    entry: { attempts: TpslAttempt[]; recordedAt: number },
    apiKeyIndex = this.#apiKeyIndex,
  ): Promise<'resolved' | 'unresolved'> => {
    const generation = this.#sessionGeneration;
    this.#assertSession(generation);
    for (const attempt of entry.attempts) {
      if (attempt.kind === 'create') {
        delete attempt.neverLanded;
      }
    }
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
        this.#assertSession(generation);
      } catch {
        // Lookup failure is AMBIGUOUS, never evidence of non-acceptance.
        return 'unresolved';
      }
      if (lookedUp !== null) {
        // The exact signed hash exists at the venue. With a matching
        // identity (hash + account + api key slot + nonce):
        //  - terminal FAILED status (0) resolves the attempt
        //    deterministically — the nonce was consumed but the books
        //    were never mutated (the machine re-acts on book state);
        //  - executed (2) or pending-final (3) with books reflecting the
        //    attempt resolves it;
        //  - otherwise it reached the sequencer but is not yet visible —
        //    keep blocking. A NON-matching payload under this hash fails
        //    closed identically, and is logged (signer/venue defect).
        const matchesIdentity =
          typeof lookedUp.hash === 'string' &&
          lookedUp.hash.toLowerCase().replace(/^0x/u, '') ===
            attempt.txHash.toLowerCase().replace(/^0x/u, '') &&
          lookedUp.accountIndex === accountIndex &&
          lookedUp.apiKeyIndex === apiKeyIndex &&
          lookedUp.nonce === attempt.nonce;
        if (!matchesIdentity) {
          this.#deps.debugLogger.log(
            '[LighterProvider] TP/SL tx lookup identity mismatch; failing closed',
            { txHash: attempt.txHash },
          );
          return 'unresolved';
        }
        const transactionOutcome = getLighterTransactionOutcome(
          lookedUp.status,
        );
        if (transactionOutcome === 'failed') {
          // Record the terminal venue status durably (next persist):
          // compaction can then drop this attempt even though its target
          // may still be on the books.
          attempt.terminalStatus = lookedUp.status;
          continue;
        }
        if (
          (transactionOutcome === 'executed' ||
            transactionOutcome === 'pending-final') &&
          satisfiedOnBooks(attempt, rawActive, rawInactive)
        ) {
          continue;
        }
        // Executed proves the transaction landed, but the order books may
        // still lag. Keep the journal until the expected create/cancel state
        // is visible.
        return 'unresolved';
      }
      // Venue-confirmed not-found: only never-landed once the signed
      // payload can no longer be accepted.
      if (
        attempt.outcome === 'accepted' ||
        Date.now() <= attempt.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS
      ) {
        // Observed acceptance cannot become never-landed due to a later
        // missing lookup or book lag. Retain its obligation until proven.
        return 'unresolved';
      }
      if (attempt.kind === 'create') {
        attempt.neverLanded = true;
      }
      // Expired and venue-confirmed absent: authoritatively never landed —
      // its reserved nonce may be released UNLESS a later dispatch (a
      // retry) already consumed it (durable consumed watermark guards).
      this.#assertSession(generation);
      await this.#releaseNonceReservationIfUnconsumed(
        accountIndex,
        attempt.nonce,
        apiKeyIndex,
      );
    }
    return 'resolved';
  };

  /**
   * Release a session-global nonce reservation once a submission is
   * PROVEN never-landed. Only the topmost reservation can be safely
   * lowered; anything else stays reserved until proven in turn.
   *
   * @param apiKeyIndex - Key slot captured for this operation.
   * @param accountIndex - Venue account index.
   * @param nonce - The proven-unconsumed nonce.
   */
  readonly #releaseNonceReservation = (
    accountIndex: number,
    nonce: number,
    apiKeyIndex = this.#apiKeyIndex,
  ): void => {
    const reservationKey = `${accountIndex}:${apiKeyIndex}`;
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
   * @param options - Aggregation options.
   * @param options.createdGroups - Per-attempt aggregation groups over
   * the created ids (see inline doc).
   * @param options.receiptIdentity - Account and market bound to a new receipt.
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
    options: {
      /**
       * PER-ATTEMPT aggregation groups over `createdClientIds`: within a
       * group, grouped-OCO semantics hold (one fully executed leg
       * legitimately auto-cancels its sibling — the GROUP succeeded);
       * ACROSS groups every group must independently succeed or rest
       * active. Omitted: all created ids form one group (legacy grouped
       * semantics).
       */
      createdGroups?: number[][];
      /** Require exact venue IDs for the current operation receipt. */
      receiptIdentity?: { accountIndex: number; marketIndex: number };
    } = {},
  ): Promise<
    | { outcome: 'settled'; executedCreated: boolean; childOrderIds: string[] }
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
      const childOrderIds: string[] = [];
      if (options.receiptIdentity) {
        for (const clientId of expectation.createdClientIds) {
          const active = rawActive.filter(
            (row) => String(row.clientOrderIndex) === String(clientId),
          );
          const matches =
            active.length > 0
              ? active
              : rawInactive.filter(
                  (row) => String(row.clientOrderIndex) === String(clientId),
                );
          if (matches.length === 0) {
            continue; // Existing settlement polling retains the obligation.
          }
          const [row] = matches;
          if (
            matches.length !== 1 ||
            row.ownerAccountIndex !== options.receiptIdentity.accountIndex ||
            row.marketIndex !== options.receiptIdentity.marketIndex ||
            !Number.isSafeInteger(row.orderIndex) ||
            row.orderIndex <= 0 ||
            childOrderIds.includes(String(row.orderIndex))
          ) {
            throw new Error(
              'Lighter TP/SL receipt identity is invalid or ambiguous',
            );
          }
          childOrderIds.push(String(row.orderIndex));
        }
      }
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
        // PER-GROUP aggregation: within a group one fully executed leg
        // auto-cancels its sibling (grouped OCO — the GROUP succeeded);
        // across groups each must independently succeed or rest active.
        const groups =
          options.createdGroups ??
          (expectation.createdClientIds.length > 0
            ? [expectation.createdClientIds]
            : []);
        const stateOfId = new Map(
          classified.map((entry) => [entry.clientId, entry.state]),
        );
        let anyGroupSuccess = false;
        const failedGroupActiveIds: number[] = [];
        let anyGroupFailed = false;
        for (const group of groups) {
          const states = group.map(
            (clientId) => stateOfId.get(clientId) ?? 'missing',
          );
          if (states.includes('success')) {
            anyGroupSuccess = true;
            continue;
          }
          if (states.includes('failed')) {
            anyGroupFailed = true;
            failedGroupActiveIds.push(
              ...group.filter(
                (clientId) => stateOfId.get(clientId) === 'active',
              ),
            );
          }
        }
        if (anyGroupFailed) {
          return {
            outcome: 'created-terminal-failed',
            survivingActiveClientIds: failedGroupActiveIds,
          };
        }
        return {
          outcome: 'settled',
          executedCreated: anyGroupSuccess,
          childOrderIds,
        };
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
    if (this.#isDisconnected) {
      throw new LighterSessionCancelledError(
        'the Lighter provider was disconnected',
      );
    }
    if (generation !== this.#sessionGeneration) {
      throw new LighterSessionCancelledError(
        'the wallet switched accounts (or the signer reset) while this operation was in flight',
      );
    }
    // The generation only advances when some provider call rebinds; also
    // notice a wallet switch nothing has observed yet. Account-bound work
    // must never run without a binding: every legitimate flow (including
    // configured-index setups) binds first, so a null binding here means the
    // wallet was deselected — fail closed even when a configured account
    // index could still resolve.
    if (this.#boundAddress === null) {
      throw new LighterSessionCancelledError(
        'no wallet account is bound to the venue session',
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
      throw new LighterSessionCancelledError(
        'the wallet switched accounts (or the signer reset) while this operation was in flight',
      );
    }
  };

  /** Drop every cache derived from the previously bound account. */
  readonly #invalidateSessionState = (): void => {
    this.#sessionGeneration += 1;
    this.#boundAddress = null;
    this.#accountIndex = null;
    this.#apiKeyIndex = this.#preferredApiKeyIndex;
    this.#signerReadyPromise = null;
    this.#readyApiKeyIndex = null;
    this.#authToken = null;
    this.#clearBridgeOwnership();
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
    this.#assertSession(this.#sessionGeneration);
    if (this.#signerReadyPromise) {
      return await this.#signerReadyPromise;
    }
    const generation = this.#sessionGeneration;
    this.#readyApiKeyIndex = null;
    const setupPromise = this.#setupSigner(generation);
    this.#signerReadyPromise = setupPromise;
    try {
      return await setupPromise;
    } catch (error) {
      // Only clear the promise WE installed — a newer session may already
      // have replaced it, and an old rejection must not tear that down.
      if (this.#signerReadyPromise === setupPromise) {
        this.#signerReadyPromise = null;
        this.#readyApiKeyIndex = null;
        this.#apiKeyIndex = this.#preferredApiKeyIndex;
        this.#clearBridgeOwnership();
      }
      throw error;
    }
  };

  /**
   * Find local keys first, then unused slots. Never replace a venue key.
   *
   * @param accountIndex - Venue account whose local keys may be reused.
   * @param generation - Session captured before storage and venue reads.
   * @returns Locally persisted slots followed by unused trading slots.
   */
  readonly #signerCandidates = async (
    accountIndex: number,
    generation: number,
  ): Promise<number[]> => {
    const bridge = this.#getSignerBridge();
    const discoverKeys =
      bridge.getRecoverableKeyIndices?.bind(bridge) ??
      bridge.getStoredKeyIndices?.bind(bridge);
    if (!discoverKeys) {
      return [this.#preferredApiKeyIndex];
    }
    const response = await this.#clientService.getApiKeys(accountIndex);
    this.#assertSession(generation);
    const occupied = new Set(response.apiKeys.map((key) => key.apiKeyIndex));
    const requested = [
      ...new Set([this.#preferredApiKeyIndex, ...occupied]),
    ].filter(
      (index) =>
        Number.isSafeInteger(index) &&
        index >= LIGHTER_MIN_TRADING_API_KEY_INDEX &&
        index <= LIGHTER_MAX_TRADING_API_KEY_INDEX,
    );
    const stored = await discoverKeys({
      chainId: getLighterChainId(this.#clientService.network),
      accountIndex,
      apiKeyIndices: requested,
      walletAddress: this.#boundAddress ?? undefined,
    });
    this.#assertSession(generation);
    if (stored.some((index) => !requested.includes(index))) {
      throw new Error('Lighter signer returned an unrequested key slot');
    }
    const unused = Array.from(
      { length: LIGHTER_TRADING_API_KEY_COUNT },
      (_, index) => index + LIGHTER_MIN_TRADING_API_KEY_INDEX,
    ).filter((index) => !occupied.has(index));
    if (
      stored.length === 0 &&
      occupied.has(this.#preferredApiKeyIndex) &&
      unused.length > 0
    ) {
      throw new Error(
        'No recoverable Lighter trading key is available from this wallet or local storage. Use an existing registered device.',
      );
    }
    // Wallet-derived recovery uses a stable free-slot order. Storage-only
    // discovery rotates unused slots; venue public keys are always checked.
    const offset = bridge.getRecoverableKeyIndices
      ? 0
      : Math.floor(Math.random() * unused.length);
    const randomized = [...unused.slice(offset), ...unused.slice(0, offset)];
    return [
      ...new Set([
        ...stored.filter((index) => occupied.has(index)),
        ...stored.filter((index) => !occupied.has(index)),
        ...(requested.includes(this.#preferredApiKeyIndex) &&
        !occupied.has(this.#preferredApiKeyIndex)
          ? [this.#preferredApiKeyIndex]
          : []),
        ...randomized,
      ]),
    ];
  };

  readonly #setupSigner = async (generation: number): Promise<void> => {
    const bridge = this.#getSignerBridge();
    const accountIndex = await this.#ensureAccountIndex();
    this.#assertSession(generation);
    const chainId = getLighterChainId(this.#clientService.network);
    const candidates = await this.#signerCandidates(accountIndex, generation);
    for (const apiKeyIndex of candidates) {
      let candidateNonce = 0;
      let changePubKeyBody = '';
      let candidateStatus: 'available' | 'matching' = 'matching';
      // Inspect identity under the same slot and bridge locks as writes.
      // An unrelated key's ledger must not block discovery of our key.
      const ready = await this.#withVenueWriteLock(
        accountIndex,
        async (nextNonce, submit) => {
          if (candidateStatus === 'available') {
            // Reconciliation can raise the nonce floor. The registration
            // plaintext must bind to the safe nonce, not the probe's seed.
            const nonce = await nextNonce();
            if (nonce !== candidateNonce) {
              const created = await bridge.createClient({
                chainId,
                accountIndex,
                nonce,
                apiKeyIndex,
                walletAddress: this.#boundAddress ?? undefined,
              });
              this.#assertSession(generation);
              if (
                created.error ||
                !created.success ||
                created.pk !== this.#venuePublicKey
              ) {
                throw new Error(
                  'Lighter signer identity changed during registration preparation',
                );
              }
              changePubKeyBody = created.body;
            }
            await this.#registerVenueKey(
              accountIndex,
              changePubKeyBody,
              generation,
              async () => nonce,
              submit,
            );
            this.#assertSession(generation);
            if (bridge.getRecoverableKeyIndices || bridge.getStoredKeyIndices) {
              await this.#waitForRegisteredKey(accountIndex, generation);
            }
          }
          return true;
        },
        generation,
        apiKeyIndex,
        async () => {
          const nonceResponse = await this.#clientService.getNextNonce(
            accountIndex,
            apiKeyIndex,
          );
          this.#assertSession(generation);
          candidateNonce = nonceResponse.nonce;
          const created = await bridge.createClient({
            chainId,
            accountIndex,
            nonce: candidateNonce,
            apiKeyIndex,
            walletAddress: this.#boundAddress ?? undefined,
          });
          if (created.error || !created.success) {
            throw new Error(
              `Lighter signer client creation failed: ${created.error ?? 'unknown'}`,
            );
          }
          this.#assertSession(generation);
          this.#venuePublicKey = created.pk;
          this.#signerIdentity = `${this.#clientService.network}:${accountIndex}:${apiKeyIndex}`;
          this.#signerRecreateParams = { chainId, accountIndex };
          bridgeClientOwners.set(this.#rawSignerBridge(), this.#signerIdentity);
          changePubKeyBody = created.body;
          const status = await this.#venueKeyStatus(accountIndex);
          this.#assertSession(generation);
          if (status === 'occupied') {
            this.#clearBridgeOwnership();
            if (
              !bridge.getRecoverableKeyIndices &&
              !bridge.getStoredKeyIndices
            ) {
              throw new Error(
                `Lighter API key slot ${String(apiKeyIndex)} already contains a different key; reconnect with a client that supports device-key recovery`,
              );
            }
            return { result: false };
          }
          candidateStatus = status;
        },
      );
      if (ready) {
        this.#assertSession(generation);
        this.#readyApiKeyIndex = apiKeyIndex;
        this.#kickTpslRecovery();
        return;
      }
    }
    throw new Error(
      'No available Lighter trading key slot. Remove an unused API key in Lighter, then reconnect.',
    );
  };

  readonly #venueKeyStatus = async (
    accountIndex: number,
  ): Promise<'available' | 'matching' | 'occupied'> => {
    const response = await this.#clientService.getApiKeys(accountIndex);
    const configuredSlot = response.apiKeys.find(
      (key) => key.apiKeyIndex === this.#apiKeyIndex,
    );
    if (!configuredSlot) {
      return 'available';
    }
    const normalizeKey = (key: string | null): string =>
      (key ?? '').replace(/^0x/u, '').toLowerCase();
    return normalizeKey(configuredSlot.publicKey) ===
      normalizeKey(this.#venuePublicKey)
      ? 'matching'
      : 'occupied';
  };

  /**
   * Wait for registration visibility before authenticating against a new slot.
   * A successful send only establishes acceptance, not indexed read readiness.
   *
   * @param accountIndex - Account whose registration was just submitted.
   * @param generation - Session that owns the registration.
   */
  readonly #waitForRegisteredKey = async (
    accountIndex: number,
    generation: number,
  ): Promise<void> => {
    const deadline =
      Date.now() + LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS;
    for (
      let attempt = 0;
      attempt < LIGHTER_KEY_REGISTRATION_VISIBILITY_MAX_ATTEMPTS;
      attempt += 1
    ) {
      this.#assertSession(generation);
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        break;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const status = await Promise.race([
        this.#venueKeyStatus(accountIndex),
        new Promise<'pending'>((resolve) => {
          timer = setTimeout(() => resolve('pending'), remaining);
        }),
      ]).finally(() => clearTimeout(timer));
      this.#assertSession(generation);
      if (status === 'pending') {
        break;
      }
      if (status === 'matching') {
        return;
      }
      if (status === 'occupied') {
        throw new Error('Lighter trading key changed during registration');
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS),
      );
    }
    throw new Error(
      'Lighter trading key registration is still pending; reconnect to check its status',
    );
  };

  readonly #registerVenueKey = async (
    accountIndex: number,
    changePubKeyBody: string,
    generation: number,
    nextNonce: () => Promise<number>,
    submit: (
      txType: number,
      txInfo: string,
      onAccepted?: () => void,
      identity?: {
        txHash: string | null;
        expiresAt: number | null;
        intent?: string;
        owner?: string | null;
      },
    ) => Promise<LighterSendTxResponse>,
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
    const signed = await bridge.execute({
      function: '_signChangePubKey',
      params: [accountIndex, l1Signature, nonce, this.#apiKeyIndex],
    });
    if (signed.error) {
      throw new Error(`Lighter ChangePubKey signing failed: ${signed.error}`);
    }
    this.#assertSession(generation);
    const result = await submit(
      LIGHTER_TX_TYPE_CHANGE_PUB_KEY,
      signed.txInfo,
      undefined,
      extractDispatchIdentity(signed),
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
      const [high, low] = randomUint24Pair();
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
   * @param apiKeyIndex - Slot captured when this section was queued.
   * @param inspectCandidate - Optional read-only identity inspection before
   * ledger resolution. A nonmatching candidate may return without reading or
   * changing its unrelated ledger. Matching/available candidates retain all
   * nonce safeguards before the write section runs.
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
        identity?: {
          txHash: string | null;
          expiresAt: number | null;
          intent?: string;
          owner?: string | null;
          beforeDispatch?: () => Promise<void>;
          onNotDispatched?: () => Promise<void>;
        },
      ) => Promise<LighterSendTxResponse>,
    ) => Promise<Result>,
    generationAtIntent = this.#sessionGeneration,
    apiKeyIndex = this.#apiKeyIndex,
    inspectCandidate?: () => Promise<{ result: Result } | void>,
  ): Promise<Result> => {
    const criticalSection = async (): Promise<Result> => {
      this.#assertSession(generationAtIntent);
      if (this.#apiKeyIndex !== apiKeyIndex) {
        this.#clearBridgeOwnership();
      }
      this.#apiKeyIndex = apiKeyIndex;
      if (inspectCandidate) {
        const inspected = await inspectCandidate();
        this.#assertSession(generationAtIntent);
        if (inspected) {
          return inspected.result;
        }
      }
      await this.#rememberRecoveryAccount(accountIndex, generationAtIntent);
      this.#assertSession(generationAtIntent);
      // Every unresolved prior dispatch (this session OR a previous one —
      // the ledger is durable) must resolve before this section may issue
      // nonces: a restart would otherwise reuse a consumed-but-lagging
      // nonce, and a proven never-landed dispatch must release its nonce.
      // Key discovery/registration must remain possible without touching an
      // unrelated candidate's obligations. Financial operations, however,
      // cannot escape account-local quarantine by switching signing slots.
      if (!inspectCandidate) {
        for (
          let previousSlot = LIGHTER_MIN_TRADING_API_KEY_INDEX;
          previousSlot <= LIGHTER_MAX_TRADING_API_KEY_INDEX;
          previousSlot += 1
        ) {
          this.#assertSession(generationAtIntent);
          if (previousSlot !== apiKeyIndex) {
            await this.#resolveNonceLedger(accountIndex, previousSlot);
            this.#assertSession(generationAtIntent);
          }
        }
      }
      await this.#resolveNonceLedger(accountIndex, apiKeyIndex);
      this.#assertSession(generationAtIntent);
      // Monotonic nonce reservation: the venue's nextNonce endpoint can
      // LAG accepted submissions. The floor is SESSION-GLOBAL per
      // accountIndex:apiKeyIndex — a queued/next lock section (any
      // symbol, any operation) must never be handed a nonce an earlier
      // submission may have consumed, even when that submission's
      // response was lost. Reservation advances at DISPATCH (a signing
      // failure never burns a nonce the venue still expects); a proven
      // never-landed submission releases it again via reconciliation.
      const reservationKey = `${accountIndex}:${apiKeyIndex}`;
      let lastIssuedNonce: number | null = null;
      const nextNonce = async (): Promise<number> => {
        // Re-fenced on every fetch AND after it resolves: the account can
        // switch between the section's own await points, not only while it
        // sat in the queue.
        this.#assertSession(generationAtIntent);
        const nonceResponse = await this.#clientService.getNextNonce(
          accountIndex,
          apiKeyIndex,
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
      // BRIDGE OWNERSHIP: the WASM client is a singleton per bridge —
      // another provider (different account/network sharing the bridge)
      // may have overwritten it since our setup. Re-establish OUR client
      // before any signing in this section. (During initial setup the
      // identity is not yet recorded; setup itself creates the client.)
      if (
        this.#signerIdentity !== null &&
        this.#signerRecreateParams !== null &&
        bridgeClientOwners.get(this.#rawSignerBridge()) !== this.#signerIdentity
      ) {
        await this.#reestablishSignerClient(
          generationAtIntent,
          await nextNonce(),
        );
      }
      const submit = async (
        txType: number,
        txInfo: string,
        onAccepted?: () => void,
        identity?: {
          txHash: string | null;
          expiresAt: number | null;
          intent?: string;
          owner?: string | null;
          beforeDispatch?: () => Promise<void>;
          onNotDispatched?: () => Promise<void>;
        },
      ): Promise<LighterSendTxResponse> => {
        // Last fence before anything reaches the venue: a switch that
        // happened while SIGNING must abort before submission.
        this.#assertSession(generationAtIntent);
        // Record the dispatch DURABLY BEFORE anything else: a failed
        // ledger read/write means NO dispatch and an UNTOUCHED memory
        // floor — the nonce stays safely unissued at the venue. The
        // identity comes from the SIGNING RESULT (pinned WASM contract:
        // txInfo never carries the hash).
        let ledgerEntry: LighterNonceLedgerDoc['entries'][number] | null = null;
        if (lastIssuedNonce !== null) {
          // COMPLETE identity is REQUIRED before anything reaches the
          // wire: a hashless dispatch could never be proven absent, so a
          // response loss would wedge writes until the venue advances.
          if (
            identity?.txHash === null ||
            identity?.expiresAt === null ||
            identity === undefined
          ) {
            throw new Error(
              'Lighter dispatch refused: the signing result did not provide a complete transaction identity (hash + expiry)',
            );
          }
          ledgerEntry = {
            nonce: lastIssuedNonce,
            txHash: identity.txHash,
            expiresAt: identity.expiresAt,
            kind: txType,
            intent: identity.intent ?? `txType:${txType}`,
            owner: identity.owner ?? null,
          };
          const appendedEntry = ledgerEntry;
          await this.#withLedgerLock(
            accountIndex,
            async () => {
              const doc = await this.#readNonceLedger(
                accountIndex,
                apiKeyIndex,
              );
              if (doc.entries.length >= 16) {
                throw new Error(
                  'Too many unresolved Lighter dispatches; refusing further writes until they resolve',
                );
              }
              await this.#writeNonceLedger(
                accountIndex,
                {
                  consumedFloor: doc.consumedFloor,
                  entries: [...doc.entries, appendedEntry],
                  recovered: doc.recovered,
                },
                apiKeyIndex,
              );
            },
            apiKeyIndex,
          );
          // Only AFTER the durable append: reserve in memory — from this
          // point the venue may consume the nonce even if the response
          // never arrives.
          this.#nonceReservations.set(reservationKey, lastIssuedNonce + 1);
        }
        // EVERY error path below keeps the durable entry — a coded venue
        // or HTTP error can mask a commit, so nothing short of an exact
        // authoritative reconciliation may release the nonce.
        // A switch after append leaves the unsent entry for conservative
        // reconciliation. It may block until signed expiry plus clock slack;
        // retaining uncertainty avoids treating a durable append as absent.
        try {
          await identity?.beforeDispatch?.();
          this.#assertSession(generationAtIntent);
        } catch (error) {
          // No transport call has occurred. Keep the final after-persistence
          // guard, but release only this exact proven-unsent attempt. A stale
          // session retains quarantine rather than touching another scope.
          this.#assertSession(generationAtIntent);
          await identity?.onNotDispatched?.();
          this.#assertSession(generationAtIntent);
          const unsentEntry = ledgerEntry;
          if (unsentEntry) {
            await this.#withLedgerLock(
              accountIndex,
              async () => {
                this.#assertSession(generationAtIntent);
                const doc = await this.#readNonceLedger(
                  accountIndex,
                  apiKeyIndex,
                );
                this.#assertSession(generationAtIntent);
                await this.#writeNonceLedger(
                  accountIndex,
                  {
                    ...doc,
                    entries: doc.entries.filter(
                      (entry) =>
                        entry.nonce !== unsentEntry.nonce ||
                        entry.txHash !== unsentEntry.txHash ||
                        entry.owner !== unsentEntry.owner,
                    ),
                  },
                  apiKeyIndex,
                );
                this.#assertSession(generationAtIntent);
                if (unsentEntry.nonce >= doc.consumedFloor) {
                  this.#releaseNonceReservation(
                    accountIndex,
                    unsentEntry.nonce,
                    apiKeyIndex,
                  );
                }
              },
              apiKeyIndex,
            );
          }
          throw error;
        }
        const response: LighterSendTxResponse =
          await this.#clientService.sendTx(txType, txInfo);
        // Acceptance bookkeeping runs SYNCHRONOUSLY before anything can
        // fail: a switch during network submission must cancel the
        // operation, never the record of an accepted venue mutation.
        onAccepted?.();
        // POST-SEND ORDER: evaluate the session fence BEFORE the ledger
        // entry transitions, then commit the transition ATOMICALLY in
        // ONE write under the ledger lock — fence pass → consumed/
        // removed; fence fail → recovered(SUCCEEDED). If that single
        // write fails, the ORIGINAL unresolved entry remains the durable
        // record and every retry stays blocked; the only durable proof
        // of the accepted mutation is never consumed first and
        // quarantined second.
        let fenceError: unknown = null;
        try {
          this.#assertSession(generationAtIntent);
        } catch (error) {
          fenceError = error;
        }
        if (ledgerEntry !== null) {
          await this.#resolveEntryPostDispatch(
            accountIndex,
            ledgerEntry,
            fenceError !== null,
            apiKeyIndex,
          ).catch(() => undefined);
        }
        if (fenceError !== null) {
          throw ensureError(fenceError, 'LighterProvider.submit');
        }
        return response;
      };
      return await section(nextNonce, submit);
    };
    // The ENTIRE nonce resolve→fetch→sign/append→dispatch sequence is
    // serialized PROCESS-WIDE per network+account across key slots: the
    // instance chain alone cannot stop a second live provider from
    // issuing the same nonce or interleaving ledger writes.
    const guardedSection = async (): Promise<Result> =>
      await withProcessMutex(
        `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
        // INNERMOST: the bridge mutex — the WASM client is a singleton
        // per bridge, so ensure-correct-client + every sign of a section
        // are serialized across ALL providers sharing the bridge.
        async () =>
          await withProcessMutex(
            bridgeMutexKey(this.#rawSignerBridge()),
            criticalSection,
          ),
      );
    const run = this.#writeChain.then(guardedSection, guardedSection);
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
        identity?: {
          txHash: string | null;
          expiresAt: number | null;
          intent?: string;
          owner?: string | null;
          beforeDispatch?: () => Promise<void>;
          onNotDispatched?: () => Promise<void>;
        },
      ) => Promise<LighterSendTxResponse>,
    ) => Promise<Result>,
    generationAtIntent = this.#sessionGeneration,
  ): Promise<Result> =>
    await this.#withVenueWriteLock(
      accountIndex,
      async (nextNonce, submit) => operation(await nextNonce(), submit),
      generationAtIntent,
    );

  /**
   * Re-create OUR venue client on the shared bridge after another
   * identity overwrote the singleton. MUST run while holding the bridge
   * mutex. The bridge owns key generation and persistence.
   *
   * @param generation - The caller's captured session generation.
   * @param nonce - A fresh venue nonce for the client creation.
   */
  readonly #reestablishSignerClient = async (
    generation: number,
    nonce: number,
  ): Promise<void> => {
    const recreateParams = this.#signerRecreateParams;
    const identity = this.#signerIdentity;
    if (recreateParams === null || identity === null) {
      throw new Error(
        'Lighter signer client re-establishment attempted before setup',
      );
    }
    this.#assertSession(generation);
    const recreated = await this.#getSignerBridge().createClient({
      chainId: recreateParams.chainId,
      accountIndex: recreateParams.accountIndex,
      nonce,
      apiKeyIndex: this.#apiKeyIndex,
      walletAddress: this.#boundAddress ?? undefined,
    });
    if (recreated.error || !recreated.success) {
      throw new Error(
        `Lighter signer client re-establishment failed: ${recreated.error ?? 'unknown'}`,
      );
    }
    this.#assertSession(generation);
    bridgeClientOwners.set(this.#rawSignerBridge(), identity);
  };

  readonly #getAuthToken = async (): Promise<string> => {
    this.#ensureSessionBinding();
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.#authToken && this.#authToken.deadline - nowSeconds > 60) {
      return this.#authToken.token;
    }
    const generation = this.#sessionGeneration;
    await this.#ensureSignerReady();
    const accountIndex = await this.#ensureAccountIndex();
    // The auth-token mint is a singleton-client call like any other sign:
    // it runs under the BRIDGE LEASE, and re-establishes OUR client first
    // when another identity has since overwritten it — otherwise the
    // token would be minted by the wrong account's venue key.
    const token = await withProcessMutex(
      bridgeMutexKey(this.#rawSignerBridge()),
      async () => {
        if (
          this.#signerIdentity !== null &&
          this.#signerRecreateParams !== null &&
          bridgeClientOwners.get(this.#rawSignerBridge()) !==
            this.#signerIdentity
        ) {
          // Client creation is bridge-local: the read-only nonce fetch
          // seeds its tracking without dispatching anything.
          const nonceResponse = await this.#clientService.getNextNonce(
            this.#signerRecreateParams.accountIndex,
            this.#apiKeyIndex,
          );
          this.#assertSession(generation);
          await this.#reestablishSignerClient(generation, nonceResponse.nonce);
        }
        return await this.#getSignerBridge().execute({
          function: '_createAuthToken',
          params: [accountIndex, this.#apiKeyIndex],
        });
      },
    );
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

  readonly #ensureMarkets = async (
    forceRefresh = false,
  ): Promise<Map<string, LighterOrderBookMeta>> => {
    if (forceRefresh || this.#marketsBySymbol.size === 0) {
      const result = await this.initialize();
      if (forceRefresh && !result.success) {
        throw new Error(result.error ?? 'Lighter market metadata unavailable');
      }
    }
    return this.#marketsBySymbol;
  };

  // ============================================================================
  // Market Data Operations (Public Reads)
  // ============================================================================

  /**
   * Report native standalone triggers for an active, known market. Explicit
   * margin modes and strategies remain unreported until their write paths exist.
   *
   * @param params - Market route to inspect.
   * @returns Native trigger types or the reason the market is unavailable.
   */
  async getOrderCapabilities(
    params: GetOrderCapabilitiesParams,
  ): Promise<DirectProviderOrderCapabilities> {
    const unavailable = (
      reason: DirectProviderOrderCapabilitiesUnavailableReason,
    ): DirectProviderOrderCapabilities =>
      Object.freeze({
        status: 'unavailable',
        providerId: this.protocolId,
        reason,
      });
    if (!params.symbol.trim()) {
      return unavailable('invalid_symbol');
    }
    if (this.#isDisconnected) {
      return unavailable('provider_unavailable');
    }
    let markets: Map<string, LighterOrderBookMeta>;
    try {
      markets = await this.#ensureMarkets(true);
    } catch {
      return unavailable('provider_unavailable');
    }
    if (this.#isDisconnected) {
      return unavailable('provider_unavailable');
    }
    const market = markets.get(params.symbol);
    if (!market) {
      return unavailable('market_not_found');
    }
    if (market.status !== 'active') {
      return unavailable('order_market_unsupported');
    }
    return Object.freeze({
      status: 'ready',
      providerId: this.protocolId,
      supportedStrategies: Object.freeze([]),
      supportedTriggerOrderTypes: Object.freeze([...TRIGGER_ORDER_TYPES]),
      positionTpsl: Object.freeze({
        supportsExpectedPosition: true,
        childOrderIds: 'request-correlated',
        takeProfitOrderType: 'take_profit_market',
        stopLossOrderType: 'stop_market',
      }),
    });
  }

  async getMarkets(_params?: GetMarketsParams): Promise<MarketInfo[]> {
    try {
      const markets = await this.#clientService.getOrderBooks();
      await this.#ensureMarketMargins();
      return markets
        .filter((market) => market.marketType === 'perp')
        .flatMap((market) => {
          const margins = this.#marginBySymbol.get(market.symbol);
          if (!margins) {
            // #ensureMarketMargins deliberately omits inactive rows whose
            // retired risk metadata cannot produce a canonical MarketInfo.
            if (market.status === 'inactive') {
              return [];
            }
            throw new Error(
              `${LIGHTER_DATA_INTEGRITY_PREFIX} missing authoritative leverage for ${market.symbol}`,
            );
          }
          const adapted = adaptMarketFromLighter(
            market,
            deriveLighterMaxLeverage(margins.minInitial, market.symbol),
          );
          // minBaseAmount and minQuoteAmount are maker-only. Market and
          // IOC orders can use one base-size tick, so the public universal
          // minimum must report that tick rather than the maker floor.
          delete adapted.minimumOrderSize;
          if (margins?.lastTradePrice && margins.lastTradePrice > 0) {
            const oneTickUsd =
              margins.lastTradePrice / 10 ** market.supportedSizeDecimals;
            if (Number.isFinite(oneTickUsd) && oneTickUsd > 0) {
              adapted.minimumOrderSize = oneTickUsd;
            }
          }
          return [adapted];
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
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        throw caughtError;
      }
      return [];
    }
  }

  async getMarketDataWithPrices(): Promise<PerpsMarketData[]> {
    try {
      const response = await this.#clientService.getOrderBookDetails();
      return response.orderBookDetails
        .filter((detail) => detail.marketType === 'perp')
        .filter((detail) => !isInactiveMarketWithoutUsableRiskMetadata(detail))
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
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
        throw caughtError;
      }
      return [];
    }
  }

  // ============================================================================
  // Account Operations
  // ============================================================================

  async getPositions(_params?: GetPositionsParams): Promise<Position[]> {
    this.#ensureSessionBinding();
    const generation = this.#sessionGeneration;
    // Risk metadata is required for every returned position. A transport
    // failure must reject instead of looking like an authoritative empty
    // account.
    await this.#ensureMarketMargins();
    try {
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
            this.#maxLeverageForPosition(position),
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

  /**
   * Report the margin mode Lighter currently binds to a market. Only an
   * open position locks the mode here: the venue refuses a mode change
   * while a position is open. Resting orders are not treated as a lock.
   *
   * @param params - Market and optional provider route.
   * @returns The current lock, or unavailable when it cannot be read.
   */
  async getMarginModeLock(
    params: GetMarginModeLockParams,
  ): Promise<PerpsMarginModeLock> {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const wireMarginMode = await this.#readPositionMarginMode(params.symbol);
      this.#assertSession(generation);
      if (wireMarginMode === null) {
        return { status: 'unlocked', providerId: this.protocolId };
      }
      return {
        status: 'locked',
        providerId: this.protocolId,
        marginMode:
          wireMarginMode === LIGHTER_MARGIN_MODE_ISOLATED
            ? 'isolated'
            : 'cross',
        reason: 'position',
      };
    } catch (error) {
      this.#deps.debugLogger.log(
        '[LighterProvider] getMarginModeLock unavailable',
        {
          symbol: params.symbol,
          error: ensureError(error, 'LighterProvider.getMarginModeLock')
            .message,
        },
      );
      return {
        status: 'unavailable',
        providerId: this.protocolId,
        reason: 'provider_unavailable',
      };
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
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
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
      if (
        this.#isUnsupportedCapabilityError(caughtError) ||
        this.#isDataIntegrityError(caughtError)
      ) {
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
    return `eip155:${chainId}:${address}`;
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
    // Tracks a COMMITTED leverage change so an order failing afterwards
    // reports the partial venue state explicitly instead of implying no
    // mutation happened.
    let leverageCommitted = false;
    try {
      if (params.marginMode !== undefined) {
        return {
          success: false,
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_UNSUPPORTED,
        };
      }
      if (
        params.orderType !== 'limit' &&
        params.orderType !== 'market' &&
        !isTriggerOrderType(params.orderType)
      ) {
        return { success: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
      }
      const triggerIntentError = getLighterTriggerIntentError(params);
      if (triggerIntentError) {
        return { success: false, error: triggerIntentError };
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
      const markets = await this.#ensureMarkets(
        isTriggerOrderType(params.orderType),
      );
      const market = markets.get(params.symbol);
      if (!market) {
        return {
          success: false,
          error: `Unknown Lighter market: ${params.symbol}`,
        };
      }
      if (isTriggerOrderType(params.orderType) && market.status !== 'active') {
        return {
          success: false,
          error: 'Lighter standalone triggers require an active market',
        };
      }
      if (isLimitExecutionOrderType(params.orderType) && !params.price) {
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
          ? (params.slippage ?? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000)
          : params.maxSlippageBps / 10_000;
      // The reference price sizes the order; market orders additionally get
      // a protection price offset by the slippage tolerance. They are kept
      // separate so usdAmount sizing is never distorted by the protection
      // offset.
      let referencePrice: number;
      const triggerPrices = isTriggerOrderType(params.orderType)
        ? resolveLighterTriggerPrices(params, market)
        : undefined;
      if (triggerPrices) {
        referencePrice = triggerPrices.referencePrice;
      } else if (params.orderType === 'limit') {
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
      let executionPrice = triggerPrices?.executionPrice ?? referencePrice;
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
        // A USD amount is approximate by contract (converted at the
        // reference price), so it is snapped onto the venue size grid the
        // way wire integerization will round it — an explicit size string
        // is exact user intent and is never adjusted here.
        requestedSize = snapToLighterSizeGrid(
          usdAmount / referencePrice,
          market.supportedSizeDecimals,
        );
      }
      if (!(requestedSize > 0)) {
        return { success: false, error: 'Order size must be positive' };
      }
      if (params.usdAmount === undefined) {
        const requestedSizeInt = toSignerWireInteger(
          requestedSize,
          market.supportedSizeDecimals,
        );
        if (
          fromLighterInteger(requestedSizeInt, market.supportedSizeDecimals) !==
          requestedSize
        ) {
          return {
            success: false,
            error: `Order size ${params.size} does not align with the Lighter size grid`,
          };
        }
      }
      const minSize = isLighterMakerOrder(params)
        ? computeLighterMinOrderSize(market, referencePrice)
        : 0;
      if (minSize > 0 && requestedSize < minSize) {
        // Only a LIVE-VERIFIED full close may be bumped to the venue
        // minimum: reduce-only execution clamps to the position, so no
        // extra exposure results and dust positions stay closable. The
        // isFullClose flag is a hint, never trusted — a partial close
        // bumped to the minimum would close more than the caller asked.
        // A dormant trigger must retain its quantity even if the position
        // grows before activation; today's full-close proof cannot authorize
        // a larger future close.
        const verifiedFullClose =
          params.reduceOnly && !triggerPrices
            ? await this.#isVerifiedFullClose(params.symbol, requestedSize)
            : false;
        if (!verifiedFullClose) {
          return {
            success: false,
            error: `Order size ${requestedSize} is below the Lighter minimum of ${minSize} ${params.symbol}`,
          };
        }
      }
      const size =
        minSize > 0 ? Math.max(requestedSize, minSize) : requestedSize;

      // Wire-format integerization runs BEFORE signer setup: overflow and
      // sub-tick rejections throw here, still with zero bridge calls.
      const priceInt = toSignerWirePriceInteger(
        executionPrice,
        market.supportedPriceDecimals,
      );
      const sizeInt = toSignerWireInteger(size, market.supportedSizeDecimals);
      let orderTypeInt = LIGHTER_ORDER_TYPE_MARKET;
      if (isTriggerOrderType(params.orderType)) {
        orderTypeInt = LIGHTER_TRIGGER_WIRE_TYPES[params.orderType];
      } else if (params.orderType === 'limit') {
        orderTypeInt = LIGHTER_ORDER_TYPE_LIMIT;
      }

      const leverageImfHundredths = await this.#resolveLeverageIntent(params);
      // Margin mode is sent only with an explicit leverage update. An
      // omitted leverage leaves both leverage and margin mode unchanged;
      // an explicit update preserves an existing position's venue mode and
      // uses isolated only for a flat market.
      const leverageMarginMode =
        leverageImfHundredths === null
          ? null
          : await this.#resolveMarginModeForSymbol(params.symbol);

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
          if (leverageImfHundredths !== null && leverageMarginMode !== null) {
            const signedLeverage = await this.#getSignerBridge().execute({
              function: '_signUpdateLeverage',
              // Contract: [accountIndex, marketId, imfHundredths,
              // marginMode, nonce] — exactly five params.
              params: [
                accountIndex,
                market.marketId,
                leverageImfHundredths,
                leverageMarginMode,
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
              undefined,
              {
                ...extractDispatchIdentity(signedLeverage),
                intent: `updateLeverage:${params.symbol}:${String(params.leverage)}`,
              },
            );
            leverageCommitted = true;
          }
          const signed = await this.#getSignerBridge().execute({
            function: '_signCreateOrder',
            params: [
              accountIndex,
              market.marketId,
              clientOrderIndex,
              String(sizeInt),
              String(priceInt),
              params.isBuy ? 0 : 1,
              orderTypeInt,
              isLighterMakerOrder(params)
                ? LIGHTER_TIME_IN_FORCE_GOOD_TILL_TIME
                : LIGHTER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL,
              params.reduceOnly ? 1 : 0,
              String(
                triggerPrices?.triggerPriceInt ?? LIGHTER_NO_TRIGGER_PRICE,
              ),
              // Triggers remain pending even when they execute as IOC.
              // The signer expands -1 to its 28-day default expiry;
              // only ordinary immediate orders use a zero expiry.
              isTriggerOrderType(params.orderType) ||
              isLighterMakerOrder(params)
                ? LIGHTER_ORDER_EXPIRY_NONE
                : 0,
              await nextNonce(),
            ],
          });
          if (signed.error) {
            throw new Error(`Lighter order signing failed: ${signed.error}`);
          }
          return await submit(
            LIGHTER_TX_TYPE_CREATE_ORDER,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: `placeOrder:${params.symbol}:${clientOrderIndex}`,
            },
          );
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
      // PARTIAL VENUE STATE is contract-visible: a committed leverage
      // change followed by an order failure must never imply "nothing
      // happened".
      const partialPrefix = leverageCommitted
        ? `PARTIAL STATE: leverage for ${params.symbol} was already updated to ${String(params.leverage)}x before the order failed. `
        : '';
      return {
        success: false,
        error: `${partialPrefix}${wrappedError.message}`,
        ...(leverageCommitted
          ? { partialState: { leverageUpdated: Number(params.leverage) } }
          : {}),
      };
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
          const signed = await this.#getSignerBridge().execute({
            function: '_signCancelOrder',
            params: [accountIndex, market.marketId, params.orderId, nonce],
          });
          if (signed.error) {
            throw new Error(`Lighter cancel signing failed: ${signed.error}`);
          }
          return await submit(
            LIGHTER_TX_TYPE_CANCEL_ORDER,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: `cancelOrder:${params.symbol}:${params.orderId}`,
            },
          );
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
  /**
   * The mobile close sheet sends a FULL close as an EMPTY size string
   * (`size: sizeToClose || ''`); HyperLiquid and TradingService treat a
   * falsy size as "no explicit size", so this venue honors the same
   * contract — an empty/whitespace size or usdAmount means full close,
   * never a validation failure.
   *
   * @param params - Raw close request.
   * @returns The request with empty-string sizing normalized to absent.
   */
  readonly #normalizeCloseParams = (
    params: ClosePositionParams,
  ): ClosePositionParams => ({
    ...params,
    size: params.size?.trim() ? params.size : undefined,
    usdAmount: params.usdAmount?.trim() ? params.usdAmount : undefined,
  });

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

  async closePosition(rawParams: ClosePositionParams): Promise<OrderResult> {
    const params = this.#normalizeCloseParams(rawParams);
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
    return this.#updatePositionTPSL(params);
  }

  /**
   * Submit a separately selected protection intent for an exact durable source.
   * Reconcile original-slot attempts, then use a matching current registered key.
   *
   * @param params - New protection intent and opaque source identity.
   * @returns Settled successor result; failure retains the source obligation.
   */
  async resolveRecoveryProtection(
    params: ResolveRecoveryProtectionParams,
  ): Promise<PerpsRecoveryProtectionResult> {
    const result = await this.#resolveRecoveryProtection(params);
    return {
      ...result,
      status: result.success ? 'settled' : 'unresolved',
      providerId: 'lighter',
    };
  }

  readonly #resolveRecoveryProtection = async (
    params: ResolveRecoveryProtectionParams,
  ): Promise<OrderResult> => {
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      this.#assertSession(generation);
      if (!params.recoveryId.startsWith('lighter-protection:')) {
        throw new Error('Invalid Lighter recovery source identity');
      }
      const parsed: unknown = JSON.parse(
        params.recoveryId.slice('lighter-protection:'.length),
      );
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 6 ||
        parsed[0] !== (this.#isTestnet ? 'testnet' : 'mainnet') ||
        parsed[1] !== this.#boundAddress ||
        !Number.isSafeInteger(parsed[2]) ||
        !Number.isSafeInteger(parsed[3]) ||
        parsed[3] < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
        parsed[3] > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
        parsed[4] !== params.symbol ||
        typeof parsed[5] !== 'string'
      ) {
        throw new Error('Invalid Lighter recovery source scope');
      }
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generation);
      if (accountIndex !== parsed[2]) {
        throw new Error('Lighter recovery source account changed');
      }
      const slot = parsed[3] as number;
      const settlementKey = `${this.#boundAddress}:${accountIndex}:${slot}:${params.symbol}`;
      const operationId = parsed[5];
      const manual = await this.#loadTpslManualRecovery(settlementKey);
      this.#assertSession(generation);
      const journal = await this.#loadTpslJournal(settlementKey);
      this.#assertSession(generation);
      const successor = await this.#loadRecoverySuccessor(
        settlementKey,
        operationId,
      );
      this.#assertSession(generation);
      if (successor?.state === 'settled') {
        await withProcessMutex(
          `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
          async () => this.#finalizeRecoverySuccessor(successor, generation),
        );
        this.#assertSession(generation);
        return { success: true };
      }
      if ((manual?.operationId ?? journal?.operationId) !== operationId) {
        throw new Error('Lighter recovery source operation changed');
      }
      return this.#updatePositionTPSL(params, {
        settlementKey,
        operationId,
        slot,
        generation,
      });
    } catch (error) {
      return {
        success: false,
        error: ensureError(error, 'LighterProvider.resolveRecoveryProtection')
          .message,
      };
    }
  };

  readonly #updatePositionTPSL = async (
    params: UpdatePositionTPSLParams,
    sourceRecovery?: {
      settlementKey: string;
      operationId: string;
      slot: number;
      generation: number;
    },
  ): Promise<OrderResult> => {
    const expectedPosition =
      params.expectedPosition === undefined
        ? undefined
        : { ...params.expectedPosition };
    try {
      if (sourceRecovery) {
        this.#assertSession(sourceRecovery.generation);
      }
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
      // The lifecycle boundary is captured BEFORE the position read: a
      // fill landing DURING the read belongs to the operation's window
      // and must count as lifecycle evidence.
      const lifecycleBoundary = Date.now();
      const positions = await this.getPositions();
      const position = positions.find(
        (entry) => entry.symbol === params.symbol,
      );
      this.#assertSession(generationAtIntent);
      assertExpectedPosition(expectedPosition, position);
      let wantsReplacement =
        Boolean(params.takeProfitPrice) || Boolean(params.stopLossPrice);
      if (!position && (!sourceRecovery || wantsReplacement)) {
        const previous = sourceRecovery
          ? await this.#loadRecoverySuccessor(
              sourceRecovery.settlementKey,
              sourceRecovery.operationId,
            )
          : null;
        this.#assertSession(generationAtIntent);
        // A prior dispatched intent may have completed by filling the position.
        // Reconcile it before rejecting a new replacement on an empty position.
        if (
          !previous ||
          (previous.state !== 'pending' &&
            previous.retainedReplacementGroups === undefined)
        ) {
          return {
            success: false,
            error: `No open Lighter position for ${params.symbol}`,
          };
        }
      }

      // FULL local preflight: construct the entire deterministic
      // replacement payload BEFORE signer setup, the open-orders read and
      // any cancellation. Everything that can fail locally — venue
      // position-size parsing/integerization, trigger/execution price
      // parsing/integerization, bounded client-id allocation — must fail
      // while the existing protection is still in place.
      let singleOrderPayload: LighterCreateOrderWireParams | null = null;
      let groupedOrderPayload: LighterGroupedOrderWireParams | null = null;
      let createdClientIds: number[] = [];
      let childOrderIds: string[] = [];
      let createdIdsNeedingFinalCheck: number[] = [];
      let preflightPositionWireSize: number | null = null;
      let preflightPositionSign: 1 | -1 | null = null;
      if (wantsReplacement && position) {
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
        preflightPositionWireSize = sizeInt;
        preflightPositionSign = isLong ? 1 : -1;
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
        const wireOrders = validatedOrders.map(
          (entry, index): LighterCreateOrderWireParams => {
            const clientOrderIndex = clientOrderIds[index];
            if (clientOrderIndex === undefined) {
              throw new Error(
                'Lighter TP/SL preflight did not allocate a client order id',
              );
            }
            return [
              market.marketId,
              clientOrderIndex,
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
            ];
          },
        );
        const [first, second] = wireOrders;
        if (first === undefined) {
          throw new Error('Lighter TP/SL preflight produced no trigger order');
        }
        if (second === undefined) {
          singleOrderPayload = first;
        } else {
          groupedOrderPayload = [...first, ...second];
        }
      }

      // Re-fence BEFORE signer setup: the preflight awaited public reads
      // during which the wallet may have switched, and a stale intent must
      // never create or register the new account's venue key.
      this.#assertSession(generationAtIntent);
      if (!sourceRecovery) {
        await this.#ensureSignerReady();
      }
      const accountIndex = await this.#ensureAccountIndex();
      this.#assertSession(generationAtIntent);
      const recoveryAuthority = sourceRecovery
        ? await withProcessMutex(
            `lighterVenueWrite:${this.#isTestnet ? 'testnet' : 'mainnet'}:${accountIndex}`,
            async () =>
              this.#getRecoveryReadToken(
                accountIndex,
                generationAtIntent,
                this.#readyApiKeyIndex ?? undefined,
              ),
          )
        : undefined;
      this.#assertSession(generationAtIntent);
      // Pre-mint the auth token OUTSIDE the write lock: #getAuthToken can
      // trigger signer setup, and signer setup queues on the write chain —
      // calling any setup-capable helper from inside the held section
      // would self-deadlock after a bridge reset or unobserved switch.
      const authToken =
        recoveryAuthority?.token ?? (await this.#getAuthToken());
      this.#assertSession(generationAtIntent);
      const successorSlot = recoveryAuthority?.apiKeyIndex ?? this.#apiKeyIndex;
      let selectedSuccessor: TpslRecoverySuccessor | null = null;
      // Settlement identity: pending expectations are keyed by the
      // captured normalized address + account index + symbol so another
      // account can never consume (or be blocked by) this account's ids,
      // while a same-account bridge reset or switch-away-and-back retains
      // the reconciliation obligation.
      // Includes the API KEY SLOT: nonces are per key slot, so a journal
      // recorded under one slot must never be reconciled under another.
      const settlementKey = `${this.#boundAddress ?? 'unbound'}:${accountIndex}:${successorSlot}:${params.symbol}`;

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
          if (recoveryAuthority) {
            if (
              this.#readyApiKeyIndex !== null &&
              this.#readyApiKeyIndex !== successorSlot
            ) {
              throw new Error(
                'Lighter recovery signing key changed while queued',
              );
            }
            const registrations =
              await this.#clientService.getApiKeys(accountIndex);
            this.#assertSession(generationAtIntent);
            const matching = registrations.apiKeys.filter(
              (entry) =>
                entry.accountIndex === accountIndex &&
                entry.apiKeyIndex === successorSlot &&
                entry.publicKey.replace(/^0x/u, '').toLowerCase() ===
                  recoveryAuthority.publicKey.replace(/^0x/u, '').toLowerCase(),
            );
            if (matching.length !== 1) {
              throw new Error(
                'Lighter recovery successor registered key changed',
              );
            }
            const bridge = this.#getSignerBridge();
            const created = await bridge.createClient({
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
              apiKeyIndex: successorSlot,
              nonce: await nextNonce(),
              walletAddress: this.#boundAddress ?? undefined,
            });
            this.#assertSession(generationAtIntent);
            if (
              !created.success ||
              created.error ||
              created.pk?.replace(/^0x/u, '').toLowerCase() !==
                recoveryAuthority.publicKey.replace(/^0x/u, '').toLowerCase()
            ) {
              throw new Error('Lighter recovery successor local key changed');
            }
            this.#venuePublicKey = recoveryAuthority.publicKey;
            this.#authToken = null;
            this.#signerIdentity = `${this.#clientService.network}:${accountIndex}:${successorSlot}`;
            this.#signerRecreateParams = {
              chainId: getLighterChainId(this.#clientService.network),
              accountIndex,
            };
            bridgeClientOwners.set(
              this.#rawSignerBridge(),
              this.#signerIdentity,
            );
          }
          const assertLiveExpected = async (): Promise<void> => {
            if (sourceRecovery) {
              this.#assertSession(generationAtIntent);
              const manualSource = await this.#loadTpslManualRecovery(
                sourceRecovery.settlementKey,
              );
              this.#assertSession(generationAtIntent);
              const journalSource = await this.#loadTpslJournal(
                sourceRecovery.settlementKey,
              );
              this.#assertSession(generationAtIntent);
              if (
                manualSource?.operationId !== sourceRecovery.operationId &&
                journalSource?.operationId !== sourceRecovery.operationId
              ) {
                throw new Error('Lighter recovery source operation changed');
              }
            }
            if (expectedPosition === undefined) {
              return;
            }
            this.#assertSession(generationAtIntent);
            const account =
              await this.#clientService.getAccountByIndex(accountIndex);
            this.#assertSession(generationAtIntent);
            const currentPositions =
              Array.isArray(account.accounts) &&
              account.accounts.length === 1 &&
              account.accounts[0]?.index === accountIndex &&
              Array.isArray(account.accounts[0].positions)
                ? account.accounts[0].positions
                : undefined;
            const current = currentPositions?.find(
              (entry) => entry.symbol === params.symbol,
            );
            assertExpectedPosition(
              expectedPosition,
              current && (current.sign === 1 || current.sign === -1)
                ? {
                    size: `${current.sign === -1 ? '-' : ''}${current.position}`,
                    entryPrice: current.avgEntryPrice,
                  }
                : undefined,
            );
          };
          await assertLiveExpected();
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
            if (
              !Array.isArray(response.orders) ||
              (sourceRecovery !== undefined &&
                response.orders.some(
                  (row) => row.ownerAccountIndex !== accountIndex,
                ))
            ) {
              throw new Error(
                'Invalid Lighter protection recovery order envelope',
              );
            }
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

          if (sourceRecovery) {
            selectedSuccessor = await this.#loadRecoverySuccessor(
              sourceRecovery.settlementKey,
              sourceRecovery.operationId,
            );
            this.#assertSession(generationAtIntent);
            if (selectedSuccessor?.state === 'settled') {
              return;
            }
            if (selectedSuccessor?.state === 'failed') {
              // A crash may leave the exact retired journal after its failure
              // marker. Complete cleanup before preparing the next intent.
              const failedJournal = await this.#loadTpslJournal(
                selectedSuccessor.successorSettlementKey,
              );
              this.#assertSession(generationAtIntent);
              if (failedJournal === null) {
                if (
                  !(await this.#clearTpslJournal(
                    selectedSuccessor.successorSettlementKey,
                    null,
                  ))
                ) {
                  throw new Error('Lighter failed successor operation changed');
                }
                this.#assertSession(generationAtIntent);
              } else if (
                failedJournal.operationId ===
                selectedSuccessor.successorOperationId
              ) {
                if (
                  !(await this.#clearTpslJournal(
                    selectedSuccessor.successorSettlementKey,
                    failedJournal.operationId,
                    await readActiveRaw(),
                  ))
                ) {
                  throw new Error('Lighter failed successor operation changed');
                }
                this.#assertSession(generationAtIntent);
              }
            }
            if (selectedSuccessor && selectedSuccessor.state !== 'failed') {
              const pendingSuccessor = await this.#loadTpslJournal(
                selectedSuccessor.successorSettlementKey,
              );
              this.#assertSession(generationAtIntent);
              if (
                pendingSuccessor?.operationId ===
                selectedSuccessor.successorOperationId
              ) {
                if (
                  selectedSuccessor.successorSettlementKey === settlementKey
                ) {
                  const settled = await this.#settleTpslObligation({
                    settlementKey,
                    symbol: params.symbol,
                    journalEntry: pendingSuccessor,
                    market,
                    accountIndex,
                    authToken,
                    generation: generationAtIntent,
                    readActiveRaw,
                    readInactiveFor,
                    nextNonce,
                    submit,
                  });
                  const after = await this.#loadRecoverySuccessor(
                    sourceRecovery.settlementKey,
                    sourceRecovery.operationId,
                  );
                  this.#assertSession(generationAtIntent);
                  if (settled && after?.state === 'settled') {
                    return;
                  }
                  throw new Error(
                    'Lighter recovery successor remains unresolved; review its durable outcome before another intent',
                  );
                } else {
                  const oldSlot = Number(
                    selectedSuccessor.successorSettlementKey.split(':')[2],
                  );
                  if (
                    !Number.isSafeInteger(oldSlot) ||
                    oldSlot < LIGHTER_MIN_TRADING_API_KEY_INDEX ||
                    oldSlot > LIGHTER_MAX_TRADING_API_KEY_INDEX ||
                    (await this.#reconcilePriorTpsl(
                      readActiveRaw,
                      readInactiveFor,
                      accountIndex,
                      pendingSuccessor,
                      oldSlot,
                    )) !== 'resolved'
                  ) {
                    throw new Error(
                      'Lighter previous successor submissions remain unresolved',
                    );
                  }
                  this.#assertSession(generationAtIntent);
                  await this.#verifyRetainedRecoveryCoverage(
                    pendingSuccessor,
                    readActiveRaw,
                    readInactiveFor,
                  );
                  await this.#discardManagedTpslIds(
                    selectedSuccessor.successorSettlementKey,
                    pendingSuccessor.attempts.flatMap((attempt) =>
                      attempt.kind === 'create' &&
                      (attempt.neverLanded === true ||
                        getLighterTransactionOutcome(attempt.terminalStatus) ===
                          'failed')
                        ? attempt.clientIds.map(String)
                        : [],
                    ),
                  );
                  this.#assertSession(generationAtIntent);
                  const groups =
                    pendingSuccessor.retainedReplacementGroups ??
                    pendingSuccessor.attempts
                      .filter(
                        (attempt): attempt is TpslCreateAttempt =>
                          attempt.kind === 'create' &&
                          attempt.role === 'replacement' &&
                          attempt.neverLanded !== true &&
                          getLighterTransactionOutcome(
                            attempt.terminalStatus,
                          ) !== 'failed',
                      )
                      .map((attempt) => attempt.clientIds);
                  const coverage =
                    groups.length === 0
                      ? { outcome: 'created-terminal-failed' as const }
                      : await this.#awaitTpslVisibility(
                          readActiveRaw,
                          readInactiveFor,
                          {
                            createdClientIds: groups.flat(),
                            cancelledOrderIds: [],
                          },
                          { createdGroups: groups },
                        );
                  if (coverage.outcome === 'timeout') {
                    throw new Error(
                      'Lighter previous successor coverage remains unresolved',
                    );
                  }
                  const active = await readActiveRaw();
                  const priorIds = pendingSuccessor.priorTriggers.map(
                    (prior) => prior.orderId,
                  );
                  const priorGone = priorIds.every(
                    (id) =>
                      !active.some((row) => String(row.orderIndex) === id),
                  );
                  const alreadyWon =
                    pendingSuccessor.intent === 'remove' ||
                    (groups.length > 0 && coverage.outcome === 'settled');
                  if (alreadyWon && priorGone) {
                    await this.#finishRecoverySuccessor(
                      pendingSuccessor,
                      'settled',
                      active,
                      generationAtIntent,
                    );
                    return;
                  }
                  // Persist the original created coverage before retiring its
                  // journal. Continuing with the current key only cancels its
                  // exact prior orders; it must never create the same intent again.
                  selectedSuccessor = {
                    ...selectedSuccessor,
                    state: 'prepared',
                    retainedReplacementGroups: alreadyWon ? groups : undefined,
                    ownedOrderIds: alreadyWon
                      ? priorIds
                      : [
                          ...new Set([
                            ...selectedSuccessor.ownedOrderIds,
                            ...active
                              .filter((row) =>
                                groups.flat().includes(row.clientOrderIndex),
                              )
                              .map((row) => String(row.orderIndex)),
                          ]),
                        ],
                  };
                  await this.#persistRecoverySuccessor(
                    selectedSuccessor,
                    generationAtIntent,
                  );
                  if (
                    !(await this.#clearTpslJournal(
                      selectedSuccessor.successorSettlementKey,
                      pendingSuccessor.operationId,
                      active,
                    ))
                  ) {
                    throw new Error(
                      'Lighter previous successor operation changed',
                    );
                  }
                  this.#assertSession(generationAtIntent);
                }
              }
              if (selectedSuccessor.state === 'pending') {
                throw new Error(
                  'Lighter recovery successor journal is unavailable',
                );
              }
            }
            if (selectedSuccessor?.retainedReplacementGroups !== undefined) {
              wantsReplacement = false;
            }
            if (!position && wantsReplacement) {
              throw new Error(`No open Lighter position for ${params.symbol}`);
            }
            const sourceJournal = await this.#loadTpslJournal(
              sourceRecovery.settlementKey,
            );
            this.#assertSession(generationAtIntent);
            const manualSource = await this.#loadTpslManualRecovery(
              sourceRecovery.settlementKey,
            );
            this.#assertSession(generationAtIntent);
            if (
              sourceJournal &&
              sourceJournal.operationId !== sourceRecovery.operationId
            ) {
              throw new Error(
                'Lighter recovery source journal operation changed',
              );
            }
            if (
              sourceJournal &&
              (await this.#reconcilePriorTpsl(
                readActiveRaw,
                readInactiveFor,
                accountIndex,
                sourceJournal,
                sourceRecovery.slot,
              )) !== 'resolved'
            ) {
              throw new Error(
                'Lighter original protection submissions remain unresolved',
              );
            }
            this.#assertSession(generationAtIntent);
            const sourceActive = await readActiveRaw();
            const ownedOrderIds = [
              ...new Set([
                ...(selectedSuccessor?.ownedOrderIds ?? []),
                ...(manualSource?.survivingOrderIds ?? []),
                ...(manualSource?.priorTriggers.map((prior) => prior.orderId) ??
                  []),
                ...(sourceJournal?.priorTriggers.map(
                  (prior) => prior.orderId,
                ) ?? []),
                ...sourceActive
                  .filter((row) =>
                    sourceJournal?.attempts.some(
                      (attempt) =>
                        attempt.kind === 'create' &&
                        attempt.clientIds.includes(row.clientOrderIndex),
                    ),
                  )
                  .map((row) => String(row.orderIndex)),
              ]),
            ];
            selectedSuccessor = {
              version: 1,
              sourceSettlementKey: sourceRecovery.settlementKey,
              sourceOperationId: sourceRecovery.operationId,
              successorSettlementKey: settlementKey,
              successorOperationId:
                selectedSuccessor?.state === 'prepared'
                  ? selectedSuccessor.successorOperationId
                  : `op-${Date.now().toString(36)}-${(this.#tpslOperationCounter += 1).toString(36)}-${randomIdSuffix()}`,
              state: 'prepared',
              ownedOrderIds,
              retainedReplacementGroups:
                selectedSuccessor?.retainedReplacementGroups,
            };
            await this.#persistRecoverySuccessor(
              selectedSuccessor,
              generationAtIntent,
            );
            await assertLiveExpected();
            if (!manualSource && sourceJournal) {
              await this.#writeTpslManualRecovery({
                settlementKey: sourceRecovery.settlementKey,
                symbol: params.symbol,
                reason:
                  'Explicit protection successor awaiting authoritative settlement',
                priorIntent: sourceJournal.intent,
                priorTriggers: sourceJournal.priorTriggers,
                survivingOrderIds: ownedOrderIds,
                operationId: sourceRecovery.operationId,
                recordedAt: sourceJournal.recordedAt,
              });
              this.#assertSession(generationAtIntent);
            }
            if (
              sourceJournal &&
              !(await this.#clearTpslJournal(
                sourceRecovery.settlementKey,
                sourceRecovery.operationId,
                sourceActive,
              ))
            ) {
              throw new Error(
                'Lighter recovery source operation changed during transfer',
              );
            }
            this.#assertSession(generationAtIntent);
          }

          // VENUE LINEARIZABILITY: if a previous TP/SL transition's
          // settlement never became visible, run it through the SAME
          // obligation state machine as startup recovery — a pending
          // 'cancelling'/'restoring' journal may owe a rollback or a
          // RESTORE, and merely reconciling-then-clearing it here would
          // erase that obligation and leave the position naked.
          // Pending obligations survive provider death via the durable
          // journal. DISK IS AUTHORITATIVE: absence means the obligation
          // was resolved (possibly by another provider) — a stale
          // in-memory copy is dropped, never resurrected.
          if (!sourceRecovery) {
            const sourceKeys = [
              ...new Set([
                ...(await this.#readTpslManualIndex()),
                ...(await this.#readTpslJournalIndex()),
              ]),
            ];
            this.#assertSession(generationAtIntent);
            for (const sourceKey of sourceKeys) {
              const [sourceAddress, sourceAccount, , ...sourceSymbol] =
                sourceKey.split(':');
              if (
                sourceAddress !== this.#boundAddress ||
                sourceAccount !== String(accountIndex) ||
                sourceSymbol.join(':') !== params.symbol
              ) {
                continue;
              }
              const manual = await this.#loadTpslManualRecovery(sourceKey);
              this.#assertSession(generationAtIntent);
              const sourceJournal = await this.#loadTpslJournal(sourceKey);
              this.#assertSession(generationAtIntent);
              const sourceOperationId =
                manual?.operationId ?? sourceJournal?.operationId;
              if (!sourceOperationId) {
                continue;
              }
              const transfer = await this.#loadRecoverySuccessor(
                sourceKey,
                sourceOperationId,
              );
              this.#assertSession(generationAtIntent);
              if (
                transfer &&
                transfer.state !== 'failed' &&
                transfer.state !== 'settled'
              ) {
                throw new Error(
                  'Selected protection recovery is pending; resume its explicit successor',
                );
              }
            }
          }
          const unsettled = await this.#loadTpslJournal(settlementKey);
          if (unsettled === null) {
            this.#tpslUnsettled.delete(settlementKey);
          }
          if (unsettled) {
            const resolved = await this.#settleTpslObligation({
              settlementKey,
              symbol: params.symbol,
              journalEntry: unsettled,
              market,
              accountIndex,
              authToken,
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
            // The machine may have PARKED the obligation into the
            // durable manual-recovery doc (releasing the journal slot).
            // The doc is NOT cleared here: only this operation's own
            // SUCCESS — the successor protection authoritatively in
            // force — clears the warning below.
            this.#assertSession(generationAtIntent);
          }

          const rawOrders = await readActiveRaw();
          await this.#pruneManagedTpsl(settlementKey, rawOrders, async () => {
            this.#assertSession(generationAtIntent);
            const response = await this.#clientService.getInactiveOrders(
              accountIndex,
              authToken,
              LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE,
              undefined,
              market.marketId,
            );
            this.#assertSession(generationAtIntent);
            if (
              response.orders.length > LIGHTER_TPSL_OWNERSHIP_HISTORY_PAGE_SIZE
            ) {
              throw new Error('Lighter ownership history exceeded one page');
            }
            return response.orders.filter(
              (row) =>
                row.ownerAccountIndex === accountIndex &&
                row.marketIndex === market.marketId,
            );
          });
          const managed = await this.#readManagedTpsl(settlementKey);
          this.#assertSession(generationAtIntent);
          // The public preflight position read occurred before signer
          // setup and write serialization. Re-read the raw venue position
          // inside the held transition immediately before any create or
          // cancel signature: an intervening fill or side flip would make
          // the captured cover payload under-sized or wrong-sided.
          const liveAccount =
            await this.#clientService.getAccountByIndex(accountIndex);
          this.#assertSession(generationAtIntent);
          if (
            !Array.isArray(liveAccount.accounts) ||
            liveAccount.accounts.length !== 1 ||
            liveAccount.accounts[0]?.index !== accountIndex ||
            !Array.isArray(liveAccount.accounts[0].positions)
          ) {
            throw new Error(
              'Invalid Lighter account position envelope before TP/SL signing',
            );
          }
          const livePosition = liveAccount.accounts[0].positions.find(
            (entry) => entry.symbol === params.symbol,
          );
          const liveMagnitude = livePosition
            ? parseStrictDecimal(livePosition.position)
            : null;
          let liveWireSize: number | null = null;
          if (
            liveMagnitude !== null &&
            Number.isFinite(liveMagnitude) &&
            liveMagnitude > 0 &&
            (livePosition?.sign === 1 || livePosition?.sign === -1)
          ) {
            try {
              liveWireSize = toSignerWireInteger(
                liveMagnitude,
                market.supportedSizeDecimals,
              );
            } catch {
              liveWireSize = null;
            }
          }
          assertExpectedPosition(
            expectedPosition,
            livePosition &&
              (livePosition.sign === 1 || livePosition.sign === -1)
              ? {
                  size: `${livePosition.sign === -1 ? '-' : ''}${livePosition.position}`,
                  entryPrice: livePosition.avgEntryPrice,
                }
              : undefined,
          );
          if (
            wantsReplacement &&
            (liveWireSize === null ||
              liveWireSize !== preflightPositionWireSize ||
              livePosition?.sign !== preflightPositionSign)
          ) {
            throw new Error(
              `Lighter position changed before TP/SL signing for ${params.symbol}; refresh and retry protection against the current position`,
            );
          }
          const openOrders = rawOrders.map((order) =>
            adaptOrderFromLighter(
              order,
              this.#marketsById.get(order.marketIndex)?.symbol ??
                String(order.marketIndex),
            ),
          );
          const staleTriggers = openOrders.filter((order) => {
            const raw = rawOrders.find(
              (row) => String(row.orderIndex) === order.orderId,
            );
            // Core-owned IDs survive resizing, restart and key-slot recovery.
            // Legacy unrecorded full-quantity closing trigger markets retain
            // their historical protection contract, using the in-lock position.
            // Independent partial and limit triggers are preserved.
            const isManaged =
              raw !== undefined &&
              managed.some(
                (entry) =>
                  entry.clientId === String(raw.clientOrderIndex) ||
                  entry.orderId === order.orderId,
              );
            const isSelected =
              selectedSuccessor?.ownedOrderIds.includes(order.orderId) ?? false;
            const isLegacyProtection =
              sourceRecovery === undefined &&
              liveWireSize !== null &&
              order.side === (livePosition?.sign === 1 ? 'sell' : 'buy') &&
              parseFinitePositive(order.size) === liveMagnitude;
            return (
              order.symbol === params.symbol &&
              order.reduceOnly &&
              (raw?.type === 'stop-loss' || raw?.type === 'take-profit') &&
              (sourceRecovery ? isSelected : isManaged || isLegacyProtection)
            );
          });
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
              ? mapRawTriggerToPriorIntent(rawRow, market)
              : null;
            if (!priorIntent) {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} refused: existing trigger order ${stale.orderId} cannot be faithfully restored (unsupported type/time-in-force), so it will not be cancelled`,
              );
            }
            priorTriggers.push(priorIntent);
          }
          // OCO grouping is decided by the VENUE'S OWN linkage fields —
          // never inferred from "one TP plus one SL". Linkage FAILS
          // CLOSED: ANY dangling or one-sided linkage (parent, to_cancel
          // or to_trigger references that do not form an exact mutual
          // two-leg pair among the triggers being replaced) is an order
          // relationship this integration cannot faithfully re-establish
          // — the mutation is refused BEFORE anything is touched, never
          // classified independent.
          const staleRawRows = staleTriggers.map((stale) =>
            rawOrders.find(
              (order) => String(order.orderIndex) === stale.orderId,
            ),
          );
          // LIVE-VENUE contract (probed): ABSENT linkage is the string
          // sentinel '0' (parent_order_id, to_trigger_order_id_*), never
          // an empty string.
          const linkageSet = (value: string | undefined): boolean =>
            typeof value === 'string' && value.length > 0 && value !== '0';
          const hasAnyLinkage = (row: LighterApiOrder | undefined): boolean =>
            row !== undefined &&
            (linkageSet(row.toCancelOrderId0) ||
              linkageSet(row.parentOrderId) ||
              (typeof row.parentOrderIndex === 'number' &&
                row.parentOrderIndex > 0) ||
              linkageSet(row.toTriggerOrderId0) ||
              linkageSet(row.toTriggerOrderId1));
          const rowLinksTo = (
            source: LighterApiOrder | undefined,
            target: LighterApiOrder | undefined,
          ): boolean =>
            source !== undefined &&
            target !== undefined &&
            linkageSet(source.toCancelOrderId0) &&
            [String(target.orderIndex), target.orderId ?? ''].includes(
              source.toCancelOrderId0 as string,
            );
          const mutualPair =
            priorTriggers.length === 2 &&
            rowLinksTo(staleRawRows[0], staleRawRows[1]) &&
            rowLinksTo(staleRawRows[1], staleRawRows[0]) &&
            // A mutual pair must not ALSO carry parent/OTO relations.
            staleRawRows.every(
              (row) =>
                row !== undefined &&
                !(
                  linkageSet(row.parentOrderId) ||
                  (typeof row.parentOrderIndex === 'number' &&
                    row.parentOrderIndex > 0) ||
                  linkageSet(row.toTriggerOrderId0) ||
                  linkageSet(row.toTriggerOrderId1)
                ),
            );
          if (!mutualPair && staleRawRows.some(hasAnyLinkage)) {
            throw new Error(
              `Lighter TP/SL update for ${params.symbol} refused: an existing trigger carries venue linkage (OCO/OTO/parent) this integration cannot faithfully re-establish, so it will not be cancelled`,
            );
          }
          const priorGrouping: 'oco' | 'independent' = mutualPair
            ? 'oco'
            : 'independent';
          if (priorGrouping === 'oco') {
            // Pinned grouped invariants (same closing side, size AND
            // expiry): a linked pair violating them cannot be faithfully
            // re-signed as one group — refuse BEFORE touching it.
            if (
              priorTriggers[0].side !== priorTriggers[1].side ||
              parseStrictDecimal(priorTriggers[0].remainingSize) !==
                parseStrictDecimal(priorTriggers[1].remainingSize) ||
              priorTriggers[0].orderExpiry !== priorTriggers[1].orderExpiry
            ) {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} refused: the existing linked OCO pair cannot be faithfully restored as a group, so it will not be cancelled`,
              );
            }
          }
          // Per-attempt mutation journal, persisted incrementally.
          // RESPONSE-LOSS safety: every attempt is recorded UNKNOWN with
          // its own venue nonce BEFORE submission (the venue may commit
          // even when the response is lost), flips to accepted inside
          // onAccepted (pre-fence), and reconciliation disambiguates each
          // attempt individually via books + nonce.
          await assertLiveExpected();
          const journal: TpslJournalState = {
            attempts: [],
            recordedAt: Date.now(),
            // Collision-resistant across processes: time + counter + two
            // independent random draws (~104 bits of entropy).
            operationId:
              selectedSuccessor?.successorOperationId ??
              `op-${Date.now().toString(36)}-${(this.#tpslOperationCounter += 1).toString(36)}-${randomIdSuffix()}`,
            sourceRecoveryOperationId: sourceRecovery?.operationId,
            sourceRecoverySettlementKey: sourceRecovery?.settlementKey,
            retainedReplacementGroups:
              selectedSuccessor?.retainedReplacementGroups,
            createdAt: lifecycleBoundary,
            nextAttemptId: 1,
            intent: wantsReplacement ? 'replace' : 'remove',
            phase: 'creating',
            priorGrouping,
            priorTriggers,
          };
          const persistJournal = async (): Promise<void> => {
            journal.recordedAt = Date.now();
            await this.#persistTpslJournal(settlementKey, journal);
            this.#assertSession(generationAtIntent);
            if (selectedSuccessor) {
              selectedSuccessor = { ...selectedSuccessor, state: 'pending' };
              await this.#persistRecoverySuccessor(
                selectedSuccessor,
                generationAtIntent,
              );
            }
          };
          const discardUnsentAttempt = async (
            attempt: TpslJournalState['attempts'][number],
          ): Promise<void> => {
            this.#assertSession(generationAtIntent);
            const remaining = journal.attempts.filter(
              (entry) => entry.attemptId !== attempt.attemptId,
            );
            if (attempt.kind === 'create') {
              await this.#discardManagedTpslIds(
                settlementKey,
                attempt.clientIds.map(String),
              );
            }
            this.#assertSession(generationAtIntent);
            if (remaining.length === 0) {
              await this.#finishRecoverySuccessor(
                journal,
                'failed',
                await readActiveRaw(),
                generationAtIntent,
              );
              await this.#clearTpslJournal(settlementKey, journal.operationId);
            } else {
              await this.#persistTpslJournal(settlementKey, {
                ...journal,
                attempts: remaining,
              });
            }
            journal.attempts = remaining;
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
            await this.#assertRecoverySource(journal, generationAtIntent);
            const cancelNonce = await nextNonce();
            const signedCancel = await this.#getSignerBridge().execute({
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
              attemptId: nextAttemptIdFor(journal),
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
              {
                txHash: cancelIdentity.txHash,
                expiresAt: cancelIdentity.expiresAt,
                owner: journal.operationId,
                ...(journal.intent === 'remove' || sourceRecovery
                  ? {
                      beforeDispatch: sourceRecovery
                        ? async (): Promise<void> =>
                            this.#assertRecoverySource(
                              journal,
                              generationAtIntent,
                            )
                        : assertLiveExpected,
                      onNotDispatched: async (): Promise<void> =>
                        discardUnsentAttempt(cancelAttempt),
                    }
                  : {}),
              },
            );
          };

          // CREATE FIRST, cancel after: if signing or submission of the
          // new protection fails, the old triggers were never touched and
          // the position is never left naked. The temporary overlap is
          // safe — both sets are reduce-only and clamp to the position.
          if (
            wantsReplacement &&
            (singleOrderPayload !== null || groupedOrderPayload !== null)
          ) {
            const createNonce = await nextNonce();
            // A lone trigger is an ordinary CreateOrder (same wire
            // layout); only a TP+SL pair uses the grouped OCO transaction.
            let signed: LighterTxResult;
            let isSingleTrigger = false;
            if (singleOrderPayload === null) {
              if (groupedOrderPayload === null) {
                throw new Error('Lighter TP/SL preflight payload is missing');
              }
              signed = await this.#getSignerBridge().execute({
                function: '_signCreateGroupedOrders',
                params: [
                  accountIndex,
                  LIGHTER_GROUPING_ONE_CANCELS_THE_OTHER,
                  2,
                  ...groupedOrderPayload,
                  createNonce,
                ],
              });
            } else {
              isSingleTrigger = true;
              signed = await this.#getSignerBridge().execute({
                function: '_signCreateOrder',
                params: [accountIndex, ...singleOrderPayload, createNonce],
              });
            }
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
              attemptId: nextAttemptIdFor(journal),
              nonce: createNonce,
              outcome: 'unknown',
              clientIds: [...createdClientIds],
              orderExpiries: requireSignedOrderExpiries(
                signed,
                createdClientIds,
              ),
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
              {
                txHash: createIdentity.txHash,
                expiresAt: createIdentity.expiresAt,
                owner: journal.operationId,
                beforeDispatch: assertLiveExpected,
                onNotDispatched: async (): Promise<void> =>
                  discardUnsentAttempt(createAttempt),
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
              {
                receiptIdentity: { accountIndex, marketIndex: market.marketId },
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
              await this.#finishRecoverySuccessor(
                journal,
                'failed',
                await readActiveRaw(),
                generationAtIntent,
              );
              await this.#clearTpslJournal(
                settlementKey,
                journal.operationId,
                await readActiveRaw(),
              );
              throw new Error(
                `Lighter replacement TP/SL for ${params.symbol} was cancelled or rejected by the venue before becoming active; the existing protection was left untouched`,
              );
            }
            // Barrier-proved TERMINAL success is immutable: skip those ids
            // in the final settlement check (no duplicate high-weight
            // inactive read); active-at-barrier ids are still re-verified
            // there (they can terminal-fail before the cancels settle).
            childOrderIds = createVisibility.childOrderIds;
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
              {
                receiptIdentity: { accountIndex, marketIndex: market.marketId },
              },
            );
            if (settled.outcome === 'timeout') {
              throw new Error(
                `Lighter TP/SL update for ${params.symbol} was submitted but its settlement is not yet visible; further protection changes are blocked until the venue reflects it`,
              );
            }
            if (settled.outcome === 'created-terminal-failed') {
              // Active at the phase barrier but venue-cancelled/rejected
              // AFTER the old protection was already cancelled. The
              // venue exposes no atomic primitive that could prove a
              // re-created trigger attaches to the same position
              // lifecycle, so nothing is auto-restored: the warning
              // parks DURABLY in the manual-recovery doc (surfaced via
              // getPendingManualRecoveries) and any surviving leg is
              // deliberately left as the only remaining protection.
              const rawNow = await readActiveRaw();
              const survivingOrderIds = rawNow
                .filter((order) =>
                  journal.attempts.some(
                    (attempt) =>
                      attempt.kind === 'create' &&
                      attempt.clientIds.some(
                        (clientId) =>
                          String(order.clientOrderIndex) === String(clientId),
                      ),
                  ),
                )
                .map((order) => String(order.orderIndex));
              if (sourceRecovery) {
                await this.#finishRecoverySuccessor(
                  journal,
                  'failed',
                  rawNow,
                  generationAtIntent,
                );
              } else {
                await this.#writeTpslManualRecovery({
                  settlementKey,
                  symbol: params.symbol,
                  reason:
                    'Replacement TP/SL order was cancelled or rejected by the venue after the previous protection was already removed',
                  priorIntent: journal.intent,
                  priorTriggers: journal.priorTriggers,
                  survivingOrderIds,
                  operationId: journal.operationId,
                  recordedAt: Date.now(),
                });
              }
              await this.#clearTpslJournal(
                settlementKey,
                journal.operationId,
                await readActiveRaw(),
              );
              this.#assertSession(generationAtIntent);
              throw new Error(
                `Lighter replacement TP/SL for ${params.symbol} was cancelled or rejected by the venue after the previous protection was already removed; the position's protection could NOT be safely re-established automatically — MANUAL re-establishment is required (a new explicit TP/SL update resolves this state)`,
              );
            }
            if (
              createdIdsNeedingFinalCheck.length > 0 &&
              (settled.childOrderIds.length !== childOrderIds.length ||
                settled.childOrderIds.some(
                  (id, index) => id !== childOrderIds[index],
                ))
            ) {
              throw new Error(
                'Lighter TP/SL receipt identity changed during settlement',
              );
            }
            await this.#verifyRetainedRecoveryCoverage(
              journal,
              readActiveRaw,
              readInactiveFor,
            );
            await this.#finishRecoverySuccessor(
              journal,
              'settled',
              await readActiveRaw(),
              generationAtIntent,
            );
            await this.#clearTpslJournal(
              settlementKey,
              journal.operationId,
              await readActiveRaw(),
            );
            // A switch DURING the final journal-clear await must not let
            // stale A protection report success under B.
            this.#assertSession(generationAtIntent);
          }
          // ONLY here — the successor protection intent authoritatively
          // in force (created and settled, or removal completed) — may a
          // parked manual-recovery warning for this symbol be cleared. A
          // failed successor leaves the warning untouched.
          if (sourceRecovery) {
            await this.#verifyRetainedRecoveryCoverage(
              journal,
              readActiveRaw,
              readInactiveFor,
            );
            await this.#finishRecoverySuccessor(
              journal,
              'settled',
              await readActiveRaw(),
              generationAtIntent,
            );
          } else {
            await this.#clearTpslManualRecovery(settlementKey);
          }
          this.#assertSession(generationAtIntent);
        },
        generationAtIntent,
        successorSlot,
      );
      return { success: true, childOrderIds };
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
  };

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
          const signed = await this.#getSignerBridge().execute({
            function: '_signUpdateMargin',
            params: [
              accountIndex,
              market.marketId,
              marginAmountInt,
              amount > 0 ? 1 : 0,
              nonce,
            ],
          });
          if (signed.error) {
            throw new Error(signed.error);
          }
          return await submit(
            LIGHTER_TX_TYPE_UPDATE_MARGIN,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: `updateMargin:${params.symbol}:${params.amount}`,
            },
          );
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
          const signed = await this.#getSignerBridge().execute({
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
          return await submit(
            LIGHTER_TX_TYPE_WITHDRAW,
            signed.txInfo,
            undefined,
            {
              ...extractDispatchIdentity(signed),
              intent: `withdraw:${params.amount}`,
            },
          );
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
    return await this.#getOrderFillsForQuery(params);
  }

  readonly #getOrderFillsForQuery = async (
    params?: LighterFillQuery,
  ): Promise<OrderFill[]> => {
    const selectedAddress = this.#walletService.getUserAddress().toLowerCase();
    const requestedAddress =
      params?.user?.toLowerCase() ??
      params?.accountId?.split(':').at(-1)?.toLowerCase();
    if (requestedAddress && requestedAddress !== selectedAddress) {
      throw new Error(
        'Lighter fill history can only query the selected wallet account',
      );
    }
    if (params?.aggregateByTime) {
      throw new Error('Lighter fill history does not support aggregateByTime');
    }
    if (
      params?.startTime !== undefined &&
      params.endTime !== undefined &&
      params.startTime > params.endTime
    ) {
      throw new Error('Lighter fill history startTime must not exceed endTime');
    }
    try {
      this.#ensureSessionBinding();
      const generation = this.#sessionGeneration;
      const accountIndex = await this.#ensureAccountIndex();
      const token = await this.#getAuthToken();
      const markets = await this.#ensureMarkets();
      const requestedLimit = Math.min(Math.max(params?.limit ?? 50, 1), 100);
      const marketId = params?.symbol
        ? markets.get(params.symbol)?.marketId
        : undefined;
      if (params?.symbol && marketId === undefined) {
        return [];
      }
      const needsPaging =
        params?.startTime !== undefined ||
        params?.endTime !== undefined ||
        params?.symbol !== undefined;
      const pageLimit = needsPaging ? 100 : requestedLimit;
      const fills: OrderFill[] = [];
      let cursor: string | undefined;
      let reachedStartBoundary = false;
      for (let page = 0; page < 100; page += 1) {
        const { trades, nextCursor } = await this.#clientService.getTrades(
          accountIndex,
          token,
          { limit: pageLimit, cursor, marketId },
        );
        this.#assertSession(generation);
        for (const trade of trades) {
          const fill = adaptFillFromLighterTrade(
            trade,
            this.#marketsById.get(trade.marketId)?.symbol ??
              String(trade.marketId),
            accountIndex,
          );
          if (
            (params?.startTime === undefined ||
              fill.timestamp >= params.startTime) &&
            (params?.endTime === undefined || fill.timestamp <= params.endTime)
          ) {
            fills.push(fill);
          }
          if (
            params?.startTime !== undefined &&
            fill.timestamp < params.startTime
          ) {
            reachedStartBoundary = true;
          }
        }
        cursor = nextCursor;
        if (
          fills.length >= requestedLimit ||
          cursor === undefined ||
          trades.length === 0 ||
          reachedStartBoundary
        ) {
          return fills.slice(0, requestedLimit);
        }
      }
      throw new Error(
        `${LIGHTER_DATA_INTEGRITY_PREFIX} fill history pagination did not reach the requested boundary`,
      );
    } catch (error) {
      this.#deps.debugLogger.log('[LighterProvider] getOrderFills failed', {
        error: String(error),
      });
      throw error;
    }
  };

  async getOrFetchFills(params?: GetOrFetchFillsParams): Promise<OrderFill[]> {
    return await this.#getOrderFillsForQuery(params);
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
      return response.positionFundings.map((entry) => ({
        symbol:
          this.#marketsById.get(entry.marketId)?.symbol ??
          String(entry.marketId),
        // `change` is the signed USDC funding flow for the account's side.
        amountUsd: entry.change,
        rate: entry.rate,
        timestamp: entry.timestamp * 1000,
      }));
    } catch (error) {
      if (this.#mustSurfaceReadError(error)) {
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
          delta: adaptLighterTransferDelta(entry),
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
      if (this.#mustSurfaceReadError(error)) {
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
      if (this.#mustSurfaceReadError(error)) {
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
    if (params.marginMode !== undefined) {
      return {
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_UNSUPPORTED,
      };
    }
    // Mirrors placeOrder's own rejections so validation never approves an
    // order shape the placement path would refuse.
    if (
      params.orderType !== 'limit' &&
      params.orderType !== 'market' &&
      !isTriggerOrderType(params.orderType)
    ) {
      return { isValid: false, error: LIGHTER_NOT_SUPPORTED_ERROR };
    }
    const triggerIntentError = getLighterTriggerIntentError(params);
    if (triggerIntentError) {
      return { isValid: false, error: triggerIntentError };
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
    if (isLimitExecutionOrderType(params.orderType) && !params.price) {
      return { isValid: false, error: 'Limit order requires a price' };
    }
    if (
      isLimitExecutionOrderType(params.orderType) &&
      params.price !== undefined
    ) {
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
    const markets = await this.#ensureMarkets(
      isTriggerOrderType(params.orderType),
    );
    const market = markets.get(params.symbol);
    if (!market) {
      return {
        isValid: false,
        error: `Unknown Lighter market: ${params.symbol}`,
      };
    }
    if (isTriggerOrderType(params.orderType) && market.status !== 'active') {
      return {
        isValid: false,
        error: 'Lighter standalone triggers require an active market',
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
    if (isTriggerOrderType(params.orderType)) {
      const resolved = resolveLighterTriggerPrices(params, market);
      referencePrice = resolved.referencePrice;
      executionPrice = resolved.executionPrice;
    } else if (params.orderType === 'market') {
      const slippageFraction =
        params.maxSlippageBps === undefined
          ? (params.slippage ?? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000)
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
      // USD-derived sizes snap onto the venue grid (placement parity);
      // explicit size strings stay verbatim.
      const requestedSize =
        usdAmount === undefined
          ? parseFloat(params.size)
          : snapToLighterSizeGrid(
              usdAmount / referencePrice,
              market.supportedSizeDecimals,
            );
      if (usdAmount === undefined) {
        try {
          const requestedSizeInt = toSignerWireInteger(
            requestedSize,
            market.supportedSizeDecimals,
          );
          if (
            fromLighterInteger(
              requestedSizeInt,
              market.supportedSizeDecimals,
            ) !== requestedSize
          ) {
            return {
              isValid: false,
              error: `Order size ${params.size} does not align with the Lighter size grid`,
            };
          }
        } catch (error) {
          return {
            isValid: false,
            error: ensureError(error, 'LighterProvider.validateOrder').message,
          };
        }
      }
      const minSize = isLighterMakerOrder(params)
        ? computeLighterMinOrderSize(market, referencePrice)
        : 0;
      if (minSize > 0 && requestedSize < minSize) {
        // EXACTLY the placement rule: only reduce-only orders may bump to
        // the venue minimum, and only when the live position verifies a
        // full close; isFullClose remains an untrusted hint. The live read
        // can THROW (capability gates, venue-data integrity): a validator
        // must resolve to an explicit invalid result, never reject.
        let verifiedFullClose = false;
        if (params.reduceOnly && !isTriggerOrderType(params.orderType)) {
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
    rawParams: ClosePositionParams,
  ): Promise<{ isValid: boolean; error?: string }> => {
    const params = this.#normalizeCloseParams(rawParams);
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
          ? LIGHTER_DEFAULT_SLIPPAGE_BPS / 10_000
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
      // USD-derived sizes snap onto the venue grid (placement parity);
      // explicit size strings stay verbatim.
      const requestedSize =
        Number.isFinite(usdAmount) && usdAmount > 0
          ? snapToLighterSizeGrid(
              usdAmount / referencePrice,
              market.supportedSizeDecimals,
            )
          : parseFloat(params.size ?? String(held));
      const hasExplicitSize =
        params.usdAmount === undefined && params.size !== undefined;
      // Wire-format parity with the placement path closePosition uses:
      // the EXECUTION price is what gets integerized and signed.
      try {
        const requestedSizeInt = toSignerWireInteger(
          requestedSize,
          market.supportedSizeDecimals,
        );
        if (
          hasExplicitSize &&
          fromLighterInteger(requestedSizeInt, market.supportedSizeDecimals) !==
            requestedSize
        ) {
          return {
            isValid: false,
            error: `Order size ${params.size} does not align with the Lighter size grid`,
          };
        }
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
    params: LiquidationPriceParams,
  ): Promise<string> {
    // Cross liquidation is account-wide and cannot be derived truthfully
    // from this per-position input. Live positions carry the venue's
    // authoritative liquidationPrice; previews support isolated only.
    if (params.marginType === 'cross') {
      throw new Error(
        'Lighter cross-margin liquidation previews require account-wide collateral and position inputs that are unavailable',
      );
    }
    const { entryPrice, leverage, direction } = params;
    if (
      !isFinite(entryPrice) ||
      !isFinite(leverage) ||
      entryPrice <= 0 ||
      leverage <= 0
    ) {
      return '0.00';
    }
    const maintenanceFraction = await this.calculateMaintenanceMargin({
      asset: params.asset ?? '',
    });
    const initialMargin = 1 / leverage;
    if (initialMargin <= maintenanceFraction) {
      throw new Error(
        `Invalid leverage: ${leverage}x cannot cover the ${maintenanceFraction * 100}% maintenance requirement`,
      );
    }
    const side = direction === 'long' ? 1 : -1;
    const marginAvailable = initialMargin - maintenanceFraction;
    const denominator = 1 - maintenanceFraction * side;
    if (Math.abs(denominator) < 0.0001) {
      return String(entryPrice);
    }
    const liquidationPrice =
      entryPrice - (side * marginAvailable * entryPrice) / denominator;
    return String(Math.max(0, liquidationPrice));
  }

  async calculateMaintenanceMargin(
    params: MaintenanceMarginParams,
  ): Promise<number> {
    // The venue publishes per-market maintenance margin fractions
    // (hundredths of a percent, e.g. 240 = 2.4%) in orderBookDetails.
    await this.#ensureMarketMargins();
    const maintenance = this.#marginBySymbol.get(params.asset)?.maintenance;
    if (maintenance && maintenance > 0) {
      return maintenance / 10_000;
    }
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} maintenance margin metadata unavailable for ${params.asset || 'unknown market'}`,
    );
  }

  /**
   * Margin mode the venue will accept for a leverage update on this
   * market: an existing position's current mode (the venue refuses mode
   * changes while a position is open; a missing field means the venue
   * default, cross), otherwise ISOLATED — the only mode the app manages.
   *
   * @param symbol - Market symbol.
   * @returns The wire margin mode for UpdateLeverage.
   */
  readonly #resolveMarginModeForSymbol = async (
    symbol: string,
  ): Promise<number> => {
    try {
      const positionMarginMode = await this.#readPositionMarginMode(symbol);
      if (positionMarginMode !== null) {
        return positionMarginMode;
      }
    } catch {
      // Fall through: prefer isolated; a wrong guess surfaces as an
      // explicit venue rejection of the leverage update, never as state.
    }
    return LIGHTER_MARGIN_MODE_ISOLATED;
  };

  /**
   * Wire margin mode of the open position on this market, if any. A missing
   * `marginMode` field means the venue default, cross.
   *
   * @param symbol - Market symbol.
   * @returns The position's wire margin mode, or null when flat.
   * @throws When the account or its positions cannot be read, including an
   * account response without the account or its positions array.
   */
  readonly #readPositionMarginMode = async (
    symbol: string,
  ): Promise<number | null> => {
    const accountIndex = await this.#ensureAccountIndex();
    const response = await this.#clientService.getAccountByIndex(accountIndex);
    const positions = response.accounts?.[0]?.positions;
    // A missing account or positions array is not proof of a flat account.
    if (!Array.isArray(positions)) {
      throw new Error(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
    }
    const row = positions.find(
      (position) =>
        position.symbol === symbol && parseFloat(position.position) !== 0,
    );
    return row ? (row.marginMode ?? LIGHTER_MARGIN_MODE_CROSS) : null;
  };

  /** Per-market margin fractions + last price from orderBookDetails. */
  readonly #marginBySymbol = new Map<string, LighterMarginMetadata>();

  /**
   * Synchronous per-market max leverage from the authoritative margin cache.
   *
   * Inactive markets cannot increase exposure. When Lighter has retired their
   * risk metadata, the position's current leverage is therefore the highest
   * leverage that can be reported without inventing a tradable venue limit.
   *
   * @param position - Position carrying the market id and current margin.
   * @returns Max leverage for the market.
   * @throws If the market identity or margin metadata is unavailable.
   */
  readonly #maxLeverageForPosition = (
    position: Pick<LighterApiPosition, 'marketId' | 'initialMarginFraction'>,
  ): number => {
    const { marketId } = position;
    const symbol = this.#marketsById.get(marketId)?.symbol;
    const metadata =
      (symbol ? this.#marginBySymbol.get(symbol) : undefined) ??
      [...this.#marginBySymbol.values()].find(
        (entry) => entry.marketId === marketId,
      );
    if (metadata) {
      return deriveLighterMaxLeverage(metadata.minInitial, marketId);
    }
    if (this.#marketsById.get(marketId)?.status === 'inactive') {
      const marginFraction = parseStrictDecimal(position.initialMarginFraction);
      const currentLeverage =
        marginFraction !== null && marginFraction > 0
          ? Math.round(100 / marginFraction)
          : 0;
      if (Number.isSafeInteger(currentLeverage) && currentLeverage > 0) {
        return currentLeverage;
      }
    }
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} margin metadata unavailable for market ${marketId}`,
    );
  };

  /**
   * Authoritative per-market max leverage for trading validation. This returns
   * null when venue metadata is missing or unreadable so placement can return
   * its validation result instead of throwing.
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
    const metadata = this.#marginBySymbol.get(symbol);
    if (!metadata) {
      return null;
    }
    try {
      return deriveLighterMaxLeverage(metadata.minInitial, symbol);
    } catch {
      return null;
    }
  };

  /** When the margin-metadata cache was last refreshed (0 = never). */
  #marginFetchedAt = 0;

  /** In-flight authoritative margin refresh, shared by the stale epoch. */
  #marginRefreshInFlight: Promise<void> | null = null;

  readonly #ensureMarketMargins = async (): Promise<void> => {
    // TTL refresh: metadata cached once for the whole session would keep
    // validating leverage against a stale (possibly higher) max. On
    // expiry the fetch re-runs; if it fails, the throw propagates and
    // every authoritative risk caller fails closed until a later retry.
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
          if (this.#isDisconnected) {
            return;
          }
          // Atomic replacement: set()-ing into the old map would let a
          // symbol REMOVED from fresh metadata keep its stale cap forever.
          // The timestamp only advances on success.
          const fresh = new Map<string, LighterMarginMetadata>();
          for (const detail of details.orderBookDetails) {
            if (isInactiveMarketWithoutUsableRiskMetadata(detail)) {
              continue;
            }
            if (detail.minInitialMarginFraction !== undefined) {
              deriveLighterMaxLeverage(
                detail.minInitialMarginFraction,
                detail.symbol,
              );
            }
            if (
              detail.maintenanceMarginFraction !== undefined &&
              (!Number.isSafeInteger(detail.maintenanceMarginFraction) ||
                detail.maintenanceMarginFraction < 1 ||
                detail.maintenanceMarginFraction > 10_000)
            ) {
              throw new Error(
                `${LIGHTER_DATA_INTEGRITY_PREFIX} invalid maintenance margin fraction for market ${detail.symbol}`,
              );
            }
            fresh.set(detail.symbol, {
              marketId: detail.marketId,
              minInitial: detail.minInitialMarginFraction,
              maintenance: detail.maintenanceMarginFraction,
              lastTradePrice: detail.lastTradePrice,
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
    // (hundredths of a percent): 400 → 25x. Missing metadata is unavailable,
    // never evidence that the global maximum applies to this market.
    await this.#ensureMarketMargins();
    const metadata = this.#marginBySymbol.get(asset);
    if (metadata) {
      return deriveLighterMaxLeverage(metadata.minInitial, asset);
    }
    throw new Error(
      `${LIGHTER_DATA_INTEGRITY_PREFIX} margin metadata unavailable for ${asset}`,
    );
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
      // Structurally zero on this venue, not a waiver applied to a real fee.
      chargesMetamaskBuilderFee: false,
    };
  }

  async previewPositionModify(
    _params: PositionModifyPreviewParams,
  ): Promise<PositionModifyPreviewResult> {
    return { status: 'unsupported', reason: 'provider' };
  }

  // ============================================================================
  // Live subscriptions over Lighter WebSocket channels, with REST polling
  // only as the price-stream fallback when no WebSocket transport exists.
  // ============================================================================

  subscribeToPrices(params: SubscribePricesParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
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
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#oiCapSubscribers.add(params);
    this.#requestChannel('market_stats/all');
    this.#ensureStream();
    return () => {
      this.#oiCapSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToAccount(params: SubscribeAccountParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#accountSubscribers.add(params);
    this.#ensureAccountChannels();
    return () => {
      this.#accountSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToPositions(params: SubscribePositionsParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
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
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#orderSubscribers.add(params);
    if (this.#hasOrdersSnapshot || this.#wsOrders.size > 0) {
      params.callback([...this.#wsOrders.values()]);
    }
    this.#ensureAccountChannels();
    return () => {
      this.#orderSubscribers.delete(params);
      this.#releaseChannelIfUnused();
    };
  }

  subscribeToOrderFills(params: SubscribeOrderFillsParams): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#fillSubscribers.add(params);
    this.#ensureAccountChannels();
    const generation = this.#sessionGeneration;
    const channelsPromise = this.#accountChannelsPromise;
    // A late subscriber may join after the venue's one initial trade snapshot.
    // Replay only after authentication succeeds for the same channel session.
    channelsPromise
      ?.then(() => {
        this.#assertSession(generation);
        if (
          this.#accountChannelsPromise === channelsPromise &&
          this.#fillSubscribers.has(params) &&
          this.#wsFills !== null
        ) {
          params.callback([...this.#wsFills], true);
        }
      })
      .catch(() => undefined);
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
   * Notify each order/fill subscriber without allowing one listener to stop others.
   *
   * @param error - Account channel setup failure.
   */
  readonly #notifySubscriptionError = (error: Error): void => {
    for (const [label, subscribers] of [
      ['orders', this.#orderSubscribers],
      ['fills', this.#fillSubscribers],
    ] as const) {
      for (const subscriber of subscribers) {
        try {
          subscriber.onError?.(error);
        } catch (subscriberError) {
          this.#logSubscriberError(label, subscriberError);
        }
      }
    }
  };

  /**
   * Resolve the Lighter account index and request the account-scoped
   * channels. When the venue definitively reports no Lighter account,
   * account-scoped subscribers receive an empty emission.
   */
  readonly #ensureAccountChannels = (): void => {
    if (this.#isDisconnected) {
      return;
    }
    if (this.#accountChannelsPromise) {
      this.#ensureStream();
      return;
    }
    const generation = this.#sessionGeneration;
    let channelsRequested = false;
    // Auth setup crosses awaits before consulting this promise identity.
    let setupPromise: Promise<void> | undefined = undefined;
    setupPromise = (async (): Promise<void> => {
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
        const channelAddress = this.#boundAddress;
        try {
          const auth = await this.#getAuthToken();
          this.#assertSession(generation);
          this.#requestChannel(`account_all_orders/${accountIndex}`, auth);
        } catch (error) {
          this.#deps.debugLogger.log(
            '[LighterProvider] orders channel skipped (no auth token)',
            { error: String(error) },
          );
          this.#ensureSessionBinding();
          // Signer failure retires the write generation, but this channel
          // still owns its wallet's error. A replaced channel or wallet does not.
          if (
            !this.#isDisconnected &&
            channelAddress !== null &&
            channelAddress === this.#boundAddress &&
            this.#accountChannelsPromise === setupPromise
          ) {
            this.#notifySubscriptionError(ensureError(error));
          }
          // Setup failures are not authoritative empty order state. Account
          // switches and deselection already emit their synchronous reset.
          channelsRequested = false;
        }
      } catch (error) {
        this.#deps.debugLogger.log(
          '[LighterProvider] account channels unavailable',
          { error: String(error) },
        );
        // A venue-confirmed absent account is authoritative empty state for
        // this exact wallet binding. It must settle initial subscribers so
        // clients do not render loading skeletons forever. All other failures
        // preserve the last snapshot: transport, malformed data, auth and
        // capability errors cannot prove that the account is empty.
        this.#ensureSessionBinding();
        if (
          error instanceof LighterAccountNotFoundError &&
          generation === this.#sessionGeneration
        ) {
          this.#emitAccountBindingReset();
        } else if (
          !this.#isDisconnected &&
          this.#boundAddress !== null &&
          generation === this.#sessionGeneration &&
          this.#accountChannelsPromise === setupPromise
        ) {
          this.#notifySubscriptionError(ensureError(error));
        }
        // An aborted previous-account setup has no authority over the new
        // session. Current-session failures also preserve the last known data.
        // Transport, auth, capability, and integrity failures are not
        // authoritative empty account state. Explicit account switches and
        // deselection already emit their synchronous reset.
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
    if (this.#isDisconnected) {
      return;
    }
    if (this.#wsWantedChannels.has(channel)) {
      return;
    }
    this.#wsWantedChannels.set(channel, { auth });
    if (this.#priceWs?.readyState === 1) {
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
    if (this.#isDisconnected || this.#priceWs || this.#pricePollTimer) {
      return;
    }
    if (this.#webSocketCtor) {
      this.#connectWs();
    } else {
      this.#startPricePolling();
    }
  };

  readonly #connectWs = (): void => {
    if (this.#isDisconnected || !this.#webSocketCtor) {
      return;
    }
    const url = getLighterWsEndpoint(this.#isTestnet ? 'testnet' : 'mainnet');
    const WebSocketCtor = this.#webSocketCtor;
    const ws = new WebSocketCtor(url);
    this.#priceWs = ws;
    this.#setConnectionState(WebSocketConnectionState.Connecting);

    ws.onopen = (): void => {
      if (this.#isDisconnected) {
        try {
          ws.close();
        } catch {
          // The transport may already have closed during disconnect.
        }
        return;
      }
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
                return;
              }
              this.#wsWantedChannels.set(channel, { auth: freshToken });
              this.#sendSubscribe(channel, freshToken);
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
      try {
        if (this.#isDisconnected) {
          return;
        }
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
      } catch (error) {
        // WebSocket callbacks run on the host event loop. Venue-data
        // integrity failures (and any other malformed frame failure) must
        // drop the whole frame rather than throw globally or emit partial
        // account/position state.
        this.#deps.debugLogger.log(
          '[LighterProvider] dropped malformed WebSocket frame',
          { error: String(error) },
        );
      }
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
      this.#dispatchPriceUpdates(updates);
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
      const nextPositions = isSnapshot
        ? new Map<number, Position>()
        : new Map(this.#wsPositions);
      for (const [marketId, position] of Object.entries(message.positions)) {
        const adapted = adaptPositionFromLighter(
          position,
          this.#maxLeverageForPosition(position),
        );
        if (parseFloat(adapted.size) === 0) {
          nextPositions.delete(Number(marketId));
        } else {
          nextPositions.set(Number(marketId), adapted);
        }
      }
      this.#wsPositions.clear();
      for (const [marketId, position] of nextPositions) {
        this.#wsPositions.set(marketId, position);
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
      this.#handleOrderBookMessage(type, message);
      return;
    }
    if (type.includes('candle')) {
      this.#handleCandleMessage(message);
      return;
    }
    if (type.includes('account_all_trades')) {
      this.#handleTradesMessage(message);
      return;
    }
    if (type.includes('account_all_orders')) {
      if (message.orders === undefined) {
        return;
      }
      try {
        if (
          message.orders === null ||
          typeof message.orders !== 'object' ||
          Array.isArray(message.orders) ||
          !Object.values(message.orders).every(
            (rows) =>
              Array.isArray(rows) &&
              rows.every(
                (row) =>
                  row !== null &&
                  typeof row === 'object' &&
                  !Array.isArray(row),
              ),
          )
        ) {
          throw new Error(
            'Invalid Lighter venue data: malformed orders container',
          );
        }
        const isSnapshot = type.startsWith('subscribed');
        const nextOrders = isSnapshot
          ? new Map<string, Order>()
          : new Map(this.#wsOrders);
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
              nextOrders.set(adapted.orderId, adapted);
            } else {
              nextOrders.delete(adapted.orderId);
            }
          }
        }
        if (isSnapshot) {
          this.#hasOrdersSnapshot = true;
        }
        this.#wsOrders.clear();
        for (const [orderId, order] of nextOrders) {
          this.#wsOrders.set(orderId, order);
        }
        this.#emitToOrderSubscribers([...this.#wsOrders.values()]);
      } catch (error) {
        this.#hasOrdersSnapshot = false;
        throw error;
      }
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
    const { nonce, beginNonce } = message.orderBook;
    if (typeof nonce !== 'number' || !Number.isSafeInteger(nonce)) {
      return;
    }
    const currentState = this.#orderBookState.get(marketId);
    let nextState: LighterOrderBookState;
    if (type.startsWith('subscribed')) {
      nextState = { bids: new Map(), asks: new Map(), nonce };
    } else if (
      !currentState ||
      typeof beginNonce !== 'number' ||
      !Number.isSafeInteger(beginNonce) ||
      beginNonce !== currentState.nonce
    ) {
      // A delta cannot be applied to an unknown or discontinuous base.
      // Drop the local book and request a new subscribed snapshot.
      this.#orderBookState.delete(marketId);
      const channelName = `order_book/${marketId}`;
      if (this.#priceWs?.readyState === 1) {
        this.#priceWs.send(
          JSON.stringify({ type: 'unsubscribe', channel: channelName }),
        );
        this.#sendSubscribe(channelName);
      }
      return;
    } else {
      nextState = {
        bids: new Map(currentState.bids),
        asks: new Map(currentState.asks),
        nonce: currentState.nonce,
      };
    }
    for (const side of ['bids', 'asks'] as const) {
      for (const level of message.orderBook[side] ?? []) {
        const price = parseStrictDecimal(level?.price);
        const size = parseStrictDecimal(level?.size);
        if (
          price === null ||
          !Number.isFinite(price) ||
          price <= 0 ||
          size === null ||
          !Number.isFinite(size) ||
          size < 0
        ) {
          throw new Error(
            `${LIGHTER_DATA_INTEGRITY_PREFIX} malformed order-book level`,
          );
        }
        if (size === 0) {
          nextState[side].delete(level.price);
        } else {
          nextState[side].set(level.price, level.size);
        }
      }
    }
    nextState.nonce = nonce;
    this.#orderBookState.set(marketId, nextState);
    const subscribers = this.#orderBookSubscribers.get(marketId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    // Levels must carry the FULL OrderBookLevel contract. The depth chart
    // draws Y-coordinates from parseFloat(level.total): a bare {price, size}
    // level renders as an SVG path full of NaN and crashes the native path
    // parser (found live on device, RNSVGPathParser InvalidNumber).
    const toContractLevels = (
      entries: [string, string][],
    ): OrderBookLevel[] => {
      let cumulativeSize = 0;
      let cumulativeNotional = 0;
      return entries.map(([price, size]) => {
        const sizeNum = Number(size);
        const notional = Number(price) * sizeNum;
        cumulativeSize += sizeNum;
        cumulativeNotional += notional;
        return {
          price,
          size,
          total: String(cumulativeSize),
          notional: String(notional),
          totalNotional: String(cumulativeNotional),
        };
      });
    };
    for (const subscriber of subscribers) {
      const levels = subscriber.levels ?? 10;
      const bids = toContractLevels(
        [...nextState.bids.entries()]
          .sort((a, b) => Number(b[0]) - Number(a[0]))
          .slice(0, levels),
      );
      const asks = toContractLevels(
        [...nextState.asks.entries()]
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .slice(0, levels),
      );
      const bestBid = Number(bids[0]?.price ?? '0');
      const bestAsk = Number(asks[0]?.price ?? '0');
      const mid = bestBid > 0 && bestAsk > 0 ? (bestBid + bestAsk) / 2 : 0;
      const maxTotal = Math.max(
        Number(bids[bids.length - 1]?.total ?? '0'),
        Number(asks[asks.length - 1]?.total ?? '0'),
      );
      const book: OrderBookData = {
        bids,
        asks,
        spread: String(bestAsk - bestBid),
        spreadPercentage:
          mid > 0 ? String(((bestAsk - bestBid) / mid) * 100) : '0',
        midPrice: String(mid),
        lastUpdated: Date.now(),
        maxTotal: String(maxTotal),
      };
      try {
        subscriber.callback(book);
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
      const mapped = toFiniteCandle(candle);
      if (mapped) {
        series.set(mapped.time, mapped);
      }
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
    if (message.trades === undefined) {
      return;
    }
    const isSnapshot = (message.type ?? '').startsWith('subscribed');
    if (
      message.trades === null ||
      typeof message.trades !== 'object' ||
      Array.isArray(message.trades) ||
      !Object.values(message.trades).every(
        (rows) =>
          Array.isArray(rows) &&
          rows.every(
            (row) =>
              row !== null && typeof row === 'object' && !Array.isArray(row),
          ),
      )
    ) {
      this.#wsFills = null;
      throw new Error('Invalid Lighter venue data: malformed trades container');
    }
    const fills: OrderFill[] = [];
    let droppedUnsupportedFill = false;
    for (const marketTrades of Object.values(message.trades)) {
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
    // A cache is replayable only after a complete validated snapshot.
    // Missing even one fill invalidates that authority until a new snapshot.
    if (droppedUnsupportedFill) {
      this.#wsFills = null;
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
    if (isSnapshot || this.#wsFills !== null) {
      const history = isSnapshot ? fills : [...fills, ...(this.#wsFills ?? [])];
      const seen = new Set<string>();
      this.#wsFills = history
        .filter((fill) => {
          const id = fill.fillId;
          if (id === undefined) {
            throw new Error('Lighter fill is missing its venue trade identity');
          }
          if (seen.has(id)) {
            return false;
          }
          seen.add(id);
          return true;
        })
        .sort((first, second) => second.timestamp - first.timestamp)
        .slice(0, LIGHTER_FILL_REPLAY_LIMIT);
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
    if (this.#isDisconnected) {
      return;
    }
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
    if (this.#isDisconnected || this.#pricePollTimer) {
      return;
    }
    const poll = (): void => {
      this.#emitPolledPrices().catch((error: unknown) => {
        this.#deps.debugLogger.log('[LighterProvider] price poll failed', {
          error: String(error),
        });
      });
    };
    this.#pricePollTimer = setInterval(poll, LIGHTER_PRICE_POLLING_INTERVAL_MS);
    this.#setConnectionState(WebSocketConnectionState.Connected);
    poll();
  };

  /**
   * REST fallback: fetch market stats once and fan them out.
   */
  readonly #emitPolledPrices = async (): Promise<void> => {
    if (this.#priceSubscribers.size === 0) {
      return;
    }
    const response = await this.#clientService.getOrderBookDetails();
    if (this.#isDisconnected) {
      return;
    }
    const timestamp = Date.now();
    const updates = (response.orderBookDetails ?? []).map((detail) =>
      adaptPriceUpdateFromLighter(detail, timestamp),
    );
    this.#dispatchPriceUpdates(updates);
  };

  /**
   * Fan price updates out to every subscriber, honoring symbol filters.
   *
   * @param updates - Adapted price updates for this cycle.
   */
  readonly #dispatchPriceUpdates = (updates: PriceUpdate[]): void => {
    if (this.#isDisconnected || updates.length === 0) {
      return;
    }
    for (const update of updates) {
      this.#lastPriceBySymbol.set(update.symbol, update);
    }
    for (const subscriber of this.#priceSubscribers) {
      this.#deliverPrices(subscriber, updates);
    }
  };

  readonly #deliverPrices = (
    subscriber: SubscribePricesParams,
    updates: PriceUpdate[],
  ): void => {
    if (this.#isDisconnected) {
      return;
    }
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
    this.#hasOrdersSnapshot = false;
    this.#wsFills = null;
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
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    let released = false;
    let seriesKey: string | null = null;
    const resolution = LIGHTER_SUPPORTED_RESOLUTIONS.has(params.interval)
      ? params.interval
      : '15m';
    this.#ensureMarkets()
      .then(async (markets) => {
        const market = markets.get(params.symbol);
        if (this.#isDisconnected || !market || released) {
          return;
        }
        seriesKey = `${market.marketId}:${resolution}`;
        // Seed with history so charts render immediately, then let the WS
        // candle channel keep the series live.
        const seeded = await this.fetchHistoricalCandles({
          symbol: params.symbol,
          interval: params.interval,
          limit: 120,
        });
        if (this.#isDisconnected || released) {
          return;
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
        candles: (response.c ?? []).flatMap((candle) => {
          const mapped = toFiniteCandle(candle);
          return mapped ? [mapped] : [];
        }),
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
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    let released = false;
    let marketId: number | null = null;
    this.#ensureMarkets()
      .then((markets) => {
        const market = markets.get(params.symbol);
        if (this.#isDisconnected || !market || released) {
          return;
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
      })
      .catch((error: unknown) => {
        if (!this.#isDisconnected && !released) {
          params.onError?.(ensureError(error));
        }
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
      return this.#pricePollTimer
        ? WebSocketConnectionState.Connected
        : WebSocketConnectionState.Disconnected;
    }
    return this.#connectionState;
  }

  subscribeToConnectionState(
    listener: (
      state: WebSocketConnectionState,
      reconnectionAttempt: number,
    ) => void,
  ): () => void {
    if (this.#isDisconnected) {
      return NOOP_UNSUBSCRIBE;
    }
    this.#connectionListeners.add(listener);
    listener(this.getWebSocketConnectionState(), this.#wsReconnectAttempts);
    return (): void => {
      this.#connectionListeners.delete(listener);
    };
  }

  async reconnect(): Promise<void> {
    if (this.#isDisconnected) {
      return;
    }
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
    // Only the MAINNET bridge is ever advertised: the effective-testnet
    // branches return [] before reaching here (devnet L1 unreachable).
    const bridge = LIGHTER_BRIDGE_CONFIG.mainnet;
    return [
      {
        assetId: `${bridge.chainId}/erc20:${bridge.usdcContract}/default`,
        chainId: bridge.chainId,
        contractAddress: bridge.bridgeContract,
        constraints: { minAmount },
      },
    ];
  };

  getDepositRoutes(_params?: GetSupportedPathsParams): AssetRoute[] {
    // DepositService currently builds an ERC-20 transfer, while Lighter
    // requires approval plus a call to the bridge proxy's deposit method.
    // Do not advertise a route until that provider-owned transaction builder
    // exists and has integration coverage.
    return [];
  }

  getWithdrawalRoutes(params?: GetSupportedPathsParams): AssetRoute[] {
    // Same devnet-L1 reality and fail-closed network binding as deposits.
    const isTestnet = this.#isTestnet || params?.isTestnet === true;
    if (isTestnet) {
      return [];
    }
    return this.#bridgeRoute(LIGHTER_BRIDGE_CONFIG.mainnet.minWithdrawUsdc);
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
